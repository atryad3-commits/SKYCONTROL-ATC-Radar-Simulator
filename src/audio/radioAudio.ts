/**
 * 100% Offline Web Audio VHF Radio Simulator & Multi-Voice Radiotelephony Engine
 * Models:
 * - Zero internet / API dependency: uses installed offline local OS/browser voices + Web Audio DSP
 * - Prioritizes localService (offline-ready) human voices over cloud voices that stall offline
 * - User-selectable Tower ATC controller persona OR exact installed device voice
 * - Per-flight distinct pilot voices (strictly excluding Tower voice) + multi-register timbre & cockpit mic EQ
 * - Authentic ICAO Annex 10 phraseology & digit normalization ("two seven zero", "niner", "runway two niner right")
 * - Continuous subtle VHF carrier static bed + PTT mic key-down click + squelch tail release
 */

export const AIRLINE_CALLSIGNS: Record<string, string> = {
  BAW: 'Speedbird',
  IRA: 'Iranair',
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
  THY: 'Turkish',
  SKY: 'Skyline',
};

export type TowerPresetId = 'charon' | 'fenrir' | 'kore' | 'zephyr' | 'puck';
export type TowerVoiceId = TowerPresetId | `voice:${string}`;

export interface TowerVoiceProfile {
  id: TowerPresetId;
  label: string;
  shortLabel: string;
  gender: 'M' | 'F';
  preferredLocale: string;
  basePitch: number;
  baseRate: number;
}

export const TOWER_VOICE_PROFILES: TowerVoiceProfile[] = [
  {
    id: 'charon',
    label: 'Senior Male Controller (Deep)',
    shortLabel: 'برج: مرد بم (UK)',
    gender: 'M',
    preferredLocale: 'en-GB',
    basePitch: 0.87,
    baseRate: 0.99,
  },
  {
    id: 'fenrir',
    label: 'Radar Male Controller (Firm)',
    shortLabel: 'برج: مرد جدی (US)',
    gender: 'M',
    preferredLocale: 'en-US',
    basePitch: 0.95,
    baseRate: 1.04,
  },
  {
    id: 'kore',
    label: 'Tower Female Controller (Clear)',
    shortLabel: 'برج: زن شفاف (UK)',
    gender: 'F',
    preferredLocale: 'en-GB',
    basePitch: 1.09,
    baseRate: 1.01,
  },
  {
    id: 'zephyr',
    label: 'Approach Female Controller (Calm)',
    shortLabel: 'برج: زن آرام (US)',
    gender: 'F',
    preferredLocale: 'en-US',
    basePitch: 1.04,
    baseRate: 0.96,
  },
  {
    id: 'puck',
    label: 'Director Controller (Brisk)',
    shortLabel: 'برج: دایرکتور چابک',
    gender: 'M',
    preferredLocale: 'en-AU',
    basePitch: 1.01,
    baseRate: 1.07,
  },
];

export interface OfflineVoiceOption {
  voiceURI: string;
  name: string;
  displayName: string;
  lang: string;
  localService: boolean;
  gender: 'M' | 'F' | 'N';
}

export interface VoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
}

const PILOT_VOCAL_REGISTERS = [
  { label: 'Senior Capt', pitch: 0.81, rate: 0.95 },
  { label: 'First Officer', pitch: 1.02, rate: 1.04 },
  { label: 'Female Capt', pitch: 1.15, rate: 0.98 },
  { label: 'Baritone Capt', pitch: 0.90, rate: 0.99 },
  { label: 'Female FO', pitch: 1.21, rate: 1.03 },
  { label: 'Line Capt', pitch: 0.96, rate: 0.93 },
];

const TOWER_VOICE_STORAGE_KEY = 'skycontrol_tower_voice_offline_v2';

const ICAO_DIGITS: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'niner',
};

const WAYPOINT_SPEECH_MAP: Record<string, string> = {
  BNN: 'Bovingdon',
  LAM: 'Lambourne',
  BIG: 'Biggin',
  OCK: 'Ockham',
  VR: 'Varamin',
  MEH: 'Mehrabad',
  RUS: 'Rudeshur',
  SAV: 'Saveh',
  JFK: 'Kennedy',
  DPK: 'Deer Park',
  CAM: 'Camrn',
  CRI: 'Canarsie',
  LND: 'Lindy',
};

