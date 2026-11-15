import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_VOICE_PROFILES,
  MAX_VOICE_PROFILES,
} from '../shared/ttsTypes';
import { encodeWavPcm16, readWavMetadata } from '../server/wavEncoder';
import { VoiceProfileManager } from '../server/voiceProfileManager';
import { ModelManager } from '../server/modelManager';
import { AudioCacheManager } from '../server/audioCacheManager';
import { AudioEngine } from '../src/services/AudioEngine';
import {
  inferAtcSubRole,
  resolveOfflinePilotProfile,
  VoiceLike,
} from '../src/audio/radioAudio';

describe('Local Offline Kokoro-82M Speech Generation Engine', () => {
  let tmpDataDir: string;

  beforeEach(() => {
    tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skycontrol-tts-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  });

  it('defines 15 genuinely distinct neural voice profiles (10 Pilot, 3 Tower, 1 Approach, 1 Ground) with valid local WAV samples', () => {
    expect(DEFAULT_VOICE_PROFILES).toHaveLength(15);
    expect(DEFAULT_VOICE_PROFILES.length).toBeLessThanOrEqual(MAX_VOICE_PROFILES);

    const byRole = {
      PILOT: DEFAULT_VOICE_PROFILES.filter(p => p.voiceType === 'PILOT'),
      TOWER: DEFAULT_VOICE_PROFILES.filter(p => p.voiceType === 'TOWER'),
      APPROACH: DEFAULT_VOICE_PROFILES.filter(p => p.voiceType === 'APPROACH'),
      GROUND: DEFAULT_VOICE_PROFILES.filter(p => p.voiceType === 'GROUND'),
    };
    expect(byRole.PILOT).toHaveLength(10);
    expect(byRole.TOWER).toHaveLength(3);
    expect(byRole.APPROACH).toHaveLength(1);
    expect(byRole.GROUND).toHaveLength(1);

    // Every single profile must map to a distinct Kokoro speaker embedding (never pitch-faking one speaker)
    const uniqueKokoroSpeakers = new Set(
      DEFAULT_VOICE_PROFILES.map(p => p.voiceConfig.kokoroVoiceId)
    );
    expect(uniqueKokoroSpeakers.size).toBe(15);

    // Every profile has a real pre-generated 24kHz PCM-16 WAV sample on disk
    for (const profile of DEFAULT_VOICE_PROFILES) {
      const samplePath = path.resolve(process.cwd(), `public/voice-samples/${profile.id}.wav`);
      expect(fs.existsSync(samplePath), `Missing sample WAV for ${profile.id}`).toBe(true);
      const wavBuf = fs.readFileSync(samplePath);
      const info = readWavMetadata(wavBuf);
      expect(info.sampleRate).toBe(24000);
      expect(info.channels).toBe(1);
      expect(info.bitsPerSample).toBe(16);
      expect(info.durationSec).toBeGreaterThan(1.0);
    }
  });

  it('verifies local Kokoro-82M ONNX model storage and voice embeddings offline via ModelManager', () => {
    const modelManager = new ModelManager();
    const info = modelManager.getModelInfo();

    expect(info.license).toBe('Apache-2.0');
    expect(info.verifiedOnDisk).toBe(true);
    expect(info.totalDiskBytes).toBeGreaterThan(80_000_000);
    expect(info.availableVoicesCount).toBeGreaterThanOrEqual(28);
    expect(info.files.every(f => f.exists)).toBe(true);
  });

  it('enforces max 15 voice profiles, parameter clamping, persistence, and role safety in VoiceProfileManager', () => {
    const mgr = new VoiceProfileManager(tmpDataDir);
    expect(mgr.listProfiles()).toHaveLength(15);

    // Enforces hard cap of 15 profiles
    expect(() =>
      mgr.createProfile({
        ...DEFAULT_VOICE_PROFILES[0],
        id: 'extra_16th',
      })
    ).toThrow(/Maximum limit of 15/);

    // Updating speed, pitch, stability persists across instances
    const updated = mgr.updateProfile('tower_charon', {
      speed: 1.25,
      pitch: 1.04,
      stability: 0.92,
    });
    expect(updated.speed).toBe(1.25);
    expect(updated.pitch).toBe(1.04);

    const mgrReloaded = new VoiceProfileManager(tmpDataDir);
    expect(mgrReloaded.getProfile('tower_charon')?.speed).toBe(1.25);

    // Guard against disabling the last enabled Approach/Tower/Ground ATC controller
    mgrReloaded.updateProfile('tower_charon', { enabled: false });
    mgrReloaded.updateProfile('tower_fenrir', { enabled: false });
    mgrReloaded.updateProfile('tower_kore', { enabled: false });
    mgrReloaded.updateProfile('approach_zephyr', { enabled: false });
    expect(() => mgrReloaded.updateProfile('ground_puck', { enabled: false })).toThrow(
      /At least one ATC controller/
    );
  });

  it('caches synthesized PCM-16 WAV audio with metadata tracking and corruption recovery', () => {
    const cache = new AudioCacheManager(tmpDataDir);
    const profile = DEFAULT_VOICE_PROFILES[0];
    const samples = new Float32Array(2400); // 100ms at 24kHz
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((i / 24000) * 440 * Math.PI * 2) * 0.4;
    }
    const wavBuf = encodeWavPcm16(samples, 24000);

    const { cacheKey, textHash } = cache.computeCacheKey({
      normalizedText: 'Speedbird four five two, cleared for takeoff',
      voiceId: profile.id,
      kokoroVoiceId: profile.voiceConfig.kokoroVoiceId,
      modelRef: profile.modelRef,
      speed: profile.speed,
      stability: profile.stability,
    });

    const entry = cache.put({
      cacheKey,
      textHash,
      rawText: 'BAW452, cleared for takeoff',
      normalizedText: 'Speedbird four five two, cleared for takeoff',
      profile,
      speed: profile.speed,
      generationMs: 120,
      wavBuffer: wavBuf,
    });

    expect(entry.sampleRate).toBe(24000);
    expect(entry.durationSec).toBeCloseTo(0.1, 2);

    const hit = cache.get(cacheKey);
    expect(hit).not.toBeNull();
    expect(hit!.metadata.hitCount).toBe(2);

    // Simulate missing/corrupted WAV file on disk -> automatic recovery returns null cleanly
    fs.unlinkSync(path.join(tmpDataDir, 'audio-cache', entry.wavFileName));
    expect(cache.get(cacheKey)).toBeNull();
  });

  it('distributes 10 active aircraft across all 10 distinct Pilot voices and routes ATC sub-roles', () => {
    const mockVoices: VoiceLike[] = [
      { voiceURI: 'ms-george', name: 'Microsoft George', lang: 'en-GB', localService: true },
    ];
    const tenFlights = [
      'BAW452', 'IRA712', 'AFR228', 'UAE310', 'DAL114',
      'DLH802', 'VIR214', 'AAL101', 'QTR508', 'UAL340',
    ];
    const resolved = tenFlights.map(cs =>
      resolveOfflinePilotProfile(cs, mockVoices, null, {
        airline: cs.slice(0, 3),
        activeCallsigns: tenFlights,
      })
    );
    expect(new Set(resolved.map(p => p.localProfileId)).size).toBe(10);

    expect(inferAtcSubRole('BAW452, runway 27L cleared for takeoff')).toBe('TOWER');
    expect(inferAtcSubRole('BAW452, turn left heading 180, descend 3,000 feet')).toBe('APPROACH');
    expect(inferAtcSubRole('BAW452, runway 27R vacated, contact ground 121.9')).toBe('GROUND');
  });

  it('routes raw Kokoro WAV bytes through the Web Audio VHF Radio DSP chain via AudioEngine', async () => {
    const engine = new AudioEngine();
    const samples = new Float32Array(2400);
    const wavBuf = encodeWavPcm16(samples, 24000);
    const wavArrayBuf = Uint8Array.from(wavBuf).buffer;

    let sourceStarted = false;
    const createParam = () => ({
      value: 0,
      setValueAtTime: () => undefined,
      linearRampToValueAtTime: () => undefined,
      setValueCurveAtTime: () => undefined,
    });
    const mockCtx = {
      currentTime: 0.2,
      destination: {},
      createBiquadFilter: () => ({ type: '', frequency: createParam(), Q: createParam(), gain: createParam(), connect: () => undefined }),
      createDynamicsCompressor: () => ({ threshold: createParam(), knee: createParam(), ratio: createParam(), attack: createParam(), release: createParam(), connect: () => undefined }),
      createGain: () => ({ gain: createParam(), connect: () => undefined }),
      createBufferSource: () => {
        const node = {
          buffer: null,
          playbackRate: { value: 1 },
          connect: () => undefined,
          start: () => {
            sourceStarted = true;
          },
          stop: () => undefined,
          onended: null as null | (() => void),
        };
        setTimeout(() => node.onended?.(), 5);
        return node;
      },
      decodeAudioData: async () => ({ duration: 0.1 } as AudioBuffer),
    } as unknown as AudioContext;

    const ok = await engine.playWavBytes({
      ctx: mockCtx,
      wavBytes: wavArrayBuf,
      role: 'TOWER',
      volume: 0.85,
      playbackRate: 1.0,
    });

    expect(ok).toBe(true);
    expect(sourceStarted).toBe(true);
  });
});
