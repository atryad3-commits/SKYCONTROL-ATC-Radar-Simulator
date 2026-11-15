/**
 * SKYCONTROL - Local Offline Speech Generation Service
 * Orchestrates Kokoro-82M neural TTS generation, <=15 voice profiles, local model lifecycle,
 * priority background worker queueing, persistent WAV caching, and sample audio synthesis.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  AudioGenerationJob,
  AudioMetadataEntry,
  GenerationPriority,
  SynthesizeRequest,
  TtsEngineStatus,
  VoiceProfile,
  VoiceProfileUpdatePatch,
  VoiceType,
} from '../shared/ttsTypes';
import { formatPhraseForSpeech } from '../src/audio/phraseNormalizer';
import { AudioCacheManager } from './audioCacheManager';
import { AudioGenerationQueue } from './audioGenerationQueue';
import { AudioLibraryManager } from './audioLibraryManager';
import { ModelManager } from './modelManager';
import { VoiceProfileManager } from './voiceProfileManager';

export interface SynthesizeSpeechResult {
  wavBuffer: Buffer;
  metadata: AudioMetadataEntry;
  profile: VoiceProfile;
  cacheHit: boolean;
}

export class LocalTtsService {
  public readonly profileManager: VoiceProfileManager;
  public readonly modelManager: ModelManager;
  public readonly cacheManager: AudioCacheManager;
  public readonly queue: AudioGenerationQueue;
  public readonly libraryManager: AudioLibraryManager;
  public readonly samplesDir: string;

  constructor(options?: {
    dataDir?: string;
    modelsDir?: string;
    samplesDir?: string;
    libraryDir?: string;
  }) {
    const dataDir = options?.dataDir || path.resolve(process.cwd(), 'local-data');
    const modelsDir = options?.modelsDir || path.resolve(process.cwd(), 'local-models');
    this.samplesDir = options?.samplesDir || path.resolve(process.cwd(), 'public/voice-samples');
    const libraryDir = options?.libraryDir || path.resolve(process.cwd(), 'public/audio-library');

    this.profileManager = new VoiceProfileManager(dataDir);
    this.modelManager = new ModelManager(modelsDir, 'q8');
    this.cacheManager = new AudioCacheManager(dataDir);
    this.queue = new AudioGenerationQueue(this.modelManager);
    this.libraryManager = new AudioLibraryManager({
      profileManager: this.profileManager,
      queue: this.queue,
      dataDir,
      libraryDir,
      rootDir: process.cwd(),
    });

    fs.mkdirSync(this.samplesDir, { recursive: true });
  }

  /**
   * Non-blocking startup warmup: starts loading local Kokoro weights in the background worker
   * so the Express HTTP server & radar frontend remain responsive immediately.
   */
  public warmupInBackground(): void {
    const disk = this.modelManager.inspectModelFiles();
    if (!disk.verifiedOnDisk) {
      console.warn('[LocalTtsService] Local Kokoro model not verified on disk yet; skipping auto-warmup.');
      return;
    }
    void this.queue
      .ensureModelLoaded()
      .then(() => {
        console.log(
          `[LocalTtsService] Kokoro-82M ready offline (${this.modelManager.getModelInfo().loadDurationMs}ms)`
        );
      })
      .catch(err => {
        console.error('[LocalTtsService] Background model warmup failed:', err);
      });
  }

  public resolveProfile(params: {
    voiceId?: string;
    voiceType?: VoiceType;
  }): VoiceProfile {
    if (params.voiceId) {
      const exact = this.profileManager.getProfile(params.voiceId);
      if (exact && exact.enabled) {
        return exact;
      }
      if (params.voiceType && params.voiceType !== 'PILOT') {
        return this.profileManager.resolveControllerProfile(params.voiceType, params.voiceId);
      }
      // Fallback if requested pilot profile was disabled
      if (exact && exact.voiceType === 'PILOT') {
        return this.profileManager.resolvePilotProfile(params.voiceId);
      }
    }

    if (params.voiceType && params.voiceType !== 'PILOT') {
      return this.profileManager.resolveControllerProfile(params.voiceType);
    }

    return this.profileManager.resolvePilotProfile('DEFAULT');
  }

  /**
   * Generates or fetches pre-generated library / cached 24kHz PCM-16 WAV audio for any ATC/Pilot phrase.
   */
  public async synthesizeSpeech(req: SynthesizeRequest): Promise<SynthesizeSpeechResult> {
    const rawText = (req.text || '').trim();
    if (!rawText) {
      throw new Error('Cannot synthesize empty text');
    }

    const profile = this.resolveProfile({
      voiceId: req.voiceId,
      voiceType: req.voiceType,
    });
    const normalizedText = formatPhraseForSpeech(rawText) || rawText;
    const effectiveSpeed = Number(
      Math.max(0.7, Math.min(1.4, req.speedOverride ?? profile.speed)).toFixed(2)
    );

    const { cacheKey, textHash } = this.cacheManager.computeCacheKey({
      normalizedText,
      voiceId: profile.id,
      kokoroVoiceId: profile.voiceConfig.kokoroVoiceId,
      modelRef: profile.modelRef,
      speed: effectiveSpeed,
      stability: profile.stability,
    });

    if (!req.bypassCache) {
      // 1. Check pre-generated Audio Library exact phrase match first (0ms latency)
      const libHit = this.libraryManager.matchReadyAsset(profile.id, normalizedText);
      if (libHit) {
        return {
          wavBuffer: libHit.wavBuffer,
          metadata: {
            cacheKey: libHit.entry.assetId,
            textHash,
            rawText,
            normalizedText,
            voiceId: profile.id,
            voiceType: profile.voiceType,
            kokoroVoiceId: profile.voiceConfig.kokoroVoiceId,
            modelRef: libHit.entry.modelVersion,
            speed: effectiveSpeed,
            pitch: profile.pitch,
            stability: profile.stability,
            wavFileName: libHit.entry.filePath,
            sampleRate: libHit.entry.quality?.sampleRate || 24000,
            channels: libHit.entry.quality?.channels || 1,
            bitsPerSample: libHit.entry.quality?.bitsPerSample || 16,
            durationSec: libHit.entry.duration,
            sizeBytes: libHit.wavBuffer.length,
            generationMs: 0,
            createdAt: libHit.entry.createdAt || new Date().toISOString(),
            lastAccessedAt: new Date().toISOString(),
            hitCount: 1,
            source: 'kokoro-local',
          },
          profile,
          cacheHit: true,
        };
      }

      // 2. Check dynamic synthesis disk cache
      const cached = this.cacheManager.get(cacheKey);
      if (cached) {
        return {
          wavBuffer: cached.wavBuffer,
          metadata: cached.metadata,
          profile,
          cacheHit: true,
        };
      }
    }

    const { promise } = this.queue.enqueue({
      cacheKey,
      rawText,
      normalizedText,
      profile,
      speed: effectiveSpeed,
      priority: req.priority || 'high',
    });

    const result = await promise;
    const metadata = this.cacheManager.put({
      cacheKey,
      textHash,
      rawText,
      normalizedText,
      profile,
      speed: effectiveSpeed,
      generationMs: result.generationMs,
      wavBuffer: result.wavBuffer,
      source: 'kokoro-local',
    });

    return {
      wavBuffer: result.wavBuffer,
      metadata,
      profile,
      cacheHit: false,
    };
  }

  /**
   * Submits an asynchronous background job without waiting for inference completion.
   */
  public enqueueBackgroundJob(req: SynthesizeRequest): {
    cacheHit: boolean;
    job: AudioGenerationJob | null;
    metadata?: AudioMetadataEntry;
  } {
    const rawText = (req.text || '').trim();
    if (!rawText) {
      throw new Error('Cannot enqueue empty text');
    }

    const profile = this.resolveProfile({
      voiceId: req.voiceId,
      voiceType: req.voiceType,
    });
    const normalizedText = formatPhraseForSpeech(rawText) || rawText;
    const effectiveSpeed = Number(
      Math.max(0.7, Math.min(1.4, req.speedOverride ?? profile.speed)).toFixed(2)
    );

    const { cacheKey, textHash } = this.cacheManager.computeCacheKey({
      normalizedText,
      voiceId: profile.id,
      kokoroVoiceId: profile.voiceConfig.kokoroVoiceId,
      modelRef: profile.modelRef,
      speed: effectiveSpeed,
      stability: profile.stability,
    });

    if (!req.bypassCache) {
      const cached = this.cacheManager.get(cacheKey);
      if (cached) {
        return { cacheHit: true, job: null, metadata: cached.metadata };
      }
    }

    const { job, promise } = this.queue.enqueue({
      cacheKey,
      rawText,
      normalizedText,
      profile,
      speed: effectiveSpeed,
      priority: req.priority || ('low' as GenerationPriority),
    });

    void promise
      .then(res => {
        this.cacheManager.put({
          cacheKey,
          textHash,
          rawText,
          normalizedText,
          profile,
          speed: effectiveSpeed,
          generationMs: res.generationMs,
          wavBuffer: res.wavBuffer,
          source: 'kokoro-local',
        });
      })
      .catch(() => undefined);

    return { cacheHit: false, job };
  }

  /**
   * Ensures a pre-generated WAV audition sample exists on disk for the voice profile.
   */
  public async ensureProfileSample(
    profileId: string,
    forceRegenerate: boolean = false
  ): Promise<{ wavPath: string; wavBuffer: Buffer; profile: VoiceProfile }> {
    const profile = this.profileManager.getProfile(profileId);
    if (!profile) {
      throw new Error(`Voice profile "${profileId}" not found`);
    }

    fs.mkdirSync(this.samplesDir, { recursive: true });
    const wavPath = path.join(this.samplesDir, `${profile.id}.wav`);

    if (!forceRegenerate && fs.existsSync(wavPath)) {
      const buf = fs.readFileSync(wavPath);
      if (buf.length > 44) {
        return { wavPath, wavBuffer: buf, profile };
      }
    }

    const normalizedText = formatPhraseForSpeech(profile.sampleText) || profile.sampleText;
    const { promise } = this.queue.enqueue({
      cacheKey: `sample_${profile.id}_${profile.speed}`,
      rawText: profile.sampleText,
      normalizedText,
      profile,
      speed: profile.speed,
      priority: 'normal',
    });

    const result = await promise;
    fs.writeFileSync(wavPath, result.wavBuffer);
    return { wavPath, wavBuffer: result.wavBuffer, profile };
  }

  public updateVoiceProfile(id: string, patch: VoiceProfileUpdatePatch): VoiceProfile {
    return this.profileManager.updateProfile(id, patch);
  }

  public getStatus(): TtsEngineStatus {
    const profiles = this.profileManager.listProfiles();
    return {
      offlineOnly: true,
      workerAlive: this.queue.isWorkerAlive(),
      workerRestarts: this.queue.getWorkerRestarts(),
      model: this.modelManager.getModelInfo(),
      queue: this.queue.getStats(),
      cache: this.cacheManager.getStats(),
      profilesCount: profiles.length,
      enabledProfilesCount: profiles.filter(p => p.enabled).length,
    };
  }
}

export const localTtsService = new LocalTtsService();
