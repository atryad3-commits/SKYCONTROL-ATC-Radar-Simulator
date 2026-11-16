/**
 * SKYCONTROL - Frontend Client for Offline Kokoro-82M Local Speech Engine
 * Manages non-blocking WAV synthesis calls, local voice profile syncing,
 * model lifecycle actions, IndexedDB WAV caching, and lookahead pre-synthesis.
 */

import {
  DEFAULT_VOICE_PROFILES,
  GenerationPriority,
  TtsEngineStatus,
  VoiceProfile,
  VoiceProfileUpdatePatch,
  VoiceType,
} from '../../shared/ttsTypes';
import {
  AudioDiagnosticsReport,
  DEFAULT_GLOBAL_AUDIO_SETTINGS,
  GlobalAudioSettings,
  LocalDatabaseState,
} from '../../shared/audioStudioTypes';
import { formatPhraseForSpeech } from '../audio/phraseNormalizer';
import { audioCacheDb } from './audioCacheDb';

export interface SynthesizedWavResult {
  wavBytes: ArrayBuffer;
  voiceId: string;
  kokoroSpeaker: string;
  durationSec: number;
  generationMs: number;
  cacheHit: boolean;
}

function buildClientCacheKey(voiceId: string, normalizedText: string, speed: number): string {
  return `${voiceId}::${speed.toFixed(2)}::${normalizedText.trim().toLowerCase()}`;
}

export class LocalTtsClient {
  private profiles: VoiceProfile[] = DEFAULT_VOICE_PROFILES.map(p => ({
    ...p,
    voiceConfig: { ...p.voiceConfig },
  }));
  private availableSpeakers: string[] = [];
  private profileListeners: Array<(profiles: VoiceProfile[]) => void> = [];
  private inFlightSynths = new Map<string, Promise<SynthesizedWavResult | null>>();
  private engineReachable: boolean | null = null;
  private prewarmEnabled = true;
  private ttsEnabled = true;
  private clientCacheHits = 0;
  private clientCacheMisses = 0;
  private clientPlaybackErrors: Array<{ timestamp: string; source: string; message: string }> = [];

  public getProfilesSync(): VoiceProfile[] {
    return this.profiles;
  }

  public getAvailableSpeakersSync(): string[] {
    return this.availableSpeakers;
  }

  public setPrewarmEnabled(enabled: boolean): void {
    this.prewarmEnabled = enabled;
  }

  public setTtsEnabled(enabled: boolean): void {
    this.ttsEnabled = enabled;
  }

  public isTtsEnabled(): boolean {
    return this.ttsEnabled;
  }

  public recordPlaybackError(source: string, message: string): void {
    this.clientPlaybackErrors.unshift({
      timestamp: new Date().toISOString(),
      source,
      message,
    });
    if (this.clientPlaybackErrors.length > 30) {
      this.clientPlaybackErrors = this.clientPlaybackErrors.slice(0, 30);
    }
  }

  public clearClientDiagnostics(): void {
    this.clientCacheHits = 0;
    this.clientCacheMisses = 0;
    this.clientPlaybackErrors = [];
  }

  public getClientDiagnostics() {
    return {
      clientCacheHits: this.clientCacheHits,
      clientCacheMisses: this.clientCacheMisses,
      playbackErrorCount: this.clientPlaybackErrors.length,
      playbackErrors: [...this.clientPlaybackErrors],
    };
  }

  public onProfilesChange(cb: (profiles: VoiceProfile[]) => void): () => void {
    this.profileListeners.push(cb);
    cb(this.profiles);
    return () => {
      this.profileListeners = this.profileListeners.filter(l => l !== cb);
    };
  }

  private notifyProfiles() {
    for (const cb of this.profileListeners) {
      try {
        cb(this.profiles);
      } catch (e) {
        console.error(e);
      }
    }
  }

