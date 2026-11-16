/**
 * Verification Suite: Published STAR/SID/TMA Procedures, Per-Airport Route/Waypoint Toggling,
 * and Pre-Flight Operations Initialization Flow.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ALL_AIRPORT_PROFILES, getAirportProfile } from '../src/airports/airportsRegistry';
import {
  computeDefaultAirportVisibility,
  computeRunwayMatchedVisibility,
} from '../src/airports/procedures';
import { useSimulationStore } from '../src/store/simulationStore';
import { PreFlightSessionConfig } from '../src/types';

describe('Published Airport STAR, SID & TMA Procedures', () => {
  it('populates approachRoutes, departureRoutes, and TMA boundaries for all 5 airports', () => {
    expect(ALL_AIRPORT_PROFILES.length).toBeGreaterThanOrEqual(5);

    for (const profile of ALL_AIRPORT_PROFILES) {
      const airport = profile.airport;
      const waypointNames = new Set(airport.waypoints.map(w => w.name));

      expect(airport.tmaBoundary, `${airport.icao} missing tmaBoundary`).toBeDefined();
      expect(airport.tmaBoundary!.polygon.length).toBeGreaterThanOrEqual(4);
      expect(airport.tmaBoundary!.sectorLabel.length).toBeGreaterThan(0);
      expect(airport.tmaBoundary!.floorLabel.length).toBeGreaterThan(0);
      expect(airport.tmaBoundary!.ceilingLabel.length).toBeGreaterThan(0);
      expect(airport.tmaBoundary!.transitionAltitudeFt).toBeGreaterThan(0);

      expect(airport.approachRoutes?.length, `${airport.icao} missing STARs`).toBeGreaterThan(0);
      expect(airport.departureRoutes?.length, `${airport.icao} missing SIDs`).toBeGreaterThan(0);

      for (const star of airport.approachRoutes || []) {
        expect(star.type).toBe('STAR');
        expect(star.waypointNames.length).toBeGreaterThanOrEqual(2);
        expect(star.legs.length).toBe(star.waypointNames.length - 1);

        for (const wpName of star.waypointNames) {
          expect(
            waypointNames.has(wpName),
            `${airport.icao} STAR ${star.id} references unknown waypoint ${wpName}`
          ).toBe(true);
        }

        for (const leg of star.legs) {
          expect(leg.distanceNM).toBeGreaterThan(0);
          expect(leg.courseDeg).toBeGreaterThanOrEqual(0);
          expect(leg.courseDeg).toBeLessThanOrEqual(360);
        }
      }

      for (const sid of airport.departureRoutes || []) {
        expect(sid.type).toBe('SID');
        expect(sid.waypointNames.length).toBeGreaterThanOrEqual(2);
        expect(sid.legs.length).toBe(sid.waypointNames.length - 1);

        for (const wpName of sid.waypointNames) {
          expect(
            waypointNames.has(wpName),
            `${airport.icao} SID ${sid.id} references unknown waypoint ${wpName}`
          ).toBe(true);
        }

        for (const leg of sid.legs) {
          expect(leg.distanceNM).toBeGreaterThan(0);
          expect(leg.courseDeg).toBeGreaterThanOrEqual(0);
          expect(leg.courseDeg).toBeLessThanOrEqual(360);
        }
      }
    }
  });

  it('includes IAF, FAF, and Radar Exit fix roles for airport navigation aids', () => {
    const egll = getAirportProfile('EGLL').airport;
    const roles = new Set(egll.waypoints.map(w => w.role).filter(Boolean));
    expect(roles.has('IAF')).toBe(true);
    expect(roles.has('FAF')).toBe(true);
    expect(roles.has('EXIT')).toBe(true);
  });
});

describe('Per-Airport Isolated Route & Waypoint Visibility Management', () => {
  beforeEach(() => {
    useSimulationStore.setState(state => {
      const defaults: Record<string, ReturnType<typeof computeDefaultAirportVisibility>> = {};
      for (const p of ALL_AIRPORT_PROFILES) {
        defaults[p.airport.icao] = computeDefaultAirportVisibility(p.airport);
      }
      return { ...state, perAirportVisibility: defaults };
    });
  });

  it('toggles individual STARs, SIDs, and waypoints per airport without affecting other airports', () => {
    const store = useSimulationStore.getState();
    const oiii = getAirportProfile('OIII').airport;
    const kjfk = getAirportProfile('KJFK').airport;

    const targetStar = oiii.approachRoutes![0].id;
    const targetSid = oiii.departureRoutes![0].id;
    const targetWp = oiii.waypoints[0].name;

    const kjfkBefore = JSON.stringify(useSimulationStore.getState().perAirportVisibility['KJFK']);
    expect(useSimulationStore.getState().perAirportVisibility['OIII'].visibleStarIds).toContain(targetStar);
    expect(useSimulationStore.getState().perAirportVisibility['OIII'].visibleSidIds).toContain(targetSid);
    expect(useSimulationStore.getState().perAirportVisibility['OIII'].visibleWaypoints).toContain(targetWp);

    store.toggleAirportStar('OIII', targetStar);
    store.toggleAirportSid('OIII', targetSid);
    store.toggleAirportWaypoint('OIII', targetWp);

    const oiiiAfter = useSimulationStore.getState().perAirportVisibility['OIII'];
    expect(oiiiAfter.visibleStarIds).not.toContain(targetStar);
    expect(oiiiAfter.visibleSidIds).not.toContain(targetSid);
    expect(oiiiAfter.visibleWaypoints).not.toContain(targetWp);

    // Toggle back on
    useSimulationStore.getState().toggleAirportStar('OIII', targetStar);
    expect(useSimulationStore.getState().perAirportVisibility['OIII'].visibleStarIds).toContain(targetStar);

    // Ensure KJFK visibility stayed completely isolated
    expect(JSON.stringify(useSimulationStore.getState().perAirportVisibility[kjfk.icao])).toBe(kjfkBefore);
  });

  it('supports runway-matched filtering and all-on / all-off batch toggles per airport', () => {
    const oiii = getAirportProfile('OIII').airport;
    const matched = computeRunwayMatchedVisibility(oiii, '29L', '29R');
    expect(matched.visibleStarIds.length).toBeGreaterThan(0);
    expect(matched.visibleSidIds.length).toBeGreaterThan(0);

    for (const starId of matched.visibleStarIds) {
      const route = oiii.approachRoutes!.find(r => r.id === starId);
      expect(route).toBeDefined();
      expect(route!.runwayIds.length === 0 || route!.runwayIds.includes('29L')).toBe(true);
    }

    useSimulationStore.getState().setAirportAllRoutesVisible('OIII', false);
    const cleared = useSimulationStore.getState().perAirportVisibility['OIII'];
    expect(cleared.visibleStarIds).toHaveLength(0);
    expect(cleared.visibleSidIds).toHaveLength(0);
    expect(cleared.visibleWaypoints).toHaveLength(0);

    useSimulationStore.getState().setAirportAllRoutesVisible('OIII', true);
    const allOn = useSimulationStore.getState().perAirportVisibility['OIII'];
    expect(allOn.visibleStarIds).toHaveLength(oiii.approachRoutes!.length);
    expect(allOn.visibleSidIds).toHaveLength(oiii.departureRoutes!.length);
    expect(allOn.visibleWaypoints).toHaveLength(oiii.waypoints.length);
  });
});

describe('Pre-Flight Operations Setup & Startup Flow', () => {
  it('applies full pre-flight session settings in free mode and unpauses radar', () => {
    const store = useSimulationStore.getState();
    const customOiiiVis = computeRunwayMatchedVisibility(
      getAirportProfile('OIII').airport,
      '29L',
      '29R'
    );

    const session: PreFlightSessionConfig = {
      airportIcao: 'OIII',
      landingRunwayId: '29L',
      departureRunwayId: '29R',
      mode: 'free',
      spawnIntervalSec: 32,
      maxTraffic: 14,
      initialInbounds: 4,
      initialDepartures: 2,
      heavyRatio: 0.4,
      allowEmergencies: true,
      emergencyDelaySec: 60,
      weather: {
        windDirection: 295,
        windSpeed: 16,
        gusts: 24,
        visibilityNM: 8,
        ceilingFeet: 3200,
        qnh: 1018,
        precipitation: 'Light Rain',
      },
      audioMuted: false,
      audioVolume: 0.72,
      towerVoiceId: 'kore',
      radioPreset: 'weak_signal',
      simSpeed: 2,
      perAirportVisibility: {
        ...useSimulationStore.getState().perAirportVisibility,
        OIII: customOiiiVis,
      },
    };

    store.applyPreFlightSession(session);
    const next = useSimulationStore.getState();

    expect(next.airport.icao).toBe('OIII');
    expect(next.activeLandingRunwayId).toBe('29L');
    expect(next.activeDepartureRunwayId).toBe('29R');
    expect(next.spawnIntervalSec).toBe(32);
    expect(next.maxTraffic).toBe(14);
    expect(next.heavyRatio).toBe(0.4);
    expect(next.allowEmergencies).toBe(true);
    expect(next.weather.qnh).toBe(1018);
    expect(next.weather.windDirection).toBe(295);
    expect(next.weather.windSpeed).toBe(16);
    expect(next.weather.precipitation).toBe('Light Rain');
    expect(next.audioVolume).toBe(0.72);
    expect(next.towerVoiceId).toBe('kore');
    expect(next.simSpeed).toBe(2);
    expect(next.aircraft.length).toBe(6); // 4 inbounds + 2 departures
    expect(next.hasCompletedStartupSetup).toBe(true);
    expect(next.isPaused).toBe(false);

    // Click-to-select still works cleanly without resetting headings
    const first = next.aircraft[0];
    const hdgBefore = first.targetHeading;
    next.selectAircraft(first.id);
    expect(useSimulationStore.getState().selectedAircraftId).toBe(first.id);
    expect(useSimulationStore.getState().aircraft[0].targetHeading).toBe(hdgBefore);
  });

  it('applies mission mode from pre-flight setup and starts mission tracking unpaused', () => {
    const store = useSimulationStore.getState();
    const session: PreFlightSessionConfig = {
      airportIcao: 'EGLL',
      landingRunwayId: '27R',
      departureRunwayId: '27L',
      mode: 'mission',
      missionId: 'mission_1',
      spawnIntervalSec: 40,
      maxTraffic: 10,
      initialInbounds: 3,
      initialDepartures: 1,
      heavyRatio: 0.3,
      allowEmergencies: false,
      emergencyDelaySec: 45,
      weather: {
        windDirection: 270,
        windSpeed: 10,
        visibilityNM: 10,
        ceilingFeet: 5000,
        qnh: 1013,
        precipitation: 'None',
      },
      audioMuted: true,
      audioVolume: 0.85,
      towerVoiceId: 'charon',
      radioPreset: 'normal_aviation',
      simSpeed: 1,
      perAirportVisibility: useSimulationStore.getState().perAirportVisibility,
    };

    store.applyPreFlightSession(session);
    const next = useSimulationStore.getState();
    expect(next.activeMission.status).toBe('active');
    expect(next.activeMission.mission?.id).toBe('mission_1');
    expect(next.hasCompletedStartupSetup).toBe(true);
    expect(next.isPaused).toBe(false);
    expect(next.audioMuted).toBe(true);
  });
});

describe('Topographical Terrain Features & Radar Layer Show/Hide Controls', () => {
  it('attaches topographical terrain features to every airport profile', () => {
    for (const profile of ALL_AIRPORT_PROFILES) {
      const features = profile.airport.terrainFeatures;
      expect(features, `${profile.airport.icao} missing terrainFeatures`).toBeDefined();
      expect(features!.length).toBeGreaterThanOrEqual(3);
      for (const feat of features!) {
        expect(feat.points.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('supports individual radar layer toggles, show-all/hide-all, and declutter presets', () => {
    const store = useSimulationStore.getState();
    expect(store.radarLayers.terrain).toBe(true);
    expect(store.radarLayers.runways).toBe(true);
    expect(store.radarLayers.holdingStacks).toBe(true);

    store.toggleLayer('terrain');
    expect(useSimulationStore.getState().radarLayers.terrain).toBe(false);

    store.setAllRadarLayers(false);
    const allHidden = useSimulationStore.getState().radarLayers;
    expect(Object.values(allHidden).every(v => v === false)).toBe(true);

    store.applyRadarDeclutter('minimal');
    const minimal = useSimulationStore.getState().radarLayers;
    expect(minimal.runways).toBe(true);
    expect(minimal.speedVectors).toBe(true);
    expect(minimal.terrain).toBe(false);
    expect(minimal.starCorridors).toBe(false);

    store.applyRadarDeclutter('tactical');
    const tactical = useSimulationStore.getState().radarLayers;
    expect(tactical.terrain).toBe(true);
    expect(tactical.rangeRings).toBe(true);
    expect(tactical.tmaBoundary).toBe(true);
    expect(tactical.starCorridors).toBe(false);
    expect(tactical.procedureRestrictions).toBe(false);

    store.applyRadarDeclutter('full');
    const full = useSimulationStore.getState().radarLayers;
    expect(Object.values(full).every(v => v === true)).toBe(true);
  });
});

