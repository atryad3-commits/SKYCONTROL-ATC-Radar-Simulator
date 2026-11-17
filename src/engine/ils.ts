/**
 * SKYCONTROL - Advanced ILS Approach & Landing Simulation Engine
 * Aerospace-grade localizer and glideslope models:
 * - Angular localizer deviation based on runway extended centerline geometry
 * - Configurable 3.0° glideslope with altitude deviation and dots
 * - Geometric capture conditions (interception angle <= 45°, capture range <= 18 NM)
 * - Stabilized approach monitoring at 1,000 ft and 500 ft AGL decision gates
 * - Full landing state machine: APPROACH -> FINAL -> THRESHOLD_CROSSING -> FLARE -> TOUCHDOWN -> ROLLOUT -> RUNWAY_EXIT -> LANDED
 * - Runway occupancy validation and automatic go-around sequencing
 */

import { Aircraft, AircraftStatus } from '../types';
import { RunwayGeometry, calculateRunwayRelativePosition, isInsideRunwayBoundaries } from './runwayGeometry';
import { getAircraftPerformance, AircraftPerformance } from './aircraftPerformance';
import { RunwayOccupancyManager } from './runwayOccupancy';
import { getHeadingDelta, normalizeHeading } from './physics';

const FEET_PER_NM = 6076.12;

export interface LocalizerDeviation {
  crossTrackNM: number;       // Perpendicular distance to centerline (+ right, - left)
  crossTrackFeet: number;
  angularDeviationDeg: number;// Deviation angle from centerline course (+ right, - left)
  dots: number;               // Standard cockpit ILS needle dots (2 dots = full scale = 2.5°)
  isWithinCoverage: boolean;  // Inside ±2.5° localizer beam and range <= 18 NM
  isEstablished: boolean;     // Centered within ±0.25° (approx ±0.2 dots)
}

export interface GlideslopeDeviation {
  nominalGlideslopeAltFt: number; // Height of glideslope at aircraft's along-track distance
  verticalDeviationFt: number;    // Actual altitude - nominal altitude (+ above, - below)
  angularDeviationDeg: number;    // Angular vertical deviation (+ above, - below)
  dots: number;                   // Standard cockpit GS needle dots (2 dots = full scale = 0.7°)
  isAbovePath: boolean;
  isBelowPath: boolean;
}

export interface StabilizedApproachStatus {
  isStabilized: boolean;
  gate: '1000_FT' | '500_FT' | 'NONE';
  warnings: string[];
  mandatoryGoAround: boolean;
}

export interface ILSStepResult {
  aircraft: Aircraft;
  interceptedLocalizer: boolean;
  interceptedGlideslope: boolean;
  landed: boolean;
  eventMessage?: string;
  eventType?: 'LOC_CAPTURED' | 'GS_CAPTURED' | 'TOUCHDOWN' | 'UNSTABLE_GO_AROUND' | 'RUNWAY_VACATED' | 'LANDING_REJECTED';
}

/**
 * Calculates exact localizer deviation from runway extended centerline
 */
export function calculateLocalizerDeviation(
  x: number,
  y: number,
  runway: RunwayGeometry
): LocalizerDeviation {
  const { alongTrackNM, crossTrackNM, crossTrackFeet } = calculateRunwayRelativePosition(x, y, runway);

  // If behind the threshold or beyond 25 NM, localizer has no valid angular beam
  if (alongTrackNM <= 0.05 || alongTrackNM > 25.0) {
    return {
      crossTrackNM,
      crossTrackFeet,
      angularDeviationDeg: 0,
      dots: 0,
      isWithinCoverage: false,
      isEstablished: false,
    };
  }

  // Angular deviation: theta = atan(crossTrack / alongTrack)
  const angularRad = Math.atan2(crossTrackNM, alongTrackNM);
  const angularDeviationDeg = (angularRad * 180) / Math.PI;

  // Standard ICAO localizer full scale deflection is ±2.5 degrees (2 dots, 1.25° per dot)
  const dots = Math.max(-2.5, Math.min(2.5, angularDeviationDeg / 1.25));
  const isWithinCoverage = Math.abs(angularDeviationDeg) <= 2.8 && alongTrackNM <= (runway.ils?.usableRangeNM || 18.0);

  const roundedDeg = Math.round(angularDeviationDeg * 100) / 100;
  const roundedDots = Math.round(dots * 10) / 10;
  const isEstablished = Math.abs(angularDeviationDeg) <= 0.25;

  return {
    crossTrackNM: crossTrackNM === 0 ? 0 : crossTrackNM,
    crossTrackFeet: crossTrackFeet === 0 ? 0 : crossTrackFeet,
    angularDeviationDeg: roundedDeg === 0 ? 0 : roundedDeg,
    dots: roundedDots === 0 ? 0 : roundedDots,
    isWithinCoverage,
    isEstablished,
  };
}

