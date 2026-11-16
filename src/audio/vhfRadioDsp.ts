/**
 * SKYCONTROL - Professional Aviation VHF Airband DSP Engine (100% Offline)
 *
 * Implements a complete configurable Web Audio VHF transceiver pipeline:
 * 1. Narrow-band VHF Band-Pass Filtering (300 Hz - 3000 Hz, role-preserving presence)
 * 2. Multi-stage Radio AGC Dynamic Compression & Output Peak Limiting
 * 3. Mild Transformer/AM Radio Saturation (WaveShaperNode soft-clipping)
 * 4. Multi-layer VHF Background Noise (shaped pink hiss, stochastic crackles, intermittent EMI)
 * 5. Signal Interference (RF fading envelope, brief dropouts, syllable flutter)
 * 6. Push-To-Talk (PTT) Mechanical Key Clicks, Carrier Opening & Squelch Tail Gate
 * 7. Environmental Conditions (5 Quality Presets + optional Cockpit Avionics/Airframe Noise)
 *
 * Designed carefully to preserve each neural speaker's vocal identity while imparting
 * authentic aeronautical VHF radio realism.
 */

export type VhfQualityPresetId =
  | 'clear_communication'
  | 'normal_aviation'
  | 'weak_signal'
  | 'heavy_interference'
  | 'emergency_transmission'
  | 'custom';

export interface VhfRadioSettings {
  preset: VhfQualityPresetId;
  enabled: boolean;
  /** Continuous radio hiss + crackle bed intensity (0.0 - 1.0) */
  noiseIntensity: number;
  /** Simulated VHF link strength (0.0 = fringe horizon, 1.0 = line-of-sight strong) */
  signalStrength: number;
  /** Mild analog RF saturation / harmonic grit (0.0 - 1.0) */
  distortion: number;
  /** Radio AGC compression depth & limiting tightness (0.0 - 1.0) */
  compression: number;
  /** Primary receiver noise/carrier emphasis frequency in Hz (500 - 2600) */
  staticFrequency: number;
  /** Probability of brief syllable dropouts during transmission (0.0 - 1.0) */
  dropoutProbability: number;
  /** Master transmission output level (0.2 - 1.5) */
  transmissionVolume: number;
  /** Push-to-talk key activation & squelch tail duration in ms (25 - 220) */
  pttDurationMs: number;
  /** Lower band-pass cutoff in Hz (default 300 Hz) */
  bandpassLowHz: number;
  /** Upper band-pass cutoff in Hz (default 3000 Hz) */
  bandpassHighHz: number;
  /** Mid-high articulation clarity trim (0.0 - 1.0) */
  radioClarity: number;
  /** Enable subtle cockpit / avionics background bed on pilot/emergency transmissions */
  cockpitNoiseEnabled: boolean;
  /** Level of cockpit avionics/airflow noise (0.0 - 1.0) */
  cockpitNoiseLevel: number;
}

export interface VhfPresetDefinition {
  id: Exclude<VhfQualityPresetId, 'custom'>;
  name: string;
  shortName: string;
  description: string;
  settings: Omit<VhfRadioSettings, 'preset'>;
}

export const VHF_RADIO_PRESETS: Record<
  Exclude<VhfQualityPresetId, 'custom'>,
  VhfPresetDefinition
