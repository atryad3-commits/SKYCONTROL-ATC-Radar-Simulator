/**
 * SKYCONTROL - Aircraft Performance Profiles & Operational Limits
 * Realistic, documented aerodynamic parameters for standard civil airliners.
 * Used for staged takeoff roll, rotation, liftoff, climb rates, approach speeds,
 * and touchdown validation.
 */

import { AircraftCategory } from '../types';

export interface AircraftPerformance {
  aircraftType: string;
  category: AircraftCategory;
  name: string;
  maxTakeoffMassKg: number;
  typicalLandingMassKg: number;
  // Speeds in Knots (IAS)
  takeoffDecisionSpeedIAS: number;  // V1 (Abort / Go decision speed)
  rotationSpeedIAS: number;         // Vr (Rotate pitch-up speed)
  takeoffSafetySpeedIAS: number;    // V2 (Initial climb safety speed)
  typicalApproachSpeedIAS: number;  // Vref (Final approach reference speed)
  landingRollDecelRateKts_s: number;// Wheel braking & thrust reverser deceleration (kts/sec)
  // Acceleration & Vertical Performance
  takeoffAccelerationKts_s: number; // Full takeoff thrust acceleration on ground
  initialClimbRateFpm: number;      // Climb rate off runway up to 1,500 ft AGL
  maxClimbRateFpm: number;          // Maximum continuous climb rate
  normalDescentRateFpm: number;     // Standard descent rate
  maxBankAngleDeg: number;          // Normal flight control bank limit
  // Touchdown Limits
  touchdownMaxSinkRateFpm: number;  // Maximum allowable descent rate at touchdown (-600 fpm)
  touchdownNominalSinkRateFpm: number; // Normal flare touchdown rate (-180 fpm)
  // Operational Classification & Educational Simulation Scope
  dataSource: 'Manufacturer FCOM / ICAO Doc 8643' | 'Educational Simulation Approximate';
  notes?: string;
}

