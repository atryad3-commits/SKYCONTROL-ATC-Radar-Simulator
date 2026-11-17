/**
 * SKYCONTROL - Master Simulation Store (Zustand)
 * Airport-agnostic simulation engine supporting multi-airport switching,
 * Training Academy missions, custom scenario execution, and Squawk 7700 emergencies.
 */

import { create } from 'zustand';
import {
  ActiveMissionState,
  Aircraft,
  Airport,
  AirportNavVisibility,
  AirportProfile,
  ConflictPair,
  CustomScenarioConfig,
  MissionId,
  PreFlightSessionConfig,
  RadioMessage,
  SimulationStats,
  WeatherCondition,
} from '../types';
import {
  ALL_AIRPORT_PROFILES,
  getAirportProfile,
  resolveConfiguredAirport,
} from '../airports/airportsRegistry';
import {
  computeDefaultAirportVisibility,
  computeRunwayMatchedVisibility,
} from '../airports/procedures';
import {
  stepAircraftPhysics,
  normalizeHeading,
  calculateBearing,
  getHeadingDelta,
} from '../engine/physics';
import { updateILSApproach } from '../engine/ils';
import { detectConflicts, ConflictEventTracker } from '../engine/conflict';
import {
  generateInboundFlight,
  generateDepartureFlight,
} from '../engine/trafficGenerator';
import {
  radioAudio,
  TowerVoiceId,
  AtcStationRole,
  CommsPriority,
  formatPhraseForSpeech,
  buildPilotInitialContact,
} from '../audio/radioAudio';
import { GlobalAudioSettings } from '../../shared/audioStudioTypes';
import { RunwayOccupancyManager } from '../engine/runwayOccupancy';
import {
  stepTakeoffSequence,
  issueTakeoffClearance,
  lineUpAircraft,
  rejectTakeoff,
  evaluateDepartureGates,
} from '../engine/takeoff';
import {
  getAircraftOperationalBounds,
  getAircraftPerformance,
} from '../engine/aircraftPerformance';
import { formatPilotDisplayCallsign } from '../audio/aviationSpeechGrammar';
import { SimulationEvent } from '../types/events';
import { RadarTrackingEngine, RadarTrack } from '../engine/radarTracker';
import { RunwayGeometry } from '../engine/runwayGeometry';
import {
  buildMissionObjectives,
  evaluateMissionProgress,
  getMissionById,
} from '../engine/missions';

export interface EnvelopeWarning {
  aircraftId: string;
  callsign: string;
  kind: 'SPEED' | 'ALTITUDE';
  message: string;
  timestamp: number;
}

const globalConflictTracker = new ConflictEventTracker();
const initialResolved = resolveConfiguredAirport('EGLL');
const globalOccupancyManager = new RunwayOccupancyManager(
  initialResolved.runwayGeometries,
  initialResolved.profile.reciprocalPairs
);
const globalRadarTracker = new RadarTrackingEngine({
  rotationRpm: 15,
  maxRangeNM: 55,
  staleTimeoutSec: 9.0,
  lostTimeoutSec: 16.0,
  predictionToleranceSec: 4.5,
});

const trafficAlertCooldowns = new Map<string, number>();
const pilotRequestCooldowns = new Map<string, number>();
let lastPilotRequestSimTime = 0;
let lastWeatherBroadcastSimTime = 0;

function resetCommsTimers() {
  trafficAlertCooldowns.clear();
  pilotRequestCooldowns.clear();
  lastPilotRequestSimTime = 0;
  lastWeatherBroadcastSimTime = 0;
}

const PER_AIRPORT_NAV_STORAGE_KEY = 'skycontrol_per_airport_nav_v1';

function buildInitialPerAirportVisibility(): Record<string, AirportNavVisibility> {
  const defaults: Record<string, AirportNavVisibility> = {};
  for (const prof of ALL_AIRPORT_PROFILES) {
    defaults[prof.airport.icao] = computeDefaultAirportVisibility(prof.airport);
  }

  if (typeof window === 'undefined' || !window.localStorage) {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(PER_AIRPORT_NAV_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, Partial<AirportNavVisibility>>;
    const merged: Record<string, AirportNavVisibility> = { ...defaults };

    for (const prof of ALL_AIRPORT_PROFILES) {
      const icao = prof.airport.icao;
      const saved = parsed[icao];
      if (!saved) continue;
      const validStars = new Set((prof.airport.approachRoutes || []).map(r => r.id));
      const validSids = new Set((prof.airport.departureRoutes || []).map(r => r.id));
      const validWps = new Set(prof.airport.waypoints.map(w => w.name));

      merged[icao] = {
        visibleStarIds: Array.isArray(saved.visibleStarIds)
          ? saved.visibleStarIds.filter(id => validStars.has(id))
          : defaults[icao].visibleStarIds,
        visibleSidIds: Array.isArray(saved.visibleSidIds)
          ? saved.visibleSidIds.filter(id => validSids.has(id))
          : defaults[icao].visibleSidIds,
        visibleWaypoints: Array.isArray(saved.visibleWaypoints)
          ? saved.visibleWaypoints.filter(name => validWps.has(name))
          : defaults[icao].visibleWaypoints,
      };
    }
    return merged;
  } catch {
    return defaults;
  }
}

function persistPerAirportVisibility(map: Record<string, AirportNavVisibility>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PER_AIRPORT_NAV_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export interface RadarLayers {
  terrain: boolean;
  rangeRings: boolean;
  runways: boolean;
  holdingStacks: boolean;
  waypointLabels: boolean;
  extendedCenterlines: boolean;
  trails: boolean;
  speedVectors: boolean;
  radarSweep: boolean;
  starCorridors: boolean;
  sidCorridors: boolean;
  procedureRestrictions: boolean;
  tmaBoundary: boolean;
  extendedTargetTags: boolean;
}

export interface SimulationStore {
  // Airport & Scenario Context
  airportProfile: AirportProfile;
  airport: Airport;
  activeRunwayGeometries: RunwayGeometry[];
  activeLandingRunwayId: string;
  activeDepartureRunwayId: string;
  activeScenarioName: string;

  // Dynamic Traffic & Emergency Settings
  spawnIntervalSec: number;
  maxTraffic: number;
  heavyRatio: number;
  allowEmergencies: boolean;
  emergencyDelaySec: number;
  emergencyTriggered: boolean;

  // Mission Tracking
  activeMission: ActiveMissionState;

  // Core Radar & Aircraft State
  aircraft: Aircraft[];
  selectedAircraftId: string | null;
  weather: WeatherCondition;
  isPaused: boolean;
  simSpeed: number; // 1, 2, 5
  stats: SimulationStats;
  conflicts: ConflictPair[];
  radioMessages: RadioMessage[];
  audioMuted: boolean;
  audioVolume: number;
  towerVoiceId: TowerVoiceId;
  radarLayers: RadarLayers;
  perAirportVisibility: Record<string, AirportNavVisibility>;
  hasCompletedStartupSetup: boolean;
  simulationEvents: SimulationEvent[];
  activeTransmission: { callsign: string; speaker: 'ATC' | 'PILOT'; voiceLabel?: string } | null;

  // Real Radar Scanning & Tracking Engine State
  radarTracks: RadarTrack[];
  antennaAzimuth: number;
  radarScanCount: number;
  getRadarTrack: (aircraftId: string) => RadarTrack | undefined;

  // Tactical measurement tool
  measureStart: { x: number; y: number } | null;
  measureCurrent: { x: number; y: number } | null;
  envelopeWarning: EnvelopeWarning | null;
  clearEnvelopeWarning: () => void;

  // Actions & Commands
  selectAircraft: (id: string | null) => void;
  setHeading: (id: string, heading: number) => void;
  presentHeading: (id: string) => void;
  turnLeft: (id: string, degrees: number) => void;
  turnRight: (id: string, degrees: number) => void;
  setAltitude: (id: string, altitude: number, expedite?: boolean) => void;
  setSpeed: (id: string, speed: number) => void;
  directTo: (id: string, waypointName: string) => void;
  appendWaypointRoute: (id: string, waypointName: string) => void;
  setWaypointRoute: (id: string, waypoints: string[], armIlsAfter?: boolean) => void;
  clearRoute: (id: string) => void;
  assignRunway: (id: string, runwayId: string) => void;
  vectorToIntercept: (id: string, runwayId: string) => void;
  clearILS: (id: string, runwayId: string) => void;
  goAround: (id: string) => void;
  holdAt: (id: string, waypointName: string) => void;
  lineUpAndWait: (id: string, runwayId: string) => void;
  clearTakeoff: (id: string) => void;
  abortTakeoff: (id: string) => void;
  proceedDepartureOnExit: (id: string) => void;
  handoffDeparture: (id: string) => void;
  repositionTag: (id: string, offsetX: number, offsetY: number) => void;

  // Simulation, Airport, Mission & Scenario Management
  tickSimulation: (dt: number) => void;
  togglePause: () => void;
  setSimSpeed: (speed: number) => void;
  setAudioMuted: (muted: boolean) => void;
  setAudioVolume: (vol: number) => void;
  setTowerVoice: (voiceId: TowerVoiceId) => void;
  syncGlobalAudioSettings: (settings: GlobalAudioSettings, applyPreset?: boolean) => void;
  toggleLayer: (layer: keyof RadarLayers) => void;
  setAllRadarLayers: (visible: boolean) => void;
  applyRadarDeclutter: (preset: 'full' | 'tactical' | 'minimal') => void;
  toggleAirportStar: (icao: string, starId: string) => void;
  toggleAirportSid: (icao: string, sidId: string) => void;
  toggleAirportWaypoint: (icao: string, waypointName: string) => void;
  setAirportAllRoutesVisible: (icao: string, visible: boolean) => void;
  matchAirportRoutesToRunways: (
    icao: string,
    landingRunwayId?: string,
    departureRunwayId?: string
  ) => void;
  setPerAirportVisibilityMap: (nextMap: Record<string, AirportNavVisibility>) => void;
  applyPreFlightSession: (
    config: PreFlightSessionConfig,
    customScenario?: CustomScenarioConfig
  ) => void;
  spawnInbound: () => void;
  spawnDeparture: () => void;
  triggerEmergency: (type?: 'ENGINE_FAILURE' | 'MEDICAL' | 'FUEL_CRITICAL') => void;
  broadcastWeatherAdvisory: () => void;
  switchAirport: (
    icao: string,
    landingRunwayId?: string,
    departureRunwayId?: string,
    weatherOverride?: WeatherCondition
  ) => void;
  startMission: (missionId: MissionId) => void;
  exitMission: () => void;
  startCustomScenario: (config: CustomScenarioConfig) => void;
  resetSimulation: (scenario?: string) => void;
  setMeasurePoints: (
    start: { x: number; y: number } | null,
    current: { x: number; y: number } | null
  ) => void;
}

/**
 * Generates an initial balanced fleet with randomized 360° TMA placements and safe spacing
 */
function createFleetForAirport(
  airport: Airport,
  _runwayGeometries: RunwayGeometry[],
  landingRunwayId: string,
  departureRunwayId: string,
  inboundCount: number = 3,
  departureCount: number = 1,
  heavyRatio?: number,
  includeInitialEmergency: boolean = false
): Aircraft[] {
  const arrRwy = airport.runways.find(r => r.id === landingRunwayId) || airport.runways[0];
  const depRwy =
    airport.runways.find(r => r.id === departureRunwayId) ||
    airport.runways[1] ||
    airport.runways[0];
  const fleet: Aircraft[] = [];

  for (let i = 0; i < inboundCount; i++) {
    const isEmer = i === 0 && includeInitialEmergency;
    const flight = generateInboundFlight(i + 1, {
      airport,
      arrivalRunway: arrRwy,
      heavyRatio,
      isEmergency: isEmer,
      emergencyType: isEmer ? 'ENGINE_FAILURE' : undefined,
      existingAircraft: fleet,
      initialScopeDistribution: true,
    });
    fleet.push(flight);
  }

  for (let d = 0; d < departureCount; d++) {
    const dep = generateDepartureFlight({
      airport,
      departureRunway: depRwy,
      heavyRatio,
      existingAircraft: fleet,
    });
    fleet.push(dep);
  }

  return fleet;
}

function getFormattedUTCTime(): string {
  const d = new Date();
  return d.toTimeString().split(' ')[0];
}

function pickVariant(options: string[]): string {
  return options[Math.floor(Math.random() * options.length)];
}

function formatReadableAlt(altFeet: number): string {
  if (altFeet >= 8000) {
    const fl = Math.round(altFeet / 100);
    return `FL${fl.toString().padStart(3, '0')}`;
  }
  return `${altFeet.toLocaleString('en-US')} ft`;
}

function pilotTag(ac: Aircraft): string {
  return formatPilotDisplayCallsign({
    callsign: ac.callsign,
    airline: ac.airline,
    telephony: ac.telephony,
    category: ac.category,
  });
}

interface CommsExchangeMeta {
  atcRole?: AtcStationRole;
  priority?: CommsPriority;
  frequency?: string;
  atcSpokenText?: string;
  pilotSpokenText?: string;
}

function resolveExchangePriority(ac: Aircraft, defaultPriority: CommsPriority, override?: CommsPriority): CommsPriority {
  if (override) return override;
  return ac.isEmergency ? 'EMERGENCY' : defaultPriority;
}

function logCommsExchange(
  get: () => SimulationStore,
  set: (fn: (state: SimulationStore) => Partial<SimulationStore>) => void,
  ac: Aircraft,
  atcText: string,
  pilotText: string,
  spokenPilotText: string,
  meta?: CommsExchangeMeta
) {
  const { airportProfile, airport, aircraft } = get();
  const frequency = meta?.frequency || airportProfile.vhfFrequency;
  const priority = resolveExchangePriority(ac, 'ATC_CLEARANCE', meta?.priority);
  const atcRole: AtcStationRole = meta?.atcRole || 'APPROACH';

  const atcMsg: RadioMessage = {
    id: `atc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: getFormattedUTCTime(),
    sender: 'ATC',
    callsign: airportProfile.directorCallsign,
    text: atcText,
    frequency,
  };

  set(state => ({ radioMessages: [atcMsg, ...state.radioMessages.slice(0, 49)] }));

  radioAudio.speakRadioExchange(
    atcText,
    ac.callsign,
    spokenPilotText,
    spokenPilotText.trim().length > 0
      ? () => {
          const pilotMsg: RadioMessage = {
            id: `pilot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: getFormattedUTCTime(),
            sender: 'PILOT',
            callsign: ac.callsign,
            text: pilotText,
            frequency,
          };
          set(state => ({ radioMessages: [pilotMsg, ...state.radioMessages.slice(0, 49)] }));
        }
      : undefined,
    {
      airportIcao: airport.icao,
      aircraftId: ac.id,
      airline: ac.airline,
      telephony: ac.telephony,
      aircraftType: ac.aircraftType,
      frequency,
      priority,
      atcRole,
      atcSpokenText: meta?.atcSpokenText || formatPhraseForSpeech(atcText),
      pilotSpokenText: meta?.pilotSpokenText,
      isEmergency: ac.isEmergency,
      isHeavy: ac.category === 'Heavy',
      pilotHasCallsign: false,
      activeCallsigns: aircraft.map(f => f.callsign),
    }
  );
}