> = {
  clear_communication: {
    id: 'clear_communication',
    name: 'Clear Communication',
    shortName: 'Clear',
    description: 'Strong line-of-sight VHF link near airport with crisp clarity and minimal hiss.',
    settings: {
      enabled: true,
      noiseIntensity: 0.14,
      signalStrength: 0.96,
      distortion: 0.08,
      compression: 0.45,
      staticFrequency: 1350,
      dropoutProbability: 0.0,
      transmissionVolume: 0.95,
      pttDurationMs: 55,
      bandpassLowHz: 290,
      bandpassHighHz: 3250,
      radioClarity: 0.88,
      cockpitNoiseEnabled: false,
      cockpitNoiseLevel: 0.12,
    },
  },
  normal_aviation: {
    id: 'normal_aviation',
    name: 'Normal Aviation Radio',
    shortName: 'Normal',
    description: 'Authentic everyday terminal & tower VHF airband transceiver with balanced hiss & PTT.',
    settings: {
      enabled: true,
      noiseIntensity: 0.34,
      signalStrength: 0.82,
      distortion: 0.22,
      compression: 0.68,
      staticFrequency: 1450,
      dropoutProbability: 0.05,
      transmissionVolume: 0.92,
      pttDurationMs: 75,
      bandpassLowHz: 310,
      bandpassHighHz: 3000,
      radioClarity: 0.72,
      cockpitNoiseEnabled: true,
      cockpitNoiseLevel: 0.25,
    },
  },
  weak_signal: {
    id: 'weak_signal',
    name: 'Weak Signal',
    shortName: 'Weak',
    description: 'Fringe-range aircraft link with elevated static hiss, RF fading, and brief dropouts.',
    settings: {
      enabled: true,
      noiseIntensity: 0.62,
      signalStrength: 0.44,
      distortion: 0.36,
      compression: 0.80,
      staticFrequency: 1620,
      dropoutProbability: 0.24,
      transmissionVolume: 0.90,
      pttDurationMs: 95,
      bandpassLowHz: 340,
      bandpassHighHz: 2720,
      radioClarity: 0.52,
      cockpitNoiseEnabled: true,
      cockpitNoiseLevel: 0.32,
    },
  },
  heavy_interference: {
    id: 'heavy_interference',
    name: 'Heavy Interference',
    shortName: 'Interference',
    description: 'Severe atmospheric & co-channel interference with crackles, fading, and dropouts.',
    settings: {
      enabled: true,
      noiseIntensity: 0.86,
      signalStrength: 0.26,
      distortion: 0.54,
      compression: 0.90,
      staticFrequency: 1850,
      dropoutProbability: 0.45,
      transmissionVolume: 0.92,
      pttDurationMs: 120,
      bandpassLowHz: 370,
      bandpassHighHz: 2520,
      radioClarity: 0.38,
      cockpitNoiseEnabled: true,
      cockpitNoiseLevel: 0.42,
    },
  },
  emergency_transmission: {
    id: 'emergency_transmission',
    name: 'Emergency Transmission',
    shortName: 'Emergency',
    description: 'High-presence cockpit emergency priority transmission with punchy limiting & cockpit bed.',
    settings: {
      enabled: true,
      noiseIntensity: 0.46,
      signalStrength: 0.70,
      distortion: 0.32,
      compression: 0.92,
      staticFrequency: 1550,
      dropoutProbability: 0.08,
      transmissionVolume: 1.08,
      pttDurationMs: 95,
      bandpassLowHz: 320,
      bandpassHighHz: 3050,
      radioClarity: 0.82,
      cockpitNoiseEnabled: true,
      cockpitNoiseLevel: 0.65,
    },
  },
};

export const DEFAULT_VHF_SETTINGS: VhfRadioSettings = {
  preset: 'normal_aviation',
  ...VHF_RADIO_PRESETS.normal_aviation.settings,
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function sanitizeVhfSettings(input: Partial<VhfRadioSettings>): VhfRadioSettings {
  return {
    preset: input.preset ?? DEFAULT_VHF_SETTINGS.preset,
    enabled: input.enabled ?? DEFAULT_VHF_SETTINGS.enabled,
    noiseIntensity: clamp(input.noiseIntensity ?? DEFAULT_VHF_SETTINGS.noiseIntensity, 0, 1),
    signalStrength: clamp(input.signalStrength ?? DEFAULT_VHF_SETTINGS.signalStrength, 0.05, 1),
    distortion: clamp(input.distortion ?? DEFAULT_VHF_SETTINGS.distortion, 0, 1),
    compression: clamp(input.compression ?? DEFAULT_VHF_SETTINGS.compression, 0, 1),
    staticFrequency: clamp(input.staticFrequency ?? DEFAULT_VHF_SETTINGS.staticFrequency, 500, 2600),
    dropoutProbability: clamp(input.dropoutProbability ?? DEFAULT_VHF_SETTINGS.dropoutProbability, 0, 1),
    transmissionVolume: clamp(input.transmissionVolume ?? DEFAULT_VHF_SETTINGS.transmissionVolume, 0.2, 1.5),
    pttDurationMs: clamp(input.pttDurationMs ?? DEFAULT_VHF_SETTINGS.pttDurationMs, 25, 220),
    bandpassLowHz: clamp(input.bandpassLowHz ?? DEFAULT_VHF_SETTINGS.bandpassLowHz, 220, 550),
    bandpassHighHz: clamp(input.bandpassHighHz ?? DEFAULT_VHF_SETTINGS.bandpassHighHz, 2100, 3800),
    radioClarity: clamp(input.radioClarity ?? DEFAULT_VHF_SETTINGS.radioClarity, 0, 1),
    cockpitNoiseEnabled: input.cockpitNoiseEnabled ?? DEFAULT_VHF_SETTINGS.cockpitNoiseEnabled,
    cockpitNoiseLevel: clamp(input.cockpitNoiseLevel ?? DEFAULT_VHF_SETTINGS.cockpitNoiseLevel, 0, 1),
  };
}

/**
 * Deterministic PRNG (Mulberry32) so envelope & noise calculations remain reproducible in tests.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates an analog microphone/RF soft-saturation transfer curve for WaveShaperNode.
 * Uses bounded hyperbolic tangent plus subtle even asymmetry to retain vocal identity.
 */
export function buildSaturationCurve(
  distortion: number,
  sampleCount: number = 1024
): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(sampleCount * 4));
  const d = clamp(distortion, 0, 1);

  if (d <= 0.02) {
    for (let i = 0; i < sampleCount; i++) {
      curve[i] = (i * 2) / (sampleCount - 1) - 1;
    }
    return curve;
  }

  // Gentle drive range [1.15 .. 5.2] preserves pitch & formants without harsh square clipping
  const drive = 1.15 + d * 4.05;
  const norm = Math.tanh(drive);

  for (let i = 0; i < sampleCount; i++) {
    const x = (i * 2) / (sampleCount - 1) - 1;
    const biased = x + d * 0.045 * (x * x);
    const shaped = Math.tanh(drive * biased) / norm;
    curve[i] = clamp(shaped * (1 - d * 0.08), -1, 1);
  }
  return curve;
}

