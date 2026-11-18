import { describe, it, expect, beforeEach } from 'vitest';
import { ALL_AIRPORT_PROFILES, resolveConfiguredAirport } from '../src/airports/airportsRegistry';
import { generateInboundFlight, generateDepartureFlight } from '../src/engine/trafficGenerator';
import {
  evaluateArrivalGates,
  computeBaseLegVector,
  computeFinalInterceptVector,
  updateILSApproach,
} from '../src/engine/ils';
import { RunwayOccupancyManager } from '../src/engine/runwayOccupancy';
import { stepAircraftPhysics, getHeadingDelta } from '../src/engine/physics';
import { formatNavigationForSpeech } from '../src/audio/aviationSpeechGrammar';
import { useSimulationStore } from '../src/store/simulationStore';
import { HEATHROW_AIRPORT, HEATHROW_RUNWAY_GEOMETRIES } from '../src/airports/heathrow';
import { getAircraftPerformance } from '../src/engine/aircraftPerformance';

describe('Staged Arrival Routing, 3-Stage Intercept & Tower Landing Clearance', () => {
  beforeEach(() => {
    useSimulationStore.getState().switchAirport('EGLL');
    useSimulationStore.getState().setAudioMuted(true);
    useSimulationStore.setState({ isPaused: true, radioMessages: [] });
  });

  it('1. Assigns valid STAR corridor, IAF, FAF, and landingCleared=false across all 16 airports', () => {
    expect(ALL_AIRPORT_PROFILES.length).toBeGreaterThanOrEqual(16);

    for (const profile of ALL_AIRPORT_PROFILES) {
      const resolved = resolveConfiguredAirport(profile.airport.icao);
      const arrRwy =
        resolved.airport.runways.find(r => r.id === resolved.landingRunwayId) ||
        resolved.airport.runways[0];

      const ac = generateInboundFlight(undefined, {
        airport: resolved.airport,
        arrivalRunway: arrRwy,
      });

      expect(ac.status).toBe('Inbound');
      expect(ac.landingCleared).toBe(false);
      expect(ac.landingClearanceRequested).toBe(false);
      expect(ac.assignedStarName).toBeTruthy();
      expect(ac.assignedIafWaypoint).toBeTruthy();
      expect(ac.arrivalFafWaypoint).toBeTruthy();
      expect(ac.arrivalRouteWaypoints && ac.arrivalRouteWaypoints.length).toBeGreaterThan(0);

      for (const wpName of ac.arrivalRouteWaypoints || []) {
        expect(resolved.airport.waypoints.some(w => w.name === wpName)).toBe(true);
      }
    }
  });

  it('2. Computes geometry-aware Left/Right Base and 30° Final Intercept vectors from all quadrants', () => {
    const rwy27L = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27L')!;
    const baseTemplate = generateInboundFlight(undefined, {
      airport: HEATHROW_AIRPORT,
      arrivalRunway: HEATHROW_AIRPORT.runways.find(r => r.id === '27L'),
    });

    // Landing 27L (~268° magnetic): north of extended centerline is RIGHT side (+crossTrack); south is LEFT side (-crossTrack)
    const northInbound = { ...baseTemplate, x: 14, y: 7, altitude: 5000, targetAltitude: 5000, indicatedAirspeed: 220, targetAirspeed: 220 };
    const southInbound = { ...baseTemplate, x: 14, y: -7, altitude: 5000, targetAltitude: 5000, indicatedAirspeed: 220, targetAirspeed: 220 };
    const centerAligned = { ...baseTemplate, x: 10, y: -0.35, altitude: 3000, targetAltitude: 3000, indicatedAirspeed: 190, targetAirspeed: 190 };
    const tooClose = { ...baseTemplate, x: 2.0, y: 1.5, altitude: 2500, targetAltitude: 2500, indicatedAirspeed: 180, targetAirspeed: 180 };

    const rightBase = computeBaseLegVector(northInbound, rwy27L);
    const leftBase = computeBaseLegVector(southInbound, rwy27L);
    expect(rightBase.side).toBe('RIGHT');
    expect(leftBase.side).toBe('LEFT');
    expect(rightBase.altitudeFt).toBeLessThanOrEqual(4500);
    expect(rightBase.altitudeFt).toBeLessThan(northInbound.altitude);

    const interceptNorth = computeFinalInterceptVector(northInbound, rwy27L);
    const interceptSouth = computeFinalInterceptVector(southInbound, rwy27L);
    // North (+crossTrack) turns left onto final (heading < runway magneticHeading), South turns right (heading > runway magneticHeading)
    expect(getHeadingDelta(rwy27L.magneticHeading, interceptNorth.heading)).toBeLessThan(0);
    expect(getHeadingDelta(rwy27L.magneticHeading, interceptSouth.heading)).toBeGreaterThan(0);
    expect(Math.abs(getHeadingDelta(rwy27L.magneticHeading, interceptNorth.heading))).toBeLessThanOrEqual(31);
    expect(Math.abs(getHeadingDelta(rwy27L.magneticHeading, interceptSouth.heading))).toBeLessThanOrEqual(31);

    const fineIntercept = computeFinalInterceptVector(centerAligned, rwy27L);
    expect(fineIntercept.interceptAngleDeg).toBeLessThanOrEqual(15);

    const repositionIntercept = computeFinalInterceptVector(tooClose, rwy27L);
    expect(repositionIntercept.heading).toBeGreaterThanOrEqual(0);
    expect(repositionIntercept.heading).toBeLessThan(360);
  });

  it('3. Executes clearArrivalStar -> physics waypoint progression -> auto-ILS arming at FAF', () => {
    const arr = generateInboundFlight(undefined, {
      airport: HEATHROW_AIRPORT,
      arrivalRunway: HEATHROW_AIRPORT.runways.find(r => r.id === '27L'),
    });

    useSimulationStore.setState({ aircraft: [arr], selectedAircraftId: arr.id });
    useSimulationStore.getState().clearArrivalStar(arr.id, true);

    const cleared = useSimulationStore.getState().aircraft.find(a => a.id === arr.id)!;
    expect(cleared.flightPhase).toBe('STAR_ENROUTE');
    expect(cleared.autoInterceptILS).toBe(true);
    expect(cleared.assignedWaypoint).toBeTruthy();

    // Place aircraft right near final queued waypoint to verify autoInterceptILS completion
    const finalWpName =
      cleared.routeQueue && cleared.routeQueue.length > 0
        ? cleared.routeQueue[cleared.routeQueue.length - 1]
        : cleared.assignedWaypoint!;
    const finalWp = HEATHROW_AIRPORT.waypoints.find(w => w.name === finalWpName)!;
    expect(finalWp).toBeTruthy();

    const arrivingFinalFix = {
      ...cleared,
      assignedWaypoint: finalWpName,
      routeQueue: [],
      x: finalWp.position.x - 0.1,
      y: finalWp.position.y,
      altitude: 3000,
      targetAltitude: 3000,
      indicatedAirspeed: 190,
      targetAirspeed: 190,
      groundSpeed: 190,
    };

    const stepped = stepAircraftPhysics(
      arrivingFinalFix,
      2.0,
      useSimulationStore.getState().weather,
      HEATHROW_AIRPORT.waypoints,
      10,
      HEATHROW_AIRPORT.elevationFeet
    );

    expect(stepped.ilsArmed).toBe(true);
    expect(stepped.flightPhase).toBe('FINAL_INTERCEPT');
    expect(stepped.status).toBe('LocalizerIntercept');
  });

  it('4. Blocks Cleared to Land when runway occupied or not yet on approach, and authorizes when clear', () => {
    const rwy27L = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27L')!;
    const arr = generateInboundFlight(undefined, {
      airport: HEATHROW_AIRPORT,
      arrivalRunway: HEATHROW_AIRPORT.runways.find(r => r.id === '27L'),
    });

    // Not yet on approach (far out, ILS not armed)
    useSimulationStore.setState({ aircraft: [arr], selectedAircraftId: arr.id, radioMessages: [] });
    useSimulationStore.getState().clearToLand(arr.id, '27L');
    let cur = useSimulationStore.getState().aircraft.find(a => a.id === arr.id)!;
    expect(cur.landingCleared).toBe(false);

    // Move onto established final at 4.5 NM with another aircraft occupying runway 27L
    const rad = (rwy27L.magneticHeading * Math.PI) / 180;
    const onFinal = {
      ...arr,
      x: rwy27L.threshold.x - 4.5 * Math.sin(rad),
      y: rwy27L.threshold.y - 4.5 * Math.cos(rad),
      heading: rwy27L.magneticHeading,
      targetHeading: rwy27L.magneticHeading,
      altitude: 1500,
      targetAltitude: 1500,
      ilsArmed: true,
      ilsLocalizerCaptured: true,
      ilsGlideslopeCaptured: true,
      status: 'FinalApproach' as const,
      landingClearanceRequested: true,
    };

    const blocker = generateDepartureFlight({
      airport: HEATHROW_AIRPORT,
      departureRunway: HEATHROW_AIRPORT.runways.find(r => r.id === '27L'),
    });

    useSimulationStore.setState({ aircraft: [onFinal, blocker], radioMessages: [] });
    useSimulationStore.getState().lineUpAndWait(blocker.id, '27L');
    useSimulationStore.getState().clearToLand(onFinal.id, '27L');
    cur = useSimulationStore.getState().aircraft.find(a => a.id === onFinal.id)!;
    expect(cur.landingCleared).toBe(false);

    // Vacate blocker from runway (handoff/removal releases occupancy) -> now Cleared to Land succeeds
    useSimulationStore.getState().goAround(blocker.id);
    useSimulationStore.getState().clearToLand(onFinal.id, '27L');
    cur = useSimulationStore.getState().aircraft.find(a => a.id === onFinal.id)!;
    expect(cur.landingCleared).toBe(true);
    expect(cur.landingClearedRunway).toBe('27L');
    expect(cur.landingClearanceRequested).toBe(false);
    expect(
      useSimulationStore.getState().radioMessages.some(m => m.text.toLowerCase().includes('cleared to land'))
    ).toBe(true);
  });

  it('5. Rejects touchdown at Decision Height when landingCleared=false and completes rollout + vacate when cleared', () => {
    const rwy27L = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27L')!;
    const occ = new RunwayOccupancyManager(HEATHROW_RUNWAY_GEOMETRIES);
    const arr = generateInboundFlight(undefined, {
      airport: HEATHROW_AIRPORT,
      arrivalRunway: HEATHROW_AIRPORT.runways.find(r => r.id === '27L'),
    });
    const perf = getAircraftPerformance(arr.aircraftType);
    const rad = (rwy27L.magneticHeading * Math.PI) / 180;

    // 0.35 NM before threshold, 120 ft above runway elevation, landingCleared=false
    const unauthorizedShortFinal = {
      ...arr,
      x: rwy27L.threshold.x - 0.35 * Math.sin(rad),
      y: rwy27L.threshold.y - 0.35 * Math.cos(rad),
      heading: rwy27L.magneticHeading,
      targetHeading: rwy27L.magneticHeading,
      altitude: rwy27L.elevationFeet + 120,
      targetAltitude: rwy27L.elevationFeet,
      indicatedAirspeed: perf.typicalApproachSpeedIAS,
      targetAirspeed: perf.typicalApproachSpeedIAS,
      verticalSpeed: -400,
      ilsArmed: true,
      ilsLocalizerCaptured: true,
      ilsGlideslopeCaptured: true,
      status: 'FinalApproach' as const,
      landingCleared: false,
    };

    const rejected = updateILSApproach(unauthorizedShortFinal, rwy27L, 1.0, occ, 10);
    expect(rejected.eventType).toBe('LANDING_REJECTED');
    expect(rejected.eventMessage).toContain('No landing clearance');
    expect(rejected.aircraft.status).toBe('GoAround');
    expect(rejected.aircraft.flightPhase).toBe('GO_AROUND');

    // Now authorize landing clearance & descend across touchdown gate (0.15 NM, 4 ft AGL)
    const clearedTouchdownAc = {
      ...unauthorizedShortFinal,
      x: rwy27L.threshold.x - 0.15 * Math.sin(rad),
      y: rwy27L.threshold.y - 0.15 * Math.cos(rad),
      altitude: rwy27L.elevationFeet + 4,
      landingCleared: true,
      landingClearedRunway: '27L',
    };

    const touchdownRes = updateILSApproach(clearedTouchdownAc, rwy27L, 1.0, occ, 20);
    expect(touchdownRes.landed).toBe(true);
    expect(touchdownRes.eventType).toBe('TOUCHDOWN');
    expect(touchdownRes.aircraft.status).toBe('Landed');
    expect(touchdownRes.aircraft.flightPhase).toBe('ROLLOUT');

    // Decelerate below 22 kt -> vacates runway & releases occupancy
    const vacatedRes = updateILSApproach(
      { ...touchdownRes.aircraft, indicatedAirspeed: 18 },
      rwy27L,
      1.0,
      occ,
      30
    );
    expect(vacatedRes.eventType).toBe('RUNWAY_VACATED');
    expect(vacatedRes.aircraft.flightPhase).toBe('TAXI_EXIT');
    expect(occ.getRunwayState('27L')).toBe('Available');
  });

  it('6. Triggers pilot landing clearance request inside 5.5 NM on final and formats approach radio speech', () => {
    const rwy27L = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27L')!;
    const arr = generateInboundFlight(undefined, {
      airport: HEATHROW_AIRPORT,
      arrivalRunway: HEATHROW_AIRPORT.runways.find(r => r.id === '27L'),
    });
    const rad = (rwy27L.magneticHeading * Math.PI) / 180;

    const shortFinalNotRequested = {
      ...arr,
      x: rwy27L.threshold.x - 4.8 * Math.sin(rad),
      y: rwy27L.threshold.y - 4.8 * Math.cos(rad),
      heading: rwy27L.magneticHeading,
      targetHeading: rwy27L.magneticHeading,
      altitude: rwy27L.elevationFeet + 1500,
      targetAltitude: rwy27L.elevationFeet + 1500,
      indicatedAirspeed: 150,
      targetAirspeed: 150,
      groundSpeed: 150,
      ilsArmed: true,
      ilsLocalizerCaptured: true,
      ilsGlideslopeCaptured: true,
      status: 'FinalApproach' as const,
      landingCleared: false,
      landingClearanceRequested: false,
    };

    const gates = evaluateArrivalGates(shortFinalNotRequested, rwy27L, HEATHROW_AIRPORT.waypoints);
    expect(gates.canClearToLand).toBe(true);
    expect(gates.isLandingClearanceAuthorized).toBe(false);

    useSimulationStore.setState({
      aircraft: [shortFinalNotRequested],
      isPaused: false,
      radioMessages: [],
    });
    useSimulationStore.getState().tickSimulation(0.1);

    const after = useSimulationStore.getState();
    const updated = after.aircraft.find(a => a.id === shortFinalNotRequested.id)!;
    expect(updated.landingClearanceRequested).toBe(true);
    expect(
      after.radioMessages.some(m => m.text.toLowerCase().includes('request landing clearance'))
    ).toBe(true);

    const starSpeech = formatNavigationForSpeech({
      type: 'STAR_APPROACH',
      starName: 'BIG1A',
      waypoint: 'BIG',
      runway: '27L',
    });
    expect(starSpeech.spokenText).toContain('Biggin');
    expect(starSpeech.spokenText).toContain('two seven left');

    const landSpeech = formatNavigationForSpeech({
      type: 'CLEARED_TO_LAND',
      runway: '27L',
    });
    expect(landSpeech.spokenText).toContain('cleared to land');
    expect(landSpeech.spokenText).toContain('two seven left');
  });
});
