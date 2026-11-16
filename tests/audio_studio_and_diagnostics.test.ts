/**
 * SKYCONTROL - Comprehensive Verification Suite for Audio Studio, Local DB Migrations,
 * Diagnostics Telemetry, Cleanup, Error Recovery, and Long-Running Simulation Stability
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalAudioDatabase, CURRENT_AUDIO_DB_SCHEMA_VERSION } from '../server/localDatabase';
import { LocalTtsService } from '../server/localTtsService';
import { collectHardwareTelemetry } from '../server/hardwareTelemetry';
import { VoiceAssignmentRegistry } from '../src/audio/voiceAssignmentRegistry';
import { DEFAULT_VOICE_PROFILES, MAX_VOICE_PROFILES } from '../shared/ttsTypes';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '../shared/audioStudioTypes';
import { stepAircraftPhysics } from '../src/engine/physics';
import { detectConflicts } from '../src/engine/conflict';
import { generateInboundFlight } from '../src/engine/trafficGenerator';
import { resolveConfiguredAirport } from '../src/airports/airportsRegistry';

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function buildMinimalWav(durationSamples = 2400, sampleRate = 24000): Buffer {
  const dataSize = durationSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < durationSamples; i++) {
    const sample = Math.round(Math.sin(i * 0.08) * 12000);
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  return buf;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('LocalAudioDatabase Schema Migrations & Persistence Across Restarts', () => {
  it('runs all v1-v3 migrations idempotently and persists global settings across restarts', () => {
    const dataDir = createTempDir('skycontrol-db-');

    const db1 = new LocalAudioDatabase(dataDir);
    const state1 = db1.getDbState();
    expect(state1.schemaVersion).toBe(CURRENT_AUDIO_DB_SCHEMA_VERSION);
    expect(state1.migrations.map(m => m.id)).toEqual([
      '001_init_voice_profiles',
      '002_upgrade_audio_library_manifest',
      '003_init_global_audio_settings',
    ]);
    expect(db1.getSettings()).toMatchObject({
      audioEnabled: DEFAULT_GLOBAL_AUDIO_SETTINGS.audioEnabled,
      defaultRadioPreset: 'normal_aviation',
    });

    const updated = db1.updateSettings({
      audioEnabled: false,
      masterVolume: 0.45,
      backgroundGenerationEnabled: false,
      defaultRadioPreset: 'weak_signal',
      maxCacheSizeMb: 400,
      defaultVoices: {
        tower: 'tower_kore',
        approach: 'approach_zephyr',
        ground: 'ground_puck',
        pilotStrategy: 'round_robin',
      },
    });
    expect(updated.masterVolume).toBe(0.45);
    expect(updated.defaultVoices.tower).toBe('tower_kore');

    // Simulated application restart
    const db2 = new LocalAudioDatabase(dataDir);
    const state2 = db2.getDbState();
    expect(state2.migrations.length).toBe(3); // Idempotent — no duplicate migration rows
    expect(db2.getSettings()).toMatchObject({
      audioEnabled: false,
      masterVolume: 0.45,
      backgroundGenerationEnabled: false,
      defaultRadioPreset: 'weak_signal',
      maxCacheSizeMb: 400,
      defaultVoices: {
        tower: 'tower_kore',
        approach: 'approach_zephyr',
        ground: 'ground_puck',
        pilotStrategy: 'round_robin',
      },
    });
  });

  it('upgrades a legacy v1 manifest safely during migration v2 without losing entries', () => {
    const dataDir = createTempDir('skycontrol-db-mig-');
    fs.writeFileSync(
      path.join(dataDir, 'audio-library-manifest.json'),
      JSON.stringify({
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        entries: {
          tower_charon__atc_takeoff_cleared: { assetId: 'tower_charon__atc_takeoff_cleared' },
        },
      }),
      'utf8'
    );

    const db = new LocalAudioDatabase(dataDir);
    expect(db.getDbState().schemaVersion).toBe(CURRENT_AUDIO_DB_SCHEMA_VERSION);
    const migratedManifest = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'audio-library-manifest.json'), 'utf8')
    );
    expect(migratedManifest.version).toBe(2);
    expect(migratedManifest.entries.tower_charon__atc_takeoff_cleared).toBeDefined();
  });
});

describe('LocalTtsService Diagnostics, Cleanup, Offline & Background Controls', () => {
  it('deletes orphaned unused WAV files while preserving tracked library assets', async () => {
    const root = createTempDir('skycontrol-cleanup-');
    const dataDir = path.join(root, 'data');
    const modelsDir = path.join(root, 'models');
    const samplesDir = path.join(root, 'samples');
    const libraryDir = path.join(root, 'library');

    const svc = new LocalTtsService({ dataDir, modelsDir, samplesDir, libraryDir });

    // Write a valid tracked WAV referenced by manifest
    const validEntry = svc.libraryManager.getAsset('tower_charon__atc_takeoff_cleared')!;
    const validAbsPath = path.join(libraryDir, 'tower_charon', 'atc_takeoff_cleared.wav');
    fs.mkdirSync(path.dirname(validAbsPath), { recursive: true });
    fs.writeFileSync(validAbsPath, buildMinimalWav());
    validEntry.status = 'ready';

    // Write an orphaned WAV not tracked in manifest
    const orphanPath = path.join(libraryDir, 'orphan_voice', 'stale_phrase.wav');
    fs.mkdirSync(path.dirname(orphanPath), { recursive: true });
    fs.writeFileSync(orphanPath, buildMinimalWav(4800));

    const cleanup = svc.libraryManager.cleanupUnusedAssets();
    expect(cleanup.removedOrphanFiles).toBe(1);
    expect(cleanup.freedBytes).toBeGreaterThan(4000);
    expect(fs.existsSync(orphanPath)).toBe(false);
    expect(fs.existsSync(validAbsPath)).toBe(true);

    await svc.queue.shutdown();
  });

  it('respects backgroundGenerationEnabled=false and exposes accurate diagnostics & offline telemetry', async () => {
    const root = createTempDir('skycontrol-diag-');
    const svc = new LocalTtsService({
      dataDir: path.join(root, 'data'),
      modelsDir: path.join(root, 'models'),
      samplesDir: path.join(root, 'samples'),
      libraryDir: path.join(root, 'library'),
    });

    const status = svc.getStatus();
    expect(status.offlineOnly).toBe(true);
    expect(status.profilesCount).toBe(MAX_VOICE_PROFILES);

    svc.updateAudioSettings({ backgroundGenerationEnabled: false });
    const bgRes = svc.enqueueBackgroundJob({
      text: 'Speedbird 452, maintain 4,000 feet',
      voiceId: 'tower_charon',
      voiceType: 'TOWER',
      priority: 'low',
    });
    expect(bgRes.skippedDueToConfig).toBe(true);
    expect(bgRes.job).toBeNull();

    svc.recordError('queue', 'Simulated inference timeout');
    const diag = await svc.getDiagnosticsReport();
    expect(diag.assets.totalMatrix).toBeGreaterThan(0);
    expect(diag.errors.recentErrors.length).toBeGreaterThan(0);
    expect(diag.hardware.cpuCores).toBeGreaterThan(0);
    expect(diag.hardware.ramTotalBytes).toBeGreaterThan(0);
    expect(typeof diag.hardware.executionProvider).toBe('string');

    svc.resetDiagnostics();
    const afterReset = await svc.getDiagnosticsReport();
    expect(afterReset.latency.sampleCount).toBe(0);

    await svc.queue.shutdown();
  });

  it('triggers clean error handling on invalid speech or missing model without crashing', async () => {
    const root = createTempDir('skycontrol-err-');
    const svc = new LocalTtsService({
      dataDir: path.join(root, 'data'),
      modelsDir: path.join(root, 'models'),
      samplesDir: path.join(root, 'samples'),
      libraryDir: path.join(root, 'library'),
    });

    await expect(svc.synthesizeSpeech({ text: '   ' })).rejects.toThrow(/empty/i);
    await expect(svc.synthesizeSpeech({ text: 'Cleared for takeoff' })).rejects.toThrow();

    const diag = await svc.getDiagnosticsReport();
    expect(diag.errors.ttsFailedCount).toBeGreaterThanOrEqual(1);
    await svc.queue.shutdown();
  });
});

describe('VoiceAssignmentRegistry Overrides & Controller Reassignment', () => {
  it('supports operator pilot override and station controller reassignment cleanly', () => {
    const registry = new VoiceAssignmentRegistry();

    const p1 = registry.getOrAssignPilot({
      aircraftId: 'ac_101',
      callsign: 'BAW452',
      airline: 'BAW',
      availableProfiles: DEFAULT_VOICE_PROFILES,
    });
    expect(p1.localProfileId).toMatch(/^pilot_/);

    const targetOverride = p1.localProfileId === 'pilot_alice' ? 'pilot_thomas' : 'pilot_alice';
    const overridden = registry.setPilotAssignmentOverride({
      aircraftId: 'ac_101',
      callsign: 'BAW452',
      airline: 'BAW',
      profileId: targetOverride,
      availableProfiles: DEFAULT_VOICE_PROFILES,
    });
    expect(overridden.localProfileId).toBe(targetOverride);

    // Subsequent calls honor pinned override
    const p1Again = registry.getOrAssignPilot({
      aircraftId: 'ac_101',
      callsign: 'BAW452',
      airline: 'BAW',
      availableProfiles: DEFAULT_VOICE_PROFILES,
    });
    expect(p1Again.localProfileId).toBe(targetOverride);

    // Station controller assignment & reassignment
    registry.setStationDefaultProfile('APPROACH', 'tower_kore');
    const ctrl = registry.getOrAssignStationController({
      airportIcao: 'EGLL',
      stationRole: 'APPROACH',
      availableProfiles: DEFAULT_VOICE_PROFILES,
    });
    expect(ctrl.localProfile.id).toBe('tower_kore');
  });
});

describe('Hardware Telemetry Probe & Long-Running Simulation Stability', () => {
  it('collects non-fabricated host CPU/RAM/GPU telemetry without throwing', async () => {
    const hw = await collectHardwareTelemetry();
    expect(hw.cpuCores).toBeGreaterThan(0);
    expect(hw.ramTotalBytes).toBeGreaterThan(hw.ramUsedBytes);
    expect(hw.cpuUsagePercent).toBeGreaterThanOrEqual(0);
    expect(hw.cpuUsagePercent).toBeLessThanOrEqual(100);
    expect(['cpu', 'cuda', 'dml', 'coreml']).toContain(hw.executionProvider);
  });

  it('runs 1,200 physics/conflict/voice ticks across churning traffic without drift or registry leaks', () => {
    const resolved = resolveConfiguredAirport('EGLL');
    const registry = new VoiceAssignmentRegistry();
    const arrRwy = resolved.airport.runways[0];

    let fleet = Array.from({ length: 6 }, (_, i) =>
      generateInboundFlight(i + 1, {
        airport: resolved.airport,
        arrivalRunway: arrRwy,
        initialScopeDistribution: true,
      })
    );

    for (const ac of fleet) {
      registry.getOrAssignPilot({
        aircraftId: ac.id,
        callsign: ac.callsign,
        airline: ac.airline,
        availableProfiles: DEFAULT_VOICE_PROFILES,
      });
    }

    for (let step = 0; step < 1200; step++) {
      const simTime = step * 0.25;
      fleet = fleet.map(ac =>
        stepAircraftPhysics(
          ac,
          0.25,
          resolved.profile.defaultWeather,
          resolved.airport.waypoints,
          simTime,
          resolved.airport.elevationFeet
        )
      );

      for (const ac of fleet) {
        expect(Number.isFinite(ac.x)).toBe(true);
        expect(Number.isFinite(ac.y)).toBe(true);
        expect(Number.isFinite(ac.altitude)).toBe(true);
      }

      detectConflicts(fleet);

      // Simulate flight exit & replacement every 200 ticks
      if (step > 0 && step % 200 === 0) {
        fleet.shift();
        const replacement = generateInboundFlight(step, {
          airport: resolved.airport,
          arrivalRunway: arrRwy,
          existingAircraft: fleet,
        });
        fleet.push(replacement);
        registry.pruneInactiveAircraft(fleet.map(f => f.id));
        registry.getOrAssignPilot({
          aircraftId: replacement.id,
          callsign: replacement.callsign,
          airline: replacement.airline,
          availableProfiles: DEFAULT_VOICE_PROFILES,
        });
      }
    }

    const snap = registry.getSnapshot();
    expect(snap.pilots.length).toBe(fleet.length);
  });
});
