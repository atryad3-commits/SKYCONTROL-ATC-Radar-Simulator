/**
 * SKYCONTROL - Staged Takeoff & Departure Simulation Engine
 * Replaces instant takeoff with physically realistic staged departures:
 * 1. HOLD_SHORT: Holding short of active departure runway
 * 2. LINEUP / WAITING_FOR_CLEARANCE: Positioned at threshold on runway heading
 * 3. TAKEOFF_ROLL: Ground acceleration under full takeoff thrust (V0 -> V1 -> Vr)
 * 4. ROTATION: Pitch-up rotation initiated at Vr
 * 5. LIFTOFF: Main gear unglues at V2, vertical speed initiates
 * 6. INITIAL_CLIMB: Climb along runway heading up to 1,500 ft AGL
 * 7. DEPARTURE_NAVIGATION: Acceleration to 220-250 kt and departure navigation
 */

import { Aircraft } from '../types';
import { RunwayGeometry, isInsideRunwayBoundaries } from './runwayGeometry';
import { getAircraftPerformance, AircraftPerformance } from './aircraftPerformance';
import { RunwayOccupancyManager } from './runwayOccupancy';
import { FlightPhase } from './flightPhases';

export type TakeoffPhase =
  | 'PARKED'
  | 'TAXIING'
  | 'HOLD_SHORT'
  | 'LINEUP'
  | 'WAITING_FOR_CLEARANCE'
  | 'TAKEOFF_ROLL'
  | 'ROTATION'
  | 'LIFTOFF'
  | 'INITIAL_CLIMB'
  | 'DEPARTURE_NAVIGATION'
  | 'AIRBORNE'
  | 'REJECTED_TAKEOFF'
  | 'RTO_STOPPED';

export interface TakeoffStepResult {
  aircraft: Aircraft;
  eventMessage?: string;
  eventType?: 'LINEUP' | 'TAKEOFF_ROLL' | 'V1' | 'ROTATION' | 'LIFTOFF' | 'V2' | 'INITIAL_CLIMB' | 'DEPARTURE_ESTABLISHED' | 'REJECTED_TAKEOFF' | 'RTO_STOPPED';
  phaseChanged: boolean;
}

/**
 * Validates and positions an aircraft to Line Up and Wait on a runway
 */
export function lineUpAircraft(
  ac: Aircraft,
  runway: RunwayGeometry,
  occupancyManager?: RunwayOccupancyManager,
  simTimeSec: number = 0
): { success: boolean; aircraft: Aircraft; reason?: string } {
  if (occupancyManager) {
    const check = occupancyManager.canClearForTakeoff(runway.id, ac.id);
    if (!check.allowed) {
      return { success: false, aircraft: ac, reason: check.reason };
    }
  }

  // Position at runway threshold facing down the runway
  const rwyRad = (runway.magneticHeading * Math.PI) / 180;
  const lineupX = runway.threshold.x + 0.05 * Math.sin(rwyRad);
  const lineupY = runway.threshold.y + 0.05 * Math.cos(rwyRad);

  if (occupancyManager) {
    occupancyManager.occupyRunway(runway.id, ac.id, ac.callsign, 'Lineup', simTimeSec);
  }

  const updated: Aircraft = {
    ...ac,
    status: 'Departing',
    x: lineupX,
    y: lineupY,
    heading: runway.magneticHeading,
    targetHeading: runway.magneticHeading,
    altitude: runway.elevationFeet,
    targetAltitude: runway.elevationFeet,
    indicatedAirspeed: 0,
    targetAirspeed: 0,
    groundSpeed: 0,
    verticalSpeed: 0,
    assignedRunway: runway.id,
  };

  return { success: true, aircraft: updated };
}

/**
 * Issues Takeoff Clearance after validating runway occupancy
 */
export function issueTakeoffClearance(
  ac: Aircraft,
  runway: RunwayGeometry,
  occupancyManager?: RunwayOccupancyManager,
  simTimeSec: number = 0
): { success: boolean; aircraft: Aircraft; reason?: string } {
  if (occupancyManager) {
    const check = occupancyManager.canClearForTakeoff(runway.id, ac.id);
    if (!check.allowed) {
      return { success: false, aircraft: ac, reason: check.reason };
    }
    occupancyManager.occupyRunway(runway.id, ac.id, ac.callsign, 'Takeoff', simTimeSec);
  }

  const perf = getAircraftPerformance(ac.aircraftType);

  const updated: Aircraft = {
    ...ac,
    status: 'Departing',
    targetAltitude: Math.max(ac.targetAltitude, 6000), // Cleared initial altitude
    targetAirspeed: 210, // Initial climb airspeed
    heading: runway.magneticHeading,
    targetHeading: runway.magneticHeading,
  };

  return { success: true, aircraft: updated };
}

