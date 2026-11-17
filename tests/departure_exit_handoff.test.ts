import { describe, it, expect, beforeEach } from 'vitest';
import { ALL_AIRPORT_PROFILES, resolveConfiguredAirport } from '../src/airports/airportsRegistry';
import { generateDepartureFlight, resolveDepartureExitAssignment } from '../src/engine/trafficGenerator';
import {
  evaluateDepartureGates,
  lineUpAircraft,
  issueTakeoffClearance,
  stepTakeoffSequence,
  EXIT_HANDOFF_RADIUS_NM,
} from '../src/engine/takeoff';
import { RunwayOccupancyManager } from '../src/engine/runwayOccupancy';
import { stepAircraftPhysics, calculateDistance } from '../src/engine/physics';
import { formatNavigationForSpeech } from '../src/audio/aviationSpeechGrammar';
import { useSimulationStore } from '../src/store/simulationStore';
import { HEATHROW_AIRPORT, HEATHROW_RUNWAY_GEOMETRIES } from '../src/airports/heathrow';
import { getAircraftPerformance } from '../src/engine/aircraftPerformance';

describe('Staged Departure, SID Exit Routing & Center Handoff', () => {
  beforeEach(() => {
    useSimulationStore.getState().switchAirport('EGLL');
    useSimulationStore.getState().setAudioMuted(true);
    useSimulationStore.setState({ isPaused: true });
  });

  it('1. Assigns a valid SID corridor & exit fix on HOLD_SHORT spawn across all 16 airports', () => {
    expect(ALL_AIRPORT_PROFILES.length).toBeGreaterThanOrEqual(16);

    for (const profile of ALL_AIRPORT_PROFILES) {
      const resolved = resolveConfiguredAirport(profile.airport.icao);
      const depRwy =
        resolved.airport.runways.find(r => r.id === resolved.departureRunwayId) ||
        resolved.airport.runways[0];

      const ac = generateDepartureFlight({
        airport: resolved.airport,
        departureRunway: depRwy,
      });

      expect(ac.status).toBe('Departing');
      expect(ac.flightPhase).toBe('HOLD_SHORT');
      expect(ac.indicatedAirspeed).toBe(0);
      expect(ac.assignedWaypoint).toBeNull();
      expect(ac.assignedSidName).toBeTruthy();
      expect(ac.assignedExitWaypoint).toBeTruthy();
      expect(ac.departureRouteWaypoints && ac.departureRouteWaypoints.length).toBeGreaterThan(0);

      // Exit fix exists in airport waypoints
      const wpExists = resolved.airport.waypoints.some(
        w => w.name === ac.assignedExitWaypoint
      );
      expect(wpExists).toBe(true);
    }
  });

  it('2. Enforces Line Up & Wait before Cleared for Takeoff at engine and store levels', () => {
    const rwy27L = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27L')!;
    const occ = new RunwayOccupancyManager(HEATHROW_RUNWAY_GEOMETRIES);
    const dep = generateDepartureFlight({
      airport: HEATHROW_AIRPORT,
      departureRunway: HEATHROW_AIRPORT.runways.find(r => r.id === '27L'),
    });

    // Engine rejects takeoff while HOLD_SHORT
    const blockedRes = issueTakeoffClearance(dep, rwy27L, occ, 0);
    expect(blockedRes.success).toBe(false);
    expect(blockedRes.reason).toContain('Line Up and Wait');

    // Engine accepts Line Up, setting flightPhase = LINEUP and runway Occupied
    const lineupRes = lineUpAircraft(dep, rwy27L, occ, 1);
    expect(lineupRes.success).toBe(true);
    expect(lineupRes.aircraft.flightPhase).toBe('LINEUP');
    expect(occ.getRunwayState('27L')).toBe('Occupied');

    // Now takeoff succeeds
    const toRes = issueTakeoffClearance(lineupRes.aircraft, rwy27L, occ, 2);
    expect(toRes.success).toBe(true);
    expect(toRes.aircraft.flightPhase).toBe('TAKEOFF_ROLL');

    // Verify store workflow too
    useSimulationStore.setState({ aircraft: [dep], selectedAircraftId: dep.id });
    useSimulationStore.getState().clearTakeoff(dep.id);
    let current = useSimulationStore.getState().aircraft.find(a => a.id === dep.id)!;
    expect(current.flightPhase).toBe('HOLD_SHORT');

    useSimulationStore.getState().lineUpAndWait(dep.id, '27L');
    current = useSimulationStore.getState().aircraft.find(a => a.id === dep.id)!;
    expect(current.flightPhase).toBe('LINEUP');

    useSimulationStore.getState().clearTakeoff(dep.id);
    current = useSimulationStore.getState().aircraft.find(a => a.id === dep.id)!;
    expect(current.flightPhase).toBe('TAKEOFF_ROLL');
  });

  it('3. Holds HOLD_SHORT & LINEUP stationary, accelerates through Vr/Liftoff/Initial Climb without GA deadzone', () => {
    const rwy27L = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === '27L')!;
    const occ = new RunwayOccupancyManager(HEATHROW_RUNWAY_GEOMETRIES);
    const baseGa = generateDepartureFlight({
      airport: HEATHROW_AIRPORT,
      departureRunway: HEATHROW_AIRPORT.runways.find(r => r.id === '27L'),
    });
    const perfC172 = getAircraftPerformance('C172');
    const c172Hold = {
      ...baseGa,
      aircraftType: 'C172',
      aircraftClass: 'LIGHT_GA' as const,
      category: 'Small' as const,
      maxBankAngle: perfC172.maxBankAngleDeg,
      targetAirspeed: perfC172.cruiseAirspeedIAS,
      exitClimbMinAltitudeFt: 1500,
      exitClimbMinSpeedKt: 90,
    };

    // Remains stationary while HOLD_SHORT
    const stepHold = stepTakeoffSequence(c172Hold, rwy27L, 5.0, occ, 5);
    expect(stepHold.aircraft.indicatedAirspeed).toBe(0);
    expect(stepHold.aircraft.altitude).toBe(rwy27L.elevationFeet);

    const lined = lineUpAircraft(c172Hold, rwy27L, occ, 6).aircraft;
    const stepLineup = stepTakeoffSequence(lined, rwy27L, 5.0, occ, 11);
    expect(stepLineup.aircraft.indicatedAirspeed).toBe(0);
    expect(stepLineup.aircraft.flightPhase).toBe('LINEUP');

    // Clear takeoff & step 150 seconds in 1s increments -> reaches INITIAL_CLIMB above 1000 ft AGL smoothly
    let active = issueTakeoffClearance(lined, rwy27L, occ, 12).aircraft;
    let sawRotation = false;
    let sawLiftoff = false;
    for (let t = 0; t < 150; t++) {
      const res = stepTakeoffSequence(active, rwy27L, 1.0, occ, 13 + t);
      active = res.aircraft;
      if (res.eventType === 'ROTATION') sawRotation = true;
      if (res.eventType === 'LIFTOFF') sawLiftoff = true;
    }

    expect(sawRotation).toBe(true);
    expect(sawLiftoff).toBe(true);
    expect(active.altitude).toBeGreaterThan(rwy27L.elevationFeet + 1000);
    expect(active.flightPhase).toBe('INITIAL_CLIMB');
    expect(active.status).toBe('Outbound');
    expect(active.assignedWaypoint).toBeNull();
  });

  it('4. Gates proceedDepartureOnExit on climb threshold, then routes along SID exit fixes preserving Outbound status', () => {
    const dep = generateDepartureFlight({
      airport: HEATHROW_AIRPORT,
      departureRunway: HEATHROW_AIRPORT.runways.find(r => r.id === '27L'),
    });
    const assignment = resolveDepartureExitAssignment(
      HEATHROW_AIRPORT,
      HEATHROW_AIRPORT.runways.find(r => r.id === '27L')!,
      'A320'
    );

    const climbingEarly = {
      ...dep,
      aircraftType: 'A320',
      aircraftClass: 'NARROWBODY_JET' as const,
      status: 'Departing' as const,
      flightPhase: 'INITIAL_CLIMB',
      altitude: HEATHROW_AIRPORT.elevationFeet + 600,
      indicatedAirspeed: 165,
      ...assignment,
    };

    useSimulationStore.setState({ aircraft: [climbingEarly], selectedAircraftId: climbingEarly.id });
    useSimulationStore.getState().proceedDepartureOnExit(climbingEarly.id);

    // Rejected because climb gate not met
    let acState = useSimulationStore.getState().aircraft.find(a => a.id === climbingEarly.id)!;
    expect(acState.flightPhase).toBe('INITIAL_CLIMB');
    expect(acState.assignedWaypoint).toBeNull();

    // Now satisfy climb gate
    const gateMetAc = {
      ...climbingEarly,
      altitude: HEATHROW_AIRPORT.elevationFeet + 2000,
      indicatedAirspeed: 205,
      status: 'Outbound' as const,
    };
    useSimulationStore.setState({ aircraft: [gateMetAc], selectedAircraftId: gateMetAc.id });
    useSimulationStore.getState().proceedDepartureOnExit(gateMetAc.id);

    acState = useSimulationStore.getState().aircraft.find(a => a.id === gateMetAc.id)!;
    expect(acState.flightPhase).toBe('EXIT_ROUTING');
    expect(acState.status).toBe('Outbound');
    expect(acState.assignedWaypoint).toBe(assignment.departureRouteWaypoints[0]);
    expect(acState.targetAltitude).toBeGreaterThan(gateMetAc.altitude);
  });

  it('5. Transitions outbound flight to HANDOFF_READY near exit fix and completes Goodbye handoff', () => {
    const dep = generateDepartureFlight({
      airport: HEATHROW_AIRPORT,
      departureRunway: HEATHROW_AIRPORT.runways.find(r => r.id === '27L'),
    });
    const exitName = dep.assignedExitWaypoint!;
    const exitWp = HEATHROW_AIRPORT.waypoints.find(w => w.name === exitName)!;
    expect(exitWp).toBeTruthy();

    // Place aircraft 2.5 NM short of exit fix heading directly toward it, well above climb gate
    const outboundNearExit = {
      ...dep,
      aircraftType: 'A320',
      aircraftClass: 'NARROWBODY_JET' as const,
      status: 'Outbound' as const,
      flightPhase: 'EXIT_ROUTING',
      x: exitWp.position.x - 1.5,
      y: exitWp.position.y,
      heading: 90,
      targetHeading: 90,
      altitude: 9000,
      targetAltitude: 12000,
      indicatedAirspeed: 240,
      targetAirspeed: 240,
      groundSpeed: 240,
      assignedWaypoint: exitName,
      routeQueue: [],
    };

    const distBefore = calculateDistance(
      outboundNearExit.x,
      outboundNearExit.y,
      exitWp.position.x,
      exitWp.position.y
    );
    expect(distBefore).toBeLessThanOrEqual(EXIT_HANDOFF_RADIUS_NM);

    const stepped = stepAircraftPhysics(
      outboundNearExit,
      1.0,
      useSimulationStore.getState().weather,
      HEATHROW_AIRPORT.waypoints,
      10,
      HEATHROW_AIRPORT.elevationFeet
    );
    expect(stepped.flightPhase).toBe('HANDOFF_READY');
    expect(
      evaluateDepartureGates(stepped, HEATHROW_AIRPORT.elevationFeet, HEATHROW_AIRPORT.waypoints)
        .isHandoffReady
    ).toBe(true);

    // Execute Center Handoff (Goodbye) via store
    const initialStats = useSimulationStore.getState().stats;
    useSimulationStore.setState({
      aircraft: [stepped],
      selectedAircraftId: stepped.id,
      radioMessages: [],
    });

    useSimulationStore.getState().handoffDeparture(stepped.id);

    const after = useSimulationStore.getState();
    expect(after.aircraft.find(a => a.id === stepped.id)).toBeUndefined();
    expect(after.stats.departures).toBe(initialStats.departures + 1);
    expect(after.radioMessages.some(m => m.text.toLowerCase().includes('good day'))).toBe(true);
    expect(after.radioMessages.some(m => m.text.toLowerCase().includes('goodbye'))).toBe(true);
  });

  it('6. Formats SID and Center Handoff (Goodbye) radio speech cleanly', () => {
    const sidSpeech = formatNavigationForSpeech({
      type: 'DEPARTURE_SID',
      waypoint: 'BPK',
      sidName: 'BPK6G',
    });
    expect(sidSpeech.spokenText).toContain('Brookmans Park');

    const handoffSpeech = formatNavigationForSpeech({
      type: 'CENTER_HANDOFF',
      frequency: '132.45',
    });
    expect(handoffSpeech.displayText).toContain('132.45');
    expect(handoffSpeech.displayText.toLowerCase()).toContain('good day');
    expect(handoffSpeech.spokenText.toLowerCase()).toContain('good day');
  });
});
