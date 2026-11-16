import { describe, it, expect, beforeEach } from 'vitest';
import {
  VHF_RADIO_PRESETS,
  DEFAULT_VHF_SETTINGS,
  sanitizeVhfSettings,
  buildSaturationCurve,
  computeDropoutAndFadingEnvelope,
  generateVhfNoiseAndCracklePcm,
} from '../src/audio/vhfRadioDsp';
import { radioAudio } from '../src/audio/radioAudio';
import { audioEngine } from '../src/services/AudioEngine';

describe('Professional Aviation VHF Radio DSP Engine', () => {
  beforeEach(() => {
    radioAudio.resetVhfSettings();
  });

  it('provides all 5 distinct aviation VHF radio quality presets with balanced defaults', () => {
    expect(VHF_RADIO_PRESETS.clear_communication).toBeDefined();
    expect(VHF_RADIO_PRESETS.normal_aviation).toBeDefined();
    expect(VHF_RADIO_PRESETS.weak_signal).toBeDefined();
    expect(VHF_RADIO_PRESETS.heavy_interference).toBeDefined();
    expect(VHF_RADIO_PRESETS.emergency_transmission).toBeDefined();

    // Clear < Normal < Weak < Heavy noise progression
    expect(VHF_RADIO_PRESETS.clear_communication.settings.noiseIntensity).toBeLessThan(
      VHF_RADIO_PRESETS.normal_aviation.settings.noiseIntensity
    );
    expect(VHF_RADIO_PRESETS.normal_aviation.settings.noiseIntensity).toBeLessThan(
      VHF_RADIO_PRESETS.weak_signal.settings.noiseIntensity
    );
    expect(VHF_RADIO_PRESETS.weak_signal.settings.noiseIntensity).toBeLessThan(
      VHF_RADIO_PRESETS.heavy_interference.settings.noiseIntensity
    );

    // Signal strength drops cleanly across Clear -> Normal -> Weak -> Heavy
    expect(VHF_RADIO_PRESETS.clear_communication.settings.signalStrength).toBeGreaterThan(
      VHF_RADIO_PRESETS.weak_signal.settings.signalStrength
    );
    expect(VHF_RADIO_PRESETS.weak_signal.settings.signalStrength).toBeGreaterThan(
      VHF_RADIO_PRESETS.heavy_interference.settings.signalStrength
    );

    // Bandpass stays strictly in VHF aviation speech band (~300Hz - ~3000Hz)
    const normal = VHF_RADIO_PRESETS.normal_aviation.settings;
    expect(normal.bandpassLowHz).toBeGreaterThanOrEqual(250);
    expect(normal.bandpassLowHz).toBeLessThanOrEqual(400);
    expect(normal.bandpassHighHz).toBeGreaterThanOrEqual(2400);
    expect(normal.bandpassHighHz).toBeLessThanOrEqual(3300);
  });

  it('sanitizes and clamps every independent VHF DSP parameter safely', () => {
    const clamped = sanitizeVhfSettings({
      noiseIntensity: 4.5,
      signalStrength: -2,
      distortion: 2,
      compression: -1,
      staticFrequency: 9999,
      dropoutProbability: 3,
      transmissionVolume: 0.01,
      pttDurationMs: 5000,
    });

    expect(clamped.noiseIntensity).toBe(1);
    expect(clamped.signalStrength).toBe(0.05);
    expect(clamped.distortion).toBe(1);
    expect(clamped.compression).toBe(0);
    expect(clamped.staticFrequency).toBe(2600);
    expect(clamped.dropoutProbability).toBe(1);
    expect(clamped.transmissionVolume).toBe(0.2);
    expect(clamped.pttDurationMs).toBe(220);
  });

  it('builds bounded soft-saturation waveshaper curves without digital square clipping', () => {
    const bypass = buildSaturationCurve(0);
    const mild = buildSaturationCurve(0.25);
    const heavy = buildSaturationCurve(0.8);

    expect(bypass.length).toBe(1024);
    expect(mild.length).toBe(1024);

    // Near midpoint stays well-behaved & bounded in [-1, 1]
    const mid = Math.floor(bypass.length / 2);
    expect(Math.abs(bypass[mid])).toBeLessThan(0.01);
    expect(Math.abs(mild[mid])).toBeLessThan(0.05);

    for (let i = 0; i < heavy.length; i++) {
      expect(heavy[i]).toBeGreaterThanOrEqual(-1);
      expect(heavy[i]).toBeLessThanOrEqual(1);
    }

    // Mild saturation preserves smooth positive gain slope around speech center
    expect(mild[mid + 40]).toBeGreaterThan(mild[mid]);
    expect(heavy[mid + 40]).toBeGreaterThan(mild[mid + 40]);
  });

  it('generates RF fading & brief dropout envelopes scaled by signalStrength and dropoutProbability', () => {
    const clearEnv = computeDropoutAndFadingEnvelope(4.0, {
      ...DEFAULT_VHF_SETTINGS,
      ...VHF_RADIO_PRESETS.clear_communication.settings,
      preset: 'clear_communication',
    });
    const weakEnv = computeDropoutAndFadingEnvelope(4.0, {
      ...DEFAULT_VHF_SETTINGS,
      ...VHF_RADIO_PRESETS.heavy_interference.settings,
      preset: 'heavy_interference',
    });

    const minClear = Math.min(...Array.from(clearEnv));
    const minWeak = Math.min(...Array.from(weakEnv));

    expect(minClear).toBeGreaterThan(0.95);
    expect(minWeak).toBeLessThan(0.5);
  });

  it('synthesizes layered noise and crackle PCM proportional to interference parameters', () => {
    const clearNoise = generateVhfNoiseAndCracklePcm(
      24000,
      1.5,
      {
        ...DEFAULT_VHF_SETTINGS,
        ...VHF_RADIO_PRESETS.clear_communication.settings,
        preset: 'clear_communication',
      },
      101
    );
    const heavyNoise = generateVhfNoiseAndCracklePcm(
      24000,
      1.5,
      {
        ...DEFAULT_VHF_SETTINGS,
        ...VHF_RADIO_PRESETS.heavy_interference.settings,
        preset: 'heavy_interference',
      },
      101
    );

    const rms = (arr: Float32Array) => {
      let s = 0;
      for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
      return Math.sqrt(s / arr.length);
    };

    expect(rms(heavyNoise)).toBeGreaterThan(rms(clearNoise) * 1.4);
  });

  it('synchronizes presets and independent adjustments between RadioAudioEngine and AudioEngine', () => {
    radioAudio.setVhfPreset('weak_signal');
    expect(radioAudio.getVhfSettings().preset).toBe('weak_signal');
    expect(audioEngine.getVhfSettings().preset).toBe('weak_signal');
    expect(audioEngine.getVhfSettings().dropoutProbability).toBe(
      VHF_RADIO_PRESETS.weak_signal.settings.dropoutProbability
    );

    radioAudio.updateVhfSettings({
      pttDurationMs: 145,
      cockpitNoiseEnabled: false,
      noiseIntensity: 0.51,
    });

    expect(radioAudio.getVhfSettings().preset).toBe('custom');
    expect(audioEngine.getVhfSettings().pttDurationMs).toBe(145);
    expect(audioEngine.getVhfSettings().cockpitNoiseEnabled).toBe(false);
    expect(audioEngine.getVhfSettings().noiseIntensity).toBe(0.51);
  });
});
