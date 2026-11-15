/**
 * SKYCONTROL - 100% Offline VHF Radio Simulator & Local Kokoro-82M Speech Coordinator
 *
 * Strictly zero cloud APIs / zero external internet required at runtime:
 * 1. Primary Neural TTS: Local Kokoro-82M ONNX engine (15 genuinely distinct neural speaker profiles:
 *    10 Pilots + 3 Tower + 1 Approach + 1 Ground) running in a background Node Worker Thread
 *    with persistent disk + IndexedDB WAV caching and lookahead readback pre-synthesis.
 * 2. Instant Zero-Latency Offline Fallback: Pre-bundled offline MP3 audio sprite packs (/voice-pack/)
 *    for immediate playback while cold models warm up or if a local engine timeout triggers.
 * 3. Last-Resort Fallback: Installed offline OS/browser voices (localService prioritized).
 *
 * All synthesized & cached WAV audio passes through the unified Web Audio VHF Radio DSP chain
 * (320Hz-3350Hz bandpass, AGC radio compressor, PTT mic click, carrier static bed, & squelch tail).
 */

import {
  voicePackPlayer,
  PILOT_PACK_IDS,
  TOWER_PACK_ID_MAP,
  tokenizeForVoicePack,
} from './voicePackPlayer';
import { audioEngine } from '../services/AudioEngine';
import { localTtsClient } from '../services/localTtsClient';
import { audioLibraryClient } from '../services/audioLibraryClient';
import { AudioLibraryManifestEntry } from '../../shared/audioLibraryTypes';
import {
  AIRLINE_CALLSIGNS,
  WAYPOINT_SPEECH_MAP,
  speakDigits,
  formatRunwayForSpeech,
  formatAltitudeForSpeech,
  formatPhraseForSpeech,
} from './phraseNormalizer';
import { DEFAULT_VOICE_PROFILES, VoiceProfile, VoiceType } from '../../shared/ttsTypes';

export {
  AIRLINE_CALLSIGNS,
  WAYPOINT_SPEECH_MAP,
  speakDigits,
  formatRunwayForSpeech,
  formatAltitudeForSpeech,
  formatPhraseForSpeech,
};

export type TowerPresetId = 'charon' | 'fenrir' | 'kore' | 'zephyr' | 'puck';
export type TowerVoiceId = TowerPresetId | `voice:${string}`;

