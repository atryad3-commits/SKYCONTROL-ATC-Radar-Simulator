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
  ActiveCarrierBedHandle,
  DEFAULT_VHF_SETTINGS,
  playVhfPttTransient,
  sanitizeVhfSettings,
  startVhfCarrierBed,
  stopVhfCarrierBed,
  VHF_RADIO_PRESETS,
  VhfQualityPresetId,
  VhfRadioSettings,
} from './vhfRadioDsp';
import {
  AIRLINE_CALLSIGNS,
  WAYPOINT_SPEECH_MAP,
  AtcStationRole,
  StructuredFlightContext,
  speakDigits,
  speakAlphanumericTokens,
  formatRegistrationForSpeech,
  formatCallsignForSpeech as grammarFormatCallsign,
  formatRunwayForSpeech,
  formatAltitudeForSpeech,
  formatHeadingForSpeech,
  formatAirspeedForSpeech,
  formatFrequencyForSpeech,
  formatSquawkForSpeech,
  formatWaypointForSpeech,
  formatNavigationForSpeech,
  buildPilotInitialContact,
  formatPhraseForSpeech,
} from './phraseNormalizer';
import {
  AssignedPilotIdentity,
  AssignedStationController,
  VoiceAssignmentRegistry,
  voiceAssignmentRegistry,
} from './voiceAssignmentRegistry';
import {
  CommsDirection,
  CommsManagerSnapshot,
  CommsPriority,
  CommsQueuePayload,
  DEFAULT_PTT_TIMING,
  PttTimingConfig,
  RadioCommsManager,
} from './commsManager';
import { DEFAULT_VOICE_PROFILES, VoiceProfile, VoiceType } from '../../shared/ttsTypes';

