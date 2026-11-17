/**
 * SKYCONTROL - Deterministic Aircraft Physics & Movement Engine
 * Aerospace-grade flight mechanics:
 * - IAS to TAS conversion based on standard atmosphere density ratio
 * - Coordinated turn physics & bank angle limits (max 25° for civil transport)
 * - Speed-dependent turn rate degradation
 * - True ground velocity vector calculation with wind & gusts
 * - Deterministic PRNG and simulation-time decoupling
 * - Fully immutable updates (zero direct object mutations)
 */

import { Aircraft, WeatherCondition, Waypoint } from '../types';
import { getAircraftPerformance } from './aircraftPerformance';

/** Standard gravitational acceleration in ft/s² */
export const GRAVITY_FT_S2 = 32.174;
/** Knots to feet per second conversion factor */
export const KNOTS_TO_FPS = 1.68781;
/** Standard rate of turn (Rate 1): 3.0 deg/sec = 180° in 1 minute */
export const STANDARD_RATE_TURN_DEG_S = 3.0;
/** Default maximum civil transport bank angle in degrees */
export const DEFAULT_MAX_BANK_ANGLE_DEG = 25.0;

/**
 * Normalizes any angle to [0, 360) degrees
 */
export function normalizeHeading(deg: number): number {
  let h = deg % 360;
  if (h < 0) h += 360;
  // Handle edge case of negative zero
  return h === 0 ? 0 : h;
}

/**
 * Calculates shortest turn direction and angular difference between two headings
 * Returns delta in range [-180, 180] degrees (positive = turn right, negative = turn left)
 */
export function getHeadingDelta(current: number, target: number): number {
  return ((target - current + 540) % 360) - 180;
}

/**
 * Computes bearing (0-359°) from position A to position B in nautical miles coordinates
 */
export function calculateBearing(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const rad = Math.atan2(dx, dy); // 0° is North (+Y), 90° is East (+X)
  const deg = (rad * 180) / Math.PI;
  return normalizeHeading(deg);
}

/**
 * Computes 2D distance in nautical miles between two points
 */
export function calculateDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates True Airspeed (TAS) from Indicated Airspeed (IAS) and altitude
 * using the International Standard Atmosphere (ISA) troposphere density ratio formula:
 * densityRatio = (1 - 6.8756e-6 * h)^4.2561
 * TAS = IAS / sqrt(densityRatio)
 */
export function calculateTASFromIAS(iasKnots: number, altitudeFeet: number): number {
  const h = Math.max(0, altitudeFeet);
  // Troposphere model valid up to 36,089 ft (well above TMA operations)
  const base = Math.max(0.1, 1.0 - 6.8756e-6 * h);
  const densityRatio = Math.pow(base, 4.2561);
  const tas = iasKnots / Math.sqrt(densityRatio);
  return Math.round(tas * 10) / 10;
}

/**
 * Calculates aerodynamic turn rate (deg/s) and coordinated bank angle (deg).
 * For a coordinated level turn:
 *   tan(phi) = (V * omega) / g
 * Standard rate turn omega_std = 3 deg/s.
 * If tan(phi_std) exceeds tan(maxBankAngle), turn rate is constrained by bank angle:
 *   omega_max = g * tan(phi_max) / V
 */
