/**
 * SKYCONTROL - Test Suite for Multi-Class Aircraft Silhouettes & Performance Envelopes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AIRCRAFT_PERFORMANCE_DATABASE,
  getAircraftClassPresets,
  getAircraftOperationalBounds,
  getAircraftPerformance,
} from '../src/engine/aircraftPerformance';
import { stepAircraftPhysics } from '../src/engine/physics';
import {
  generateInboundFlight,
  generateDepartureFlight,
} from '../src/engine/trafficGenerator';
import { getZoomCompensationFactor } from '../src/utils/aircraftSilhouettes';
import { useSimulationStore } from '../src/store/simulationStore';
import { HEATHROW_AIRPORT } from '../src/airports/heathrow';
import { Aircraft, WeatherCondition } from '../src/types';

const calmWeather: WeatherCondition = {
  windDirection: 270,
  windSpeed: 0,
  qnh: 1013,
  visibilityNM: 10,
  ceilingFeet: 5000,
  precipitation: 'None',
};

function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 'ac_env_test',
    callsign: 'N172SP',
    airline: 'General Aviation',
    telephony: 'N172SP',
    aircraftType: 'C172',
    category: 'Small',
    aircraftClass: 'LIGHT_GA',
    origin: 'EGTB',
    destination: 'EGLL',
    x: 10,
    y: 5,
    altitude: 3500,
    targetAltitude: 3500,
    indicatedAirspeed: 110,
    targetAirspeed: 110,
    groundSpeed: 110,
    heading: 270,
    targetHeading: 270,
    verticalSpeed: 0,
    expediteAltitude: false,
    turnRate: 0,
    bankAngle: 0,
    status: 'Inbound',
    assignedRunway: '27R',
    transponder: '4505',
    assignedWaypoint: null,
    holdingWaypoint: null,
    holdingInboundHeading: 270,
    holdingLegTime: 60,
    holdingTimer: 0,
    holdingLeg: 'Inbound',
    ilsArmed: false,
    ilsLocalizerCaptured: false,
    ilsGlideslopeCaptured: false,
    tagOffset: { x: 24, y: -24 },
    history: [{ x: 10, y: 5, altitude: 3500, timestamp: 0 }],
    ...overrides,
  };
}

describe('Aircraft Models, Silhouettes & Performance Envelopes', () => {
  it('assigns distinct silhouettes and scaled sizes across all 5 civil classes', () => {
    const a380 = getAircraftPerformance('A380');
    const b77w = getAircraftPerformance('B77W');
    const a320 = getAircraftPerformance('A320');
    const glf5 = getAircraftPerformance('GLF5');
    const dh8d = getAircraftPerformance('DH8D');
    const c172 = getAircraftPerformance('C172');

    expect(a380.radarSilhouette).toBe('HEAVY_QUAD');
    expect(b77w.radarSilhouette).toBe('HEAVY_TWIN');
    expect(a320.radarSilhouette).toBe('NARROWBODY');
    expect(glf5.radarSilhouette).toBe('BIZJET');
    expect(dh8d.radarSilhouette).toBe('TURBOPROP');
    expect(c172.radarSilhouette).toBe('LIGHT_GA');

    // Wingspan scale hierarchy: Heavy > Narrowbody > Bizjet/Turboprop > Light GA
    expect(a380.wingSpanScale).toBeGreaterThan(b77w.wingSpanScale);
    expect(b77w.wingSpanScale).toBeGreaterThan(a320.wingSpanScale);
    expect(a320.wingSpanScale).toBeGreaterThan(c172.wingSpanScale);
    expect(dh8d.wingSpanScale).toBeGreaterThan(c172.wingSpanScale);
    expect(getZoomCompensationFactor(10)).toBeGreaterThan(getZoomCompensationFactor(90));
  });

  it('models realistically higher cruise speed, max speed, climb rate, and ceiling for jets vs. turboprops vs. Light GA', () => {
    const b77w = getAircraftPerformance('B77W');
    const a320 = getAircraftPerformance('A320');
    const dh8d = getAircraftPerformance('DH8D');
    const c172 = getAircraftPerformance('C172');

    expect(b77w.maxAirspeedIAS).toBeGreaterThan(dh8d.maxAirspeedIAS);
    expect(a320.maxAirspeedIAS).toBeGreaterThan(dh8d.maxAirspeedIAS);
    expect(dh8d.maxAirspeedIAS).toBeGreaterThan(c172.maxAirspeedIAS);

    expect(a320.maxClimbRateFpm).toBeGreaterThan(dh8d.maxClimbRateFpm);
    expect(dh8d.maxClimbRateFpm).toBeGreaterThan(c172.maxClimbRateFpm);

    expect(a320.serviceCeilingFt).toBeGreaterThan(dh8d.serviceCeilingFt);
    expect(dh8d.serviceCeilingFt).toBeGreaterThan(c172.serviceCeilingFt);
    expect(c172.serviceCeilingFt).toBe(14000);
  });

  it('provides full coverage for all models referenced in the performance database', () => {
    for (const [code, perf] of Object.entries(AIRCRAFT_PERFORMANCE_DATABASE)) {
      expect(perf.aircraftType).toBe(code);
      expect(perf.minAirspeedIAS).toBeLessThan(perf.maxAirspeedIAS);
      expect(perf.typicalApproachSpeedIAS).toBeLessThanOrEqual(perf.minAirspeedIAS);
      expect(perf.cruiseAirspeedIAS).toBeGreaterThanOrEqual(perf.minAirspeedIAS);
      expect(perf.cruiseAirspeedIAS).toBeLessThanOrEqual(perf.maxAirspeedIAS);
      expect(perf.initialSpawnSpeedMaxIAS).toBeLessThanOrEqual(perf.maxAirspeedIAS);
    }
  });

  it('enforces model-specific climb rate, speed ceiling, and altitude ceiling in physics stepping', () => {
    const cessna = makeAircraft({
      aircraftType: 'C172',
      altitude: 3000,
      targetAltitude: 20000, // Above C172 ceiling
      indicatedAirspeed: 120,
      targetAirspeed: 250, // Above C172 max IAS
    });
    const jet = makeAircraft({
      id: 'ac_jet_test',
      callsign: 'BAW77',
      aircraftType: 'B77W',
      category: 'Heavy',
      aircraftClass: 'HEAVY_WIDEBODY',
      altitude: 3000,
      targetAltitude: 20000,
      indicatedAirspeed: 220,
      targetAirspeed: 280,
    });

    const cessnaStep = stepAircraftPhysics(cessna, 5.0, calmWeather, [], 5.0, 83);
    const jetStep = stepAircraftPhysics(jet, 5.0, calmWeather, [], 5.0, 83);

    // Jet climbs much faster than Cessna 172
    expect(jetStep.verticalSpeed).toBeGreaterThan(cessnaStep.verticalSpeed * 2);
    expect(jetStep.altitude).toBeGreaterThan(cessnaStep.altitude);

    // Cessna speed is capped at C172 maxAirspeedIAS (135 kt), never accelerating to 250 kt
    expect(cessnaStep.indicatedAirspeed).toBeLessThanOrEqual(135);

    // Cessna climbing near its 14,000 ft service ceiling cannot exceed 14,000 ft
    const highCessna = makeAircraft({
      aircraftType: 'C172',
      altitude: 13950,
      targetAltitude: 20000,
      indicatedAirspeed: 115,
      targetAirspeed: 115,
    });
    const highStep = stepAircraftPhysics(highCessna, 10.0, calmWeather, [], 10.0, 83);
    expect(highStep.altitude).toBeLessThanOrEqual(14000);
  });

  it('spawns inbound and departure flights strictly within each aircraft model operational envelope', () => {
    const samples: Aircraft[] = [];
    for (let i = 0; i < 40; i++) {
      samples.push(
        generateInboundFlight(i, {
          airport: HEATHROW_AIRPORT,
          heavyRatio: i % 3 === 0 ? 0.8 : 0.1,
        })
      );
      samples.push(
        generateDepartureFlight({
          airport: HEATHROW_AIRPORT,
          heavyRatio: 0.15,
        })
      );
    }

    for (const ac of samples) {
      const perf = getAircraftPerformance(ac.aircraftType);
      expect(ac.targetAirspeed).toBeGreaterThanOrEqual(perf.minAirspeedIAS);
      expect(ac.targetAirspeed).toBeLessThanOrEqual(perf.maxAirspeedIAS);
      expect(ac.targetAltitude).toBeLessThanOrEqual(perf.serviceCeilingFt);
      if (ac.status === 'Inbound') {
        expect(ac.indicatedAirspeed).toBeLessThanOrEqual(perf.maxAirspeedIAS);
        expect(ac.altitude).toBeLessThanOrEqual(perf.serviceCeilingFt);
      }
    }
  });

  it('provides tailored Command Panel bounds and presets per aircraft class', () => {
    const gaPresets = getAircraftClassPresets('C172', 83);
    const jetPresets = getAircraftClassPresets('A320', 83);

    expect(Math.max(...gaPresets.speedPresetsKt)).toBeLessThanOrEqual(135);
    expect(Math.min(...jetPresets.speedPresetsKt)).toBeGreaterThanOrEqual(150);

    const gaBounds = getAircraftOperationalBounds('C172', 83);
    expect(gaBounds.minSpeedKt).toBe(68);
    expect(gaBounds.maxSpeedKt).toBe(135);
    expect(gaBounds.maxAltitudeFt).toBe(14000);
  });

  describe('Store soft limit clamping and pilot/ATC advisory warnings', () => {
    beforeEach(() => {
      const cessna = makeAircraft({
        id: 'ac_ga_store_1',
        callsign: 'N172SP',
        aircraftType: 'C172',
        indicatedAirspeed: 110,
        targetAirspeed: 110,
        altitude: 4000,
        targetAltitude: 4000,
      });
      useSimulationStore.setState({
        aircraft: [cessna],
        selectedAircraftId: cessna.id,
        envelopeWarning: null,
        radioMessages: [],
      });
    });

    it('soft-clamps excessive speed clearance and emits pilot advisory + warning', () => {
      const store = useSimulationStore.getState();
      store.setSpeed('ac_ga_store_1', 260);

      const next = useSimulationStore.getState();
      const updated = next.aircraft.find(a => a.id === 'ac_ga_store_1')!;
      expect(updated.targetAirspeed).toBe(135);
      expect(next.envelopeWarning).not.toBeNull();
      expect(next.envelopeWarning?.kind).toBe('SPEED');
      expect(next.envelopeWarning?.message).toContain('135 kt');
    });

    it('soft-clamps below-minimum speed clearance cleanly', () => {
      const store = useSimulationStore.getState();
      store.setSpeed('ac_ga_store_1', 45);

      const next = useSimulationStore.getState();
      const updated = next.aircraft.find(a => a.id === 'ac_ga_store_1')!;
      expect(updated.targetAirspeed).toBe(68);
      expect(next.envelopeWarning?.kind).toBe('SPEED');
      expect(next.envelopeWarning?.message).toContain('68 kt');
    });

    it('soft-clamps altitude above aircraft service ceiling and clears warning on valid clearance', () => {
      const store = useSimulationStore.getState();
      store.setAltitude('ac_ga_store_1', 20000);

      let next = useSimulationStore.getState();
      let updated = next.aircraft.find(a => a.id === 'ac_ga_store_1')!;
      expect(updated.targetAltitude).toBe(14000);
      expect(next.envelopeWarning?.kind).toBe('ALTITUDE');
      expect(next.envelopeWarning?.message).toContain('14,000 ft');

      // Valid clearance clears the altitude warning
      next.setAltitude('ac_ga_store_1', 6000);
      next = useSimulationStore.getState();
      updated = next.aircraft.find(a => a.id === 'ac_ga_store_1')!;
      expect(updated.targetAltitude).toBe(6000);
      expect(next.envelopeWarning).toBeNull();
    });
  });
});