export interface TowerVoiceProfile {
  id: TowerPresetId;
  packSpeakerId: string;
  localProfileId: string;
  voiceType: Exclude<VoiceType, 'PILOT'>;
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
    localProfileId: 'tower_charon',
    voiceType: 'TOWER',
    label: 'Ryan · UK Deep Male Tower Controller',
    shortLabel: 'برج: Ryan (مرد بم · UK)',
    gender: 'M',
    preferredLocale: 'en-GB',
    basePitch: 0.87,
    baseRate: 1.13,
  },
  {
    id: 'fenrir',
    packSpeakerId: 'tower_fenrir',
    localProfileId: 'tower_fenrir',
    voiceType: 'TOWER',
    label: 'Guy · US Firm Male Tower Controller',
    shortLabel: 'برج: Guy (مرد جدی · US)',
    gender: 'M',
    preferredLocale: 'en-US',
    basePitch: 0.95,
    baseRate: 1.16,
  },
  {
    id: 'kore',
    packSpeakerId: 'tower_kore',
    localProfileId: 'tower_kore',
    voiceType: 'TOWER',
    label: 'Sonia · Clear Female Tower Controller',
    shortLabel: 'برج: Sonia (زن شفاف · US/UK)',
    gender: 'F',
    preferredLocale: 'en-GB',
    basePitch: 1.09,
    baseRate: 1.14,
  },
  {
    id: 'zephyr',
    packSpeakerId: 'tower_zephyr',
    localProfileId: 'approach_zephyr',
    voiceType: 'APPROACH',
    label: 'Isabella · UK Calm Approach Director',
    shortLabel: 'اپروچ: Isabella (زن رادار · UK)',
    gender: 'F',
    preferredLocale: 'en-GB',
    basePitch: 1.04,
    baseRate: 1.13,
  },
  {
    id: 'puck',
    packSpeakerId: 'tower_puck',
    localProfileId: 'ground_puck',
    voiceType: 'GROUND',
    label: 'Puck · US Brisk Ground Controller',
    shortLabel: 'گراند: Puck (تاکسی · US)',
    gender: 'M',
    preferredLocale: 'en-US',
    basePitch: 1.01,
    baseRate: 1.17,
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

const PILOT_PACK_LABELS: Record<string, string> = Object.fromEntries(
  DEFAULT_VOICE_PROFILES.filter(p => p.voiceType === 'PILOT').map(p => [
    p.id,
    p.displayName.split('·')[0].trim(),
  ])
);

const ALL_PILOT_PROFILE_IDS = DEFAULT_VOICE_PROFILES.filter(p => p.voiceType === 'PILOT').map(
  p => p.id
);

const AIRLINE_PREFERRED_PACK_ORDER: Record<string, readonly string[]> = {
  BAW: ['pilot_thomas', 'pilot_libby', 'pilot_alice', 'pilot_daniel', 'pilot_clara', 'pilot_brian', 'pilot_connor', 'pilot_nova', 'pilot_liam', 'pilot_prabhat'],
  VIR: ['pilot_libby', 'pilot_alice', 'pilot_thomas', 'pilot_clara', 'pilot_nova', 'pilot_daniel', 'pilot_brian', 'pilot_connor', 'pilot_liam', 'pilot_prabhat'],
  EZY: ['pilot_libby', 'pilot_thomas', 'pilot_connor', 'pilot_alice', 'pilot_nova', 'pilot_daniel', 'pilot_clara', 'pilot_brian', 'pilot_liam', 'pilot_prabhat'],
  AAL: ['pilot_brian', 'pilot_clara', 'pilot_liam', 'pilot_nova', 'pilot_thomas', 'pilot_prabhat', 'pilot_connor', 'pilot_alice', 'pilot_libby', 'pilot_daniel'],
  DAL: ['pilot_clara', 'pilot_brian', 'pilot_nova', 'pilot_liam', 'pilot_libby', 'pilot_thomas', 'pilot_alice', 'pilot_connor', 'pilot_daniel', 'pilot_prabhat'],
  UAL: ['pilot_liam', 'pilot_brian', 'pilot_clara', 'pilot_nova', 'pilot_connor', 'pilot_thomas', 'pilot_prabhat', 'pilot_libby', 'pilot_alice', 'pilot_daniel'],
  IRA: ['pilot_prabhat', 'pilot_daniel', 'pilot_connor', 'pilot_clara', 'pilot_thomas', 'pilot_alice', 'pilot_brian', 'pilot_nova', 'pilot_libby', 'pilot_liam'],
  UAE: ['pilot_prabhat', 'pilot_alice', 'pilot_clara', 'pilot_brian', 'pilot_connor', 'pilot_thomas', 'pilot_nova', 'pilot_daniel', 'pilot_libby', 'pilot_liam'],
  QTR: ['pilot_prabhat', 'pilot_daniel', 'pilot_libby', 'pilot_brian', 'pilot_nova', 'pilot_thomas', 'pilot_clara', 'pilot_alice', 'pilot_connor', 'pilot_liam'],
  THY: ['pilot_connor', 'pilot_prabhat', 'pilot_clara', 'pilot_thomas', 'pilot_liam', 'pilot_libby', 'pilot_daniel', 'pilot_nova', 'pilot_brian', 'pilot_alice'],
  AFR: ['pilot_nova', 'pilot_clara', 'pilot_connor', 'pilot_libby', 'pilot_alice', 'pilot_brian', 'pilot_thomas', 'pilot_daniel', 'pilot_prabhat', 'pilot_liam'],
  DLH: ['pilot_connor', 'pilot_brian', 'pilot_thomas', 'pilot_daniel', 'pilot_clara', 'pilot_libby', 'pilot_alice', 'pilot_nova', 'pilot_liam', 'pilot_prabhat'],
  SWR: ['pilot_clara', 'pilot_alice', 'pilot_connor', 'pilot_thomas', 'pilot_brian', 'pilot_daniel', 'pilot_libby', 'pilot_nova', 'pilot_prabhat', 'pilot_liam'],
  KLM: ['pilot_daniel', 'pilot_libby', 'pilot_connor', 'pilot_thomas', 'pilot_brian', 'pilot_nova', 'pilot_clara', 'pilot_alice', 'pilot_liam', 'pilot_prabhat'],
  RYR: ['pilot_connor', 'pilot_libby', 'pilot_thomas', 'pilot_clara', 'pilot_brian', 'pilot_daniel', 'pilot_alice', 'pilot_liam', 'pilot_nova', 'pilot_prabhat'],
};

const PILOT_VOCAL_REGISTERS = [
  { label: 'Senior Capt', pitch: 0.85, rate: 0.96 },
  { label: 'First Officer', pitch: 1.02, rate: 1.04 },
  { label: 'Female Capt', pitch: 1.14, rate: 0.98 },
  { label: 'Baritone Capt', pitch: 0.91, rate: 0.99 },
  { label: 'Female FO', pitch: 1.19, rate: 1.03 },
  { label: 'Line Capt', pitch: 0.96, rate: 0.94 },
];

const TOWER_VOICE_STORAGE_KEY = 'skycontrol_tower_voice_offline_v3';

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
  pilotHasCallsign?: boolean;
  activeCallsigns?: string[];
  atcRole?: Exclude<VoiceType, 'PILOT'>;
}

