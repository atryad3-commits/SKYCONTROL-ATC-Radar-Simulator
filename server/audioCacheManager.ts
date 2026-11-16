/**
 * SKYCONTROL - Local Persistent WAV Audio Cache & Metadata Manager
 * Stores synthesized 24kHz PCM-16 WAV files on disk under local-data/audio-cache/
 * with deterministic SHA-256 keying, metadata indexing, corruption recovery, and LRU eviction.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AudioMetadataEntry, CacheStats, VoiceProfile } from '../shared/ttsTypes';
import { readWavMetadata } from './wavEncoder';

const DEFAULT_MAX_CACHE_SIZE_BYTES = 250 * 1024 * 1024; // 250 MB default ceiling
const MAX_CACHE_ENTRIES = 2000;

export class AudioCacheManager {
  private readonly cacheDir: string;
  private readonly metadataPath: string;
  private maxCacheSizeBytes: number = DEFAULT_MAX_CACHE_SIZE_BYTES;
  private entries = new Map<string, AudioMetadataEntry>();
  private hitCount = 0;
  private missCount = 0;

  constructor(dataDir: string = path.resolve(process.cwd(), 'local-data')) {
    this.cacheDir = path.join(dataDir, 'audio-cache');
    this.metadataPath = path.join(this.cacheDir, 'metadata.json');
    this.loadIndex();
  }

  public setMaxCacheSizeMb(limitMb: number): void {
    const clampedMb = Math.max(50, Math.min(2048, Math.round(limitMb)));
    this.maxCacheSizeBytes = clampedMb * 1024 * 1024;
    this.evictIfNeeded();
    this.persistIndex();
  }

  private loadIndex() {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      if (fs.existsSync(this.metadataPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
        if (Array.isArray(parsed)) {
          for (const item of parsed as AudioMetadataEntry[]) {
            if (item?.cacheKey && item?.wavFileName) {
              const wavFull = path.join(this.cacheDir, item.wavFileName);
              if (fs.existsSync(wavFull)) {
                this.entries.set(item.cacheKey, item);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[AudioCacheManager] Corrupt metadata index detected, rebuilding cleanly:', err);
      this.entries.clear();
    }
  }

  private persistIndex() {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      const tmpPath = `${this.metadataPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(Array.from(this.entries.values()), null, 2), 'utf8');
      fs.renameSync(tmpPath, this.metadataPath);
    } catch (err) {
      console.error('[AudioCacheManager] Failed to persist metadata index:', err);
    }
  }

  public computeCacheKey(params: {
    normalizedText: string;
    voiceId: string;
    kokoroVoiceId: string;
    modelRef: string;
    speed: number;
    stability: number;
  }): { cacheKey: string; textHash: string } {
    const textHash = crypto
      .createHash('sha256')
      .update(params.normalizedText.trim().toLowerCase())
      .digest('hex')
      .slice(0, 16);

    const cacheKey = crypto
      .createHash('sha256')
      .update(
        JSON.stringify([
          params.modelRef,
          params.voiceId,
          params.kokoroVoiceId,
          Number(params.speed.toFixed(2)),
          Number(params.stability.toFixed(2)),
          params.normalizedText.trim().toLowerCase(),
        ])
      )
      .digest('hex')
      .slice(0, 28);

    return { cacheKey, textHash };
  }

  public get(cacheKey: string): { wavBuffer: Buffer; metadata: AudioMetadataEntry } | null {
    const meta = this.entries.get(cacheKey);
    if (!meta) {
      this.missCount += 1;
      return null;
    }

    const wavFull = path.join(this.cacheDir, meta.wavFileName);
    try {
      if (!fs.existsSync(wavFull)) {
        this.entries.delete(cacheKey);
        this.persistIndex();
        this.missCount += 1;
        return null;
      }
      const wavBuffer = fs.readFileSync(wavFull);
      if (wavBuffer.length < 44) {
        fs.unlinkSync(wavFull);
        this.entries.delete(cacheKey);
        this.persistIndex();
        this.missCount += 1;
        return null;
      }

      this.hitCount += 1;
      meta.hitCount += 1;
      meta.lastAccessedAt = new Date().toISOString();
      this.entries.set(cacheKey, meta);
      this.persistIndex();
      return { wavBuffer, metadata: { ...meta } };
    } catch {
      this.entries.delete(cacheKey);
      this.missCount += 1;
      return null;
    }
  }

  public put(params: {
    cacheKey: string;
    textHash: string;
    rawText: string;
    normalizedText: string;
    profile: VoiceProfile;
    speed: number;
    generationMs: number;
    wavBuffer: Buffer;
    source?: 'kokoro-local' | 'sample';
  }): AudioMetadataEntry {
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const wavFileName = `${params.cacheKey}.wav`;
    const wavFull = path.join(this.cacheDir, wavFileName);
    fs.writeFileSync(wavFull, params.wavBuffer);

    const wavInfo = readWavMetadata(params.wavBuffer);
    const now = new Date().toISOString();
    const existing = this.entries.get(params.cacheKey);

    const entry: AudioMetadataEntry = {
      cacheKey: params.cacheKey,
      textHash: params.textHash,
      rawText: params.rawText,
      normalizedText: params.normalizedText,
      voiceId: params.profile.id,
      voiceType: params.profile.voiceType,
      kokoroVoiceId: params.profile.voiceConfig.kokoroVoiceId,
      modelRef: params.profile.modelRef,
      speed: params.speed,
      pitch: params.profile.pitch,
      stability: params.profile.stability,
      wavFileName,
      sampleRate: wavInfo.sampleRate,
      channels: wavInfo.channels,
      bitsPerSample: wavInfo.bitsPerSample,
      durationSec: Number(wavInfo.durationSec.toFixed(3)),
      sizeBytes: params.wavBuffer.length,
      generationMs: Math.round(params.generationMs),
      createdAt: existing?.createdAt || now,
      lastAccessedAt: now,
      hitCount: (existing?.hitCount ?? 0) + 1,
      source: params.source || 'kokoro-local',
    };

    this.entries.set(params.cacheKey, entry);
    this.evictIfNeeded();
    this.persistIndex();
    return { ...entry };
  }

  private evictIfNeeded() {
    let totalBytes = 0;
    for (const entry of this.entries.values()) {
      totalBytes += entry.sizeBytes;
    }

    if (totalBytes <= this.maxCacheSizeBytes && this.entries.size <= MAX_CACHE_ENTRIES) {
      return;
    }

    const sortedLru = Array.from(this.entries.values()).sort((a, b) =>
      a.lastAccessedAt.localeCompare(b.lastAccessedAt)
    );

    for (const victim of sortedLru) {
      if (totalBytes <= this.maxCacheSizeBytes * 0.85 && this.entries.size <= MAX_CACHE_ENTRIES * 0.9) {
        break;
      }
      this.entries.delete(victim.cacheKey);
      totalBytes -= victim.sizeBytes;
      try {
        fs.unlinkSync(path.join(this.cacheDir, victim.wavFileName));
      } catch {
        // Ignore already removed file
      }
    }
  }

  public clear(): number {
    const count = this.entries.size;
    for (const entry of this.entries.values()) {
      try {
        fs.unlinkSync(path.join(this.cacheDir, entry.wavFileName));
      } catch {
        // Ignore missing files
      }
    }
    this.entries.clear();
    this.hitCount = 0;
    this.missCount = 0;
    this.persistIndex();
    return count;
  }

  public listMetadata(limit: number = 100): AudioMetadataEntry[] {
    return Array.from(this.entries.values())
      .sort((a, b) => b.lastAccessedAt.localeCompare(a.lastAccessedAt))
      .slice(0, limit);
  }

  public getStats(): CacheStats {
    let totalSizeBytes = 0;
    for (const entry of this.entries.values()) {
      totalSizeBytes += entry.sizeBytes;
    }
    return {
      entryCount: this.entries.size,
      totalSizeBytes,
      maxSizeBytes: this.maxCacheSizeBytes,
      hitCount: this.hitCount,
      missCount: this.missCount,
    };
  }
}
