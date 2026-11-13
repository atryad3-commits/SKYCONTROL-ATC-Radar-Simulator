/**
 * SKYCONTROL - Multi-Airport, Runway Configuration, & Academy Missions Test Suite
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_AIRPORT_PROFILES,
  getAirportProfile,
  resolveConfiguredAirport,
} from '../src/airports/airportsRegistry';
import { calculateLocalizerDeviation } from '../src/engine/ils';
import { RunwayOccupancyManager } from '../src/engine/runwayOccupancy';
import {
  generateDepartureFlight,
  generateInboundFlight,
} from '../src/engine/trafficGenerator';
import {
  ACADEMY_MISSIONS,
  buildMissionObjectives,
  evaluateMissionProgress,
  getMissionById,
} from '../src/engine/missions';
import {
  calculateBearing,
  calculateDistance,
  stepAircraftPhysics,
} from '../src/engine/physics';
import {
  formatPhraseForSpeech,
  formatRunwayForSpeech,
  radioAudio,
} from '../src/audio/radioAudio';
import { ActiveMissionState, SimulationStats } from '../src/types';

describe('Multi-Airport Registry & Varied Runway Configurations', () => {
  it('registers all 5 international and training airports with valid runways and holding fixes', () => {
    expect(ALL_AIRPORT_PROFILES.length).toBe(5);
    const icaos = ALL_AIRPORT_PROFILES.map(p => p.airport.icao);
    expect(icaos).toEqual(['EGLL', 'OIII', 'KJFK', 'TRN1', 'TRN2']);

    for (const profile of ALL_AIRPORT_PROFILES) {
      expect(profile.airport.runways.length).toBeGreaterThanOrEqual(4);
      expect(profile.runwayGeometries.length).toBe(profile.airport.runways.length);
      expect(profile.reciprocalPairs.length).toBeGreaterThanOrEqual(2);
      const holdingFixes = profile.airport.waypoints.filter(w => w.isHoldingFix);
      expect(holdingFixes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('resolves custom landing/departure runway choices per airport', () => {
    const resolvedOiii = resolveConfiguredAirport('OIII', '11L', '11R');
    expect(resolvedOiii.landingRunwayId).toBe('11L');
    expect(resolvedOiii.departureRunwayId).toBe('11R');

    const arrRwy = resolvedOiii.airport.runways.find(r => r.id === '11L');
    const depRwy = resolvedOiii.airport.runways.find(r => r.id === '11R');
    expect(arrRwy?.activeLanding).toBe(true);
    expect(depRwy?.activeDeparture).toBe(true);
  });

  it('computes centered ILS localizer alignment for angled runways (OIII 29R & TRN1 36)', () => {
    for (const [icao, rwyId] of [
      ['OIII', '29R'],
      ['KJFK', '31L'],
      ['TRN1', '36'],
      ['TRN2', '15'],
    ] as const) {
      const profile = getAirportProfile(icao);
      const rwy = profile.runwayGeometries.find(r => r.id === rwyId)!;
      expect(rwy).toBeDefined();

      // Place aircraft exactly 10 NM back along extended centerline
      const rad = (rwy.magneticHeading * Math.PI) / 180;
      const acX = rwy.threshold.x - 10 * Math.sin(rad);
      const acY = rwy.threshold.y - 10 * Math.cos(rad);
      const dev = calculateLocalizerDeviation(acX, acY, rwy);

      expect(Math.abs(dev.dots)).toBeLessThan(0.15);
      expect(dev.isEstablished).toBe(true);
    }
  });

  it('configures dynamic reciprocal runway locks when switching airports', () => {
    const oiii = resolveConfiguredAirport('OIII', '29R', '29L');
    const manager = new RunwayOccupancyManager(
      oiii.runwayGeometries,
      oiii.profile.reciprocalPairs
    );

    const occupied = manager.occupyRunway('29R', 'ac_1', 'IRA712', 'Landing', 10);
    expect(occupied).toBe(true);

    const checkRecip = manager.canClearForTakeoff('11L', 'ac_2');
    expect(checkRecip.allowed).toBe(false);

    const checkParallel = manager.canClearForTakeoff('29L', 'ac_2');
    expect(checkParallel.allowed).toBe(true);
  });
});

describe('Airport-Agnostic Traffic Generator', () => {
  it('scales inbound and departure altitudes relative to OIII field elevation (3962 ft)', () => {
    const oiii = getAirportProfile('OIII').airport;
    const inbound = generateInboundFlight(1, { airport: oiii });
    expect(inbound.destination).toBe('OIII');
    expect(inbound.altitude).toBeGreaterThanOrEqual(8000);

    const dep = generateDepartureFlight({ airport: oiii });
    expect(dep.origin).toBe('OIII');
    expect(dep.altitude).toBe(3962);
    expect(dep.targetAltitude).toBeGreaterThanOrEqual(9000);
  });

  it('spawns emergency Squawk 7700 flights when requested', () => {
    const trn2 = getAirportProfile('TRN2').airport;
    const emer = generateInboundFlight(99, {
      airport: trn2,
      isEmergency: true,
      emergencyType: 'ENGINE_FAILURE',
    });

    expect(emer.transponder).toBe('7700');
    expect(emer.isEmergency).toBe(true);
    expect(emer.emergencyType).toBe('ENGINE_FAILURE');
  });
});

describe('Training Academy Missions & Certification Logic', () => {
  it('defines 5 progressive academy missions', () => {
    expect(ACADEMY_MISSIONS.length).toBe(5);
    expect(ACADEMY_MISSIONS.map(m => m.id)).toEqual([
      'mission_1',
      'mission_2',
      'mission_3',
      'mission_4',
      'mission_5',
    ]);
  });

  it('passes Mission 1 when landings and score meet targets with zero violations', () => {
    const m1 = getMissionById('mission_1')!;
    const baseStats: SimulationStats = {
      landings: 2,
      departures: 0,
      goArounds: 0,
      separationViolations: 0,
      score: 95,
      elapsedSeconds: 180,
    };
    const initialState: ActiveMissionState = {
      mission: m1,
      status: 'active',
      objectives: buildMissionObjectives(m1, baseStats, false, false),
      emergencyHandled: false,
      goAroundObserved: false,
    };

    const result = evaluateMissionProgress(initialState, baseStats, false, false);
    expect(result.status).toBe('passed');
  });

  it('fails immediately if STCA separation violations exceed maxViolations', () => {
    const m2 = getMissionById('mission_2')!;
    const badStats: SimulationStats = {
      landings: 1,
      departures: 1,
      goArounds: 0,
      separationViolations: 1,
      score: 70,
      elapsedSeconds: 90,
    };
    const initialState: ActiveMissionState = {
      mission: m2,
      status: 'active',
      objectives: buildMissionObjectives(m2, badStats, false, false),
      emergencyHandled: false,
      goAroundObserved: false,
    };

    const result = evaluateMissionProgress(initialState, badStats, false, false);
    expect(result.status).toBe('failed');
    expect(result.failReason).toBeTruthy();
  });

  it('requires both Squawk 7700 landing AND controlled Go-Around to pass Mission 4', () => {
    const m4 = getMissionById('mission_4')!;
    const statsNoGa: SimulationStats = {
      landings: 2,
      departures: 0,
      goArounds: 0,
      separationViolations: 0,
      score: 95,
      elapsedSeconds: 200,
    };
    const state1: ActiveMissionState = {
      mission: m4,
      status: 'active',
      objectives: buildMissionObjectives(m4, statsNoGa, false, false),
      emergencyHandled: false,
      goAroundObserved: false,
    };

    // Emergency landed, but no Go-Around yet -> still active
    const mid = evaluateMissionProgress(state1, statsNoGa, true, false);
    expect(mid.status).toBe('active');
    expect(mid.emergencyHandled).toBe(true);

    // Now Go-Around observed -> passed
    const passed = evaluateMissionProgress(mid, { ...statsNoGa, goArounds: 1 }, false, true);
    expect(passed.status).toBe('passed');
  });
});

describe('Randomized 360° Perimeter Entry & ICAO Radiotelephony Speech Engine', () => {
  it('spawns inbound flights across varied 360-degree quadrants with spatial separation', () => {
    const egll = getAirportProfile('EGLL').airport;
    const spawned = [] as ReturnType<typeof generateInboundFlight>[];

    for (let i = 0; i < 12; i++) {
      const ac = generateInboundFlight(i + 1, {
        airport: egll,
        existingAircraft: spawned,
      });
      // Verify separation from existing traffic
      for (const existing of spawned) {
        expect(calculateDistance(ac.x, ac.y, existing.x, existing.y)).toBeGreaterThan(6);
      }
      // Verify inside visible radar perimeter range (<= 36.5 NM)
      const range = Math.hypot(ac.x, ac.y);
      expect(range).toBeGreaterThanOrEqual(26.5);
      expect(range).toBeLessThanOrEqual(36.5);
      spawned.push(ac);
    }

    // Must cover at least 3 distinct quadrants (not locked to one fixed spawn point)
    const quadrants = new Set(
      spawned.map(ac => Math.floor(calculateBearing(0, 0, ac.x, ac.y) / 90))
    );
    expect(quadrants.size).toBeGreaterThanOrEqual(3);

    // At least majority fly varied radar vectors (assignedWaypoint === null)
    const freeVectorCount = spawned.filter(ac => ac.assignedWaypoint === null).length;
    expect(freeVectorCount).toBeGreaterThanOrEqual(6);
  });

  it('normalizes ICAO callsigns, headings, runways, flight levels, and squawks into natural speech', () => {
    expect(radioAudio.formatCallsignForSpeech('IRA749', true)).toBe('Iranair seven four niner heavy');
    expect(formatRunwayForSpeech('29R')).toBe('two niner right');
    expect(formatRunwayForSpeech('09L')).toBe('zero niner left');

    const spokenClearance = formatPhraseForSpeech(
      'BAW459, turn right heading 095, descend and maintain FL100, cleared ILS approach runway 27R'
    );
    expect(spokenClearance).toContain('Speedbird four five niner');
    expect(spokenClearance).toContain('heading zero niner five');
    expect(spokenClearance).toContain('flight level one zero zero');
    expect(spokenClearance).toContain('I L S');
    expect(spokenClearance).toContain('runway two seven right');

    const spokenEmergency = formatPhraseForSpeech(
      'IRA712, squawking 7700, surface wind 260 at 14, QNH 1013'
    );
    expect(spokenEmergency).toContain('Iranair seven one two');
    expect(spokenEmergency).toContain('squawking seven seven zero zero');
    expect(spokenEmergency).toContain('Q N H one zero one three');
  });

  it('sequences multi-leg routeQueue waypoints automatically and arms ILS when autoInterceptILS is enabled', () => {
    const profile = getAirportProfile('EGLL');
    const [wp1, wp2] = profile.airport.waypoints;
    expect(wp1).toBeDefined();
    expect(wp2).toBeDefined();

    // Place aircraft within 0.6 NM of wp1 with wp2 queued and autoInterceptILS enabled
    let ac = generateInboundFlight(10, { airport: profile.airport });
    ac = {
      ...ac,
      x: wp1.position.x - 0.5,
      y: wp1.position.y,
      heading: 90,
      targetHeading: 90,
      assignedWaypoint: wp1.name,
      routeQueue: [wp2.name],
      autoInterceptILS: true,
      ilsArmed: false,
    };

    // Step 1: passing wp1 transitions to wp2
    const afterWp1 = stepAircraftPhysics(
      ac,
      1.0,
      profile.defaultWeather,
      profile.airport.waypoints,
      1,
      profile.airport.elevationFeet
    );
    expect(afterWp1.assignedWaypoint).toBe(wp2.name);
    expect(afterWp1.routeQueue).toEqual([]);
    expect(afterWp1.ilsArmed).toBe(false);

    // Step 2: passing final waypoint wp2 arms ILS automatically
    const nearWp2 = {
      ...afterWp1,
      x: wp2.position.x - 0.4,
      y: wp2.position.y,
    };
    const afterWp2 = stepAircraftPhysics(
      nearWp2,
      1.0,
      profile.defaultWeather,
      profile.airport.waypoints,
      2,
      profile.airport.elevationFeet
    );
    expect(afterWp2.assignedWaypoint).toBeNull();
    expect(afterWp2.ilsArmed).toBe(true);
    expect(afterWp2.status).toBe('LocalizerIntercept');
  });
});


