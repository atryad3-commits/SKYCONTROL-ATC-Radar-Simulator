/**
 * SKYCONTROL - Master Simulation Store (Zustand)
 * Manages aircraft state, ATC commands, simulation clock, conflict detection,
 * radio transcript, and UI layout controls.
 */

import { create } from 'zustand';
import { 
  Aircraft, 
  Airport, 
  ConflictPair, 
  RadioMessage, 
  SimulationStats, 
  WeatherCondition,
  Waypoint
} from '../types';
import { HEATHROW_AIRPORT, HEATHROW_RUNWAY_GEOMETRIES } from '../airports/heathrow';
import { stepAircraftPhysics, normalizeHeading, calculateBearing } from '../engine/physics';
import { updateILSApproach } from '../engine/ils';
import { detectConflicts, ConflictEventTracker } from '../engine/conflict';
import { generateInboundFlight, generateDepartureFlight } from '../engine/trafficGenerator';
import { radioAudio } from '../audio/radioAudio';
import { RunwayOccupancyManager } from '../engine/runwayOccupancy';
import { stepTakeoffSequence, issueTakeoffClearance, lineUpAircraft, rejectTakeoff } from '../engine/takeoff';
import { SimulationEvent } from '../types/events';
import { RadarTrackingEngine, RadarTrack, RadarObservation } from '../engine/radarTracker';

const globalConflictTracker = new ConflictEventTracker();
const globalOccupancyManager = new RunwayOccupancyManager(HEATHROW_RUNWAY_GEOMETRIES);
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
  // State
  aircraft: Aircraft[];
  selectedAircraftId: string | null;
  airport: Airport;
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
  
  // Simulation Management
  tickSimulation: (dt: number) => void;
  togglePause: () => void;
  setSimSpeed: (speed: number) => void;
  setAudioMuted: (muted: boolean) => void;
  setAudioVolume: (vol: number) => void;
  toggleLayer: (layer: keyof RadarLayers) => void;
  spawnInbound: () => void;
  spawnDeparture: () => void;
  resetSimulation: (scenario?: string) => void;
  setMeasurePoints: (start: { x: number; y: number } | null, current: { x: number; y: number } | null) => void;
}

// Initial default flight set (London Heathrow active inbound & departures)
function createInitialFleet(): Aircraft[] {
  const f1 = generateInboundFlight(1);
  f1.callsign = 'BAW452';
  f1.airline = 'British Airways';
  f1.telephony = 'Speedbird';
  f1.x = 22.0;
  f1.y = 12.0;
  f1.heading = 240;
  f1.targetHeading = 240;
  f1.altitude = 7000;
  f1.targetAltitude = 4000;
  f1.indicatedAirspeed = 220;
  f1.targetAirspeed = 210;
  f1.assignedWaypoint = 'LAM';
  f1.history = [
    { x: 33.0, y: 18.5, altitude: 12000, timestamp: -90 },
    { x: 30.0, y: 16.8, altitude: 10800, timestamp: -70 },
    { x: 27.5, y: 15.2, altitude: 9500, timestamp: -50 },
    { x: 25.0, y: 13.8, altitude: 8200, timestamp: -30 },
    { x: 23.5, y: 12.8, altitude: 7500, timestamp: -15 },
    { x: 22.0, y: 12.0, altitude: 7000, timestamp: 0 },
  ];

  const f2 = generateInboundFlight(2);
  f2.callsign = 'VIR18';
  f2.airline = 'Virgin Atlantic';
  f2.telephony = 'Virgin';
  f2.origin = 'KBOS';
  f2.x = 18.0;
  f2.y = -14.0;
  f2.heading = 300;
  f2.targetHeading = 300;
  f2.altitude = 8000;
  f2.targetAltitude = 5000;
  f2.indicatedAirspeed = 230;
  f2.targetAirspeed = 210;
  f2.assignedWaypoint = 'OCK';
  f2.history = [
    { x: 28.0, y: -20.0, altitude: 13000, timestamp: -80 },
    { x: 25.0, y: -18.2, altitude: 11200, timestamp: -60 },
    { x: 22.5, y: -16.6, altitude: 9800, timestamp: -40 },
    { x: 20.0, y: -15.2, altitude: 8900, timestamp: -20 },
    { x: 18.0, y: -14.0, altitude: 8000, timestamp: 0 },
  ];

  const f3 = generateInboundFlight(3);
  f3.callsign = 'DLH914';
  f3.airline = 'Lufthansa';
  f3.telephony = 'Lufthansa';
  f3.origin = 'EDDF';
  f3.x = 14.5;
  f3.y = 0.38; // On 27R approach corridor
  f3.heading = 270;
  f3.targetHeading = 270;
  f3.altitude = 3500;
  f3.targetAltitude = 3000;
  f3.indicatedAirspeed = 180;
  f3.targetAirspeed = 160;
  f3.assignedWaypoint = 'D15R';
  f3.ilsArmed = true;
  f3.history = [
    { x: 26.0, y: 0.38, altitude: 7000, timestamp: -90 },
    { x: 22.5, y: 0.38, altitude: 5800, timestamp: -70 },
    { x: 19.5, y: 0.38, altitude: 4800, timestamp: -45 },
    { x: 17.0, y: 0.38, altitude: 4100, timestamp: -25 },
    { x: 14.5, y: 0.38, altitude: 3500, timestamp: 0 },
  ];

  const f4 = generateDepartureFlight();
  f4.callsign = 'BAW117';
  f4.airline = 'British Airways';
  f4.telephony = 'Speedbird';
  f4.origin = 'EGLL';
  f4.destination = 'KJFK';
  f4.x = -2.5;
  f4.y = -0.38;
  f4.altitude = 2200;
  f4.targetAltitude = 6000;
  f4.indicatedAirspeed = 190;
  f4.heading = 270;
  f4.targetHeading = 270;
  f4.verticalSpeed = 2200;
  f4.status = 'Outbound';
  f4.history = [
    { x: 0.95, y: -0.38, altitude: 83, timestamp: -45 },
    { x: 0.0, y: -0.38, altitude: 400, timestamp: -30 },
    { x: -1.2, y: -0.38, altitude: 1100, timestamp: -15 },
    { x: -2.5, y: -0.38, altitude: 2200, timestamp: 0 },
  ];

  return [f1, f2, f3, f4];
}