function logPilotTransmission(
  get: () => SimulationStore,
  set: (fn: (state: SimulationStore) => Partial<SimulationStore>) => void,
  ac: Aircraft,
  pilotText: string,
  speakAudio: boolean = true,
  meta?: {
    priority?: CommsPriority;
    atcRole?: AtcStationRole;
    frequency?: string;
    pilotSpokenText?: string;
  }
) {
  const { airportProfile, airport, aircraft } = get();
  const frequency = meta?.frequency || airportProfile.vhfFrequency;
  const pilotMsg: RadioMessage = {
    id: `pilot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: getFormattedUTCTime(),
    sender: 'PILOT',
    callsign: ac.callsign,
    text: pilotText,
    frequency,
  };
  set(state => ({ radioMessages: [pilotMsg, ...state.radioMessages.slice(0, 49)] }));

  if (speakAudio) {
    radioAudio.speakPilotReadback(ac.callsign, pilotText, {
      airportIcao: airport.icao,
      aircraftId: ac.id,
      airline: ac.airline,
      telephony: ac.telephony,
      aircraftType: ac.aircraftType,
      frequency,
      priority: resolveExchangePriority(ac, 'PILOT_READBACK', meta?.priority),
      atcRole: meta?.atcRole || 'TOWER',
      pilotSpokenText: meta?.pilotSpokenText || formatPhraseForSpeech(pilotText),
      isEmergency: ac.isEmergency,
      isHeavy: ac.category === 'Heavy',
      pilotHasCallsign: true,
      activeCallsigns: aircraft.map(f => f.callsign),
    });
  }
}

radioAudio.setAirportContext(initialResolved.airport.icao);

const initialFleet = createFleetForAirport(
  initialResolved.airport,
  initialResolved.runwayGeometries,
  initialResolved.landingRunwayId,
  initialResolved.departureRunwayId,
  3,
  1
);
globalRadarTracker.seedInitialTracks(initialFleet, 0);

const IDLE_MISSION_STATE: ActiveMissionState = {
  mission: null,
  status: 'idle',
  objectives: [],
  emergencyHandled: false,
  goAroundObserved: false,
};

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  airportProfile: initialResolved.profile,
  airport: initialResolved.airport,
  activeRunwayGeometries: initialResolved.runwayGeometries,
  activeLandingRunwayId: initialResolved.landingRunwayId,
  activeDepartureRunwayId: initialResolved.departureRunwayId,
  activeScenarioName: 'Free Operations · EGLL',

  spawnIntervalSec: 45,
  maxTraffic: 10,
  heavyRatio: 0.35,
  allowEmergencies: false,
  emergencyDelaySec: 45,
  emergencyTriggered: false,

  activeMission: IDLE_MISSION_STATE,

  aircraft: initialFleet,
  selectedAircraftId: initialFleet[0]?.id || null,
  weather: initialResolved.profile.defaultWeather,
  isPaused: true,
  simSpeed: 1,
  stats: {
    landings: 0,
    departures: 0,
    goArounds: 0,
    separationViolations: 0,
    score: 100,
    elapsedSeconds: 0,
  },
  conflicts: [],
  radioMessages: [
    {
      id: 'init_1',
      timestamp: getFormattedUTCTime(),
      sender: 'PILOT',
      callsign: initialFleet[0]?.callsign || 'BAW452',
      text: `${initialResolved.airport.name} Director, ${initialFleet[0]?.callsign || 'BAW452'}${initialFleet[0]?.category === 'Heavy' ? ' Heavy' : ''}, passing ${formatReadableAlt(initialFleet[0]?.altitude || 8000)}, heading ${Math.round(initialFleet[0]?.heading || 270).toString().padStart(3, '0')}, inbound for vectors.`,
      frequency: initialResolved.profile.vhfFrequency,
    },
  ],
  audioMuted: false,
  audioVolume: 0.8,
  towerVoiceId: radioAudio.getTowerVoiceId(),
  radarLayers: {
    terrain: true,
    rangeRings: true,
    runways: true,
    holdingStacks: true,
    waypointLabels: true,
    extendedCenterlines: true,
    trails: true,
    speedVectors: true,
    radarSweep: true,
    starCorridors: true,
    sidCorridors: true,
    procedureRestrictions: true,
    tmaBoundary: true,
    extendedTargetTags: true,
  },
  perAirportVisibility: buildInitialPerAirportVisibility(),
  hasCompletedStartupSetup: false,
  simulationEvents: [],
  activeTransmission: null,
  radarTracks: globalRadarTracker.getTracks(),
  antennaAzimuth: 0,
  radarScanCount: 0,
  getRadarTrack: (aircraftId: string) => globalRadarTracker.getTrack(aircraftId),
  measureStart: null,
  measureCurrent: null,
  envelopeWarning: null,

  clearEnvelopeWarning: () => {
    set({ envelopeWarning: null });
  },

  selectAircraft: id => {
    set(state => ({
      selectedAircraftId: id,
      envelopeWarning:
        state.envelopeWarning && state.envelopeWarning.aircraftId === id
          ? state.envelopeWarning
          : null,
    }));
  },

  setHeading: (id, heading) => {
    const target = normalizeHeading(Math.round(heading));
    const ac = get().aircraft.find(a => a.id === id);
    if (!ac) return;

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id
          ? {
              ...a,
              targetHeading: target,
              assignedWaypoint: null,
              routeQueue: [],
              autoInterceptILS: false,
              holdingWaypoint: null,
              ilsArmed: false,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
              status:
                a.status === 'Established' || a.status === 'Holding' || a.status === 'LocalizerIntercept'
                  ? 'Inbound'
                  : a.status,
            }
          : a
      ),
    }));

    const headingStr = target.toString().padStart(3, '0');
    const atcCmd = pickVariant([
      `${ac.callsign}, fly heading ${headingStr}`,
      `${ac.callsign}, heading ${headingStr}`,
    ]);
    const pilotPhrase = pickVariant([
      `Fly heading ${headingStr}`,
      `Roger, turning heading ${headingStr}`,
      `Heading ${headingStr}`,
    ]);
    logCommsExchange(
      get,
      set,
      ac,
      atcCmd,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase
    );
  },

  presentHeading: id => {
    const ac = get().aircraft.find(a => a.id === id);
    if (!ac) return;
    const hdg = normalizeHeading(Math.round(ac.heading));

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id
          ? {
              ...a,
              targetHeading: hdg,
              assignedWaypoint: null,
              routeQueue: [],
              autoInterceptILS: false,
              holdingWaypoint: null,
              ilsArmed: false,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
              status:
                a.status === 'Established' || a.status === 'Holding' || a.status === 'LocalizerIntercept'
                  ? 'Inbound'
                  : a.status,
            }
          : a
      ),
    }));

    const hdgStr = hdg.toString().padStart(3, '0');
    const pilotPhrase = `Maintaining present heading ${hdgStr}`;
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, cancel route, maintain present heading ${hdgStr}`,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase
    );
  },

  turnLeft: (id, degrees) => {
    const ac = get().aircraft.find(a => a.id === id);
    if (!ac) return;
    const newTarget = normalizeHeading(ac.targetHeading - degrees);
    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id
          ? {
              ...a,
              targetHeading: newTarget,
              assignedWaypoint: null,
              routeQueue: [],
              autoInterceptILS: false,
              holdingWaypoint: null,
              ilsArmed: false,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
              status:
                a.status === 'Established' || a.status === 'Holding' || a.status === 'LocalizerIntercept'
                  ? 'Inbound'
                  : a.status,
            }
          : a
      ),
    }));
    const headingStr = newTarget.toString().padStart(3, '0');
    const atcCmd = pickVariant([
      `${ac.callsign}, turn left heading ${headingStr}`,
      `${ac.callsign}, left heading ${headingStr}`,
    ]);
    const pilotPhrase = pickVariant([
      `Left heading ${headingStr}`,
      `Turning left heading ${headingStr}`,
      `Wilco, left ${headingStr}`,
    ]);
    logCommsExchange(
      get,
      set,
      ac,
      atcCmd,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase
    );
  },

  turnRight: (id, degrees) => {
    const ac = get().aircraft.find(a => a.id === id);
    if (!ac) return;
    const newTarget = normalizeHeading(ac.targetHeading + degrees);
    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id
          ? {
              ...a,
              targetHeading: newTarget,
              assignedWaypoint: null,
              routeQueue: [],
              autoInterceptILS: false,
              holdingWaypoint: null,
              ilsArmed: false,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
              status:
                a.status === 'Established' || a.status === 'Holding' || a.status === 'LocalizerIntercept'
                  ? 'Inbound'
                  : a.status,
            }
          : a
      ),
    }));
    const headingStr = newTarget.toString().padStart(3, '0');
    const atcCmd = pickVariant([
      `${ac.callsign}, turn right heading ${headingStr}`,
      `${ac.callsign}, right heading ${headingStr}`,
    ]);
    const pilotPhrase = pickVariant([
      `Right heading ${headingStr}`,
      `Turning right heading ${headingStr}`,
      `Wilco, right ${headingStr}`,
    ]);
    logCommsExchange(
      get,
      set,
      ac,
      atcCmd,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase
    );
  },

  setAltitude: (id, altitude, expedite = false) => {
    const { aircraft, airport, weather } = get();
    const ac = aircraft.find(a => a.id === id);
    if (!ac) return;

    const perf = getAircraftPerformance(ac.aircraftType);
    const bounds = getAircraftOperationalBounds(ac.aircraftType, airport.elevationFeet);
    const requested = Math.round(altitude);
    const clampedHigh = requested > bounds.maxAltitudeFt;
    const clampedLow = requested < airport.elevationFeet;
    const target = Math.max(airport.elevationFeet, Math.min(bounds.maxAltitudeFt, requested));

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id
          ? {
              ...a,
              targetAltitude: target,
              expediteAltitude: expedite,
              ilsGlideslopeCaptured: false,
            }
          : a
      ),
      envelopeWarning:
        clampedHigh || clampedLow
          ? {
              aircraftId: ac.id,
              callsign: ac.callsign,
              kind: 'ALTITUDE',
              message: clampedHigh
                ? `${ac.callsign} (${ac.aircraftType}) max altitude ${bounds.maxAltitudeFt.toLocaleString()} ft — clamped from ${requested.toLocaleString()} ft`
                : `${ac.callsign} (${ac.aircraftType}) below field elevation ${airport.elevationFeet.toLocaleString()} ft — clamped`,
              timestamp: Date.now(),
            }
          : state.envelopeWarning?.kind === 'ALTITUDE' && state.envelopeWarning.aircraftId === ac.id
          ? null
          : state.envelopeWarning,
    }));

    const isClimb = target > ac.altitude;
    const actionWord = isClimb
      ? pickVariant(['climb', 'climb and maintain'])
      : pickVariant(['descend', 'descend and maintain']);
    const pilotAction = isClimb ? 'Climbing' : 'Descending to';
    const altText = formatReadableAlt(target);
    const reqText = formatReadableAlt(requested);
    const qnhTag = !isClimb && target < 8000 ? `, QNH ${weather.qnh}` : '';
    const expeditePhrase = expedite ? ', expedite' : '';

    const pilotPhrase = clampedHigh
      ? `Unable ${reqText}, ${perf.name} max altitude ${altText}, maintaining ${altText}`
      : clampedLow
      ? `Unable ${reqText}, minimum altitude ${altText}, maintaining ${altText}`
      : `${pilotAction} ${altText}${expedite ? ', expediting' : ''}${qnhTag}`;

    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, ${actionWord} ${clampedHigh || clampedLow ? reqText : altText}${qnhTag}${expeditePhrase}`,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase
    );
  },

  setSpeed: (id, speed) => {
    const { aircraft, airport } = get();
    const ac = aircraft.find(a => a.id === id);
    if (!ac) return;

    const perf = getAircraftPerformance(ac.aircraftType);
    const bounds = getAircraftOperationalBounds(ac.aircraftType, airport.elevationFeet);
    const requested = Math.round(speed);
    const clampedHigh = requested > bounds.maxSpeedKt;
    const clampedLow = requested < bounds.minSpeedKt;
    const target = Math.max(bounds.minSpeedKt, Math.min(bounds.maxSpeedKt, requested));

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id ? { ...a, targetAirspeed: target } : a
      ),
      envelopeWarning:
        clampedHigh || clampedLow
          ? {
              aircraftId: ac.id,
              callsign: ac.callsign,
              kind: 'SPEED',
              message: clampedHigh
                ? `${ac.callsign} (${ac.aircraftType}) max IAS ${bounds.maxSpeedKt} kt — clamped from ${requested} kt`
                : `${ac.callsign} (${ac.aircraftType}) min clean IAS ${bounds.minSpeedKt} kt — clamped from ${requested} kt`,
              timestamp: Date.now(),
            }
          : state.envelopeWarning?.kind === 'SPEED' && state.envelopeWarning.aircraftId === ac.id
          ? null
          : state.envelopeWarning,
    }));

    const verb =
      target < ac.indicatedAirspeed - 5
        ? pickVariant(['reduce speed to', 'speed'])
        : target > ac.indicatedAirspeed + 5
        ? pickVariant(['increase speed to', 'speed'])
        : 'maintain speed';
    const pilotPhrase = clampedHigh
      ? `Unable ${requested} knots, ${perf.name} max speed ${bounds.maxSpeedKt} knots, maintaining ${target} knots`
      : clampedLow
      ? `Unable ${requested} knots, minimum speed ${bounds.minSpeedKt} knots, maintaining ${target} knots`
      : target < ac.indicatedAirspeed - 5
      ? `Reducing speed ${target} knots`
      : target > ac.indicatedAirspeed + 5
      ? `Increasing to ${target} knots`
      : `Maintaining ${target} knots`;

    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, ${verb} ${requested} knots`,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase
    );
  },

  directTo: (id, waypointName) => {
    const ac = get().aircraft.find(a => a.id === id);
    const wp = get().airport.waypoints.find(w => w.name === waypointName);
    if (!ac || !wp) return;

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id
          ? {
              ...a,
              assignedWaypoint: waypointName,
              routeQueue: [],
              holdingWaypoint: null,
              status: a.status === 'Departing' || a.status === 'Outbound' ? a.status : 'Inbound',
              flightPhase:
                (a.status === 'Departing' || a.status === 'Outbound') && a.flightPhase === 'INITIAL_CLIMB'
                  ? 'EXIT_ROUTING'
                  : a.flightPhase,
              ilsArmed: false,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
            }
          : a
      ),
    }));

    const atcCmd = pickVariant([
      `${ac.callsign}, cleared direct ${waypointName}`,
      `${ac.callsign}, direct ${waypointName}`,
    ]);
    const pilotPhrase = pickVariant([
      `Proceeding direct ${waypointName}`,
      `Direct ${waypointName}, roger`,
    ]);
    logCommsExchange(
      get,
      set,
      ac,
      atcCmd,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase
    );
  },

  appendWaypointRoute: (id, waypointName) => {
    const ac = get().aircraft.find(a => a.id === id);
    const wp = get().airport.waypoints.find(w => w.name === waypointName);
    if (!ac || !wp) return;

    const currentQueue = ac.routeQueue ? [...ac.routeQueue] : [];
    // Avoid duplicating the immediate active or last queued fix
    if (!ac.assignedWaypoint) {
      get().directTo(id, waypointName);
      return;
    }
    const lastFix = currentQueue.length > 0 ? currentQueue[currentQueue.length - 1] : ac.assignedWaypoint;
    if (lastFix === waypointName) return;

    const updatedQueue = [...currentQueue, waypointName];
    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id
          ? {
              ...a,
              routeQueue: updatedQueue,
              holdingWaypoint: null,
              status: a.status === 'Departing' || a.status === 'Outbound' ? a.status : 'Inbound',
            }
          : a
      ),
    }));

    const fullPath = [ac.assignedWaypoint, ...updatedQueue].join(' then ');
    const pilotPhrase = `Cleared via ${fullPath}`;
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, recleared route via ${fullPath}`,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase
    );
  },

  setWaypointRoute: (id, waypoints, armIlsAfter = false) => {
    const ac = get().aircraft.find(a => a.id === id);
    if (!ac || waypoints.length === 0) return;

    const validWps = waypoints.filter(name =>
      get().airport.waypoints.some(w => w.name === name)
    );
    if (validWps.length === 0) return;

    const [firstFix, ...restFixes] = validWps;
    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id
          ? {
              ...a,
              assignedWaypoint: firstFix,
              routeQueue: restFixes,
              autoInterceptILS: armIlsAfter,
              holdingWaypoint: null,
              status: a.status === 'Departing' || a.status === 'Outbound' ? a.status : 'Inbound',
              flightPhase:
                (a.status === 'Departing' || a.status === 'Outbound') && a.flightPhase === 'INITIAL_CLIMB'
                  ? 'EXIT_ROUTING'
                  : a.flightPhase,
              ilsArmed: false,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
            }
          : a
      ),
    }));

    const routeText = validWps.join(', ');
    const ilsSuffix = armIlsAfter ? `, then ILS runway ${ac.assignedRunway}` : '';
    const pilotPhrase = `Route ${routeText}${ilsSuffix}`;
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, proceed direct ${routeText}${ilsSuffix}`,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase
    );
  },

  clearRoute: id => {
    get().presentHeading(id);
  },

  assignRunway: (id, runwayId) => {
    const ac = get().aircraft.find(a => a.id === id);
    if (!ac) return;

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id
          ? {
              ...a,
              assignedRunway: runwayId,
              ilsArmed: false,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
            }
          : a
      ),
    }));

    const pilotPhrase = `Expect runway ${runwayId}`;
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, expect vectors ILS runway ${runwayId}`,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase
    );
  },

  vectorToIntercept: (id, runwayId) => {
    const { aircraft, airport, activeRunwayGeometries, weather } = get();
    const ac = aircraft.find(a => a.id === id);
    const rwyGeom =
      activeRunwayGeometries.find(r => r.id === runwayId) ||
      activeRunwayGeometries[0];
    if (!ac || !rwyGeom) return;

    // Aim for a final approach intercept point ~11 NM back on the extended centerline
    const rwyHdg = rwyGeom.magneticHeading;
    const rad = (rwyHdg * Math.PI) / 180;
    const gateDistNM = 11.0;
    const gateX = rwyGeom.threshold.x - gateDistNM * Math.sin(rad);
    const gateY = rwyGeom.threshold.y - gateDistNM * Math.cos(rad);

    // Compute smooth intercept heading capped within realistic 30°-45° capture geometry
    const brgToGate = calculateBearing(ac.x, ac.y, gateX, gateY);
    const deltaFromFinal = getHeadingDelta(rwyHdg, brgToGate);
    const clampedDelta = Math.max(-35, Math.min(35, deltaFromFinal));
    const interceptHeading = Math.round(
      Math.abs(getHeadingDelta(rwyHdg, brgToGate)) <= 50
        ? brgToGate
        : normalizeHeading(rwyHdg + (deltaFromFinal >= 0 ? 30 : -30))
    );
    void clampedDelta;

    const perf = getAircraftPerformance(ac.aircraftType);
    const finalAlt = Math.min(
      perf.serviceCeilingFt,
      Math.ceil(airport.elevationFeet / 1000) * 1000 +
        (perf.aircraftClass === 'LIGHT_GA' ? 2000 : 3000)
    );
    const nextAlt = Math.min(ac.targetAltitude, finalAlt);
    const nextSpd = Math.max(
      perf.minAirspeedIAS,
      Math.min(ac.targetAirspeed, Math.min(190, perf.cruiseAirspeedIAS))
    );

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id
          ? {
              ...a,
              assignedRunway: runwayId,
              assignedWaypoint: null,
              routeQueue: [],
              autoInterceptILS: false,
              holdingWaypoint: null,
              targetHeading: interceptHeading,
              targetAltitude: nextAlt,
              targetAirspeed: nextSpd,
              ilsArmed: true,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
              status: 'LocalizerIntercept',
            }
          : a
      ),
    }));

    const hdgStr = interceptHeading.toString().padStart(3, '0');
    const altText = formatReadableAlt(nextAlt);
    const pilotPhrase = `Heading ${hdgStr}, descending ${altText}, cleared ILS runway ${runwayId}`;
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, turn heading ${hdgStr}, descend to ${altText} QNH ${weather.qnh}, cleared ILS runway ${runwayId}`,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase
    );
  },

  clearILS: (id, runwayId) => {
    const ac = get().aircraft.find(a => a.id === id);
    if (!ac) return;

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id
          ? {
              ...a,
              ilsArmed: true,
              assignedRunway: runwayId,
              autoInterceptILS: false,
              status: 'LocalizerIntercept',
            }
          : a
      ),
    }));

    const pilotPhrase = `Cleared ILS approach runway ${runwayId}, will report established`;
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, cleared ILS approach runway ${runwayId}, report established`,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase
    );
  },

  goAround: id => {
    const { aircraft, airport, activeMission, stats } = get();
    const ac = aircraft.find(a => a.id === id);
    if (!ac) return;

    const perf = getAircraftPerformance(ac.aircraftType);
    const missedAlt = Math.min(
      perf.serviceCeilingFt,
      Math.ceil(airport.elevationFeet / 1000) * 1000 +
        Math.min(3000, perf.initialDepartureClearanceAglFt)
    );
    const nextStats: SimulationStats = {
      ...stats,
      goArounds: stats.goArounds + 1,
      score: activeMission.status === 'active' && activeMission.mission?.requireGoAroundHandled
        ? stats.score
        : Math.max(0, stats.score - 2),
    };

    const nextMissionState =
      activeMission.status === 'active'
        ? evaluateMissionProgress(activeMission, nextStats, false, true)
        : activeMission;

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id
          ? {
              ...a,
              status: 'GoAround',
              ilsArmed: false,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
              assignedWaypoint: null,
              routeQueue: [],
              autoInterceptILS: false,
              holdingWaypoint: null,
              targetAltitude: missedAlt,
              targetAirspeed: Math.min(210, perf.cruiseAirspeedIAS),
              targetHeading: a.heading,
              expediteAltitude: true,
            }
          : a
      ),
      stats: nextStats,
      activeMission: nextMissionState,
    }));

    const altStr = formatReadableAlt(missedAlt);
    const pilotPhrase = `Going around, climbing ${altStr} on runway heading`;
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, go around, climb straight ahead to ${altStr}`,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase,
      { atcRole: 'TOWER', priority: ac.isEmergency ? 'EMERGENCY' : 'CRITICAL_ATC' }
    );
  },

  holdAt: (id, waypointName) => {
    const ac = get().aircraft.find(a => a.id === id);
    const wp = get().airport.waypoints.find(w => w.name === waypointName);
    if (!ac || !wp) return;

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id
          ? {
              ...a,
              status: 'Holding',
              holdingWaypoint: waypointName,
              holdingInboundHeading: wp.defaultHoldingHeading || 270,
              holdingLeg: 'Inbound',
              holdingTimer: 0,
              assignedWaypoint: waypointName,
              routeQueue: [],
              autoInterceptILS: false,
              ilsArmed: false,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
            }
          : a
      ),
    }));

    const pilotPhrase = `Entering hold at ${waypointName} as published`;
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, hold at ${waypointName} as published, expect further clearance`,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase
    );
  },

  lineUpAndWait: (id, runwayId) => {
    const { aircraft, activeRunwayGeometries, stats } = get();
    const ac = aircraft.find(a => a.id === id);
    if (!ac) return;
    const rwyGeom =
      activeRunwayGeometries.find(r => r.id === runwayId) ||
      activeRunwayGeometries[0];
    const res = lineUpAircraft(ac, rwyGeom, globalOccupancyManager, stats.elapsedSeconds);

    if (!res.success) {
      const pilotPhrase = `Unable line up runway ${runwayId}, ${res.reason}`;
      logCommsExchange(
        get,
        set,
        ac,
        `${ac.callsign}, runway ${runwayId}, line up and wait`,
        `${pilotPhrase}, ${pilotTag(ac)}`,
        pilotPhrase,
        { atcRole: 'TOWER', priority: ac.isEmergency ? 'EMERGENCY' : 'ATC_CLEARANCE' }
      );
      return;
    }

    set(state => ({
      aircraft: state.aircraft.map(a => (a.id === id ? res.aircraft : a)),
    }));

    const pilotPhrase = `Line up and wait runway ${runwayId}`;
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, behind landing traffic, runway ${runwayId} line up and wait`,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase,
      { atcRole: 'TOWER', priority: ac.isEmergency ? 'EMERGENCY' : 'ATC_CLEARANCE' }
    );
  },

  clearTakeoff: id => {
    const { aircraft, activeRunwayGeometries, stats, weather } = get();
    const ac = aircraft.find(a => a.id === id);
    if (!ac) return;
    const rwyGeom =
      activeRunwayGeometries.find(r => r.id === ac.assignedRunway) ||
      activeRunwayGeometries[0];
    const res = issueTakeoffClearance(
      ac,
      rwyGeom,
      globalOccupancyManager,
      stats.elapsedSeconds
    );

    if (!res.success) {
      const pilotPhrase = `Unable takeoff, ${res.reason}`;
      logCommsExchange(
        get,
        set,
        ac,
        `${ac.callsign}, runway ${ac.assignedRunway} cleared for takeoff`,
        `${pilotPhrase}, ${pilotTag(ac)}`,
        pilotPhrase,
        { atcRole: 'TOWER', priority: ac.isEmergency ? 'EMERGENCY' : 'ATC_CLEARANCE' }
      );
      return;
    }

    const nextStats: SimulationStats = {
      ...stats,
      score: Math.min(100, stats.score + 5),
    };

    set(state => ({
      aircraft: state.aircraft.map(a => (a.id === id ? res.aircraft : a)),
      stats: nextStats,
    }));

    const windDirStr = Math.round(weather.windDirection).toString().padStart(3, '0');
    const windText = `wind ${windDirStr} degrees ${Math.round(weather.windSpeed)} knots`;
    const pilotPhrase = `Cleared for takeoff runway ${ac.assignedRunway}`;
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, ${windText}, QNH ${weather.qnh}, runway ${ac.assignedRunway} cleared for takeoff`,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase,
      { atcRole: 'TOWER', priority: ac.isEmergency ? 'EMERGENCY' : 'ATC_CLEARANCE' }
    );
  },

  abortTakeoff: id => {
    const { aircraft, airport } = get();
    const ac = aircraft.find(a => a.id === id);
    if (!ac) return;
    const res = rejectTakeoff(ac, 'Aborted on ATC instruction', airport.elevationFeet);
    radioAudio.cancelCallsignTransmissions(ac.id);
    if (!res.success) {
      const pilotPhrase = `Unable to stop, past V1, continuing takeoff`;
      logCommsExchange(
        get,
        set,
        ac,
        `${ac.callsign}, cancel takeoff, I say again cancel takeoff!`,
        `Unable abort - past V1 (${Math.round(ac.indicatedAirspeed)}kt), committing to takeoff!`,
        pilotPhrase,
        { atcRole: 'TOWER', priority: ac.isEmergency ? 'EMERGENCY' : 'CRITICAL_ATC' }
      );
      return;
    }

    set(state => ({
      aircraft: state.aircraft.map(a => (a.id === id ? res.aircraft : a)),
    }));

    const pilotPhrase = `Stopping immediately, aborting takeoff runway ${ac.assignedRunway}`;
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, hold position, stop immediately, abort takeoff!`,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase,
      { atcRole: 'TOWER', priority: ac.isEmergency ? 'EMERGENCY' : 'CRITICAL_ATC' }
    );
  },

  proceedDepartureOnExit: id => {
    const { aircraft, airport } = get();
    const ac = aircraft.find(a => a.id === id);
    if (!ac) return;

    const gates = evaluateDepartureGates(ac, airport.elevationFeet, airport.waypoints);
    const rawRoute =
      ac.departureRouteWaypoints && ac.departureRouteWaypoints.length > 0
        ? ac.departureRouteWaypoints
        : ac.assignedExitWaypoint
        ? [ac.assignedExitWaypoint]
        : [];
    const validRoute = rawRoute.filter(name =>
      airport.waypoints.some(w => w.name === name)
    );
    const fallbackExit = airport.waypoints.find(
      w => w.role === 'EXIT' || w.isDepartureExit
    );
    const finalRoute =
      validRoute.length > 0
        ? validRoute
        : fallbackExit
        ? [fallbackExit.name]
        : [];
    if (finalRoute.length === 0) return;

    if (!gates.isClimbGateMet) {
      const pilotPhrase = `Unable exit route ${finalRoute[finalRoute.length - 1]}, climbing through ${Math.round(ac.altitude)} feet, need ${gates.minClimbAglFt} feet AGL and ${gates.minClimbSpeedKt} knots`;
      logCommsExchange(
        get,
        set,
        ac,
        `${ac.callsign}, proceed direct ${finalRoute.join(', ')}`,
        `${pilotPhrase}, ${pilotTag(ac)}`,
        `Unable exit route, still on initial climb`,
        { atcRole: 'APPROACH', priority: 'ATC_CLEARANCE' }
      );
      return;
    }

    const [firstFix, ...restFixes] = finalRoute;
    const exitFix = finalRoute[finalRoute.length - 1];
    const sid = (airport.departureRoutes || []).find(s => s.id === ac.assignedSidId);
    const bounds = getAircraftOperationalBounds(ac.aircraftType, airport.elevationFeet);
    const perf = getAircraftPerformance(ac.aircraftType);
    const desiredSidAlt =
      perf.aircraftClass === 'LIGHT_GA'
        ? Math.min(bounds.maxAltitudeFt, Math.ceil(airport.elevationFeet / 1000) * 1000 + 3500)
        : Math.min(
            bounds.maxAltitudeFt,
            Math.max(
              sid?.finalAltitudeFt || Math.ceil(airport.elevationFeet / 1000) * 1000 + 10000,
              ac.targetAltitude
            )
          );
    const desiredSidSpeed = Math.min(
      bounds.maxSpeedKt,
      Math.max(
        bounds.minSpeedKt,
        sid?.maxSpeedKt ? Math.min(sid.maxSpeedKt, perf.cruiseAirspeedIAS) : perf.cruiseAirspeedIAS
      )
    );

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id
          ? {
              ...a,
              assignedWaypoint: firstFix,
              routeQueue: restFixes,
              assignedExitWaypoint: a.assignedExitWaypoint || exitFix,
              departureRouteWaypoints: finalRoute,
              holdingWaypoint: null,
              autoInterceptILS: false,
              ilsArmed: false,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
              targetAltitude: desiredSidAlt,
              targetAirspeed: desiredSidSpeed,
              expediteAltitude: true,
              status: a.status === 'Departing' ? 'Outbound' : a.status,
              flightPhase: 'EXIT_ROUTING',
            }
          : a
      ),
    }));

    const routeText = finalRoute.join(', ');
    const altText = formatReadableAlt(desiredSidAlt);
    const sidLabel = ac.assignedSidName ? `${ac.assignedSidName} departure, ` : '';
    const atcCmd = `${ac.callsign}, ${sidLabel}proceed direct ${routeText}, climb maintain ${altText}`;
    const pilotPhrase = `Proceed direct ${routeText}, climbing ${altText}`;
    logCommsExchange(
      get,
      set,
      ac,
      atcCmd,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase,
      { atcRole: 'APPROACH', priority: 'ATC_CLEARANCE' }
    );
  },

  handoffDeparture: id => {
    const { aircraft, airport, stats, activeMission, selectedAircraftId } = get();
    const ac = aircraft.find(a => a.id === id);
    if (!ac) return;

    const gates = evaluateDepartureGates(ac, airport.elevationFeet, airport.waypoints);
    const nearExitOrReady =
      gates.isHandoffReady ||
      (gates.isClimbGateMet && (gates.exitFixDistNM === null || gates.exitFixDistNM <= 5.0));

    if (!nearExitOrReady) {
      const distInfo =
        gates.exitFixDistNM !== null && gates.exitWaypointName
          ? `${gates.exitFixDistNM.toFixed(1)} miles from ${gates.exitWaypointName}`
          : 'still climbing in terminal sector';
      const pilotPhrase = `Unable Center handoff, ${distInfo}`;
      logCommsExchange(
        get,
        set,
        ac,
        `${ac.callsign}, contact Center on 132.45`,
        `${pilotPhrase}, ${pilotTag(ac)}`,
        pilotPhrase,
        { atcRole: 'APPROACH', priority: 'ATC_CLEARANCE' }
      );
      return;
    }

    const centerFreq = '132.45';
    const atcCmd = `${ac.callsign}, radar service terminated passing ${gates.exitWaypointName || 'exit gate'}, contact Center on ${centerFreq}, good day`;
    const pilotPhrase = `Contact Center ${centerFreq}, goodbye`;

    logCommsExchange(
      get,
      set,
      ac,
      atcCmd,
      `${pilotPhrase}, ${pilotTag(ac)}`,
      pilotPhrase,
      { atcRole: 'APPROACH', priority: 'ATC_CLEARANCE' }
    );

    globalOccupancyManager.releaseRunway(ac.assignedRunway, ac.id);

    const nextStats: SimulationStats = {
      ...stats,
      departures: stats.departures + 1,
      score: Math.min(100, stats.score + 10),
    };
    const nextMissionState =
      activeMission.status === 'active'
        ? evaluateMissionProgress(activeMission, nextStats, false, false)
        : activeMission;

    const remaining = aircraft.filter(a => a.id !== id);
    set({
      aircraft: remaining,
      selectedAircraftId: selectedAircraftId === id ? null : selectedAircraftId,
      stats: nextStats,
      activeMission: nextMissionState,
    });
  },

  repositionTag: (id, offsetX, offsetY) => {
    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id ? { ...a, tagOffset: { x: offsetX, y: offsetY } } : a
      ),
    }));
  },

  togglePause: () => {
    set(state => ({ isPaused: !state.isPaused }));
  },

  setSimSpeed: speed => {
    set({ simSpeed: speed });
  },

  setAudioMuted: muted => {
    radioAudio.setMuted(muted);
    set({ audioMuted: muted });
  },

  setAudioVolume: vol => {
    radioAudio.setVolume(vol);
    set({ audioVolume: vol });
  },

  setTowerVoice: voiceId => {
    radioAudio.setTowerVoiceId(voiceId);
    set({ towerVoiceId: voiceId });
  },

  syncGlobalAudioSettings: (settings, applyPreset = false) => {
    radioAudio.applyGlobalAudioSettings(settings, { applyPreset });
    set({
      audioMuted: !settings.audioEnabled,
      audioVolume: settings.masterVolume,
      towerVoiceId: radioAudio.getTowerVoiceId(),
    });
  },

  toggleLayer: layer => {
    set(state => ({
      radarLayers: {
        ...state.radarLayers,
        [layer]: !state.radarLayers[layer],
      },
    }));
  },

  setAllRadarLayers: visible => {
    set({
      radarLayers: {
        terrain: visible,
        rangeRings: visible,
        runways: visible,
        holdingStacks: visible,
        waypointLabels: visible,
        extendedCenterlines: visible,
        trails: visible,
        speedVectors: visible,
        radarSweep: visible,
        starCorridors: visible,
        sidCorridors: visible,
        procedureRestrictions: visible,
        tmaBoundary: visible,
        extendedTargetTags: visible,
      },
    });
  },

  applyRadarDeclutter: preset => {
    if (preset === 'full') {
      set({
        radarLayers: {
          terrain: true,
          rangeRings: true,
          runways: true,
          holdingStacks: true,
          waypointLabels: true,
          extendedCenterlines: true,
          trails: true,
          speedVectors: true,
          radarSweep: true,
          starCorridors: true,
          sidCorridors: true,
          procedureRestrictions: true,
          tmaBoundary: true,
          extendedTargetTags: true,
        },
      });
    } else if (preset === 'tactical') {
      set({
        radarLayers: {
          terrain: true,
          rangeRings: true,
          runways: true,
          holdingStacks: true,
          waypointLabels: true,
          extendedCenterlines: true,
          trails: true,
          speedVectors: true,
          radarSweep: true,
          starCorridors: false,
          sidCorridors: false,
          procedureRestrictions: false,
          tmaBoundary: true,
          extendedTargetTags: true,
        },
      });
    } else {
      set({
        radarLayers: {
          terrain: false,
          rangeRings: true,
          runways: true,
          holdingStacks: false,
          waypointLabels: false,
          extendedCenterlines: false,
          trails: true,
          speedVectors: true,
          radarSweep: false,
          starCorridors: false,
          sidCorridors: false,
          procedureRestrictions: false,
          tmaBoundary: false,
          extendedTargetTags: false,
        },
      });
    }
  },

  toggleAirportStar: (icao, starId) => {
    set(state => {
      const prof = getAirportProfile(icao);
      const current = state.perAirportVisibility[icao] || computeDefaultAirportVisibility(prof.airport);
      const exists = current.visibleStarIds.includes(starId);
      const nextStarIds = exists
        ? current.visibleStarIds.filter(id => id !== starId)
        : [...current.visibleStarIds, starId];
      const nextMap: Record<string, AirportNavVisibility> = {
        ...state.perAirportVisibility,
        [icao]: {
          ...current,
          visibleStarIds: nextStarIds,
        },
      };
      persistPerAirportVisibility(nextMap);
      return { perAirportVisibility: nextMap };
    });
  },

  toggleAirportSid: (icao, sidId) => {
    set(state => {
      const prof = getAirportProfile(icao);
      const current = state.perAirportVisibility[icao] || computeDefaultAirportVisibility(prof.airport);
      const exists = current.visibleSidIds.includes(sidId);
      const nextSidIds = exists
        ? current.visibleSidIds.filter(id => id !== sidId)
        : [...current.visibleSidIds, sidId];
      const nextMap: Record<string, AirportNavVisibility> = {
        ...state.perAirportVisibility,
        [icao]: {
          ...current,
          visibleSidIds: nextSidIds,
        },
      };
      persistPerAirportVisibility(nextMap);
      return { perAirportVisibility: nextMap };
    });
  },

  toggleAirportWaypoint: (icao, waypointName) => {
    set(state => {
      const prof = getAirportProfile(icao);
      const current = state.perAirportVisibility[icao] || computeDefaultAirportVisibility(prof.airport);
      const exists = current.visibleWaypoints.includes(waypointName);
      const nextWaypoints = exists
        ? current.visibleWaypoints.filter(name => name !== waypointName)
        : [...current.visibleWaypoints, waypointName];
      const nextMap: Record<string, AirportNavVisibility> = {
        ...state.perAirportVisibility,
        [icao]: {
          ...current,
          visibleWaypoints: nextWaypoints,
        },
      };
      persistPerAirportVisibility(nextMap);
      return { perAirportVisibility: nextMap };
    });
  },

  setAirportAllRoutesVisible: (icao, visible) => {
    set(state => {
      const prof = getAirportProfile(icao);
      const nextVis: AirportNavVisibility = visible
        ? computeDefaultAirportVisibility(prof.airport)
        : { visibleStarIds: [], visibleSidIds: [], visibleWaypoints: [] };
      const nextMap = {
        ...state.perAirportVisibility,
        [icao]: nextVis,
      };
      persistPerAirportVisibility(nextMap);
      return { perAirportVisibility: nextMap };
    });
  },

  matchAirportRoutesToRunways: (icao, landingRunwayId, departureRunwayId) => {
    set(state => {
      const prof = getAirportProfile(icao);
      const lRwy = landingRunwayId || state.activeLandingRunwayId || prof.airport.defaultArrivalRunway;
      const dRwy = departureRunwayId || state.activeDepartureRunwayId || prof.airport.defaultDepartureRunway;
      const matched = computeRunwayMatchedVisibility(prof.airport, lRwy, dRwy);
      const nextMap = {
        ...state.perAirportVisibility,
        [icao]: matched,
      };
      persistPerAirportVisibility(nextMap);
      return { perAirportVisibility: nextMap };
    });
  },

  setPerAirportVisibilityMap: nextMap => {
    persistPerAirportVisibility(nextMap);
    set({ perAirportVisibility: nextMap });
  },

  applyPreFlightSession: (config, customScenario) => {
    if (config.perAirportVisibility) {
      persistPerAirportVisibility(config.perAirportVisibility);
      set({ perAirportVisibility: config.perAirportVisibility });
    }

    radioAudio.setMuted(config.audioMuted);
    radioAudio.setVolume(config.audioVolume);
    radioAudio.setVhfPreset(config.radioPreset);
    if (config.towerVoiceId) {
      radioAudio.setTowerVoiceId(config.towerVoiceId as TowerVoiceId);
    }

    if (config.mode === 'mission' && config.missionId) {
      get().startMission(config.missionId);
      set({
        audioMuted: config.audioMuted,
        audioVolume: config.audioVolume,
        towerVoiceId: radioAudio.getTowerVoiceId(),
        simSpeed: config.simSpeed,
        hasCompletedStartupSetup: true,
        isPaused: false,
      });
      return;
    }

    const activeCustom = config.mode === 'custom' ? customScenario : undefined;
    const targetIcao = activeCustom ? activeCustom.airportIcao : config.airportIcao;
    const targetArr = activeCustom ? activeCustom.landingRunwayId : config.landingRunwayId;
    const targetDep = activeCustom ? activeCustom.departureRunwayId : config.departureRunwayId;

    const resolved = resolveConfiguredAirport(targetIcao, targetArr, targetDep);
    radioAudio.clearQueue();
    radioAudio.setAirportContext(resolved.airport.icao);
    globalConflictTracker.clear();
    resetCommsTimers();
    globalOccupancyManager.configureAirport(
      resolved.runwayGeometries,
      resolved.profile.reciprocalPairs
    );
    globalRadarTracker.reset();

    const inbounds = activeCustom ? activeCustom.initialInbounds : config.initialInbounds;
    const departures = activeCustom ? activeCustom.initialDepartures : config.initialDepartures;
    const heavy = activeCustom ? activeCustom.heavyRatio : config.heavyRatio;
    const spawnSec = activeCustom ? activeCustom.spawnIntervalSec : config.spawnIntervalSec;
    const emergAllow = activeCustom ? activeCustom.allowEmergencies : config.allowEmergencies;
    const emergDelay = activeCustom ? activeCustom.emergencyDelaySec : config.emergencyDelaySec;
    const finalWeather: WeatherCondition = activeCustom
      ? {
          windDirection: activeCustom.windDirection,
          windSpeed: activeCustom.windSpeed,
          gusts: activeCustom.gusts,
          qnh: activeCustom.qnh,
          visibilityNM: activeCustom.visibilityNM,
          ceilingFeet: activeCustom.ceilingFeet,
          precipitation: activeCustom.precipitation,
        }
      : config.weather;

    const freshFleet = createFleetForAirport(
      resolved.airport,
      resolved.runwayGeometries,
      resolved.landingRunwayId,
      resolved.departureRunwayId,
      inbounds,
      departures,
      heavy
    );
    radioAudio.pruneActiveAircraft(freshFleet.map(a => a.id));
    globalRadarTracker.seedInitialTracks(freshFleet, 0);

    set({
      airportProfile: resolved.profile,
      airport: resolved.airport,
      activeRunwayGeometries: resolved.runwayGeometries,
      activeLandingRunwayId: resolved.landingRunwayId,
      activeDepartureRunwayId: resolved.departureRunwayId,
      activeScenarioName: activeCustom
        ? activeCustom.name
        : `Briefed Ops · ${resolved.airport.icao}`,
      activeMission: IDLE_MISSION_STATE,
      spawnIntervalSec: spawnSec,
      maxTraffic: Math.max(config.maxTraffic, inbounds + departures + 2),
      heavyRatio: heavy,
      allowEmergencies: emergAllow,
      emergencyDelaySec: emergDelay,
      emergencyTriggered: false,
      aircraft: freshFleet,
      selectedAircraftId: freshFleet[0]?.id || null,
      weather: finalWeather,
      audioMuted: config.audioMuted,
      audioVolume: config.audioVolume,
      towerVoiceId: radioAudio.getTowerVoiceId(),
      isPaused: false,
      hasCompletedStartupSetup: true,
      simSpeed: config.simSpeed || 1,
      stats: {
        landings: 0,
        departures: 0,
        goArounds: 0,
        separationViolations: 0,
        score: 100,
        elapsedSeconds: 0,
      },
      conflicts: [],
      simulationEvents: [],
      radarTracks: globalRadarTracker.getTracks(),
      antennaAzimuth: 0,
      radarScanCount: 0,
      radioMessages: [
        {
          id: `preflight_${Date.now()}`,
          timestamp: getFormattedUTCTime(),
          sender: 'ATC',
          callsign: resolved.profile.directorCallsign,
          text: `${resolved.airport.icao} Radar open. Active RWY ${resolved.landingRunwayId} ARR / ${resolved.departureRunwayId} DEP · Wind ${finalWeather.windDirection.toString().padStart(3, '0')}°/${finalWeather.windSpeed}kt · QNH ${finalWeather.qnh}.`,
          frequency: resolved.profile.vhfFrequency,
        },
      ],
    });
  },

  setMeasurePoints: (start, current) => {
    set({ measureStart: start, measureCurrent: current });
  },

  spawnInbound: () => {
    const { airport, activeLandingRunwayId, heavyRatio, aircraft, airportProfile } = get();
    const arrRwy = airport.runways.find(r => r.id === activeLandingRunwayId) || airport.runways[0];
    const newAc = generateInboundFlight(undefined, {
      airport,
      arrivalRunway: arrRwy,
      heavyRatio,
      existingAircraft: aircraft,
    });
    set(state => ({
      aircraft: [...state.aircraft, newAc],
    }));

    const infoLetter = pickVariant(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo']);
    const initial = buildPilotInitialContact(
      {
        id: newAc.id,
        callsign: newAc.callsign,
        airline: newAc.airline,
        telephony: newAc.telephony,
        category: newAc.category,
        altitude: newAc.altitude,
        heading: newAc.heading,
        assignedWaypoint: newAc.assignedWaypoint,
        airportName: airport.name,
        airportIcao: airport.icao,
      },
      { informationLetter: infoLetter }
    );

    logPilotTransmission(get, set, newAc, initial.displayText, true, {
      priority: 'PILOT_CALLIN',
      atcRole: 'APPROACH',
      frequency: airportProfile.vhfFrequency,
      pilotSpokenText: initial.spokenText,
    });
  },

  spawnDeparture: () => {
    const { airport, activeDepartureRunwayId, heavyRatio, aircraft, airportProfile } = get();
    const depRwy =
      airport.runways.find(r => r.id === activeDepartureRunwayId) ||
      airport.runways[1] ||
      airport.runways[0];
    const newAc = generateDepartureFlight({
      airport,
      departureRunway: depRwy,
      heavyRatio,
      existingAircraft: aircraft,
    });
    set(state => ({
      aircraft: [...state.aircraft, newAc],
    }));

    const initial = buildPilotInitialContact(
      {
        id: newAc.id,
        callsign: newAc.callsign,
        airline: newAc.airline,
        telephony: newAc.telephony,
        category: newAc.category,
        assignedRunway: depRwy.id,
        airportName: airport.name,
        airportIcao: airport.icao,
      },
      { isDeparture: true }
    );

    logPilotTransmission(get, set, newAc, initial.displayText, true, {
      priority: 'PILOT_CALLIN',
      atcRole: 'TOWER',
      frequency: airportProfile.vhfFrequency,
      pilotSpokenText: initial.spokenText,
    });
  },

  triggerEmergency: (type = 'ENGINE_FAILURE') => {
    const { airport, activeLandingRunwayId, airportProfile, aircraft } = get();
    const arrRwy = airport.runways.find(r => r.id === activeLandingRunwayId) || airport.runways[0];
    const emerAc = generateInboundFlight(undefined, {
      airport,
      arrivalRunway: arrRwy,
      isEmergency: true,
      emergencyType: type,
      existingAircraft: aircraft,
    });

    const emergencyDesc =
      type === 'ENGINE_FAILURE'
        ? 'engine failure'
        : type === 'MEDICAL'
        ? 'medical emergency on board'
        : 'minimum fuel emergency';

    const emerPhrase = buildPilotInitialContact(
      {
        id: emerAc.id,
        callsign: emerAc.callsign,
        airline: emerAc.airline,
        telephony: emerAc.telephony,
        category: emerAc.category,
        transponder: emerAc.transponder,
        assignedRunway: arrRwy.id,
        airportName: airport.name,
        airportIcao: airport.icao,
      },
      { emergencyReason: emergencyDesc }
    );
    const emergencyMsg: RadioMessage = {
      id: `emer_${Date.now()}`,
      timestamp: getFormattedUTCTime(),
      sender: 'PILOT',
      callsign: emerAc.callsign,
      text: emerPhrase.displayText,
      frequency: airportProfile.vhfFrequency,
    };

    const atcAckText = `${emerAc.callsign}, roger Mayday, radar contact, expect immediate priority runway ${arrRwy.id}.`;

    radioAudio.playConflictAlert();
    radioAudio.speakPilotToController({
      callsign: emerAc.callsign,
      aircraftId: emerAc.id,
      pilotText: emerPhrase.displayText,
      pilotSpokenText: emerPhrase.spokenText,
      atcReplyText: atcAckText,
      atcReplySpokenText: formatPhraseForSpeech(atcAckText),
      onAtcReplyStart: () => {
        const ackMsg: RadioMessage = {
          id: `atc_emer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: getFormattedUTCTime(),
          sender: 'ATC',
          callsign: airportProfile.directorCallsign,
          text: atcAckText,
          frequency: airportProfile.vhfFrequency,
        };
        set(state => ({ radioMessages: [ackMsg, ...state.radioMessages.slice(0, 49)] }));
      },
      options: {
        airportIcao: airport.icao,
        aircraftId: emerAc.id,
        airline: emerAc.airline,
        telephony: emerAc.telephony,
        aircraftType: emerAc.aircraftType,
        frequency: airportProfile.vhfFrequency,
        priority: 'EMERGENCY',
        atcRole: 'APPROACH',
        isEmergency: true,
        isHeavy: emerAc.category === 'Heavy',
        pilotHasCallsign: true,
        activeCallsigns: [emerAc.callsign, ...aircraft.map(f => f.callsign)],
      },
    });

    set(state => ({
      aircraft: [emerAc, ...state.aircraft],
      selectedAircraftId: emerAc.id,
      emergencyTriggered: true,
      radioMessages: [emergencyMsg, ...state.radioMessages.slice(0, 49)],
    }));
  },

  broadcastWeatherAdvisory: () => {
    const { weather, airportProfile, airport, aircraft } = get();
    const windDirStr = Math.round(weather.windDirection).toString().padStart(3, '0');
    const windSpd = Math.round(weather.windSpeed);
    const gustPart =
      weather.gusts && weather.gusts > windSpd + 2
        ? `, gusting ${Math.round(weather.gusts)} knots`
        : '';
    const visMiles = Math.max(1, Math.min(10, Math.round(weather.visibilityNM)));
    const wxCond =
      weather.precipitation === 'Rain' || weather.precipitation === 'Light Rain'
        ? 'moderate rain'
        : weather.precipitation === 'Fog'
        ? 'fog'
        : 'sky clear';

    const atcWxText = `All stations, weather update, wind ${windDirStr} degrees ${windSpd} knots${gustPart}, visibility ${visMiles} miles, QNH ${weather.qnh}, ${wxCond}.`;
    const wxMsg: RadioMessage = {
      id: `wx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: getFormattedUTCTime(),
      sender: 'ATC',
      callsign: airportProfile.directorCallsign,
      text: atcWxText,
      frequency: airportProfile.vhfFrequency,
    };

    set(state => ({ radioMessages: [wxMsg, ...state.radioMessages.slice(0, 49)] }));
    radioAudio.speakRadioExchange(atcWxText, aircraft[0]?.callsign || 'BAW452', '', undefined, {
      airportIcao: airport.icao,
      aircraftId: aircraft[0]?.id,
      frequency: airportProfile.vhfFrequency,
      priority: 'ADVISORY',
      atcRole: 'APPROACH',
      atcSpokenText: formatPhraseForSpeech(atcWxText),
      activeCallsigns: aircraft.map(f => f.callsign),
    });
  },

  switchAirport: (icao, landingRunwayId, departureRunwayId, weatherOverride) => {
    const resolved = resolveConfiguredAirport(icao, landingRunwayId, departureRunwayId);
    radioAudio.clearQueue();
    radioAudio.setAirportContext(resolved.airport.icao);
    globalConflictTracker.clear();
    resetCommsTimers();
    globalOccupancyManager.configureAirport(
      resolved.runwayGeometries,
      resolved.profile.reciprocalPairs
    );
    globalRadarTracker.reset();

    const freshFleet = createFleetForAirport(
      resolved.airport,
      resolved.runwayGeometries,
      resolved.landingRunwayId,
      resolved.departureRunwayId,
      3,
      1
    );
    radioAudio.pruneActiveAircraft(freshFleet.map(a => a.id));
    globalRadarTracker.seedInitialTracks(freshFleet, 0);

    set({
      airportProfile: resolved.profile,
      airport: resolved.airport,
      activeRunwayGeometries: resolved.runwayGeometries,
      activeLandingRunwayId: resolved.landingRunwayId,
      activeDepartureRunwayId: resolved.departureRunwayId,
      activeScenarioName: `Free Operations · ${resolved.airport.icao}`,
      activeMission: IDLE_MISSION_STATE,
      spawnIntervalSec: 45,
      maxTraffic: 10,
      heavyRatio: 0.35,
      allowEmergencies: false,
      emergencyTriggered: false,
      aircraft: freshFleet,
      selectedAircraftId: freshFleet[0]?.id || null,
      weather: weatherOverride || resolved.profile.defaultWeather,
      isPaused: false,
      hasCompletedStartupSetup: true,
      simSpeed: 1,
      stats: {
        landings: 0,
        departures: 0,
        goArounds: 0,
        separationViolations: 0,
        score: 100,
        elapsedSeconds: 0,
      },
      conflicts: [],
      simulationEvents: [],
      radarTracks: globalRadarTracker.getTracks(),
      antennaAzimuth: 0,
      radarScanCount: 0,
      radioMessages: [
        {
          id: `init_${Date.now()}`,
          timestamp: getFormattedUTCTime(),
          sender: 'PILOT',
          callsign: freshFleet[0]?.callsign || 'TMA',
          text: `${resolved.airport.name} Radar active. RWY ${resolved.landingRunwayId} arrivals / RWY ${resolved.departureRunwayId} departures.`,
          frequency: resolved.profile.vhfFrequency,
        },
      ],
    });
  },

  startMission: missionId => {
    const mission = getMissionById(missionId);
    if (!mission) return;

    const resolved = resolveConfiguredAirport(
      mission.airportIcao,
      mission.landingRunwayId,
      mission.departureRunwayId
    );
    radioAudio.clearQueue();
    radioAudio.setAirportContext(resolved.airport.icao);
    globalConflictTracker.clear();
    resetCommsTimers();
    globalOccupancyManager.configureAirport(
      resolved.runwayGeometries,
      resolved.profile.reciprocalPairs
    );
    globalRadarTracker.reset();

    const freshFleet = createFleetForAirport(
      resolved.airport,
      resolved.runwayGeometries,
      resolved.landingRunwayId,
      resolved.departureRunwayId,
      mission.initialInbounds,
      mission.initialDepartures,
      0.35,
      Boolean(mission.requireEmergencyHandled)
    );
    radioAudio.pruneActiveAircraft(freshFleet.map(a => a.id));
    globalRadarTracker.seedInitialTracks(freshFleet, 0);

    const initialStats: SimulationStats = {
      landings: 0,
      departures: 0,
      goArounds: 0,
      separationViolations: 0,
      score: 100,
      elapsedSeconds: 0,
    };

    const initialMessages: RadioMessage[] = [
      {
        id: `msn_${Date.now()}`,
        timestamp: getFormattedUTCTime(),
        sender: 'ATC',
        callsign: resolved.profile.directorCallsign,
        text: `MISSION ${mission.number}: ${mission.title} (${mission.airportIcao} · RWY ${mission.landingRunwayId}/${mission.departureRunwayId})`,
        frequency: resolved.profile.vhfFrequency,
      },
    ];

    if (mission.requireEmergencyHandled && freshFleet[0]) {
      initialMessages.unshift({
        id: `msn_emer_${Date.now()}`,
        timestamp: getFormattedUTCTime(),
        sender: 'PILOT',
        callsign: freshFleet[0].callsign,
        text: `MAYDAY MAYDAY! ${freshFleet[0].callsign} squawking 7700, engine failure! Request priority landing RWY ${resolved.landingRunwayId}.`,
        frequency: resolved.profile.vhfFrequency,
      });
    }

    set({
      airportProfile: resolved.profile,
      airport: resolved.airport,
      activeRunwayGeometries: resolved.runwayGeometries,
      activeLandingRunwayId: resolved.landingRunwayId,
      activeDepartureRunwayId: resolved.departureRunwayId,
      activeScenarioName: `Mission ${mission.number} · ${mission.airportIcao}`,
      activeMission: {
        mission,
        status: 'active',
        objectives: buildMissionObjectives(mission, initialStats, false, false),
        emergencyHandled: false,
        goAroundObserved: false,
      },
      spawnIntervalSec: mission.spawnIntervalSec,
      maxTraffic: mission.maxTraffic,
      heavyRatio: 0.35,
      allowEmergencies: Boolean(mission.requireEmergencyHandled),
      emergencyDelaySec: 30,
      emergencyTriggered: Boolean(mission.requireEmergencyHandled),
      aircraft: freshFleet,
      selectedAircraftId: freshFleet[0]?.id || null,
      weather: mission.weather,
      isPaused: false,
      hasCompletedStartupSetup: true,
      simSpeed: 1,
      stats: initialStats,
      conflicts: [],
      simulationEvents: [],
      radarTracks: globalRadarTracker.getTracks(),
      antennaAzimuth: 0,
      radarScanCount: 0,
      radioMessages: initialMessages,
    });
  },

  exitMission: () => {
    set({ activeMission: IDLE_MISSION_STATE });
  },

  startCustomScenario: config => {
    const resolved = resolveConfiguredAirport(
      config.airportIcao,
      config.landingRunwayId,
      config.departureRunwayId
    );
    radioAudio.clearQueue();
    radioAudio.setAirportContext(resolved.airport.icao);
    globalConflictTracker.clear();
    resetCommsTimers();
    globalOccupancyManager.configureAirport(
      resolved.runwayGeometries,
      resolved.profile.reciprocalPairs
    );
    globalRadarTracker.reset();

    const freshFleet = createFleetForAirport(
      resolved.airport,
      resolved.runwayGeometries,
      resolved.landingRunwayId,
      resolved.departureRunwayId,
      config.initialInbounds,
      config.initialDepartures,
      config.heavyRatio
    );
    radioAudio.pruneActiveAircraft(freshFleet.map(a => a.id));
    globalRadarTracker.seedInitialTracks(freshFleet, 0);

    const customWeather: WeatherCondition = {
      windDirection: config.windDirection,
      windSpeed: config.windSpeed,
      gusts: config.gusts,
      qnh: config.qnh,
      visibilityNM: config.visibilityNM,
      ceilingFeet: config.ceilingFeet,
      precipitation: config.precipitation,
    };

    set({
      airportProfile: resolved.profile,
      airport: resolved.airport,
      activeRunwayGeometries: resolved.runwayGeometries,
      activeLandingRunwayId: resolved.landingRunwayId,
      activeDepartureRunwayId: resolved.departureRunwayId,
      activeScenarioName: config.name,
      activeMission: IDLE_MISSION_STATE,
      spawnIntervalSec: config.spawnIntervalSec,
      maxTraffic: Math.max(6, config.initialInbounds + config.initialDepartures + 4),
      heavyRatio: config.heavyRatio,
      allowEmergencies: config.allowEmergencies,
      emergencyDelaySec: config.emergencyDelaySec,
      emergencyTriggered: false,
      aircraft: freshFleet,
      selectedAircraftId: freshFleet[0]?.id || null,
      weather: customWeather,
      isPaused: false,
      hasCompletedStartupSetup: true,
      simSpeed: 1,
      stats: {
        landings: 0,
        departures: 0,
        goArounds: 0,
        separationViolations: 0,
        score: 100,
        elapsedSeconds: 0,
      },
      conflicts: [],
      simulationEvents: [],
      radarTracks: globalRadarTracker.getTracks(),
      antennaAzimuth: 0,
      radarScanCount: 0,
      radioMessages: [
        {
          id: `cust_${Date.now()}`,
          timestamp: getFormattedUTCTime(),
          sender: 'ATC',
          callsign: resolved.profile.directorCallsign,
          text: `Scenario "${config.name}" active at ${resolved.airport.icao} (Wind ${customWeather.windDirection}°/${customWeather.windSpeed}kt).`,
          frequency: resolved.profile.vhfFrequency,
        },
      ],
    });
  },

  resetSimulation: () => {
    const {
      airport,
      activeRunwayGeometries,
      activeLandingRunwayId,
      activeDepartureRunwayId,
      activeMission,
      heavyRatio,
    } = get();

    if (activeMission.mission) {
      get().startMission(activeMission.mission.id);
      return;
    }

    radioAudio.clearQueue();
    radioAudio.setAirportContext(airport.icao);
    globalConflictTracker.clear();
    resetCommsTimers();
    globalOccupancyManager.clearAll();
    const freshFleet = createFleetForAirport(
      airport,
      activeRunwayGeometries,
      activeLandingRunwayId,
      activeDepartureRunwayId,
      3,
      1,
      heavyRatio
    );
    radioAudio.pruneActiveAircraft(freshFleet.map(a => a.id));
    globalRadarTracker.reset();
    globalRadarTracker.seedInitialTracks(freshFleet, 0);

    set({
      aircraft: freshFleet,
      selectedAircraftId: freshFleet[0]?.id || null,
      isPaused: false,
      simSpeed: 1,
      emergencyTriggered: false,
      stats: {
        landings: 0,
        departures: 0,
        goArounds: 0,
        separationViolations: 0,
        score: 100,
        elapsedSeconds: 0,
      },
      conflicts: [],
      simulationEvents: [],
      radarTracks: globalRadarTracker.getTracks(),
      antennaAzimuth: 0,
      radarScanCount: 0,
    });
  },

  /**
   * Main Simulation Step (called 20 times per second with fixed dt)
   */
  tickSimulation: (dt: number) => {
    const state = get();
    if (state.isPaused) return;

    const actualDt = dt * state.simSpeed;
    const {
      aircraft,
      airport,
      weather,
      stats,
      activeRunwayGeometries,
      activeMission,
      allowEmergencies,
      emergencyDelaySec,
      emergencyTriggered,
    } = state;
    const currentSimTime = stats.elapsedSeconds + actualDt;

    // Trigger timed emergency injection if enabled in custom scenario
    if (allowEmergencies && !emergencyTriggered && currentSimTime >= emergencyDelaySec) {
      get().triggerEmergency('ENGINE_FAILURE');
    }

    let scoreDelta = 0;
    let newLandings = stats.landings;
    let emergencyLandedThisTick = false;
    let goAroundThisTick = false;

    const updatedAircraft: Aircraft[] = [];

    for (const ac of aircraft) {
      const assignedRwyGeom =
        activeRunwayGeometries.find(r => r.id === ac.assignedRunway) ||
        activeRunwayGeometries[0];
      let currentAc = ac;

      const isTakeoffSequenceFlight =
        currentAc.status === 'Departing' &&
        (currentAc.flightPhase === 'HOLD_SHORT' ||
          currentAc.flightPhase === 'LINEUP' ||
          currentAc.flightPhase === 'TAKEOFF_ROLL' ||
          currentAc.flightPhase === 'ROTATION' ||
          currentAc.flightPhase === 'LIFTOFF' ||
          currentAc.flightPhase === 'INITIAL_CLIMB' ||
          currentAc.flightPhase === 'REJECTED_TAKEOFF' ||
          currentAc.flightPhase === 'RTO_STOPPED' ||
          !currentAc.flightPhase ||
          currentAc.altitude - assignedRwyGeom.elevationFeet <= 1500);

      if (isTakeoffSequenceFlight) {
        const toResult = stepTakeoffSequence(
          currentAc,
          assignedRwyGeom,
          actualDt,
          globalOccupancyManager,
          currentSimTime
        );
        currentAc = toResult.aircraft;
        if (toResult.phaseChanged && toResult.eventType === 'LIFTOFF') {
          logPilotTransmission(
            get,
            set,
            currentAc,
            `${airport.name} Departure, ${currentAc.callsign}, airborne runway ${assignedRwyGeom.id}, climbing on runway heading.`,
            true,
            { priority: 'PILOT_READBACK', atcRole: 'TOWER' }
          );
        }
      } else {
        const prevPhase = currentAc.flightPhase;
        currentAc = stepAircraftPhysics(
          currentAc,
          actualDt,
          weather,
          airport.waypoints,
          currentSimTime,
          airport.elevationFeet
        );

        if (prevPhase !== 'HANDOFF_READY' && currentAc.flightPhase === 'HANDOFF_READY') {
          const exitName = currentAc.assignedExitWaypoint || 'exit gate';
          logPilotTransmission(
            get,
            set,
            currentAc,
            `${airport.name} Director, ${currentAc.callsign}, passing ${formatReadableAlt(Math.round(currentAc.altitude))} at ${exitName}, request Center handoff.`,
            true,
            { priority: 'PILOT_CALLIN', atcRole: 'APPROACH' }
          );
        }

        if (
          currentAc.ilsArmed ||
          currentAc.ilsLocalizerCaptured ||
          currentAc.status === 'Landed'
        ) {
          const ilsResult = updateILSApproach(
            currentAc,
            assignedRwyGeom,
            actualDt,
            globalOccupancyManager,
            currentSimTime
          );
          currentAc = ilsResult.aircraft;

          if (ilsResult.landed && ac.status !== 'Landed') {
            newLandings += 1;
            scoreDelta += ac.isEmergency ? 35 : 15;
            if (ac.isEmergency) {
              emergencyLandedThisTick = true;
            }
            const touchMsg = `${ac.callsign}, touchdown runway ${assignedRwyGeom.id}, rolling out.`;
            logPilotTransmission(get, set, currentAc, touchMsg, true, {
              priority: ac.isEmergency ? 'EMERGENCY' : 'PILOT_READBACK',
              atcRole: 'TOWER',
            });
          } else if (ilsResult.eventType === 'LOC_CAPTURED') {
            const locMsg = `${airport.name} Director, ${ac.callsign}, established localizer runway ${assignedRwyGeom.id}.`;
            logPilotTransmission(get, set, currentAc, locMsg, true, {
              priority: ac.isEmergency ? 'EMERGENCY' : 'PILOT_READBACK',
              atcRole: 'APPROACH',
            });
          } else if (ilsResult.eventType === 'GS_CAPTURED') {
            const gsMsg = `${ac.callsign}, fully established ILS runway ${assignedRwyGeom.id}, gear down, landing checks complete.`;
            logPilotTransmission(get, set, currentAc, gsMsg, true, {
              priority: ac.isEmergency ? 'EMERGENCY' : 'PILOT_READBACK',
              atcRole: 'TOWER',
            });
          } else if (ilsResult.eventType === 'RUNWAY_VACATED') {
            const vacMsg = `${ac.callsign}, runway ${assignedRwyGeom.id} vacated, contacting ground 121.9.`;
            logPilotTransmission(get, set, currentAc, vacMsg, true, {
              priority: 'PILOT_READBACK',
              atcRole: 'GROUND',
              frequency: '121.9 MHz',
            });
          } else if (
            ilsResult.eventType === 'UNSTABLE_GO_AROUND' ||
            ilsResult.eventType === 'LANDING_REJECTED'
          ) {
            goAroundThisTick = true;
            const gaMsg = `${ac.callsign}, going around runway ${assignedRwyGeom.id}, ${ilsResult.eventMessage || 'missed approach'}.`;
            logPilotTransmission(get, set, currentAc, gaMsg, true, {
              priority: ac.isEmergency ? 'EMERGENCY' : 'CRITICAL_ATC',
              atcRole: 'TOWER',
            });
          }
        }
      }

      const distFromCenter = Math.sqrt(
        currentAc.x * currentAc.x + currentAc.y * currentAc.y
      );
      const isLandedStopped =
        currentAc.status === 'Landed' && currentAc.indicatedAirspeed <= 0.1;
      const isFarOut = distFromCenter > 70.0;

      if (!isLandedStopped && !isFarOut) {
        updatedAircraft.push(currentAc);
      } else {
        radioAudio.cancelCallsignTransmissions(currentAc.id);
      }
    }

    if (updatedAircraft.length !== aircraft.length) {
      radioAudio.pruneActiveAircraft(updatedAircraft.map(a => a.id));
    }

    globalRadarTracker.update(actualDt, currentSimTime, updatedAircraft);

    const activeConflicts = detectConflicts(updatedAircraft);
    const { penaltiesToDeduct } = globalConflictTracker.updateEvents(
      activeConflicts,
      currentSimTime
    );

    let newViolations = stats.separationViolations;
    for (const p of penaltiesToDeduct) {
      scoreDelta -= p.penaltyPoints;
      if (p.severity === 'Critical') {
        newViolations += 1;
        radioAudio.playConflictAlert();
      }
    }

    // Live Traffic Advisories on active conflicts (with 40s per-pair cooldown)
    for (const conflict of activeConflicts) {
      const pairKey = [conflict.aircraft1Id, conflict.aircraft2Id].sort().join(':');
      const lastAlert = trafficAlertCooldowns.get(pairKey) ?? -999;
      if (currentSimTime - lastAlert >= 40) {
        const acA = updatedAircraft.find(a => a.id === conflict.aircraft1Id);
        const acB = updatedAircraft.find(a => a.id === conflict.aircraft2Id);
        if (acA && acB && acA.altitude > airport.elevationFeet + 500) {
          trafficAlertCooldowns.set(pairKey, currentSimTime);
          const hdgDiff = Math.abs(getHeadingDelta(acA.heading, acB.heading));
          const geomPhrase = hdgDiff > 135 ? 'opposite direction' : 'converging';
          const roundedAlt = Math.max(2000, Math.round(acA.altitude / 500) * 500);
          const altStr = formatReadableAlt(roundedAlt);
          const atcTraffic = `${acA.callsign}, traffic alert, ${geomPhrase}, maintain ${altStr}`;
          const pilotAck = pickVariant(['Traffic in sight', 'Looking out for traffic']);
          logCommsExchange(
            get,
            set,
            acA,
            atcTraffic,
            `${pilotAck}, ${pilotTag(acA)}`,
            pilotAck,
            { atcRole: 'APPROACH', priority: 'CONFLICT_ALERT' }
          );
          break;
        }
      }
    }

    // Periodic Sector Weather Broadcast (~12s on hazardous weather, or every 150s)
    const hasAdverseWeather =
      weather.precipitation !== 'None' || weather.visibilityNM <= 6 || weather.windSpeed >= 18;
    const wxThreshold = lastWeatherBroadcastSimTime === 0 && hasAdverseWeather ? 12 : 150;
    if (
      updatedAircraft.length > 0 &&
      currentSimTime - lastWeatherBroadcastSimTime >= wxThreshold
    ) {
      lastWeatherBroadcastSimTime = currentSimTime;
      get().broadcastWeatherAdvisory();
    }

    // Proactive Pilot Requests (Direct route & altitude change requests every ~40s)
    if (
      currentSimTime >= 20 &&
      currentSimTime - lastPilotRequestSimTime >= 40 &&
      activeConflicts.length === 0
    ) {
      const candidates = updatedAircraft.filter(ac => {
        if (ac.isEmergency || ac.ilsArmed || ac.ilsLocalizerCaptured || ac.holdingWaypoint) {
          return false;
        }
        const dist = Math.sqrt(ac.x * ac.x + ac.y * ac.y);
        if (dist < 10 || dist > 45) return false;
        const lastReq = pilotRequestCooldowns.get(ac.id) ?? -999;
        return currentSimTime - lastReq >= 120;
      });

      if (candidates.length > 0) {
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        const chosenPerf = getAircraftPerformance(chosen.aircraftType);
        let reqText: string | null = null;
        if (chosen.status === 'Inbound' && chosen.routeQueue && chosen.routeQueue.length > 0) {
          reqText = `${airport.name} Director, ${chosen.callsign}, request direct ${chosen.routeQueue[0]}.`;
        } else if (chosen.status === 'Inbound' && chosen.altitude >= 7000 && chosen.targetAltitude >= 6000) {
          const reqFeet = Math.max(3000, Math.round((chosen.altitude - 3000) / 1000) * 1000);
          reqText = `${airport.name} Director, ${chosen.callsign}, request lower ${formatReadableAlt(reqFeet)}.`;
        } else if (
          chosen.status === 'Departing' &&
          chosen.altitude >= 2500 &&
          chosen.targetAltitude <= 10000 &&
          chosenPerf.aircraftClass !== 'LIGHT_GA'
        ) {
          const reqClimb = Math.min(12000, chosenPerf.tmaOperatingCeilingFt);
          reqText = `${airport.name} Director, ${chosen.callsign}, request climb ${formatReadableAlt(reqClimb)}.`;
        }

        if (reqText) {
          lastPilotRequestSimTime = currentSimTime;
          pilotRequestCooldowns.set(chosen.id, currentSimTime);
          logPilotTransmission(get, set, chosen, reqText, true, {
            priority: 'PILOT_CALLIN',
            atcRole: 'APPROACH',
          });
        }
      }
    }

    const nextStats: SimulationStats = {
      ...stats,
      landings: newLandings,
      separationViolations: newViolations,
      score: Math.min(100, Math.max(0, stats.score + scoreDelta)),
      elapsedSeconds: currentSimTime,
    };

    const nextMission =
      activeMission.status === 'active'
        ? evaluateMissionProgress(
            activeMission,
            nextStats,
            emergencyLandedThisTick,
            goAroundThisTick
          )
        : activeMission;

    set({
      aircraft: updatedAircraft,
      conflicts: activeConflicts,
      radarTracks: globalRadarTracker.getTracks(),
      antennaAzimuth: globalRadarTracker.getAntennaAzimuth(),
      stats: nextStats,
      activeMission: nextMission,
    });
  },
}));

radioAudio.onTransmissionChange(tx => {
  useSimulationStore.setState({ activeTransmission: tx });
});

export function getAirportProfilePublic(icao: string) {
  return getAirportProfile(icao);
}