/**
 * Calculates exact glideslope deviation along the runway approach path
 */
export function calculateGlideslopeDeviation(
  x: number,
  y: number,
  altitudeFt: number,
  runway: RunwayGeometry
): GlideslopeDeviation {
  const { alongTrackNM } = calculateRunwayRelativePosition(x, y, runway);
  const elevation = runway.elevationFeet;
  const gsAngleDeg = runway.ils?.glideslopeAngleDeg || 3.0;
  const gsAngleRad = (gsAngleDeg * Math.PI) / 180;

  // Expected altitude along the glideslope:
  // Alt = Elevation + alongTrackNM * tan(gamma) * FEET_PER_NM
  const nominalAlt = alongTrackNM > 0
    ? elevation + alongTrackNM * Math.tan(gsAngleRad) * FEET_PER_NM
    : elevation;

  const verticalDeviationFt = altitudeFt - nominalAlt;
  const distFeet = Math.max(100, alongTrackNM * FEET_PER_NM);
  const angularDeviationDeg = (Math.atan2(verticalDeviationFt, distFeet) * 180) / Math.PI;

  // Standard glideslope full scale deflection is ±0.7 degrees (2 dots, 0.35° per dot)
  const dots = Math.max(-2.5, Math.min(2.5, angularDeviationDeg / 0.35));

  return {
    nominalGlideslopeAltFt: Math.round(nominalAlt),
    verticalDeviationFt: Math.round(verticalDeviationFt),
    angularDeviationDeg: Math.round(angularDeviationDeg * 100) / 100,
    dots: Math.round(dots * 10) / 10,
    isAbovePath: verticalDeviationFt > 50,
    isBelowPath: verticalDeviationFt < -50,
  };
}

/**
 * Evaluates whether an aircraft meets the strict geometric and aerodynamic
 * criteria to capture the Localizer
 */
export function canCaptureLocalizer(
  ac: Aircraft,
  runway: RunwayGeometry
): { canCapture: boolean; interceptHeading: number; reason?: string } {
  if (!ac.ilsArmed) {
    return { canCapture: false, interceptHeading: ac.heading, reason: 'ILS not armed' };
  }

  const { alongTrackNM, crossTrackNM } = calculateRunwayRelativePosition(ac.x, ac.y, runway);
  const loc = calculateLocalizerDeviation(ac.x, ac.y, runway);

  // 1. Must be in front of threshold and within usable range
  if (alongTrackNM <= 0.2 || alongTrackNM > (runway.ils?.usableRangeNM || 18.0)) {
    return { canCapture: false, interceptHeading: ac.heading, reason: 'Outside ILS service volume' };
  }

  // 2. Must be within the localizer capture beam (±2.5°)
  if (!loc.isWithinCoverage) {
    return { canCapture: false, interceptHeading: ac.heading, reason: 'Outside localizer beam coverage' };
  }

  // 3. Interception angle check: heading difference must not exceed 45°
  const interceptAngle = Math.abs(getHeadingDelta(ac.heading, runway.magneticHeading));
  if (interceptAngle > 48.0) {
    return { canCapture: false, interceptHeading: ac.heading, reason: `Excessive intercept angle (${Math.round(interceptAngle)}° > 45°)` };
  }

  // Calculate localizer track lead-in steering bug (inbound course + proportional lead)
  // When aircraft is right of course (+crossTrack), turn left (smaller heading)
  const leadAngle = Math.max(-20, Math.min(20, loc.angularDeviationDeg * 6.0));
  const interceptHeading = normalizeHeading(runway.magneticHeading - leadAngle);

  return { canCapture: true, interceptHeading };
}

/**
 * Evaluates whether an aircraft can capture the Glideslope from below
 */
