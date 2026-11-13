/**
 * SKYCONTROL - Air Traffic Control Radar Simulator
 * Core Type Definitions
 */

import type { RunwayGeometry } from '../engine/runwayGeometry';

export type AircraftCategory = 'Heavy' | 'Large' | 'Small';

export type AircraftStatus =
  | 'Inbound'
  | 'Outbound'
  | 'Holding'
  | 'LocalizerIntercept'
  | 'Established'
  | 'FinalApproach'
  | 'Landed'
  | 'Departing'
  | 'EnRoute'
  | 'GoAround';

export type ConflictSeverity = 'None' | 'Caution' | 'Warning' | 'Critical';

export interface Position2D {
  x: number; // Nautical Miles relative to airport center (East = +X, West = -X)
  y: number; // Nautical Miles relative to airport center (North = +Y, South = -Y)
  lat?: number;
  lon?: number;
}

export interface AircraftHistoryPoint {
  x: number;
  y: number;
  altitude: number;
  timestamp: number;
}

export interface Aircraft {
  id: string;
  callsign: string;           // e.g. "BAW142"
  airline: string;            // e.g. "British Airways"
  telephony: string;          // e.g. "Speedbird"
  aircraftType: string;       // e.g. "A320", "B77W"
  category: AircraftCategory;
  origin: string;             // e.g. "KJFK"
  destination: string;        // e.g. "EGLL"

  // Dynamic Spatial State
  x: number;                  // NM relative to airport
  y: number;                  // NM relative to airport
  altitude: number;           // Current altitude in feet
  targetAltitude: number;     // Cleared altitude in feet
  indicatedAirspeed: number;  // IAS in knots
  targetAirspeed: number;     // Cleared IAS in knots
  trueAirspeed?: number;      // TAS in knots (calculated from IAS & altitude)
  groundSpeed: number;        // Ground speed accounting for wind (knots)
  groundTrack?: number;       // Ground track heading accounting for drift (0-359°)
  groundVelocityX?: number;   // Ground velocity East component in knots
  groundVelocityY?: number;   // Ground velocity North component in knots
  heading: number;            // Current magnetic heading (0-359°)
  targetHeading: number;      // Assigned heading (0-359°)
  bankAngle?: number;         // Current bank angle in degrees (positive = right)
  maxBankAngle?: number;      // Maximum allowable bank angle (e.g. 25°)
  verticalSpeed: number;      // Current vertical speed in fpm (+/-)
  expediteAltitude: boolean;  // Whether climb/descent is expedited
  turnRate: number;           // Current turn rate in deg/sec

  // Navigation & ATC Status
  status: AircraftStatus;
  assignedRunway: string;     // e.g. "27R"
  transponder: string;        // Squawk code e.g. "4521" or "7700"
  assignedWaypoint: string | null; // Direct-to waypoint name
  routeQueue?: string[];           // Subsequent queued waypoints after assignedWaypoint
  autoInterceptILS?: boolean;      // Arm ILS automatically once final route leg finishes
  holdingWaypoint: string | null;  // Holding pattern fix
  holdingInboundHeading: number;   // Inbound course for hold
  holdingLegTime: number;          // Standard 60 seconds
  holdingTimer: number;            // Elapsed time on current leg
  holdingLeg: 'Inbound' | 'TurnOut' | 'Outbound' | 'TurnIn';

  // Emergency State
  isEmergency?: boolean;
  emergencyType?: 'ENGINE_FAILURE' | 'MEDICAL' | 'FUEL_CRITICAL' | null;

  // ILS Capture State
  ilsArmed: boolean;
  ilsLocalizerCaptured: boolean;
  ilsGlideslopeCaptured: boolean;
  distanceToThreshold?: number; // Distance in NM to runway threshold
  glidepathDeviation?: number;  // Angular deviation in degrees
  localizerDeviation?: number;  // Angular deviation in degrees
  touchdownTime?: number;
  flightPhase?: string;        // Staged takeoff or landing flight phase

  // UI & Radar Tagging
  tagOffset: { x: number; y: number }; // Vector leader line offset in screen px
  history: AircraftHistoryPoint[];     // Trail blips
  isSelected?: boolean;
}

export interface Runway {
  id: string;               // e.g. "27R"
  heading: number;          // Magnetic heading e.g. 270
  lengthFeet: number;       // e.g. 12800 ft
  threshold: Position2D;    // Threshold position in NM
  endPosition: Position2D;  // Far end position in NM
  ilsFrequency: string;     // e.g. "110.3 MHz"
  glideslopeAngle: number;  // Standard 3.0°
  activeLanding: boolean;   // Active for arrivals
  activeDeparture: boolean; // Active for departures
  occupied: boolean;        // Runway occupancy state
}

export interface Waypoint {
  name: string;             // e.g. "LAM"
  description: string;      // e.g. "Lambourne VOR"
  position: Position2D;     // In NM from airport center
  isHoldingFix?: boolean;
  defaultHoldingHeading?: number;
  holdingTurnDirection?: 'Right' | 'Left';
  isInitialApproachFix?: boolean;
}

export interface AirspaceSector {
  id: string;
  name: string;
  radiusNM: number;
  floorAltitude: number;
  ceilingAltitude: number;
  transitionAltitude: number;
}