/**
 * Generates a per-frame (25 ms resolution) RF signal fading + stochastic dropout envelope
 * scaled cleanly by signalStrength and dropoutProbability.
 */
export function computeDropoutAndFadingEnvelope(
  durationSec: number,
  settings: VhfRadioSettings,
  seed: number = 1337
): Float32Array<ArrayBuffer> {
  const frameRate = 40; // 25ms per step
  const numFrames = Math.max(8, Math.ceil(Math.max(0.2, durationSec) * frameRate));
  const env = new Float32Array(new ArrayBuffer(numFrames * 4));
  const rand = mulberry32(seed);

  const weakness = clamp(1 - settings.signalStrength, 0, 1);
  const fadingDepth = clamp(weakness * 0.42, 0, 0.45);
  const phase1 = rand() * Math.PI * 2;
  const phase2 = rand() * Math.PI * 2;
  const freq1 = 0.7 + rand() * 1.3;
  const freq2 = 2.1 + rand() * 2.4;

  let dropoutRemaining = 0;
  let dropoutDepth = 1.0;

  for (let i = 0; i < numFrames; i++) {
    const t = i / frameRate;
    const slowFade =
      1 -
      fadingDepth *
        (0.5 + 0.35 * Math.sin(2 * Math.PI * freq1 * t + phase1) + 0.15 * Math.sin(2 * Math.PI * freq2 * t + phase2));

    // Syllable RF flutter at low signal strength
    const flutter =
      weakness > 0.35
        ? 1 - (weakness - 0.35) * 0.24 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 19 * t))
        : 1.0;

    // Trigger occasional 50ms - 150ms dropouts governed by dropoutProbability
    if (dropoutRemaining <= 0 && i > 2 && i < numFrames - 3 && settings.dropoutProbability > 0.01) {
      const perFrameTrigger = settings.dropoutProbability * 0.065;
      if (rand() < perFrameTrigger) {
        dropoutRemaining = 2 + Math.floor(rand() * 4); // 50ms - 125ms
        dropoutDepth = clamp(0.14 + (1 - settings.dropoutProbability) * 0.25, 0.1, 0.45);
      }
    }

    let dropFactor = 1.0;
    if (dropoutRemaining > 0) {
      dropFactor = dropoutDepth;
      dropoutRemaining -= 1;
    }

    env[i] = clamp(slowFade * flutter * dropFactor, 0.08, 1.0);
  }

  return env;
}

/**
 * Generates multi-layer offline receiver background noise PCM (pink hiss + crackles + faint EMI pulses).
 */
