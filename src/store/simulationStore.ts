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
import { stepAircraftPhysics, normalizeHeading } from '../engine/physics';
import { updateILSApproach } from '../engine/ils';
import { detectConflicts, ConflictEventTracker } from '../engine/conflict';
import {
  generateInboundFlight,
  generateDepartureFlight,
} from '../engine/trafficGenerator';
import { radioAudio } from '../audio/radioAudio';
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
  radarLayers: RadarLayers;
  simulationEvents: SimulationEvent[];
  activeTransmission: { callsign: string; speaker: 'ATC' | 'PILOT' } | null;

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
  turnLeft: (id: string, degrees: number) => void;
  turnRight: (id: string, degrees: number) => void;
  setAltitude: (id: string, altitude: number, expedite?: boolean) => void;
  setSpeed: (id: string, speed: number) => void;
  directTo: (id: string, waypointName: string) => void;
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
 * Generates an initial balanced fleet tailored to ANY airport & runway heading
 */
function createFleetForAirport(
  airport: Airport,
  runwayGeometries: RunwayGeometry[],
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
  const arrGeom = runwayGeometries.find(r => r.id === arrRwy.id) || runwayGeometries[0];
  const fleet: Aircraft[] = [];

  // Create one traffic established 14 NM back along approach corridor for immediate situational clarity
  if (inboundCount >= 1) {
    const approachRad = (arrGeom.magneticHeading * Math.PI) / 180;
    const fNear = generateInboundFlight(1, {
      airport,
      arrivalRunway: arrRwy,
      heavyRatio,
      isEmergency: includeInitialEmergency,
      emergencyType: includeInitialEmergency ? 'ENGINE_FAILURE' : undefined,
    });
    const distOut = 14.5;
    const posX = arrRwy.threshold.x - distOut * Math.sin(approachRad);
    const posY = arrRwy.threshold.y - distOut * Math.cos(approachRad);
    const nearAlt = Math.ceil(airport.elevationFeet / 1000) * 1000 + 3500;

    fNear.x = posX;
    fNear.y = posY;
    fNear.heading = arrGeom.magneticHeading;
    fNear.targetHeading = arrGeom.magneticHeading;
    fNear.altitude = nearAlt;
    fNear.targetAltitude = Math.ceil(airport.elevationFeet / 1000) * 1000 + 3000;
    fNear.indicatedAirspeed = 185;
    fNear.targetAirspeed = 170;
    fNear.assignedWaypoint = null;
    fNear.ilsArmed = !includeInitialEmergency;
    fNear.history = [6, 5, 4, 3, 2, 1, 0].map(s => ({
      x: posX - s * 2.0 * Math.sin(approachRad),
      y: posY - s * 2.0 * Math.cos(approachRad),
      altitude: Math.min(18000, nearAlt + s * 450),
      timestamp: -s * 15,
    }));
    fleet.push(fNear);
  }

  for (let i = 1; i < inboundCount; i++) {
    const f = generateInboundFlight(i + 1, {
      airport,
      arrivalRunway: arrRwy,
      heavyRatio,
    });
    fleet.push(f);
  }

  for (let d = 0; d < departureCount; d++) {
    const dep = generateDepartureFlight({
      airport,
      departureRunway: depRwy,
      heavyRatio,
    });
    fleet.push(dep);
  }

  return fleet;
}

function getFormattedUTCTime(): string {
  const d = new Date();
  return d.toTimeString().split(' ')[0];
}

