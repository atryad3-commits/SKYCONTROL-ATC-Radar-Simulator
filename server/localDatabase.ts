/**
 * SKYCONTROL - Local Audio Database Schema Migration & Global Settings Store
 * Applies versioned offline migrations in local-data/ so voice profiles, library manifests,
 * and Audio Studio global settings upgrade cleanly and survive server restarts.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_GLOBAL_AUDIO_SETTINGS,
  DatabaseMigrationRecord,
  GlobalAudioSettings,
  LocalDatabaseState,
} from '../shared/audioStudioTypes';
import { DEFAULT_VOICE_PROFILES, MAX_VOICE_PROFILES, VoiceProfile } from '../shared/ttsTypes';
import { VHF_RADIO_PRESETS, VhfQualityPresetId } from '../src/audio/vhfRadioDsp';

export const CURRENT_AUDIO_DB_SCHEMA_VERSION = 3;

export class LocalAudioDatabase {
  private readonly dataDir: string;
  private readonly dbStatePath: string;
  private readonly settingsPath: string;
  private readonly profilesPath: string;
  private readonly manifestPath: string;

  private dbState: LocalDatabaseState = {
    schemaVersion: 0,
    updatedAt: new Date().toISOString(),
    migrations: [],
  };
  private settings: GlobalAudioSettings = {
    ...DEFAULT_GLOBAL_AUDIO_SETTINGS,
    defaultVoices: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS.defaultVoices },
  };

  constructor(dataDir: string = path.resolve(process.cwd(), 'local-data')) {
    this.dataDir = dataDir;
    this.dbStatePath = path.join(this.dataDir, 'audio-studio-db.json');
    this.settingsPath = path.join(this.dataDir, 'audio-settings.json');
    this.profilesPath = path.join(this.dataDir, 'voice-profiles.json');
    this.manifestPath = path.join(this.dataDir, 'audio-library-manifest.json');

    fs.mkdirSync(this.dataDir, { recursive: true });
    this.runMigrations();
    this.loadSettings();
  }

  private readJsonSafe<T>(filePath: string): T | null {
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    } catch {
      return null;
    }
  }

  private writeJsonAtomic(filePath: string, data: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  }

  public runMigrations(): LocalDatabaseState {
    const existingState = this.readJsonSafe<LocalDatabaseState>(this.dbStatePath);
    if (existingState && Array.isArray(existingState.migrations)) {
      this.dbState = existingState;
    }

    const appliedVersions = new Set(this.dbState.migrations.map(m => m.version));
    const recordMigration = (version: number, id: string, description: string) => {
      const rec: DatabaseMigrationRecord = {
        version,
        id,
        description,
        appliedAt: new Date().toISOString(),
      };
      this.dbState.migrations.push(rec);
      this.dbState.schemaVersion = Math.max(this.dbState.schemaVersion, version);
      this.dbState.updatedAt = rec.appliedAt;
    };

    // Migration 001: Ensure local voice-profiles.json exists and stays <= MAX_VOICE_PROFILES
    if (!appliedVersions.has(1)) {
      const existingProfiles = this.readJsonSafe<VoiceProfile[]>(this.profilesPath);
      if (!Array.isArray(existingProfiles) || existingProfiles.length === 0) {
        this.writeJsonAtomic(this.profilesPath, DEFAULT_VOICE_PROFILES);
      } else if (existingProfiles.length > MAX_VOICE_PROFILES) {
        this.writeJsonAtomic(this.profilesPath, existingProfiles.slice(0, MAX_VOICE_PROFILES));
      }
      recordMigration(
        1,
        '001_init_voice_profiles',
        'Initialize & enforce 15-profile schema bounds on voice-profiles.json'
      );
    }

    // Migration 002: Ensure audio-library-manifest.json carries schema metadata safely
    if (!appliedVersions.has(2)) {
      const manifest = this.readJsonSafe<{
        version?: number;
        updatedAt?: string;
        entries?: Record<string, unknown>;
      }>(this.manifestPath);
      if (manifest && typeof manifest === 'object') {
        if ((manifest.version ?? 1) < 2) {
          manifest.version = 2;
          manifest.updatedAt = new Date().toISOString();
          this.writeJsonAtomic(this.manifestPath, manifest);
        }
      }
      recordMigration(
        2,
        '002_upgrade_audio_library_manifest',
        'Upgrade audio-library-manifest.json metadata envelope to schema v2 without discarding WAVs'
      );
    }

    // Migration 003: Initialize persistent global Audio Studio settings
    if (!appliedVersions.has(3)) {
      const existingSettings = this.readJsonSafe<Partial<GlobalAudioSettings>>(this.settingsPath);
      const merged = this.sanitizeSettings(existingSettings || {});
      this.writeJsonAtomic(this.settingsPath, merged);
      recordMigration(
        3,
        '003_init_global_audio_settings',
        'Create persistent global Audio Studio settings (default voices, radio quality preset, cache limit, background gen)'
      );
    }

    this.writeJsonAtomic(this.dbStatePath, this.dbState);
    return this.getDbState();
  }

  private sanitizeSettings(patch: Partial<GlobalAudioSettings>): GlobalAudioSettings {
    const validPreset =
      patch.defaultRadioPreset &&
      Object.prototype.hasOwnProperty.call(VHF_RADIO_PRESETS, patch.defaultRadioPreset)
        ? (patch.defaultRadioPreset as Exclude<VhfQualityPresetId, 'custom'>)
        : this.settings.defaultRadioPreset;

    return {
      audioEnabled:
        typeof patch.audioEnabled === 'boolean'
          ? patch.audioEnabled
          : this.settings.audioEnabled,
      masterVolume:
        typeof patch.masterVolume === 'number' && Number.isFinite(patch.masterVolume)
          ? Math.max(0, Math.min(1, Number(patch.masterVolume.toFixed(2))))
          : this.settings.masterVolume,
      ttsEnabled:
        typeof patch.ttsEnabled === 'boolean' ? patch.ttsEnabled : this.settings.ttsEnabled,
      backgroundGenerationEnabled:
        typeof patch.backgroundGenerationEnabled === 'boolean'
          ? patch.backgroundGenerationEnabled
          : this.settings.backgroundGenerationEnabled,
      prewarmReadbacksEnabled:
        typeof patch.prewarmReadbacksEnabled === 'boolean'
          ? patch.prewarmReadbacksEnabled
          : this.settings.prewarmReadbacksEnabled,
      defaultVoices: {
        tower: patch.defaultVoices?.tower || this.settings.defaultVoices.tower,
        approach: patch.defaultVoices?.approach || this.settings.defaultVoices.approach,
        ground: patch.defaultVoices?.ground || this.settings.defaultVoices.ground,
        pilotStrategy:
          patch.defaultVoices?.pilotStrategy === 'round_robin'
            ? 'round_robin'
            : patch.defaultVoices?.pilotStrategy === 'airline_matched'
              ? 'airline_matched'
              : this.settings.defaultVoices.pilotStrategy,
      },
      defaultRadioPreset: validPreset,
      maxCacheSizeMb:
        typeof patch.maxCacheSizeMb === 'number' && Number.isFinite(patch.maxCacheSizeMb)
          ? Math.max(50, Math.min(2048, Math.round(patch.maxCacheSizeMb)))
          : this.settings.maxCacheSizeMb,
      updatedAt: new Date().toISOString(),
    };
  }

  private loadSettings(): void {
    const raw = this.readJsonSafe<Partial<GlobalAudioSettings>>(this.settingsPath);
    if (raw) {
      this.settings = this.sanitizeSettings(raw);
    }
  }

  public getSettings(): GlobalAudioSettings {
    return {
      ...this.settings,
      defaultVoices: { ...this.settings.defaultVoices },
    };
  }

  public updateSettings(patch: Partial<GlobalAudioSettings>): GlobalAudioSettings {
    this.settings = this.sanitizeSettings(patch);
    this.writeJsonAtomic(this.settingsPath, this.settings);
    return this.getSettings();
  }

  public getDbState(): LocalDatabaseState {
    return {
      ...this.dbState,
      migrations: this.dbState.migrations.map(m => ({ ...m })),
    };
  }
}
