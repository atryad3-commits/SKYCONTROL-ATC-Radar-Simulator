/**
 * SKYCONTROL - Persistent Aircraft Pilot & ATC Station Voice Assignment Registry
 *
 * Enforces deterministic, flight-lifetime-stable voice assignments:
 * 1. Every aircraft receives a genuinely distinct pilot voice from the enabled pilot pool
 *    and retains that exact voice for its entire flight lifetime (unaffected by traffic spawning/exiting).
 * 2. Every ATC station (TOWER, APPROACH, GROUND per airport/frequency) maintains a consistent
 *    controller voice distinct from all pilot voices.
 * 3. Releasing/pruning only occurs after an aircraft exits the simulation or on explicit reset.
 */

import {
  DEFAULT_VOICE_PROFILES,
  VoiceProfile,
  VoiceType,
} from '../../shared/ttsTypes';
import { AIRLINE_CALLSIGNS, AtcStationRole } from './aviationSpeechGrammar';
import { PILOT_PACK_IDS } from './voicePackPlayer';

export const AIRLINE_PREFERRED_PROFILE_ORDER: Record<string, readonly string[]> = {
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

export interface AssignedPilotIdentity {
  flightKey: string;
  callsign: string;
  aircraftId?: string;
  localProfileId: string;
  packSpeakerId: string;
  packLabel: string;
  osVoiceURI: string | null;
  voiceName: string;
  personaLabel: string;
  basePitch: number;
  baseRate: number;
  basePackPlaybackRate: number;
  baseSpeed: number;
  carrierCenterHz: number;
  pttClickHz: number;
  avionicsHumHz: number;
  assignedAt: number;
}

export interface AssignedStationController {
  stationKey: string;
  airportIcao: string;
  stationRole: AtcStationRole;
  frequency: string;
  localProfile: VoiceProfile;
  packSpeakerId: string | null;
  osVoiceURI: string | null;
  label: string;
}

export interface RegistryVoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export class VoiceAssignmentRegistry {
  private pilotAssignments = new Map<string, AssignedPilotIdentity>();
  private callsignToFlightKey = new Map<string, string>();
  private stationAssignments = new Map<string, AssignedStationController>();

  /**
   * Resolves a stable pilot voice for a flight, pinning it by `aircraftId || callsign` so that
   * once assigned, the voice identity NEVER shifts mid-flight even as other traffic spawns or lands.
   */
  public getOrAssignPilot(params: {
    aircraftId?: string;
    callsign: string;
    airline?: string;
    isHeavy?: boolean;
    availableProfiles?: VoiceProfile[];
    excludedControllerProfileIds?: string[];
    osVoices?: RegistryVoiceLike[];
    excludedOsVoiceURI?: string | null;
  }): AssignedPilotIdentity {
    const cleanCallsign = params.callsign.trim().toUpperCase();
    const flightKey = (params.aircraftId || cleanCallsign).trim().toUpperCase();
    const profilesPool = params.availableProfiles?.length
      ? params.availableProfiles
      : DEFAULT_VOICE_PROFILES;

    // Look up existing pinned assignment by aircraftId first, then active callsign alias
    const existing =
      this.pilotAssignments.get(flightKey) ||
      (this.callsignToFlightKey.has(cleanCallsign)
        ? this.pilotAssignments.get(this.callsignToFlightKey.get(cleanCallsign)!)
        : undefined);

    if (existing) {
      // Ensure the pinned profile still exists & is enabled (only re-route if user explicitly disabled it)
      const pinnedProfile = profilesPool.find(p => p.id === existing.localProfileId);
      if (!pinnedProfile || pinnedProfile.enabled) {
        if (params.aircraftId && existing.flightKey !== flightKey) {
          // Promote callsign-keyed entry to exact aircraftId key seamlessly
          this.pilotAssignments.delete(existing.flightKey);
          const updated: AssignedPilotIdentity = {
            ...existing,
            flightKey,
            aircraftId: params.aircraftId,
          };
          this.pilotAssignments.set(flightKey, updated);
          this.callsignToFlightKey.set(cleanCallsign, flightKey);
          return updated;
        }
        return existing;
      }
    }

    // Determine eligible enabled PILOT profiles (never overlapping controller voices)
    const excludedCtrl = new Set(params.excludedControllerProfileIds || []);
    const enabledPilots = profilesPool.filter(
      p => p.voiceType === 'PILOT' && p.enabled && !excludedCtrl.has(p.id)
    );
    const pilotPool =
      enabledPilots.length > 0
        ? enabledPilots
        : DEFAULT_VOICE_PROFILES.filter(p => p.voiceType === 'PILOT');

    const enabledPilotIds = pilotPool.map(p => p.id);
    const prefix = (params.airline || cleanCallsign.slice(0, 3)).toUpperCase();
    const basePreferred = AIRLINE_PREFERRED_PROFILE_ORDER[prefix] || enabledPilotIds;
    const filteredPreferred = basePreferred.filter(id => enabledPilotIds.includes(id));
    const candidateOrder = [
      ...filteredPreferred,
      ...enabledPilotIds.filter(id => !filteredPreferred.includes(id)),
    ];

    // Inspect profiles already pinned to other currently active flights
    const inUseProfileCounts = new Map<string, number>();
    const inUsePackCounts = new Map<string, number>();
    for (const active of this.pilotAssignments.values()) {
      inUseProfileCounts.set(active.localProfileId, (inUseProfileCounts.get(active.localProfileId) ?? 0) + 1);
      inUsePackCounts.set(active.packSpeakerId, (inUsePackCounts.get(active.packSpeakerId) ?? 0) + 1);
    }

    const hash = hashString(flightKey);
    const getPackForId = (id: string) =>
      pilotPool.find(p => p.id === id)?.voiceConfig.legacyPackId ||
      DEFAULT_VOICE_PROFILES.find(p => p.id === id)?.voiceConfig.legacyPackId ||
      id;

    // 1. Prefer an unused neural profile with an unused sprite pack (for clean instant fallback)
    // 2. Next prefer an unused neural profile (least-used)
    // 3. Last resort when active flights > enabledPilotIds.length, pick least-used deterministically
    let pickedProfileId = candidateOrder[hash % candidateOrder.length];

    if ((inUseProfileCounts.get(pickedProfileId) ?? 0) > 0 || (inUsePackCounts.get(getPackForId(pickedProfileId)) ?? 0) > 0) {
      const freeBoth = candidateOrder.find(
        id => (inUseProfileCounts.get(id) ?? 0) === 0 && (inUsePackCounts.get(getPackForId(id)) ?? 0) === 0
      );
      if (freeBoth) {
        pickedProfileId = freeBoth;
      } else {
        const minUse = Math.min(...candidateOrder.map(id => inUseProfileCounts.get(id) ?? 0));
        const leastUsed = candidateOrder.filter(id => (inUseProfileCounts.get(id) ?? 0) === minUse);
        pickedProfileId = leastUsed[hash % leastUsed.length];
      }
    }

    const matchedProfile =
      pilotPool.find(p => p.id === pickedProfileId) || pilotPool[0];
    const packSpeakerId =
      matchedProfile.voiceConfig.legacyPackId ||
      PILOT_PACK_IDS[hash % PILOT_PACK_IDS.length];

    // Pin OS voice URI deterministically excluding Tower OS voice
    const osPool = (params.osVoices || []).filter(
      v => !params.excludedOsVoiceURI || v.voiceURI !== params.excludedOsVoiceURI
    );
    const inUseOsUris = new Set(
      Array.from(this.pilotAssignments.values())
        .map(a => a.osVoiceURI)
        .filter((u): u is string => Boolean(u))
    );
    let chosenOsVoice: RegistryVoiceLike | null = null;
    if (osPool.length > 0) {
      const unusedOs = osPool.filter(v => !inUseOsUris.has(v.voiceURI));
      const pickPool = unusedOs.length > 0 ? unusedOs : osPool;
      chosenOsVoice = pickPool[hash % pickPool.length];
    }

    const register = PILOT_VOCAL_REGISTERS[(hash >> 1) % PILOT_VOCAL_REGISTERS.length];
    const hasRichOsPool = osPool.length >= 4;
    const basePitch = hasRichOsPool
      ? 0.94 + ((hash % 5) - 2) * 0.035
      : register.pitch;
    const baseRate = hasRichOsPool
      ? 1.1 + (((hash >> 3) % 4) - 1) * 0.025
      : register.rate * 1.12;
    const basePackPlaybackRate = 0.99 + ((hash >> 2) % 4) * 0.012;

    const carrierCenterHz =
      matchedProfile.voiceConfig.carrierCenterHz || 1160 + (hash % 8) * 95;
    const pttClickHz = matchedProfile.voiceConfig.pttClickHz || 700 + (hash % 7) * 65;
    const avionicsHumHz = params.isHeavy
      ? 385 + (hash % 3) * 15
      : matchedProfile.voiceConfig.avionicsHumHz || 640 + (hash % 5) * 45;

    const packLabel = matchedProfile.displayName.split('·')[0].trim();
    const airlineName = AIRLINE_CALLSIGNS[prefix] || params.airline || prefix;

    const assignment: AssignedPilotIdentity = {
      flightKey,
      callsign: cleanCallsign,
      aircraftId: params.aircraftId,
      localProfileId: matchedProfile.id,
      packSpeakerId,
      packLabel,
      osVoiceURI: chosenOsVoice?.voiceURI || null,
      voiceName: chosenOsVoice?.name || register.label,
      personaLabel: `${packLabel} · ${airlineName}`,
      basePitch: Math.max(0.76, Math.min(1.24, basePitch)),
      baseRate: Math.max(0.88, Math.min(1.14, baseRate)),
      basePackPlaybackRate,
      baseSpeed: matchedProfile.speed,
      carrierCenterHz,
      pttClickHz,
      avionicsHumHz,
      assignedAt: Date.now(),
    };

    this.pilotAssignments.set(flightKey, assignment);
    this.callsignToFlightKey.set(cleanCallsign, flightKey);
    return assignment;
  }

  /**
   * Resolves and caches a consistent ATC controller voice for a given airport + facility station role
   * (TOWER, APPROACH, GROUND). Never mixes with Pilot voices and stays invariant across transmissions.
   */
  public getOrAssignStationController(params: {
    airportIcao: string;
    stationRole: AtcStationRole;
    frequency?: string;
    preferredProfileId?: string;
    osVoiceURI?: string | null;
    labelOverride?: string;
    availableProfiles?: VoiceProfile[];
  }): AssignedStationController {
    const icao = (params.airportIcao || 'EGLL').trim().toUpperCase();
    const role: AtcStationRole = params.stationRole || 'TOWER';
    const freq = (params.frequency || 'PRIMARY').trim();
    const stationKey = `${icao}::${role}::${params.preferredProfileId || 'DEFAULT'}::${freq}`;

    const profilesPool = params.availableProfiles?.length
      ? params.availableProfiles
      : DEFAULT_VOICE_PROFILES;

    const existing = this.stationAssignments.get(stationKey);
    if (existing) {
      const current = profilesPool.find(p => p.id === existing.localProfile.id);
      if (!current || current.enabled) {
        return existing;
      }
    }

    let chosenProfile: VoiceProfile | undefined;

    if (params.preferredProfileId) {
      chosenProfile = profilesPool.find(
        p => p.id === params.preferredProfileId && p.enabled && p.voiceType !== 'PILOT'
      );
    }

    if (!chosenProfile) {
      const roleMatching = profilesPool.filter(
        p => p.voiceType === role && p.enabled
      );
      if (roleMatching.length > 0) {
        const idx = hashString(`${icao}::${role}`) % roleMatching.length;
        chosenProfile = roleMatching[idx];
      }
    }

    if (!chosenProfile) {
      chosenProfile =
        profilesPool.find(p => p.voiceType !== 'PILOT' && p.enabled) ||
        DEFAULT_VOICE_PROFILES.find(p => p.voiceType !== 'PILOT')!;
    }

    const assignment: AssignedStationController = {
      stationKey,
      airportIcao: icao,
      stationRole: role,
      frequency: freq,
      localProfile: chosenProfile,
      packSpeakerId: params.osVoiceURI
        ? null
        : chosenProfile.voiceConfig.legacyPackId || chosenProfile.id,
      osVoiceURI: params.osVoiceURI || null,
      label: params.labelOverride || chosenProfile.shortLabel,
    };

    this.stationAssignments.set(stationKey, assignment);
    return assignment;
  }

  /**
   * Removes pilot assignments for aircraft that have landed, exited radar range, or been cleared,
   * while strictly leaving every still-active aircraft's pinned voice untouched.
   */
  public pruneInactiveAircraft(activeIdsOrCallsigns: Iterable<string>): number {
    const activeSet = new Set<string>();
    for (const id of activeIdsOrCallsigns) {
      activeSet.add(id.trim().toUpperCase());
    }

    let removed = 0;
    for (const [key, entry] of this.pilotAssignments.entries()) {
      const isStillActive =
        activeSet.has(key) ||
        (entry.aircraftId && activeSet.has(entry.aircraftId.trim().toUpperCase())) ||
        activeSet.has(entry.callsign);

      if (!isStillActive) {
        this.pilotAssignments.delete(key);
        if (this.callsignToFlightKey.get(entry.callsign) === key) {
          this.callsignToFlightKey.delete(entry.callsign);
        }
        removed += 1;
      }
    }
    return removed;
  }

  public releaseAircraft(idOrCallsign: string): boolean {
    const target = idOrCallsign.trim().toUpperCase();
    let deleted = false;
    if (this.pilotAssignments.has(target)) {
      const entry = this.pilotAssignments.get(target)!;
      this.pilotAssignments.delete(target);
      if (this.callsignToFlightKey.get(entry.callsign) === target) {
        this.callsignToFlightKey.delete(entry.callsign);
      }
      deleted = true;
    }
    const mappedKey = this.callsignToFlightKey.get(target);
    if (mappedKey) {
      this.pilotAssignments.delete(mappedKey);
      this.callsignToFlightKey.delete(target);
      deleted = true;
    }
    return deleted;
  }

  public clearStations(): void {
    this.stationAssignments.clear();
  }

  public clearAll(): void {
    this.pilotAssignments.clear();
    this.callsignToFlightKey.clear();
    this.stationAssignments.clear();
  }

  public getSnapshot(): {
    pilots: AssignedPilotIdentity[];
    stations: AssignedStationController[];
  } {
    return {
      pilots: Array.from(this.pilotAssignments.values()),
      stations: Array.from(this.stationAssignments.values()),
    };
  }
}

export const voiceAssignmentRegistry = new VoiceAssignmentRegistry();