export function generateVhfNoiseAndCracklePcm(
  sampleRate: number,
  durationSec: number,
  settings: VhfRadioSettings,
  seed: number = 9001
): Float32Array<ArrayBuffer> {
  const length = Math.max(1024, Math.floor(sampleRate * durationSec));
  const out = new Float32Array(new ArrayBuffer(length * 4));
  const rand = mulberry32(seed);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  const interferenceFactor = clamp(
    settings.noiseIntensity * 0.7 + (1 - settings.signalStrength) * 0.45,
    0,
    1.2
  );
  const crackleRate = 0.00018 + settings.noiseIntensity * 0.0014 + (1 - settings.signalStrength) * 0.0011;

  let crackleDecay = 0;
  let burstEnvelope = 0;

  const hissScale = 0.25 + interferenceFactor * 0.95;

  for (let i = 0; i < length; i++) {
    const white = rand() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    const pink = (b0 + b1 + b2 + white * 0.1848) * 0.13 * hissScale;

    // Sharp micro-crackle static spikes (1-3ms electrical snap)
    if (rand() < crackleRate && crackleDecay < 0.05) {
      crackleDecay = (0.35 + rand() * 0.65) * interferenceFactor;
    }
    const crackle = crackleDecay > 0.01 ? (rand() * 2 - 1) * crackleDecay * 0.85 : 0;
    crackleDecay *= 0.92;

    // Intermittent interference bursts (short RF flutter windows)
    if (burstEnvelope < 0.02 && interferenceFactor > 0.45 && rand() < 0.00008 * interferenceFactor) {
      burstEnvelope = 0.4 + rand() * 0.4;
    }
    const burst = burstEnvelope > 0.01 ? Math.sin(2 * Math.PI * (settings.staticFrequency * 0.42) * (i / sampleRate)) * white * burstEnvelope * 0.16 : 0;
    burstEnvelope *= 0.9994;

    out[i] = clamp(pink + crackle + burst, -0.95, 0.95);
  }

  return out;
}

export interface VhfGraphResult {
  input: AudioNode;
  masterGain: GainNode;
  fadingGain: GainNode;
}

/**
 * Constructs the full Web Audio VHF Signal Processing Graph on any BaseAudioContext.
 * Chain: Highpass (300Hz) -> Presence Peaking -> Lowpass (3000Hz) -> Saturation WaveShaper
 *     -> AGC Compressor -> RF Fading & Dropouts Gain -> Peak Limiter -> Master Gain -> Destination.
 */
export function createVhfProcessingChain(
  ctx: BaseAudioContext,
  role: 'TOWER' | 'PILOT',
  settings: VhfRadioSettings,
  options?: {
    bandpassHz?: number;
    volumeScale?: number;
    durationSec?: number;
    startTimeSec?: number;
    seed?: number;
  }
): VhfGraphResult {
  const s = sanitizeVhfSettings(settings);
  const volumeScale = options?.volumeScale ?? 1.0;

  // Bypass mode: ultra-clean direct studio monitoring with light safety gain only
  if (!s.enabled) {
    const cleanGain = ctx.createGain();
    cleanGain.gain.value = clamp(volumeScale * s.transmissionVolume, 0, 1.5);
    cleanGain.connect(ctx.destination);
    return {
      input: cleanGain,
      masterGain: cleanGain,
      fadingGain: cleanGain,
    };
  }

  // Bandwidth contracts slightly as RF signal degrades
  const lowCutoff = clamp(
    s.bandpassLowHz + (1 - s.signalStrength) * 55,
    220,
    560
  );
  const highCutoff = clamp(
    s.bandpassHighHz - (1 - s.signalStrength) * 420 - (role === 'PILOT' ? 180 : 0),
    1900,
    3800
  );

  // 1. VHF Narrow-Band Filter (High-Pass + Role Presence Peaking + Low-Pass)
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = lowCutoff;
  highpass.Q.value = 0.85;

  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value =
    options?.bandpassHz ?? (role === 'TOWER' ? 1380 : 1520);
  presence.Q.value = 0.95 + (1 - s.radioClarity) * 0.4;
  // Balanced mid-band push preserves individual timbre & gender while cutting through static
  presence.gain.value = (role === 'PILOT' ? 2.4 : 1.6) + s.radioClarity * 2.8;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = highCutoff;
  lowpass.Q.value = 0.85;

  // 2. Mild Analog VHF Saturation (gracefully bypassed if WaveShaperNode is unavailable)
  const shaper =
    typeof (ctx as Partial<BaseAudioContext>).createWaveShaper === 'function' && s.distortion > 0.02
      ? ctx.createWaveShaper()
      : null;
  if (shaper) {
    shaper.oversample = s.distortion > 0.25 ? '2x' : 'none';
    shaper.curve = buildSaturationCurve(s.distortion);
  }

  // 3. Radio AGC Dynamic Range Compressor
  const agc = ctx.createDynamicsCompressor();
  agc.threshold.value = -10 - s.compression * 15; // -10dB .. -25dB
  agc.knee.value = 10 - s.compression * 5;
  agc.ratio.value = 2.0 + s.compression * 7.5; // 2:1 .. 9.5:1
  agc.attack.value = 0.004;
  agc.release.value = 0.11;

  // 4. Signal Fading & Micro-Dropout Envelope Node
  const fadingGain = ctx.createGain();
  fadingGain.gain.value = 1.0;

  if (
    options?.durationSec &&
    options.durationSec > 0.1 &&
    (s.signalStrength < 0.92 || s.dropoutProbability > 0.01) &&
    typeof fadingGain.gain.setValueCurveAtTime === 'function'
  ) {
    const startAt = options.startTimeSec ?? ctx.currentTime;
    const curve = computeDropoutAndFadingEnvelope(
      options.durationSec,
      s,
      options.seed ?? Math.floor(startAt * 1000) + 77
    );
    try {
      fadingGain.gain.setValueCurveAtTime(curve, startAt, Math.max(0.08, options.durationSec));
    } catch {
      fadingGain.gain.setValueAtTime(1.0, startAt);
    }
  }

  // 5. Radio Output Peak Limiter (prevents distortion overshoot regardless of preset)
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4.0;
  limiter.knee.value = 2.0;
  limiter.ratio.value = 16.0;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.045;

  // 6. Transmission Master Gain
  const masterGain = ctx.createGain();
  const roleGainTrim = role === 'TOWER' ? 1.04 : 0.98;
  masterGain.gain.value = clamp(volumeScale * s.transmissionVolume * roleGainTrim, 0, 1.5);

  highpass.connect(presence);
  presence.connect(lowpass);
  if (shaper) {
    lowpass.connect(shaper);
    shaper.connect(agc);
  } else {
    lowpass.connect(agc);
  }
  agc.connect(fadingGain);
  fadingGain.connect(limiter);
  limiter.connect(masterGain);
  masterGain.connect(ctx.destination);

  return {
    input: highpass,
    masterGain,
    fadingGain,
  };
}