/**
 * Evaluates and executes a Rejected Takeoff (RTO).
 * In aviation regulations (FAA / EASA), an RTO may ONLY be safely executed BEFORE reaching V1.
 * Once V1 (takeoff decision speed) has been reached or exceeded, the takeoff MUST continue.
 */
export function rejectTakeoff(
  ac: Aircraft,
  _reason: string = 'Engine anomaly',
  groundElevationFt: number = 83
): { success: boolean; aircraft: Aircraft; reason?: string } {
  const perf = getAircraftPerformance(ac.aircraftType);

  if (ac.altitude > groundElevationFt + 15) {
    return { success: false, aircraft: ac, reason: 'Aircraft is already airborne; RTO impossible' };
  }

  // Check V1 restriction
  if (ac.indicatedAirspeed >= perf.takeoffDecisionSpeedIAS) {
    return {
      success: false,
      aircraft: ac,
      reason: `Speed ${Math.round(ac.indicatedAirspeed)}kt >= V1 (${perf.takeoffDecisionSpeedIAS}kt). RTO prohibited; commit to takeoff.`,
    };
  }

  const updated: Aircraft = {
    ...ac,
    flightPhase: 'REJECTED_TAKEOFF',
    targetAirspeed: 0,
    targetAltitude: ac.altitude,
  };

  return { success: true, aircraft: updated };
}

/**
 * Advances the staged takeoff dynamics for an active departure aircraft
 */