export const AIRCRAFT_PERFORMANCE_DATABASE: Record<string, AircraftPerformance> = {
  A320: {
    aircraftType: 'A320',
    category: 'Large',
    name: 'Airbus A320-200',
    maxTakeoffMassKg: 78000,
    typicalLandingMassKg: 64000,
    takeoffDecisionSpeedIAS: 138,
    rotationSpeedIAS: 145,
    takeoffSafetySpeedIAS: 154,
    typicalApproachSpeedIAS: 142,
    landingRollDecelRateKts_s: 18.0,
    takeoffAccelerationKts_s: 3.2,
    initialClimbRateFpm: 2400,
    maxClimbRateFpm: 3200,
    normalDescentRateFpm: 1500,
    maxBankAngleDeg: 25.0,
    touchdownMaxSinkRateFpm: -600,
    touchdownNominalSinkRateFpm: -180,
    dataSource: 'Manufacturer FCOM / ICAO Doc 8643',
    notes: 'Reference values modeled at sea level, standard ISA day at typical MTOM/MLW',
  },
  A321: {
    aircraftType: 'A321',
    category: 'Large',
    name: 'Airbus A321neo',
    maxTakeoffMassKg: 97000,
    typicalLandingMassKg: 77000,
    takeoffDecisionSpeedIAS: 142,
    rotationSpeedIAS: 148,
    takeoffSafetySpeedIAS: 158,
    typicalApproachSpeedIAS: 145,
    landingRollDecelRateKts_s: 17.5,
    takeoffAccelerationKts_s: 3.0,
    initialClimbRateFpm: 2300,
    maxClimbRateFpm: 3000,
    normalDescentRateFpm: 1500,
    maxBankAngleDeg: 25.0,
    touchdownMaxSinkRateFpm: -600,
    touchdownNominalSinkRateFpm: -180,
    dataSource: 'Manufacturer FCOM / ICAO Doc 8643',
    notes: 'Higher gross mass than A320, lower specific thrust acceleration',
  },
  A350: {
    aircraftType: 'A350',
    category: 'Heavy',
    name: 'Airbus A350-900',
    maxTakeoffMassKg: 280000,
    typicalLandingMassKg: 205000,
    takeoffDecisionSpeedIAS: 150,
    rotationSpeedIAS: 158,
    takeoffSafetySpeedIAS: 168,
    typicalApproachSpeedIAS: 148,
    landingRollDecelRateKts_s: 16.5,
    takeoffAccelerationKts_s: 2.7,
    initialClimbRateFpm: 2500,
    maxClimbRateFpm: 3400,
    normalDescentRateFpm: 1600,
    maxBankAngleDeg: 25.0,
    touchdownMaxSinkRateFpm: -600,
    touchdownNominalSinkRateFpm: -170,
    dataSource: 'Manufacturer FCOM / ICAO Doc 8643',
    notes: 'Trent XWB widebody high efficiency twin-jet climb profile',
  },
  B77W: {
    aircraftType: 'B77W',
    category: 'Heavy',
    name: 'Boeing 777-300ER',
    maxTakeoffMassKg: 351534,
    typicalLandingMassKg: 251290,
    takeoffDecisionSpeedIAS: 158,
    rotationSpeedIAS: 165,
    takeoffSafetySpeedIAS: 175,
    typicalApproachSpeedIAS: 155,
    landingRollDecelRateKts_s: 16.0,
    takeoffAccelerationKts_s: 2.6,
    initialClimbRateFpm: 2400,
    maxClimbRateFpm: 3200,
    normalDescentRateFpm: 1600,
    maxBankAngleDeg: 25.0,
    touchdownMaxSinkRateFpm: -600,
    touchdownNominalSinkRateFpm: -160,
    dataSource: 'Manufacturer FCOM / ICAO Doc 8643',
    notes: 'GE90-115B high gross mass long-range profile',
  },
  B789: {
    aircraftType: 'B789',
    category: 'Heavy',
    name: 'Boeing 787-9 Dreamliner',
    maxTakeoffMassKg: 254000,
    typicalLandingMassKg: 192000,
    takeoffDecisionSpeedIAS: 148,
    rotationSpeedIAS: 154,
    takeoffSafetySpeedIAS: 164,
    typicalApproachSpeedIAS: 146,
    landingRollDecelRateKts_s: 17.0,
    takeoffAccelerationKts_s: 2.8,
    initialClimbRateFpm: 2600,
    maxClimbRateFpm: 3500,
    normalDescentRateFpm: 1600,
    maxBankAngleDeg: 25.0,
    touchdownMaxSinkRateFpm: -600,
    touchdownNominalSinkRateFpm: -170,
    dataSource: 'Manufacturer FCOM / ICAO Doc 8643',
    notes: 'GEnx/Trent 1000 composite airframe high climb performance',
  },
  A380: {
    aircraftType: 'A380',
    category: 'Heavy',
    name: 'Airbus A380-800 Super',
    maxTakeoffMassKg: 575000,
    typicalLandingMassKg: 394000,
    takeoffDecisionSpeedIAS: 152,
    rotationSpeedIAS: 160,
    takeoffSafetySpeedIAS: 172,
    typicalApproachSpeedIAS: 152,
    landingRollDecelRateKts_s: 15.0,
    takeoffAccelerationKts_s: 2.4,
    initialClimbRateFpm: 2200,
    maxClimbRateFpm: 2800,
    normalDescentRateFpm: 1500,
    maxBankAngleDeg: 25.0,
    touchdownMaxSinkRateFpm: -600,
    touchdownNominalSinkRateFpm: -160,
    dataSource: 'Manufacturer FCOM / ICAO Doc 8643',
    notes: 'Very large commercial transport; wake category Super per FAA/ICAO',
  },
  B738: {
    aircraftType: 'B738',
    category: 'Large',
    name: 'Boeing 737-800',
    maxTakeoffMassKg: 79000,
    typicalLandingMassKg: 65000,
    takeoffDecisionSpeedIAS: 140,
    rotationSpeedIAS: 146,
    takeoffSafetySpeedIAS: 155,
    typicalApproachSpeedIAS: 142,
    landingRollDecelRateKts_s: 18.0,
    takeoffAccelerationKts_s: 3.1,
    initialClimbRateFpm: 2400,
    maxClimbRateFpm: 3200,
    normalDescentRateFpm: 1500,
    maxBankAngleDeg: 25.0,
    touchdownMaxSinkRateFpm: -600,
    touchdownNominalSinkRateFpm: -180,
    dataSource: 'Manufacturer FCOM / ICAO Doc 8643',
    notes: 'CFM56-7B narrowbody short-to-medium haul profile',
  },
};

/** Default fallback performance profile */
const DEFAULT_PERFORMANCE: AircraftPerformance = AIRCRAFT_PERFORMANCE_DATABASE.A320;

/**
 * Retrieves performance specifications for an aircraft type
 */
export function getAircraftPerformance(aircraftType: string): AircraftPerformance {
  const normalized = aircraftType.toUpperCase().trim();
  return AIRCRAFT_PERFORMANCE_DATABASE[normalized] || DEFAULT_PERFORMANCE;
}