export interface ActiveTransmission {
  callsign: string;
  speaker: 'ATC' | 'PILOT';
  voiceLabel?: string;
}

export interface RadioExchangeOptions {
  airportIcao?: string;
  airline?: string;
  aircraftType?: string;
  isEmergency?: boolean;
  isHeavy?: boolean;
  /** If true, pilotText already contains callsign in natural position (e.g. initial call-in) */
  pilotHasCallsign?: boolean;
  /** Currently active callsigns in sector to spread distinct voices cleanly */
  activeCallsigns?: string[];
}

export interface PilotVoiceProfile {
  voiceURI: string | null;
  voiceName: string;
  personaLabel: string;
  pitch: number;
  rate: number;
  carrierCenterHz: number;
  pttClickHz: number;
  avionicsHumHz: number;
}

interface RadioExchangeQueueItem {
  atcText?: string;
  callsign: string;
  pilotText: string;
  onPilotStart?: () => void;
  options?: RadioExchangeOptions;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function inferVoiceGender(name: string): 'M' | 'F' | 'N' {
  const lower = name.toLowerCase();
  if (
    /\b(hazel|zira|susan|libby|sonia|jenny|aria|ava|emma|samantha|karen|moira|tessa|fiona|serena|kate|victoria|allison|nicky|heera|kalpana|catherine|martha|female)\b/.test(
      lower
    )
  ) {
    return 'F';
  }
  if (
    /\b(george|david|mark|ryan|daniel|oliver|arthur|alex|aaron|rishi|lee|gordon|malcolm|guy|andrew|brian|thomas|sean|james|ravi|male)\b/.test(
      lower
    )
  ) {
    return 'M';
  }
  return 'N';
}

export function scoreOfflineVoice(voice: VoiceLike): number {
  const name = voice.name.toLowerCase();
  let score = 0;

  // Strongly prioritize offline-capable local OS voices so speechSynthesis works with 0 network
  if (voice.localService) score += 80;
  if (name.includes('natural')) score += 45;
  if (name.includes('enhanced') || name.includes('premium')) score += 35;
  if (name.includes('neural')) score += 30;
  if (name.includes('microsoft')) score += 22;
  if (
    /george|oliver|daniel|arthur|ryan|libby|sonia|guy|andrew|brian|jenny|aria|ava|emma|samantha|karen|moira|hazel|david|mark|zira|rishi|tessa/.test(
      name
    )
  ) {
    score += 20;
  }

  // Penalize robotic novelty OS voices
  if (
    /espeak|fred|albert|bells|boing|bubbles|cellos|whisper|zarvox|trinoids|bad news|good news|jester|organ|superstar|wobble|bahh/.test(
      name
    )
  ) {
    score -= 140;
  }

  // Prefer natural English aviation locales
  const lang = voice.lang.toLowerCase();
  if (/^en-(gb|us|au|ca|ie|in|za|nz)/.test(lang)) score += 12;

  return score;
}

export function rankOfflineEnglishVoices<T extends VoiceLike>(voices: T[]): T[] {
  const enVoices = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
  const pool = enVoices.length > 0 ? enVoices : voices;
  const offlineCapable = pool.filter(v => v.localService);
  const workingPool =
    typeof navigator !== 'undefined' && navigator.onLine === false && offlineCapable.length > 0
      ? offlineCapable
      : pool;

  return [...workingPool].sort((a, b) => scoreOfflineVoice(b) - scoreOfflineVoice(a));
}

export function resolveTowerOfflineVoice<T extends VoiceLike>(
  voices: T[],
  selection: TowerVoiceId,
  airportIcao: string = 'EGLL'
): { voice: T | null; pitch: number; rate: number; label: string } {
  const ranked = rankOfflineEnglishVoices(voices);
  if (ranked.length === 0) {
    const preset =
      TOWER_VOICE_PROFILES.find(p => p.id === selection) || TOWER_VOICE_PROFILES[0];
    return {
      voice: null,
      pitch: preset.basePitch,
      rate: preset.baseRate,
      label: preset.shortLabel,
    };
  }

  // Exact device voice chosen by user (`voice:<voiceURI>`)
  if (selection.startsWith('voice:')) {
    const targetUri = selection.slice('voice:'.length);
    const exact = ranked.find(v => v.voiceURI === targetUri) || voices.find(v => v.voiceURI === targetUri);
    if (exact) {
      return {
        voice: exact,
        pitch: 0.98,
        rate: 1.02,
        label: exact.name,
      };
    }
  }

  const preset =
    TOWER_VOICE_PROFILES.find(p => p.id === selection) || TOWER_VOICE_PROFILES[0];
  const preferredLocale =
    preset.preferredLocale ||
    (airportIcao.toUpperCase() === 'KJFK' ? 'en-US' : 'en-GB');

  // 1. Exact gender + preferred locale + high offline score
  const exactMatch = ranked.find(
    v =>
      inferVoiceGender(v.name) === preset.gender &&
      v.lang.toLowerCase().startsWith(preferredLocale.toLowerCase())
  );
  if (exactMatch) {
    return {
      voice: exactMatch,
      pitch: preset.basePitch,
      rate: preset.baseRate,
      label: `${exactMatch.name} · ${preset.shortLabel}`,
    };
  }

  // 2. Match gender across any local English voice
  const genderMatch = ranked.find(v => inferVoiceGender(v.name) === preset.gender);
  if (genderMatch) {
    return {
      voice: genderMatch,
      pitch: preset.basePitch,
      rate: preset.baseRate,
      label: `${genderMatch.name} · ${preset.shortLabel}`,
    };
  }

  // 3. Spread presets cleanly if gender labels aren't present on OS voices
  const presetIdx = TOWER_VOICE_PROFILES.findIndex(p => p.id === preset.id);
  const picked = ranked[presetIdx % ranked.length];
  return {
    voice: picked,
    pitch: preset.basePitch,
    rate: preset.baseRate,
    label: preset.shortLabel,
  };
}

/**
 * Resolves a distinct offline pilot voice profile for a given callsign:
 * - Strictly excludes the active Tower voice when >= 2 OS voices exist
 * - Spreads concurrent aircraft across all distinct installed offline voices
 * - Applies calibrated vocal register (pitch + rate) & cockpit VHF radio acoustics so even
 *   with minimal OS voices, every aircraft sounds distinct from Tower and other flights
 */
export function resolveOfflinePilotProfile<T extends VoiceLike>(
  callsign: string,
  voices: T[],
  towerVoice: T | null,
  options?: RadioExchangeOptions
): PilotVoiceProfile {
  const cleanCallsign = callsign.trim().toUpperCase();
  const hash = hashString(cleanCallsign);
  const ranked = rankOfflineEnglishVoices(voices);

  // Exclude active Tower voice when alternative voices exist
  const distinctVoices = ranked.filter(v => !towerVoice || v.voiceURI !== towerVoice.voiceURI);
  const pool = distinctVoices.length > 0 ? distinctVoices : ranked;

  let chosenVoice: T | null = null;
  if (pool.length > 0) {
    let idx = hash % pool.length;
    if (options?.activeCallsigns && options.activeCallsigns.length > 0) {
      const activeIdx = options.activeCallsigns.findIndex(
        c => c.trim().toUpperCase() === cleanCallsign
      );
      if (activeIdx >= 0) {
        const seedOffset = hashString(options.activeCallsigns[0] || '') % pool.length;
        idx = (seedOffset + activeIdx) % pool.length;
      }
    }
    chosenVoice = pool[idx];
  }

  // Calibrate natural human vocal register spread:
  // wider vocal range when fewer OS voices exist so two pilots never sound identical
  const register = PILOT_VOCAL_REGISTERS[(hash >> 1) % PILOT_VOCAL_REGISTERS.length];
  const hasRichVoicePool = pool.length >= 4;

  let pitch = hasRichVoicePool
    ? 0.94 + ((hash % 5) - 2) * 0.035 // 0.87..1.01
    : register.pitch;
  let rate = hasRichVoicePool
    ? 0.97 + (((hash >> 3) % 4) - 1) * 0.025 // 0.94..1.02
    : register.rate;

  if (options?.isEmergency) {
    rate = Math.min(1.13, rate + 0.07);
    pitch = Math.min(1.16, pitch + 0.04);
  }

  // Unique per-aircraft VHF hardware signature (bandpass center, PTT key click pitch, avionics bus hum)
  const carrierCenterHz = 1160 + (hash % 8) * 95; // 1160..1825 Hz
  const pttClickHz = 700 + (hash % 7) * 65; // 700..1090 Hz
  const avionicsHumHz = options?.isHeavy ? 385 + (hash % 3) * 15 : 640 + (hash % 5) * 45;

  const prefix = (options?.airline || cleanCallsign.slice(0, 3)).toUpperCase();
  const airlineName = AIRLINE_CALLSIGNS[prefix] || prefix;

  return {
    voiceURI: chosenVoice?.voiceURI || null,
    voiceName: chosenVoice?.name || register.label,
    personaLabel: chosenVoice
      ? `${chosenVoice.name.replace(/^Microsoft\s+/i, '').split(' - ')[0]} · ${airlineName}`
      : `${register.label} · ${airlineName}`,
    pitch: Math.max(0.76, Math.min(1.24, pitch)),
    rate: Math.max(0.88, Math.min(1.14, rate)),
    carrierCenterHz,
    pttClickHz,
    avionicsHumHz,
  };
}

/**
 * Converts a string of digits into spaced ICAO words (e.g. "095" -> "zero niner five")
 */
export function speakDigits(digits: string): string {
  return digits
    .split('')
    .map(ch => ICAO_DIGITS[ch] ?? ch)
    .join(' ');
}

/**
 * Converts runway identifier into ICAO phraseology (e.g. "29R" -> "two niner right")
 */
export function formatRunwayForSpeech(runwayId: string): string {
  const match = runwayId.trim().toUpperCase().match(/^(\d{1,2})([LRC])?$/);
  if (!match) return runwayId;
  const numWords = speakDigits(match[1].padStart(2, '0'));
  const sideMap: Record<string, string> = {
    L: 'left',
    R: 'right',
    C: 'center',
  };
  const side = match[2] ? ` ${sideMap[match[2]]}` : '';
  return `${numWords}${side}`;
}

/**
 * Converts altitude in feet or flight level into natural ICAO aviation speech
 */
export function formatAltitudeForSpeech(altText: string): string {
  const flMatch = altText.trim().toUpperCase().match(/^FL\s*0*(\d{2,3})$/);
  if (flMatch) {
    return `flight level ${speakDigits(flMatch[1].padStart(3, '0'))}`;
  }
  const num = parseInt(altText.replace(/,/g, ''), 10);
  if (Number.isNaN(num)) return altText;
  if (num >= 1000) {
    const thousands = Math.floor(num / 1000);
    const hundreds = Math.round((num % 1000) / 100);
    const thousandWords = speakDigits(String(thousands));
    if (hundreds > 0) {
      return `${thousandWords} thousand ${speakDigits(String(hundreds))} hundred feet`;
    }
    return `${thousandWords} thousand feet`;
  }
  return `${num} feet`;
}

/**
 * Normalizes aviation transcripts into authentic spoken ICAO English
 */
export function formatPhraseForSpeech(rawText: string): string {
  let text = rawText;

  // 1. Replace ICAO aircraft callsigns (e.g., BAW452, IRA712)
  text = text.replace(/\b([A-Z]{3})(\d{2,4}[A-Z]?)\b/g, (_, prefix: string, num: string) => {
    const telephony = AIRLINE_CALLSIGNS[prefix];
    if (!telephony) return `${prefix} ${speakDigits(num)}`;
    return `${telephony} ${speakDigits(num)}`;
  });

  // 2. Replace Runway designators ("runway 27R", "RWY 29L")
  text = text.replace(/\b(?:RWY|Runway)\s+(\d{1,2}[LRC]?)\b/gi, (_, rwy: string) => {
    return `runway ${formatRunwayForSpeech(rwy)}`;
  });

  // 3. Replace Flight Levels ("FL100", "FL 090", "Flight Level 100")
  text = text.replace(/\b(?:Flight\s+Level|FL)\s*0*(\d{2,3})\b/gi, (_, fl: string) => {
    return `flight level ${speakDigits(fl.padStart(3, '0'))}`;
  });

  // 4. Replace Altitudes ("3,500 feet", "4000 ft")
  text = text.replace(/\b(\d{1,2},?\d{3})\s*(?:feet|ft)\b/gi, (_, alt: string) => {
    return formatAltitudeForSpeech(alt);
  });

  // 5. Replace Headings ("heading 090", "HDG 275")
  text = text.replace(/\b(?:heading|hdg)\s+(\d{1,3})\b/gi, (_, hdg: string) => {
    return `heading ${speakDigits(hdg.padStart(3, '0'))}`;
  });

  // 6. Replace Airspeeds ("180 knots", "210kt")
  text = text.replace(/\b(\d{3})\s*(?:knots|kts|kt)\b/gi, (_, spd: string) => {
    return `${speakDigits(spd)} knots`;
  });
  text = text.replace(/\bV1\b/g, 'V one');

  // 7. Replace Wind strings ("wind 260 at 14", "wind 270 degrees 15 knots")
  text = text.replace(
    /\bwind\s+(\d{3})\s*(?:degrees\s*)?(?:at|\/)\s*(\d{1,2})(?:\s*(?:knots|kt|kts))?\b/gi,
    (_, dir: string, spd: string) => `wind ${speakDigits(dir)} degrees, ${speakDigits(spd)} knots`
  );

  // 8. Replace QNH / Squawk / Frequencies
  text = text.replace(/\bQNH\s+(\d{3,4})\b/gi, (_, qnh: string) => `Q N H ${speakDigits(qnh)}`);
  text = text.replace(
    /\b(squawk(?:ing)?)\s+(\d{4})\b/gi,
    (_, word: string, code: string) => `${word} ${speakDigits(code)}`
  );
  text = text.replace(/\b(\d{3})\.(\d{1,3})\b/g, (_, whole: string, frac: string) => {
    const trimmedFrac = frac.replace(/0+$/, '') || '0';
    return `${speakDigits(whole)} decimal ${speakDigits(trimmedFrac)}`;
  });

  // 9. Expand abbreviations & well-known waypoint names
  text = text.replace(/\bILS\b/g, 'I L S');
  text = text.replace(/\bTMA\b/g, 'terminal area');
  text = text.replace(/\b([A-Z]{2,3})\b/g, code => WAYPOINT_SPEECH_MAP[code] || code);

  // 10. Clean technical parentheses/slashes so TTS reads smoothly
  text = text.replace(/\s*·\s*/g, ', ').replace(/[()]/g, ', ');
  return text.replace(/\s+/g, ' ').trim();
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
  private voiceListeners: Array<(voices: OfflineVoiceOption[]) => void> = [];
  private currentAirportIcao: string = 'EGLL';
  private towerVoiceId: TowerVoiceId = 'charon';
  private queueGeneration: number = 0;
  private carrierNodes: {
    noiseSource: AudioBufferSourceNode;
    humOsc: OscillatorNode;
    masterGain: GainNode;
  } | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const storedVoice = window.localStorage.getItem(TOWER_VOICE_STORAGE_KEY) as TowerVoiceId | null;
        if (storedVoice && this.isValidTowerSelection(storedVoice)) {
          this.towerVoiceId = storedVoice;
        }
      } catch {
        // Ignore storage errors
      }

