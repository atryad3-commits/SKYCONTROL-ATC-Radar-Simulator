/**
 * Procedural Web Audio VHF Radio Simulator & Dual-Role Speech Synthesizer
 * Models:
 * - Distinct ATC Controller Voice vs Pilot Voice (different timbre, pitch, rate, and voice profile)
 * - Automatic sequential timing: ATC speaks -> pause/delay -> Pilot responds with different voice
 * - Microphone clicks, bandpass VHF radio filters, squelch noise bursts, and aviation roger beeps
 */

// Mapping ICAO airline prefixes to real radiotelephony callsigns
const AIRLINE_CALLSIGNS: Record<string, string> = {
  BAW: 'Speedbird',
  VIR: 'Virgin',
  DLH: 'Lufthansa',
  AFR: 'Air France',
  KLM: 'KLM',
  UAE: 'Emirates',
  AAL: 'American',
  DAL: 'Delta',
  UAL: 'United',
  QTR: 'Qatari',
  SWR: 'Swiss',
  IBE: 'Iberia',
  SAS: 'Scandinavian',
  RYR: 'Ryanair',
  EZY: 'Easy',
};

export interface ActiveTransmission {
  callsign: string;
  speaker: 'ATC' | 'PILOT';
}

interface RadioExchangeQueueItem {
  atcText?: string;
  callsign: string;
  pilotText: string;
  onPilotStart?: () => void;
}

export class RadioAudioEngine {
  private audioCtx: AudioContext | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.85;
  private isSpeechAvailable: boolean = typeof window !== 'undefined' && 'speechSynthesis' in window;
  private exchangeQueue: RadioExchangeQueueItem[] = [];
  private isBusy: boolean = false;
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private activeTransmission: ActiveTransmission | null = null;
  private transmissionListeners: Array<(tx: ActiveTransmission | null) => void> = [];

  public onTransmissionChange(cb: (tx: ActiveTransmission | null) => void): () => void {
    this.transmissionListeners.push(cb);
    cb(this.activeTransmission);
    return () => {
      this.transmissionListeners = this.transmissionListeners.filter(l => l !== cb);
    };
  }

  private setTransmission(tx: ActiveTransmission | null) {
    this.activeTransmission = tx;
    for (const listener of this.transmissionListeners) {
      try {
        listener(tx);
      } catch (e) {
        console.error(e);
      }
    }
  }

  public getActiveTransmission(): ActiveTransmission | null {
    return this.activeTransmission;
  }

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadVoices();
      if ('speechSynthesis' in window && window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
      }

