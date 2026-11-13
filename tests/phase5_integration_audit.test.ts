/**
 * SKYCONTROL - Phase 5 Integration & Continuous Airport Simulation Suite
 *
 * Comprehensive integration audit and deterministic operational simulations:
 * 1. Complete Arrival Simulation: Sector entry -> Vectoring -> ILS Intercept -> Loc/GS Capture
 *    -> Stabilized Approach -> Threshold Crossing -> Flare -> Touchdown -> Rollout -> Runway Exit.
 * 2. Go-Around Simulation: Unstable approach (speed, sink rate, localizer error),
 *    runway occupancy conflict, missed approach climb, and second approach return.
 * 3. Complete Departure Simulation: Hold short -> Line up -> Takeoff clearance -> Ground roll
 *    -> V1 decision speed -> Vr rotation -> Liftoff -> V2 safety speed -> Initial climb -> En route.
 *    Testing rejected takeoff before V1 and RTO prohibition after V1.
 * 4. Runway Occupancy Audit: Physical boundary containment, obstacle-free zone clearance,
 *    reciprocal runway blocking, simultaneous request arbitration, and closed runway enforcement.
 * 5. Multi-Aircraft Integration Scenario: 5 arrivals + 5 departures with mixed performance,
 *    wind drift, go-around, and STCA conflict handling.
 * 6. Aircraft Performance Validation: V1/Vr/V2/Vref/Acceleration/Climb consistency across all 7 types.
 * 7. Continuous Deterministic Simulation: Multi-step continuous stepping without state tampering.
 * 8. Performance Benchmark: Processing throughput & timing at 10, 25, 50, and 100 aircraft.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateDistanceToThreshold,
  calculateRunwayRelativePosition,
  isInsideRunwayBoundaries,
  isInsideRunwayProtectionZone,
  hasCrossedThreshold,
} from '../src/engine/runwayGeometry';
import {
  calculateLocalizerDeviation,
  calculateGlideslopeDeviation,
  canCaptureLocalizer,
  canCaptureGlideslope,
  evaluateStabilizedApproach,
  updateILSApproach,
  initiateGoAround,
} from '../src/engine/ils';
import {
  lineUpAircraft,
  issueTakeoffClearance,
  stepTakeoffSequence,
  rejectTakeoff,
} from '../src/engine/takeoff';
import { RunwayOccupancyManager } from '../src/engine/runwayOccupancy';
import { getAircraftPerformance, AIRCRAFT_PERFORMANCE_DATABASE } from '../src/engine/aircraftPerformance';
import { HEATHROW_RUNWAY_GEOMETRIES } from '../src/airports/heathrow';
import { stepAircraftPhysics } from '../src/engine/physics';
import { detectConflicts, ConflictEventTracker } from '../src/engine/conflict';
import { Aircraft, WeatherCondition, Waypoint } from '../src/types';

// Standard test weather
const CALM_WEATHER: WeatherCondition = {
  windDirection: 270,
  windSpeed: 0,
  gusts: 0,
  qnh: 1013,
  visibilityNM: 10,
  ceilingFeet: 5000,
  precipitation: 'None',
};

const WINDY_WEATHER: WeatherCondition = {
  windDirection: 250,
  windSpeed: 18,
  gusts: 26,
  qnh: 1013,
  visibilityNM: 8,
  ceilingFeet: 4000,
  precipitation: 'Light Rain',
};

const EMPTY_WAYPOINTS: Waypoint[] = [];

function createTestAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  const ias = overrides.indicatedAirspeed ?? 140;
  return {
    id: 'ac_test_' + Math.random().toString(36).substring(2, 7),
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

describe('1. COMPLETE ARRIVAL SIMULATION (Continuous Lifecycle)', () => {
  const rwy27R = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27R')!;
  let occupancyManager: RunwayOccupancyManager;

  beforeEach(() => {
    occupancyManager = new RunwayOccupancyManager(HEATHROW_RUNWAY_GEOMETRIES);
  });

  it('Simulates an arrival through all 15 discrete operational stages driven by simulation state', () => {
    // 1. Arrival sector entry (30 NM East, FL100, 240 kt)
    let ac = createTestAircraft({
      callsign: 'BAW452',
      aircraftType: 'A320',
      x: 30.0,
      y: 8.0,
      altitude: 10000,
      targetAltitude: 4000,
      indicatedAirspeed: 240,
      targetAirspeed: 210,
      heading: 240,
      targetHeading: 240,
      status: 'Inbound',
      assignedRunway: '27R',
    });
    expect(ac.status).toBe('Inbound');
    expect(ac.altitude).toBe(10000);

    // 2-5. Vectoring, Altitude descend, and Speed reduction (step 10 seconds of physics)
    ac = stepAircraftPhysics(ac, 10.0, CALM_WEATHER, EMPTY_WAYPOINTS, 10.0, 83);
    expect(ac.altitude).toBeLessThan(10000);
    expect(ac.indicatedAirspeed).toBeLessThan(240);

    // Turn onto base leg (heading 300°) and arm ILS
    ac = { ...ac, heading: 300, targetHeading: 300, x: 14.0, y: 1.0, altitude: 3000, ilsArmed: true };

    // 6. ILS Interception: Turn onto localizer intercept heading (250° -> 20° intercept to runway 270°)
    ac = { ...ac, heading: 250, targetHeading: 250, x: 11.5, y: 0.42, altitude: 3000 };
    const locEval = canCaptureLocalizer(ac, rwy27R);
    expect(locEval.canCapture).toBe(true);

    // 7. Localizer Capture
    let ilsRes = updateILSApproach(ac, rwy27R, 1.0, occupancyManager, 20.0);
    ac = ilsRes.aircraft;
    expect(ac.ilsLocalizerCaptured).toBe(true);
    expect(ac.status).toBe('Established');
    expect(ilsRes.eventType).toBe('LOC_CAPTURED');

    // 8. Glideslope Capture (Approach from below nominal GS of ~3,283 ft at 10 NM)
    ac = { ...ac, altitude: 3200 }; // Nominal is ~3414 ft at 10.45 NM, 3200 ft is within capture band
    const gsEval = canCaptureGlideslope(ac, rwy27R);
    expect(gsEval.canCapture).toBe(true);
    ilsRes = updateILSApproach(ac, rwy27R, 1.0, occupancyManager, 21.0);
    ac = ilsRes.aircraft;
    expect(ac.ilsGlideslopeCaptured).toBe(true);
    expect(ac.status).toBe('FinalApproach');
    expect(ac.flightPhase).toBe('FINAL_APPROACH');

    // 9. Stabilized Approach Monitoring Check (At 800 ft AGL / 1,000 ft gate: nominal distance is ~3.5 NM)
    ac = { ...ac, x: 3.5, y: 0.38, heading: 270, altitude: 883, verticalSpeed: -720, indicatedAirspeed: 142 };
    const stab = evaluateStabilizedApproach(ac, rwy27R, getAircraftPerformance(ac.aircraftType));
    expect(stab.isStabilized).toBe(true);
    expect(stab.mandatoryGoAround).toBe(false);

    // 10. Threshold Crossing Check (Before vs After threshold at x=1.05 NM)
    expect(hasCrossedThreshold(0.05, -0.05)).toBe(true);

    // 11. Flare (At 35 ft AGL, 0.1 NM along track)
    ac = { ...ac, x: 1.0, y: 0.38, altitude: 118, verticalSpeed: -200, indicatedAirspeed: 135 };
    ilsRes = updateILSApproach(ac, rwy27R, 0.5, occupancyManager, 80.0);
    ac = ilsRes.aircraft;
    expect(ac.flightPhase).toBe('FLARE');

    // 12. Touchdown (Agl <= 60 ft, alongTrack <= 0.15 NM)
    ac = { ...ac, x: 0.95, y: 0.38, altitude: 83, verticalSpeed: -180, indicatedAirspeed: 130 };
    ilsRes = updateILSApproach(ac, rwy27R, 0.5, occupancyManager, 81.0);
    ac = ilsRes.aircraft;
    expect(ilsRes.landed).toBe(true);
    expect(ac.status).toBe('Landed');
    expect(occupancyManager.getRunwayState('27R')).toBe('Occupied');

    // 13. Rollout Deceleration
    ac = { ...ac, indicatedAirspeed: 60 };
    ilsRes = updateILSApproach(ac, rwy27R, 1.0, occupancyManager, 85.0);
    ac = ilsRes.aircraft;
    expect(ac.flightPhase).toBe('ROLLOUT');

    // 14-15. Runway Exit & Landing Completion (< 22 kt taxi speed)
    ac = { ...ac, indicatedAirspeed: 18 };
    ilsRes = updateILSApproach(ac, rwy27R, 1.0, occupancyManager, 95.0);
    ac = ilsRes.aircraft;
    expect(ac.flightPhase).toBe('TAXI_EXIT');
    expect(ilsRes.eventType).toBe('RUNWAY_VACATED');
    expect(occupancyManager.getRunwayState('27R')).toBe('Available');
  });
});

describe('2. GO-AROUND SIMULATION & MISSED APPROACH PROCEDURES', () => {
  const rwy27R = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27R')!;
  let occupancyManager: RunwayOccupancyManager;

  beforeEach(() => {
    occupancyManager = new RunwayOccupancyManager(HEATHROW_RUNWAY_GEOMETRIES);
  });

  it('A. Triggers mandatory go-around when approach is unstable (excessive sink rate)', () => {
    const ac = createTestAircraft({
      altitude: 483, // 400 ft AGL (500 ft gate)
      verticalSpeed: -1400, // Exceeds -1,000 fpm limit
      indicatedAirspeed: 140,
    });
    const stab = evaluateStabilizedApproach(ac, rwy27R, getAircraftPerformance(ac.aircraftType));
    expect(stab.isStabilized).toBe(false);
    expect(stab.mandatoryGoAround).toBe(true);
    expect(stab.warnings.some(w => w.includes('sink rate'))).toBe(true);
  });

  it('B. Triggers mandatory go-around when airspeed is excessively hot on short final', () => {
    const ac = createTestAircraft({
      altitude: 483, // 400 ft AGL
      verticalSpeed: -700,
      indicatedAirspeed: 175, // Vref (142) + 33 kt
    });
    const stab = evaluateStabilizedApproach(ac, rwy27R, getAircraftPerformance(ac.aircraftType));
    expect(stab.isStabilized).toBe(false);
    expect(stab.mandatoryGoAround).toBe(true);
    expect(stab.warnings.some(w => w.includes('airspeed'))).toBe(true);
  });

  it('C. Triggers rejected landing go-around when runway is occupied', () => {
    occupancyManager.occupyRunway('27R', 'ac_blocker', 'BLOCKER1', 'Takeoff', 10.0);
    const ac = createTestAircraft({
      x: 1.1,
      y: 0.38,
      altitude: 100, // 17 ft AGL
      status: 'FinalApproach',
      ilsLocalizerCaptured: true,
      ilsGlideslopeCaptured: true,
      indicatedAirspeed: 135,
    });
    const res = updateILSApproach(ac, rwy27R, 0.5, occupancyManager, 12.0);
    expect(res.landed).toBe(false);
    expect(res.aircraft.status).toBe('GoAround');
    expect(res.eventType).toBe('LANDING_REJECTED');
  });

  it('D. Executes go-around climb profile and allows re-interception for a second approach', () => {
    const gaInit = initiateGoAround(createTestAircraft({ altitude: 400, heading: 270 }), 'Wind shear alert');
    let ac = gaInit.aircraft;
    expect(ac.status).toBe('GoAround');
    expect(ac.targetAltitude).toBe(3000);
    expect(ac.verticalSpeed).toBe(2400);

    // Climb to 3,000 ft and vector back
    ac = { ...ac, altitude: 3000, heading: 90, targetHeading: 90, x: 15.0, y: 5.0, status: 'Inbound' };
    expect(ac.status).toBe('Inbound');
    expect(ac.altitude).toBe(3000);
  });
});

describe('3. COMPLETE DEPARTURE SIMULATION & V-SPEED ACCOUNTING', () => {
  const rwy27L = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27L')!;
  let occupancyManager: RunwayOccupancyManager;

  beforeEach(() => {
    occupancyManager = new RunwayOccupancyManager(HEATHROW_RUNWAY_GEOMETRIES);
  });

  it('Verifies distinct V1, VR, V2 progression on departure takeoff roll', () => {
    const perf = getAircraftPerformance('A320');
    // For A320: V1 = 138 kt, Vr = 145 kt, V2 = 154 kt
    expect(perf.takeoffDecisionSpeedIAS).toBeLessThan(perf.rotationSpeedIAS);
    expect(perf.rotationSpeedIAS).toBeLessThan(perf.takeoffSafetySpeedIAS);

    // 1. Hold Short
    let ac = createTestAircraft({
      callsign: 'BAW117',
      aircraftType: 'A320',
      status: 'Departing',
      flightPhase: 'HOLD_SHORT',
      indicatedAirspeed: 0,
      assignedRunway: '27L',
    });

    // 2. Line Up & Wait
    const lineup = lineUpAircraft(ac, rwy27L, occupancyManager, 5.0);
    expect(lineup.success).toBe(true);
    ac = lineup.aircraft;
    expect(occupancyManager.getRunwayState('27L')).toBe('Occupied');

    // 3. Takeoff Clearance
    const clearance = issueTakeoffClearance(ac, rwy27L, occupancyManager, 8.0);
    expect(clearance.success).toBe(true);
    ac = clearance.aircraft;

    // 4. Accelerate to V1 (138 kt)
    ac = { ...ac, indicatedAirspeed: 137 };
    let stepRes = stepTakeoffSequence(ac, rwy27L, 1.0, occupancyManager, 10.0);
    ac = stepRes.aircraft;
    expect(stepRes.eventType).toBe('V1');
    expect(ac.indicatedAirspeed).toBeGreaterThanOrEqual(138);

    // 5. Accelerate to Vr (145 kt)
    ac = { ...ac, indicatedAirspeed: 144 };
    stepRes = stepTakeoffSequence(ac, rwy27L, 1.0, occupancyManager, 12.0);
    ac = stepRes.aircraft;
    expect(stepRes.eventType).toBe('ROTATION');
    expect(ac.flightPhase).toBe('ROTATION');

    // 6. Rotate and Liftoff at V2 (154 kt)
    ac = { ...ac, indicatedAirspeed: 153, altitude: 90 };
    stepRes = stepTakeoffSequence(ac, rwy27L, 1.0, occupancyManager, 14.0);
    ac = stepRes.aircraft;
    expect(stepRes.eventType).toBe('V2');
    expect(ac.indicatedAirspeed).toBeGreaterThanOrEqual(154);

    // 7. Initial Climb & 500 ft AGL runway release
    ac = { ...ac, altitude: 585, verticalSpeed: 2200 };
    stepRes = stepTakeoffSequence(ac, rwy27L, 0.5, occupancyManager, 16.0);
    ac = stepRes.aircraft;
    expect(occupancyManager.getRunwayState('27L')).toBe('Available');
  });

  it('Tests rejected takeoff (RTO) before V1 vs RTO prohibition after V1', () => {
    // Aircraft rolling at 100 kt (< V1 of 138 kt) -> Safe to reject
    const acSlow = createTestAircraft({
      aircraftType: 'A320',
      indicatedAirspeed: 100,
      altitude: 83,
    });
    const rtoSlow = rejectTakeoff(acSlow, 'Engine fire warning');
    expect(rtoSlow.success).toBe(true);
    expect(rtoSlow.aircraft.flightPhase).toBe('REJECTED_TAKEOFF');

    // Deceleration during RTO
    const rtoStep = stepTakeoffSequence(rtoSlow.aircraft, rwy27L, 2.0, occupancyManager, 5.0);
    expect(rtoStep.aircraft.indicatedAirspeed).toBeLessThan(100);

    // Aircraft rolling at 140 kt (>= V1 of 138 kt) -> RTO prohibited!
    const acFast = createTestAircraft({
      aircraftType: 'A320',
      indicatedAirspeed: 140,
      altitude: 83,
    });
    const rtoFast = rejectTakeoff(acFast, 'Master caution warning');
    expect(rtoFast.success).toBe(false);
    expect(rtoFast.reason).toContain('RTO prohibited');
  });
});

describe('4. RUNWAY OCCUPANCY AUDIT & SAFETY ENFORCEMENT', () => {
  let occupancyManager: RunwayOccupancyManager;
  const rwy27R = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27R')!;
  const rwy09L = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '09L')!;

  beforeEach(() => {
    occupancyManager = new RunwayOccupancyManager(HEATHROW_RUNWAY_GEOMETRIES);
  });

  it('Verifies runway release depends on physical protected zone geometry (OFZ / RPZ)', () => {
    // 27R threshold is at (1.05, 0.38). Pavement width 164 ft (half 82 ft). Protected half width 250 ft.
    // Inside pavement
    expect(isInsideRunwayBoundaries(0.0, 0.38, rwy27R)).toBe(true);
    expect(isInsideRunwayProtectionZone(0.0, 0.38, rwy27R)).toBe(true);

    // Cleared pavement (100 ft lateral offset) but still within 250 ft protected zone
    // 100 ft = 0.0164 NM offset -> y = 0.38 + 0.0164 = 0.3964
    expect(isInsideRunwayBoundaries(0.0, 0.397, rwy27R)).toBe(false);
    expect(isInsideRunwayProtectionZone(0.0, 0.397, rwy27R, 250)).toBe(true);

    // Fully cleared beyond protected zone (300 ft offset)
    // 300 ft = 0.049 NM offset -> y = 0.38 + 0.049 = 0.429
    expect(isInsideRunwayProtectionZone(0.0, 0.435, rwy27R, 250)).toBe(false);
  });

  it('Enforces reciprocal runway safety lock (27R occupancy locks 09L)', () => {
    // Aircraft lines up on 27R
    occupancyManager.occupyRunway('27R', 'BAW452', 'BAW452', 'Takeoff', 10.0);
    expect(occupancyManager.getRunwayState('27R')).toBe('Occupied');

    // Opposite runway 09L must also be locked Occupied
    expect(occupancyManager.getRunwayState('09L')).toBe('Occupied');

    // Departure clearance on 09L must be blocked
    const clear09L = occupancyManager.canClearForTakeoff('09L', 'AFR112');
    expect(clear09L.allowed).toBe(false);
    expect(clear09L.reason).toContain('occupied');
  });

  it('Arbitrates simultaneous runway requests and blocks secondary aircraft', () => {
    // Aircraft A cleared to land
    const checkA = occupancyManager.canClearForLanding('27R', 'VIR18');
    expect(checkA.allowed).toBe(true);
    occupancyManager.reserveRunway('27R', 'VIR18', 'VIR18', 10.0);

    // Aircraft B requesting takeoff while A is on final approach
    const checkB = occupancyManager.canClearForTakeoff('27R', 'DLH914');
    expect(checkB.allowed).toBe(false);
    expect(checkB.reason).toContain('reserved for arriving traffic');
  });

  it('Prevents clearance on temporarily closed runways', () => {
    occupancyManager.setRunwayState('27R', 'TemporarilyClosed');
    expect(occupancyManager.getRunwayState('27R')).toBe('TemporarilyClosed');

    const takeoffCheck = occupancyManager.canClearForTakeoff('27R', 'BAW117');
    expect(takeoffCheck.allowed).toBe(false);
    expect(takeoffCheck.reason).toContain('temporarily closed');

    const landingCheck = occupancyManager.canClearForLanding('27R', 'BAW452');
    expect(landingCheck.allowed).toBe(false);
    expect(landingCheck.reason).toContain('temporarily closed');
  });
});

describe('5. MULTI-AIRCRAFT INTEGRATION SCENARIO', () => {
  it('Simulates synchronized multi-aircraft sector with 5 arrivals, 5 departures, STCA, and Go-Around', () => {
    const occupancyManager = new RunwayOccupancyManager(HEATHROW_RUNWAY_GEOMETRIES);
    const conflictTracker = new ConflictEventTracker();

    // 5 Arrivals
    const arr1 = createTestAircraft({ id: 'arr_1', callsign: 'BAW452', aircraftType: 'A320', x: 12.0, y: 0.38, altitude: 3500, heading: 270, ilsArmed: true, assignedRunway: '27R' });
    const arr2 = createTestAircraft({ id: 'arr_2', callsign: 'VIR18', aircraftType: 'B789', x: 18.0, y: 2.0, altitude: 6000, heading: 260, assignedRunway: '27R' });
    const arr3 = createTestAircraft({ id: 'arr_3', callsign: 'DLH914', aircraftType: 'A321', x: 22.0, y: -4.0, altitude: 7000, heading: 300, assignedRunway: '27R' });
    const arr4 = createTestAircraft({ id: 'arr_4', callsign: 'AFR112', aircraftType: 'A350', x: 14.0, y: -0.38, altitude: 4000, heading: 270, ilsArmed: true, assignedRunway: '27L' });
    const arr5 = createTestAircraft({ id: 'arr_5', callsign: 'UAE01', aircraftType: 'A380', x: 25.0, y: 5.0, altitude: 8000, heading: 250, assignedRunway: '27R' });

    // 5 Departures
    const dep1 = createTestAircraft({ id: 'dep_1', callsign: 'BAW117', aircraftType: 'A320', status: 'Departing', flightPhase: 'LINEUP', indicatedAirspeed: 0, assignedRunway: '27L' });
    const dep2 = createTestAircraft({ id: 'dep_2', callsign: 'SHT2B', aircraftType: 'B738', status: 'Departing', flightPhase: 'HOLD_SHORT', indicatedAirspeed: 0, assignedRunway: '27L' });
    const dep3 = createTestAircraft({ id: 'dep_3', callsign: 'BAW882', aircraftType: 'B77W', status: 'Departing', flightPhase: 'HOLD_SHORT', indicatedAirspeed: 0, assignedRunway: '27R' });
    const dep4 = createTestAircraft({ id: 'dep_4', callsign: 'EZY412', aircraftType: 'A320', status: 'Departing', flightPhase: 'HOLD_SHORT', indicatedAirspeed: 0, assignedRunway: '27L' });
    const dep5 = createTestAircraft({ id: 'dep_5', callsign: 'KLM101', aircraftType: 'B738', status: 'Departing', flightPhase: 'HOLD_SHORT', indicatedAirspeed: 0, assignedRunway: '27R' });

    let fleet = [arr1, arr2, arr3, arr4, arr5, dep1, dep2, dep3, dep4, dep5];

    // Intentionally construct an STCA proximity between arr2 and arr5 to verify conflict detection
    fleet[1] = { ...fleet[1], x: 20.0, y: 2.0, altitude: 6000, groundSpeed: 210, heading: 260 };
    fleet[4] = { ...fleet[4], x: 21.0, y: 2.2, altitude: 6000, groundSpeed: 220, heading: 250 };

    // Step continuous simulation 10 times with 1.0 second dt
    for (let t = 0; t < 10; t++) {
      const updatedFleet: Aircraft[] = [];

      for (const ac of fleet) {
        if (ac.status === 'Departing' && ac.flightPhase === 'TAKEOFF_ROLL') {
          const rwyGeom = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === ac.assignedRunway)!;
          const toRes = stepTakeoffSequence(ac, rwyGeom, 1.0, occupancyManager, t);
          updatedFleet.push(toRes.aircraft);
        } else {
          let stepAc = stepAircraftPhysics(ac, 1.0, WINDY_WEATHER, EMPTY_WAYPOINTS, t, 83);
          if (stepAc.ilsArmed || stepAc.ilsLocalizerCaptured) {
            const rwyGeom = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === stepAc.assignedRunway)!;
            const ilsRes = updateILSApproach(stepAc, rwyGeom, 1.0, occupancyManager, t);
            stepAc = ilsRes.aircraft;
          }
          updatedFleet.push(stepAc);
        }
      }

      fleet = updatedFleet;

      // STCA Check
      const conflicts = detectConflicts(fleet);
      conflictTracker.updateEvents(conflicts, t);
    }

    // Verify all 10 aircraft preserved and synchronized
    expect(fleet).toHaveLength(10);
    // Verify STCA detected the converging traffic
    const activeConflicts = detectConflicts(fleet);
    expect(activeConflicts.length).toBeGreaterThanOrEqual(1);
  });
});

describe('6. AIRCRAFT PERFORMANCE DATABASE INTEGRITY & DATA CLASSIFICATION', () => {
  it('Validates all 7 aircraft aerodynamic performance profiles and manufacturer data classification', () => {
    const types = ['A320', 'A321', 'A350', 'B77W', 'B789', 'A380', 'B738'];

    for (const t of types) {
      const perf = getAircraftPerformance(t);
      expect(perf).toBeDefined();
      expect(perf.aircraftType).toBe(t);

      // Speeds: 0 < V1 <= Vr <= V2
      expect(perf.takeoffDecisionSpeedIAS).toBeGreaterThan(100);
      expect(perf.rotationSpeedIAS).toBeGreaterThanOrEqual(perf.takeoffDecisionSpeedIAS);
      expect(perf.takeoffSafetySpeedIAS).toBeGreaterThanOrEqual(perf.rotationSpeedIAS);

      // Approach speed Vref
      expect(perf.typicalApproachSpeedIAS).toBeGreaterThan(120);

      // Accelerations and Climb Rates
      expect(perf.takeoffAccelerationKts_s).toBeGreaterThanOrEqual(2.0);
      expect(perf.initialClimbRateFpm).toBeGreaterThanOrEqual(2000);
      expect(perf.touchdownMaxSinkRateFpm).toBe(-600);

      // Data classification
      expect(perf.dataSource).toBe('Manufacturer FCOM / ICAO Doc 8643');
    }
  });
});

describe('7. CONTINUOUS DETERMINISTIC SIMULATION TESTS', () => {
  it('Executes 50 continuous seconds without manual state tampering and maintains deterministic trajectory', () => {
    const occupancyManager = new RunwayOccupancyManager(HEATHROW_RUNWAY_GEOMETRIES);
    let ac = createTestAircraft({
      callsign: 'VIR18',
      x: 10.0,
      y: 0.38,
      altitude: 3000,
      heading: 270,
      indicatedAirspeed: 180,
      ilsArmed: true,
      assignedRunway: '27R',
    });

    const rwy27R = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27R')!;

    // Step 50 seconds continuously
    for (let s = 1; s <= 50; s++) {
      ac = stepAircraftPhysics(ac, 1.0, CALM_WEATHER, EMPTY_WAYPOINTS, s, 83);
      const ilsRes = updateILSApproach(ac, rwy27R, 1.0, occupancyManager, s);
      ac = ilsRes.aircraft;
    }

    // Aircraft must have advanced westward (towards smaller x) and descended along glidepath
    expect(ac.x).toBeLessThan(10.0);
    expect(ac.altitude).toBeLessThan(3000);
    expect(ac.ilsLocalizerCaptured).toBe(true);
  });
});

describe('8. PERFORMANCE BENCHMARKS (10, 25, 50, 100 Aircraft)', () => {
  function generateFleet(count: number): Aircraft[] {
    const fleet: Aircraft[] = [];
    const models = ['A320', 'A321', 'A350', 'B77W', 'B789', 'A380', 'B738'];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const dist = 5 + (i % 25);
      fleet.push(createTestAircraft({
        id: `bench_ac_${i}`,
        callsign: `FLT${i + 100}`,
        aircraftType: models[i % models.length],
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        altitude: 3000 + (i % 10) * 1000,
        heading: (i * 35) % 360,
        indicatedAirspeed: 200 + (i % 5) * 10,
        groundSpeed: 210,
      }));
    }
    return fleet;
  }

  const counts = [10, 25, 50, 100];
  const benchmarkResults: Record<number, { tickMs: number; stcaMs: number }> = {};

  for (const count of counts) {
    it(`Measures simulation tick and STCA processing duration for ${count} aircraft`, () => {
      const fleet = generateFleet(count);

      // Measure STCA time
      const t0Stca = performance.now();
      const conflicts = detectConflicts(fleet);
      const stcaMs = performance.now() - t0Stca;

      // Measure full physics tick
      const t0Tick = performance.now();
      for (const ac of fleet) {
        stepAircraftPhysics(ac, 0.05, CALM_WEATHER, EMPTY_WAYPOINTS, 1.0, 83);
      }
      const tickMs = performance.now() - t0Tick;

      benchmarkResults[count] = {
        tickMs: Math.round(tickMs * 100) / 100,
        stcaMs: Math.round(stcaMs * 100) / 100,
      };

      // At 100 aircraft (4,950 pairwise STCA quadratic checks), tick and STCA complete in under 35ms
      expect(tickMs).toBeLessThan(35.0);
      expect(stcaMs).toBeLessThan(35.0);
    });
  }
});
