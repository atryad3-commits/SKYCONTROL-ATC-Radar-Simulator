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
  private profileListeners: Array<(profiles: VoiceProfile[]) => void> = [];
  private inFlightSynths = new Map<string, Promise<SynthesizedWavResult | null>>();
  private engineReachable: boolean | null = null;

  public getProfilesSync(): VoiceProfile[] {
    return this.profiles;
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
    if (typeof fetch !== 'function') return null;
    const res = await fetch(`/api/tts/voices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
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
    const normalizedText = formatPhraseForSpeech(params.rawText) || params.rawText.trim();
    if (!normalizedText) return null;

    const key = buildClientCacheKey(params.voiceId, normalizedText, params.speed);

    if (!params.bypassCache) {
      const localCached = await audioCacheDb.get(key);
      if (localCached) {
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
          if (!res.ok) return null;
          this.engineReachable = true;

          const wavBytes = await res.arrayBuffer();
          if (wavBytes.byteLength <= 44) return null;

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
        } catch {
          this.engineReachable = false;
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
    void this.synthesizeWav({
      ...params,
      priority: 'low',
    });
  }

  public isEngineReachable(): boolean | null {
    return this.engineReachable;
  }
}

export const localTtsClient = new LocalTtsClient();