      // Resume on user gestures to satisfy browser autoplay requirements
      const unlockAudio = () => {
        this.initAudioContext();
        if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      };

      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
    }
  }

  public initAudioContext(): AudioContext | null {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    this.setTransmission(null);
    if (muted && this.isSpeechAvailable) {
      window.speechSynthesis.cancel();
      this.isBusy = false;
      this.exchangeQueue = [];
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  private loadVoices() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.cachedVoices = window.speechSynthesis.getVoices();
    }
  }

  /**
   * Selects standard authoritative controller voice
   */
  private getATCVoice(): SpeechSynthesisVoice | null {
    if (this.cachedVoices.length === 0) this.loadVoices();
    const enVoices = this.cachedVoices.filter(v => v.lang.startsWith('en'));
    if (enVoices.length === 0) return this.cachedVoices[0] || null;

    // Prefer British English or clear male/natural voice for EGLL Tower
    return (
      enVoices.find(v => v.lang.includes('GB') && (v.name.includes('George') || v.name.includes('Oliver') || v.name.includes('Natural') || v.name.includes('Male'))) ||
      enVoices.find(v => v.lang.includes('GB')) ||
      enVoices.find(v => v.name.includes('David') || v.name.includes('Daniel') || v.name.includes('Guy')) ||
      enVoices[0]
    );
  }

  /**
   * Selects a DISTINCTLY DIFFERENT voice for the pilot (varies per aircraft callsign)
   */
  private getPilotVoice(callsign: string): SpeechSynthesisVoice | null {
    if (this.cachedVoices.length === 0) this.loadVoices();
    const enVoices = this.cachedVoices.filter(v => v.lang.startsWith('en'));
    if (enVoices.length === 0) return this.cachedVoices[0] || null;

    const atcVoice = this.getATCVoice();
    // Filter voices to only those that are NOT the ATC voice
    const otherVoices = enVoices.filter(v => v !== atcVoice);

    if (otherVoices.length > 0) {
      // Deterministically pick pilot voice based on callsign hash
      let hash = 0;
      for (let i = 0; i < callsign.length; i++) {
        hash = (hash << 5) - hash + callsign.charCodeAt(i);
        hash |= 0;
      }
      const idx = Math.abs(hash) % otherVoices.length;
      return otherVoices[idx];
    }

    return atcVoice;
  }

  /**
   * Generates authentic VHF radio squelch noise burst & mic click
   */
  public playRadioSquelch(durationSec: number = 0.10) {
    if (this.isMuted) return;
    const ctx = this.initAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const bufferSize = Math.floor(ctx.sampleRate * durationSec);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.25;
      }

      const noiseNode = ctx.createBufferSource();
      noiseNode.buffer = buffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(1550, now);
      bandpass.Q.setValueAtTime(1.4, now);

      const clickOsc = ctx.createOscillator();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(800, now);
      clickOsc.frequency.exponentialRampToValueAtTime(100, now + 0.02);

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.30 * this.volume, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      clickOsc.connect(clickGain);
      clickGain.connect(ctx.destination);
      clickOsc.start(now);
      clickOsc.stop(now + 0.025);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.01, now);
      noiseGain.gain.linearRampToValueAtTime(0.10 * this.volume, now + 0.015);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

      noiseNode.connect(bandpass);
      bandpass.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noiseNode.start(now);
      noiseNode.stop(now + durationSec);
    } catch {
      // Audio fallback
    }
  }

  /**
   * Generates authentic aviation VHF Roger Beep (two-tone acknowledgment)
   */
  public playRogerBeep() {
    if (this.isMuted) return;
    const ctx = this.initAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1174, now + 0.04);

      gain.gain.setValueAtTime(0.15 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Audio fallback
    }
  }

  /**
   * Generates a conflict alarm warning tone (duo-tone STCA alert)
   */
  public playConflictAlert() {
    if (this.isMuted) return;
    const ctx = this.initAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(659, now + 0.15);
      osc.frequency.setValueAtTime(880, now + 0.3);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1500, now);

      gain.gain.setValueAtTime(0.25 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch {
      // Audio fallback
    }
  }

  /**
   * Converts aircraft callsign into speech telephony
   * e.g. "BAW452" -> "Speedbird 4 5 2"
   */
  public formatCallsignForSpeech(callsign: string): string {
    const prefix = callsign.slice(0, 3).toUpperCase();
    const numbers = callsign.slice(3).split('').join(' ');
    const telephony = AIRLINE_CALLSIGNS[prefix] || prefix;
    return `${telephony} ${numbers}`;
  }

  /**
   * Executes full synchronized exchange:
   * 1. Controller voice speaks the instruction.
   * 2. When instruction ends: realistic pause/delay (900ms) with radio click.
   * 3. Pilot responds with a DIFFERENT voice and distinct pitch/rate.
   */
  public speakRadioExchange(
    atcText: string,
    callsign: string,
    pilotText: string,
    onPilotStart?: () => void
  ) {
    if (this.isMuted) {
      if (onPilotStart) onPilotStart();
      return;
    }

    this.exchangeQueue.push({
      atcText,
      callsign,
      pilotText,
      onPilotStart,
    });

    this.processQueue();
  }

  /**
   * Standalone pilot message (e.g. touchdown or go-around)
   */
  public speakPilotReadback(callsign: string, message: string) {
    if (this.isMuted) return;

    this.exchangeQueue.push({
      callsign,
      pilotText: message,
    });

    this.processQueue();
  }

  private processQueue() {
    if (this.isBusy || this.exchangeQueue.length === 0 || this.isMuted) return;

    const item = this.exchangeQueue.shift();
    if (!item) return;

    this.isBusy = true;

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.playRogerBeep();
      if (item.onPilotStart) item.onPilotStart();
      this.isBusy = false;
      setTimeout(() => this.processQueue(), 300);
      return;
    }

    // Step A: If ATC instruction text is provided, speak ATC voice first!
    if (item.atcText) {
      this.setTransmission({ callsign: item.callsign, speaker: 'ATC' });
      this.playRadioSquelch(0.08);

      const atcUtterance = new SpeechSynthesisUtterance(item.atcText);
      atcUtterance.volume = this.volume;
      atcUtterance.rate = 1.06; // ATC speaks at clear, controlled clip
      atcUtterance.pitch = 1.12; // ATC voice pitch profile

      const atcVoice = this.getATCVoice();
      if (atcVoice) atcUtterance.voice = atcVoice;

      let atcTimeout = setTimeout(() => {
        // Fallback in case of stuck synthesis
        this.setTransmission(null);
        this.runPilotPhase(item);
      }, 4500);

      atcUtterance.onend = () => {
        clearTimeout(atcTimeout);
        this.playRadioSquelch(0.06);
        this.setTransmission(null);

        // Crucial pause/delay after command finishes before pilot replies
        setTimeout(() => {
          this.runPilotPhase(item);
        }, 900);
      };

      atcUtterance.onerror = () => {
        clearTimeout(atcTimeout);
        this.setTransmission(null);
        setTimeout(() => {
          this.runPilotPhase(item);
        }, 800);
      };

      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(atcUtterance);
      } catch {
        this.setTransmission(null);
        this.runPilotPhase(item);
      }
    } else {
      // Direct pilot transmission
      this.runPilotPhase(item);
    }
  }

  private runPilotPhase(item: RadioExchangeQueueItem) {
    // Notify transcript to display pilot message at exact moment pilot starts talking
    if (item.onPilotStart) {
      item.onPilotStart();
    }

    this.setTransmission({ callsign: item.callsign, speaker: 'PILOT' });
    this.playRadioSquelch(0.12);

    const spokenCallsign = this.formatCallsignForSpeech(item.callsign);
    const textToSpeak = `${spokenCallsign}, ${item.pilotText}`;

    const pilotUtterance = new SpeechSynthesisUtterance(textToSpeak);
    pilotUtterance.volume = this.volume;

    // Pilot voice profile: DIFFERENT voice, lower pitch, slightly calmer rate
    let hash = 0;
    for (let i = 0; i < item.callsign.length; i++) {
      hash = (hash << 5) - hash + item.callsign.charCodeAt(i);
      hash |= 0;
    }
    const pitchOffset = ((Math.abs(hash) % 5) - 2) * 0.05;

    pilotUtterance.rate = 0.98;
    pilotUtterance.pitch = Math.max(0.78, Math.min(1.02, 0.88 + pitchOffset)); // Distinctly different from ATC (1.12)

    const pilotVoice = this.getPilotVoice(item.callsign);
    if (pilotVoice) {
      pilotUtterance.voice = pilotVoice;
    }

    let pilotTimeout = setTimeout(() => {
      this.setTransmission(null);
      this.isBusy = false;
      this.processQueue();
    }, 5000);

    pilotUtterance.onend = () => {
      clearTimeout(pilotTimeout);
      this.playRadioSquelch(0.08);
      this.setTransmission(null);
      this.isBusy = false;
      setTimeout(() => this.processQueue(), 250);
    };

    pilotUtterance.onerror = () => {
      clearTimeout(pilotTimeout);
      this.playRogerBeep();
      this.setTransmission(null);
      this.isBusy = false;
      setTimeout(() => this.processQueue(), 250);
    };

    try {
      window.speechSynthesis.speak(pilotUtterance);
    } catch {
      this.playRogerBeep();
      this.setTransmission(null);
      this.isBusy = false;
      setTimeout(() => this.processQueue(), 250);
    }
  }
}

export const radioAudio = new RadioAudioEngine();
