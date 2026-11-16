/**
 * SKYCONTROL - Unified Audio Studio, Global Settings, Hardware Telemetry & DB Migration Contracts
 */

import { VhfQualityPresetId } from '../src/audio/vhfRadioDsp';

export interface GlobalAudioSettings {
  audioEnabled: boolean;
  masterVolume: number;
  ttsEnabled: boolean;
  backgroundGenerationEnabled: boolean;
  prewarmReadbacksEnabled: boolean;
  defaultVoices: {
    tower: string;
    approach: string;
    ground: string;
    pilotStrategy: 'airline_matched' | 'round_robin';
  };
  defaultRadioPreset: Exclude<VhfQualityPresetId, 'custom'>;
  maxCacheSizeMb: number;
  updatedAt: string;
}

export const DEFAULT_GLOBAL_AUDIO_SETTINGS: GlobalAudioSettings = {
  audioEnabled: true,
  masterVolume: 0.85,
  ttsEnabled: true,
  backgroundGenerationEnabled: true,
  prewarmReadbacksEnabled: true,
  defaultVoices: {
    tower: 'charon',
    approach: 'approach_zephyr',
    ground: 'ground_puck',
    pilotStrategy: 'airline_matched',
  },
  defaultRadioPreset: 'normal_aviation',
  maxCacheSizeMb: 250,
  updatedAt: '2026-11-15T00:00:00.000Z',
};

export interface HardwareAccelerationTelemetry {
  cpuModel: string;
  cpuCores: number;
  cpuUsagePercent: number;
  ramTotalBytes: number;
  ramUsedBytes: number;
  processRssBytes: number;
  processHeapUsedBytes: number;
  executionProvider: 'cpu' | 'cuda' | 'dml' | 'coreml';
  supportedProviders: string[];
  gpuAvailable: boolean;
  gpuName: string | null;
  gpuUtilizationPercent: number | null;
  gpuMemoryUsedMb: number | null;
  gpuMemoryTotalMb: number | null;
  note: string;
}

export interface AudioDiagnosticsLatency {
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  sampleCount: number;
  recentMs: number[];
}

export interface AudioDiagnosticsErrorEntry {
  timestamp: string;
  source: 'worker' | 'queue' | 'library' | 'model' | 'playback';
  message: string;
}

export interface AudioDiagnosticsReport {
  generatedAt: string;
  latency: AudioDiagnosticsLatency;
  cache: {
    libraryHits: number;
    diskHits: number;
    misses: number;
    hitRatePercent: number;
  };
  assets: {
    totalMatrix: number;
    readyCount: number;
    missingCount: number;
    failedCount: number;
    cacheEntries: number;
    librarySizeBytes: number;
    cacheSizeBytes: number;
    modelSizeBytes: number;
    samplesSizeBytes: number;
    totalStorageBytes: number;
  };
  errors: {
    ttsFailedCount: number;
    workerRestarts: number;
    recentErrors: AudioDiagnosticsErrorEntry[];
  };
  hardware: HardwareAccelerationTelemetry;
}

export interface DatabaseMigrationRecord {
  version: number;
  id: string;
  description: string;
  appliedAt: string;
}

export interface LocalDatabaseState {
  schemaVersion: number;
  updatedAt: string;
  migrations: DatabaseMigrationRecord[];
}
