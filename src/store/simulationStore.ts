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
  AirportProfile,
  ConflictPair,
  CustomScenarioConfig,
  MissionId,
  RadioMessage,
  SimulationStats,
  WeatherCondition,
} from '../types';
import {
  getAirportProfile,
  resolveConfiguredAirport,
} from '../airports/airportsRegistry';
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
import { radioAudio, TowerVoiceId } from '../audio/radioAudio';
import { RunwayOccupancyManager } from '../engine/runwayOccupancy';
import {
  stepTakeoffSequence,
  issueTakeoffClearance,
  lineUpAircraft,
  rejectTakeoff,
} from '../engine/takeoff';
import { SimulationEvent } from '../types/events';
import { RadarTrackingEngine, RadarTrack } from '../engine/radarTracker';
import { RunwayGeometry } from '../engine/runwayGeometry';
import {
  buildMissionObjectives,
  evaluateMissionProgress,
  getMissionById,
} from '../engine/missions';

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

export interface RadarLayers {
  rangeRings: boolean;
  waypointLabels: boolean;
  extendedCenterlines: boolean;
  trails: boolean;
  speedVectors: boolean;
  radarSweep: boolean;
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
  repositionTag: (id: string, offsetX: number, offsetY: number) => void;

  // Simulation, Airport, Mission & Scenario Management
  tickSimulation: (dt: number) => void;
  togglePause: () => void;
  setSimSpeed: (speed: number) => void;
  setAudioMuted: (muted: boolean) => void;
  setAudioVolume: (vol: number) => void;
  setTowerVoice: (voiceId: TowerVoiceId) => void;
  toggleLayer: (layer: keyof RadarLayers) => void;
  spawnInbound: () => void;
  spawnDeparture: () => void;
  triggerEmergency: (type?: 'ENGINE_FAILURE' | 'MEDICAL' | 'FUEL_CRITICAL') => void;
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

function logCommsExchange(
  get: () => SimulationStore,
  set: (fn: (state: SimulationStore) => Partial<SimulationStore>) => void,
  ac: Aircraft,
  atcText: string,
  pilotText: string,
  spokenPilotText: string
) {
  const { airportProfile, airport, aircraft } = get();
  const atcMsg: RadioMessage = {
    id: `atc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: getFormattedUTCTime(),
    sender: 'ATC',
    callsign: airportProfile.directorCallsign,
    text: atcText,
    frequency: airportProfile.vhfFrequency,
  };

  set(state => ({ radioMessages: [atcMsg, ...state.radioMessages.slice(0, 49)] }));

  radioAudio.speakRadioExchange(
    atcText,
    ac.callsign,
    spokenPilotText,
    () => {
      const pilotMsg: RadioMessage = {
        id: `pilot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: getFormattedUTCTime(),
        sender: 'PILOT',
        callsign: ac.callsign,
        text: pilotText,
        frequency: airportProfile.vhfFrequency,
      };
      set(state => ({ radioMessages: [pilotMsg, ...state.radioMessages.slice(0, 49)] }));
    },
    {
      airportIcao: airport.icao,
      airline: ac.airline,
      aircraftType: ac.aircraftType,
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
  speakAudio: boolean = true
) {
  const { airportProfile, airport, aircraft } = get();
  const pilotMsg: RadioMessage = {
    id: `pilot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: getFormattedUTCTime(),
    sender: 'PILOT',
    callsign: ac.callsign,
    text: pilotText,
    frequency: airportProfile.vhfFrequency,
  };
  set(state => ({ radioMessages: [pilotMsg, ...state.radioMessages.slice(0, 49)] }));

  if (speakAudio) {
    radioAudio.speakPilotReadback(ac.callsign, pilotText, {
      airportIcao: airport.icao,
      airline: ac.airline,
      aircraftType: ac.aircraftType,
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
  isPaused: false,
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
    rangeRings: true,
    waypointLabels: true,
    extendedCenterlines: true,
    trails: true,
    speedVectors: true,
    radarSweep: true,
  },
  simulationEvents: [],
  activeTransmission: null,
  radarTracks: globalRadarTracker.getTracks(),
  antennaAzimuth: 0,
  radarScanCount: 0,
  getRadarTrack: (aircraftId: string) => globalRadarTracker.getTrack(aircraftId),
  measureStart: null,
  measureCurrent: null,

  selectAircraft: id => {
    set({ selectedAircraftId: id });
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
    const pilotPhrase = pickVariant([
      `Fly heading ${headingStr}`,
      `Roger, turning heading ${headingStr}`,
      `Heading ${headingStr}`,
    ]);
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, fly heading ${headingStr}`,
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
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
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
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
    const pilotPhrase = pickVariant([
      `Left heading ${headingStr}`,
      `Turning left heading ${headingStr}`,
      `Wilco, left ${headingStr}`,
    ]);
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, turn left heading ${headingStr}`,
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
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
    const pilotPhrase = pickVariant([
      `Right heading ${headingStr}`,
      `Turning right heading ${headingStr}`,
      `Wilco, right ${headingStr}`,
    ]);
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, turn right heading ${headingStr}`,
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      pilotPhrase
    );
  },

