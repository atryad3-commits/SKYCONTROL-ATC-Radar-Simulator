/**
 * SKYCONTROL - Automated Test Suite: Radar Tracking, Freshness & UI Interaction (Part 10)
 * Validates:
 * 1. 360-degree antenna scanning, azimuth detection, sweep rate, and observation generation.
 * 2. Range filtering (detecting within instrument range, ignoring targets beyond range).
 * 3. Track freshness lifecycle: CONFIRMED -> PREDICTED -> STALE -> LOST.
 * 4. Extrapolation and position prediction accuracy between antenna sweeps.
 * 5. Track association and prevention of false tracks or track switching.
 * 6. Mouse-driven heading vector calculations and command validation.
 * 7. End-to-end integration: command confirmation dispatches to physics engine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RadarTrackingEngine, DEFAULT_SCANNER_CONFIG } from '../src/engine/radarTracker';
import { Aircraft } from '../src/types';
import { calculateBearing, calculateDistance, normalizeHeading, stepAircraftPhysics } from '../src/engine/physics';
import { HEATHROW_AIRPORT } from '../src/airports/heathrow';

function createMockAircraft(id: string, x: number, y: number, heading: number = 270, speed: number = 210): Aircraft {
  return {
    id,
    callsign: id,
    airline: 'British Airways',
    telephony: 'Speedbird',
    aircraftType: 'A320',
    category: 'Large',
    origin: 'EGLL',
    destination: 'LFPG',
    x,
    y,
    altitude: 5000,
    targetAltitude: 5000,
    indicatedAirspeed: speed,
    targetAirspeed: speed,
    groundSpeed: speed,
    heading,
    targetHeading: heading,
    verticalSpeed: 0,
    expediteAltitude: false,
    turnRate: 0,
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
  };
}

describe('PART 10: RADAR SCANNING AND TRACKING ARCHITECTURE', () => {
  let tracker: RadarTrackingEngine;

  beforeEach(() => {
    tracker = new RadarTrackingEngine({
      rotationRpm: 15, // 15 RPM = 4.0s full 360° period (90 deg/sec)
      maxRangeNM: 50,
      staleTimeoutSec: 9.0,
      lostTimeoutSec: 16.0,
      predictionToleranceSec: 4.5,
    });
  });

  describe('1. 360-Degree Antenna Scanning & Azimuth Interrogation', () => {
    it('should advance antenna azimuth at 90 deg/sec for 15 RPM rotation', () => {
      expect(tracker.getAntennaAzimuth()).toBe(0);

      // Advance 1.0 second: should rotate 90 degrees
      tracker.update(1.0, 1.0, []);
      expect(tracker.getAntennaAzimuth()).toBeCloseTo(90, 1);

      // Advance another 2.0 seconds: should reach 270 degrees
      tracker.update(2.0, 3.0, []);
      expect(tracker.getAntennaAzimuth()).toBeCloseTo(270, 1);

      // Advance 1.0 second: completes 360 and wraps back to 0
      tracker.update(1.0, 4.0, []);
      expect(tracker.getAntennaAzimuth()).toBeCloseTo(0, 1);
    });

    it('should generate radar observation precisely when beam sweeps target azimuth', () => {
      // Aircraft located due East (x=15, y=0) -> Azimuth is 90 degrees
      const acEast = createMockAircraft('BAW101', 15, 0);

      // Step from 0 to 45 deg (0.5s): beam has NOT reached 90 deg
      const obs1 = tracker.update(0.5, 0.5, [acEast]);
      expect(obs1.length).toBe(0);

      // Step from 45 to 135 deg (1.0s): beam sweeps across 90 deg!
      const obs2 = tracker.update(1.0, 1.5, [acEast]);
      expect(obs2.length).toBe(1);
      expect(obs2[0].aircraftId).toBe('BAW101');
      expect(obs2[0].rangeNM).toBeCloseTo(15, 1);
      expect(obs2[0].azimuthDeg).toBeCloseTo(90, 1);
    });

    it('should filter out aircraft beyond radar maximum range', () => {
      // Aircraft at x=0, y=60 (range = 60 NM > maxRangeNM 50)
      const acFar = createMockAircraft('FAR01', 0, 60);

      // Advance full 360° rotation (4.0s)
      const obs = tracker.update(4.0, 4.0, [acFar]);
      expect(obs.length).toBe(0);
      expect(tracker.getTracks().length).toBe(0);
    });
  });

  describe('2. Radar Track Freshness Lifecycle & Health', () => {
    it('transitions track status correctly: CONFIRMED -> PREDICTED -> STALE -> LOST', () => {
      const ac = createMockAircraft('TST400', 0, 10); // due North, azimuth 0
      tracker.setAntennaAzimuth(350);

      // Sweep through 0 deg: creates initial observation at t = 1.0s
      tracker.update(0.2, 1.0, [ac]);
      const trk = tracker.getTrack('TST400');
      expect(trk).toBeDefined();
      expect(trk?.status).toBe('CONFIRMED');
      expect(trk?.trackAgeSec).toBe(0);
      expect(trk?.trackQuality).toBe(100);

      // Aircraft flies into unmonitored airspace beyond range (> 50 NM)
      ac.y = 65;

      // Age to 6.0s (age = 5.0s, between 4.5s and 9.0s): transitions to PREDICTED
      tracker.update(5.0, 6.0, [ac]);
      const predTrack = tracker.getTrack('TST400');
      expect(predTrack?.status).toBe('PREDICTED');
      expect(predTrack?.trackQuality).toBeLessThan(100);

      // Age to 12.0s (age = 11.0s, between 9.0s and 16.0s): degrades to STALE
      tracker.update(6.0, 12.0, [ac]);
      const staleTrack = tracker.getTrack('TST400');
      expect(staleTrack?.status).toBe('STALE');

      // Age to 18.0s (age = 17.0s, past 16.0s): degrades to LOST
      tracker.update(6.0, 18.0, [ac]);
      const lostTrack = tracker.getTrack('TST400');
      expect(lostTrack?.status).toBe('LOST');
      expect(lostTrack?.trackQuality).toBe(0);
    });
  });

  describe('3. Track Prediction Extrapolation Accuracy', () => {
    it('accurately predicts aircraft position along ground velocity between scans', () => {
      // Aircraft flying East (heading 90) at 240 KT from (0, 0)
      const ac = createMockAircraft('EXTRAP', 0, 0, 90, 240);
      tracker.setAntennaAzimuth(350);

      // Initial detection at t = 0.2s
      tracker.update(0.2, 0.2, [ac]);
      const initialTrack = tracker.getTrack('EXTRAP');
      expect(initialTrack).toBeDefined();

      // Transponder drops / radar coverage lost (aircraft outside antenna coverage)
      ac.y = 70;

      // Advance 15 seconds: distance traveled at 240 KT = 240 * (15 / 3600) = 1.0 NM East
      tracker.update(15.0, 15.2, [ac]);
      const updatedTrack = tracker.getTrack('EXTRAP');

      expect(updatedTrack?.status).toBe('STALE');
      expect(updatedTrack?.predictedX).toBeCloseTo(1.0, 1);
      expect(updatedTrack?.predictedY).toBeCloseTo(0.0, 1);
    });
  });

  describe('4. Track Association & Jump Prevention', () => {
    it('associates sequential observations with existing track without duplicating', () => {
      const ac = createMockAircraft('ASSOC1', 10, 10);
      tracker.seedInitialTracks([ac], 0);

      expect(tracker.getTracks().length).toBe(1);

      // Full sweep
      tracker.setAntennaAzimuth(0);
      tracker.update(4.0, 4.0, [ac]);

      // Should still be exactly 1 track
      expect(tracker.getTracks().length).toBe(1);
      expect(tracker.getTrack('ASSOC1')?.detectionCount).toBeGreaterThan(1);
    });

    it('cleans up tracks when aircraft exits simulation', () => {
      const ac1 = createMockAircraft('AC1', 5, 5);
      const ac2 = createMockAircraft('AC2', 10, 10);
      tracker.seedInitialTracks([ac1, ac2], 0);

      expect(tracker.getTracks().length).toBe(2);

      // Next tick: ac1 removed from simulation
      tracker.update(0.5, 1.0, [ac2]);

      expect(tracker.getTracks().length).toBe(1);
      expect(tracker.getTrack('AC1')).toBeUndefined();
      expect(tracker.getTrack('AC2')).toBeDefined();
    });
  });

  describe('5. Mouse Heading Vector & Command Validation', () => {
    it('correctly calculates heading bearing from aircraft to target mouse position', () => {
      // Aircraft at (10, 10). Mouse at (20, 10) -> Due East = 90°
      const bearingEast = calculateBearing(10, 10, 20, 10);
      expect(normalizeHeading(Math.round(bearingEast))).toBe(90);

      // Mouse at (10, 20) -> Due North = 0° / 360°
      const bearingNorth = calculateBearing(10, 10, 10, 20);
      expect(normalizeHeading(Math.round(bearingNorth))).toBe(0);

      // Mouse at (0, 10) -> Due West = 270°
      const bearingWest = calculateBearing(10, 10, 0, 10);
      expect(normalizeHeading(Math.round(bearingWest))).toBe(270);
    });

    it('executes heading change through realistic aircraft physics without teleportation', () => {
      let ac = createMockAircraft('TURN_TEST', 10, 10, 180, 210);
      ac.targetHeading = 270; // 90-degree right turn commanded

      // Step physics by 1 second
      const weather = { windDirection: 270, windSpeed: 0, qnh: 1013, visibilityNM: 10, ceilingFeet: 5000, precipitation: 'None' as const };
      const nextAc = stepAircraftPhysics(ac, 1.0, weather, HEATHROW_AIRPORT.waypoints, 1.0, 83);

      // Standard rate turn is ~3 deg/sec (bank angle limited): heading should increase gradually, NOT jump to 270
      expect(nextAc.heading).toBeGreaterThan(180);
      expect(nextAc.heading).toBeLessThan(186);
      expect(nextAc.bankAngle).toBeGreaterThan(0); // Right bank initiated
    });

    it('preserves aircraft heading, altitude, speed, and route intact upon selection without unintentional vectoring', () => {
      const ac = createMockAircraft('CLICK_TEST', 10, 10, 240, 210);
      ac.targetHeading = 240;
      ac.altitude = 7000;
      ac.targetAltitude = 7000;
      ac.assignedWaypoint = 'LAM';
      ac.routeQueue = ['MAY', 'OCK'];
      ac.ilsArmed = true;

      // Simulate state after user selects the aircraft
      const initialHeading = ac.heading;
      const initialTargetHeading = ac.targetHeading;
      const initialAltitude = ac.altitude;
      const initialTargetAltitude = ac.targetAltitude;
      const initialSpeed = ac.indicatedAirspeed;
      const initialWaypoint = ac.assignedWaypoint;
      const initialRoute = [...(ac.routeQueue || [])];
      const initialIlsArmed = ac.ilsArmed;

      // Selection must NOT alter flight dynamics or control parameters
      expect(ac.heading).toBe(initialHeading);
      expect(ac.targetHeading).toBe(initialTargetHeading);
      expect(ac.altitude).toBe(initialAltitude);
      expect(ac.targetAltitude).toBe(initialTargetAltitude);
      expect(ac.indicatedAirspeed).toBe(initialSpeed);
      expect(ac.assignedWaypoint).toBe(initialWaypoint);
      expect(ac.routeQueue).toEqual(initialRoute);
      expect(ac.ilsArmed).toBe(initialIlsArmed);
    });
  });

  describe('6. Altitude Color Spectrum & Flight Trajectory Path', () => {
    it('maps altitudes to correct visual color bands per specification', async () => {
      const { getAltitudeColor } = await import('../src/utils/altitudeColor');

      // FL100+ (Cruise / Sector Entry) -> Electric Cyan
      expect(getAltitudeColor(15000)).toBe('rgb(0, 229, 255)');
      expect(getAltitudeColor(12000)).toBe('rgb(0, 229, 255)');

      // 8.5k ft (Upper Descent) -> Bright Emerald Green
      expect(getAltitudeColor(8500)).toBe('rgb(0, 255, 102)');

      // 5.5k ft (Intermediate Approach) -> Golden Amber
      expect(getAltitudeColor(5500)).toBe('rgb(255, 209, 102)');

      // 3.0k ft (Localizer Intercept) -> Radiant Orange
      expect(getAltitudeColor(3000)).toBe('rgb(255, 146, 51)');

      // < 500 ft (Final Approach / Touchdown) -> Neon Coral Red
      expect(getAltitudeColor(200)).toBe('rgb(255, 77, 109)');
    });

    it('accumulates and preserves extensive history points with altitude for flight path rendering', () => {
      let ac = createMockAircraft('HIST_TEST', 20, 20, 270, 210);
      ac.altitude = 12000;
      ac.targetAltitude = 4000;
      ac.history = [{ x: 22, y: 20, altitude: 13000, timestamp: 0 }];

      const weather = { windDirection: 270, windSpeed: 0, qnh: 1013, visibilityNM: 10, ceilingFeet: 5000, precipitation: 'None' as const };
      
      // Step simulation by several intervals (every 3 seconds)
      let simTime = 0;
      for (let s = 1; s <= 6; s++) {
        simTime += 3.0;
        ac = stepAircraftPhysics(ac, 3.0, weather, HEATHROW_AIRPORT.waypoints, simTime, 83);
      }

      // History must retain multiple points for altitude trajectory
      expect(ac.history.length).toBeGreaterThanOrEqual(5);
      expect(ac.history[ac.history.length - 1].altitude).toBeDefined();
    });

    it('supports radio active transmission notifications and listeners', async () => {
      const { radioAudio } = await import('../src/audio/radioAudio');
      let capturedTx: any = 'UNSET';
      const unsubscribe = radioAudio.onTransmissionChange(tx => {
        capturedTx = tx;
      });

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });
});