export function stepTakeoffSequence(
  ac: Aircraft,
  runway: RunwayGeometry,
  dt: number,
  occupancyManager?: RunwayOccupancyManager,
  simTimeSec: number = 0
): TakeoffStepResult {
  const perf = getAircraftPerformance(ac.aircraftType);
  const elevation = runway.elevationFeet;
  const aglAltitude = ac.altitude - elevation;

  let indicatedAirspeed = ac.indicatedAirspeed;
  let altitude = ac.altitude;
  let verticalSpeed = ac.verticalSpeed || 0;
  let currentStatus = ac.status;
  let currentFlightPhase = ac.flightPhase || 'TAKEOFF_ROLL';
  let x = ac.x;
  let y = ac.y;
  let eventMessage: string | undefined;
  let eventType: TakeoffStepResult['eventType'];
  let phaseChanged = false;

  const rwyRad = (runway.magneticHeading * Math.PI) / 180;

  // 0. REJECTED TAKEOFF ROLL (Emergency deceleration on runway)
  if (currentFlightPhase === 'REJECTED_TAKEOFF') {
    const rtoDecelRate = 18.0; // Max emergency braking (18 kt/s)
    indicatedAirspeed = Math.max(0, indicatedAirspeed - rtoDecelRate * dt);
    const groundDistNM = (indicatedAirspeed * dt) / 3600;
    x += groundDistNM * Math.sin(rwyRad);
    y += groundDistNM * Math.cos(rwyRad);
    verticalSpeed = 0;
    altitude = elevation;

    if (indicatedAirspeed <= 0.1) {
      indicatedAirspeed = 0;
      currentFlightPhase = 'RTO_STOPPED';
      eventType = 'RTO_STOPPED';
      eventMessage = `${ac.callsign} stopped on runway following rejected takeoff`;
      phaseChanged = true;
    } else {
      eventType = 'REJECTED_TAKEOFF';
    }
  }
  // 1. TAKEOFF ROLL (Ground acceleration from 0 to Vr)
  else if (aglAltitude <= 5 && indicatedAirspeed < perf.rotationSpeedIAS) {
    const prevSpeed = indicatedAirspeed;
    // Accelerate along runway centerline under full takeoff thrust
    indicatedAirspeed = Math.min(perf.rotationSpeedIAS, indicatedAirspeed + perf.takeoffAccelerationKts_s * dt);
    const groundDistNM = (indicatedAirspeed * dt) / 3600;
    x += groundDistNM * Math.sin(rwyRad);
    y += groundDistNM * Math.cos(rwyRad);
    verticalSpeed = 0;
    altitude = elevation;
    currentFlightPhase = 'TAKEOFF_ROLL';

    // V1 Callout Check
    if (prevSpeed < perf.takeoffDecisionSpeedIAS && indicatedAirspeed >= perf.takeoffDecisionSpeedIAS) {
      eventType = 'V1';
      eventMessage = `${ac.callsign} V1 decision speed (${perf.takeoffDecisionSpeedIAS}kt)`;
      phaseChanged = true;
    } else if (indicatedAirspeed >= perf.rotationSpeedIAS) {
      eventType = 'ROTATION';
      eventMessage = `${ac.callsign} rotate (Vr ${perf.rotationSpeedIAS}kt)`;
      currentFlightPhase = 'ROTATION';
      phaseChanged = true;
    }
  }
  // 2. ROTATION & LIFTOFF (from Vr to V2, beginning pitch-up and climb)
  else if (aglAltitude <= 30 && indicatedAirspeed >= perf.rotationSpeedIAS && indicatedAirspeed < perf.takeoffSafetySpeedIAS + 10) {
    const prevSpeed = indicatedAirspeed;
    indicatedAirspeed += (perf.takeoffAccelerationKts_s * 0.8) * dt;
    const groundDistNM = (indicatedAirspeed * dt) / 3600;
    x += groundDistNM * Math.sin(rwyRad);
    y += groundDistNM * Math.cos(rwyRad);

    // Initial rotation lift rate
    verticalSpeed = Math.min(perf.initialClimbRateFpm, verticalSpeed + 800 * dt);
    altitude += (verticalSpeed / 60) * dt;

    if (prevSpeed < perf.takeoffSafetySpeedIAS && indicatedAirspeed >= perf.takeoffSafetySpeedIAS) {
      eventType = 'V2';
      eventMessage = `${ac.callsign} V2 achieved (${perf.takeoffSafetySpeedIAS}kt)`;
      phaseChanged = true;
    } else if (aglAltitude > 10 && currentFlightPhase !== 'LIFTOFF') {
      eventType = 'LIFTOFF';
      eventMessage = `${ac.callsign} airborne runway ${runway.id}`;
      currentFlightPhase = 'LIFTOFF';
      phaseChanged = true;
    }
  }
  // 3. INITIAL CLIMB (Climbing to 1,500 ft AGL along runway heading)
  else if (aglAltitude > 30 && aglAltitude < 1500) {
    verticalSpeed = perf.initialClimbRateFpm;
    altitude = Math.min(ac.targetAltitude, altitude + (verticalSpeed / 60) * dt);
    currentFlightPhase = 'INITIAL_CLIMB';

    // Accelerate smoothly toward climb speed (210 kt)
    indicatedAirspeed = Math.min(ac.targetAirspeed, indicatedAirspeed + 1.8 * dt);

    const groundDistNM = (indicatedAirspeed * dt) / 3600;
    x += groundDistNM * Math.sin(rwyRad);
    y += groundDistNM * Math.cos(rwyRad);

    const newAgl = altitude - elevation;
    // Release runway occupancy once airborne past 500 ft AGL
    if (newAgl >= 500 && occupancyManager) {
      occupancyManager.releaseRunway(runway.id, ac.id);
    }
  }
  // 4. DEPARTURE NAVIGATION (Above 1,500 ft AGL)
  else if (aglAltitude >= 1500) {
    currentStatus = 'Outbound';
    currentFlightPhase = 'ENROUTE';
    // Fully airborne departure navigation
    verticalSpeed = perf.maxClimbRateFpm;
    altitude = Math.min(ac.targetAltitude, altitude + (verticalSpeed / 60) * dt);
    indicatedAirspeed = Math.min(ac.targetAirspeed, indicatedAirspeed + 2.0 * dt);

    const groundDistNM = (indicatedAirspeed * dt) / 3600;
    x += groundDistNM * Math.sin((ac.heading * Math.PI) / 180);
    y += groundDistNM * Math.cos((ac.heading * Math.PI) / 180);

    if (occupancyManager) {
      occupancyManager.releaseRunway(runway.id, ac.id);
    }
  }

  const updatedAircraft: Aircraft = {
    ...ac,
    x,
    y,
    status: currentStatus,
    flightPhase: currentFlightPhase,
    indicatedAirspeed: Math.round(indicatedAirspeed * 10) / 10,
    groundSpeed: Math.round(indicatedAirspeed * 10) / 10,
    altitude: Math.round(altitude),
    verticalSpeed,
  };

  return {
    aircraft: updatedAircraft,
    eventMessage,
    eventType,
    phaseChanged,
  };
}