function getFormattedUTCTime(): string {
  const d = new Date();
  return d.toTimeString().split(' ')[0];
}

function logCommsExchange(
  set: (fn: (state: SimulationStore) => Partial<SimulationStore>) => void,
  callsign: string,
  atcText: string,
  pilotText: string,
  spokenText: string
) {
  const atcMsg: RadioMessage = {
    id: `atc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: getFormattedUTCTime(),
    sender: 'ATC',
    callsign: 'EGLL_DIR',
    text: atcText,
    frequency: '119.725 MHz',
  };

  set(state => ({ radioMessages: [atcMsg, ...state.radioMessages.slice(0, 49)] }));

  // Dual-voice audio exchange: Controller speaks -> pause -> Pilot responds with distinct voice
  radioAudio.speakRadioExchange(
    atcText,
    callsign,
    spokenText,
    () => {
      const pilotMsg: RadioMessage = {
        id: `pilot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: getFormattedUTCTime(),
        sender: 'PILOT',
        callsign: callsign,
        text: pilotText,
        frequency: '119.725 MHz',
      };
      set(state => ({ radioMessages: [pilotMsg, ...state.radioMessages.slice(0, 49)] }));
    }
  );
}

const initialFleet = createInitialFleet();
globalRadarTracker.seedInitialTracks(initialFleet, 0);

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  aircraft: initialFleet,
  selectedAircraftId: 'BAW452',
  airport: HEATHROW_AIRPORT,
  weather: {
    windDirection: 260,
    windSpeed: 12,
    gusts: 18,
    qnh: 1013,
    visibilityNM: 10,
    ceilingFeet: 5000,
    precipitation: 'None',
  },
  isPaused: false,
  simSpeed: 1,
  stats: {
    landings: 0,
    departures: 1,
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
      callsign: 'BAW452',
      text: 'Heathrow Director, Speedbird 452 descending through FL70, information Charlie.',
      frequency: '119.725 MHz',
    },
    {
      id: 'init_2',
      timestamp: getFormattedUTCTime(),
      sender: 'ATC',
      callsign: 'BAW452',
      text: 'Speedbird 452, radar contact. Turn left heading 240, descend to 4,000 feet.',
      frequency: '119.725 MHz',
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

  selectAircraft: (id) => {
    set({ selectedAircraftId: id });
  },

  setHeading: (id, heading) => {
    const target = normalizeHeading(Math.round(heading));
    const ac = get().aircraft.find(a => a.id === id);
    if (!ac) return;

    set(state => ({
      aircraft: state.aircraft.map(a => 
        a.id === id ? { 
          ...a, 
          targetHeading: target, 
          assignedWaypoint: null,
          ilsArmed: false,
          ilsLocalizerCaptured: false,
          ilsGlideslopeCaptured: false,
          status: a.status === 'Established' ? 'Inbound' : a.status
        } : a
      ),
    }));

    const headingStr = target.toString().padStart(3, '0');
    logCommsExchange(
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
        a.id === id ? { 
          ...a, 
          targetHeading: newTarget, 
          assignedWaypoint: null,
          ilsArmed: false,
          ilsLocalizerCaptured: false,
          ilsGlideslopeCaptured: false,
          status: a.status === 'Established' ? 'Inbound' : a.status
        } : a
      ),
    }));
    const headingStr = newTarget.toString().padStart(3, '0');
    logCommsExchange(
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
        a.id === id ? { 
          ...a, 
          targetHeading: newTarget, 
          assignedWaypoint: null,
          ilsArmed: false,
          ilsLocalizerCaptured: false,
          ilsGlideslopeCaptured: false,
          status: a.status === 'Established' ? 'Inbound' : a.status
        } : a
      ),
    }));
    const headingStr = newTarget.toString().padStart(3, '0');
    logCommsExchange(
      set,
      ac.callsign,
      `${ac.callsign}, turn right heading ${headingStr}`,
      `Turn right heading ${headingStr}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Turn right heading ${headingStr}`
    );
  },

  setAltitude: (id, altitude, expedite = false) => {
    const ac = get().aircraft.find(a => a.id === id);
    if (!ac) return;
    const target = Math.max(83, Math.min(18000, Math.round(altitude)));

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id ? {
          ...a,
          targetAltitude: target,
          expediteAltitude: expedite,
          ilsGlideslopeCaptured: false,
        } : a
      ),
    }));

    const isClimb = target > ac.altitude;
    const actionWord = isClimb ? 'Climb and maintain' : 'Descend and maintain';
    const altText = target >= 6000 ? `Flight Level ${Math.round(target / 100)}` : `${target} feet`;
    const expeditePhrase = expedite ? ' expedite' : '';

    logCommsExchange(
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
      set,
      ac.callsign,
      `${ac.callsign}, reduce speed to ${target} knots`,
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
        a.id === id ? {
          ...a,
          assignedWaypoint: waypointName,
          status: 'Inbound',
          ilsArmed: false,
        } : a
      ),
    }));

    logCommsExchange(
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
        a.id === id ? {
          ...a,
          ilsArmed: true,
          assignedRunway: runwayId,
          status: 'LocalizerIntercept',
        } : a
      ),
    }));

    logCommsExchange(
      set,
      ac.callsign,
      `${ac.callsign}, cleared ILS approach runway ${runwayId}`,
      `Cleared ILS runway ${runwayId}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Cleared ILS runway ${runwayId}`
    );
  },

  goAround: (id) => {
    const ac = get().aircraft.find(a => a.id === id);
    if (!ac) return;

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id ? {
          ...a,
          status: 'GoAround',
          ilsArmed: false,
          ilsLocalizerCaptured: false,
          ilsGlideslopeCaptured: false,
          targetAltitude: 3000,
          targetAirspeed: 210,
          targetHeading: a.heading,
          expediteAltitude: true,
        } : a
      ),
      stats: {
        ...state.stats,
        goArounds: state.stats.goArounds + 1,
        score: Math.max(0, state.stats.score - 5),
      },
    }));

    logCommsExchange(
      set,
      ac.callsign,
      `${ac.callsign}, go around, climb to 3,000 feet runway heading`,
      `Going around, climbing to 3,000 feet, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Going around, climbing to 3,000 feet`
    );
  },

  holdAt: (id, waypointName) => {
    const ac = get().aircraft.find(a => a.id === id);
    const wp = get().airport.waypoints.find(w => w.name === waypointName);
    if (!ac || !wp) return;

    set(state => ({
      aircraft: state.aircraft.map(a =>
        a.id === id ? {
          ...a,
          status: 'Holding',
          holdingWaypoint: waypointName,
          holdingInboundHeading: wp.defaultHoldingHeading || 270,
          holdingLeg: 'Inbound',
          holdingTimer: 0,
          assignedWaypoint: waypointName,
        } : a
      ),
    }));

    logCommsExchange(
      set,
      ac.callsign,
      `${ac.callsign}, hold at ${waypointName} as published`,
      `Hold at ${waypointName} as published, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Hold at ${waypointName} as published`
    );
  },

  lineUpAndWait: (id, runwayId) => {
    const ac = get().aircraft.find(a => a.id === id);
    if (!ac) return;
    const rwyGeom = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === runwayId) || HEATHROW_RUNWAY_GEOMETRIES[1];
    const res = lineUpAircraft(ac, rwyGeom, globalOccupancyManager, get().stats.elapsedSeconds);

    if (!res.success) {
      logCommsExchange(
        set,
        ac.callsign,
        `${ac.callsign}, line up and wait runway ${runwayId}`,
        `Unable line up runway ${runwayId}, ${res.reason}, ${ac.telephony} ${ac.callsign.slice(3)}`,
        `Unable line up, ${res.reason}`
      );
      return;
    }

    set(state => ({
      aircraft: state.aircraft.map(a => a.id === id ? res.aircraft : a),
    }));

    logCommsExchange(
      set,
      ac.callsign,
      `${ac.callsign}, runway ${runwayId}, line up and wait`,
      `Runway ${runwayId}, line up and wait, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Runway ${runwayId}, line up and wait`
    );
  },

  clearTakeoff: (id) => {
    const ac = get().aircraft.find(a => a.id === id);
    if (!ac) return;
    const rwyGeom = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === ac.assignedRunway) || HEATHROW_RUNWAY_GEOMETRIES[1];
    const res = issueTakeoffClearance(ac, rwyGeom, globalOccupancyManager, get().stats.elapsedSeconds);

    if (!res.success) {
      logCommsExchange(
        set,
        ac.callsign,
        `${ac.callsign}, runway ${ac.assignedRunway} cleared for takeoff`,
        `Unable takeoff, ${res.reason}, ${ac.telephony} ${ac.callsign.slice(3)}`,
        `Unable takeoff, ${res.reason}`
      );
      return;
    }

    set(state => ({
      aircraft: state.aircraft.map(a => a.id === id ? res.aircraft : a),
      stats: {
        ...state.stats,
        departures: state.stats.departures + 1,
        score: state.stats.score + 10,
      },
    }));

    const wind = `${get().weather.windDirection} at ${get().weather.windSpeed}`;
    logCommsExchange(
      set,
      ac.callsign,
      `${ac.callsign}, wind ${wind}, runway ${ac.assignedRunway} cleared for takeoff`,
      `Cleared for takeoff runway ${ac.assignedRunway}, ${ac.telephony} ${ac.callsign.slice(3)}`,
      `Wind ${wind}, runway ${ac.assignedRunway} cleared for takeoff`
    );
  },

  abortTakeoff: (id) => {
    const ac = get().aircraft.find(a => a.id === id);
    if (!ac) return;
    const res = rejectTakeoff(ac, 'Aborted on ATC instruction');
    if (!res.success) {
      logCommsExchange(
        set,
        ac.callsign,
        `${ac.callsign}, abort takeoff immediately!`,
        `Unable abort - past V1 (${Math.round(ac.indicatedAirspeed)}kt), committing to takeoff!`,
        `Unable abort, past V1, continuing takeoff!`
      );
      return;
    }

    set(state => ({
      aircraft: state.aircraft.map(a => a.id === id ? res.aircraft : a),
    }));

    logCommsExchange(
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

  setSimSpeed: (speed) => {
    set({ simSpeed: speed });
  },

  setAudioMuted: (muted) => {
    radioAudio.setMuted(muted);
    set({ audioMuted: muted });
  },

  setAudioVolume: (vol) => {
    radioAudio.setVolume(vol);
    set({ audioVolume: vol });
  },

  toggleLayer: (layer) => {
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
    const newAc = generateInboundFlight();
    set(state => ({
      aircraft: [...state.aircraft, newAc],
    }));
  },

  spawnDeparture: () => {
    const newAc = generateDepartureFlight();
    set(state => ({
      aircraft: [...state.aircraft, newAc],
    }));
  },

  resetSimulation: (scenario = 'normal') => {
    globalConflictTracker.clear();
    globalOccupancyManager.clearAll();
    const freshFleet = createInitialFleet();
    globalRadarTracker.reset();
    globalRadarTracker.seedInitialTracks(freshFleet, 0);

    set({
      aircraft: freshFleet,
      selectedAircraftId: 'BAW452',
      isPaused: false,
      simSpeed: 1,
      stats: {
        landings: 0,
        departures: 1,
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
    const { aircraft, airport, weather, stats } = state;
    const currentSimTime = stats.elapsedSeconds + actualDt;

    let scoreDelta = 0;
    let newLandings = stats.landings;

    // 1. Step departures, physics & ILS for each aircraft
    const updatedAircraft: Aircraft[] = [];

    for (const ac of aircraft) {
      const assignedRwyGeom = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === ac.assignedRunway) || HEATHROW_RUNWAY_GEOMETRIES[0];
      let currentAc = ac;

      // Check if aircraft is in ground departure phase
      const isGroundDeparture = currentAc.status === 'Departing' && (currentAc.altitude - assignedRwyGeom.elevationFeet) <= 1500;

      if (isGroundDeparture && currentAc.indicatedAirspeed > 0) {
        // Step staged takeoff dynamics
        const toResult = stepTakeoffSequence(
          currentAc,
          assignedRwyGeom,
          actualDt,
          globalOccupancyManager,
          currentSimTime
        );
        currentAc = toResult.aircraft;
      } else {
        // Step general airborne physics & navigation
        currentAc = stepAircraftPhysics(
          currentAc,
          actualDt,
          weather,
          airport.waypoints,
          currentSimTime,
          airport.elevationFeet
        );

        // Step advanced ILS approach & landing sequence
        if (currentAc.ilsArmed || currentAc.ilsLocalizerCaptured || currentAc.status === 'Landed') {
          const ilsResult = updateILSApproach(
            currentAc,
            assignedRwyGeom,
            actualDt,
            globalOccupancyManager,
            currentSimTime
          );
          currentAc = ilsResult.aircraft;

          // Check if newly touched down
          if (ilsResult.landed && ac.status !== 'Landed') {
            newLandings += 1;
            scoreDelta += 25; // Award 25 points for successful validated landing
            radioAudio.speakPilotReadback(ac.callsign, `Touchdown runway ${assignedRwyGeom.id}, rolling out`);
          } else if (ilsResult.eventType === 'RUNWAY_VACATED') {
            radioAudio.speakPilotReadback(ac.callsign, `Runway vacated, ground on 121.9`);
          } else if (ilsResult.eventType === 'UNSTABLE_GO_AROUND' || ilsResult.eventType === 'LANDING_REJECTED') {
            radioAudio.speakPilotReadback(ac.callsign, ilsResult.eventMessage || 'Going around');
          }
        }
      }

      // Filter out aircraft that have completed landing roll and vacated or departed beyond 55 NM
      const distFromCenter = Math.sqrt(currentAc.x * currentAc.x + currentAc.y * currentAc.y);
      const isLandedStopped = currentAc.status === 'Landed' && currentAc.indicatedAirspeed <= 0.1;
      const isFarOut = distFromCenter > 55.0;

      if (!isLandedStopped && !isFarOut) {
        updatedAircraft.push(currentAc);
      }
    }

    // 2. Real Radar Scanning & Track Prediction Step
    globalRadarTracker.update(actualDt, currentSimTime, updatedAircraft);

    // 3. Conflict Detection (STCA)
    const activeConflicts = detectConflicts(updatedAircraft);
    
    // Lifecycle and single-penalty accounting
    const { penaltiesToDeduct } = globalConflictTracker.updateEvents(activeConflicts, currentSimTime);

    let newViolations = stats.separationViolations;
    for (const p of penaltiesToDeduct) {
      scoreDelta -= p.penaltyPoints;
      if (p.severity === 'Critical') {
        newViolations += 1;
        radioAudio.playConflictAlert();
      }
    }

    // Update state
    set({
      aircraft: updatedAircraft,
      conflicts: activeConflicts,
      radarTracks: globalRadarTracker.getTracks(),
      antennaAzimuth: globalRadarTracker.getAntennaAzimuth(),
      stats: {
        ...stats,
        landings: newLandings,
        separationViolations: newViolations,
        score: Math.max(0, stats.score + scoreDelta),
        elapsedSeconds: currentSimTime,
      },
    });
  },
}));

// Synchronize radio transmission active state with Zustand store
radioAudio.onTransmissionChange(tx => {
  useSimulationStore.setState({ activeTransmission: tx });
});
