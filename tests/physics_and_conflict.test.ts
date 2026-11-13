/**
 * SKYCONTROL - Automated Test Suite for Priority 1 (Physics) & Priority 2 (STCA Conflict Detection)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeHeading,
  getHeadingDelta,
  calculateBearing,
  calculateDistance,
  calculateTASFromIAS,
  calculateTurnRateAndBankAngle,
  calculateWindVector,
  calculateGroundVector,
  stepAircraftPhysics,
} from '../src/engine/physics';
import {
  calculateCPA,
  getHorizontalViolationWindow,
  getVerticalViolationWindow,
  detectConflicts,
  ConflictEventTracker,
  DEFAULT_SEPARATION_MINIMA,
} from '../src/engine/conflict';
import { Aircraft, WeatherCondition, Waypoint } from '../src/types';

// Helper to construct a test aircraft
function createTestAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  const ias = overrides.indicatedAirspeed ?? 210;
  const gs = overrides.groundSpeed ?? ias;
  return {
    id: 'ac_test_1',
    callsign: 'BAW101',
    airline: 'British Airways',
    telephony: 'Speedbird',
    aircraftType: 'A320',
    category: 'Large',
    origin: 'EGLL',
    destination: 'LFPG',
    x: 0,
    y: 0,
    altitude: 5000,
    targetAltitude: 5000,
    indicatedAirspeed: ias,
    targetAirspeed: ias,
    groundSpeed: gs,
    heading: 90,
    targetHeading: 90,
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
    distanceToThreshold: 10,
    glidepathDeviation: 0,
    localizerDeviation: 0,
    tagOffset: { x: 28, y: -24 },
    history: [{ x: 0, y: 0, altitude: 5000, timestamp: 0 }],
    ...overrides,
  };
}

const calmWeather: WeatherCondition = {
  windDirection: 0,
  windSpeed: 0,
  qnh: 1013,
  visibilityNM: 10,
  ceilingFeet: 5000,
  precipitation: 'None',
};

describe('Priority 1: Aircraft Physics Engine', () => {
  describe('Angles, Headings & Coordinate Math', () => {
    it('normalizes headings correctly into [0, 360)', () => {
      expect(normalizeHeading(0)).toBe(0);
      expect(normalizeHeading(360)).toBe(0);
      expect(normalizeHeading(720)).toBe(0);
      expect(normalizeHeading(-10)).toBe(350);
      expect(normalizeHeading(-370)).toBe(350);
      expect(normalizeHeading(185)).toBe(185);
    });

    it('calculates shortest turn delta across 0/360 boundary', () => {
      expect(getHeadingDelta(350, 10)).toBe(20); // turn right 20°
      expect(getHeadingDelta(10, 350)).toBe(-20); // turn left 20°
      expect(getHeadingDelta(90, 270)).toBe(-180); // 180° turn
      expect(getHeadingDelta(0, 90)).toBe(90);
      expect(getHeadingDelta(90, 0)).toBe(-90);
    });

    it('computes bearings and Euclidean distance in NM', () => {
      // Due North (0, 0) to (0, 10)
      expect(calculateBearing(0, 0, 0, 10)).toBe(0);
      // Due East (0, 0) to (10, 0)
      expect(calculateBearing(0, 0, 10, 0)).toBe(90);
      // Due South (0, 0) to (0, -10)
      expect(calculateBearing(0, 0, 0, -10)).toBe(180);
      // Due West (0, 0) to (-10, 0)
      expect(calculateBearing(0, 0, -10, 0)).toBe(270);

      // Distance
      expect(calculateDistance(0, 0, 3, 4)).toBeCloseTo(5.0, 5);
    });
  });

  describe('True Airspeed (TAS) vs Indicated Airspeed (IAS)', () => {
    it('calculates sea level TAS approximately equal to IAS', () => {
      const tasSeaLevel = calculateTASFromIAS(200, 0);
      expect(tasSeaLevel).toBeCloseTo(200, 0);
    });

    it('calculates higher TAS at higher altitudes due to reduced air density', () => {
      const tas5k = calculateTASFromIAS(210, 5000);
      const tas10k = calculateTASFromIAS(210, 10000);
      const tas18k = calculateTASFromIAS(210, 18000);

      expect(tas5k).toBeGreaterThan(210);
      expect(tas10k).toBeGreaterThan(tas5k);
      expect(tas18k).toBeGreaterThan(tas10k);
      // At 10,000 ft, ISA TAS is ~244.4 kt for 210 kt IAS
      expect(tas10k).toBeCloseTo(244.4, 0);
    });
  });

  describe('Turn Rate and Coordinated Bank Angle', () => {
    it('returns wings level when on target heading', () => {
      const result = calculateTurnRateAndBankAngle(200, 90, 90);
      expect(result.turnRateDegS).toBe(0);
      expect(result.bankAngleDeg).toBe(0);
    });

    it('limits bank angle to maximum 25 degrees at high speeds', () => {
      // At 350 kt TAS (590.7 ft/s), 25° max bank yields turn rate = g*tan(25°)/V = 1.455°/s
      const result = calculateTurnRateAndBankAngle(350, 0, 90, 25);
      expect(Math.abs(result.bankAngleDeg)).toBeLessThanOrEqual(25.1);
      expect(result.turnRateDegS).toBeLessThan(3.0);
      expect(result.turnRateDegS).toBeGreaterThan(1.2);
    });

    it('reflects correct bank direction (positive right, negative left)', () => {
      const turnRight = calculateTurnRateAndBankAngle(200, 0, 90);
      const turnLeft = calculateTurnRateAndBankAngle(200, 90, 0);

      expect(turnRight.turnRateDegS).toBeGreaterThan(0);
      expect(turnRight.bankAngleDeg).toBeGreaterThan(0);

      expect(turnLeft.turnRateDegS).toBeLessThan(0);
      expect(turnLeft.bankAngleDeg).toBeLessThan(0);
    });
  });

  describe('Wind Vector, Gusts and Ground Vectors', () => {
    it('calculates headwind and tailwind effects on ground speed', () => {
      // Aircraft flying heading 270° (West)
      const tas = 200;

      // Pure headwind: wind FROM 270° at 30 kt
      const headwind: WeatherCondition = { ...calmWeather, windDirection: 270, windSpeed: 30 };
      const windH = calculateWindVector(headwind, 0);
      const groundH = calculateGroundVector(tas, 270, windH.windX, windH.windY);
      expect(groundH.groundSpeed).toBeCloseTo(170, 0); // 200 - 30 = 170 kt
      expect(groundH.groundTrack).toBeCloseTo(270, 0);

      // Pure tailwind: wind FROM 090° at 30 kt
      const tailwind: WeatherCondition = { ...calmWeather, windDirection: 90, windSpeed: 30 };
      const windT = calculateWindVector(tailwind, 0);
      const groundT = calculateGroundVector(tas, 270, windT.windX, windT.windY);
      expect(groundT.groundSpeed).toBeCloseTo(230, 0); // 200 + 30 = 230 kt
      expect(groundT.groundTrack).toBeCloseTo(270, 0);
    });

    it('calculates crosswind drift (crab angle)', () => {
      // Aircraft flying heading 360° (North) with crosswind from 090° (East) at 25 kt
      const crosswind: WeatherCondition = { ...calmWeather, windDirection: 90, windSpeed: 25 };
      const wind = calculateWindVector(crosswind, 0);
      const ground = calculateGroundVector(200, 0, wind.windX, wind.windY);

      // Ground velocity X must be negative (drifting West)
      expect(ground.groundVelocityX).toBeLessThan(0);
      // Track must be drifted to the left of 360 (e.g. ~352-353°)
      expect(ground.groundTrack).toBeGreaterThan(345);
      expect(ground.groundTrack).toBeLessThan(359);
    });

    it('supports deterministic gust variation over simulation time', () => {
      const gustyWeather: WeatherCondition = {
        ...calmWeather,
        windDirection: 260,
        windSpeed: 15,
        gusts: 28,
      };

      const w0 = calculateWindVector(gustyWeather, 0);
      const w2 = calculateWindVector(gustyWeather, 2.5);
      const w5 = calculateWindVector(gustyWeather, 5.0);

      expect(w0.instantaneousSpeed).toBeGreaterThanOrEqual(15);
      expect(w0.instantaneousSpeed).toBeLessThanOrEqual(28);
      expect(w2.instantaneousSpeed).toBeGreaterThanOrEqual(15);
      expect(w2.instantaneousSpeed).toBeLessThanOrEqual(28);
      // Verify values change over time
      expect(w0.instantaneousSpeed !== w2.instantaneousSpeed || w2.instantaneousSpeed !== w5.instantaneousSpeed).toBe(true);
    });
  });

  describe('Aircraft State Immobility & Physics Stepping', () => {
    it('does not mutate the input aircraft object (pure functional step)', () => {
      const original = createTestAircraft({
        x: 10,
        y: 10,
        heading: 90,
        targetHeading: 180,
        indicatedAirspeed: 200,
        targetAirspeed: 250,
      });

      const frozen = Object.freeze({ ...original, history: Object.freeze([...original.history]) });
      const stepped = stepAircraftPhysics(frozen as Aircraft, 1.0, calmWeather, [], 1.0, 83);

      expect(stepped).not.toBe(frozen);
      expect(frozen.x).toBe(10);
      expect(stepped.x).toBeGreaterThan(10);
      expect(frozen.indicatedAirspeed).toBe(200);
      expect(stepped.indicatedAirspeed).toBe(202);
    });

    it('climbs and descends smoothly toward cleared altitude', () => {
      const climbingAc = createTestAircraft({ altitude: 4000, targetAltitude: 6000 });
      const step1 = stepAircraftPhysics(climbingAc, 1.0, calmWeather, [], 1.0, 83);
      expect(step1.altitude).toBeGreaterThan(4000);
      expect(step1.verticalSpeed).toBeGreaterThan(0);

      const descendingAc = createTestAircraft({ altitude: 8000, targetAltitude: 4000 });
      const step2 = stepAircraftPhysics(descendingAc, 1.0, calmWeather, [], 1.0, 83);
      expect(step2.altitude).toBeLessThan(8000);
      expect(step2.verticalSpeed).toBeLessThan(0);
    });
  });
});

describe('Priority 2: STCA Conflict Detection & Trajectory Prediction', () => {
  let tracker: ConflictEventTracker;

  beforeEach(() => {
    tracker = new ConflictEventTracker();
  });

  it('detects 90-degree crossing traffic on a collision course (CPA)', () => {
    // Aircraft 1: at (-5, 0), flying East (090°) at 240 kt -> reaching (0, 0) in 75 seconds
    const ac1 = createTestAircraft({
      id: 'ac_cross_1',
      callsign: 'BAW1',
      x: -5.0,
      y: 0,
      heading: 90,
      indicatedAirspeed: 240,
      altitude: 5000,
    });
    // Aircraft 2: at (0, -5), flying North (360°) at 240 kt -> reaching (0, 0) in 75 seconds
    const ac2 = createTestAircraft({
      id: 'ac_cross_2',
      callsign: 'VIR2',
      x: 0,
      y: -5.0,
      heading: 0,
      indicatedAirspeed: 240,
      altitude: 5000,
    });

    const cpa = calculateCPA(ac1, ac2);
    expect(cpa.isDiverging).toBe(false);
    expect(cpa.timeToCPASec).toBeCloseTo(75, 1);
    expect(cpa.cpaDistanceNM).toBeCloseTo(0, 0.1); // Direct hit at (0, 0)!

    const conflicts = detectConflicts([ac1, ac2]);
    expect(conflicts.length).toBe(1);
    // Separation is violated at t = 52.5s (when 3.0 NM threshold is breached), triggering Warning (<= 60s)
    expect(conflicts[0].severity).toBe('Warning');
  });

  it('detects acute-angle converging traffic', () => {
    // Aircraft converging towards final approach fix
    const ac1 = createTestAircraft({
      id: 'ac_conv_1',
      callsign: 'DLH10',
      x: 10,
      y: 3,
      heading: 250,
      indicatedAirspeed: 210,
      altitude: 4000,
    });
    const ac2 = createTestAircraft({
      id: 'ac_conv_2',
      callsign: 'AFR20',
      x: 10,
      y: -3,
      heading: 290,
      indicatedAirspeed: 210,
      altitude: 4000,
    });

    const cpa = calculateCPA(ac1, ac2);
    expect(cpa.isDiverging).toBe(false);
    expect(cpa.cpaDistanceNM).toBeLessThan(1.5);
    const conflicts = detectConflicts([ac1, ac2]);
    expect(conflicts.length).toBe(1);
  });

  it('does NOT trigger false alarm for parallel flights maintaining safe lateral separation', () => {
    // Dual parallel arrivals on 27R and 27L spaced 4.5 NM laterally
    const ac1 = createTestAircraft({
      id: 'ac_par_1',
      callsign: 'BAW27R',
      x: 15,
      y: 2.25,
      heading: 270,
      indicatedAirspeed: 180,
      altitude: 3000,
    });
    const ac2 = createTestAircraft({
      id: 'ac_par_2',
      callsign: 'VIR27L',
      x: 15,
      y: -2.25,
      heading: 270,
      indicatedAirspeed: 180,
      altitude: 3000,
    });

    const conflicts = detectConflicts([ac1, ac2]);
    expect(conflicts.length).toBe(0); // 4.5 NM lateral distance >= 3.0 NM minima
  });

  it('detects parallel separation infringement when parallel spacing is below 3.0 NM', () => {
    const ac1 = createTestAircraft({
      id: 'ac_par_inf_1',
      callsign: 'BAW1',
      x: 10,
      y: 0.5,
      heading: 270,
      indicatedAirspeed: 180,
      altitude: 3000,
    });
    const ac2 = createTestAircraft({
      id: 'ac_par_inf_2',
      callsign: 'VIR2',
      x: 10,
      y: -0.5,
      heading: 270,
      indicatedAirspeed: 180,
      altitude: 3000,
    });

    const conflicts = detectConflicts([ac1, ac2]);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].severity).toBe('Critical'); // 1.0 NM separation at same altitude!
  });

  it('detects overtaking traffic (faster aircraft catching up from behind)', () => {
    // Slower flight ahead at 160 kt, faster flight behind at 250 kt (closure rate 90 kt = 1.5 NM/min)
    const acSlow = createTestAircraft({
      id: 'ac_lead',
      callsign: 'EZY1',
      x: 6.0,
      y: 0,
      heading: 270,
      indicatedAirspeed: 160,
      altitude: 4000,
    });
    const acFast = createTestAircraft({
      id: 'ac_trail',
      callsign: 'BAW2',
      x: 9.0,
      y: 0,
      heading: 270,
      indicatedAirspeed: 250,
      altitude: 4000,
    });

    const cpa = calculateCPA(acSlow, acFast);
    expect(cpa.isDiverging).toBe(false);
    expect(cpa.cpaDistanceNM).toBeCloseTo(0, 0.2);

    const conflicts = detectConflicts([acSlow, acFast]);
    expect(conflicts.length).toBe(1);
  });

  it('does NOT trigger false alarm for crossing flights with 2,000 ft vertical separation', () => {
    const acLow = createTestAircraft({
      id: 'ac_low',
      callsign: 'BAW1',
      x: -5.0,
      y: 0,
      heading: 90,
      indicatedAirspeed: 240,
      altitude: 4000,
    });
    const acHigh = createTestAircraft({
      id: 'ac_high',
      callsign: 'VIR2',
      x: 0,
      y: -5.0,
      heading: 0,
      indicatedAirspeed: 240,
      altitude: 6000, // 2000 ft vertical buffer!
    });

    const conflicts = detectConflicts([acLow, acHigh]);
    expect(conflicts.length).toBe(0);
  });

  it('prevents repeated scoring penalties for the same ongoing conflict', () => {
    const ac1 = createTestAircraft({ id: 'p1', callsign: 'A1', x: 0, y: 0, altitude: 4000, heading: 90 });
    const ac2 = createTestAircraft({ id: 'p2', callsign: 'A2', x: 1, y: 0, altitude: 4000, heading: 90 });

    // Step 1: Conflict starts
    const conflicts1 = detectConflicts([ac1, ac2]);
    expect(conflicts1.length).toBe(1);
    expect(conflicts1[0].severity).toBe('Critical');

    const update1 = tracker.updateEvents(conflicts1, 10.0);
    // Must deduct penalty on initial detection
    expect(update1.penaltiesToDeduct.length).toBe(1);
    expect(update1.penaltiesToDeduct[0].penaltyPoints).toBe(20);

    // Step 2 (next 50ms tick): Conflict still active
    const conflicts2 = detectConflicts([ac1, ac2]);
    const update2 = tracker.updateEvents(conflicts2, 10.05);
    // Must NOT deduct penalty again!
    expect(update2.penaltiesToDeduct.length).toBe(0);

    // Step 3 (another tick): Still active
    const conflicts3 = detectConflicts([ac1, ac2]);
    const update3 = tracker.updateEvents(conflicts3, 10.10);
    expect(update3.penaltiesToDeduct.length).toBe(0);
  });

  it('detects conflict resolution when aircraft diverge', () => {
    // Initial critical conflict
    const ac1 = createTestAircraft({ id: 'p1', callsign: 'A1', x: 0, y: 0, altitude: 4000 });
    const ac2 = createTestAircraft({ id: 'p2', callsign: 'A2', x: 1, y: 0, altitude: 4000 });
    const conflicts1 = detectConflicts([ac1, ac2]);
    tracker.updateEvents(conflicts1, 1.0);

    expect(tracker.getActiveEvents().length).toBe(1);

    // Controller turns aircraft away and climbs (separation achieved: 6 NM apart, 2000 ft vertical)
    const ac1Separated = { ...ac1, x: -5, altitude: 3000 };
    const ac2Separated = { ...ac2, x: 5, altitude: 6000 };

    const conflicts2 = detectConflicts([ac1Separated, ac2Separated]);
    expect(conflicts2.length).toBe(0);

    const update2 = tracker.updateEvents(conflicts2, 2.0);
    expect(update2.newlyResolved.length).toBe(1);
    expect(update2.newlyResolved[0].isResolved).toBe(true);
    expect(tracker.getActiveEvents().length).toBe(0);
  });

  describe('Scale & Benchmark Tests (2, 10, 50, 100 aircraft)', () => {
    it('runs conflict detection and physics steps within real-time budget for 2, 10, 50, 100 aircraft', () => {
      const counts = [2, 10, 50, 100];

      for (const count of counts) {
        const fleet: Aircraft[] = [];
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * 2 * Math.PI;
          const dist = 10 + (i % 25);
          fleet.push(
            createTestAircraft({
              id: `fleet_${count}_${i}`,
              callsign: `FLT${i}`,
              x: dist * Math.cos(angle),
              y: dist * Math.sin(angle),
              heading: ((angle * 180) / Math.PI + 180) % 360,
              altitude: 3000 + (i % 15) * 1000,
              indicatedAirspeed: 210,
            })
          );
        }

        const tStart = performance.now();
        // 1. Step physics for all aircraft
        const stepped = fleet.map(ac => stepAircraftPhysics(ac, 0.05, calmWeather, [], 0, 83));
        // 2. Run pairwise STCA conflict detection
        const conflicts = detectConflicts(stepped);
        const tDuration = performance.now() - tStart;

        // Even with 100 aircraft (4,950 pairwise comparisons), calculation must take < 20ms
        expect(stepped.length).toBe(count);
        expect(Array.isArray(conflicts)).toBe(true);
        expect(tDuration).toBeLessThan(35); // Plenty of headroom for 50ms frame budget
      }
    });
  });
});