export function canCaptureGlideslope(
  ac: Aircraft,
  runway: RunwayGeometry
): { canCapture: boolean; reason?: string } {
  if (!ac.ilsLocalizerCaptured) {
    return { canCapture: false, reason: 'Localizer must be established prior to glideslope capture' };
  }

  const { alongTrackNM } = calculateRunwayRelativePosition(ac.x, ac.y, runway);
  const gs = calculateGlideslopeDeviation(ac.x, ac.y, ac.altitude, runway);

  // Glideslope reliable capture within 12 NM
  if (alongTrackNM > 14.0 || alongTrackNM < 0.2) {
    return { canCapture: false, reason: 'Outside glideslope capture distance' };
  }

  // Capture from below or centered (vertical deviation within ±280 ft)
  if (Math.abs(gs.verticalDeviationFt) <= 300) {
    return { canCapture: true };
  }

  return { canCapture: false, reason: `Not on glidepath (${gs.verticalDeviationFt > 0 ? 'above' : 'below'} by ${Math.abs(gs.verticalDeviationFt)} ft)` };
}

/**
 * Evaluates Stabilized Approach Criteria at 1,000 ft and 500 ft AGL decision gates
 */
export function evaluateStabilizedApproach(
  ac: Aircraft,
  runway: RunwayGeometry,
  performance: AircraftPerformance
): StabilizedApproachStatus {
  const aglAltitude = ac.altitude - runway.elevationFeet;
  const warnings: string[] = [];

  // Determine gate
  let gate: '1000_FT' | '500_FT' | 'NONE' = 'NONE';
  if (aglAltitude <= 1050 && aglAltitude > 520) {
    gate = '1000_FT';
  } else if (aglAltitude <= 520 && aglAltitude > 50) {
    gate = '500_FT';
  }

  if (gate === 'NONE') {
    return { isStabilized: true, gate, warnings: [], mandatoryGoAround: false };
  }

  const loc = calculateLocalizerDeviation(ac.x, ac.y, runway);
  const gs = calculateGlideslopeDeviation(ac.x, ac.y, ac.altitude, runway);
  const vref = performance.typicalApproachSpeedIAS;

  // 1. Airspeed criteria: Vref - 5kt <= IAS <= Vref + 15kt
  if (ac.indicatedAirspeed < vref - 8) {
    warnings.push(`Low airspeed (${Math.round(ac.indicatedAirspeed)}kt < Vref ${vref}kt)`);
  } else if (ac.indicatedAirspeed > vref + 18) {
    warnings.push(`Excessive airspeed (${Math.round(ac.indicatedAirspeed)}kt > Vref+15)`);
  }

  // 2. Descent rate criteria: vertical speed must not exceed -1,000 fpm
  if (ac.verticalSpeed < -1050) {
    warnings.push(`Excessive sink rate (${Math.round(ac.verticalSpeed)} fpm)`);
  }

  // 3. Localizer alignment criteria: within 1 dot (1.25°)
  if (Math.abs(loc.dots) > 1.2) {
    warnings.push(`Localizer deviation (${loc.dots > 0 ? '+' : ''}${loc.dots} dots)`);
  }

  // 4. Glideslope tracking criteria: within 1 dot (0.35°)
  if (Math.abs(gs.dots) > 1.3) {
    warnings.push(`Glideslope deviation (${gs.dots > 0 ? '+' : ''}${gs.dots} dots)`);
  }

  // 5. Track alignment with runway heading: within 12°
  const alignmentDiff = Math.abs(getHeadingDelta(ac.heading, runway.magneticHeading));
  if (alignmentDiff > 14) {
    warnings.push(`Runway track misaligned (${Math.round(alignmentDiff)}°)`);
  }

  const isStabilized = warnings.length === 0;
  // Mandatory go-around triggered if unstable at the 500 ft AGL gate
  const mandatoryGoAround = gate === '500_FT' && !isStabilized;

  return {
    isStabilized,
    gate,
    warnings,
    mandatoryGoAround,
  };
}

/**
 * Initiates an authentic Missed Approach / Go-Around sequence
 */
