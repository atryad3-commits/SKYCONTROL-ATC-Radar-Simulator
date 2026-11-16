/**
 * SKYCONTROL - Pre-Generated Offline Audio Library Manager
 * Manages the searchable local asset database, manifest persistence, WAV quality analysis,
 * missing-file & duplicate detection, single-asset regeneration, bulk background generation,
 * and O(1) runtime phrase lookup for all 15 voice profiles.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AUDIO_LIBRARY_CATALOG, AUDIO_LIBRARY_CATEGORY_META } from '../shared/audioLibraryCatalog';
import {
  AudioLibraryAssetStatus,
  AudioLibraryCatalogItem,
  AudioLibraryManifestEntry,
  AudioLibrarySearchQuery,
  AudioLibrarySummary,
  BulkGenerationJobState,
  DuplicateGroup,
  IntegrityScanReport,
} from '../shared/audioLibraryTypes';
import { GenerationPriority, VoiceProfile } from '../shared/ttsTypes';
import { formatPhraseForSpeech } from '../src/audio/phraseNormalizer';
import { AudioGenerationQueue } from './audioGenerationQueue';
import { VoiceProfileManager } from './voiceProfileManager';
import { analyzeWavQuality, readWavMetadata } from './wavEncoder';

interface ManifestFile {
  version: number;
  updatedAt: string;
  entries: Record<string, AudioLibraryManifestEntry>;
}

export interface AudioLibraryManagerDeps {
  profileManager: VoiceProfileManager;
  queue: AudioGenerationQueue;
  dataDir?: string;
  libraryDir?: string;
  rootDir?: string;
}

export function normalizePhraseHashInput(spokenText: string): string {
  return spokenText
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeSha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function sanitizeIdPart(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export class AudioLibraryManager {
  private readonly profileManager: VoiceProfileManager;
  private readonly queue: AudioGenerationQueue;
  private readonly rootDir: string;
  private readonly dataDir: string;
  public readonly libraryDir: string;
  private readonly manifestPath: string;

  private entries = new Map<string, AudioLibraryManifestEntry>();
  private runtimeIndex = new Map<string, string>(); // `${voiceId}::${normalizedSpoken}` -> assetId
  private inFlightAssetPromises = new Map<string, Promise<AudioLibraryManifestEntry>>();
  private cancelBulkRequested = false;
  private libraryHitCount = 0;

  private bulkJob: BulkGenerationJobState = {
    jobId: null,
    status: 'idle',
    scope: 'missing',
    totalCount: 0,
    completedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    currentAssetId: null,
    startedAt: null,
    completedAt: null,
    lastError: null,
  };

  constructor(deps: AudioLibraryManagerDeps) {
    this.profileManager = deps.profileManager;
    this.queue = deps.queue;
    this.rootDir = deps.rootDir || process.cwd();
    this.dataDir = deps.dataDir || path.resolve(this.rootDir, 'local-data');
    this.libraryDir = deps.libraryDir || path.resolve(this.rootDir, 'public/audio-library');
    this.manifestPath = path.join(this.dataDir, 'audio-library-manifest.json');

    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.libraryDir, { recursive: true });

    this.loadManifestAndSyncCatalog();
  }

  private buildAssetId(voiceId: string, phraseId: string): string {
    return `${voiceId}__${phraseId}`;
  }

  private buildRelativeFilePath(voiceId: string, phraseId: string): string {
    return path.posix.join(
      path.relative(this.rootDir, this.libraryDir).split(path.sep).join('/'),
      voiceId,
      `${phraseId}.wav`
    );
  }

  private resolveDiskPath(entry: AudioLibraryManifestEntry): string {
    return path.resolve(this.rootDir, entry.filePath);
  }

  private buildCatalogEntry(
    profile: VoiceProfile,
    item: AudioLibraryCatalogItem
  ): AudioLibraryManifestEntry {
    const assetId = this.buildAssetId(profile.id, item.phraseId);
    const spokenText = item.spokenText || formatPhraseForSpeech(item.rawText) || item.rawText;
    const relPath = this.buildRelativeFilePath(profile.id, item.phraseId);
    const publicUrl = `/audio-library/${encodeURIComponent(profile.id)}/${encodeURIComponent(item.phraseId)}.wav`;

    return {
      assetId,
      voiceId: profile.id,
      voiceType: profile.voiceType,
      phraseId: item.phraseId,
      group: item.group,
      category: item.category,
      rawText: item.rawText,
      spokenText,
      templatePattern: item.templatePattern,
      filePath: relPath,
      publicUrl,
      duration: 0,
      fileFormat: 'wav',
      sizeBytes: 0,
      status: 'missing',
      createdAt: null,
      updatedAt: null,
      modelVersion: profile.modelRef,
      kokoroSpeakerId: profile.voiceConfig.kokoroVoiceId,
      audioHash: null,
      phraseHash: computeSha256Hex(normalizePhraseHashInput(spokenText)),
      quality: null,
      error: null,
      isCustom: false,
    };
  }

  private loadManifestAndSyncCatalog(): void {
    if (fs.existsSync(this.manifestPath)) {
      try {
        const raw = fs.readFileSync(this.manifestPath, 'utf8');
        const parsed = JSON.parse(raw) as ManifestFile;
        if (parsed && parsed.entries && typeof parsed.entries === 'object') {
          for (const [id, entry] of Object.entries(parsed.entries)) {
            if (entry && entry.assetId) {
              // Reset transient queue states on cold server boot
              if (entry.status === 'queued' || entry.status === 'generating') {
                entry.status = fs.existsSync(this.resolveDiskPath(entry)) ? 'ready' : 'missing';
              }
              this.entries.set(id, entry);
            }
          }
        }
      } catch (err) {
        console.warn('[AudioLibraryManager] Manifest load failed, rebuilding matrix:', err);
      }
    }

    this.syncCatalogWithProfiles();
    this.reconcileDiskFilesLight();
    this.rebuildRuntimeIndex();
    this.saveManifest();
  }

  /**
   * Ensures every catalog item has a manifest slot for all configured voice profiles (up to 15).
   */
  public syncCatalogWithProfiles(): void {
    const profiles = this.profileManager.listProfiles();
    for (const profile of profiles) {
      for (const item of AUDIO_LIBRARY_CATALOG) {
        const assetId = this.buildAssetId(profile.id, item.phraseId);
        const existing = this.entries.get(assetId);
        const fresh = this.buildCatalogEntry(profile, item);
        if (!existing) {
          this.entries.set(assetId, fresh);
        } else {
          // Keep generation telemetry, update catalog metadata if needed
          existing.voiceType = profile.voiceType;
          existing.group = item.group;
          existing.category = item.category;
          existing.rawText = item.rawText;
          existing.spokenText = fresh.spokenText;
          existing.templatePattern = item.templatePattern;
          existing.phraseHash = fresh.phraseHash;
          existing.kokoroSpeakerId = profile.voiceConfig.kokoroVoiceId;
          if (!existing.modelVersion) existing.modelVersion = profile.modelRef;
        }
      }
    }
  }

  private reconcileDiskFilesLight(): void {
    for (const entry of this.entries.values()) {
      const diskPath = this.resolveDiskPath(entry);
      const exists = fs.existsSync(diskPath);
      if (entry.status === 'ready' && !exists) {
        entry.status = 'missing';
        entry.duration = 0;
        entry.sizeBytes = 0;
        entry.audioHash = null;
        entry.quality = null;
      } else if (entry.status !== 'ready' && exists) {
        try {
          const buf = fs.readFileSync(diskPath);
          if (buf.length > 44) {
            const meta = readWavMetadata(buf);
            entry.duration = Number(meta.durationSec.toFixed(3));
            entry.sizeBytes = buf.length;
            entry.audioHash = computeSha256Hex(buf);
            entry.quality = analyzeWavQuality(buf);
            entry.status = 'ready';
            entry.error = null;
            if (!entry.createdAt) entry.createdAt = new Date().toISOString();
            entry.updatedAt = new Date().toISOString();
          }
        } catch {
          entry.status = 'missing';
        }
      }
    }
  }

  private rebuildRuntimeIndex(): void {
    this.runtimeIndex.clear();
    for (const entry of this.entries.values()) {
      if (entry.status === 'ready') {
        const key = `${entry.voiceId}::${normalizePhraseHashInput(entry.spokenText)}`;
        if (!this.runtimeIndex.has(key)) {
          this.runtimeIndex.set(key, entry.assetId);
        }
      }
    }
  }

  private saveManifest(): void {
    const out: ManifestFile = {
      version: 2,
      updatedAt: new Date().toISOString(),
      entries: Object.fromEntries(this.entries.entries()),
    };
    const tmpPath = `${this.manifestPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(out, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.manifestPath);
  }

  /**
   * Runtime O(1) lookup for pre-generated complete-sentence assets matching a voice + phrase.
   */
  public matchReadyAsset(
    voiceId: string,
    rawOrSpokenText: string
  ): { wavBuffer: Buffer; entry: AudioLibraryManifestEntry } | null {
    const spoken = formatPhraseForSpeech(rawOrSpokenText) || rawOrSpokenText;
    const key = `${voiceId}::${normalizePhraseHashInput(spoken)}`;
    const assetId = this.runtimeIndex.get(key);
    if (!assetId) return null;

    const entry = this.entries.get(assetId);
    if (!entry || entry.status !== 'ready') return null;

    const diskPath = this.resolveDiskPath(entry);
    if (!fs.existsSync(diskPath)) {
      entry.status = 'missing';
      this.runtimeIndex.delete(key);
      this.saveManifest();
      return null;
    }

    const wavBuffer = fs.readFileSync(diskPath);
    if (wavBuffer.length <= 44) return null;
    this.libraryHitCount += 1;
    return { wavBuffer, entry };
  }

  public getLibraryHitCount(): number {
    return this.libraryHitCount;
  }

  public resetLibraryHitCount(): void {
    this.libraryHitCount = 0;
  }

  public getAsset(assetId: string): AudioLibraryManifestEntry | undefined {
    return this.entries.get(assetId);
  }

  public getAssetAudioBuffer(assetId: string): Buffer | null {
    const entry = this.entries.get(assetId);
    if (!entry) return null;
    const diskPath = this.resolveDiskPath(entry);
    if (!fs.existsSync(diskPath)) {
      if (entry.status === 'ready') {
        entry.status = 'missing';
        this.rebuildRuntimeIndex();
        this.saveManifest();
      }
      return null;
    }
    return fs.readFileSync(diskPath);
  }

  /**
   * Detects both identical WAV file duplicates (binary SHA-256) and phrase collisions (semantic SHA-256).
   */
  public detectDuplicates(): DuplicateGroup[] {
    const byBinaryHash = new Map<string, string[]>();
    const byVoicePhraseHash = new Map<string, string[]>();

    for (const entry of this.entries.values()) {
      if (entry.audioHash && entry.status === 'ready') {
        const list = byBinaryHash.get(entry.audioHash) || [];
        list.push(entry.assetId);
        byBinaryHash.set(entry.audioHash, list);
      }
      const semanticKey = `${entry.voiceId}::${entry.phraseHash}`;
      const semanticList = byVoicePhraseHash.get(semanticKey) || [];
      semanticList.push(entry.assetId);
      byVoicePhraseHash.set(semanticKey, semanticList);
    }

    const groups: DuplicateGroup[] = [];

    for (const [hash, assetIds] of byVoicePhraseHash.entries()) {
      if (assetIds.length > 1) {
        const sample = this.entries.get(assetIds[0]);
        groups.push({
          type: 'semantic_phrase',
          key: hash,
          reason: `Identical normalized phrase for voice ${sample?.voiceId || 'unknown'}: "${sample?.spokenText || ''}"`,
          assetIds,
        });
      }
    }

    for (const [hash, assetIds] of byBinaryHash.entries()) {
      if (assetIds.length > 1) {
        groups.push({
          type: 'binary_audio',
          key: hash,
          reason: `Identical SHA-256 WAV audio payload (${hash.slice(0, 12)}…) shared across ${assetIds.length} assets`,
          assetIds,
        });
      }
    }

    return groups;
  }

  /**
   * Full integrity audit: verifies every WAV file on disk, validates RIFF headers & acoustic quality,
   * flags missing or corrupted files, and computes duplicate groups.
   */
  public scanIntegrity(): IntegrityScanReport {
    this.syncCatalogWithProfiles();

    const missingAssetIds: string[] = [];
    const corruptAssetIds: string[] = [];
    let readyCount = 0;
    let failedCount = 0;

    for (const entry of this.entries.values()) {
      const diskPath = this.resolveDiskPath(entry);
      if (!fs.existsSync(diskPath)) {
        if (entry.status === 'failed') {
          failedCount += 1;
        } else if (entry.status !== 'queued' && entry.status !== 'generating') {
          entry.status = 'missing';
          entry.duration = 0;
          entry.sizeBytes = 0;
          entry.audioHash = null;
          entry.quality = null;
        }
        missingAssetIds.push(entry.assetId);
        continue;
      }

      try {
        const buf = fs.readFileSync(diskPath);
        const meta = readWavMetadata(buf);
        const quality = analyzeWavQuality(buf);
        if (meta.dataBytes < 160 || meta.durationSec <= 0.02) {
          throw new Error('WAV payload too short / empty');
        }
        entry.duration = Number(meta.durationSec.toFixed(3));
        entry.sizeBytes = buf.length;
        entry.audioHash = computeSha256Hex(buf);
        entry.quality = quality;
        entry.status = 'ready';
        entry.error = null;
        if (!entry.createdAt) entry.createdAt = new Date().toISOString();
        readyCount += 1;
      } catch (err) {
        entry.status = 'missing';
        entry.error = `Corrupt WAV: ${err instanceof Error ? err.message : String(err)}`;
        corruptAssetIds.push(entry.assetId);
        missingAssetIds.push(entry.assetId);
      }
    }

    this.rebuildRuntimeIndex();
    this.saveManifest();

    const duplicates = this.detectDuplicates();

    return {
      scannedAt: new Date().toISOString(),
      totalAssets: this.entries.size,
      readyCount,
      missingCount: missingAssetIds.length,
      corruptCount: corruptAssetIds.length,
      failedCount,
      missingAssetIds,
      corruptAssetIds,
      duplicates,
    };
  }

  public getSummary(): AudioLibrarySummary {
    const voiceCounts: Record<string, { total: number; ready: number; missing: number }> = {};
    const categoryCounts: Record<string, { total: number; ready: number; missing: number }> = {};

    let readyCount = 0;
    let missingCount = 0;
    let queuedOrGeneratingCount = 0;
    let failedCount = 0;
    let totalSizeBytes = 0;
    let totalDurationSec = 0;
    let customAssetsCount = 0;

    for (const entry of this.entries.values()) {
      if (!voiceCounts[entry.voiceId]) {
        voiceCounts[entry.voiceId] = { total: 0, ready: 0, missing: 0 };
      }
      if (!categoryCounts[entry.category]) {
        categoryCounts[entry.category] = { total: 0, ready: 0, missing: 0 };
      }

      voiceCounts[entry.voiceId].total += 1;
      categoryCounts[entry.category].total += 1;
      if (entry.isCustom) customAssetsCount += 1;

      if (entry.status === 'ready') {
        readyCount += 1;
        voiceCounts[entry.voiceId].ready += 1;
        categoryCounts[entry.category].ready += 1;
        totalSizeBytes += entry.sizeBytes;
        totalDurationSec += entry.duration;
      } else if (entry.status === 'queued' || entry.status === 'generating') {
        queuedOrGeneratingCount += 1;
      } else if (entry.status === 'failed') {
        failedCount += 1;
        missingCount += 1;
        voiceCounts[entry.voiceId].missing += 1;
        categoryCounts[entry.category].missing += 1;
      } else {
        missingCount += 1;
        voiceCounts[entry.voiceId].missing += 1;
        categoryCounts[entry.category].missing += 1;
      }
    }

    const duplicates = this.detectDuplicates();

    return {
      totalAssets: this.entries.size,
      readyCount,
      missingCount,
      queuedOrGeneratingCount,
      failedCount,
      totalSizeBytes,
      totalDurationSec: Number(totalDurationSec.toFixed(1)),
      duplicateGroupsCount: duplicates.length,
      customAssetsCount,
      voiceCounts,
      categoryCounts,
      bulkJob: { ...this.bulkJob },
    };
  }

  public searchAssets(query: AudioLibrarySearchQuery): {
    total: number;
    items: AudioLibraryManifestEntry[];
    duplicates: DuplicateGroup[];
  } {
    const duplicates = this.detectDuplicates();
    const duplicateIds = new Set<string>();
    for (const grp of duplicates) {
      for (const id of grp.assetIds) duplicateIds.add(id);
    }

    const qLower = (query.q || '').trim().toLowerCase();
    const filtered: AudioLibraryManifestEntry[] = [];

    for (const entry of this.entries.values()) {
      if (query.voiceId && query.voiceId !== 'ALL' && entry.voiceId !== query.voiceId) continue;
      if (query.voiceType && query.voiceType !== 'ALL' && entry.voiceType !== query.voiceType) continue;
      if (query.group && query.group !== 'ALL' && entry.group !== query.group) continue;
      if (query.category && query.category !== 'ALL' && entry.category !== query.category) continue;
      if (query.status && query.status !== 'ALL' && entry.status !== query.status) continue;
      if (query.duplicatesOnly && !duplicateIds.has(entry.assetId)) continue;

      if (qLower) {
        const hay = `${entry.assetId} ${entry.phraseId} ${entry.voiceId} ${entry.category} ${entry.rawText} ${entry.spokenText} ${entry.templatePattern || ''}`.toLowerCase();
        if (!hay.includes(qLower)) continue;
      }

      filtered.push(entry);
    }

    // Sort: ready first or preserve catalog order by phraseId/voiceId
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 120));
    const offset = Math.max(0, Number(query.offset) || 0);

    return {
      total: filtered.length,
      items: filtered.slice(offset, offset + limit),
      duplicates,
    };
  }

  /**
   * Generates or regenerates a single WAV asset using the offline Kokoro-82M worker queue.
   */
  public async generateAsset(
    assetId: string,
    force: boolean = true,
    priority: GenerationPriority = 'high'
  ): Promise<AudioLibraryManifestEntry> {
    const entry = this.entries.get(assetId);
    if (!entry) {
      throw new Error(`Audio library asset "${assetId}" not found`);
    }

    const diskPath = this.resolveDiskPath(entry);
    if (!force && entry.status === 'ready' && fs.existsSync(diskPath)) {
      return entry;
    }

    const existingPromise = this.inFlightAssetPromises.get(assetId);
    if (existingPromise) {
      return existingPromise;
    }

    const profile = this.profileManager.getProfile(entry.voiceId);
    if (!profile) {
      throw new Error(`Voice profile "${entry.voiceId}" not found`);
    }

    const run = (async () => {
      entry.status = 'queued';
      entry.error = null;
      this.saveManifest();

      const cacheKey = `lib_${entry.assetId}_${profile.voiceConfig.kokoroVoiceId}_${profile.speed}`;
      try {
        const { promise } = this.queue.enqueue({
          cacheKey,
          rawText: entry.rawText,
          normalizedText: entry.spokenText,
          profile,
          speed: profile.speed,
          priority,
        });

        entry.status = 'generating';
        const result = await promise;
        const meta = readWavMetadata(result.wavBuffer);
        const quality = analyzeWavQuality(result.wavBuffer);

        fs.mkdirSync(path.dirname(diskPath), { recursive: true });
        fs.writeFileSync(diskPath, result.wavBuffer);

        const now = new Date().toISOString();
        entry.duration = Number(meta.durationSec.toFixed(3));
        entry.sizeBytes = result.wavBuffer.length;
        entry.audioHash = computeSha256Hex(result.wavBuffer);
        entry.quality = quality;
        entry.modelVersion = profile.modelRef;
        entry.kokoroSpeakerId = profile.voiceConfig.kokoroVoiceId;
        entry.status = 'ready';
        entry.error = null;
        if (!entry.createdAt) entry.createdAt = now;
        entry.updatedAt = now;

        this.rebuildRuntimeIndex();
        this.saveManifest();
        return entry;
      } catch (err) {
        entry.status = 'failed';
        entry.error = err instanceof Error ? err.message : String(err);
        entry.updatedAt = new Date().toISOString();
        this.saveManifest();
        throw err;
      } finally {
        this.inFlightAssetPromises.delete(assetId);
      }
    })();

    this.inFlightAssetPromises.set(assetId, run);
    return run;
  }

  /**
   * Creates a user-defined custom phrase asset inside a category for a specific voice profile.
   */
  public createCustomAsset(params: {
    voiceId: string;
    category: AudioLibraryManifestEntry['category'];
    rawText: string;
    phraseId?: string;
    templatePattern?: string;
  }): AudioLibraryManifestEntry {
    const profile = this.profileManager.getProfile(params.voiceId);
    if (!profile) {
      throw new Error(`Voice profile "${params.voiceId}" not found`);
    }
    const rawText = (params.rawText || '').trim();
    if (!rawText) {
      throw new Error('Custom asset phrase text is required');
    }

    const catMeta = AUDIO_LIBRARY_CATEGORY_META[params.category];
    if (!catMeta) {
      throw new Error(`Unknown category "${params.category}"`);
    }

    const phraseId =
      sanitizeIdPart(params.phraseId || '') ||
      `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const assetId = this.buildAssetId(profile.id, phraseId);
    if (this.entries.has(assetId)) {
      throw new Error(`Asset "${assetId}" already exists`);
    }

    const spokenText = formatPhraseForSpeech(rawText) || rawText;
    const relPath = this.buildRelativeFilePath(profile.id, phraseId);
    const publicUrl = `/audio-library/${encodeURIComponent(profile.id)}/${encodeURIComponent(phraseId)}.wav`;

    const entry: AudioLibraryManifestEntry = {
      assetId,
      voiceId: profile.id,
      voiceType: profile.voiceType,
      phraseId,
      group: catMeta.group,
      category: params.category,
      rawText,
      spokenText,
      templatePattern: params.templatePattern,
      filePath: relPath,
      publicUrl,
      duration: 0,
      fileFormat: 'wav',
      sizeBytes: 0,
      status: 'missing',
      createdAt: null,
      updatedAt: new Date().toISOString(),
      modelVersion: profile.modelRef,
      kokoroSpeakerId: profile.voiceConfig.kokoroVoiceId,
      audioHash: null,
      phraseHash: computeSha256Hex(normalizePhraseHashInput(spokenText)),
      quality: null,
      error: null,
      isCustom: true,
    };

    this.entries.set(assetId, entry);
    this.saveManifest();
    return entry;
  }

  /**
   * Deletes the WAV file from disk (marking catalog assets as 'missing', or purging custom assets).
   */
  public deleteAsset(
    assetId: string,
    removeManifestEntry: boolean = false
  ): { deletedFile: boolean; removedEntry: boolean; entry: AudioLibraryManifestEntry | null } {
    const entry = this.entries.get(assetId);
    if (!entry) {
      throw new Error(`Audio library asset "${assetId}" not found`);
    }

    const diskPath = this.resolveDiskPath(entry);
    let deletedFile = false;
    if (fs.existsSync(diskPath)) {
      fs.unlinkSync(diskPath);
      deletedFile = true;
    }

    if (entry.isCustom && removeManifestEntry) {
      this.entries.delete(assetId);
      this.rebuildRuntimeIndex();
      this.saveManifest();
      return { deletedFile, removedEntry: true, entry: null };
    }

    entry.status = 'missing';
    entry.duration = 0;
    entry.sizeBytes = 0;
    entry.audioHash = null;
    entry.quality = null;
    entry.error = null;
    entry.updatedAt = new Date().toISOString();

    this.rebuildRuntimeIndex();
    this.saveManifest();
    return { deletedFile, removedEntry: false, entry };
  }

  /**
   * Deletes orphaned/unused WAV files under libraryDir that are not referenced by the manifest
   * as well as any custom ungenerated entries or inactive profile slots if requested.
   */
  public cleanupUnusedAssets(): {
    removedOrphanFiles: number;
    removedEmptyDirs: number;
    removedInactiveEntries: number;
    freedBytes: number;
  } {
    const validDiskPaths = new Set<string>();
    const activeVoiceIds = new Set(this.profileManager.listProfiles().map(p => p.id));
    let removedInactiveEntries = 0;

    for (const [assetId, entry] of this.entries.entries()) {
      const voiceExists = activeVoiceIds.has(entry.voiceId);
      if (!voiceExists && entry.status !== 'generating') {
        this.entries.delete(assetId);
        removedInactiveEntries += 1;
        continue;
      }
      if (entry.status === 'ready') {
        validDiskPaths.add(this.resolveDiskPath(entry));
      }
    }

    let removedOrphanFiles = 0;
    let removedEmptyDirs = 0;
    let freedBytes = 0;

    if (fs.existsSync(this.libraryDir)) {
      const subdirs = fs.readdirSync(this.libraryDir, { withFileTypes: true });
      for (const dirent of subdirs) {
        const full = path.join(this.libraryDir, dirent.name);
        if (dirent.isDirectory()) {
          const children = fs.readdirSync(full);
          for (const child of children) {
            const childPath = path.join(full, child);
            const stat = fs.statSync(childPath);
            if (stat.isFile() && !validDiskPaths.has(childPath)) {
              freedBytes += stat.size;
              fs.unlinkSync(childPath);
              removedOrphanFiles += 1;
            }
          }
          if (fs.readdirSync(full).length === 0) {
            fs.rmdirSync(full);
            removedEmptyDirs += 1;
          }
        } else if (dirent.isFile() && !validDiskPaths.has(full)) {
          const stat = fs.statSync(full);
          freedBytes += stat.size;
          fs.unlinkSync(full);
          removedOrphanFiles += 1;
        }
      }
    }

    this.rebuildRuntimeIndex();
    this.saveManifest();

    return {
      removedOrphanFiles,
      removedEmptyDirs,
      removedInactiveEntries,
      freedBytes,
    };
  }

  public getBulkJobState(): BulkGenerationJobState {
    return { ...this.bulkJob };
  }

  public cancelBulkGeneration(): BulkGenerationJobState {
    if (this.bulkJob.status === 'running') {
      this.cancelBulkRequested = true;
    }
    return { ...this.bulkJob };
  }

  /**
   * Computes which assetIds belong to a requested bulk generation scope.
   */
  public selectBulkTargets(params: {
    scope: 'missing' | 'core' | 'all' | 'voice' | 'category';
    voiceId?: string;
    category?: AudioLibraryManifestEntry['category'];
    force?: boolean;
  }): AudioLibraryManifestEntry[] {
    const catalogCoreIds = new Set(
      AUDIO_LIBRARY_CATALOG.filter(c => c.corePriority).map(c => c.phraseId)
    );
    const allTargets: AudioLibraryManifestEntry[] = [];

    for (const entry of this.entries.values()) {
      if (params.scope === 'voice' && params.voiceId && entry.voiceId !== params.voiceId) continue;
      if (params.scope === 'category' && params.category && entry.category !== params.category) continue;
      if (params.scope === 'core' && !catalogCoreIds.has(entry.phraseId)) continue;
      if (params.scope === 'missing' && entry.status === 'ready' && fs.existsSync(this.resolveDiskPath(entry))) {
        continue;
      }
      if (!params.force && entry.status === 'ready' && fs.existsSync(this.resolveDiskPath(entry))) {
        continue;
      }
      allTargets.push(entry);
    }

    return allTargets;
  }

  /**
   * Starts non-blocking background bulk WAV generation via the low-priority worker queue
   * so radar simulation and live radio clearances always keep priority.
   */
  public startBulkGeneration(params: {
    scope: 'missing' | 'core' | 'all' | 'voice' | 'category';
    voiceId?: string;
    category?: AudioLibraryManifestEntry['category'];
    force?: boolean;
  }): BulkGenerationJobState {
    if (this.bulkJob.status === 'running') {
      return { ...this.bulkJob };
    }

    const targets = this.selectBulkTargets(params);
    this.cancelBulkRequested = false;

    const jobId = `bulk_${Date.now().toString(36)}`;
    this.bulkJob = {
      jobId,
      status: targets.length === 0 ? 'completed' : 'running',
      scope: `${params.scope}${params.voiceId ? `:${params.voiceId}` : ''}${params.category ? `:${params.category}` : ''}`,
      totalCount: targets.length,
      completedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      currentAssetId: null,
      startedAt: new Date().toISOString(),
      completedAt: targets.length === 0 ? new Date().toISOString() : null,
      lastError: null,
    };

    if (targets.length === 0) {
      return { ...this.bulkJob };
    }

    void (async () => {
      try {
        for (const target of targets) {
          if (this.cancelBulkRequested) {
            this.bulkJob.status = 'cancelled';
            this.bulkJob.currentAssetId = null;
            this.bulkJob.completedAt = new Date().toISOString();
            return;
          }

          if (!params.force && target.status === 'ready' && fs.existsSync(this.resolveDiskPath(target))) {
            this.bulkJob.skippedCount += 1;
            continue;
          }

          this.bulkJob.currentAssetId = target.assetId;
          try {
            await this.generateAsset(target.assetId, Boolean(params.force), 'low');
            this.bulkJob.completedCount += 1;
          } catch (err) {
            this.bulkJob.failedCount += 1;
            this.bulkJob.lastError = err instanceof Error ? err.message : String(err);
          }
        }

        this.bulkJob.status = 'completed';
        this.bulkJob.currentAssetId = null;
        this.bulkJob.completedAt = new Date().toISOString();
      } catch (err) {
        this.bulkJob.status = 'failed';
        this.bulkJob.currentAssetId = null;
        this.bulkJob.completedAt = new Date().toISOString();
        this.bulkJob.lastError = err instanceof Error ? err.message : String(err);
      }
    })();

    return { ...this.bulkJob };
  }
}