export function calculateTurnRateAndBankAngle(
  tasKnots: number,
  currentHeading: number,
  targetHeading: number,
  maxBankDeg: number = DEFAULT_MAX_BANK_ANGLE_DEG
): {
  turnRateDegS: number;
  bankAngleDeg: number;
  turnDirection: number; // -1 for left, +1 for right, 0 for wings level
} {
  const headingDelta = getHeadingDelta(currentHeading, targetHeading);
  if (Math.abs(headingDelta) <= 0.05) {
    return { turnRateDegS: 0, bankAngleDeg: 0, turnDirection: 0 };
  }

  const turnDirection = Math.sign(headingDelta);
  const vFps = Math.max(50, tasKnots * KNOTS_TO_FPS);

  // Maximum turn rate allowed by structural / comfort bank angle limit:
  const maxBankRad = (maxBankDeg * Math.PI) / 180;
  const maxTurnRateRadS = (GRAVITY_FT_S2 * Math.tan(maxBankRad)) / vFps;
  const maxTurnRateDegS = (maxTurnRateRadS * 180) / Math.PI;

  // Actual turn rate is the minimum of standard rate (3°/s) and bank-limited rate
  const turnRateDegS = Math.min(STANDARD_RATE_TURN_DEG_S, maxTurnRateDegS);

  // Coordinated bank angle for this actual turn rate:
  const actualOmegaRadS = (turnRateDegS * Math.PI) / 180;
  const tanPhi = (vFps * actualOmegaRadS) / GRAVITY_FT_S2;
  const bankAngleMagnitude = (Math.atan(tanPhi) * 180) / Math.PI;
  const bankAngleDeg = Math.round(bankAngleMagnitude * turnDirection * 10) / 10;

  return {
    turnRateDegS: turnRateDegS * turnDirection,
    bankAngleDeg,
    turnDirection,
  };
}

/**
 * Computes instantaneous wind vector including gusts.
 * windDirection is the direction wind is coming FROM (meteorological convention).
 * Vector points towards the direction wind is blowing.
 */
export function calculateWindVector(
  weather: WeatherCondition,
  simTimeSec: number = 0
): {
  instantaneousSpeed: number;
  windX: number; // Eastward component in knots
  windY: number; // Northward component in knots
} {
  let windSpeed = weather.windSpeed;

  // Configurable gust effect: deterministic periodic variation
  if (weather.gusts && weather.gusts > weather.windSpeed) {
    const gustRange = weather.gusts - weather.windSpeed;
    // Primary gust cycle (~7.5s) combined with secondary harmonic (~3.2s)
    const gustWave =
      Math.sin(simTimeSec * 0.83) * 0.7 +
      Math.sin(simTimeSec * 1.95) * 0.3;
    const gustFactor = Math.max(0, gustWave);
    windSpeed += gustRange * gustFactor;
  }

  // Wind blows towards opposite of direction FROM
  const windFromRad = (weather.windDirection * Math.PI) / 180;
  const windX = -windSpeed * Math.sin(windFromRad);
  const windY = -windSpeed * Math.cos(windFromRad);

  return {
    instantaneousSpeed: Math.round(windSpeed * 10) / 10,
    windX,
    windY,
  };
}

/**
 * Computes ground speed, ground track, and 2D ground velocity components
 * using vector addition: Ground Velocity = True Airspeed Vector + Wind Vector
 */
export function calculateGroundVector(
  tasKnots: number,
  headingDeg: number,
  windX: number,
  windY: number
): {
  groundSpeed: number;
  groundTrack: number;
  groundVelocityX: number; // knots
  groundVelocityY: number; // knots
} {
  const headingRad = (headingDeg * Math.PI) / 180;
  // Aircraft velocity vector relative to air mass:
  const tasX = tasKnots * Math.sin(headingRad);
  const tasY = tasKnots * Math.cos(headingRad);

  // Ground velocity vector:
  const gvx = tasX + windX;
  const gvy = tasY + windY;

  const groundSpeed = Math.sqrt(gvx * gvx + gvy * gvy);
  const groundTrack = normalizeHeading((Math.atan2(gvx, gvy) * 180) / Math.PI);

  return {
    groundSpeed: Math.round(groundSpeed * 10) / 10,
    groundTrack: Math.round(groundTrack * 10) / 10,
    groundVelocityX: gvx,
    groundVelocityY: gvy,
  };
}

/**
 * Pure deterministic physics step for an aircraft over timestep dt (seconds).
 * Does NOT mutate the input aircraft object.
 */