export interface PilotVoiceProfile {
  /** Local Kokoro-82M voice profile ID (up to 10 distinct enabled pilot speakers) */
  localProfileId: string;
  /** Legacy sprite pack speaker ID (for zero-latency instant fallback) */
  packSpeakerId: string;
  packLabel: string;
  voiceURI: string | null;
  voiceName: string;
  personaLabel: string;
  pitch: number;
  rate: number;
  packPlaybackRate: number;
  speed: number;
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
    /\b(hazel|zira|susan|libby|sonia|jenny|aria|ava|emma|samantha|karen|moira|tessa|fiona|serena|kate|victoria|allison|nicky|heera|kalpana|catherine|martha|clara|isabella|bella|nova|alice|female)\b/.test(
      lower
    )
  ) {
    return 'F';
  }
  if (
    /\b(george|david|mark|ryan|daniel|oliver|arthur|alex|aaron|rishi|lee|gordon|malcolm|guy|andrew|brian|thomas|sean|james|ravi|connor|prabhat|william|michael|liam|fable|onyx|puck|male)\b/.test(
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

export function inferAtcSubRole(atcText: string): Exclude<VoiceType, 'PILOT'> {
  const lower = atcText.toLowerCase();
  if (
    /\b(vacate|taxi|ground|apron|holding short|line up and wait|cleared for takeoff|cancel takeoff|abort takeoff|hold position)\b/.test(
      lower
    )
  ) {
    return /\b(vacate|taxi|ground|apron|holding short)\b/.test(lower) ? 'GROUND' : 'TOWER';
  }
  if (
    /\b(heading|descend|climb|flight level|speed|direct|route|vectors|hold at|traffic alert|weather update|all stations)\b/.test(
      lower
    )
  ) {
    return 'APPROACH';
  }
  return 'TOWER';
}

export function resolveTowerOfflineVoice<T extends VoiceLike>(
  voices: T[],
  selection: TowerVoiceId,
  airportIcao: string = 'EGLL',
  atcRoleHint?: Exclude<VoiceType, 'PILOT'>,
  availableLocalProfiles?: VoiceProfile[]
): {
  localProfile: VoiceProfile;
  packSpeakerId: string | null;
  voice: T | null;
  pitch: number;
  rate: number;
  label: string;
} {
  const profilesPool = availableLocalProfiles?.length ? availableLocalProfiles : DEFAULT_VOICE_PROFILES;

  if (selection.startsWith('voice:')) {
    const targetUri = selection.slice('voice:'.length);
    const ranked = rankOfflineEnglishVoices(voices);
    const exact =
      ranked.find(v => v.voiceURI === targetUri) ||
      voices.find(v => v.voiceURI === targetUri) ||
      null;
    if (exact) {
      const fallbackLocal =
        profilesPool.find(p => p.voiceType !== 'PILOT' && p.enabled) || profilesPool[0];
      return {
        localProfile: fallbackLocal,
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

  // If preset matches an enabled local profile, use it; or route specialized sub-role if enabled
  let localProfile = profilesPool.find(p => p.id === preset.localProfileId && p.enabled);
  if (!localProfile && atcRoleHint) {
    localProfile = profilesPool.find(p => p.voiceType === atcRoleHint && p.enabled);
  }
  if (!localProfile) {
    localProfile =
      profilesPool.find(p => p.voiceType !== 'PILOT' && p.enabled) || DEFAULT_VOICE_PROFILES[0];
  }

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
    localProfile,
    packSpeakerId: localProfile.voiceConfig.legacyPackId || preset.packSpeakerId,
    voice: matchedOsVoice,
    pitch: preset.basePitch,
    rate: preset.baseRate,
    label: localProfile.shortLabel || preset.shortLabel,
  };
}

/**
 * Selects a genuinely distinct Pilot speaker from the enabled 10-pilot pool
 * (or 6-pilot fallback sprite pack), guaranteeing zero overlap across active flights
 * and never sharing a speaker with ATC Tower/Approach/Ground.
 */
export function resolveOfflinePilotProfile<T extends VoiceLike>(
  callsign: string,
  voices: T[],
  towerVoice: T | null,
  options?: RadioExchangeOptions,
  availableLocalProfiles?: VoiceProfile[]
): PilotVoiceProfile {
  const cleanCallsign = callsign.trim().toUpperCase();
  const hash = hashString(cleanCallsign);
  const prefix = (options?.airline || cleanCallsign.slice(0, 3)).toUpperCase();

  const profilesPool = (availableLocalProfiles?.length ? availableLocalProfiles : DEFAULT_VOICE_PROFILES).filter(
    p => p.voiceType === 'PILOT' && p.enabled
  );
  const enabledPilotIds =
    profilesPool.length > 0 ? profilesPool.map(p => p.id) : ALL_PILOT_PROFILE_IDS;

  const basePreferred = AIRLINE_PREFERRED_PACK_ORDER[prefix] || enabledPilotIds;
  const filteredPreferred = basePreferred.filter(id => enabledPilotIds.includes(id));
  const candidateOrder =
    filteredPreferred.length > 0
      ? [...filteredPreferred, ...enabledPilotIds.filter(id => !filteredPreferred.includes(id))]
      : enabledPilotIds;

  let localProfileId = candidateOrder[hash % candidateOrder.length];
  const getPackForProfileId = (id: string) =>
    profilesPool.find(p => p.id === id)?.voiceConfig.legacyPackId ||
    DEFAULT_VOICE_PROFILES.find(p => p.id === id)?.voiceConfig.legacyPackId ||
    id;

  let packSpeakerId = getPackForProfileId(localProfileId);

  if (options?.activeCallsigns && options.activeCallsigns.length > 0) {
    const used = new Set<string>();
    const usedPacks = new Set<string>();
    for (const acCs of options.activeCallsigns) {
      const normalizedCs = acCs.trim().toUpperCase();
      const acHash = hashString(normalizedCs);
      const acPrefix = normalizedCs.slice(0, 3);
      const acBase = (AIRLINE_PREFERRED_PACK_ORDER[acPrefix] || enabledPilotIds).filter(id =>
        enabledPilotIds.includes(id)
      );
      const acOrder = acBase.length > 0 ? acBase : enabledPilotIds;

      let picked = acOrder[acHash % acOrder.length];
      if (used.has(picked) || (usedPacks.size < PILOT_PACK_IDS.length && usedPacks.has(getPackForProfileId(picked)))) {
        const freeWithUnusedPack =
          usedPacks.size < PILOT_PACK_IDS.length
            ? acOrder.find(id => !used.has(id) && !usedPacks.has(getPackForProfileId(id))) ||
              enabledPilotIds.find(id => !used.has(id) && !usedPacks.has(getPackForProfileId(id)))
            : undefined;
        const free =
          freeWithUnusedPack ||
          acOrder.find(id => !used.has(id)) ||
          enabledPilotIds.find(id => !used.has(id));
        if (free) picked = free;
      }
      used.add(picked);
      usedPacks.add(getPackForProfileId(picked));
      if (normalizedCs === cleanCallsign) {
        localProfileId = picked;
        packSpeakerId = getPackForProfileId(picked);
        break;
      }
    }
  }

  const matchedProfile =
    profilesPool.find(p => p.id === localProfileId) ||
    DEFAULT_VOICE_PROFILES.find(p => p.id === localProfileId) ||
    DEFAULT_VOICE_PROFILES.find(p => p.voiceType === 'PILOT')!;

  if (!packSpeakerId) {
    packSpeakerId =
      matchedProfile.voiceConfig.legacyPackId ||
      PILOT_PACK_IDS[hash % PILOT_PACK_IDS.length];
  }

  // Fallback OS voice selection (excluding active Tower voice)
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
  let rate = hasRichVoicePool ? 1.10 + (((hash >> 3) % 4) - 1) * 0.025 : register.rate * 1.12;
  let packPlaybackRate = 0.99 + ((hash >> 2) % 4) * 0.012;
  let kokoroSpeed = matchedProfile.speed;

  if (options?.isEmergency) {
    rate = Math.min(1.22, rate + 0.06);
    pitch = Math.min(1.16, pitch + 0.04);
    packPlaybackRate = 1.05;
    kokoroSpeed = Math.min(1.3, kokoroSpeed + 0.06);
  }

  const carrierCenterHz = matchedProfile.voiceConfig.carrierCenterHz || 1160 + (hash % 8) * 95;
  const pttClickHz = matchedProfile.voiceConfig.pttClickHz || 700 + (hash % 7) * 65;
  const avionicsHumHz = options?.isHeavy
    ? 385 + (hash % 3) * 15
    : matchedProfile.voiceConfig.avionicsHumHz || 640 + (hash % 5) * 45;

  const packLabel = PILOT_PACK_LABELS[localProfileId] || matchedProfile.displayName.split('·')[0].trim();
  const airlineName = AIRLINE_CALLSIGNS[prefix] || prefix;

  return {
    localProfileId,
    packSpeakerId,
    packLabel,
    voiceURI: chosenVoice?.voiceURI || null,
    voiceName: chosenVoice?.name || register.label,
    personaLabel: `${packLabel} · ${airlineName}`,
    pitch: Math.max(0.76, Math.min(1.24, pitch)),
    rate: Math.max(0.88, Math.min(1.14, rate)),
    packPlaybackRate,
    speed: kokoroSpeed,
    carrierCenterHz,
    pttClickHz,
    avionicsHumHz,
  };
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

      // Eagerly fetch offline voice-pack manifest & sync 15 local Kokoro profiles
      void voicePackPlayer.loadManifest();
      void localTtsClient.fetchProfiles();

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
          audioEngine.setAudioContext(ctx);
          const packId = TOWER_PACK_ID_MAP[this.towerVoiceId];
          if (packId) void voicePackPlayer.loadSpeakerBuffer(packId, ctx);
          void audioEngine.preloadAllSpeakers(ctx);
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
    audioEngine.stopActive();
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
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => undefined);
      }
      audioEngine.setAudioContext(this.audioCtx);
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
    const localProfiles = localTtsClient.getProfilesSync();
    const towerResolved = resolveTowerOfflineVoice(
      this.cachedVoices,
      this.towerVoiceId,
      options?.airportIcao || this.currentAirportIcao,
      options?.atcRole,
      localProfiles
    );
    return resolveOfflinePilotProfile(
      callsign,
      this.cachedVoices,
      towerResolved.voice,
      options,
      localProfiles
    );
  }

  public canTokenizeForOfflinePack(rawText: string, role: 'TOWER' | 'PILOT'): boolean {
    const manifest = voicePackPlayer.getManifestSync();
    const spk = manifest
      ? Object.values(manifest.speakers).find(s => s.role === role)
      : undefined;
    return tokenizeForVoicePack(rawText, role, spk?.clips) !== null;
  }

  /**
   * Auditions any of the 15 voice profiles by playing its local Kokoro-82M WAV sample
   * (or dynamically synthesizing custom text) right through the VHF transceiver DSP chain!
   */
  public async auditionVoiceProfile(
    profile: VoiceProfile,
    customText?: string
  ): Promise<boolean> {
    const ctx = this.initAudioContext();
    if (!ctx) return false;

    const role: 'TOWER' | 'PILOT' = profile.voiceType === 'PILOT' ? 'PILOT' : 'TOWER';
    this.clearQueue();

    let wavBytes: ArrayBuffer | null = null;
    if (customText && customText.trim().length > 0) {
      const res = await localTtsClient.synthesizeWav({
        rawText: customText,
        voiceId: profile.id,
        voiceType: profile.voiceType,
        speed: profile.speed,
        priority: 'high',
      });
      wavBytes = res?.wavBytes || null;
    } else {
      wavBytes = await localTtsClient.fetchProfileSampleWav(profile.id, false);
    }

    if (!wavBytes) return false;

    this.setTransmission({
      callsign: profile.voiceType === 'PILOT' ? 'SAMPLE' : profile.voiceType,
      speaker: role === 'TOWER' ? 'ATC' : 'PILOT',
      voiceLabel: profile.shortLabel,
    });
    this.playRadioSquelch(0.055, 'START', profile.voiceConfig.pttClickHz || 920);
    this.startCarrierBed(role === 'TOWER' ? 'ATC' : 'PILOT', {
      carrierCenterHz: profile.voiceConfig.carrierCenterHz || 1350,
      avionicsHumHz: profile.voiceConfig.avionicsHumHz || 400,
    });

    const ok = await audioEngine.playWavBytes({
      ctx,
      wavBytes,
      role,
      volume: this.volume,
      playbackRate: profile.pitch || 1.0,
      bandpassHz: profile.voiceConfig.bandpassHz || 1400,
      shouldAbort: () => this.isMuted,
    });

    this.stopCarrierBed();
    this.playRadioSquelch(0.06, 'END', profile.voiceConfig.pttClickHz || 920);
    this.setTransmission(null);
    return ok;
  }

  /**
   * Previews any pre-generated Audio Library asset either through the VHF radio transceiver DSP
   * chain ('vhf') or as clean dry studio WAV PCM ('dry').
   */
  public async previewLibraryAsset(
    entry: AudioLibraryManifestEntry,
    mode: 'vhf' | 'dry' = 'vhf'
  ): Promise<boolean> {
    const ctx = this.initAudioContext();
    if (!ctx) return false;

    this.clearQueue();
    const generation = this.queueGeneration;
    const wavBytes = await audioLibraryClient.fetchAssetAudioBytes(entry.assetId);
    if (generation !== this.queueGeneration || wavBytes.byteLength <= 44) return false;

    const profiles = localTtsClient.getProfilesSync();
    const profile =
      profiles.find(p => p.id === entry.voiceId) ||
      DEFAULT_VOICE_PROFILES.find(p => p.id === entry.voiceId);
    const role: 'TOWER' | 'PILOT' = entry.voiceType === 'PILOT' ? 'PILOT' : 'TOWER';

    if (mode === 'dry') {
      const decoded = await ctx.decodeAudioData(wavBytes.slice(0));
      if (generation !== this.queueGeneration) return false;
      return new Promise<boolean>(resolve => {
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(Math.max(0.05, this.volume), ctx.currentTime);
        src.connect(gain);
        gain.connect(ctx.destination);
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };
        src.onended = () => finish(true);
        src.start();
        setTimeout(() => finish(true), decoded.duration * 1000 + 200);
      });
    }

    this.setTransmission({
      callsign: entry.voiceType === 'PILOT' ? 'LIB · PILOT' : `LIB · ${entry.voiceType}`,
      speaker: role === 'TOWER' ? 'ATC' : 'PILOT',
      voiceLabel: profile?.shortLabel || entry.voiceId,
    });
    this.playRadioSquelch(0.055, 'START', profile?.voiceConfig.pttClickHz || 920);
    this.startCarrierBed(role === 'TOWER' ? 'ATC' : 'PILOT', {
      carrierCenterHz: profile?.voiceConfig.carrierCenterHz || 1350,
      avionicsHumHz: profile?.voiceConfig.avionicsHumHz || 400,
    });

    const ok = await audioEngine.playWavBytes({
      ctx,
      wavBytes,
      role,
      volume: this.volume,
      playbackRate: profile?.pitch || 1.0,
      bandpassHz: profile?.voiceConfig.bandpassHz || 1400,
      shouldAbort: () => this.isMuted || generation !== this.queueGeneration,
    });

    this.stopCarrierBed();
    if (generation === this.queueGeneration) {
      this.playRadioSquelch(0.06, 'END', profile?.voiceConfig.pttClickHz || 920);
      this.setTransmission(null);
    }
    return ok;
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
        speaker === 'PILOT' ? acoustics?.carrierCenterHz ?? 1480 : acoustics?.carrierCenterHz ?? 1260,
        now
      );
      bandpass.Q.setValueAtTime(speaker === 'PILOT' ? 1.25 : 1.05, now);

      const humOsc = ctx.createOscillator();
      humOsc.type = 'sine';
      humOsc.frequency.setValueAtTime(
        speaker === 'PILOT' ? acoustics?.avionicsHumHz ?? 400 : acoustics?.avionicsHumHz ?? 110,
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

      const localProfiles = localTtsClient.getProfilesSync();
      const airportIcao = item.options?.airportIcao || this.currentAirportIcao;
      const atcSubRole =
        item.options?.atcRole || (item.atcText ? inferAtcSubRole(item.atcText) : 'TOWER');

      const towerResolved = resolveTowerOfflineVoice(
        this.cachedVoices,
        this.towerVoiceId,
        airportIcao,
        atcSubRole,
        localProfiles
      );
      const pilotProfile = resolveOfflinePilotProfile(
        item.callsign,
        this.cachedVoices,
        towerResolved.voice,
        item.options,
        localProfiles
      );

      const ctx = this.initAudioContext();
      const rawPilot = item.pilotText.trim().length > 0 ? this.buildRawPilotTextForPack(item) : '';

      // Preload offline sprite buffers AND trigger non-blocking background Kokoro pre-synthesis
      // for Pilot readback while ATC is speaking!
      if (ctx) {
        if (towerResolved.packSpeakerId) {
          void voicePackPlayer.loadSpeakerBuffer(towerResolved.packSpeakerId, ctx);
        }
        void voicePackPlayer.loadSpeakerBuffer(pilotProfile.packSpeakerId, ctx);
      }
      if (rawPilot) {
        localTtsClient.prewarmPhrase({
          rawText: rawPilot,
          voiceId: pilotProfile.localProfileId,
          voiceType: 'PILOT',
          speed: pilotProfile.speed,
        });
      }

      // === 1. ATC CONTROLLER TRANSMISSION ===
      if (item.atcText) {
        this.setTransmission({
          callsign: item.callsign,
          speaker: 'ATC',
          voiceLabel: towerResolved.label,
        });
        this.playRadioSquelch(0.055, 'START', towerResolved.localProfile.voiceConfig.pttClickHz || 920);
        this.startCarrierBed('ATC', {
          carrierCenterHz: towerResolved.localProfile.voiceConfig.carrierCenterHz || 1260,
          avionicsHumHz: towerResolved.localProfile.voiceConfig.avionicsHumHz || 110,
        });

        let playedAtc = false;
        const canUseSpriteFallback =
          Boolean(towerResolved.packSpeakerId) &&
          this.canTokenizeForOfflinePack(item.atcText, 'TOWER');

        // Tier 1: Local Kokoro-82M Neural TTS (IndexedDB cached or Worker synthesized WAV)
        if (ctx && !this.towerVoiceId.startsWith('voice:')) {
          const kokoroRes = await localTtsClient.synthesizeWav({
            rawText: item.atcText,
            voiceId: towerResolved.localProfile.id,
            voiceType: towerResolved.localProfile.voiceType,
            speed: item.options?.isEmergency
              ? Math.min(1.3, towerResolved.localProfile.speed + 0.06)
              : towerResolved.localProfile.speed,
            priority: item.options?.isEmergency ? 'critical' : 'high',
            timeoutMs: canUseSpriteFallback ? 1100 : 4800,
          });
          if (kokoroRes && !this.isMuted && generation === this.queueGeneration) {
            playedAtc = await audioEngine.playWavBytes({
              ctx,
              wavBytes: kokoroRes.wavBytes,
              role: 'TOWER',
              volume: this.volume,
              playbackRate: towerResolved.localProfile.pitch || 1.0,
              bandpassHz: towerResolved.localProfile.voiceConfig.bandpassHz || 1360,
              shouldAbort: () => this.isMuted || generation !== this.queueGeneration,
            });
          }
        }

        // Tier 2: Zero-Latency Bundled Offline Sprite Pack Fallback
        if (!playedAtc && ctx && towerResolved.packSpeakerId && !this.isMuted && generation === this.queueGeneration) {
          playedAtc = await voicePackPlayer.playTransmission({
            ctx,
            speakerId: towerResolved.packSpeakerId,
            role: 'TOWER',
            rawText: item.atcText,
            volume: this.volume,
            playbackRate: item.options?.isEmergency ? 1.05 : 1.01,
            bandpassHz: 1360,
            shouldAbort: () => this.isMuted || generation !== this.queueGeneration,
          });
        }

        // Tier 3: Installed Local OS Speech Fallback
        if (!playedAtc && !this.isMuted && generation === this.queueGeneration) {
          const spokenAtc = formatPhraseForSpeech(item.atcText);
          await this.speakViaOsFallback(spokenAtc, {
            voice: towerResolved.voice,
            pitch: towerResolved.pitch,
            rate: item.options?.isEmergency
              ? Math.min(1.22, towerResolved.rate + 0.05)
              : towerResolved.rate,
            volumeScale: 0.96,
          });
        }

        this.stopCarrierBed();
        if (!this.isMuted && generation === this.queueGeneration) {
          this.playRadioSquelch(0.055, 'END', towerResolved.localProfile.voiceConfig.pttClickHz || 920);
        }
        this.setTransmission(null);

        if (this.isMuted || generation !== this.queueGeneration) return;
        if (rawPilot.length > 0) {
          await this.waitMs(210);
        }
      }

      if (item.onPilotStart) {
        item.onPilotStart();
      }
      if (this.isMuted || generation !== this.queueGeneration) return;

      // === 2. PILOT READBACK / CALL-IN TRANSMISSION ===
      if (rawPilot.length > 0) {
        this.setTransmission({
          callsign: item.callsign,
          speaker: 'PILOT',
          voiceLabel: pilotProfile.personaLabel,
        });
        this.playRadioSquelch(0.06, 'START', pilotProfile.pttClickHz);
        this.startCarrierBed('PILOT', {
          carrierCenterHz: pilotProfile.carrierCenterHz,
          avionicsHumHz: pilotProfile.avionicsHumHz,
        });

        let playedPilot = false;
        const canUsePilotSprite = this.canTokenizeForOfflinePack(rawPilot, 'PILOT');

        // Tier 1: Local Kokoro-82M Neural TTS (likely already cached from lookahead!)
        if (ctx) {
          const kokoroPilotRes = await localTtsClient.synthesizeWav({
            rawText: rawPilot,
            voiceId: pilotProfile.localProfileId,
            voiceType: 'PILOT',
            speed: pilotProfile.speed,
            priority: item.options?.isEmergency ? 'critical' : 'high',
            timeoutMs: canUsePilotSprite ? 1100 : 4800,
          });
          if (kokoroPilotRes && !this.isMuted && generation === this.queueGeneration) {
            playedPilot = await audioEngine.playWavBytes({
              ctx,
              wavBytes: kokoroPilotRes.wavBytes,
              role: 'PILOT',
              volume: this.volume,
              playbackRate: 1.0,
              bandpassHz: pilotProfile.carrierCenterHz,
              shouldAbort: () => this.isMuted || generation !== this.queueGeneration,
            });
          }
        }

        // Tier 2: Zero-Latency Bundled Offline Sprite Pack Fallback
        if (!playedPilot && ctx && !this.isMuted && generation === this.queueGeneration) {
          playedPilot = await voicePackPlayer.playTransmission({
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

        // Tier 3: Installed Local OS Speech Fallback
        if (!playedPilot && !this.isMuted && generation === this.queueGeneration) {
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
          this.playRadioSquelch(0.075, 'END', pilotProfile.pttClickHz);
        }
        this.setTransmission(null);
      }
    } finally {
      this.stopCarrierBed();
      this.setTransmission(null);
      if (generation === this.queueGeneration) {
        this.isBusy = false;
        setTimeout(() => {
          void this.processQueue();
        }, 130);
      }
    }
  }
}

export const radioAudio = new RadioAudioEngine();