  public async fetchProfiles(): Promise<VoiceProfile[]> {
    if (typeof fetch !== 'function') return this.profiles;
    try {
      const res = await fetch('/api/tts/voices');
      if (!res.ok) return this.profiles;
      const data = await res.json();
      if (Array.isArray(data?.availableSpeakers)) {
        this.availableSpeakers = data.availableSpeakers;
      }
      if (Array.isArray(data?.profiles) && data.profiles.length > 0) {
        this.profiles = data.profiles;
        this.engineReachable = true;
        this.notifyProfiles();
      }
    } catch {
      this.engineReachable = false;
    }
    return this.profiles;
  }

  public async fetchStatus(): Promise<TtsEngineStatus | null> {
    if (typeof fetch !== 'function') return null;
    try {
      const res = await fetch('/api/tts/status');
      if (!res.ok) return null;
      this.engineReachable = true;
      return (await res.json()) as TtsEngineStatus;
    } catch {
      this.engineReachable = false;
      return null;
    }
  }

  public async updateProfile(
    id: string,
    patch: VoiceProfileUpdatePatch
  ): Promise<VoiceProfile | null> {
    const previous = this.profiles.find(p => p.id === id);
    if (previous) {
      const optimistic: VoiceProfile = {
        ...previous,
        ...patch,
        voiceConfig: patch.voiceConfig
          ? { ...previous.voiceConfig, ...patch.voiceConfig }
          : previous.voiceConfig,
      };
      this.profiles = this.profiles.map(p => (p.id === id ? optimistic : p));
      this.notifyProfiles();
    }

    if (typeof fetch !== 'function') return previous || null;
    const res = await fetch(`/api/tts/voices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      if (previous) {
        this.profiles = this.profiles.map(p => (p.id === id ? previous : p));
        this.notifyProfiles();
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Failed updating profile (${res.status})`);
    }
    const data = await res.json();
    if (data?.profile) {
      this.profiles = this.profiles.map(p => (p.id === id ? data.profile : p));
      this.notifyProfiles();
      return data.profile as VoiceProfile;
    }
    return null;
  }

  public async createProfile(payload: {
    id?: string;
    displayName: string;
    shortLabel?: string;
    voiceType: VoiceType;
    language?: string;
    accent?: string;
    gender: 'M' | 'F';
    kokoroVoiceId: string;
    speed?: number;
    pitch?: number;
    stability?: number;
    sampleText?: string;
  }): Promise<VoiceProfile> {
    if (typeof fetch !== 'function') {
      throw new Error('Fetch unavailable in non-browser environment');
    }
    const res = await fetch('/api/tts/voices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: payload.id,
        displayName: payload.displayName,
        shortLabel: payload.shortLabel || payload.displayName,
        voiceType: payload.voiceType,
        language: payload.language || 'en',
        accent: payload.accent || 'en-US',
        gender: payload.gender,
        modelRef: 'Kokoro-82M-v1.0-ONNX',
        voiceConfig: {
          kokoroVoiceId: payload.kokoroVoiceId,
          timbreDescription: 'Custom configured local speaker profile',
          qualityGrade: 'Custom',
          legacyPackId: payload.voiceType === 'PILOT' ? 'pilot_thomas' : 'tower_charon',
          bandpassHz: payload.voiceType === 'PILOT' ? 1500 : 1380,
          carrierCenterHz: payload.voiceType === 'PILOT' ? 1360 : 1270,
          pttClickHz: payload.voiceType === 'PILOT' ? 790 : 920,
          avionicsHumHz: payload.voiceType === 'PILOT' ? 410 : 112,
        },
        speed: payload.speed ?? 1.14,
        pitch: payload.pitch ?? 1.0,
        stability: payload.stability ?? 0.85,
        sampleAudioUrl: '',
        sampleText:
          payload.sampleText ||
          'Speedbird four five two, cleared I L S approach runway two seven right.',
        enabled: true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `Failed creating profile (${res.status})`);
    }
    const created = data.profile as VoiceProfile;
    this.profiles = [...this.profiles, created];
    this.notifyProfiles();
    return created;
  }

  public async deleteProfile(id: string): Promise<void> {
    if (typeof fetch !== 'function') return;
    const res = await fetch(`/api/tts/voices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `Failed deleting profile (${res.status})`);
    }
    this.profiles = this.profiles.filter(p => p.id !== id);
    this.notifyProfiles();
  }

  public async resetProfiles(): Promise<VoiceProfile[]> {
    if (typeof fetch !== 'function') return this.profiles;
    const res = await fetch('/api/tts/voices/reset', { method: 'POST' });
    if (!res.ok) throw new Error('Failed resetting voice profiles');
    const data = await res.json();
    if (Array.isArray(data?.profiles)) {
      this.profiles = data.profiles;
      this.notifyProfiles();
    }
    return this.profiles;
  }

  public async loadModel(): Promise<boolean> {
    if (typeof fetch !== 'function') return false;
    const res = await fetch('/api/tts/models/load', { method: 'POST' });
    return res.ok;
  }

  public async unloadModel(): Promise<boolean> {
    if (typeof fetch !== 'function') return false;
    const res = await fetch('/api/tts/models/unload', { method: 'POST' });
    return res.ok;
  }

  public async clearCache(): Promise<void> {
    await audioCacheDb.clear();
    if (typeof fetch === 'function') {
      await fetch('/api/tts/cache', { method: 'DELETE' }).catch(() => undefined);
    }
  }

  public async fetchProfileSampleWav(
    profileId: string,
    forceRegenerate: boolean = false
  ): Promise<ArrayBuffer | null> {
    if (typeof fetch !== 'function') return null;
    if (!forceRegenerate) {
      const staticRes = await fetch(`/voice-samples/${encodeURIComponent(profileId)}.wav`).catch(
        () => null
      );
      if (staticRes?.ok) {
        return staticRes.arrayBuffer();
      }
    }
    const genRes = await fetch(`/api/tts/voices/${encodeURIComponent(profileId)}/sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: forceRegenerate }),
    }).catch(() => null);
    if (genRes?.ok) {
      return genRes.arrayBuffer();
    }
    return null;
  }

  /**
   * Resolves synthesized Kokoro-82M WAV bytes via IndexedDB cache first, then local backend.
   * Honors timeoutMs so slow cold-starts gracefully yield to instant offline sprite packs
   * while completing caching asynchronously in background.
   */
  public async synthesizeWav(params: {
    rawText: string;
    voiceId: string;
    voiceType: VoiceType;
    speed: number;
    priority?: GenerationPriority;
    timeoutMs?: number;
    bypassCache?: boolean;
  }): Promise<SynthesizedWavResult | null> {
    if (!this.ttsEnabled) return null;
    const normalizedText = formatPhraseForSpeech(params.rawText) || params.rawText.trim();
    if (!normalizedText) return null;

    const key = buildClientCacheKey(params.voiceId, normalizedText, params.speed);

    if (!params.bypassCache) {
      const localCached = await audioCacheDb.get(key);
      if (localCached) {
        this.clientCacheHits += 1;
        return {
          wavBytes: localCached.wavBytes.slice(0),
          voiceId: localCached.voiceId,
          kokoroSpeaker: '',
          durationSec: localCached.durationSec,
          generationMs: 0,
          cacheHit: true,
        };
      }
    }
    this.clientCacheMisses += 1;

    if (typeof fetch !== 'function') return null;

    let synthPromise = this.inFlightSynths.get(key);
    if (!synthPromise) {
      synthPromise = (async () => {
        try {
          const res = await fetch('/api/tts/synthesize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: params.rawText,
              voiceId: params.voiceId,
              voiceType: params.voiceType,
              speedOverride: params.speed,
              priority: params.priority || 'high',
              bypassCache: params.bypassCache,
            }),
          });
          if (!res.ok) {
            this.recordPlaybackError('tts-http', `Synthesis HTTP ${res.status} for ${params.voiceId}`);
            return null;
          }
          this.engineReachable = true;

          const wavBytes = await res.arrayBuffer();
          if (wavBytes.byteLength <= 44) {
            this.recordPlaybackError('tts-wav', `Empty WAV buffer returned for ${params.voiceId}`);
            return null;
          }

          const durationSec = Number(res.headers.get('X-TTS-Duration-Sec') || '0');
          const generationMs = Number(res.headers.get('X-TTS-Generation-Ms') || '0');
          const kokoroSpeaker = res.headers.get('X-TTS-Kokoro-Speaker') || '';
          const cacheHit = res.headers.get('X-TTS-Cache-Hit') === '1';

          await audioCacheDb.put({
            cacheKey: key,
            voiceId: params.voiceId,
            normalizedText,
            speed: params.speed,
            wavBytes: wavBytes.slice(0),
            sizeBytes: wavBytes.byteLength,
            durationSec,
          });

          return {
            wavBytes,
            voiceId: params.voiceId,
            kokoroSpeaker,
            durationSec,
            generationMs,
            cacheHit,
          };
        } catch (err) {
          this.engineReachable = false;
          this.recordPlaybackError(
            'tts-network',
            err instanceof Error ? err.message : 'Local TTS server unreachable'
          );
          return null;
        } finally {
          this.inFlightSynths.delete(key);
        }
      })();

      this.inFlightSynths.set(key, synthPromise);
    }

    if (params.timeoutMs && params.timeoutMs > 0) {
      return Promise.race([
        synthPromise.then(r =>
          r ? { ...r, wavBytes: r.wavBytes.slice(0) } : null
        ),
        new Promise<null>(resolve => setTimeout(() => resolve(null), params.timeoutMs)),
      ]);
    }

    const finalRes = await synthPromise;
    return finalRes ? { ...finalRes, wavBytes: finalRes.wavBytes.slice(0) } : null;
  }

  /**
   * Lookahead background pre-synthesis (fire-and-forget) so Pilot readbacks are ready
   * in IndexedDB cache before ATC finishes speaking!
   */
  public prewarmPhrase(params: {
    rawText: string;
    voiceId: string;
    voiceType: VoiceType;
    speed: number;
  }): void {
    if (!this.prewarmEnabled || !this.ttsEnabled) return;
    void this.synthesizeWav({
      ...params,
      priority: 'low',
    });
  }

  public async recoverWorker(): Promise<TtsEngineStatus | null> {
    if (typeof fetch !== 'function') return null;
    const res = await fetch('/api/tts/worker/recover', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Worker recovery failed (${res.status})`);
    }
    const data = await res.json();
    return (data?.status as TtsEngineStatus) || null;
  }

  public async fetchGlobalSettings(): Promise<GlobalAudioSettings> {
    if (typeof fetch !== 'function') return DEFAULT_GLOBAL_AUDIO_SETTINGS;
    try {
      const res = await fetch('/api/audio/settings');
      if (!res.ok) return DEFAULT_GLOBAL_AUDIO_SETTINGS;
      const data = await res.json();
      return (data?.settings as GlobalAudioSettings) || DEFAULT_GLOBAL_AUDIO_SETTINGS;
    } catch {
      return DEFAULT_GLOBAL_AUDIO_SETTINGS;
    }
  }

  public async updateGlobalSettings(
    patch: Partial<GlobalAudioSettings>
  ): Promise<GlobalAudioSettings> {
    if (typeof fetch !== 'function') return { ...DEFAULT_GLOBAL_AUDIO_SETTINGS, ...patch };
    const res = await fetch('/api/audio/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `Failed updating audio settings (${res.status})`);
    }
    return data.settings as GlobalAudioSettings;
  }

  public async fetchDiagnostics(): Promise<AudioDiagnosticsReport | null> {
    if (typeof fetch !== 'function') return null;
    try {
      const res = await fetch('/api/audio/diagnostics');
      if (!res.ok) return null;
      return (await res.json()) as AudioDiagnosticsReport;
    } catch {
      return null;
    }
  }

  public async resetDiagnostics(): Promise<void> {
    this.clearClientDiagnostics();
    if (typeof fetch !== 'function') return;
    await fetch('/api/audio/diagnostics/reset', { method: 'POST' }).catch(() => undefined);
  }

  public async fetchDatabaseState(): Promise<LocalDatabaseState | null> {
    if (typeof fetch !== 'function') return null;
    try {
      const res = await fetch('/api/audio/migrations');
      if (!res.ok) return null;
      return (await res.json()) as LocalDatabaseState;
    } catch {
      return null;
    }
  }

  public isEngineReachable(): boolean | null {
    return this.engineReachable;
  }
}

export const localTtsClient = new LocalTtsClient();