export interface Airport {
  icao: string;             // e.g. "EGLL"
  iata: string;             // e.g. "LHR"
  name: string;             // e.g. "London Heathrow"
  country: string;
  centerCoordinates: { lat: number; lon: number };
  elevationFeet: number;
  magneticVariation: number;
  runways: Runway[];
  waypoints: Waypoint[];
  sector: AirspaceSector;
  defaultArrivalRunway: string;
  defaultDepartureRunway: string;
}

export interface AirportProfile {
  airport: Airport;
  runwayGeometries: RunwayGeometry[];
  reciprocalPairs: Array<[string, string]>;
  category: 'International' | 'Training';
  runwayLayoutLabel: string;
  difficultyLabel: 'Standard' | 'Moderate' | 'Challenging' | 'High Crosswind';
  summaryFa: string;
  defaultWeather: WeatherCondition;
  directorCallsign: string;
  vhfFrequency: string;
}

export interface SeparationMinima {
  horizontalNM: number;       // Terminal separation (e.g. 3.0 NM)
  verticalFeet: number;       // Terminal separation (e.g. 1000 ft)
  cautionTimeSec: number;     // e.g. 100 sec
  warningTimeSec: number;     // e.g. 60 sec
}

export interface ConflictPair {
  id: string;                 // Unique ID e.g. "conf_ac1_ac2"
  aircraft1Id: string;
  aircraft2Id: string;
  callsign1: string;
  callsign2: string;
  currentHorizontalNM: number;
  currentVerticalFt: number;
  closestPointOfApproachNM: number;
  predictedHorizontalSeparationNM: number;
  predictedVerticalSeparationFt: number;
  timeToCPASec: number;
  severity: ConflictSeverity;
  alertMessage: string;
  phase?: 'Initiated' | 'Active' | 'Escalated' | 'Resolved';
}

export interface ConflictEvent {
  id: string;
  pairKey: string;
  aircraft1Id: string;
  aircraft2Id: string;
  callsign1: string;
  callsign2: string;
  startTime: number;
  lastActiveTime: number;
  highestSeverity: ConflictSeverity;
  currentSeverity: ConflictSeverity;
  penalizedSeverities: ConflictSeverity[];
  isResolved: boolean;
}

export interface WeatherCondition {
  windDirection: number;    // Degrees from (0-359)
  windSpeed: number;        // Knots
  gusts?: number;           // Knots
  qnh: number;              // Hectopascals (e.g. 1013)
  visibilityNM: number;     // Nautical miles
  ceilingFeet: number;      // Feet
  precipitation: 'None' | 'Light Rain' | 'Rain' | 'Fog';
}

export interface RadioMessage {
  id: string;
  timestamp: string;        // UTC HH:MM:SS
  sender: 'ATC' | 'PILOT';
  callsign: string;
  text: string;
  frequency: string;
}

export interface SimulationStats {
  landings: number;
  departures: number;
  goArounds: number;
  separationViolations: number;
  score: number;
  elapsedSeconds: number;
}

export interface Scenario {
  id: string;
  name: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Master';
  description: string;
  wind: WeatherCondition;
  initialInbounds: number;
  spawnIntervalSec: number;
  allowEmergencies: boolean;
}

export type MissionId = 'mission_1' | 'mission_2' | 'mission_3' | 'mission_4' | 'mission_5';

export interface MissionObjective {
  id: string;
  label: string;
  current: number;
  target: number;
  completed: boolean;
  failed?: boolean;
  isConstraint?: boolean;
}

export interface MissionDefinition {
  id: MissionId;
  number: number;
  title: string;
  subtitle: string;
  description: string;
  airportIcao: string;
  landingRunwayId: string;
  departureRunwayId: string;
  weather: WeatherCondition;
  targetLandings: number;
  targetDepartures: number;
  minScore: number;
  maxViolations: number;
  requireEmergencyHandled?: boolean;
  requireGoAroundHandled?: boolean;
  spawnIntervalSec: number;
  maxTraffic: number;
  initialInbounds: number;
  initialDepartures: number;
}

export interface ActiveMissionState {
  mission: MissionDefinition | null;
  status: 'idle' | 'active' | 'passed' | 'failed';
  failReason?: string;
  objectives: MissionObjective[];
  emergencyHandled: boolean;
  goAroundObserved: boolean;
  newlyCertified?: boolean;
}

export interface CustomScenarioConfig {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Master';
  airportIcao: string;
  landingRunwayId: string;
  departureRunwayId: string;
  windDirection: number;
  windSpeed: number;
  gusts: number;
  qnh: number;
  visibilityNM: number;
  ceilingFeet: number;
  precipitation: 'None' | 'Light Rain' | 'Rain' | 'Fog';
  initialInbounds: number;
  initialDepartures: number;
  spawnIntervalSec: number;
  heavyRatio: number; // 0 to 1
  allowEmergencies: boolean;
  emergencyDelaySec: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfileData {
  uid: string;
  callsign: string;
  mode: 'guest' | 'google';
  email?: string | null;
  certified: boolean;
  certificateId?: string;
  issuedAt?: string;
  completedMissions: MissionId[];
  totalLandings: number;
  totalDepartures: number;
  bestScore: number;
}

export type { TrackStatus, RadarObservation, RadarTrack } from '../engine/radarTracker';
