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

import { Aircraft, Waypoint } from '../types';
import { RunwayGeometry } from './runwayGeometry';
import { getAircraftPerformance } from './aircraftPerformance';
import { RunwayOccupancyManager } from './runwayOccupancy';
import { calculateDistance } from './physics';

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
  | 'EXIT_ROUTING'
  | 'HANDOFF_READY'
  | 'HANDED_OFF'
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

export interface DepartureGateStatus {
  aglFt: number;
  minClimbAglFt: number;
  minClimbAltFt: number;
  minClimbSpeedKt: number;
  climbAltMet: boolean;
  climbSpeedMet: boolean;
  isClimbGateMet: boolean;
  exitWaypointName: string | null;
  exitFixDistNM: number | null;
  isExitRouteActive: boolean;
  isHandoffReady: boolean;
}

export const EXIT_HANDOFF_RADIUS_NM = 3.0;

/**
 * Evaluates whether a departing aircraft has satisfied initial climb altitude & speed
 * gates to proceed onto its SID exit route and/or perform Center Handoff (Goodbye).
 */
export function evaluateDepartureGates(
  ac: Aircraft,
  groundElevationFt: number = 0,
  waypoints: Waypoint[] = []
): DepartureGateStatus {
  const perf = getAircraftPerformance(ac.aircraftType);
  const aglFt = Math.max(0, Math.round(ac.altitude - groundElevationFt));
  const minClimbAglFt = perf.aircraftClass === 'LIGHT_GA' ? 1000 : 1500;
  const fallbackMinAlt = Math.min(
    perf.serviceCeilingFt,
    Math.ceil(groundElevationFt / 500) * 500 + minClimbAglFt
  );
  const minClimbAltFt = ac.exitClimbMinAltitudeFt ?? fallbackMinAlt;
  const defaultMinSpeed =
    perf.aircraftClass === 'LIGHT_GA'
      ? Math.min(90, perf.cruiseAirspeedIAS)
      : perf.aircraftClass === 'REGIONAL_TURBOPROP'
      ? Math.min(150, perf.cruiseAirspeedIAS)
      : Math.min(185, perf.cruiseAirspeedIAS);
  const minClimbSpeedKt = ac.exitClimbMinSpeedKt ?? defaultMinSpeed;

  const climbAltMet = ac.altitude >= minClimbAltFt - 25 || aglFt >= minClimbAglFt;
  const climbSpeedMet = ac.indicatedAirspeed >= minClimbSpeedKt - 2;
  const isClimbGateMet = climbAltMet && climbSpeedMet;

  const exitWaypointName =
    ac.assignedExitWaypoint ||
    (ac.departureRouteWaypoints && ac.departureRouteWaypoints.length > 0
      ? ac.departureRouteWaypoints[ac.departureRouteWaypoints.length - 1]
      : null);

  let exitFixDistNM: number | null = null;
  if (exitWaypointName) {
    const wp = waypoints.find(w => w.name === exitWaypointName);
    if (wp) {
      exitFixDistNM =
        Math.round(calculateDistance(ac.x, ac.y, wp.position.x, wp.position.y) * 10) / 10;
    }
  }

  const isExitRouteActive =
    ac.flightPhase === 'EXIT_ROUTING' ||
    ac.flightPhase === 'HANDOFF_READY' ||
    Boolean(
      ac.assignedWaypoint &&
        ((ac.departureRouteWaypoints && ac.departureRouteWaypoints.includes(ac.assignedWaypoint)) ||
          ac.assignedWaypoint === exitWaypointName)
    );

  const isHandoffReady =
    ac.flightPhase === 'HANDOFF_READY' ||
    ((ac.status === 'Outbound' || ac.flightPhase === 'EXIT_ROUTING') &&
      isClimbGateMet &&
      exitFixDistNM !== null &&
      exitFixDistNM <= EXIT_HANDOFF_RADIUS_NM);

  return {
    aglFt,
    minClimbAglFt,
    minClimbAltFt,
    minClimbSpeedKt,
    climbAltMet,
    climbSpeedMet,
    isClimbGateMet,
    exitWaypointName,
    exitFixDistNM,
    isExitRouteActive,
    isHandoffReady,
  };
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
  const isGroundDeparture =
    !ac.flightPhase ||
    ac.flightPhase === 'HOLD_SHORT' ||
    ac.flightPhase === 'PARKED' ||
    ac.flightPhase === 'TAXI' ||
    ac.flightPhase === 'TAXIING' ||
    ac.flightPhase === 'LINEUP' ||
    ac.flightPhase === 'WAITING_FOR_CLEARANCE';
  if (ac.indicatedAirspeed > 5 || !isGroundDeparture || ac.status === 'Outbound') {
    return {
      success: false,
      aircraft: ac,
      reason: 'Aircraft is already rolling or airborne',
    };
  }

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
    flightPhase: 'LINEUP',
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
 * Issues Takeoff Clearance after validating runway occupancy and LINEUP stage
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
  }

  if (
    ac.flightPhase === 'HOLD_SHORT' ||
    ac.flightPhase === 'PARKED' ||
    ac.flightPhase === 'TAXI' ||
    ac.flightPhase === 'TAXIING'
  ) {
    return {
      success: false,
      aircraft: ac,
      reason: 'Aircraft is holding short; instruct Line Up and Wait first',
    };
  }

  if (occupancyManager) {
    occupancyManager.occupyRunway(runway.id, ac.id, ac.callsign, 'Takeoff', simTimeSec);
  }

  const perf = getAircraftPerformance(ac.aircraftType);
  const initialClimbTarget = Math.min(
    perf.serviceCeilingFt,
    Math.max(ac.targetAltitude, runway.elevationFeet + perf.initialDepartureClearanceAglFt)
  );
  const departureTargetIAS = Math.min(210, perf.cruiseAirspeedIAS);

  const updated: Aircraft = {
    ...ac,
    status: 'Departing',
    flightPhase: 'TAKEOFF_ROLL',
    targetAltitude: initialClimbTarget,
    targetAirspeed: departureTargetIAS,
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
  _simTimeSec: number = 0
): TakeoffStepResult {
  const perf = getAircraftPerformance(ac.aircraftType);
  const elevation = runway.elevationFeet;
  const aglAltitude = ac.altitude - elevation;
  const initialClimbTransitionAgl = perf.aircraftClass === 'LIGHT_GA' ? 1000 : 1500;

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

  // Ground waiting stages remain stationary until takeoff clearance is issued
  if (
    currentFlightPhase === 'HOLD_SHORT' ||
    currentFlightPhase === 'LINEUP' ||
    currentFlightPhase === 'WAITING_FOR_CLEARANCE' ||
    currentFlightPhase === 'PARKED' ||
    currentFlightPhase === 'TAXI' ||
    currentFlightPhase === 'TAXIING' ||
    currentFlightPhase === 'RTO_STOPPED'
  ) {
    return {
      aircraft: {
        ...ac,
        indicatedAirspeed: 0,
        groundSpeed: 0,
        verticalSpeed: 0,
        altitude: elevation,
      },
      phaseChanged: false,
    };
  }

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
    indicatedAirspeed = Math.min(
      perf.rotationSpeedIAS,
      indicatedAirspeed + perf.takeoffAccelerationKts_s * dt
    );
    const groundDistNM = (indicatedAirspeed * dt) / 3600;
    x += groundDistNM * Math.sin(rwyRad);
    y += groundDistNM * Math.cos(rwyRad);
    verticalSpeed = 0;
    altitude = elevation;
    currentFlightPhase = 'TAKEOFF_ROLL';

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
  // 2. ROTATION & LIFTOFF (from Vr to >35 ft AGL, pitch-up and climb without speed deadzone)
  else if (aglAltitude <= 35 && indicatedAirspeed >= perf.rotationSpeedIAS) {
    const prevSpeed = indicatedAirspeed;
    const maxRollIas = Math.max(perf.takeoffSafetySpeedIAS + 12, ac.targetAirspeed || 210);
    indicatedAirspeed = Math.min(
      maxRollIas,
      indicatedAirspeed + perf.takeoffAccelerationKts_s * 0.8 * dt
    );
    const groundDistNM = (indicatedAirspeed * dt) / 3600;
    x += groundDistNM * Math.sin(rwyRad);
    y += groundDistNM * Math.cos(rwyRad);

    verticalSpeed = Math.min(perf.initialClimbRateFpm, verticalSpeed + 800 * dt);
    altitude += (verticalSpeed / 60) * dt;

    if (prevSpeed < perf.takeoffSafetySpeedIAS && indicatedAirspeed >= perf.takeoffSafetySpeedIAS) {
      eventType = 'V2';
      eventMessage = `${ac.callsign} V2 achieved (${perf.takeoffSafetySpeedIAS}kt)`;
      phaseChanged = true;
    } else if (altitude - elevation > 10 && currentFlightPhase !== 'LIFTOFF') {
      eventType = 'LIFTOFF';
      eventMessage = `${ac.callsign} airborne runway ${runway.id}`;
      currentFlightPhase = 'LIFTOFF';
      phaseChanged = true;
    }
  }
  // 3. INITIAL CLIMB (Climbing straight ahead on runway heading up to initial climb transition AGL)
  else if (aglAltitude > 35 && aglAltitude < initialClimbTransitionAgl) {
    verticalSpeed = perf.initialClimbRateFpm;
    const effectiveTargetAlt = Math.max(ac.targetAltitude, elevation + initialClimbTransitionAgl);
    altitude = Math.min(effectiveTargetAlt, altitude + (verticalSpeed / 60) * dt);
    if (currentFlightPhase !== 'EXIT_ROUTING' && currentFlightPhase !== 'HANDOFF_READY') {
      currentFlightPhase = 'INITIAL_CLIMB';
    }

    const effectiveTargetIas = ac.targetAirspeed || Math.min(210, perf.cruiseAirspeedIAS);
    indicatedAirspeed = Math.min(
      effectiveTargetIas,
      indicatedAirspeed + Math.max(0.9, perf.accelRateKts_s) * dt
    );

    const groundDistNM = (indicatedAirspeed * dt) / 3600;
    x += groundDistNM * Math.sin(rwyRad);
    y += groundDistNM * Math.cos(rwyRad);

    const newAgl = altitude - elevation;
    if (newAgl >= 500 && occupancyManager) {
      occupancyManager.releaseRunway(runway.id, ac.id);
    }

    if (newAgl >= initialClimbTransitionAgl) {
      currentStatus = 'Outbound';
      if (currentFlightPhase !== 'EXIT_ROUTING' && currentFlightPhase !== 'HANDOFF_READY') {
        currentFlightPhase = ac.assignedWaypoint ? 'EXIT_ROUTING' : 'INITIAL_CLIMB';
      }
      phaseChanged = true;
    }
  }
  // 4. DEPARTURE OUTBOUND TRANSITION (Above initial climb transition AGL)
  else if (aglAltitude >= initialClimbTransitionAgl) {
    currentStatus = 'Outbound';
    if (currentFlightPhase !== 'EXIT_ROUTING' && currentFlightPhase !== 'HANDOFF_READY') {
      currentFlightPhase = ac.assignedWaypoint ? 'EXIT_ROUTING' : 'INITIAL_CLIMB';
    }
    verticalSpeed = perf.maxClimbRateFpm;
    altitude = Math.min(
      Math.max(ac.targetAltitude, altitude),
      perf.serviceCeilingFt,
      altitude + (verticalSpeed / 60) * dt
    );
    indicatedAirspeed = Math.min(
      ac.targetAirspeed || perf.cruiseAirspeedIAS,
      perf.maxAirspeedIAS,
      indicatedAirspeed + perf.accelRateKts_s * dt
    );

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
