/**
 * SKYCONTROL - Frontend Client for Pre-Generated Offline Audio Library
 * Communicates with local Express endpoints (/api/library/*) on port 3000 (100% offline).
 */

import {
  AudioLibraryCategory,
  AudioLibraryManifestEntry,
  AudioLibrarySearchQuery,
  AudioLibrarySummary,
  BulkGenerationJobState,
  DuplicateGroup,
  IntegrityScanReport,
} from '../../shared/audioLibraryTypes';

export interface SearchAssetsResponse {
  total: number;
  items: AudioLibraryManifestEntry[];
  duplicates: DuplicateGroup[];
}

export class AudioLibraryClient {
  public async fetchSummary(): Promise<AudioLibrarySummary> {
    const res = await fetch('/api/library/summary');
    if (!res.ok) {
      throw new Error(`Failed loading audio library summary (${res.status})`);
    }
    return (await res.json()) as AudioLibrarySummary;
  }

  public async searchAssets(query: AudioLibrarySearchQuery): Promise<SearchAssetsResponse> {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.voiceId && query.voiceId !== 'ALL') params.set('voiceId', query.voiceId);
    if (query.voiceType && query.voiceType !== 'ALL') params.set('voiceType', query.voiceType);
    if (query.group && query.group !== 'ALL') params.set('group', query.group);
    if (query.category && query.category !== 'ALL') params.set('category', query.category);
    if (query.status && query.status !== 'ALL') params.set('status', query.status);
    if (query.duplicatesOnly) params.set('duplicatesOnly', '1');
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.offset !== undefined) params.set('offset', String(query.offset));

    const res = await fetch(`/api/library/assets?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Failed searching audio library (${res.status})`);
    }
    return (await res.json()) as SearchAssetsResponse;
  }

  public async createCustomAsset(params: {
    voiceId: string;
    category: AudioLibraryCategory;
    rawText: string;
    phraseId?: string;
    templatePattern?: string;
  }): Promise<AudioLibraryManifestEntry> {
    const res = await fetch('/api/library/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `Failed creating asset (${res.status})`);
    }
    return data.entry as AudioLibraryManifestEntry;
  }

  public async generateAsset(
    assetId: string,
    force: boolean = true
  ): Promise<AudioLibraryManifestEntry> {
    const res = await fetch(`/api/library/assets/${encodeURIComponent(assetId)}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `Failed generating asset (${res.status})`);
    }
    return data.entry as AudioLibraryManifestEntry;
  }

  public async deleteAsset(assetId: string, purge: boolean = false): Promise<void> {
    const res = await fetch(
      `/api/library/assets/${encodeURIComponent(assetId)}${purge ? '?purge=1' : ''}`,
      { method: 'DELETE' }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `Failed deleting asset (${res.status})`);
    }
  }

  public async scanIntegrity(): Promise<IntegrityScanReport> {
    const res = await fetch('/api/library/scan', { method: 'POST' });
    if (!res.ok) {
      throw new Error(`Integrity scan failed (${res.status})`);
    }
    return (await res.json()) as IntegrityScanReport;
  }

  public async startBulkGeneration(params: {
    scope: 'missing' | 'core' | 'all' | 'voice' | 'category';
    voiceId?: string;
    category?: AudioLibraryCategory;
    force?: boolean;
  }): Promise<BulkGenerationJobState> {
    const res = await fetch('/api/library/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `Bulk generation failed (${res.status})`);
    }
    return data.bulkJob as BulkGenerationJobState;
  }

  public async cancelBulkGeneration(): Promise<BulkGenerationJobState> {
    const res = await fetch('/api/library/bulk/cancel', { method: 'POST' });
    if (!res.ok) {
      throw new Error(`Failed cancelling bulk job (${res.status})`);
    }
    const data = await res.json();
    return data.bulkJob as BulkGenerationJobState;
  }

  public async fetchAssetAudioBytes(assetId: string): Promise<ArrayBuffer> {
    const res = await fetch(`/api/library/assets/${encodeURIComponent(assetId)}/audio?t=${Date.now()}`);
    if (!res.ok) {
      throw new Error(`Audio asset missing or unreadable (${res.status})`);
    }
    return res.arrayBuffer();
  }
}

export const audioLibraryClient = new AudioLibraryClient();
