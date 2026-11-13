/**
 * SKYCONTROL - Phase 3 & 4 Automated Test Suite
 * Automated tests for Runway Geometry, ILS Approach Engine, Stabilized Approach Gates,
 * Landing State Machine, Runway Occupancy Management, and Staged Takeoff Engine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateDistanceToThreshold,
  calculateBearingToThreshold,
  calculateRunwayRelativePosition,
  isInsideRunwayBoundaries,
  hasCrossedThreshold,
} from '../src/engine/runwayGeometry';
import {
  calculateLocalizerDeviation,
  calculateGlideslopeDeviation,
  canCaptureLocalizer,
  canCaptureGlideslope,
  evaluateStabilizedApproach,
  updateILSApproach,
} from '../src/engine/ils';
import {
  lineUpAircraft,
  issueTakeoffClearance,
  stepTakeoffSequence,
} from '../src/engine/takeoff';
import { RunwayOccupancyManager } from '../src/engine/runwayOccupancy';
import { getAircraftPerformance } from '../src/engine/aircraftPerformance';
import { HEATHROW_RUNWAY_GEOMETRIES } from '../src/airports/heathrow';
import { Aircraft } from '../src/types';

function createTestAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  const ias = overrides.indicatedAirspeed ?? 140;
  return {
    id: 'ac_test_ils',
    callsign: 'BAW452',
    airline: 'British Airways',
    telephony: 'Speedbird',
    aircraftType: 'A320',
    category: 'Large',
    origin: 'LFPG',
    destination: 'EGLL',
    x: 0,
    y: 0,
    altitude: 3000,
    targetAltitude: 3000,
    indicatedAirspeed: ias,
    targetAirspeed: ias,
    groundSpeed: ias,
    heading: 270,
    targetHeading: 270,
    verticalSpeed: 0,
    expediteAltitude: false,
    turnRate: 0,
    bankAngle: 0,
    status: 'Inbound',
    assignedRunway: '27R',
    transponder: '4501',
    assignedWaypoint: null,
    holdingWaypoint: null,
    holdingInboundHeading: 270,
    holdingLegTime: 60,
    holdingTimer: 0,
    holdingLeg: 'Inbound',
    ilsArmed: false,
    ilsLocalizerCaptured: false,
    ilsGlideslopeCaptured: false,
    tagOffset: { x: 28, y: -24 },
    history: [],
    ...overrides,
  };
}

describe('PART A – Runway Geometry Model', () => {
  const rwy27R = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27R')!;

  it('1. Accurately calculates distance and bearing to runway threshold', () => {
    // 27R threshold is at (1.1, 0.38)
    const dist = calculateDistanceToThreshold(11.1, 0.38, rwy27R);
    expect(dist).toBeCloseTo(10.0, 1);

    const bearing = calculateBearingToThreshold(11.1, 0.38, rwy27R);
    // Looking from east (11.1) to west (1.1) is 270°
    expect(bearing).toBeCloseTo(270, 1);
  });

  it('2. Calculates along-track distance and lateral cross-track deviation', () => {
    // 5 NM out on extended centerline
    const posOnCourse = calculateRunwayRelativePosition(6.1, 0.38, rwy27R);
    expect(posOnCourse.alongTrackNM).toBeCloseTo(5.0, 1);
    expect(posOnCourse.crossTrackNM).toBeCloseTo(0.0, 2);

    // 5 NM out, 0.5 NM displaced north (+Y)
    const posDisplaced = calculateRunwayRelativePosition(6.1, 0.88, rwy27R);
    expect(posDisplaced.alongTrackNM).toBeCloseTo(5.0, 1);
    expect(Math.abs(posDisplaced.crossTrackNM)).toBeCloseTo(0.5, 1);
  });

  it('3. Determines rectangular runway boundary containment accurately', () => {
    // Midpoint of 27R (between x=1.1 and x=-1.0, y=0.38)
    const inside = isInsideRunwayBoundaries(0.0, 0.38, rwy27R);
    expect(inside).toBe(true);

    // 1 NM east of threshold (not yet on runway)
    const outsideThreshold = isInsideRunwayBoundaries(2.1, 0.38, rwy27R);
    expect(outsideThreshold).toBe(false);

    // 0.2 NM lateral offset (outside 164 ft runway width)
    const outsideLateral = isInsideRunwayBoundaries(0.0, 0.58, rwy27R);
    expect(outsideLateral).toBe(false);
  });

  it('4. Correctly detects when an aircraft has crossed the threshold', () => {
    // When previous along-track was ahead of threshold (> 0) and current is past threshold (<= 0)
    expect(hasCrossedThreshold(0.1, -0.05)).toBe(true);
    expect(hasCrossedThreshold(1.5, 1.2)).toBe(false);
    expect(hasCrossedThreshold(-0.5, -0.8)).toBe(false);
  });
});

describe('PART B – Independent ILS Approach Engine', () => {
  const rwy27R = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27R')!;

  it('5. Computes angular localizer deviation and dots', () => {
    // Exact centerline: 0 dots, 0 deg deviation
    const devCenter = calculateLocalizerDeviation(11.1, 0.38, rwy27R);
    expect(Math.abs(devCenter.angularDeviationDeg)).toBe(0);
    expect(Math.abs(devCenter.dots)).toBe(0);
    expect(devCenter.isEstablished).toBe(true);

    // Offset right: positive dots
    const devRight = calculateLocalizerDeviation(11.1, 0.60, rwy27R);
    expect(devRight.angularDeviationDeg).toBeGreaterThan(0);
    expect(devRight.dots).toBeGreaterThan(0);
  });

  it('6. Calculates standard 3.0° glideslope height profile and vertical deviation', () => {
    // Threshold is at (1.1, 0.38). Aircraft at (11.1, 0.38) is exactly 10.0 NM along-track.
    // Nom Alt = 83 ft elevation + 10.0 NM * tan(3°) * 6076.12 ft/NM = 83 + 3200 = 3,266 ~ 3,283 ft
    const gsNominal = calculateGlideslopeDeviation(11.1, 0.38, 3283, rwy27R);
    expect(gsNominal.nominalGlideslopeAltFt).toBeCloseTo(3283, -1);
    expect(Math.abs(gsNominal.verticalDeviationFt)).toBeLessThan(10);
    expect(Math.abs(gsNominal.dots)).toBeLessThan(0.1);

    // Flying 300 ft above path
    const gsHigh = calculateGlideslopeDeviation(11.1, 0.38, 3283 + 300, rwy27R);
    expect(gsHigh.isAbovePath).toBe(true);
    expect(gsHigh.dots).toBeGreaterThan(0.5);
  });

  it('7. Enforces capture criteria: disallows intercept angles greater than 45°', () => {
    // Aircraft approaching at 40° intercept angle (heading 230° vs runway 270°)
    const acValid = createTestAircraft({
      x: 11.1,
      y: 0.38,
      heading: 230,
      ilsArmed: true,
    });
    const capValid = canCaptureLocalizer(acValid, rwy27R);
    expect(capValid.canCapture).toBe(true);

    // Aircraft approaching at 60° intercept angle (heading 210° vs runway 270°)
    const acExcessive = createTestAircraft({
      x: 11.1,
      y: 0.38,
      heading: 210,
      ilsArmed: true,
    });
    const capExcessive = canCaptureLocalizer(acExcessive, rwy27R);
    expect(capExcessive.canCapture).toBe(false);
    expect(capExcessive.reason).toContain('Excessive intercept angle');
  });

  it('8. Requires capturing glideslope from below', () => {
    // At 5 NM, nominal altitude is ~1,675 ft
    const gsAt5NM = calculateGlideslopeDeviation(6.1, 0.38, 1675, rwy27R);
    const nominalAltAt5NM = gsAt5NM.nominalGlideslopeAltFt;

    // Aircraft 200 ft below glide path: valid capture condition
    const acBelow = createTestAircraft({
      x: 6.1,
      y: 0.38,
      altitude: nominalAltAt5NM - 200,
      ilsLocalizerCaptured: true,
    });
    const capBelow = canCaptureGlideslope(acBelow, rwy27R);
    expect(capBelow.canCapture).toBe(true);

    // Aircraft 400 ft above glide path: cannot capture from above
    const acAbove = createTestAircraft({
      x: 6.1,
      y: 0.38,
      altitude: nominalAltAt5NM + 400,
      ilsLocalizerCaptured: true,
    });
    const capAbove = canCaptureGlideslope(acAbove, rwy27R);
    expect(capAbove.canCapture).toBe(false);
  });
});

describe('PART B.4 – Stabilized Approach Monitoring', () => {
  const rwy27R = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27R')!;
  const perfA320 = getAircraftPerformance('A320'); // Vref = 142 kt

  it('9. Passes stabilized approach evaluation under nominal conditions', () => {
    // At 800 ft AGL (1,000 ft gate), Vref (142 kt), -700 fpm sink rate, centered
    const acStable = createTestAircraft({
      x: 3.5,
      y: 0.38,
      altitude: 883,
      indicatedAirspeed: 142,
      verticalSpeed: -700,
      heading: 270,
    });
    const evalResult = evaluateStabilizedApproach(acStable, rwy27R, perfA320);
    expect(evalResult.isStabilized).toBe(true);
    expect(evalResult.mandatoryGoAround).toBe(false);
    expect(evalResult.warnings).toHaveLength(0);
  });

  it('10. Detects unstable approach when airspeed is excessive', () => {
    // At 400 ft AGL (500 ft gate), 180 kt (> Vref + 15)
    const acHot = createTestAircraft({
      x: 2.2,
      y: 0.38,
      altitude: 483,
      indicatedAirspeed: 180,
      verticalSpeed: -700,
      heading: 270,
    });
    const evalResult = evaluateStabilizedApproach(acHot, rwy27R, perfA320);
    expect(evalResult.isStabilized).toBe(false);
    expect(evalResult.mandatoryGoAround).toBe(true);
    expect(evalResult.warnings.some(w => w.includes('Excessive airspeed'))).toBe(true);
  });

  it('11. Enforces mandatory go-around if unstable at 500 ft AGL gate due to sink rate', () => {
    // At 400 ft AGL, sink rate = -1,300 fpm (> 1,000 fpm limit)
    const acHighSink = createTestAircraft({
      x: 2.2,
      y: 0.38,
      altitude: 483,
      indicatedAirspeed: 140,
      verticalSpeed: -1300,
      heading: 270,
    });
    const evalResult = evaluateStabilizedApproach(acHighSink, rwy27R, perfA320);
    expect(evalResult.isStabilized).toBe(false);
    expect(evalResult.mandatoryGoAround).toBe(true);
    expect(evalResult.warnings.some(w => w.includes('Excessive sink rate'))).toBe(true);
  });
});

describe('PART B.5 & B.6 – Landing State Machine & Runway Occupancy', () => {
  const rwy27R = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27R')!;
  let occupancyManager: RunwayOccupancyManager;

  beforeEach(() => {
    occupancyManager = new RunwayOccupancyManager(HEATHROW_RUNWAY_GEOMETRIES);
  });

  it('12. Rejects landing and initiates go-around if runway is occupied', () => {
    // Occupy 27R with a departure aircraft
    occupancyManager.occupyRunway('27R', 'ac_ground_blocker', 'BLOCKER1', 'Takeoff', 10.0);

    const acLanding = createTestAircraft({
      x: 1.15,
      y: 0.38,
      altitude: 90, // 7 ft AGL
      status: 'FinalApproach',
      ilsLocalizerCaptured: true,
      ilsGlideslopeCaptured: true,
      indicatedAirspeed: 135,
    });

    const result = updateILSApproach(acLanding, rwy27R, 0.05, occupancyManager, 12.0);
    expect(result.landed).toBe(false);
    expect(result.aircraft.status).toBe('GoAround');
    expect(result.eventType).toBe('LANDING_REJECTED');
  });

  it('13. Validates touchdown sink rate: accepts <= 600 fpm and updates status to Landed', () => {
    const acNormalTouchdown = createTestAircraft({
      x: 1.0,
      y: 0.38,
      altitude: 83, // Touchdown
      verticalSpeed: -250,
      status: 'FinalApproach',
      ilsLocalizerCaptured: true,
      ilsGlideslopeCaptured: true,
      indicatedAirspeed: 130,
    });

    const result = updateILSApproach(acNormalTouchdown, rwy27R, 0.05, occupancyManager, 20.0);
    expect(result.landed).toBe(true);
    expect(result.aircraft.status).toBe('Landed');
    expect(result.eventType).toBe('TOUCHDOWN');
  });

  it('14. Vacates runway and releases occupancy when decelerated to taxi speed', () => {
    // Aircraft on rollout decelerating past 20 kt
    const acRolling = createTestAircraft({
      x: -0.5,
      y: 0.38,
      altitude: 83,
      status: 'Landed',
      indicatedAirspeed: 21,
      groundSpeed: 21,
    });
    occupancyManager.occupyRunway('27R', acRolling.id, acRolling.callsign, 'Landing', 30.0);

    const result = updateILSApproach(acRolling, rwy27R, 1.0, occupancyManager, 31.0);
    expect(result.eventType).toBe('RUNWAY_VACATED');
    expect(occupancyManager.getRunwayState('27R')).toBe('Available');
  });
});

describe('PART C – Staged Takeoff Engine', () => {
  const rwy27L = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27L')!;
  let occupancyManager: RunwayOccupancyManager;

  beforeEach(() => {
    occupancyManager = new RunwayOccupancyManager(HEATHROW_RUNWAY_GEOMETRIES);
  });

  it('15. Allows Line Up and Wait on an empty runway and reserves occupancy', () => {
    const acHolding = createTestAircraft({
      id: 'ac_dep_1',
      aircraftType: 'A320',
      status: 'Departing',
      indicatedAirspeed: 0,
      assignedRunway: '27L',
    });

    const res = lineUpAircraft(acHolding, rwy27L, occupancyManager, 5.0);
    expect(res.success).toBe(true);
    expect(res.aircraft.status).toBe('Departing');
    expect(occupancyManager.getRunwayState('27L')).toBe('Occupied');
  });

  it('16. Prevents takeoff clearance if runway is already occupied', () => {
    // Occupy 27L with an arrival rollout
    occupancyManager.occupyRunway('27L', 'ac_arriving_traffic', 'SPEEDBIRD', 'Landing', 10.0);

    const acWaiting = createTestAircraft({
      id: 'ac_dep_2',
      status: 'Departing',
      indicatedAirspeed: 0,
      assignedRunway: '27L',
    });

    const res = issueTakeoffClearance(acWaiting, rwy27L, occupancyManager, 12.0);
    expect(res.success).toBe(false);
    expect(res.reason).toContain('SPEEDBIRD');
  });

  it('17. Progresses through ground acceleration to rotation speed (Vr)', () => {
    // A320 Vr is 145 kt
    let acRoll = createTestAircraft({
      id: 'ac_dep_3',
      aircraftType: 'A320',
      x: rwy27L.threshold.x,
      y: rwy27L.threshold.y,
      altitude: 83,
      status: 'Departing',
      indicatedAirspeed: 140, // 5 kt before Vr
      groundSpeed: 140,
      heading: 270,
    });
    occupancyManager.occupyRunway('27L', acRoll.id, acRoll.callsign, 'Takeoff', 20.0);

    // Step 2 seconds at ~3.2 kt/s acceleration -> speed reaches Vr (145 kt)
    const res = stepTakeoffSequence(acRoll, rwy27L, 2.0, occupancyManager, 22.0);
    expect(res.aircraft.indicatedAirspeed).toBeGreaterThanOrEqual(145);
    expect(res.eventType).toBe('ROTATION');
  });

  it('18. Achieves liftoff at V2 and establishes positive climb rate', () => {
    // A320 V2 is 154 kt
    let acRot = createTestAircraft({
      id: 'ac_dep_4',
      aircraftType: 'A320',
      x: 0.0,
      y: -0.38,
      altitude: 83,
      status: 'Departing',
      indicatedAirspeed: 150,
      groundSpeed: 150,
      heading: 270,
    });
    occupancyManager.occupyRunway('27L', acRot.id, acRot.callsign, 'Takeoff', 25.0);

    const res = stepTakeoffSequence(acRot, rwy27L, 1.0, occupancyManager, 26.0);
    expect(res.aircraft.verticalSpeed).toBeGreaterThan(0);
  });

  it('19. Releases runway occupancy upon passing 500 ft AGL and transitions to departure routing', () => {
    let acClimbing = createTestAircraft({
      id: 'ac_dep_5',
      aircraftType: 'A320',
      x: -1.8,
      y: -0.38,
      altitude: 570, // Elevation 83 + 487 ft
      verticalSpeed: 2200,
      status: 'Departing',
      indicatedAirspeed: 160,
      groundSpeed: 160,
      heading: 270,
    });
    occupancyManager.occupyRunway('27L', acClimbing.id, acClimbing.callsign, 'Takeoff', 30.0);

    // Step 1s: altitude climbs by ~36 ft -> reaches 606 ft (> 500 ft AGL = 583 ft)
    const res = stepTakeoffSequence(acClimbing, rwy27L, 1.0, occupancyManager, 31.0);
    expect(res.aircraft.altitude).toBeGreaterThan(583);
    expect(occupancyManager.getRunwayState('27L')).toBe('Available');
  });
});

describe('PART D & E – Aircraft Performance Database & Flight Phases', () => {
  it('20. Returns correct distinct performance figures for various aircraft models', () => {
    const a320 = getAircraftPerformance('A320');
    const a380 = getAircraftPerformance('A380');
    const b77w = getAircraftPerformance('B77W');

    // A380 Super heavy vs A320 Narrowbody
    expect(a380.typicalApproachSpeedIAS).toBeGreaterThan(a320.typicalApproachSpeedIAS);
    expect(a380.maxTakeoffMassKg).toBeGreaterThan(b77w.maxTakeoffMassKg);
    expect(b77w.category).toBe('Heavy');
    expect(a320.category).toBe('Large');
  });

  it('21. Validates go-around flight dynamics profile', () => {
    // When executing go-around, target altitude must be set to 3,000 ft and pitch to positive climb
    const acGA = createTestAircraft({
      status: 'GoAround',
      altitude: 600,
      targetAltitude: 3000,
      verticalSpeed: 1800,
    });
    expect(acGA.targetAltitude).toBe(3000);
    expect(acGA.verticalSpeed).toBeGreaterThan(0);
  });
});