  setAltitude: (id, altitude, expedite = false) => {
    const { aircraft, airport, weather } = get();
    const ac = aircraft.find(a => a.id === id);
    if (!ac) return;
    const target = Math.max(airport.elevationFeet, Math.min(20000, Math.round(altitude)));

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
    }));

    const isClimb = target > ac.altitude;
    const actionWord = isClimb ? 'Climb and maintain' : 'Descend and maintain';
    const pilotAction = isClimb ? 'Climbing' : 'Descending to';
    const altText = formatReadableAlt(target);
    const qnhTag = !isClimb && target < 8000 ? `, QNH ${weather.qnh}` : '';
    const expeditePhrase = expedite ? ', expedite' : '';
    const pilotPhrase = `${pilotAction} ${altText}${expedite ? ', expediting' : ''}${qnhTag}`;

    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, ${actionWord.toLowerCase()} ${altText}${qnhTag}${expeditePhrase}`,
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      pilotPhrase
    );
  },

  setSpeed: (id, speed) => {
    const ac = get().aircraft.find(a => a.id === id);
    if (!ac) return;
    const target = Math.max(140, Math.min(260, Math.round(speed)));

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id ? { ...a, targetAirspeed: target } : a
      ),
    }));

    const verb =
      target < ac.indicatedAirspeed - 5
        ? 'Reduce speed to'
        : target > ac.indicatedAirspeed + 5
        ? 'Increase speed to'
        : 'Maintain speed';
    const pilotPhrase =
      target < ac.indicatedAirspeed - 5
        ? `Reducing speed ${target} knots`
        : target > ac.indicatedAirspeed + 5
        ? `Increasing to ${target} knots`
        : `Maintaining ${target} knots`;

    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, ${verb.toLowerCase()} ${target} knots`,
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
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
              status: a.status === 'Departing' ? 'Departing' : 'Inbound',
              ilsArmed: false,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
            }
          : a
      ),
    }));

    const pilotPhrase = pickVariant([
      `Proceeding direct ${waypointName}`,
      `Direct ${waypointName}, roger`,
    ]);
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, cleared direct ${waypointName}`,
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
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
              status: a.status === 'Departing' ? 'Departing' : 'Inbound',
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
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
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
              status: a.status === 'Departing' ? 'Departing' : 'Inbound',
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
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
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
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
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

    const finalAlt = Math.ceil(airport.elevationFeet / 1000) * 1000 + 3000;
    const nextAlt = Math.min(ac.targetAltitude, finalAlt);
    const nextSpd = Math.min(ac.targetAirspeed, 190);

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
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
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
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      pilotPhrase
    );
  },

  goAround: id => {
    const { aircraft, airport, activeMission, stats } = get();
    const ac = aircraft.find(a => a.id === id);
    if (!ac) return;

    const missedAlt = Math.ceil(airport.elevationFeet / 1000) * 1000 + 3000;
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
              targetAirspeed: 210,
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
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      pilotPhrase
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
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
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
        `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
        pilotPhrase
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
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      pilotPhrase
    );
  },

  clearTakeoff: id => {
    const { aircraft, activeRunwayGeometries, stats, weather, activeMission } = get();
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
        `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
        pilotPhrase
      );
      return;
    }

    const nextStats: SimulationStats = {
      ...stats,
      departures: stats.departures + 1,
      score: Math.min(100, stats.score + 5),
    };
    const nextMissionState =
      activeMission.status === 'active'
        ? evaluateMissionProgress(activeMission, nextStats, false, false)
        : activeMission;

    set(state => ({
      aircraft: state.aircraft.map(a => (a.id === id ? res.aircraft : a)),
      stats: nextStats,
      activeMission: nextMissionState,
    }));

    const windDirStr = Math.round(weather.windDirection).toString().padStart(3, '0');
    const windText = `surface wind ${windDirStr} degrees ${Math.round(weather.windSpeed)} knots`;
    const pilotPhrase = `Cleared for takeoff runway ${ac.assignedRunway}`;
    logCommsExchange(
      get,
      set,
      ac,
      `${ac.callsign}, ${windText}, QNH ${weather.qnh}, runway ${ac.assignedRunway} cleared for takeoff`,
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      pilotPhrase
    );
  },

  abortTakeoff: id => {
    const { aircraft, airport } = get();
    const ac = aircraft.find(a => a.id === id);
    if (!ac) return;
    const res = rejectTakeoff(ac, 'Aborted on ATC instruction', airport.elevationFeet);
    if (!res.success) {
      const pilotPhrase = `Unable to stop, past V1, continuing takeoff`;
      logCommsExchange(
        get,
        set,
        ac,
        `${ac.callsign}, cancel takeoff, I say again cancel takeoff!`,
        `Unable abort - past V1 (${Math.round(ac.indicatedAirspeed)}kt), committing to takeoff!`,
        pilotPhrase
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
      `${pilotPhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      pilotPhrase
    );
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

  toggleLayer: layer => {
    set(state => ({
      radarLayers: {
        ...state.radarLayers,
        [layer]: !state.radarLayers[layer],
      },
    }));
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

    const altStr = formatReadableAlt(newAc.altitude);
    const hdgStr = Math.round(newAc.heading).toString().padStart(3, '0');
    const infoLetter = pickVariant(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo']);
    const checkInMsg = newAc.assignedWaypoint
      ? `${airport.name} Director, ${newAc.callsign}${newAc.category === 'Heavy' ? ' Heavy' : ''}, passing ${altStr} direct ${newAc.assignedWaypoint}, information ${infoLetter}.`
      : `${airport.name} Director, ${newAc.callsign}${newAc.category === 'Heavy' ? ' Heavy' : ''}, passing ${altStr} heading ${hdgStr}, with information ${infoLetter}.`;

    logPilotTransmission(get, set, newAc, checkInMsg, true);
    void airportProfile;
  },

  spawnDeparture: () => {
    const { airport, activeDepartureRunwayId, heavyRatio, aircraft } = get();
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

    const depCheckIn = `${airport.name} Tower, ${newAc.callsign}${newAc.category === 'Heavy' ? ' Heavy' : ''}, holding short runway ${depRwy.id}, ready for departure.`;
    logPilotTransmission(get, set, newAc, depCheckIn, true);
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

    const emerText = `Mayday Mayday Mayday! ${airport.name} Director, ${emerAc.callsign}${emerAc.category === 'Heavy' ? ' Heavy' : ''}, squawking 7700, ${emergencyDesc}, requesting immediate priority vectors runway ${arrRwy.id}!`;
    const emergencyMsg: RadioMessage = {
      id: `emer_${Date.now()}`,
      timestamp: getFormattedUTCTime(),
      sender: 'PILOT',
      callsign: emerAc.callsign,
      text: emerText,
      frequency: airportProfile.vhfFrequency,
    };

    radioAudio.playConflictAlert();
    radioAudio.speakPilotReadback(emerAc.callsign, emerText, {
      airportIcao: airport.icao,
      airline: emerAc.airline,
      aircraftType: emerAc.aircraftType,
      isEmergency: true,
      isHeavy: emerAc.category === 'Heavy',
      pilotHasCallsign: true,
      activeCallsigns: [emerAc.callsign, ...aircraft.map(f => f.callsign)],
    });

    set(state => ({
      aircraft: [emerAc, ...state.aircraft],
      selectedAircraftId: emerAc.id,
      emergencyTriggered: true,
      radioMessages: [emergencyMsg, ...state.radioMessages.slice(0, 49)],
    }));
  },

  switchAirport: (icao, landingRunwayId, departureRunwayId, weatherOverride) => {
    const resolved = resolveConfiguredAirport(icao, landingRunwayId, departureRunwayId);
    radioAudio.clearQueue();
    radioAudio.setAirportContext(resolved.airport.icao);
    globalConflictTracker.clear();
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

      const isGroundDeparture =
        currentAc.status === 'Departing' &&
        currentAc.altitude - assignedRwyGeom.elevationFeet <= 1500;

      if (isGroundDeparture && currentAc.indicatedAirspeed > 0) {
        const toResult = stepTakeoffSequence(
          currentAc,
          assignedRwyGeom,
          actualDt,
          globalOccupancyManager,
          currentSimTime
        );
        currentAc = toResult.aircraft;
      } else {
        currentAc = stepAircraftPhysics(
          currentAc,
          actualDt,
          weather,
          airport.waypoints,
          currentSimTime,
          airport.elevationFeet
        );

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
            logPilotTransmission(get, set, currentAc, touchMsg, true);
          } else if (ilsResult.eventType === 'LOC_CAPTURED') {
            const locMsg = `${airport.name} Director, ${ac.callsign}, established localizer runway ${assignedRwyGeom.id}.`;
            logPilotTransmission(get, set, currentAc, locMsg, true);
          } else if (ilsResult.eventType === 'GS_CAPTURED') {
            const gsMsg = `${ac.callsign}, fully established ILS runway ${assignedRwyGeom.id}, gear down, landing checks complete.`;
            logPilotTransmission(get, set, currentAc, gsMsg, true);
          } else if (ilsResult.eventType === 'RUNWAY_VACATED') {
            const vacMsg = `${ac.callsign}, runway ${assignedRwyGeom.id} vacated, contacting ground 121.9.`;
            logPilotTransmission(get, set, currentAc, vacMsg, true);
          } else if (
            ilsResult.eventType === 'UNSTABLE_GO_AROUND' ||
            ilsResult.eventType === 'LANDING_REJECTED'
          ) {
            goAroundThisTick = true;
            const gaMsg = `${ac.callsign}, going around runway ${assignedRwyGeom.id}, ${ilsResult.eventMessage || 'missed approach'}.`;
            logPilotTransmission(get, set, currentAc, gaMsg, true);
          }
        }
      }

      const distFromCenter = Math.sqrt(
        currentAc.x * currentAc.x + currentAc.y * currentAc.y
      );
      const isLandedStopped =
        currentAc.status === 'Landed' && currentAc.indicatedAirspeed <= 0.1;
      const isFarOut = distFromCenter > 55.0;

      if (!isLandedStopped && !isFarOut) {
        updatedAircraft.push(currentAc);
      }
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