      this.loadVoices();
      if ('speechSynthesis' in window && window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          this.loadVoices();
          this.notifyVoiceListeners();
        };
      }

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

  private isValidTowerSelection(id: string): id is TowerVoiceId {
    return (
      id.startsWith('voice:') ||
      TOWER_VOICE_PROFILES.some(p => p.id === id)
    );
  }

  public getTowerVoiceId(): TowerVoiceId {
    return this.towerVoiceId;
  }

  public setTowerVoiceId(voiceId: TowerVoiceId) {
    if (!this.isValidTowerSelection(voiceId)) return;
    this.towerVoiceId = voiceId;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(TOWER_VOICE_STORAGE_KEY, voiceId);
      } catch {
        // Ignore storage errors
      }
    }
  }

  public getAvailableOfflineVoices(): OfflineVoiceOption[] {
    if (this.cachedVoices.length === 0) this.loadVoices();
    const ranked = rankOfflineEnglishVoices(this.cachedVoices);
    return ranked.map(v => ({
      voiceURI: v.voiceURI,
      name: v.name,
      displayName: `${v.name.replace(/^Microsoft\s+/i, '').replace(/\s+-\s+English.*$/i, '')} (${v.lang}${v.localService ? ' · Offline' : ''})`,
      lang: v.lang,
      localService: v.localService,
      gender: inferVoiceGender(v.name),
    }));
  }

  public onVoicesChange(cb: (voices: OfflineVoiceOption[]) => void): () => void {
    this.voiceListeners.push(cb);
    cb(this.getAvailableOfflineVoices());
    return () => {
      this.voiceListeners = this.voiceListeners.filter(l => l !== cb);
    };
  }

  private notifyVoiceListeners() {
    const list = this.getAvailableOfflineVoices();
    for (const listener of this.voiceListeners) {
      try {
        listener(list);
      } catch (e) {
        console.error(e);
      }
    }
  }

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

  public setAirportContext(icao: string) {
    this.currentAirportIcao = icao.toUpperCase();
  }

  public clearQueue() {
    this.queueGeneration += 1;
    this.exchangeQueue = [];
    this.isBusy = false;
    this.stopCarrierBed();
    this.setTransmission(null);
    if (this.isSpeechAvailable) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore browser cancel exceptions
      }
    }
  }

  public initAudioContext(): AudioContext | null {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => undefined);
    }
    return this.audioCtx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.clearQueue();
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

  public getPilotVoiceForCallsign(
    callsign: string,
    options?: RadioExchangeOptions
  ): PilotVoiceProfile {
    if (this.cachedVoices.length === 0) this.loadVoices();
    const towerResolved = resolveTowerOfflineVoice(
      this.cachedVoices,
      this.towerVoiceId,
      options?.airportIcao || this.currentAirportIcao
    );
    return resolveOfflinePilotProfile(
      callsign,
      this.cachedVoices,
      towerResolved.voice,
      options
    );
  }

  /**
   * Starts a continuous offline VHF carrier static bed tailored per speaker / aircraft mic
   */
  private startCarrierBed(
    speaker: 'ATC' | 'PILOT',
    acoustics?: { carrierCenterHz: number; avionicsHumHz: number }
  ) {
    if (this.isMuted) return;
    const ctx = this.initAudioContext();
    if (!ctx) return;

    this.stopCarrierBed();

    try {
      const now = ctx.currentTime;
      const bufferSize = Math.floor(ctx.sampleRate * 2);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.14;
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      noiseSource.loop = true;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(
        speaker === 'PILOT' ? acoustics?.carrierCenterHz ?? 1480 : 1260,
        now
      );
      bandpass.Q.setValueAtTime(speaker === 'PILOT' ? 1.25 : 1.05, now);

      const humOsc = ctx.createOscillator();
      humOsc.type = 'sine';
      humOsc.frequency.setValueAtTime(
        speaker === 'PILOT' ? acoustics?.avionicsHumHz ?? 400 : 110,
        now
      );

      const humGain = ctx.createGain();
      humGain.gain.setValueAtTime((speaker === 'PILOT' ? 0.004 : 0.0014) * this.volume, now);

      const masterGain = ctx.createGain();
      const bedLevel = (speaker === 'PILOT' ? 0.04 : 0.02) * this.volume;
      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.linearRampToValueAtTime(bedLevel, now + 0.03);

      noiseSource.connect(bandpass);
      bandpass.connect(masterGain);
      humOsc.connect(humGain);
      humGain.connect(masterGain);
      masterGain.connect(ctx.destination);

      noiseSource.start(now);
      humOsc.start(now);

      this.carrierNodes = { noiseSource, humOsc, masterGain };
    } catch {
      // Audio fallback
    }
  }

  private stopCarrierBed() {
    if (!this.carrierNodes || !this.audioCtx) return;
    const nodes = this.carrierNodes;
    this.carrierNodes = null;

    try {
      const now = this.audioCtx.currentTime;
      nodes.masterGain.gain.cancelScheduledValues(now);
      nodes.masterGain.gain.setValueAtTime(nodes.masterGain.gain.value, now);
      nodes.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      nodes.noiseSource.stop(now + 0.05);
      nodes.humOsc.stop(now + 0.05);
    } catch {
      // Ignore already-stopped nodes
    }
  }

  /**
   * Generates authentic VHF PTT mic key-down click or squelch release burst
   */
  public playRadioSquelch(
    durationSec: number = 0.09,
    phase: 'START' | 'END' = 'START',
    clickFreqHz: number = 920
  ) {
    if (this.isMuted) return;
    const ctx = this.initAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const bufferSize = Math.floor(ctx.sampleRate * durationSec);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (phase === 'END' ? 0.34 : 0.2);
      }

      const noiseNode = ctx.createBufferSource();
      noiseNode.buffer = buffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(phase === 'END' ? 1850 : 1400, now);
      bandpass.Q.setValueAtTime(1.5, now);

      const clickOsc = ctx.createOscillator();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(phase === 'START' ? clickFreqHz : clickFreqHz * 0.68, now);
      clickOsc.frequency.exponentialRampToValueAtTime(110, now + 0.018);

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.18 * this.volume, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);

      clickOsc.connect(clickGain);
      clickGain.connect(ctx.destination);
      clickOsc.start(now);
      clickOsc.stop(now + 0.022);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.005, now);
      noiseGain.gain.linearRampToValueAtTime((phase === 'END' ? 0.09 : 0.055) * this.volume, now + 0.012);
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
   * Generates subtle aviation VHF Roger Beep (fallback tone)
   */
  public playRogerBeep(freqHz: number = 920) {
    if (this.isMuted) return;
    const ctx = this.initAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqHz, now);
      osc.frequency.setValueAtTime(freqHz * 1.32, now + 0.035);

      gain.gain.setValueAtTime(0.11 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // Audio fallback
    }
  }

  /**
   * Generates STCA conflict alarm warning tone
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
      osc.frequency.setValueAtTime(659, now + 0.14);
      osc.frequency.setValueAtTime(880, now + 0.28);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1550, now);

      gain.gain.setValueAtTime(0.22 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.42);
    } catch {
      // Audio fallback
    }
  }

  /**
   * Converts aircraft callsign into ICAO spoken telephony
   * e.g. "BAW459" -> "Speedbird four five niner"
   */
  public formatCallsignForSpeech(callsign: string, isHeavy?: boolean): string {
    const clean = callsign.trim().toUpperCase();
    const prefix = clean.slice(0, 3);
    const numbers = clean.slice(3);
    const telephony = AIRLINE_CALLSIGNS[prefix] || prefix;
    const spokenDigits = speakDigits(numbers);
    const heavyTag = isHeavy ? ' heavy' : '';
    return `${telephony} ${spokenDigits}${heavyTag}`.trim();
  }

  /**
   * Queues a full synchronized ATC -> Pilot readback exchange (100% offline).
   */
  public speakRadioExchange(
    atcText: string,
    callsign: string,
    pilotText: string,
    onPilotStart?: () => void,
    options?: RadioExchangeOptions
  ) {
    if (this.isMuted) {
      if (onPilotStart) onPilotStart();
      return;
    }

    if (this.exchangeQueue.length >= 4) {
      this.exchangeQueue = this.exchangeQueue.slice(-2);
    }

    this.exchangeQueue.push({
      atcText,
      callsign,
      pilotText,
      onPilotStart,
      options,
    });

    this.processQueue();
  }

  /**
   * Queues a standalone pilot transmission (e.g., initial radar check-in, established localizer, touchdown, Mayday).
   */
  public speakPilotReadback(
    callsign: string,
    message: string,
    options?: RadioExchangeOptions
  ) {
    if (this.isMuted) return;

    if (this.exchangeQueue.length >= 4 && !options?.isEmergency) {
      return;
    }

    this.exchangeQueue.push({
      callsign,
      pilotText: message,
      options: {
        pilotHasCallsign: true,
        ...options,
      },
    });

    this.processQueue();
  }

  private estimateTimeoutMs(text: string): number {
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.min(9500, Math.max(4500, words * 560 + 1800));
  }

  private processQueue() {
    if (this.isBusy || this.exchangeQueue.length === 0 || this.isMuted) return;

    const item = this.exchangeQueue.shift();
    if (!item) return;

    this.isBusy = true;
    const generation = this.queueGeneration;

    if (!this.isSpeechAvailable) {
      this.playRogerBeep();
      if (item.onPilotStart) item.onPilotStart();
      this.isBusy = false;
      setTimeout(() => this.processQueue(), 300);
      return;
    }

    if (this.cachedVoices.length === 0) this.loadVoices();

    const airportIcao = item.options?.airportIcao || this.currentAirportIcao;
    const towerResolved = resolveTowerOfflineVoice(
      this.cachedVoices,
      this.towerVoiceId,
      airportIcao
    );

    if (item.atcText) {
      const spokenAtc = formatPhraseForSpeech(item.atcText);
      this.setTransmission({
        callsign: item.callsign,
        speaker: 'ATC',
        voiceLabel: towerResolved.label,
      });
      this.playRadioSquelch(0.06, 'START', 920);
      this.startCarrierBed('ATC');

      const atcUtterance = new SpeechSynthesisUtterance(spokenAtc);
      atcUtterance.volume = Math.min(1, this.volume * 0.96);
      atcUtterance.rate = item.options?.isEmergency
        ? Math.min(1.12, towerResolved.rate + 0.05)
        : towerResolved.rate;
      atcUtterance.pitch = towerResolved.pitch;

      if (towerResolved.voice) {
        atcUtterance.voice = towerResolved.voice;
        atcUtterance.lang = towerResolved.voice.lang;
      }

      let settled = false;
      const finishAtc = (delayMs: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(atcTimeout);
        this.stopCarrierBed();
        if (generation !== this.queueGeneration || this.isMuted) {
          this.setTransmission(null);
          this.isBusy = false;
          return;
        }
        this.playRadioSquelch(0.065, 'END', 920);
        this.setTransmission(null);
        setTimeout(() => {
          if (generation === this.queueGeneration) {
            this.runPilotPhase(item, towerResolved.voice, generation);
          }
        }, delayMs);
      };

      const atcTimeout = setTimeout(() => {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore
        }
        finishAtc(340);
      }, this.estimateTimeoutMs(spokenAtc));

      atcUtterance.onend = () => finishAtc(480);
      atcUtterance.onerror = () => finishAtc(300);

      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(atcUtterance);
      } catch {
        finishAtc(280);
      }
    } else {
      this.runPilotPhase(item, towerResolved.voice, generation);
    }
  }

  private runPilotPhase(
    item: RadioExchangeQueueItem,
    towerVoice: SpeechSynthesisVoice | null,
    generation: number
  ) {
    if (item.onPilotStart) {
      item.onPilotStart();
    }

    if (this.isMuted || generation !== this.queueGeneration) {
      this.isBusy = false;
      return;
    }

    const pilotProfile = resolveOfflinePilotProfile(
      item.callsign,
      this.cachedVoices,
      towerVoice,
      item.options
    );

    this.setTransmission({
      callsign: item.callsign,
      speaker: 'PILOT',
      voiceLabel: pilotProfile.personaLabel,
    });
    this.playRadioSquelch(0.07, 'START', pilotProfile.pttClickHz);
    this.startCarrierBed('PILOT', {
      carrierCenterHz: pilotProfile.carrierCenterHz,
      avionicsHumHz: pilotProfile.avionicsHumHz,
    });

    const spokenBody = formatPhraseForSpeech(item.pilotText);
    const spokenCallsign = this.formatCallsignForSpeech(item.callsign, item.options?.isHeavy);

    const alreadyHasCallsign =
      item.options?.pilotHasCallsign ||
      spokenBody.toLowerCase().includes(spokenCallsign.toLowerCase().split(' ')[0]);

    const textToSpeak = alreadyHasCallsign
      ? spokenBody
      : `${spokenBody}, ${spokenCallsign}`;

    const pilotUtterance = new SpeechSynthesisUtterance(textToSpeak);
    pilotUtterance.volume = Math.min(1, this.volume * 0.92);
    pilotUtterance.rate = pilotProfile.rate;
    pilotUtterance.pitch = pilotProfile.pitch;

    if (pilotProfile.voiceURI) {
      const matchedVoice = this.cachedVoices.find(v => v.voiceURI === pilotProfile.voiceURI);
      if (matchedVoice) {
        pilotUtterance.voice = matchedVoice;
        pilotUtterance.lang = matchedVoice.lang;
      }
    }

    let settled = false;
    const finishPilot = (hadError: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(pilotTimeout);
      this.stopCarrierBed();
      if (hadError && !this.isMuted) {
        this.playRogerBeep(pilotProfile.pttClickHz);
      } else if (!this.isMuted) {
        this.playRadioSquelch(0.085, 'END', pilotProfile.pttClickHz);
      }
      this.setTransmission(null);
      if (generation === this.queueGeneration) {
        this.isBusy = false;
        setTimeout(() => this.processQueue(), 240);
      }
    };

    const pilotTimeout = setTimeout(() => {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
      finishPilot(false);
    }, this.estimateTimeoutMs(textToSpeak));

    pilotUtterance.onend = () => finishPilot(false);
    pilotUtterance.onerror = () => finishPilot(true);

    try {
      window.speechSynthesis.speak(pilotUtterance);
    } catch {
      finishPilot(true);
    }
  }
}

export const radioAudio = new RadioAudioEngine();
