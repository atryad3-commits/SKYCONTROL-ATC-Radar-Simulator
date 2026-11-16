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
import {
  AudioDiagnosticsErrorEntry,
  AudioDiagnosticsReport,
  GlobalAudioSettings,
  LocalDatabaseState,
} from '../shared/audioStudioTypes';
import { formatPhraseForSpeech } from '../src/audio/phraseNormalizer';
import { AudioCacheManager } from './audioCacheManager';
import { AudioGenerationQueue } from './audioGenerationQueue';
import { AudioLibraryManager } from './audioLibraryManager';
import { collectHardwareTelemetry } from './hardwareTelemetry';
import { LocalAudioDatabase } from './localDatabase';
import { ModelManager } from './modelManager';
import { VoiceProfileManager } from './voiceProfileManager';

export interface SynthesizeSpeechResult {
  wavBuffer: Buffer;
  metadata: AudioMetadataEntry;
  profile: VoiceProfile;
  cacheHit: boolean;
}

export class LocalTtsService {
  public readonly database: LocalAudioDatabase;
  public readonly profileManager: VoiceProfileManager;
  public readonly modelManager: ModelManager;
  public readonly cacheManager: AudioCacheManager;
  public readonly queue: AudioGenerationQueue;
  public readonly libraryManager: AudioLibraryManager;
  public readonly samplesDir: string;

  private recentLatenciesMs: number[] = [];
  private recentErrors: AudioDiagnosticsErrorEntry[] = [];

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

    this.database = new LocalAudioDatabase(dataDir);
    this.profileManager = new VoiceProfileManager(dataDir);
    this.modelManager = new ModelManager(modelsDir, 'q8');
    this.cacheManager = new AudioCacheManager(dataDir);
    this.cacheManager.setMaxCacheSizeMb(this.database.getSettings().maxCacheSizeMb);
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

  private recordLatency(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.recentLatenciesMs.push(Math.round(ms));
    if (this.recentLatenciesMs.length > 100) {
      this.recentLatenciesMs = this.recentLatenciesMs.slice(-100);
    }
  }

  public recordError(source: AudioDiagnosticsErrorEntry['source'], message: string): void {
    this.recentErrors.unshift({
      timestamp: new Date().toISOString(),
      source,
      message: message.slice(0, 320),
    });
    if (this.recentErrors.length > 40) {
      this.recentErrors = this.recentErrors.slice(0, 40);
    }
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

    let result;
    try {
      const enqueued = this.queue.enqueue({
        cacheKey,
        rawText,
        normalizedText,
        profile,
        speed: effectiveSpeed,
        priority: req.priority || 'high',
      });
      result = await enqueued.promise;
    } catch (err) {
      this.recordError('queue', err instanceof Error ? err.message : String(err));
      throw err;
    }

    this.recordLatency(result.generationMs);
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
    skippedDueToConfig?: boolean;
  } {
    const rawText = (req.text || '').trim();
    if (!rawText) {
      throw new Error('Cannot enqueue empty text');
    }
    if (!this.database.getSettings().backgroundGenerationEnabled && (req.priority || 'low') === 'low') {
      return { cacheHit: false, job: null, skippedDueToConfig: true };
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

  public getAudioSettings(): GlobalAudioSettings {
    return this.database.getSettings();
  }

  public updateAudioSettings(patch: Partial<GlobalAudioSettings>): GlobalAudioSettings {
    const updated = this.database.updateSettings(patch);
    this.cacheManager.setMaxCacheSizeMb(updated.maxCacheSizeMb);
    return updated;
  }

  public getDatabaseState(): LocalDatabaseState {
    return this.database.getDbState();
  }

  public async recoverWorker(): Promise<TtsEngineStatus> {
    await this.queue.shutdown();
    await this.queue.ensureModelLoaded();
    return this.getStatus();
  }

  private measureSamplesBytes(): number {
    try {
      if (!fs.existsSync(this.samplesDir)) return 0;
      let total = 0;
      for (const f of fs.readdirSync(this.samplesDir)) {
        const p = path.join(this.samplesDir, f);
        const st = fs.statSync(p);
        if (st.isFile()) total += st.size;
      }
      return total;
    } catch {
      return 0;
    }
  }

  public async getDiagnosticsReport(): Promise<AudioDiagnosticsReport> {
    const hardware = await collectHardwareTelemetry();
    const libSummary = this.libraryManager.getSummary();
    const cacheStats = this.cacheManager.getStats();
    const queueStats = this.queue.getStats();
    const modelInfo = this.modelManager.getModelInfo();
    const samplesSizeBytes = this.measureSamplesBytes();

    const latencies = this.recentLatenciesMs.length > 0
      ? [...this.recentLatenciesMs]
      : queueStats.recentJobs
          .map(j => j.durationMs)
          .filter((d): d is number => typeof d === 'number' && d >= 0);

    const sorted = [...latencies].sort((a, b) => a - b);
    const sampleCount = sorted.length;
    const avgMs =
      sampleCount > 0 ? Math.round(sorted.reduce((s, n) => s + n, 0) / sampleCount) : 0;
    const minMs = sampleCount > 0 ? sorted[0] : 0;
    const maxMs = sampleCount > 0 ? sorted[sampleCount - 1] : 0;
    const p95Ms =
      sampleCount > 0 ? sorted[Math.min(sampleCount - 1, Math.floor(sampleCount * 0.95))] : 0;

    const libraryHits = this.libraryManager.getLibraryHitCount();
    const diskHits = cacheStats.hitCount;
    const misses = cacheStats.missCount;
    const totalCacheChecks = libraryHits + diskHits + misses;
    const hitRatePercent =
      totalCacheChecks > 0
        ? Math.round(((libraryHits + diskHits) / totalCacheChecks) * 1000) / 10
        : libSummary.readyCount > 0
          ? 100
          : 0;

    const recentErrors: AudioDiagnosticsErrorEntry[] = [...this.recentErrors];
    if (modelInfo.lastError) {
      recentErrors.unshift({
        timestamp: new Date().toISOString(),
        source: 'model',
        message: modelInfo.lastError,
      });
    }
    for (const job of queueStats.recentJobs) {
      if (job.status === 'failed' && job.error) {
        recentErrors.push({
          timestamp: job.completedAt || job.createdAt,
          source: 'queue',
          message: `[${job.voiceId}] ${job.error}`,
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      latency: {
        avgMs,
        p95Ms,
        minMs,
        maxMs,
        sampleCount,
        recentMs: latencies.slice(-20),
      },
      cache: {
        libraryHits,
        diskHits,
        misses,
        hitRatePercent,
      },
      assets: {
        totalMatrix: libSummary.totalAssets,
        readyCount: libSummary.readyCount,
        missingCount: libSummary.missingCount,
        failedCount: libSummary.failedCount,
        cacheEntries: cacheStats.entryCount,
        librarySizeBytes: libSummary.totalSizeBytes,
        cacheSizeBytes: cacheStats.totalSizeBytes,
        modelSizeBytes: modelInfo.totalDiskBytes,
        samplesSizeBytes,
        totalStorageBytes:
          libSummary.totalSizeBytes +
          cacheStats.totalSizeBytes +
          modelInfo.totalDiskBytes +
          samplesSizeBytes,
      },
      errors: {
        ttsFailedCount: queueStats.failedCount,
        workerRestarts: this.queue.getWorkerRestarts(),
        recentErrors: recentErrors.slice(0, 25),
      },
      hardware,
    };
  }

  public resetDiagnostics(): void {
    this.recentLatenciesMs = [];
    this.recentErrors = [];
    this.libraryManager.resetLibraryHitCount();
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