export interface ActiveCarrierBedHandle {
  noiseSource: AudioBufferSourceNode;
  humOsc: OscillatorNode;
  cockpitOsc?: OscillatorNode;
  masterGain: GainNode;
}

/**
 * Starts the continuous multi-layer VHF carrier noise, static crackles, avionics hum,
 * and optional cockpit background bed during an active transmission.
 */
export function startVhfCarrierBed(
  ctx: AudioContext,
  speaker: 'ATC' | 'PILOT',
  settings: VhfRadioSettings,
  masterVolume: number,
  acoustics?: { carrierCenterHz?: number; avionicsHumHz?: number }
): ActiveCarrierBedHandle | null {
  const s = sanitizeVhfSettings(settings);
  if (!s.enabled || masterVolume <= 0.005) return null;

  try {
    const now = ctx.currentTime;
    const loopSec = 3.0;
    const pcm = generateVhfNoiseAndCracklePcm(
      ctx.sampleRate,
      loopSec,
      s,
      Math.floor(now * 1000) + (speaker === 'PILOT' ? 55 : 11)
    );

    const noiseBuffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
    noiseBuffer.getChannelData(0).set(pcm);

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(
      acoustics?.carrierCenterHz
        ? (acoustics.carrierCenterHz + s.staticFrequency) / 2
        : s.staticFrequency,
      now
    );
    bandpass.Q.setValueAtTime(speaker === 'PILOT' ? 1.15 : 0.95, now);

    // Subtle 400Hz AC aircraft bus hum on pilots or 110Hz ground power on ATC
    const humOsc = ctx.createOscillator();
    humOsc.type = 'sine';
    humOsc.frequency.setValueAtTime(
      speaker === 'PILOT' ? acoustics?.avionicsHumHz ?? 400 : acoustics?.avionicsHumHz ?? 110,
      now
    );
    const humGain = ctx.createGain();
    humGain.gain.setValueAtTime(
      (speaker === 'PILOT' ? 0.0038 : 0.0014) * masterVolume * s.transmissionVolume,
      now
    );

    // Optional cockpit air-pack / engine low-mid drone when enabled
    let cockpitOsc: OscillatorNode | undefined;
    if (s.cockpitNoiseEnabled && speaker === 'PILOT' && s.cockpitNoiseLevel > 0.02) {
      cockpitOsc = ctx.createOscillator();
      cockpitOsc.type = 'sawtooth';
      cockpitOsc.frequency.setValueAtTime(86, now);

      const cockpitFilter = ctx.createBiquadFilter();
      cockpitFilter.type = 'lowpass';
      cockpitFilter.frequency.setValueAtTime(220, now);

      const cockpitGain = ctx.createGain();
      cockpitGain.gain.setValueAtTime(0.011 * s.cockpitNoiseLevel * masterVolume, now);

      cockpitOsc.connect(cockpitFilter);
      cockpitFilter.connect(cockpitGain);
      cockpitGain.connect(ctx.destination);
      cockpitOsc.start(now);
    }

    const masterGain = ctx.createGain();
    const baseRoleScale = speaker === 'PILOT' ? 0.075 : 0.048;
    const noiseLevel = clamp(
      baseRoleScale * (0.2 + s.noiseIntensity * 1.15 + (1 - s.signalStrength) * 0.45) * masterVolume * s.transmissionVolume,
      0.001,
      0.22
    );

    const rampSec = clamp(s.pttDurationMs / 1000 * 0.45, 0.015, 0.08);
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(noiseLevel, now + rampSec);

    noiseSource.connect(bandpass);
    bandpass.connect(masterGain);
    humOsc.connect(humGain);
    humGain.connect(masterGain);
    masterGain.connect(ctx.destination);

    noiseSource.start(now);
    humOsc.start(now);

    return { noiseSource, humOsc, cockpitOsc, masterGain };
  } catch {
    return null;
  }
}

