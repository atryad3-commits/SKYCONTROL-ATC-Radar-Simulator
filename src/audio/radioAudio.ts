/**
 * 100% Offline Web Audio VHF Radio Simulator & Bundled Real-Human Voice Pack Engine
 * Models:
 * - Zero internet / API dependency at runtime:
 *   1. Primary: Pre-bundled offline Real-Human MP3 Audio Sprite Packs (/voice-pack/)
 *      covering 5 user-selectable Tower voices + 6 distinct international Pilot crew voices
 *      for ALL ATC commands, clearances, readbacks, check-ins, ILS callouts, and emergencies.
 *   2. Fallback: Installed offline OS/browser voices (localService prioritized) + vocal register spread.
 * - Authentic ICAO Annex 10 phraseology & digit normalization ("two seven zero", "niner", "runway two niner right")
 * - Web Audio VHF radio DSP chain (bandpass + radio compressor + PTT mic click + carrier static + squelch tail)
 */

import {
  voicePackPlayer,
  PILOT_PACK_IDS,
  TOWER_PACK_ID_MAP,
  tokenizeForVoicePack,
} from './voicePackPlayer';

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
  packSpeakerId: string;
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
    packSpeakerId: 'tower_charon',
    label: 'Ryan · UK Deep Male Controller',
    shortLabel: 'برج: Ryan (مرد بم · UK)',
    gender: 'M',
    preferredLocale: 'en-GB',
    basePitch: 0.87,
    baseRate: 0.99,
  },
  {
    id: 'fenrir',
    packSpeakerId: 'tower_fenrir',
    label: 'Guy · US Firm Radar Controller',
    shortLabel: 'برج: Guy (مرد جدی · US)',
    gender: 'M',
    preferredLocale: 'en-US',
    basePitch: 0.95,
    baseRate: 1.04,
  },
  {
    id: 'kore',
    packSpeakerId: 'tower_kore',
    label: 'Sonia · UK Clear Female Controller',
    shortLabel: 'برج: Sonia (زن شفاف · UK)',
    gender: 'F',
    preferredLocale: 'en-GB',
    basePitch: 1.09,
    baseRate: 1.01,
  },
  {
    id: 'zephyr',
    packSpeakerId: 'tower_zephyr',
    label: 'Aria · US Calm Female Controller',
    shortLabel: 'برج: Aria (زن آرام · US)',
    gender: 'F',
    preferredLocale: 'en-US',
    basePitch: 1.04,
    baseRate: 0.96,
  },
  {
    id: 'puck',
    packSpeakerId: 'tower_puck',
    label: 'William · AU Brisk Director',
    shortLabel: 'برج: William (چابک · AU)',
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

const PILOT_PACK_LABELS: Record<string, string> = {
  pilot_thomas: 'Capt Thomas (UK)',
  pilot_libby: 'FO Libby (UK)',
  pilot_brian: 'Capt Chris (US)',
  pilot_clara: 'Capt Clara (CA)',
  pilot_prabhat: 'Capt Prabhat (Intl)',
  pilot_connor: 'Capt Connor (EU)',
};

const AIRLINE_PREFERRED_PACK_ORDER: Record<string, readonly string[]> = {
  BAW: ['pilot_thomas', 'pilot_libby', 'pilot_brian', 'pilot_clara', 'pilot_connor', 'pilot_prabhat'],
  VIR: ['pilot_libby', 'pilot_thomas', 'pilot_clara', 'pilot_brian', 'pilot_connor', 'pilot_prabhat'],
  EZY: ['pilot_libby', 'pilot_thomas', 'pilot_connor', 'pilot_clara', 'pilot_brian', 'pilot_prabhat'],
  AAL: ['pilot_brian', 'pilot_clara', 'pilot_thomas', 'pilot_connor', 'pilot_libby', 'pilot_prabhat'],
  DAL: ['pilot_clara', 'pilot_brian', 'pilot_libby', 'pilot_thomas', 'pilot_connor', 'pilot_prabhat'],
  UAL: ['pilot_brian', 'pilot_clara', 'pilot_connor', 'pilot_thomas', 'pilot_libby', 'pilot_prabhat'],
  IRA: ['pilot_prabhat', 'pilot_connor', 'pilot_clara', 'pilot_thomas', 'pilot_libby', 'pilot_brian'],
  UAE: ['pilot_prabhat', 'pilot_clara', 'pilot_brian', 'pilot_connor', 'pilot_thomas', 'pilot_libby'],
  QTR: ['pilot_prabhat', 'pilot_libby', 'pilot_brian', 'pilot_connor', 'pilot_clara', 'pilot_thomas'],
  THY: ['pilot_connor', 'pilot_prabhat', 'pilot_clara', 'pilot_thomas', 'pilot_brian', 'pilot_libby'],
  AFR: ['pilot_clara', 'pilot_connor', 'pilot_libby', 'pilot_thomas', 'pilot_prabhat', 'pilot_brian'],
  DLH: ['pilot_connor', 'pilot_brian', 'pilot_thomas', 'pilot_clara', 'pilot_libby', 'pilot_prabhat'],
  SWR: ['pilot_clara', 'pilot_thomas', 'pilot_connor', 'pilot_brian', 'pilot_libby', 'pilot_prabhat'],
  KLM: ['pilot_connor', 'pilot_libby', 'pilot_thomas', 'pilot_brian', 'pilot_clara', 'pilot_prabhat'],
  RYR: ['pilot_connor', 'pilot_libby', 'pilot_thomas', 'pilot_clara', 'pilot_brian', 'pilot_prabhat'],
};

const PILOT_VOCAL_REGISTERS = [
  { label: 'Senior Capt', pitch: 0.81, rate: 0.95 },
  { label: 'First Officer', pitch: 1.02, rate: 1.04 },
  { label: 'Female Capt', pitch: 1.15, rate: 0.98 },
  { label: 'Baritone Capt', pitch: 0.90, rate: 0.99 },
  { label: 'Female FO', pitch: 1.21, rate: 1.03 },
  { label: 'Line Capt', pitch: 0.96, rate: 0.93 },
];

const TOWER_VOICE_STORAGE_KEY = 'skycontrol_tower_voice_offline_v3';

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
  packSpeakerId: string;
  packLabel: string;
  voiceURI: string | null;
  voiceName: string;
  personaLabel: string;
  pitch: number;
  rate: number;
  packPlaybackRate: number;
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
    /\b(hazel|zira|susan|libby|sonia|jenny|aria|ava|emma|samantha|karen|moira|tessa|fiona|serena|kate|victoria|allison|nicky|heera|kalpana|catherine|martha|clara|female)\b/.test(
      lower
    )
  ) {
    return 'F';
  }
  if (
    /\b(george|david|mark|ryan|daniel|oliver|arthur|alex|aaron|rishi|lee|gordon|malcolm|guy|andrew|brian|thomas|sean|james|ravi|connor|prabhat|william|male)\b/.test(
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

  if (
    /espeak|fred|albert|bells|boing|bubbles|cellos|whisper|zarvox|trinoids|bad news|good news|jester|organ|superstar|wobble|bahh/.test(
      name
    )
  ) {
    score -= 140;
  }

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
): {
  packSpeakerId: string | null;
  voice: T | null;
  pitch: number;
  rate: number;
  label: string;
} {
  // Check exact OS voice selection first
  if (selection.startsWith('voice:')) {
    const targetUri = selection.slice('voice:'.length);
    const ranked = rankOfflineEnglishVoices(voices);
    const exact =
      ranked.find(v => v.voiceURI === targetUri) ||
      voices.find(v => v.voiceURI === targetUri) ||
      null;
    if (exact) {
      return {
        packSpeakerId: null,
        voice: exact,
        pitch: 0.98,
        rate: 1.02,
        label: exact.name,
      };
    }
  }

  const preset =
    TOWER_VOICE_PROFILES.find(p => p.id === selection) || TOWER_VOICE_PROFILES[0];
  const ranked = rankOfflineEnglishVoices(voices);
  const preferredLocale =
    preset.preferredLocale ||
    (airportIcao.toUpperCase() === 'KJFK' ? 'en-US' : 'en-GB');

  let matchedOsVoice: T | null = null;
  if (ranked.length > 0) {
    matchedOsVoice =
      ranked.find(
        v =>
          inferVoiceGender(v.name) === preset.gender &&
          v.lang.toLowerCase().startsWith(preferredLocale.toLowerCase())
      ) ||
      ranked.find(v => inferVoiceGender(v.name) === preset.gender) ||
      ranked[TOWER_VOICE_PROFILES.findIndex(p => p.id === preset.id) % ranked.length];
  }

  return {
    packSpeakerId: preset.packSpeakerId,
    voice: matchedOsVoice,
    pitch: preset.basePitch,
    rate: preset.baseRate,
    label: preset.shortLabel,
  };
}

/**
 * Selects a distinct bundled Real-Human Pilot Pack speaker + OS fallback voice for any callsign:
 * - Spreads concurrent active flights cleanly across all 6 distinct bundled Pilot voices
 * - Preferences match airline region (UK, US, EU, International/Middle-East) when available
 * - Guarantees zero overlap with Tower speakers
 */
export function resolveOfflinePilotProfile<T extends VoiceLike>(
  callsign: string,
  voices: T[],
  towerVoice: T | null,
  options?: RadioExchangeOptions
): PilotVoiceProfile {
  const cleanCallsign = callsign.trim().toUpperCase();
  const hash = hashString(cleanCallsign);
  const prefix = (options?.airline || cleanCallsign.slice(0, 3)).toUpperCase();

  // 1. Choose distinct bundled real-human pilot speaker from the 6-voice pilot pack
  const preferredOrder = AIRLINE_PREFERRED_PACK_ORDER[prefix] || PILOT_PACK_IDS;
  let packSpeakerId = preferredOrder[hash % preferredOrder.length];

  if (options?.activeCallsigns && options.activeCallsigns.length > 0) {
    // Greedily spread active flights across all 6 pilot packs without repeating until >6 flights
    const used = new Set<string>();
    for (const acCs of options.activeCallsigns) {
      const normalizedCs = acCs.trim().toUpperCase();
      const acHash = hashString(normalizedCs);
      const acPrefix = normalizedCs.slice(0, 3);
      const acOrder = AIRLINE_PREFERRED_PACK_ORDER[acPrefix] || PILOT_PACK_IDS;
      let picked = acOrder[acHash % acOrder.length];
      if (used.has(picked)) {
        const free = acOrder.find(id => !used.has(id)) || PILOT_PACK_IDS.find(id => !used.has(id));
        if (free) picked = free;
      }
      used.add(picked);
      if (normalizedCs === cleanCallsign) {
        packSpeakerId = picked;
        break;
      }
    }
  }

  // 2. Fallback OS voice selection (excluding active Tower voice)
  const ranked = rankOfflineEnglishVoices(voices);
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

  const register = PILOT_VOCAL_REGISTERS[(hash >> 1) % PILOT_VOCAL_REGISTERS.length];
  const hasRichVoicePool = pool.length >= 4;

  let pitch = hasRichVoicePool ? 0.94 + ((hash % 5) - 2) * 0.035 : register.pitch;
  let rate = hasRichVoicePool ? 0.97 + (((hash >> 3) % 4) - 1) * 0.025 : register.rate;
  let packPlaybackRate = 0.98 + ((hash >> 2) % 4) * 0.015; // crisp natural 0.98..1.025

  if (options?.isEmergency) {
    rate = Math.min(1.13, rate + 0.07);
    pitch = Math.min(1.16, pitch + 0.04);
    packPlaybackRate = 1.05;
  }

  const carrierCenterHz = 1160 + (hash % 8) * 95;
  const pttClickHz = 700 + (hash % 7) * 65;
  const avionicsHumHz = options?.isHeavy ? 385 + (hash % 3) * 15 : 640 + (hash % 5) * 45;

  const packLabel = PILOT_PACK_LABELS[packSpeakerId] || 'Pilot';
  const airlineName = AIRLINE_CALLSIGNS[prefix] || prefix;

  return {
    packSpeakerId,
    packLabel,
    voiceURI: chosenVoice?.voiceURI || null,
    voiceName: chosenVoice?.name || register.label,
    personaLabel: `${packLabel} · ${airlineName}`,
    pitch: Math.max(0.76, Math.min(1.24, pitch)),
    rate: Math.max(0.88, Math.min(1.14, rate)),
    packPlaybackRate,
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

  text = text.replace(/\b([A-Z]{3})(\d{2,4}[A-Z]?)\b/g, (_, prefix: string, num: string) => {
    const telephony = AIRLINE_CALLSIGNS[prefix];
    if (!telephony) return `${prefix} ${speakDigits(num)}`;
    return `${telephony} ${speakDigits(num)}`;
  });

  text = text.replace(/\b(?:RWY|Runway)\s+(\d{1,2}[LRC]?)\b/gi, (_, rwy: string) => {
    return `runway ${formatRunwayForSpeech(rwy)}`;
  });

  text = text.replace(/\b(?:Flight\s+Level|FL)\s*0*(\d{2,3})\b/gi, (_, fl: string) => {
    return `flight level ${speakDigits(fl.padStart(3, '0'))}`;
  });

  text = text.replace(/\b(\d{1,2},?\d{3})\s*(?:feet|ft)\b/gi, (_, alt: string) => {
    return formatAltitudeForSpeech(alt);
  });

  text = text.replace(/\b(?:heading|hdg)\s+(\d{1,3})\b/gi, (_, hdg: string) => {
    return `heading ${speakDigits(hdg.padStart(3, '0'))}`;
  });

  text = text.replace(/\b(\d{3})\s*(?:knots|kts|kt)\b/gi, (_, spd: string) => {
    return `${speakDigits(spd)} knots`;
  });
  text = text.replace(/\bV1\b/g, 'V one');

  text = text.replace(
    /\bwind\s+(\d{3})\s*(?:degrees\s*)?(?:at|\/)\s*(\d{1,2})(?:\s*(?:knots|kt|kts))?\b/gi,
    (_, dir: string, spd: string) => `wind ${speakDigits(dir)} degrees, ${speakDigits(spd)} knots`
  );

  text = text.replace(/\bQNH\s+(\d{3,4})\b/gi, (_, qnh: string) => `Q N H ${speakDigits(qnh)}`);
  text = text.replace(
    /\b(squawk(?:ing)?)\s+(\d{4})\b/gi,
    (_, word: string, code: string) => `${word} ${speakDigits(code)}`
  );
  text = text.replace(/\b(\d{3})\.(\d{1,3})\b/g, (_, whole: string, frac: string) => {
    const trimmedFrac = frac.replace(/0+$/, '') || '0';
    return `${speakDigits(whole)} decimal ${speakDigits(trimmedFrac)}`;
  });

  text = text.replace(/\bILS\b/g, 'I L S');
  text = text.replace(/\bTMA\b/g, 'terminal area');
  text = text.replace(/\b([A-Z]{2,3})\b/g, code => WAYPOINT_SPEECH_MAP[code] || code);

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

      // Eagerly fetch offline voice-pack manifest
      void voicePackPlayer.loadManifest();

      this.loadVoices();
      if ('speechSynthesis' in window && window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          this.loadVoices();
          this.notifyVoiceListeners();
        };
      }

      const unlockAudio = () => {
        const ctx = this.initAudioContext();
        if (ctx) {
          const packId = TOWER_PACK_ID_MAP[this.towerVoiceId];
          if (packId) void voicePackPlayer.loadSpeakerBuffer(packId, ctx);
        }
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
    return id.startsWith('voice:') || TOWER_VOICE_PROFILES.some(p => p.id === id);
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
    const ctx = this.audioCtx;
    const packId = TOWER_PACK_ID_MAP[voiceId];
    if (ctx && packId) {
      void voicePackPlayer.loadSpeakerBuffer(packId, ctx);
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
    voicePackPlayer.stopActive();
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
   * Checks whether a given transcript is 100% covered by our bundled offline voice pack tokenizer
   */
  public canTokenizeForOfflinePack(rawText: string, role: 'TOWER' | 'PILOT'): boolean {
    const manifest = voicePackPlayer.getManifestSync();
    const spk = manifest
      ? Object.values(manifest.speakers).find(s => s.role === role)
      : undefined;
    return tokenizeForVoicePack(rawText, role, spk?.clips) !== null;
  }

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
      const bedLevel = (speaker === 'PILOT' ? 0.036 : 0.018) * this.volume;
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

  public formatCallsignForSpeech(callsign: string, isHeavy?: boolean): string {
    const clean = callsign.trim().toUpperCase();
    const prefix = clean.slice(0, 3);
    const numbers = clean.slice(3);
    const telephony = AIRLINE_CALLSIGNS[prefix] || prefix;
    const spokenDigits = speakDigits(numbers);
    const heavyTag = isHeavy ? ' heavy' : '';
    return `${telephony} ${spokenDigits}${heavyTag}`.trim();
  }

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

    void this.processQueue();
  }

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

    void this.processQueue();
  }

  private estimateTimeoutMs(text: string): number {
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.min(9500, Math.max(4500, words * 560 + 1800));
  }

  private waitMs(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private speakViaOsFallback(
    spokenText: string,
    params: {
      voice: SpeechSynthesisVoice | null;
      pitch: number;
      rate: number;
      volumeScale: number;
    }
  ): Promise<boolean> {
    return new Promise(resolve => {
      if (!this.isSpeechAvailable) {
        resolve(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.volume = Math.min(1, this.volume * params.volumeScale);
      utterance.rate = params.rate;
      utterance.pitch = params.pitch;
      if (params.voice) {
        utterance.voice = params.voice;
        utterance.lang = params.voice.lang;
      }

      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(tid);
        resolve(ok);
      };

      const tid = setTimeout(() => {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore
        }
        finish(true);
      }, this.estimateTimeoutMs(spokenText));

      utterance.onend = () => finish(true);
      utterance.onerror = () => finish(false);

      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch {
        finish(false);
      }
    });
  }

  private buildRawPilotTextForPack(item: RadioExchangeQueueItem): string {
    const body = item.pilotText.trim();
    const upperCallsign = item.callsign.trim().toUpperCase();
    const prefix = upperCallsign.slice(0, 3);
    const telephony = AIRLINE_CALLSIGNS[prefix] || prefix;
    const alreadyHasCallsign =
      item.options?.pilotHasCallsign ||
      body.toUpperCase().includes(upperCallsign) ||
      body.toLowerCase().includes(telephony.toLowerCase());

    if (alreadyHasCallsign) return body;
    return `${body}, ${item.callsign}${item.options?.isHeavy ? ' heavy' : ''}`;
  }

  private async processQueue() {
    if (this.isBusy || this.exchangeQueue.length === 0 || this.isMuted) return;

    const item = this.exchangeQueue.shift();
    if (!item) return;

    this.isBusy = true;
    const generation = this.queueGeneration;

    try {
      if (this.cachedVoices.length === 0) this.loadVoices();

      const airportIcao = item.options?.airportIcao || this.currentAirportIcao;
      const towerResolved = resolveTowerOfflineVoice(
        this.cachedVoices,
        this.towerVoiceId,
        airportIcao
      );
      const pilotProfile = resolveOfflinePilotProfile(
        item.callsign,
        this.cachedVoices,
        towerResolved.voice,
        item.options
      );

      const ctx = this.initAudioContext();

      // Preload Tower & Pilot bundled sprites in parallel cleanly before transmission starts
      if (ctx) {
        if (towerResolved.packSpeakerId) {
          void voicePackPlayer.loadSpeakerBuffer(towerResolved.packSpeakerId, ctx);
        }
        void voicePackPlayer.loadSpeakerBuffer(pilotProfile.packSpeakerId, ctx);
      }

      if (item.atcText) {
        this.setTransmission({
          callsign: item.callsign,
          speaker: 'ATC',
          voiceLabel: towerResolved.label,
        });
        this.playRadioSquelch(0.06, 'START', 920);
        this.startCarrierBed('ATC');

        let playedFromPack = false;
        if (ctx && towerResolved.packSpeakerId) {
          playedFromPack = await voicePackPlayer.playTransmission({
            ctx,
            speakerId: towerResolved.packSpeakerId,
            role: 'TOWER',
            rawText: item.atcText,
            volume: this.volume,
            playbackRate: item.options?.isEmergency ? 1.05 : 1.0,
            bandpassHz: 1320,
            shouldAbort: () => this.isMuted || generation !== this.queueGeneration,
          });
        }

        if (!playedFromPack && !this.isMuted && generation === this.queueGeneration) {
          const spokenAtc = formatPhraseForSpeech(item.atcText);
          await this.speakViaOsFallback(spokenAtc, {
            voice: towerResolved.voice,
            pitch: towerResolved.pitch,
            rate: item.options?.isEmergency
              ? Math.min(1.12, towerResolved.rate + 0.05)
              : towerResolved.rate,
            volumeScale: 0.96,
          });
        }

        this.stopCarrierBed();
        if (!this.isMuted && generation === this.queueGeneration) {
          this.playRadioSquelch(0.065, 'END', 920);
        }
        this.setTransmission(null);

        if (this.isMuted || generation !== this.queueGeneration) return;
        await this.waitMs(360);
      }

      if (item.onPilotStart) {
        item.onPilotStart();
      }
      if (this.isMuted || generation !== this.queueGeneration) return;

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

      const rawPilot = this.buildRawPilotTextForPack(item);
      let pilotPlayedFromPack = false;
      if (ctx) {
        pilotPlayedFromPack = await voicePackPlayer.playTransmission({
          ctx,
          speakerId: pilotProfile.packSpeakerId,
          role: 'PILOT',
          rawText: rawPilot,
          volume: this.volume,
          playbackRate: pilotProfile.packPlaybackRate,
          bandpassHz: pilotProfile.carrierCenterHz,
          shouldAbort: () => this.isMuted || generation !== this.queueGeneration,
        });
      }

      if (!pilotPlayedFromPack && !this.isMuted && generation === this.queueGeneration) {
        const spokenPilot = formatPhraseForSpeech(rawPilot);
        let fallbackVoice: SpeechSynthesisVoice | null = null;
        if (pilotProfile.voiceURI) {
          fallbackVoice =
            this.cachedVoices.find(v => v.voiceURI === pilotProfile.voiceURI) || null;
        }
        const ok = await this.speakViaOsFallback(spokenPilot, {
          voice: fallbackVoice,
          pitch: pilotProfile.pitch,
          rate: pilotProfile.rate,
          volumeScale: 0.92,
        });
        if (!ok) {
          this.playRogerBeep(pilotProfile.pttClickHz);
        }
      }

      this.stopCarrierBed();
      if (!this.isMuted && generation === this.queueGeneration) {
        this.playRadioSquelch(0.085, 'END', pilotProfile.pttClickHz);
      }
      this.setTransmission(null);
    } finally {
      this.stopCarrierBed();
      this.setTransmission(null);
      if (generation === this.queueGeneration) {
        this.isBusy = false;
        setTimeout(() => {
          void this.processQueue();
        }, 220);
      }
    }
  }
}

export const radioAudio = new RadioAudioEngine();
