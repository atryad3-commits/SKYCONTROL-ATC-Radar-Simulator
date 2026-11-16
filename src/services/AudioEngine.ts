/**
 * SKYCONTROL - High-Performance Web Audio API Voice & Crossfade Engine
 * Handles offline decoding, preloading, sample-accurate lookahead scheduling,
 * equal-power crossfading, and VHF radio DSP filtering across all 11 speaker packs
 * (5 ATC Tower controllers + 6 Pilot crews) at a natural ~15% faster cadence.
 */

import bundledVoicePackManifest from '../audio/voicePackManifest.json';
import {
  createVhfProcessingChain,
  DEFAULT_VHF_SETTINGS,
  sanitizeVhfSettings,
  VhfRadioSettings,
} from '../audio/vhfRadioDsp';

export type RadioSpeakerRole = 'TOWER' | 'PILOT';

export interface VoicePackSpeakerManifest {
  id: string;
  role: RadioSpeakerRole;
  label: string;
  file: string;
  clips: Record<string, [number, number]>; // [startSec, durationSec]
}

export interface VoicePackManifest {
  version: number;
  sampleRate: number;
  speakers: Record<string, VoicePackSpeakerManifest>;
}

export interface ScheduledClipItem {
  token: string;
  clipOffset: number;
  clipDuration: number;
  startTimeSec: number;
  scaledDurationSec: number;
  stepDeltaSec: number;
  fadeInSec: number;
  fadeOutSec: number;
}

export interface SchedulePlan {
  items: ScheduledClipItem[];
  totalDurationSec: number;
  playbackRate: number;
}

export interface PlaySequenceParams {
  speakerId: string;
  role: RadioSpeakerRole;
  tokens: string[];
  volume: number;
  playbackRate?: number;
  bandpassHz?: number;
  ctx?: AudioContext;
  shouldAbort?: () => boolean;
}

export interface PreloadSummary {
  totalCount: number;
  loadedCount: number;
  loadedSpeakers: string[];
}

export const TARGET_PACE_MULTIPLIER = 1.15;
export const TOWER_PACK_DEFAULT_RATE = 1.01;
export const PILOT_PACK_DEFAULT_RATE = 1.0;

const EQUAL_POWER_SAMPLES = 16;

function buildEqualPowerFadeInCurve(): Float32Array {
  const curve = new Float32Array(EQUAL_POWER_SAMPLES);
  for (let i = 0; i < EQUAL_POWER_SAMPLES; i++) {
    const t = i / (EQUAL_POWER_SAMPLES - 1);
    curve[i] = Math.sin((t * Math.PI) / 2);
  }
  return curve;
}

function buildEqualPowerFadeOutCurve(): Float32Array {
  const curve = new Float32Array(EQUAL_POWER_SAMPLES);
  for (let i = 0; i < EQUAL_POWER_SAMPLES; i++) {
    const t = i / (EQUAL_POWER_SAMPLES - 1);
    curve[i] = Math.cos((t * Math.PI) / 2);
  }
  return curve;
}

const FADE_IN_CURVE = buildEqualPowerFadeInCurve();
const FADE_OUT_CURVE = buildEqualPowerFadeOutCurve();

/**
 * High-performance Web Audio API Engine for 11-speaker offline aviation radio packs.
 */