export function stopVhfCarrierBed(
  ctx: AudioContext | null,
  handle: ActiveCarrierBedHandle | null
): void {
  if (!handle || !ctx) return;
  try {
    const now = ctx.currentTime;
    handle.masterGain.gain.cancelScheduledValues(now);
    handle.masterGain.gain.setValueAtTime(Math.max(0.0001, handle.masterGain.gain.value), now);
    handle.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    handle.noiseSource.stop(now + 0.045);
    handle.humOsc.stop(now + 0.045);
    handle.cockpitOsc?.stop(now + 0.045);
  } catch {
    // Ignore stopped nodes
  }
}

/**
 * Plays realistic Push-To-Talk (PTT) mechanical mic activation click + squelch opening/tail burst.
 */
export function playVhfPttTransient(
  ctx: AudioContext,
  phase: 'START' | 'END',
  settings: VhfRadioSettings,
  masterVolume: number,
  clickFreqHz: number = 920
): void {
  const s = sanitizeVhfSettings(settings);
  if (!s.enabled || masterVolume <= 0.005) return;

  try {
    const now = ctx.currentTime;
    const baseDurSec = clamp(s.pttDurationMs / 1000, 0.025, 0.22);
    const tailDur = phase === 'END' ? baseDurSec * 1.15 : baseDurSec * 0.78;
    const vol = masterVolume * s.transmissionVolume;

    // 1. Mechanical PTT keyswitch click (fast transient pitch drop)
    const clickOsc = ctx.createOscillator();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(
      phase === 'START' ? clickFreqHz : clickFreqHz * 0.64,
      now
    );
    clickOsc.frequency.exponentialRampToValueAtTime(95, now + 0.018);

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(clamp(0.16 * vol, 0.01, 0.35), now);
    clickGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.024);

    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.026);

    // 2. Squelch carrier gate noise tail (stronger & slightly brighter on unkey)
    const bufferSize = Math.max(256, Math.floor(ctx.sampleRate * tailDur));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (phase === 'END' ? 0.38 : 0.22);
    }

    const noiseNode = ctx.createBufferSource();
    noiseNode.buffer = buffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(
      phase === 'END' ? clamp(s.staticFrequency * 1.18, 800, 2900) : s.staticFrequency,
      now
    );
    bandpass.Q.setValueAtTime(phase === 'END' ? 1.55 : 1.25, now);

    const noiseScale = clamp(0.03 + s.noiseIntensity * 0.09, 0.025, 0.14) * vol;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.002, now);
    noiseGain.gain.linearRampToValueAtTime(
      phase === 'END' ? noiseScale * 1.35 : noiseScale * 0.75,
      now + Math.min(0.014, tailDur * 0.3)
    );
    noiseGain.gain.exponentialRampToValueAtTime(0.0008, now + tailDur);

    noiseNode.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noiseNode.start(now);
    noiseNode.stop(now + tailDur + 0.005);
  } catch {
    // Audio fallback
  }
}