export function initiateGoAround(
  ac: Aircraft,
  reason: string,
  missedApproachAltFt: number = 3000
): { aircraft: Aircraft; message: string } {
  const perf = getAircraftPerformance(ac.aircraftType);
  const clampedAlt = Math.min(missedApproachAltFt, perf.serviceCeilingFt);
  const updatedAc: Aircraft = {
    ...ac,
    status: 'GoAround',
    ilsArmed: false,
    ilsLocalizerCaptured: false,
    ilsGlideslopeCaptured: false,
    targetAltitude: clampedAlt,
    targetAirspeed: Math.min(210, perf.cruiseAirspeedIAS),
    verticalSpeed: perf.initialClimbRateFpm, // Model-matched go-around climb rate
    expediteAltitude: true,
    targetHeading: ac.heading, // Maintain runway heading initially
  };

  const message = `Going around, climbing to ${clampedAlt} feet (${reason})`;
  return { aircraft: updatedAc, message };
}

/**
 * Advanced Landing State Machine and ILS step processing
 */
export function updateILSApproach(
  ac: Aircraft,
  runway: RunwayGeometry,
  dt: number,
  occupancyManager?: RunwayOccupancyManager,
  simTimeSec: number = 0
): ILSStepResult {
  // If not armed and not established or already landed, return as is
  if (!ac.ilsArmed && !ac.ilsLocalizerCaptured && ac.status !== 'Landed') {
    return {
      aircraft: ac,
      interceptedLocalizer: false,
      interceptedGlideslope: false,
      landed: false,
    };
  }

  const perf = getAircraftPerformance(ac.aircraftType);
  const { alongTrackNM, crossTrackFeet } = calculateRunwayRelativePosition(ac.x, ac.y, runway);
  const loc = calculateLocalizerDeviation(ac.x, ac.y, runway);
  const gs = calculateGlideslopeDeviation(ac.x, ac.y, ac.altitude, runway);
  const aglAltitude = ac.altitude - runway.elevationFeet;

  let currentStatus = ac.status;
  let locCaptured = ac.ilsLocalizerCaptured;
  let gsCaptured = ac.ilsGlideslopeCaptured;
  let targetHeading = ac.targetHeading;
  let targetAltitude = ac.targetAltitude;
  let targetAirspeed = ac.targetAirspeed;
  let eventMessage: string | undefined;
  let eventType: ILSStepResult['eventType'];
  let newlyLanded = false;

  // 1. Localizer Interception
  if (!locCaptured && ac.ilsArmed) {
    const locEval = canCaptureLocalizer(ac, runway);
    if (locEval.canCapture) {
      locCaptured = true;
      currentStatus = 'Established';
      targetHeading = locEval.interceptHeading;
      eventType = 'LOC_CAPTURED';
      eventMessage = `Localizer established runway ${runway.id}`;
    }
  }

  // 2. Glideslope Interception
  if (locCaptured && !gsCaptured && ac.ilsArmed) {
    const gsEval = canCaptureGlideslope(ac, runway);
    if (gsEval.canCapture) {
      gsCaptured = true;
      currentStatus = 'FinalApproach';
      eventType = 'GS_CAPTURED';
      eventMessage = `Fully established on ILS runway ${runway.id}`;
    }
  }

  // 3. Autopilot Localizer and Glideslope Tracking
  if (locCaptured) {
    // Steer onto centerline course with lead
    const lead = Math.max(-15, Math.min(15, loc.angularDeviationDeg * 5.0));
    targetHeading = normalizeHeading(runway.magneticHeading - lead);

    if (gsCaptured) {
      // Follow glideslope altitude down to threshold elevation
      targetAltitude = Math.max(runway.elevationFeet, gs.nominalGlideslopeAltFt);
      // Decelerate smoothly to reference approach speed
      targetAirspeed = perf.typicalApproachSpeedIAS;

      // Reserve runway when within 2.0 NM on final
      if (alongTrackNM <= 2.2 && occupancyManager) {
        occupancyManager.reserveRunway(runway.id, ac.id, ac.callsign, simTimeSec);
      }
    }
  }

  // 4. Stabilized Approach Monitoring Check
  if (gsCaptured && aglAltitude <= 1100 && aglAltitude > 100) {
    const stab = evaluateStabilizedApproach(ac, runway, perf);
    if (stab.mandatoryGoAround) {
      // Execute automatic mandatory go-around
      const ga = initiateGoAround(ac, stab.warnings[0] || 'Unstable approach at 500ft gate');
      if (occupancyManager) {
        occupancyManager.releaseRunway(runway.id, ac.id);
      }
      return {
        aircraft: ga.aircraft,
        interceptedLocalizer: false,
        interceptedGlideslope: false,
        landed: false,
        eventMessage: ga.message,
        eventType: 'UNSTABLE_GO_AROUND',
      };
    }
  }

  // 5. Landing Sequence & Touchdown Validation
  // State transitions: FINAL_APPROACH -> FLARE (agl <= 50ft) -> TOUCHDOWN (agl <= 5ft, on runway)
  if (locCaptured && alongTrackNM <= 0.25 && alongTrackNM >= -0.8 && aglAltitude <= 60 && currentStatus !== 'Landed') {
    // Check runway clearance during short final and flare
    const runwayClearance = occupancyManager
      ? occupancyManager.canClearForLanding(runway.id, ac.id)
      : { allowed: true };

    if (!runwayClearance.allowed) {
      const ga = initiateGoAround(ac, runwayClearance.reason || 'Runway occupied');
      if (occupancyManager) {
        occupancyManager.releaseRunway(runway.id, ac.id);
      }
      return {
        aircraft: ga.aircraft,
        interceptedLocalizer: false,
        interceptedGlideslope: false,
        landed: false,
        eventMessage: `Landing rejected: ${runwayClearance.reason || 'Runway occupied'}. ${ga.message}`,
        eventType: 'LANDING_REJECTED',
      };
    }

    // Touchdown contact occurs when main gear touches down (aglAltitude <= 5 ft)
    if (aglAltitude <= 5) {
      const isInsideLateral = Math.abs(crossTrackFeet) <= (runway.widthFeet / 2 + 30);
      const isAligned = Math.abs(getHeadingDelta(ac.heading, runway.magneticHeading)) <= 12;
      const isSafeSinkRate = (ac.verticalSpeed || 0) >= perf.touchdownMaxSinkRateFpm;

      if (!isInsideLateral || !isAligned || !isSafeSinkRate) {
        const rejectReason = !isInsideLateral ? 'Lateral runway deviation' : !isSafeSinkRate ? 'Excessive sink rate' : 'Alignment error';
        const ga = initiateGoAround(ac, rejectReason);
        if (occupancyManager) {
          occupancyManager.releaseRunway(runway.id, ac.id);
        }
        return {
          aircraft: ga.aircraft,
          interceptedLocalizer: false,
          interceptedGlideslope: false,
          landed: false,
          eventMessage: `Landing rejected: ${rejectReason}. ${ga.message}`,
          eventType: 'LANDING_REJECTED',
        };
      }

      // Touchdown Validated!
      newlyLanded = true;
      currentStatus = 'Landed';
      targetAltitude = runway.elevationFeet;
      targetAirspeed = 0;
      eventType = 'TOUCHDOWN';
      eventMessage = `Touchdown runway ${runway.id}, roll out normal`;

      if (occupancyManager) {
        occupancyManager.occupyRunway(runway.id, ac.id, ac.callsign, 'Landing', simTimeSec);
      }
    }
  }

  let flightPhase = ac.flightPhase;
  if (currentStatus === 'FinalApproach') {
    if (aglAltitude <= 50 && alongTrackNM <= 0.25) {
      flightPhase = 'FLARE';
    } else {
      flightPhase = 'FINAL_APPROACH';
    }
  } else if (currentStatus === 'Landed') {
    if (ac.indicatedAirspeed > 22.0) {
      flightPhase = 'ROLLOUT';
    } else {
      flightPhase = 'TAXI_EXIT';
      if (occupancyManager) {
        occupancyManager.releaseRunway(runway.id, ac.id);
      }
      eventType = 'RUNWAY_VACATED';
      eventMessage = `Runway ${runway.id} vacated`;
    }
  }

  const updatedAircraft: Aircraft = {
    ...ac,
    status: currentStatus,
    flightPhase,
    ilsLocalizerCaptured: locCaptured,
    ilsGlideslopeCaptured: gsCaptured,
    distanceToThreshold: Math.round(Math.max(0, alongTrackNM) * 10) / 10,
    glidepathDeviation: gs.verticalDeviationFt,
    localizerDeviation: loc.angularDeviationDeg,
    targetHeading,
    targetAltitude,
    targetAirspeed,
  };

  return {
    aircraft: updatedAircraft,
    interceptedLocalizer: locCaptured && !ac.ilsLocalizerCaptured,
    interceptedGlideslope: gsCaptured && !ac.ilsGlideslopeCaptured,
    landed: newlyLanded,
    eventMessage,
    eventType,
  };
}
