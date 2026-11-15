/**
 * SKYCONTROL - Pre-Generated Audio Library Shared Contracts
 * Defines structured categories (A: ATC Phrases, B: Numbers, C: NATO A-Z, D: Templates),
 * manifest schema with asset/voice/phrase/quality metadata, duplicate & integrity reports,
 * and bulk background generation state.
 */

import { VoiceType } from './ttsTypes';

export type AudioLibraryGroup =
  | 'A_ATC_PHRASES'
  | 'B_AVIATION_NUMBERS'
  | 'C_AVIATION_ALPHABET'
  | 'D_COMM_TEMPLATES';

export type AudioLibraryCategory =
  // A. Standard ATC Phrases (14 categories)
  | 'initial_contact'
  | 'frequency_change'
  | 'clearance_delivery'
  | 'taxi_instructions'
  | 'takeoff_clearance'
  | 'landing_clearance'
  | 'holding_instructions'
  | 'traffic_information'
  | 'altitude_instructions'
  | 'heading_instructions'
  | 'speed_instructions'
  | 'readback'
  | 'go_around'
  | 'emergency_communications'
  // B. Aviation Numbers (8 categories)
  | 'numbers_digits'
  | 'numbers_flight'
  | 'numbers_runway'
  | 'numbers_altitude'
  | 'numbers_heading'
  | 'numbers_speed'
  | 'numbers_frequency'
  | 'numbers_squawk'
  // C. Aviation Alphabet
  | 'nato_alphabet'
  // D. Common Communication Templates
  | 'comm_templates';

export type AudioLibraryAssetStatus =
  | 'ready'
  | 'pending'
  | 'queued'
  | 'generating'
  | 'missing'
  | 'failed';

export interface AudioQualityInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  bitrateKbps: number;
  rmsDb: number;
  peakDb: number;
  clippingDetected: boolean;
  snrEstimateDb: number;
}

export interface AudioLibraryCatalogItem {
  phraseId: string;
  group: AudioLibraryGroup;
  category: AudioLibraryCategory;
  rawText: string;
  spokenText?: string;
  templatePattern?: string;
  /** Marks high-frequency core phrases prioritized for pre-generation across voices */
  corePriority: boolean;
  /** Preferred role hint for catalog browsing & matrix scheduling */
  recommendedRole: 'ATC' | 'PILOT' | 'BOTH';
}

export interface AudioLibraryManifestEntry {
  assetId: string;
  voiceId: string;
  voiceType: VoiceType;
  phraseId: string;
  group: AudioLibraryGroup;
  category: AudioLibraryCategory;
  rawText: string;
  spokenText: string;
  templatePattern?: string;
  filePath: string;
  publicUrl: string;
  duration: number;
  fileFormat: 'wav';
  sizeBytes: number;
  status: AudioLibraryAssetStatus;
  createdAt: string | null;
  updatedAt: string | null;
  modelVersion: string;
  kokoroSpeakerId: string;
  audioHash: string | null;
  phraseHash: string;
  quality: AudioQualityInfo | null;
  error: string | null;
  isCustom?: boolean;
}

export interface DuplicateGroup {
  type: 'binary_audio' | 'semantic_phrase';
  key: string;
  reason: string;
  assetIds: string[];
}

export interface IntegrityScanReport {
  scannedAt: string;
  totalAssets: number;
  readyCount: number;
  missingCount: number;
  corruptCount: number;
  failedCount: number;
  missingAssetIds: string[];
  corruptAssetIds: string[];
  duplicates: DuplicateGroup[];
}

export interface BulkGenerationJobState {
  jobId: string | null;
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'failed';
  scope: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  currentAssetId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
}

export interface AudioLibrarySummary {
  totalAssets: number;
  readyCount: number;
  missingCount: number;
  queuedOrGeneratingCount: number;
  failedCount: number;
  totalSizeBytes: number;
  totalDurationSec: number;
  duplicateGroupsCount: number;
  customAssetsCount: number;
  voiceCounts: Record<string, { total: number; ready: number; missing: number }>;
  categoryCounts: Record<string, { total: number; ready: number; missing: number }>;
  bulkJob: BulkGenerationJobState;
}

export interface AudioLibrarySearchQuery {
  q?: string;
  voiceId?: string;
  voiceType?: VoiceType | 'ALL';
  group?: AudioLibraryGroup | 'ALL';
  category?: AudioLibraryCategory | 'ALL';
  status?: AudioLibraryAssetStatus | 'ALL';
  duplicatesOnly?: boolean;
  limit?: number;
  offset?: number;
}