function logCommsExchange(
  get: () => SimulationStore,
  set: (fn: (state: SimulationStore) => Partial<SimulationStore>) => void,
  callsign: string,
  atcText: string,
  pilotText: string,
  spokenText: string
) {
  const { airportProfile } = get();
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
    callsign,
    spokenText,
    () => {
      const pilotMsg: RadioMessage = {
        id: `pilot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: getFormattedUTCTime(),
        sender: 'PILOT',
        callsign,
        text: pilotText,
        frequency: airportProfile.vhfFrequency,
      };
      set(state => ({ radioMessages: [pilotMsg, ...state.radioMessages.slice(0, 49)] }));
    }
  );
}

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
      text: `${initialResolved.airport.name} Director, ${initialFleet[0]?.telephony || 'Speedbird'} descending into TMA, radar contact.`,
      frequency: initialResolved.profile.vhfFrequency,
    },
  ],
  audioMuted: false,
  audioVolume: 0.8,
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
              ilsArmed: false,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
              status: a.status === 'Established' ? 'Inbound' : a.status,
            }
          : a
      ),
    }));

    const headingStr = target.toString().padStart(3, '0');
    logCommsExchange(
      get,
      set,
      ac.callsign,
      `${ac.callsign}, turn heading ${headingStr}`,
      `Turning heading ${headingStr}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Turning heading ${headingStr}`
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
              ilsArmed: false,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
              status: a.status === 'Established' ? 'Inbound' : a.status,
            }
          : a
      ),
    }));
    const headingStr = newTarget.toString().padStart(3, '0');
    logCommsExchange(
      get,
      set,
      ac.callsign,
      `${ac.callsign}, turn left heading ${headingStr}`,
      `Turn left heading ${headingStr}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Turn left heading ${headingStr}`
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
              ilsArmed: false,
              ilsLocalizerCaptured: false,
              ilsGlideslopeCaptured: false,
              status: a.status === 'Established' ? 'Inbound' : a.status,
            }
          : a
      ),
    }));
    const headingStr = newTarget.toString().padStart(3, '0');
    logCommsExchange(
      get,
      set,
      ac.callsign,
      `${ac.callsign}, turn right heading ${headingStr}`,
      `Turn right heading ${headingStr}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Turn right heading ${headingStr}`
    );
  },

  setAltitude: (id, altitude, expedite = false) => {
    const { aircraft, airport } = get();
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
    const altText = target >= 8000 ? `Flight Level ${Math.round(target / 100)}` : `${target} feet`;
    const expeditePhrase = expedite ? ' expedite' : '';

    logCommsExchange(
      get,
      set,
      ac.callsign,
      `${ac.callsign}, ${actionWord.toLowerCase()} ${altText}${expeditePhrase}`,
      `${actionWord} ${altText}${expeditePhrase}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `${actionWord} ${altText}${expeditePhrase}`
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

    logCommsExchange(
      get,
      set,
      ac.callsign,
      `${ac.callsign}, adjust speed to ${target} knots`,
      `Speed ${target} knots, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Speed ${target} knots`
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
              status: 'Inbound',
              ilsArmed: false,
            }
          : a
      ),
    }));

    logCommsExchange(
      get,
      set,
      ac.callsign,
      `${ac.callsign}, proceed direct to ${waypointName}`,
      `Direct ${waypointName}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Direct ${waypointName}`
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
              status: 'LocalizerIntercept',
            }
          : a
      ),
    }));

    logCommsExchange(
      get,
      set,
      ac.callsign,
      `${ac.callsign}, cleared ILS approach runway ${runwayId}`,
      `Cleared ILS runway ${runwayId}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Cleared ILS runway ${runwayId}`
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

    logCommsExchange(
      get,
      set,
      ac.callsign,
      `${ac.callsign}, go around, climb to ${missedAlt} feet runway heading`,
      `Going around, climbing to ${missedAlt} feet, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Going around, climbing to ${missedAlt} feet`
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
            }
          : a
      ),
    }));

    logCommsExchange(
      get,
      set,
      ac.callsign,
      `${ac.callsign}, hold at ${waypointName} as published`,
      `Hold at ${waypointName} as published, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Hold at ${waypointName} as published`
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
      logCommsExchange(
        get,
        set,
        ac.callsign,
        `${ac.callsign}, line up and wait runway ${runwayId}`,
        `Unable line up runway ${runwayId}, ${res.reason}, ${ac.telephony} ${ac.callsign.slice(3)}`,
        `Unable line up, ${res.reason}`
      );
      return;
    }

    set(state => ({
      aircraft: state.aircraft.map(a => (a.id === id ? res.aircraft : a)),
    }));

    logCommsExchange(
      get,
      set,
      ac.callsign,
      `${ac.callsign}, runway ${runwayId}, line up and wait`,
      `Runway ${runwayId}, line up and wait, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Runway ${runwayId}, line up and wait`
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
      logCommsExchange(
        get,
        set,
        ac.callsign,
        `${ac.callsign}, runway ${ac.assignedRunway} cleared for takeoff`,
        `Unable takeoff, ${res.reason}, ${ac.telephony} ${ac.callsign.slice(3)}`,
        `Unable takeoff, ${res.reason}`
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

    const wind = `${weather.windDirection} at ${weather.windSpeed}`;
    logCommsExchange(
      get,
      set,
      ac.callsign,
      `${ac.callsign}, wind ${wind}, runway ${ac.assignedRunway} cleared for takeoff`,
      `Cleared for takeoff runway ${ac.assignedRunway}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Wind ${wind}, runway ${ac.assignedRunway} cleared for takeoff`
    );
  },

  abortTakeoff: id => {
    const { aircraft, airport } = get();
    const ac = aircraft.find(a => a.id === id);
    if (!ac) return;
    const res = rejectTakeoff(ac, 'Aborted on ATC instruction', airport.elevationFeet);
    if (!res.success) {
      logCommsExchange(
        get,
        set,
        ac.callsign,
        `${ac.callsign}, abort takeoff immediately!`,
        `Unable abort - past V1 (${Math.round(ac.indicatedAirspeed)}kt), committing to takeoff!`,
        `Unable abort, past V1, continuing takeoff!`
      );
      return;
    }

    set(state => ({
      aircraft: state.aircraft.map(a => (a.id === id ? res.aircraft : a)),
    }));

    logCommsExchange(
      get,
      set,
      ac.callsign,
      `${ac.callsign}, stop immediately, abort takeoff!`,
      `Aborting takeoff runway ${ac.assignedRunway}, maximum braking applied, stopping`,
      `Stopping, aborting takeoff runway ${ac.assignedRunway}`
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
    const { airport, activeLandingRunwayId, heavyRatio } = get();
    const arrRwy = airport.runways.find(r => r.id === activeLandingRunwayId) || airport.runways[0];
    const newAc = generateInboundFlight(undefined, {
      airport,
      arrivalRunway: arrRwy,
      heavyRatio,
    });
    set(state => ({
      aircraft: [...state.aircraft, newAc],
    }));
  },

  spawnDeparture: () => {
    const { airport, activeDepartureRunwayId, heavyRatio } = get();
    const depRwy =
      airport.runways.find(r => r.id === activeDepartureRunwayId) ||
      airport.runways[1] ||
      airport.runways[0];
    const newAc = generateDepartureFlight({
      airport,
      departureRunway: depRwy,
      heavyRatio,
    });
    set(state => ({
      aircraft: [...state.aircraft, newAc],
    }));
  },

  triggerEmergency: (type = 'ENGINE_FAILURE') => {
    const { airport, activeLandingRunwayId, airportProfile } = get();
    const arrRwy = airport.runways.find(r => r.id === activeLandingRunwayId) || airport.runways[0];
    const emerAc = generateInboundFlight(undefined, {
      airport,
      arrivalRunway: arrRwy,
      isEmergency: true,
      emergencyType: type,
    });

    const emergencyMsg: RadioMessage = {
      id: `emer_${Date.now()}`,
      timestamp: getFormattedUTCTime(),
      sender: 'PILOT',
      callsign: emerAc.callsign,
      text: `MAYDAY MAYDAY MAYDAY! ${emerAc.callsign} squawking 7700 (${type.replace('_', ' ')}), requesting immediate priority vectors for runway ${arrRwy.id}!`,
      frequency: airportProfile.vhfFrequency,
    };

    radioAudio.playConflictAlert();
    radioAudio.speakPilotReadback(
      emerAc.callsign,
      `Mayday Mayday, squawking 7700, requesting immediate priority landing runway ${arrRwy.id}`
    );

    set(state => ({
      aircraft: [emerAc, ...state.aircraft],
      selectedAircraftId: emerAc.id,
      emergencyTriggered: true,
      radioMessages: [emergencyMsg, ...state.radioMessages.slice(0, 49)],
    }));
  },

  switchAirport: (icao, landingRunwayId, departureRunwayId, weatherOverride) => {
    const resolved = resolveConfiguredAirport(icao, landingRunwayId, departureRunwayId);
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
            radioAudio.speakPilotReadback(
              ac.callsign,
              `Touchdown runway ${assignedRwyGeom.id}, rolling out`
            );
          } else if (ilsResult.eventType === 'RUNWAY_VACATED') {
            radioAudio.speakPilotReadback(
              ac.callsign,
              `Runway vacated, ground on 121.9`
            );
          } else if (
            ilsResult.eventType === 'UNSTABLE_GO_AROUND' ||
            ilsResult.eventType === 'LANDING_REJECTED'
          ) {
            goAroundThisTick = true;
            radioAudio.speakPilotReadback(
              ac.callsign,
              ilsResult.eventMessage || 'Going around'
            );
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