export function stepAircraftPhysics(
  ac: Aircraft,
  dt: number,
  weather: WeatherCondition,
  waypoints: Waypoint[],
  simTimeSec: number = 0,
  groundElevationFt: number = 83
): Aircraft {
  const perf = getAircraftPerformance(ac.aircraftType);

  // If landed, smoothly decelerate on the runway heading
  if (ac.status === 'Landed') {
    const decelRate = perf.landingRollDecelRateKts_s || 18.0; // kts/sec on runway roll
    const newSpeed = Math.max(0, ac.indicatedAirspeed - decelRate * dt);
    const rwyHeadingRad = (ac.heading * Math.PI) / 180;
    const distNM = (newSpeed * dt) / 3600;
    const nx = ac.x + distNM * Math.sin(rwyHeadingRad);
    const ny = ac.y + distNM * Math.cos(rwyHeadingRad);

    return {
      ...ac,
      x: nx,
      y: ny,
      indicatedAirspeed: Math.round(newSpeed * 10) / 10,
      trueAirspeed: Math.round(newSpeed * 10) / 10,
      groundSpeed: Math.round(newSpeed * 10) / 10,
      groundTrack: ac.heading,
      groundVelocityX: newSpeed * Math.sin(rwyHeadingRad),
      groundVelocityY: newSpeed * Math.cos(rwyHeadingRad),
      verticalSpeed: 0,
      bankAngle: 0,
      turnRate: 0,
      altitude: groundElevationFt,
    };
  }

  let targetHeading = ac.targetHeading;
  let targetAltitude = ac.targetAltitude;
  let targetAirspeed = ac.targetAirspeed;
  let currentStatus = ac.status;
  let currentFlightPhase = ac.flightPhase;
  let assignedWaypoint = ac.assignedWaypoint;
  let routeQueue = ac.routeQueue ? [...ac.routeQueue] : [];
  let ilsArmed = ac.ilsArmed;
  let autoInterceptILS = ac.autoInterceptILS;
  let holdingLeg = ac.holdingLeg;
  let holdingTimer = ac.holdingTimer;

  const isDepartureAircraft = currentStatus === 'Departing' || currentStatus === 'Outbound';

  // 1. Waypoint & Multi-Leg Route Sequencing (Direct-To -> routeQueue -> Optional Auto-ILS or Exit Gate)
  if (assignedWaypoint) {
    const wp = waypoints.find(w => w.name === assignedWaypoint);
    if (wp) {
      const distToWp = calculateDistance(ac.x, ac.y, wp.position.x, wp.position.y);
      const isFinalExitFix =
        isDepartureAircraft &&
        routeQueue.length === 0 &&
        wp.name === ac.assignedExitWaypoint;
      const captureRadius = isFinalExitFix ? 3.0 : 1.1;

      if (distToWp <= captureRadius) {
        // Waypoint reached
        if (wp.isHoldingFix && currentStatus === 'Holding') {
          // Keep holding logic active
        } else if (routeQueue.length > 0) {
          // Automatically sequence to next waypoint in route queue
          const nextWpName = routeQueue.shift() || null;
          assignedWaypoint = nextWpName;
          const nextWp = nextWpName ? waypoints.find(w => w.name === nextWpName) : undefined;
          if (nextWp) {
            targetHeading = calculateBearing(ac.x, ac.y, nextWp.position.x, nextWp.position.y);
          }
        } else {
          assignedWaypoint = null;
          if (isFinalExitFix) {
            // Maintain current outbound radial cleanly while awaiting Center Handoff (Goodbye)
            targetHeading = ac.heading;
          } else if (autoInterceptILS && !isDepartureAircraft) {
            ilsArmed = true;
            autoInterceptILS = false;
            currentStatus = 'LocalizerIntercept';
          }
        }
      } else {
        targetHeading = calculateBearing(ac.x, ac.y, wp.position.x, wp.position.y);
      }
    }
  }

  // 2. Holding Pattern Navigation
  if (currentStatus === 'Holding' && ac.holdingWaypoint) {
    const fix = waypoints.find(w => w.name === ac.holdingWaypoint);
    if (fix) {
      const distToFix = calculateDistance(ac.x, ac.y, fix.position.x, fix.position.y);
      const inboundHdg = ac.holdingInboundHeading;
      const outboundHdg = normalizeHeading(inboundHdg + 180);

      let nextLeg = holdingLeg;
      let nextTimer = holdingTimer + dt;

      if (holdingLeg === 'Inbound') {
        targetHeading = calculateBearing(ac.x, ac.y, fix.position.x, fix.position.y);
        if (distToFix < 0.9) {
          nextLeg = 'TurnOut';
          nextTimer = 0;
          targetHeading = outboundHdg;
        }
      } else if (holdingLeg === 'TurnOut') {
        targetHeading = outboundHdg;
        const diff = Math.abs(getHeadingDelta(ac.heading, outboundHdg));
        if (diff < 3.0 || nextTimer >= 65) {
          nextLeg = 'Outbound';
          nextTimer = 0;
        }
      } else if (holdingLeg === 'Outbound') {
        targetHeading = outboundHdg;
        if (nextTimer >= (ac.holdingLegTime || 60)) {
          nextLeg = 'TurnIn';
          nextTimer = 0;
          targetHeading = inboundHdg;
        }
      } else if (holdingLeg === 'TurnIn') {
        targetHeading = calculateBearing(ac.x, ac.y, fix.position.x, fix.position.y);
        const diff = Math.abs(getHeadingDelta(ac.heading, inboundHdg));
        if (diff < 4.0 || nextTimer >= 65) {
          nextLeg = 'Inbound';
          nextTimer = 0;
        }
      }

      holdingLeg = nextLeg;
      holdingTimer = nextTimer;
    }
  }

  // 3. Airspeed Integration (IAS) constrained by aircraft performance envelope
  const accelRate = perf.accelRateKts_s || 2.0; // kts/s
  const decelRate = perf.decelRateKts_s || 2.5; // kts/s
  const cappedTargetAirspeed = Math.min(targetAirspeed, perf.maxAirspeedIAS);
  let newIAS = ac.indicatedAirspeed;
  const speedDiff = cappedTargetAirspeed - ac.indicatedAirspeed;

  if (Math.abs(speedDiff) > 0.2) {
    if (speedDiff > 0) {
      newIAS = Math.min(cappedTargetAirspeed, ac.indicatedAirspeed + accelRate * dt);
    } else {
      newIAS = Math.max(cappedTargetAirspeed, ac.indicatedAirspeed - decelRate * dt);
    }
  }

  // 4. Altitude & Vertical Speed Integration scaled to model capability
  const normalClimb = Math.max(450, Math.round(perf.initialClimbRateFpm * 0.85));
  const climbRate = ac.expediteAltitude ? perf.maxClimbRateFpm : normalClimb; // fpm
  const descentRate = ac.expediteAltitude
    ? Math.round(perf.normalDescentRateFpm * 1.65)
    : perf.normalDescentRateFpm; // fpm
  const ceilingCappedTargetAlt = Math.min(targetAltitude, perf.serviceCeilingFt);
  let newAltitude = ac.altitude;
  let verticalSpeed = 0;
  const altDiff = ceilingCappedTargetAlt - ac.altitude;

  if (Math.abs(altDiff) > 5) {
    if (altDiff > 0) {
      verticalSpeed = climbRate;
      newAltitude = Math.min(ceilingCappedTargetAlt, ac.altitude + (verticalSpeed / 60) * dt);
    } else {
      verticalSpeed = -descentRate;
      newAltitude = Math.max(ceilingCappedTargetAlt, ac.altitude + (verticalSpeed / 60) * dt);
    }
  } else {
    newAltitude = ceilingCappedTargetAlt;
    verticalSpeed = 0;
  }

  // 5. True Airspeed Calculation
  const tasKnots = calculateTASFromIAS(newIAS, newAltitude);

  // 6. Turn Rate, Bank Angle & Heading Integration
  const maxBank = ac.maxBankAngle || perf.maxBankAngleDeg || DEFAULT_MAX_BANK_ANGLE_DEG;
  const { turnRateDegS, bankAngleDeg } = calculateTurnRateAndBankAngle(
    tasKnots,
    ac.heading,
    targetHeading,
    maxBank
  );

  let newHeading = ac.heading;
  const headingDiff = getHeadingDelta(ac.heading, targetHeading);

  if (Math.abs(headingDiff) > 0.05) {
    const stepMagnitude = Math.abs(turnRateDegS) * dt;
    if (Math.abs(headingDiff) <= stepMagnitude) {
      newHeading = targetHeading;
    } else {
      const turnSign = Math.sign(headingDiff);
      newHeading = normalizeHeading(ac.heading + turnSign * stepMagnitude);
    }
  } else {
    newHeading = targetHeading;
  }

  // 7. Wind & Ground Velocity Vector Integration
  const wind = calculateWindVector(weather, simTimeSec);
  const ground = calculateGroundVector(tasKnots, newHeading, wind.windX, wind.windY);

  // 8. Position Integration in Nautical Miles
  const dx = (ground.groundVelocityX * dt) / 3600;
  const dy = (ground.groundVelocityY * dt) / 3600;
  const newX = ac.x + dx;
  const newY = ac.y + dy;

  // 8b. Departure Exit Gate & Handoff Readiness Detection
  if (isDepartureAircraft && ac.assignedExitWaypoint) {
    const exitWp = waypoints.find(w => w.name === ac.assignedExitWaypoint);
    const minClimbAglFt = perf.aircraftClass === 'LIGHT_GA' ? 1000 : 1500;
    const minClimbAltFt =
      ac.exitClimbMinAltitudeFt ??
      Math.min(perf.serviceCeilingFt, Math.ceil(groundElevationFt / 500) * 500 + minClimbAglFt);
    const defaultMinSpeed =
      perf.aircraftClass === 'LIGHT_GA'
        ? Math.min(90, perf.cruiseAirspeedIAS)
        : perf.aircraftClass === 'REGIONAL_TURBOPROP'
        ? Math.min(150, perf.cruiseAirspeedIAS)
        : Math.min(185, perf.cruiseAirspeedIAS);
    const minClimbSpeedKt = ac.exitClimbMinSpeedKt ?? defaultMinSpeed;
    const climbGateMet =
      (newAltitude >= minClimbAltFt - 25 || newAltitude - groundElevationFt >= minClimbAglFt) &&
      newIAS >= minClimbSpeedKt - 2;

    if (
      exitWp &&
      climbGateMet &&
      calculateDistance(newX, newY, exitWp.position.x, exitWp.position.y) <= 3.0
    ) {
      currentFlightPhase = 'HANDOFF_READY';
    }
  }

  // 9. Trail History (stored using simulation time)
  let newHistory = ac.history;
  const lastPoint = ac.history[ac.history.length - 1];
  const historyInterval = 2.5; // every 2.5 sim seconds
  if (!lastPoint || (simTimeSec - (lastPoint.timestamp || 0)) >= historyInterval) {
    newHistory = [
      ...ac.history.slice(-120),
      { x: newX, y: newY, altitude: Math.round(newAltitude), timestamp: simTimeSec }
    ];
  }

  return {
    ...ac,
    x: newX,
    y: newY,
    heading: Math.round(newHeading * 10) / 10,
    targetHeading,
    indicatedAirspeed: Math.round(newIAS * 10) / 10,
    targetAirspeed,
    trueAirspeed: tasKnots,
    groundSpeed: ground.groundSpeed,
    groundTrack: ground.groundTrack,
    groundVelocityX: ground.groundVelocityX,
    groundVelocityY: ground.groundVelocityY,
    altitude: Math.round(newAltitude),
    targetAltitude,
    verticalSpeed,
    turnRate: Math.round(turnRateDegS * 10) / 10,
    bankAngle: bankAngleDeg,
    status: currentStatus,
    flightPhase: currentFlightPhase,
    assignedWaypoint,
    routeQueue,
    ilsArmed,
    autoInterceptILS,
    holdingLeg,
    holdingTimer,
    history: newHistory,
  };
}