export {
  AIRLINE_CALLSIGNS,
  WAYPOINT_SPEECH_MAP,
  speakDigits,
  speakAlphanumericTokens,
  formatRegistrationForSpeech,
  formatRunwayForSpeech,
  formatAltitudeForSpeech,
  formatHeadingForSpeech,
  formatAirspeedForSpeech,
  formatFrequencyForSpeech,
  formatSquawkForSpeech,
  formatWaypointForSpeech,
  formatNavigationForSpeech,
  buildPilotInitialContact,
  formatPhraseForSpeech,
  VoiceAssignmentRegistry,
  voiceAssignmentRegistry,
  RadioCommsManager,
  DEFAULT_PTT_TIMING,
};
export type {
  AtcStationRole,
  StructuredFlightContext,
  AssignedPilotIdentity,
  AssignedStationController,
  CommsDirection,
  CommsManagerSnapshot,
  CommsPriority,
  PttTimingConfig,
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
const VHF_DSP_STORAGE_KEY = 'skycontrol_vhf_dsp_settings_v1';

export interface ActiveTransmission {
  txId?: string;
  callsign: string;
  speaker: 'ATC' | 'PILOT';
  voiceLabel?: string;
  frequency?: string;
  stationRole?: AtcStationRole;
  priority?: CommsPriority;
}

export interface RadioExchangeOptions {
  airportIcao?: string;
  aircraftId?: string;
  registration?: string;
  airline?: string;
  telephony?: string;
  flightNumber?: string;
  aircraftType?: string;
  frequency?: string;
  priority?: CommsPriority;
  direction?: CommsDirection;
  isEmergency?: boolean;
  isHeavy?: boolean;
  pilotHasCallsign?: boolean;
  activeCallsigns?: string[];
  atcRole?: Exclude<VoiceType, 'PILOT'>;
  atcSpokenText?: string;
  pilotSpokenText?: string;
  onAtcStart?: () => void;
  onCancelled?: (reason: string) => void;
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
  private commsManager = new RadioCommsManager<RadioExchangeOptions>();
  private voiceRegistry = voiceAssignmentRegistry;
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private activeTransmission: ActiveTransmission | null = null;
  private transmissionListeners: Array<(tx: ActiveTransmission | null) => void> = [];
  private voiceListeners: Array<(voices: OfflineVoiceOption[]) => void> = [];
  private currentAirportIcao: string = 'EGLL';
  private towerVoiceId: TowerVoiceId = 'charon';
  private carrierNodes: ActiveCarrierBedHandle | null = null;
  private vhfSettings: VhfRadioSettings = { ...DEFAULT_VHF_SETTINGS };
  private vhfSettingsListeners: Array<(settings: VhfRadioSettings) => void> = [];

  constructor() {
    this.commsManager.setExecutor((item, ctx) => this.executeQueuedTransmission(item, ctx));

    if (typeof window !== 'undefined') {
      try {
        const storedVoice = window.localStorage.getItem(TOWER_VOICE_STORAGE_KEY) as TowerVoiceId | null;
        if (storedVoice && this.isValidTowerSelection(storedVoice)) {
          this.towerVoiceId = storedVoice;
        }
        const rawDsp = window.localStorage.getItem(VHF_DSP_STORAGE_KEY);
        if (rawDsp) {
          const parsed = JSON.parse(rawDsp) as Partial<VhfRadioSettings>;
          this.vhfSettings = sanitizeVhfSettings(parsed);
        }
      } catch {
        // Ignore storage errors
      }
      audioEngine.setVhfSettings(this.vhfSettings);

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
          audioEngine.setVhfSettings(this.vhfSettings);
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

  public getVhfSettings(): VhfRadioSettings {
    return { ...this.vhfSettings };
  }

  public onVhfSettingsChange(cb: (settings: VhfRadioSettings) => void): () => void {
    this.vhfSettingsListeners.push(cb);
    cb({ ...this.vhfSettings });
    return () => {
      this.vhfSettingsListeners = this.vhfSettingsListeners.filter(l => l !== cb);
    };
  }

  private persistAndBroadcastVhfSettings() {
    audioEngine.setVhfSettings(this.vhfSettings);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(VHF_DSP_STORAGE_KEY, JSON.stringify(this.vhfSettings));
      } catch {
        // Ignore storage errors
      }
    }
    const snapshot = { ...this.vhfSettings };
    for (const listener of this.vhfSettingsListeners) {
      try {
        listener(snapshot);
      } catch (e) {
        console.error(e);
      }
    }
  }

  public setVhfPreset(presetId: Exclude<VhfQualityPresetId, 'custom'>): VhfRadioSettings {
    const def = VHF_RADIO_PRESETS[presetId];
    if (!def) return this.getVhfSettings();
    this.vhfSettings = sanitizeVhfSettings({
      preset: def.id,
      ...def.settings,
    });
    this.persistAndBroadcastVhfSettings();
    return this.getVhfSettings();
  }

  public updateVhfSettings(patch: Partial<VhfRadioSettings>): VhfRadioSettings {
    const next = sanitizeVhfSettings({
      ...this.vhfSettings,
      ...patch,
      preset: patch.preset ?? 'custom',
    });
    this.vhfSettings = next;
    this.persistAndBroadcastVhfSettings();
    return this.getVhfSettings();
  }

  public resetVhfSettings(): VhfRadioSettings {
    this.vhfSettings = { ...DEFAULT_VHF_SETTINGS };
    this.persistAndBroadcastVhfSettings();
    return this.getVhfSettings();
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
    this.voiceRegistry.clearStations();
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
    this.commsManager.clearAll('QUEUE_CLEARED');
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

  public cancelCallsignTransmissions(callsignOrAircraftId: string): number {
    const cancelled = this.commsManager.cancelForCallsign(callsignOrAircraftId, 'FLIGHT_CANCELLED');
    if (cancelled > 0) {
      const snap = this.commsManager.getSnapshot();
      if (!snap.activeTx) {
        voicePackPlayer.stopActive();
        audioEngine.stopActive();
        this.stopCarrierBed();
        this.setTransmission(null);
      }
    }
    return cancelled;
  }

  public cancelTransmissionById(txId: string): boolean {
    return this.commsManager.cancelById(txId);
  }

  public cancelFrequency(frequency: string): number {
    return this.commsManager.cancelFrequency(frequency);
  }

  public pruneActiveAircraft(activeIdsOrCallsigns: Iterable<string>): number {
    return this.voiceRegistry.pruneInactiveAircraft(activeIdsOrCallsigns);
  }

  public releaseAircraftVoice(idOrCallsign: string): boolean {
    return this.voiceRegistry.releaseAircraft(idOrCallsign);
  }

  public getCommsQueueSnapshot(): CommsManagerSnapshot {
    return this.commsManager.getSnapshot();
  }

  public onCommsQueueChange(cb: (snapshot: CommsManagerSnapshot) => void): () => void {
    return this.commsManager.onSnapshotChange(cb);
  }

  public getPttTiming(): PttTimingConfig {
    return this.commsManager.getPttTiming();
  }

  public setPttTiming(patch: Partial<PttTimingConfig>): PttTimingConfig {
    return this.commsManager.setPttTiming(patch);
  }

  public getVoiceAssignmentSnapshot() {
    return this.voiceRegistry.getSnapshot();
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

  /**
   * Resolves consistent ATC station controller voice for an airport facility (TOWER / APPROACH / GROUND).
   */
  public resolveStationControllerVoice(params: {
    airportIcao?: string;
    stationRole: AtcStationRole;
    frequency?: string;
  }) {
    if (this.cachedVoices.length === 0) this.loadVoices();
    const localProfiles = localTtsClient.getProfilesSync();
    const airportIcao = (params.airportIcao || this.currentAirportIcao).toUpperCase();
    const role = params.stationRole || 'TOWER';

    // Determine preferred profile ID per station role:
    // - TOWER honors user's selected preset (e.g. charon, fenrir, kore)
    // - APPROACH keeps dedicated approach_zephyr (unless user selected custom OS override)
    // - GROUND keeps dedicated ground_puck
    const towerPreset = TOWER_VOICE_PROFILES.find(p => p.id === this.towerVoiceId);
    const osCustomUri = this.towerVoiceId.startsWith('voice:')
      ? this.towerVoiceId.slice('voice:'.length)
      : null;

    let preferredProfileId: string | undefined;
    if (role === 'TOWER') {
      preferredProfileId = towerPreset?.localProfileId;
    } else if (role === 'APPROACH') {
      preferredProfileId =
        this.towerVoiceId === 'zephyr'
          ? 'approach_zephyr'
          : towerPreset?.localProfileId && towerPreset.voiceType === 'APPROACH'
            ? towerPreset.localProfileId
            : 'approach_zephyr';
    } else {
      preferredProfileId = 'ground_puck';
    }

    const baseResolved = resolveTowerOfflineVoice(
      this.cachedVoices,
      role === 'TOWER'
        ? this.towerVoiceId
        : role === 'APPROACH'
          ? (osCustomUri ? this.towerVoiceId : 'zephyr')
          : (osCustomUri ? this.towerVoiceId : 'puck'),
      airportIcao,
      role,
      localProfiles
    );

    const pinned = this.voiceRegistry.getOrAssignStationController({
      airportIcao,
      stationRole: role,
      frequency: params.frequency,
      preferredProfileId,
      osVoiceURI: osCustomUri || baseResolved.voice?.voiceURI || null,
      labelOverride: baseResolved.label,
      availableProfiles: localProfiles,
    });

    return {
      ...baseResolved,
      localProfile: pinned.localProfile,
      packSpeakerId: osCustomUri ? null : pinned.packSpeakerId,
      label: pinned.label,
    };
  }

  /**
   * Resolves persistent, flight-lifetime-stable Pilot voice using VoiceAssignmentRegistry
   * keyed by `aircraftId || callsign` so an aircraft NEVER changes pilot voice mid-flight.
   */
  public getPilotVoiceForCallsign(
    callsign: string,
    options?: RadioExchangeOptions
  ): PilotVoiceProfile {
    if (this.cachedVoices.length === 0) this.loadVoices();
    const localProfiles = localTtsClient.getProfilesSync();
    const stationCtrl = this.resolveStationControllerVoice({
      airportIcao: options?.airportIcao || this.currentAirportIcao,
      stationRole: options?.atcRole || 'TOWER',
      frequency: options?.frequency,
    });

    const rankedOs = rankOfflineEnglishVoices(this.cachedVoices);
    const pinned = this.voiceRegistry.getOrAssignPilot({
      aircraftId: options?.aircraftId,
      callsign,
      airline: options?.airline,
      isHeavy: options?.isHeavy,
      availableProfiles: localProfiles,
      excludedControllerProfileIds: [stationCtrl.localProfile.id],
      osVoices: rankedOs,
      excludedOsVoiceURI: stationCtrl.voice?.voiceURI || null,
    });

    let pitch = pinned.basePitch;
    let rate = pinned.baseRate;
    let packPlaybackRate = pinned.basePackPlaybackRate;
    let speed = pinned.baseSpeed;

    if (options?.isEmergency) {
      rate = Math.min(1.22, rate + 0.06);
      pitch = Math.min(1.16, pitch + 0.04);
      packPlaybackRate = 1.05;
      speed = Math.min(1.3, speed + 0.06);
    }

    return {
      localProfileId: pinned.localProfileId,
      packSpeakerId: pinned.packSpeakerId,
      packLabel: pinned.packLabel,
      voiceURI: pinned.osVoiceURI,
      voiceName: pinned.voiceName,
      personaLabel: pinned.personaLabel,
      pitch: Math.max(0.76, Math.min(1.24, pitch)),
      rate: Math.max(0.88, Math.min(1.14, rate)),
      packPlaybackRate,
      speed,
      carrierCenterHz: pinned.carrierCenterHz,
      pttClickHz: pinned.pttClickHz,
      avionicsHumHz: pinned.avionicsHumHz,
    };
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
    const generation = this.commsManager.getGeneration();
    const wavBytes = await audioLibraryClient.fetchAssetAudioBytes(entry.assetId);
    if (generation !== this.commsManager.getGeneration() || wavBytes.byteLength <= 44) return false;

    const profiles = localTtsClient.getProfilesSync();
    const profile =
      profiles.find(p => p.id === entry.voiceId) ||
      DEFAULT_VOICE_PROFILES.find(p => p.id === entry.voiceId);
    const role: 'TOWER' | 'PILOT' = entry.voiceType === 'PILOT' ? 'PILOT' : 'TOWER';

    if (mode === 'dry') {
      const decoded = await ctx.decodeAudioData(wavBytes.slice(0));
      if (generation !== this.commsManager.getGeneration()) return false;
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
      shouldAbort: () => this.isMuted || generation !== this.commsManager.getGeneration(),
    });

    this.stopCarrierBed();
    if (generation === this.commsManager.getGeneration()) {
      this.playRadioSquelch(this.vhfSettings.pttDurationMs / 1000, 'END', profile?.voiceConfig.pttClickHz || 920);
      this.setTransmission(null);
    }
    return ok;
  }

  /**
   * Side-by-side preview comparing unprocessed neural TTS audio vs full processed VHF radio audio.
   */
  public async previewVhfComparison(params: {
    voiceId?: string;
    customText?: string;
    mode: 'clean' | 'vhf' | 'ab';
    onPhaseChange?: (phase: 'clean' | 'vhf' | null) => void;
  }): Promise<boolean> {
    const ctx = this.initAudioContext();
    if (!ctx) return false;

    this.clearQueue();
    const generation = this.commsManager.getGeneration();
    const profiles = localTtsClient.getProfilesSync();
    const profile =
      profiles.find(p => p.id === params.voiceId) ||
      DEFAULT_VOICE_PROFILES.find(p => p.id === params.voiceId) ||
      DEFAULT_VOICE_PROFILES[0];

    let wavBytes: ArrayBuffer | null = null;
    if (params.customText && params.customText.trim().length > 0) {
      const res = await localTtsClient.synthesizeWav({
        rawText: params.customText.trim(),
        voiceId: profile.id,
        voiceType: profile.voiceType,
        speed: profile.speed,
        priority: 'high',
      });
      wavBytes = res?.wavBytes || null;
    } else {
      wavBytes = await localTtsClient.fetchProfileSampleWav(profile.id, false);
    }

    if (!wavBytes || generation !== this.commsManager.getGeneration()) {
      params.onPhaseChange?.(null);
      return false;
    }

    const role: 'TOWER' | 'PILOT' = profile.voiceType === 'PILOT' ? 'PILOT' : 'TOWER';

    const playClean = async (): Promise<boolean> => {
      if (generation !== this.commsManager.getGeneration()) return false;
      params.onPhaseChange?.('clean');
      return audioEngine.playWavBytes({
        ctx,
        wavBytes: wavBytes!,
        role,
        volume: this.volume,
        playbackRate: profile.pitch || 1.0,
        bypassDsp: true,
        shouldAbort: () => this.isMuted || generation !== this.commsManager.getGeneration(),
      });
    };

    const playVhf = async (): Promise<boolean> => {
      if (generation !== this.commsManager.getGeneration()) return false;
      params.onPhaseChange?.('vhf');
      const previewSettings: VhfRadioSettings = {
        ...this.vhfSettings,
        enabled: true,
      };
      const clickHz = profile.voiceConfig.pttClickHz || 920;

      this.setTransmission({
        callsign: profile.voiceType === 'PILOT' ? 'PREVIEW' : profile.voiceType,
        speaker: role === 'TOWER' ? 'ATC' : 'PILOT',
        voiceLabel: `${profile.shortLabel} · VHF`,
      });
      playVhfPttTransient(ctx, 'START', previewSettings, this.volume, clickHz);
      this.carrierNodes = startVhfCarrierBed(
        ctx,
        role === 'TOWER' ? 'ATC' : 'PILOT',
        previewSettings,
        this.volume,
        {
          carrierCenterHz: profile.voiceConfig.carrierCenterHz || 1350,
          avionicsHumHz: profile.voiceConfig.avionicsHumHz || 400,
        }
      );

      const ok = await audioEngine.playWavBytes({
        ctx,
        wavBytes: wavBytes!,
        role,
        volume: this.volume,
        playbackRate: profile.pitch || 1.0,
        bandpassHz: profile.voiceConfig.bandpassHz || 1400,
        settingsOverride: previewSettings,
        shouldAbort: () => this.isMuted || generation !== this.commsManager.getGeneration(),
      });

      this.stopCarrierBed();
      if (generation === this.commsManager.getGeneration()) {
        playVhfPttTransient(ctx, 'END', previewSettings, this.volume, clickHz);
        this.setTransmission(null);
      }
      return ok;
    };

    try {
      if (params.mode === 'clean') {
        return await playClean();
      }
      if (params.mode === 'vhf') {
        return await playVhf();
      }
      // Compare A/B: Clean TTS -> 420ms silence gap -> Full Processed VHF
      await playClean();
      if (generation !== this.commsManager.getGeneration() || this.isMuted) return false;
      await this.waitMs(420);
      return await playVhf();
    } finally {
      this.stopCarrierBed();
      this.setTransmission(null);
      params.onPhaseChange?.(null);
    }
  }

  private startCarrierBed(
    speaker: 'ATC' | 'PILOT',
    acoustics?: { carrierCenterHz: number; avionicsHumHz: number },
    settingsOverride?: VhfRadioSettings
  ) {
    if (this.isMuted) return;
    const ctx = this.initAudioContext();
    if (!ctx) return;

    this.stopCarrierBed();
    this.carrierNodes = startVhfCarrierBed(
      ctx,
      speaker,
      settingsOverride || this.vhfSettings,
      this.volume,
      acoustics
    );
  }

  private stopCarrierBed() {
    if (!this.carrierNodes) return;
    const handle = this.carrierNodes;
    this.carrierNodes = null;
    stopVhfCarrierBed(this.audioCtx, handle);
  }

  public playRadioSquelch(
    _durationSec: number = 0.09,
    phase: 'START' | 'END' = 'START',
    clickFreqHz: number = 920,
    settingsOverride?: VhfRadioSettings
  ) {
    if (this.isMuted) return;
    const ctx = this.initAudioContext();
    if (!ctx) return;

    playVhfPttTransient(
      ctx,
      phase,
      settingsOverride || this.vhfSettings,
      this.volume,
      clickFreqHz
    );
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

  public formatCallsignForSpeech(
    callsignOrCtx: string | StructuredFlightContext,
    isHeavy?: boolean
  ): string {
    return grammarFormatCallsign(callsignOrCtx, isHeavy);
  }

  public speakRadioExchange(
    atcText: string,
    callsign: string,
    pilotText: string,
    onPilotStart?: () => void,
    options?: RadioExchangeOptions
  ): string | null {
    if (this.isMuted) {
      if (onPilotStart) onPilotStart();
      return null;
    }

    const atcRole: AtcStationRole =
      options?.atcRole || (atcText ? inferAtcSubRole(atcText) : 'TOWER');
    const priority: CommsPriority =
      options?.priority ||
      (options?.isEmergency ? 'EMERGENCY' : atcText ? 'ATC_CLEARANCE' : 'PILOT_READBACK');
    const direction: CommsDirection =
      options?.direction || (pilotText.trim().length > 0 ? 'controller_to_pilot' : 'atc_only');

    return this.commsManager.enqueue({
      direction,
      priority,
      frequency: options?.frequency,
      callsign,
      aircraftId: options?.aircraftId,
      atcRole,
      atcText,
      atcSpokenText: options?.atcSpokenText,
      pilotText,
      pilotSpokenText: options?.pilotSpokenText,
      onAtcStart: options?.onAtcStart,
      onPilotStart,
      onCancelled: options?.onCancelled,
      options,
    });
  }

  public speakPilotToController(params: {
    callsign: string;
    aircraftId?: string;
    pilotText: string;
    pilotSpokenText?: string;
    atcReplyText: string;
    atcReplySpokenText?: string;
    onAtcReplyStart?: () => void;
    options?: RadioExchangeOptions;
  }): string | null {
    if (this.isMuted) {
      params.onAtcReplyStart?.();
      return null;
    }
    const opts = params.options;
    const atcRole: AtcStationRole =
      opts?.atcRole || inferAtcSubRole(params.atcReplyText);
    const priority: CommsPriority =
      opts?.priority || (opts?.isEmergency ? 'EMERGENCY' : 'PILOT_CALLIN');

    return this.commsManager.enqueue({
      direction: 'pilot_to_controller',
      priority,
      frequency: opts?.frequency,
      callsign: params.callsign,
      aircraftId: params.aircraftId || opts?.aircraftId,
      atcRole,
      atcText: params.atcReplyText,
      atcSpokenText: params.atcReplySpokenText,
      pilotText: params.pilotText,
      pilotSpokenText: params.pilotSpokenText,
      onAtcStart: params.onAtcReplyStart,
      options: {
        pilotHasCallsign: true,
        ...opts,
      },
    });
  }

  public speakPilotReadback(
    callsign: string,
    message: string,
    options?: RadioExchangeOptions
  ): string | null {
    if (this.isMuted) return null;

    const priority: CommsPriority =
      options?.priority || (options?.isEmergency ? 'EMERGENCY' : 'PILOT_READBACK');

    return this.commsManager.enqueue({
      direction: 'pilot_only',
      priority,
      frequency: options?.frequency,
      callsign,
      aircraftId: options?.aircraftId,
      atcRole: options?.atcRole || 'TOWER',
      pilotText: message,
      pilotSpokenText: options?.pilotSpokenText,
      onCancelled: options?.onCancelled,
      options: {
        pilotHasCallsign: true,
        ...options,
      },
    });
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

  private buildRawPilotTextForPack(item: CommsQueuePayload<RadioExchangeOptions>): string {
    const body = (item.pilotSpokenText || item.pilotText).trim();
    const upperCallsign = item.callsign.trim().toUpperCase();
    const prefix = upperCallsign.slice(0, 3);
    const telephony = item.options?.telephony || AIRLINE_CALLSIGNS[prefix] || prefix;
    const alreadyHasCallsign =
      item.options?.pilotHasCallsign ||
      body.toUpperCase().includes(upperCallsign) ||
      body.toLowerCase().includes(telephony.toLowerCase());

    if (alreadyHasCallsign) return body;
    return `${body}, ${item.callsign}${item.options?.isHeavy ? ' heavy' : ''}`;
  }

  private async transmitControllerTurn(params: {
    item: CommsQueuePayload<RadioExchangeOptions>;
    atcDisplayText: string;
    atcSpeechInput: string;
    towerResolved: ReturnType<RadioAudioEngine['resolveStationControllerVoice']>;
    txVhfSettings?: VhfRadioSettings;
    ctx: AudioContext | null;
    isAborted: () => boolean;
    pttTiming: PttTimingConfig;
  }): Promise<void> {
    const {
      item,
      atcDisplayText,
      atcSpeechInput,
      towerResolved,
      txVhfSettings,
      ctx,
      isAborted,
      pttTiming,
    } = params;

    if (this.isMuted || isAborted()) return;

    item.onAtcStart?.();

    const pttHz = towerResolved.localProfile.voiceConfig.pttClickHz || 920;
    this.setTransmission({
      txId: item.id,
      callsign: item.callsign,
      speaker: 'ATC',
      voiceLabel: towerResolved.label,
      frequency: item.frequency,
      stationRole: item.atcRole,
      priority: item.priority,
    });
    this.playRadioSquelch(
      this.vhfSettings.pttDurationMs / 1000,
      'START',
      pttHz,
      txVhfSettings
    );
    this.startCarrierBed(
      'ATC',
      {
        carrierCenterHz: towerResolved.localProfile.voiceConfig.carrierCenterHz || 1260,
        avionicsHumHz: towerResolved.localProfile.voiceConfig.avionicsHumHz || 110,
      },
      txVhfSettings
    );

    if (pttTiming.keyUpLeadMs > 0) {
      await this.waitMs(pttTiming.keyUpLeadMs);
    }
    if (this.isMuted || isAborted()) {
      this.stopCarrierBed();
      return;
    }

    let playedAtc = false;
    const canUseSpriteFallback =
      Boolean(towerResolved.packSpeakerId) &&
      this.canTokenizeForOfflinePack(atcDisplayText, 'TOWER');

    // Tier 1: Local Kokoro-82M Neural TTS (Library / IndexedDB / Worker synthesized WAV)
    if (ctx && !this.towerVoiceId.startsWith('voice:')) {
      const kokoroRes = await localTtsClient.synthesizeWav({
        rawText: atcSpeechInput,
        voiceId: towerResolved.localProfile.id,
        voiceType: towerResolved.localProfile.voiceType,
        speed: item.options?.isEmergency
          ? Math.min(1.3, towerResolved.localProfile.speed + 0.06)
          : towerResolved.localProfile.speed,
        priority: item.priority === 'EMERGENCY' ? 'critical' : 'high',
        timeoutMs: canUseSpriteFallback ? 1100 : 4800,
      });
      if (kokoroRes && !this.isMuted && !isAborted()) {
        playedAtc = await audioEngine.playWavBytes({
          ctx,
          wavBytes: kokoroRes.wavBytes,
          role: 'TOWER',
          volume: this.volume,
          playbackRate: towerResolved.localProfile.pitch || 1.0,
          bandpassHz: towerResolved.localProfile.voiceConfig.bandpassHz || 1360,
          settingsOverride: txVhfSettings,
          shouldAbort: () => this.isMuted || isAborted(),
        });
      }
    }

    // Tier 2: Zero-Latency Bundled Offline Sprite Pack Fallback
    if (!playedAtc && ctx && towerResolved.packSpeakerId && !this.isMuted && !isAborted()) {
      playedAtc = await voicePackPlayer.playTransmission({
        ctx,
        speakerId: towerResolved.packSpeakerId,
        role: 'TOWER',
        rawText: atcDisplayText,
        volume: this.volume,
        playbackRate: item.options?.isEmergency ? 1.05 : 1.01,
        bandpassHz: 1360,
        shouldAbort: () => this.isMuted || isAborted(),
      });
    }

    // Tier 3: Installed Local OS Speech Fallback
    if (!playedAtc && !this.isMuted && !isAborted()) {
      const spokenAtc = formatPhraseForSpeech(atcSpeechInput);
      await this.speakViaOsFallback(spokenAtc, {
        voice: towerResolved.voice,
        pitch: towerResolved.pitch,
        rate: item.options?.isEmergency
          ? Math.min(1.22, towerResolved.rate + 0.05)
          : towerResolved.rate,
        volumeScale: 0.96,
      });
    }

    if (pttTiming.unkeyTailMs > 0 && !this.isMuted && !isAborted()) {
      await this.waitMs(pttTiming.unkeyTailMs);
    }
    this.stopCarrierBed();
    if (!this.isMuted && !isAborted()) {
      this.playRadioSquelch(
        this.vhfSettings.pttDurationMs / 1000,
        'END',
        pttHz,
        txVhfSettings
      );
    }
    this.setTransmission(null);
  }

  private async transmitPilotTurn(params: {
    item: CommsQueuePayload<RadioExchangeOptions>;
    pilotDisplayText: string;
    pilotSpeechInput: string;
    pilotProfile: PilotVoiceProfile;
    txVhfSettings?: VhfRadioSettings;
    ctx: AudioContext | null;
    isAborted: () => boolean;
    pttTiming: PttTimingConfig;
  }): Promise<void> {
    const {
      item,
      pilotDisplayText,
      pilotSpeechInput,
      pilotProfile,
      txVhfSettings,
      ctx,
      isAborted,
      pttTiming,
    } = params;

    if (this.isMuted || isAborted()) return;

    item.onPilotStart?.();

    this.setTransmission({
      txId: item.id,
      callsign: item.callsign,
      speaker: 'PILOT',
      voiceLabel: pilotProfile.personaLabel,
      frequency: item.frequency,
      stationRole: item.atcRole,
      priority: item.priority,
    });
    this.playRadioSquelch(
      this.vhfSettings.pttDurationMs / 1000,
      'START',
      pilotProfile.pttClickHz,
      txVhfSettings
    );
    this.startCarrierBed(
      'PILOT',
      {
        carrierCenterHz: pilotProfile.carrierCenterHz,
        avionicsHumHz: pilotProfile.avionicsHumHz,
      },
      txVhfSettings
    );

    if (pttTiming.keyUpLeadMs > 0) {
      await this.waitMs(pttTiming.keyUpLeadMs);
    }
    if (this.isMuted || isAborted()) {
      this.stopCarrierBed();
      return;
    }

    let playedPilot = false;
    const canUsePilotSprite = this.canTokenizeForOfflinePack(pilotDisplayText, 'PILOT');

    // Tier 1: Local Kokoro-82M Neural TTS (Library / IndexedDB / Worker synthesized WAV)
    if (ctx) {
      const kokoroPilotRes = await localTtsClient.synthesizeWav({
        rawText: pilotSpeechInput,
        voiceId: pilotProfile.localProfileId,
        voiceType: 'PILOT',
        speed: pilotProfile.speed,
        priority: item.priority === 'EMERGENCY' ? 'critical' : 'high',
        timeoutMs: canUsePilotSprite ? 1100 : 4800,
      });
      if (kokoroPilotRes && !this.isMuted && !isAborted()) {
        playedPilot = await audioEngine.playWavBytes({
          ctx,
          wavBytes: kokoroPilotRes.wavBytes,
          role: 'PILOT',
          volume: this.volume,
          playbackRate: 1.0,
          bandpassHz: pilotProfile.carrierCenterHz,
          settingsOverride: txVhfSettings,
          shouldAbort: () => this.isMuted || isAborted(),
        });
      }
    }

    // Tier 2: Zero-Latency Bundled Offline Sprite Pack Fallback
    if (!playedPilot && ctx && !this.isMuted && !isAborted()) {
      playedPilot = await voicePackPlayer.playTransmission({
        ctx,
        speakerId: pilotProfile.packSpeakerId,
        role: 'PILOT',
        rawText: pilotDisplayText,
        volume: this.volume,
        playbackRate: pilotProfile.packPlaybackRate,
        bandpassHz: pilotProfile.carrierCenterHz,
        shouldAbort: () => this.isMuted || isAborted(),
      });
    }

    // Tier 3: Installed Local OS Speech Fallback
    if (!playedPilot && !this.isMuted && !isAborted()) {
      const spokenPilot = formatPhraseForSpeech(pilotSpeechInput);
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

    if (pttTiming.unkeyTailMs > 0 && !this.isMuted && !isAborted()) {
      await this.waitMs(pttTiming.unkeyTailMs);
    }
    this.stopCarrierBed();
    if (!this.isMuted && !isAborted()) {
      this.playRadioSquelch(
        this.vhfSettings.pttDurationMs / 1000,
        'END',
        pilotProfile.pttClickHz,
        txVhfSettings
      );
    }
    this.setTransmission(null);
  }

  private async executeQueuedTransmission(
    item: CommsQueuePayload<RadioExchangeOptions>,
    execCtx: { isAborted: () => boolean; generation: number; pttTiming: PttTimingConfig }
  ): Promise<void> {
    if (this.isMuted || execCtx.isAborted()) return;

    try {
      if (this.cachedVoices.length === 0) this.loadVoices();

      const airportIcao = item.options?.airportIcao || this.currentAirportIcao;
      const towerResolved = this.resolveStationControllerVoice({
        airportIcao,
        stationRole: item.atcRole,
        frequency: item.frequency,
      });

      const pilotProfile = this.getPilotVoiceForCallsign(item.callsign, {
        ...item.options,
        airportIcao,
        atcRole: item.atcRole,
      });

      const ctx = this.initAudioContext();
      const hasPilot = item.pilotText.trim().length > 0;
      const rawPilotDisplay = hasPilot
        ? (() => {
            const body = item.pilotText.trim();
            const upperCs = item.callsign.trim().toUpperCase();
            const prefix = upperCs.slice(0, 3);
            const telephony = item.options?.telephony || AIRLINE_CALLSIGNS[prefix] || prefix;
            const already =
              item.options?.pilotHasCallsign ||
              body.toUpperCase().includes(upperCs) ||
              body.toLowerCase().includes(telephony.toLowerCase());
            return already ? body : `${body}, ${item.callsign}${item.options?.isHeavy ? ' heavy' : ''}`;
          })()
        : '';
      const rawPilotSpeech = hasPilot ? this.buildRawPilotTextForPack(item) : '';
      const rawAtcDisplay = item.atcText?.trim() || '';
      const rawAtcSpeech = (item.atcSpokenText || item.atcText || '').trim();

      // Preload offline sprite buffers AND trigger lookahead Kokoro pre-synthesis for responding turn!
      if (ctx) {
        if (towerResolved.packSpeakerId) {
          void voicePackPlayer.loadSpeakerBuffer(towerResolved.packSpeakerId, ctx);
        }
        void voicePackPlayer.loadSpeakerBuffer(pilotProfile.packSpeakerId, ctx);
      }

      if (item.direction === 'pilot_to_controller' && rawAtcSpeech) {
        localTtsClient.prewarmPhrase({
          rawText: rawAtcSpeech,
          voiceId: towerResolved.localProfile.id,
          voiceType: towerResolved.localProfile.voiceType,
          speed: towerResolved.localProfile.speed,
        });
      } else if (rawPilotSpeech && rawAtcSpeech) {
        localTtsClient.prewarmPhrase({
          rawText: rawPilotSpeech,
          voiceId: pilotProfile.localProfileId,
          voiceType: 'PILOT',
          speed: pilotProfile.speed,
        });
      }

      // Use Emergency Transmission profile automatically on Mayday/Pan-Pan calls unless custom tuned
      const txVhfSettings: VhfRadioSettings | undefined =
        (item.priority === 'EMERGENCY' || item.options?.isEmergency) &&
        this.vhfSettings.preset !== 'custom' &&
        this.vhfSettings.enabled
          ? {
              ...this.vhfSettings,
              ...VHF_RADIO_PRESETS.emergency_transmission.settings,
              preset: 'emergency_transmission',
            }
          : undefined;

      if (item.direction === 'pilot_to_controller') {
        if (hasPilot) {
          await this.transmitPilotTurn({
            item,
            pilotDisplayText: rawPilotDisplay,
            pilotSpeechInput: rawPilotSpeech,
            pilotProfile,
            txVhfSettings,
            ctx,
            isAborted: execCtx.isAborted,
            pttTiming: execCtx.pttTiming,
          });
        }
        if (this.isMuted || execCtx.isAborted()) return;
        if (rawAtcDisplay) {
          await this.waitMs(execCtx.pttTiming.interTurnGapMs);
          await this.transmitControllerTurn({
            item,
            atcDisplayText: rawAtcDisplay,
            atcSpeechInput: rawAtcSpeech,
            towerResolved,
            txVhfSettings,
            ctx,
            isAborted: execCtx.isAborted,
            pttTiming: execCtx.pttTiming,
          });
        }
      } else {
        if (rawAtcDisplay) {
          await this.transmitControllerTurn({
            item,
            atcDisplayText: rawAtcDisplay,
            atcSpeechInput: rawAtcSpeech,
            towerResolved,
            txVhfSettings,
            ctx,
            isAborted: execCtx.isAborted,
            pttTiming: execCtx.pttTiming,
          });
        }
        if (this.isMuted || execCtx.isAborted()) return;
        if (hasPilot) {
          if (rawAtcDisplay) {
            await this.waitMs(execCtx.pttTiming.interTurnGapMs);
          }
          await this.transmitPilotTurn({
            item,
            pilotDisplayText: rawPilotDisplay,
            pilotSpeechInput: rawPilotSpeech,
            pilotProfile,
            txVhfSettings,
            ctx,
            isAborted: execCtx.isAborted,
            pttTiming: execCtx.pttTiming,
          });
        }
      }
    } finally {
      this.stopCarrierBed();
      this.setTransmission(null);
    }
  }
}

export const radioAudio = new RadioAudioEngine();
