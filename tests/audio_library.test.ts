import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AUDIO_LIBRARY_CATALOG,
  AUDIO_LIBRARY_CATEGORY_META,
  getCatalogCategories,
} from '../shared/audioLibraryCatalog';
import { AudioLibraryCategory } from '../shared/audioLibraryTypes';
import { MAX_VOICE_PROFILES } from '../shared/ttsTypes';
import { AudioLibraryManager } from '../server/audioLibraryManager';
import { VoiceProfileManager } from '../server/voiceProfileManager';
import { AudioGenerationQueue } from '../server/audioGenerationQueue';
import { encodeWavPcm16 } from '../server/wavEncoder';

function makeSineWav(freqHz: number, durationSec: number = 0.6, sampleRate: number = 24000): Buffer {
  const numSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * 0.4;
  }
  return encodeWavPcm16(samples, sampleRate);
}

describe('Pre-Generated Offline Audio Library Catalog & Manager', () => {
  let tmpRoot: string;
  let profileManager: VoiceProfileManager;
  let libraryManager: AudioLibraryManager;
  let synthFreqCounter = 440;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skycontrol-audiolib-'));
    const dataDir = path.join(tmpRoot, 'local-data');
    const libraryDir = path.join(tmpRoot, 'public/audio-library');

    profileManager = new VoiceProfileManager(dataDir);

    // Lightweight stub queue yielding unique, valid 24kHz PCM-16 WAV buffers per phrase/voice
    const mockQueue = {
      enqueue: (opts: { rawText: string }) => {
        synthFreqCounter += 17;
        const freq = synthFreqCounter;
        const wavBuffer = makeSineWav(freq, 0.45 + (opts.rawText.length % 5) * 0.1);
        return {
          job: { jobId: `mock_${freq}`, status: 'completed' },
          promise: Promise.resolve({
            wavBuffer,
            sampleRate: 24000,
            durationSec: 0.45,
            generationMs: 12,
          }),
        };
      },
    } as unknown as AudioGenerationQueue;

    libraryManager = new AudioLibraryManager({
      profileManager,
      queue: mockQueue,
      dataDir,
      libraryDir,
      rootDir: tmpRoot,
    });
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('includes all 14 standard ATC categories, 8 aviation number categories, 26 NATO letters, and communication templates', () => {
    const categories = getCatalogCategories();
    expect(categories).toHaveLength(24);

    const requiredAtcCategories: AudioLibraryCategory[] = [
      'initial_contact',
      'frequency_change',
      'clearance_delivery',
      'taxi_instructions',
      'takeoff_clearance',
      'landing_clearance',
      'holding_instructions',
      'traffic_information',
      'altitude_instructions',
      'heading_instructions',
      'speed_instructions',
      'readback',
      'go_around',
      'emergency_communications',
    ];
    for (const cat of requiredAtcCategories) {
      expect(AUDIO_LIBRARY_CATALOG.some(i => i.category === cat)).toBe(true);
      expect(AUDIO_LIBRARY_CATEGORY_META[cat].group).toBe('A_ATC_PHRASES');
    }

    const requiredNumberCategories: AudioLibraryCategory[] = [
      'numbers_digits',
      'numbers_flight',
      'numbers_runway',
      'numbers_altitude',
      'numbers_heading',
      'numbers_speed',
      'numbers_frequency',
      'numbers_squawk',
    ];
    for (const cat of requiredNumberCategories) {
      expect(AUDIO_LIBRARY_CATALOG.some(i => i.category === cat)).toBe(true);
      expect(AUDIO_LIBRARY_CATEGORY_META[cat].group).toBe('B_AVIATION_NUMBERS');
    }

    // Verify all digits 0-9 present
    for (let d = 0; d <= 9; d++) {
      expect(AUDIO_LIBRARY_CATALOG.some(i => i.phraseId === `num_digit_${d}`)).toBe(true);
    }

    // Verify all 26 NATO letters Alpha-Zulu present
    const natoLetters = AUDIO_LIBRARY_CATALOG.filter(
      i => i.category === 'nato_alphabet' && i.phraseId !== 'nato_full_alphabet_drill'
    );
    expect(natoLetters).toHaveLength(26);
    expect(natoLetters[0].rawText).toBe('Alpha');
    expect(natoLetters[25].rawText).toBe('Zulu');

    // Verify communication templates contain slot patterns & complete sentences
    const templates = AUDIO_LIBRARY_CATALOG.filter(i => i.category === 'comm_templates');
    expect(templates.length).toBeGreaterThanOrEqual(5);
    expect(templates.every(t => Boolean(t.templatePattern))).toBe(true);
  });

  it('seeds the manifest across all 15 voice profiles with searchable records', () => {
    const profiles = profileManager.listProfiles();
    expect(profiles).toHaveLength(MAX_VOICE_PROFILES);

    const summary = libraryManager.getSummary();
    expect(summary.totalAssets).toBe(AUDIO_LIBRARY_CATALOG.length * MAX_VOICE_PROFILES);
    expect(Object.keys(summary.voiceCounts)).toHaveLength(MAX_VOICE_PROFILES);

    const res = libraryManager.searchAssets({
      q: 'cleared for takeoff',
      voiceId: 'tower_charon',
      category: 'takeoff_clearance',
    });
    expect(res.total).toBe(1);
    expect(res.items[0].assetId).toBe('tower_charon__atc_takeoff_cleared');
  });

  it('generates individual WAV assets with complete manifest & acoustic quality metadata and supports O(1) runtime lookup', async () => {
    const assetId = 'tower_charon__atc_takeoff_cleared';
    const entry = await libraryManager.generateAsset(assetId, true);

    expect(entry.status).toBe('ready');
    expect(entry.fileFormat).toBe('wav');
    expect(entry.voiceId).toBe('tower_charon');
    expect(entry.phraseId).toBe('atc_takeoff_cleared');
    expect(entry.duration).toBeGreaterThan(0.3);
    expect(entry.createdAt).toBeTruthy();
    expect(entry.modelVersion).toBe('Kokoro-82M-v1.0-ONNX');
    expect(entry.audioHash).toHaveLength(64);
    expect(entry.quality).not.toBeNull();
    expect(entry.quality?.sampleRate).toBe(24000);
    expect(entry.quality?.channels).toBe(1);
    expect(entry.quality?.bitsPerSample).toBe(16);
    expect(entry.quality?.bitrateKbps).toBe(384);
    expect(entry.quality?.clippingDetected).toBe(false);

    // Runtime exact lookup matches normalized ICAO speech without calling worker again
    const match = libraryManager.matchReadyAsset(
      'tower_charon',
      'Wind 260 degrees at 14 knots, runway 27L, cleared for takeoff.'
    );
    expect(match).not.toBeNull();
    expect(match?.entry.assetId).toBe(assetId);
    expect(match?.wavBuffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
  });

  it('detects missing and corrupted WAV files during integrity scans and supports regeneration', async () => {
    const assetId = 'pilot_thomas__pilot_rb_wilco_roger';
    const readyEntry = await libraryManager.generateAsset(assetId, true);
    expect(readyEntry.status).toBe('ready');

    // Simulate missing file on disk
    const diskPath = path.resolve(tmpRoot, readyEntry.filePath);
    fs.unlinkSync(diskPath);

    const reportAfterDelete = libraryManager.scanIntegrity();
    expect(reportAfterDelete.missingAssetIds).toContain(assetId);
    expect(libraryManager.getAsset(assetId)?.status).toBe('missing');

    // Regenerate restores ready state cleanly
    const regenerated = await libraryManager.generateAsset(assetId, true);
    expect(regenerated.status).toBe('ready');
    expect(fs.existsSync(diskPath)).toBe(true);
  });

  it('detects both semantic phrase duplicates and binary WAV payload duplicates', async () => {
    // 1. Semantic phrase collision under same voice
    const customEntry = libraryManager.createCustomAsset({
      voiceId: 'tower_charon',
      category: 'takeoff_clearance',
      phraseId: 'dup_takeoff_test',
      rawText: 'Wind 260 degrees at 14 knots, runway 27L, cleared for takeoff.',
    });
    expect(customEntry.isCustom).toBe(true);

    // 2. Binary identical WAV payload across two assets
    const entryA = await libraryManager.generateAsset('tower_fenrir__nato_alpha', true);
    const entryB = await libraryManager.generateAsset('tower_kore__nato_bravo', true);
    fs.copyFileSync(
      path.resolve(tmpRoot, entryA.filePath),
      path.resolve(tmpRoot, entryB.filePath)
    );

    const scan = libraryManager.scanIntegrity();
    const semanticDup = scan.duplicates.find(d => d.type === 'semantic_phrase');
    const binaryDup = scan.duplicates.find(d => d.type === 'binary_audio');

    expect(semanticDup).toBeDefined();
    expect(semanticDup?.assetIds).toContain('tower_charon__atc_takeoff_cleared');
    expect(semanticDup?.assetIds).toContain(customEntry.assetId);

    expect(binaryDup).toBeDefined();
    expect(binaryDup?.assetIds).toContain(entryA.assetId);
    expect(binaryDup?.assetIds).toContain(entryB.assetId);

    // Clean up custom duplicate
    const delOutcome = libraryManager.deleteAsset(customEntry.assetId, true);
    expect(delOutcome.removedEntry).toBe(true);
    expect(libraryManager.getAsset(customEntry.assetId)).toBeUndefined();
  });

  it('supports bulk generation cleanly across scoped subsets', async () => {
    const bulkState = libraryManager.startBulkGeneration({
      scope: 'category',
      category: 'numbers_squawk',
      force: true,
    });
    expect(bulkState.totalCount).toBe(3 * MAX_VOICE_PROFILES);

    // Wait briefly for synchronous mock queue promises to flush
    for (let i = 0; i < 40; i++) {
      if (libraryManager.getBulkJobState().status === 'completed') break;
      await new Promise(r => setTimeout(r, 25));
    }

    const finalJob = libraryManager.getBulkJobState();
    expect(finalJob.status).toBe('completed');
    expect(finalJob.completedCount).toBe(3 * MAX_VOICE_PROFILES);
  });
});