export class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private manifest: VoicePackManifest | null =
    (bundledVoicePackManifest as unknown as VoicePackManifest) || null;
  private manifestPromise: Promise<VoicePackManifest | null> | null = null;
  private bufferCache = new Map<string, AudioBuffer>();
  private bufferPromises = new Map<string, Promise<AudioBuffer | null>>();
  private activeNodes: AudioBufferSourceNode[] = [];
  private preloadAllPromise: Promise<PreloadSummary> | null = null;
  private vhfSettings: VhfRadioSettings = { ...DEFAULT_VHF_SETTINGS };

  public getVhfSettings(): VhfRadioSettings {
    return { ...this.vhfSettings };
  }

  public setVhfSettings(settings: Partial<VhfRadioSettings>): VhfRadioSettings {
    this.vhfSettings = sanitizeVhfSettings({ ...this.vhfSettings, ...settings });
    return { ...this.vhfSettings };
  }

  /**
   * Lazily initializes and resumes the Web Audio API AudioContext.
   */
  public getAudioContext(): AudioContext | null {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => undefined);
    }
    return this.audioCtx;
  }

  /**
   * Allows external audio coordinators to share a single unlocked AudioContext.
   */
  public setAudioContext(ctx: AudioContext | null) {
    if (ctx) {
      this.audioCtx = ctx;
    }
  }

  public getManifestSync(): VoicePackManifest | null {
    return this.manifest;
  }

  /**
   * Loads the v2 11-speaker manifest (bundled immediately, or fetched from /voice-pack/manifest.json).
   */
  public async loadManifest(forceRefresh: boolean = false): Promise<VoicePackManifest | null> {
    if (
      !forceRefresh &&
      this.manifest &&
      (this.manifest.version ?? 1) >= 2 &&
      Object.keys(this.manifest.speakers).length >= 11
    ) {
      return this.manifest;
    }
    if (!forceRefresh && this.manifestPromise) return this.manifestPromise;
    if (typeof fetch !== 'function') return this.manifest;

    this.manifestPromise = fetch('/voice-pack/manifest.json')
      .then(async res => {
        if (!res.ok) return this.manifest;
        const data = (await res.json()) as VoicePackManifest;
        if (!data?.speakers) return this.manifest;
        if (
          forceRefresh ||
          (data.version ?? 1) >= (this.manifest?.version ?? 1) ||
          Object.keys(data.speakers).length > Object.keys(this.manifest?.speakers ?? {}).length
        ) {
          this.manifest = data;
        }
        return this.manifest;
      })
      .catch(() => this.manifest);

    return this.manifestPromise;
  }

  public isSpeakerLoaded(speakerId: string): boolean {
    return this.bufferCache.has(speakerId);
  }

  public getLoadedSpeakerIds(): string[] {
    return Array.from(this.bufferCache.keys());
  }

  /**
   * Fetches and decodes a speaker's offline MP3 sprite into an AudioBuffer (deduplicated).
   */
  public async preloadSpeaker(
    speakerId: string,
    ctxOverride?: AudioContext
  ): Promise<AudioBuffer | null> {
    const cached = this.bufferCache.get(speakerId);
    if (cached) return cached;

    const existing = this.bufferPromises.get(speakerId);
    if (existing) return existing;

    const ctx = ctxOverride || this.getAudioContext();
    if (!ctx || typeof fetch !== 'function') return null;

    const loadTask = (async () => {
      const manifest = await this.loadManifest();
      const spec = manifest?.speakers?.[speakerId];
      if (!spec) return null;

      try {
        const res = await fetch(spec.file);
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arr);
        this.bufferCache.set(speakerId, decoded);
        return decoded;
      } catch {
        return null;
      }
    })();

    this.bufferPromises.set(speakerId, loadTask);
    const result = await loadTask;
    if (!result) {
      this.bufferPromises.delete(speakerId);
    }
    return result;
  }

  /**
   * Preloads all 11 speakers in bounded parallel batches for zero-latency radio playback.
   */
  public async preloadAllSpeakers(ctxOverride?: AudioContext): Promise<PreloadSummary> {
    if (this.preloadAllPromise) return this.preloadAllPromise;

    const ctx = ctxOverride || this.getAudioContext();
    this.preloadAllPromise = (async () => {
      const manifest = await this.loadManifest();
      const speakerIds = manifest ? Object.keys(manifest.speakers) : [];
      if (!ctx || speakerIds.length === 0) {
        return {
          totalCount: speakerIds.length,
          loadedCount: this.bufferCache.size,
          loadedSpeakers: this.getLoadedSpeakerIds(),
        };
      }

      const CONCURRENCY = 3;
      const queue = [...speakerIds];
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) {
          const nextId = queue.shift();
          if (nextId) {
            await this.preloadSpeaker(nextId, ctx);
          }
        }
      });

      await Promise.all(workers);
      return {
        totalCount: speakerIds.length,
        loadedCount: this.bufferCache.size,
        loadedSpeakers: this.getLoadedSpeakerIds(),
      };
    })();

    return this.preloadAllPromise;
  }

  /**
   * Determines adaptive step offset (overlap < 0, breath beat > 0) between consecutive tokens
   * so callsigns, digits, whole clearances, and phrase clauses flow seamlessly without staccato gaps.
   */
  public computeStepOffsetSec(prevToken: string | null, currToken: string): number {
    if (!prevToken) return 0;

    const isDigit = (tok: string) => tok.startsWith('d_') || tok.startsWith('nato_');
    const isPhrase = (tok: string) => tok.startsWith('tc_') || tok.startsWith('pr_');

    // Digits inside callsigns, headings, QNH blend smoothly without staccato gaps
    if (isDigit(prevToken) && isDigit(currToken)) {
      return -0.024;
    }
    // Airline telephony -> flight digits ("Speedbird four-five-two")
    if (prevToken.startsWith('al_') && isDigit(currToken)) {
      return -0.016;
    }
    // Natural micro-breath between callsign digits and instruction clause
    if (isDigit(prevToken) && isPhrase(currToken)) {
      return 0.014;
    }
    // Smooth continuous co-articulation across adjacent words & whole units
    return -0.022;
  }

  /**
   * Resolves effective playbackRate so pre-sped v2 packs (~+14%..+16%) play cleanly around 1.00-1.03x
   * while any legacy v1 pack receives the 1.15x pace boost automatically.
   */
  public resolveEffectivePlaybackRate(
    role: RadioSpeakerRole,
    manifestVersion: number,
    requestedRate?: number
  ): number {
    const baseDefault = role === 'TOWER' ? TOWER_PACK_DEFAULT_RATE : PILOT_PACK_DEFAULT_RATE;
    const rawRate = requestedRate ?? baseDefault;
    if (manifestVersion < 2) {
      return Math.min(1.3, rawRate * TARGET_PACE_MULTIPLIER);
    }
    return Math.max(0.85, Math.min(1.25, rawRate));
  }

  /**
   * Computes deterministic sample-accurate Web Audio timeline offsets and crossfade envelopes
   * for a sequence of sprite tokens.
   */
  public computeSchedulePlan(
    tokens: string[],
    clipsMap: Record<string, [number, number]>,
    playbackRate: number,
    startTimeSec: number = 0
  ): SchedulePlan {
    const items: ScheduledClipItem[] = [];
    let cursor = startTimeSec;
    let prevToken: string | null = null;

    for (const tok of tokens) {
      const span = clipsMap[tok];
      if (!span) continue;
      const [clipOffset, clipDuration] = span;
      if (clipDuration <= 0.01) continue;

      const stepDeltaSec = this.computeStepOffsetSec(prevToken, tok);
      if (prevToken !== null) {
        cursor = Math.max(startTimeSec, cursor + stepDeltaSec);
      }

      const scaledDurationSec = clipDuration / playbackRate;
      const overlapInSec = prevToken !== null && stepDeltaSec < 0 ? Math.abs(stepDeltaSec) : 0;

      // Crossfade window covers overlap plus gentle de-click shoulders
      const fadeInSec = Math.min(
        scaledDurationSec * 0.32,
        Math.max(0.01, overlapInSec + 0.004)
      );
      const fadeOutSec = Math.min(scaledDurationSec * 0.34, 0.02);

      items.push({
        token: tok,
        clipOffset,
        clipDuration,
        startTimeSec: cursor,
        scaledDurationSec,
        stepDeltaSec,
        fadeInSec,
        fadeOutSec,
      });

      cursor += scaledDurationSec;
      prevToken = tok;
    }

    const totalDurationSec =
      items.length > 0 ? Math.max(0, cursor - startTimeSec) : 0;

    return {
      items,
      totalDurationSec,
      playbackRate,
    };
  }

  /**
   * Creates the configurable VHF aviation radio DSP chain (bandpass 300-3000Hz,
   * soft saturation, AGC compressor, RF fading/dropouts, and peak limiter).
   */
  public createVhfRadioGraph(
    ctx: AudioContext,
    role: RadioSpeakerRole,
    volume: number,
    bandpassHz?: number,
    options?: {
      startTimeSec?: number;
      durationSec?: number;
      bypassDsp?: boolean;
      settingsOverride?: VhfRadioSettings;
    }
  ): { input: AudioNode; masterGain: GainNode } {
    const baseSettings = options?.settingsOverride || this.vhfSettings;
    const effectiveSettings = options?.bypassDsp
      ? { ...baseSettings, enabled: false }
      : baseSettings;
    const chain = createVhfProcessingChain(ctx, role, effectiveSettings, {
      bandpassHz,
      volumeScale: volume,
      startTimeSec: options?.startTimeSec,
      durationSec: options?.durationSec,
    });
    return { input: chain.input, masterGain: chain.masterGain };
  }

  private applyEqualPowerEnvelope(
    gainParam: AudioParam,
    startTime: number,
    scaledDuration: number,
    fadeInSec: number,
    fadeOutSec: number
  ) {
    const canUseCurves = typeof gainParam.setValueCurveAtTime === 'function';
    const sustainStart = startTime + fadeInSec;
    const fadeOutStart = Math.max(sustainStart, startTime + scaledDuration - fadeOutSec);
    const actualFadeOut = Math.max(0.004, startTime + scaledDuration - fadeOutStart);

    if (canUseCurves) {
      gainParam.setValueAtTime(0.001, startTime);
      gainParam.setValueCurveAtTime(FADE_IN_CURVE, startTime, fadeInSec);
      gainParam.setValueAtTime(1.0, fadeOutStart);
      gainParam.setValueCurveAtTime(FADE_OUT_CURVE, fadeOutStart, actualFadeOut);
    } else {
      gainParam.setValueAtTime(0.001, startTime);
      gainParam.linearRampToValueAtTime(1.0, sustainStart);
      gainParam.setValueAtTime(1.0, fadeOutStart);
      gainParam.linearRampToValueAtTime(0.001, fadeOutStart + actualFadeOut);
    }
  }

  /**
   * Stops any active scheduled clip sources immediately.
   */
  public stopActive() {
    for (const node of this.activeNodes) {
      try {
        node.stop();
      } catch {
        // Ignore already-stopped nodes
      }
    }
    this.activeNodes = [];
  }

  /**
   * Schedules and plays a sequence of voice clips with Web Audio API lookahead crossfading.
   */
  public async playClipSequence(params: PlaySequenceParams): Promise<boolean> {
    const shouldAbort = params.shouldAbort ?? (() => false);
    if (shouldAbort() || params.tokens.length === 0) return false;

    const ctx = params.ctx || this.getAudioContext();
    if (!ctx) return false;

    const manifest = await this.loadManifest();
    const spk = manifest?.speakers?.[params.speakerId];
    if (!spk || shouldAbort()) return false;

    const audioBuffer = await this.preloadSpeaker(params.speakerId, ctx);
    if (!audioBuffer || shouldAbort()) return false;

    const rate = this.resolveEffectivePlaybackRate(
      params.role,
      manifest?.version ?? 1,
      params.playbackRate
    );

    const scheduleStart = ctx.currentTime + 0.02;
    const plan = this.computeSchedulePlan(params.tokens, spk.clips, rate, scheduleStart);
    if (plan.items.length === 0) return false;

    const { input: radioInput } = this.createVhfRadioGraph(
      ctx,
      params.role,
      params.volume,
      params.bandpassHz,
      {
        startTimeSec: scheduleStart,
        durationSec: plan.totalDurationSec,
      }
    );

    const sources: AudioBufferSourceNode[] = [];
    for (const item of plan.items) {
      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.playbackRate.value = plan.playbackRate;

      const clipGain = ctx.createGain();
      this.applyEqualPowerEnvelope(
        clipGain.gain,
        item.startTimeSec,
        item.scaledDurationSec,
        item.fadeInSec,
        item.fadeOutSec
      );

      src.connect(clipGain);
      clipGain.connect(radioInput);

      const readOffset = Math.max(0, item.clipOffset - 0.003);
      const readDuration = item.clipDuration + 0.008;
      src.start(item.startTimeSec, readOffset, readDuration);
      sources.push(src);
    }

    this.activeNodes = sources;
    const totalMs = Math.max(80, (scheduleStart + plan.totalDurationSec - ctx.currentTime) * 1000);

    return new Promise<boolean>(resolve => {
      let finished = false;
      const done = (ok: boolean) => {
        if (finished) return;
        finished = true;
        this.activeNodes = [];
        resolve(ok);
      };

      const lastSource = sources[sources.length - 1];
      lastSource.onended = () => done(!shouldAbort());

      setTimeout(() => {
        if (!finished) done(!shouldAbort());
      }, totalMs + 220);
    });
  }

  /**
   * Decodes and plays a complete WAV ArrayBuffer (e.g. from local Kokoro-82M TTS or sample files)
   * directly through the VHF Radio DSP chain with pitch/rate trim and abort safety.
   */
  public async playWavBytes(params: {
    wavBytes: ArrayBuffer;
    role: RadioSpeakerRole;
    volume: number;
    playbackRate?: number;
    bandpassHz?: number;
    ctx?: AudioContext;
    bypassDsp?: boolean;
    settingsOverride?: VhfRadioSettings;
    shouldAbort?: () => boolean;
    onError?: (err: unknown) => void;
  }): Promise<boolean> {
    const shouldAbort = params.shouldAbort ?? (() => false);
    if (shouldAbort() || params.wavBytes.byteLength <= 44) return false;

    const ctx = params.ctx || this.getAudioContext();
    if (!ctx) return false;

    try {
      const decoded = await ctx.decodeAudioData(params.wavBytes.slice(0));
      if (shouldAbort()) return false;
      return this.playAudioBuffer({
        buffer: decoded,
        role: params.role,
        volume: params.volume,
        playbackRate: params.playbackRate,
        bandpassHz: params.bandpassHz,
        ctx,
        bypassDsp: params.bypassDsp,
        settingsOverride: params.settingsOverride,
        shouldAbort,
      });
    } catch (err) {
      params.onError?.(err);
      return false;
    }
  }

  /**
   * Plays a decoded AudioBuffer directly through the Web Audio VHF Radio DSP graph.
   */
  public playAudioBuffer(params: {
    buffer: AudioBuffer;
    role: RadioSpeakerRole;
    volume: number;
    playbackRate?: number;
    bandpassHz?: number;
    ctx?: AudioContext;
    bypassDsp?: boolean;
    settingsOverride?: VhfRadioSettings;
    shouldAbort?: () => boolean;
  }): Promise<boolean> {
    const shouldAbort = params.shouldAbort ?? (() => false);
    const ctx = params.ctx || this.getAudioContext();
    if (!ctx || shouldAbort()) return Promise.resolve(false);

    const rate = Math.max(0.75, Math.min(1.35, params.playbackRate ?? 1.0));
    const now = ctx.currentTime + 0.015;
    const duration = Math.max(0.05, params.buffer.duration / rate);
    const { input: radioInput } = this.createVhfRadioGraph(
      ctx,
      params.role,
      params.volume,
      params.bandpassHz,
      {
        startTimeSec: now,
        durationSec: duration,
        bypassDsp: params.bypassDsp,
        settingsOverride: params.settingsOverride,
      }
    );

    const source = ctx.createBufferSource();
    source.buffer = params.buffer;
    source.playbackRate.value = rate;

    const envGain = ctx.createGain();
    const fadeEdge = Math.min(0.015, duration * 0.2);

    envGain.gain.setValueAtTime(0.001, now);
    envGain.gain.linearRampToValueAtTime(1.0, now + fadeEdge);
    envGain.gain.setValueAtTime(1.0, Math.max(now + fadeEdge, now + duration - fadeEdge));
    envGain.gain.linearRampToValueAtTime(0.001, now + duration);

    source.connect(envGain);
    envGain.connect(radioInput);
    source.start(now);

    this.activeNodes = [source];
    const totalMs = Math.max(80, duration * 1000);

    return new Promise<boolean>(resolve => {
      let finished = false;
      const done = (ok: boolean) => {
        if (finished) return;
        finished = true;
        this.activeNodes = [];
        resolve(ok);
      };

      source.onended = () => done(!shouldAbort());
      setTimeout(() => {
        if (!finished) done(!shouldAbort());
      }, totalMs + 250);
    });
  }
}

export const audioEngine = new AudioEngine();
