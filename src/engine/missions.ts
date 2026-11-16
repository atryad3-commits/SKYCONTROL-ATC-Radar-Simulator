/**
 * SKYCONTROL - Flight Academy Missions & Real-Time Certification Evaluator
 * Defines 5 progressive missions covering vectoring, multi-runway sequencing,
 * severe crosswind X-runway ops, Squawk 7700 emergency + Go-Around, and Final Checkride.
 */

import {
  ActiveMissionState,
  MissionDefinition,
  MissionObjective,
  SimulationStats,
} from '../types';

export const ACADEMY_MISSIONS: MissionDefinition[] = [
  {
    id: 'mission_1',
    number: 1,
    title: 'Vectoring & Descent Fundamentals',
    subtitle: 'Stage 1 · London Heathrow (EGLL)',
    description:
      'Descend and vector 2 inbound arrivals from outer radar boundaries onto the RWY 27R ILS approach while maintaining standard separation (3 NM / 1,000 ft).',
    airportIcao: 'EGLL',
    landingRunwayId: '27R',
    departureRunwayId: '27L',
    weather: {
      windDirection: 270,
      windSpeed: 10,
      gusts: 14,
      qnh: 1015,
      visibilityNM: 10,
      ceilingFeet: 5000,
      precipitation: 'None',
    },
    targetLandings: 2,
    targetDepartures: 0,
    minScore: 80,
    maxViolations: 0,
    spawnIntervalSec: 45,
    maxTraffic: 5,
    initialInbounds: 3,
    initialDepartures: 0,
  },
  {
    id: 'mission_2',
    number: 2,
    title: 'ILS Sequencing & Parallel Runway Ops',
    subtitle: 'Stage 2 · Tehran Mehrabad (OIII)',
    description:
      'At high-elevation Mehrabad (3,962 ft AMSL), land 3 inbound flights on RWY 29R while launching 2 departures off parallel RWY 29L.',
    airportIcao: 'OIII',
    landingRunwayId: '29R',
    departureRunwayId: '29L',
    weather: {
      windDirection: 290,
      windSpeed: 14,
      gusts: 20,
      qnh: 1016,
      visibilityNM: 9,
      ceilingFeet: 6500,
      precipitation: 'None',
    },
    targetLandings: 3,
    targetDepartures: 2,
    minScore: 85,
    maxViolations: 0,
    spawnIntervalSec: 38,
    maxTraffic: 7,
    initialInbounds: 3,
    initialDepartures: 2,
  },
  {
    id: 'mission_3',
    number: 3,
    title: 'Severe Crosswind & Crossing Runways',
    subtitle: 'Stage 3 · Crosswind Ridge Academy (TRN1)',
    description:
      'Operate intersecting X-runways (36 / 24) under 26 kt crosswind (gusting 34 kt): execute 2 stabilized landings and 1 safe crossing departure.',
    airportIcao: 'TRN1',
    landingRunwayId: '36',
    departureRunwayId: '24',
    weather: {
      windDirection: 275,
      windSpeed: 26,
      gusts: 34,
      qnh: 996,
      visibilityNM: 7,
      ceilingFeet: 3200,
      precipitation: 'Light Rain',
    },
    targetLandings: 2,
    targetDepartures: 1,
    minScore: 85,
    maxViolations: 0,
    spawnIntervalSec: 40,
    maxTraffic: 6,
    initialInbounds: 3,
    initialDepartures: 1,
  },
  {
    id: 'mission_4',
    number: 4,
    title: 'Squawk 7700 Emergency & Go-Around',
    subtitle: 'Stage 4 · Converging Delta Base (TRN2)',
    description:
      'Handle a priority Squawk 7700 emergency arrival alongside converging runway traffic. Land 2 aircraft (including the emergency flight) and manage at least one safe Go-Around re-sequence.',
    airportIcao: 'TRN2',
    landingRunwayId: '15',
    departureRunwayId: '20',
    weather: {
      windDirection: 175,
      windSpeed: 16,
      gusts: 24,
      qnh: 1009,
      visibilityNM: 8,
      ceilingFeet: 4000,
      precipitation: 'None',
    },
    targetLandings: 2,
    targetDepartures: 0,
    minScore: 80,
    maxViolations: 0,
    requireEmergencyHandled: true,
    requireGoAroundHandled: true,
    spawnIntervalSec: 42,
    maxTraffic: 6,
    initialInbounds: 3,
    initialDepartures: 1,
  },
  {
    id: 'mission_5',
    number: 5,
    title: 'Final ATC Certification Checkride',
    subtitle: 'Stage 5 · New York Kennedy (KJFK)',
    description:
      'Master checkride at intersecting KJFK: complete 3 arrivals on 31L and 2 departures off 04L with zero separation violations and a minimum score of 90%.',
    airportIcao: 'KJFK',
    landingRunwayId: '31L',
    departureRunwayId: '04L',
    weather: {
      windDirection: 330,
      windSpeed: 18,
      gusts: 26,
      qnh: 1011,
      visibilityNM: 8,
      ceilingFeet: 3800,
      precipitation: 'None',
    },
    targetLandings: 3,
    targetDepartures: 2,
    minScore: 90,
    maxViolations: 0,
    spawnIntervalSec: 32,
    maxTraffic: 8,
    initialInbounds: 4,
    initialDepartures: 2,
  },
];

export function getMissionById(id: string): MissionDefinition | undefined {
  return ACADEMY_MISSIONS.find(m => m.id === id);
}

export function buildMissionObjectives(
  mission: MissionDefinition,
  stats: SimulationStats,
  emergencyHandled: boolean,
  goAroundObserved: boolean
): MissionObjective[] {
  const objectives: MissionObjective[] = [];

  if (mission.targetLandings > 0) {
    objectives.push({
      id: 'landings',
      label: `Safe Landings (${stats.landings}/${mission.targetLandings})`,
      current: stats.landings,
      target: mission.targetLandings,
      completed: stats.landings >= mission.targetLandings,
    });
  }

  if (mission.targetDepartures > 0) {
    objectives.push({
      id: 'departures',
      label: `Departures (${stats.departures}/${mission.targetDepartures})`,
      current: stats.departures,
      target: mission.targetDepartures,
      completed: stats.departures >= mission.targetDepartures,
    });
  }

  if (mission.requireEmergencyHandled) {
    objectives.push({
      id: 'emergency',
      label: 'Land Emergency Aircraft (Squawk 7700)',
      current: emergencyHandled ? 1 : 0,
      target: 1,
      completed: emergencyHandled,
    });
  }

  if (mission.requireGoAroundHandled) {
    const gaOk = goAroundObserved || stats.goArounds >= 1;
    objectives.push({
      id: 'go_around',
      label: 'Execute Controlled Go-Around',
      current: gaOk ? 1 : 0,
      target: 1,
      completed: gaOk,
    });
  }

  objectives.push({
    id: 'separation',
    label: `Maintain Separation (Max ${mission.maxViolations} STCA)`,
    current: stats.separationViolations,
    target: mission.maxViolations,
    completed: stats.separationViolations <= mission.maxViolations,
    failed: stats.separationViolations > mission.maxViolations,
    isConstraint: true,
  });

  objectives.push({
    id: 'score',
    label: `Minimum Operational Score ${mission.minScore}%`,
    current: stats.score,
    target: mission.minScore,
    completed: stats.score >= mission.minScore,
    failed: stats.score < mission.minScore && stats.separationViolations > mission.maxViolations,
    isConstraint: true,
  });

  return objectives;
}

export function evaluateMissionProgress(
  prevState: ActiveMissionState,
  stats: SimulationStats,
  emergencyLandedThisTick: boolean,
  goAroundThisTick: boolean
): ActiveMissionState {
  const mission = prevState.mission;
  if (!mission || prevState.status !== 'active') {
    return prevState;
  }

  const emergencyHandled = prevState.emergencyHandled || emergencyLandedThisTick;
  const goAroundObserved =
    prevState.goAroundObserved || goAroundThisTick || stats.goArounds >= 1;

  const objectives = buildMissionObjectives(
    mission,
    stats,
    emergencyHandled,
    goAroundObserved
  );

  // Immediate failure if separation violations exceed allowed cap
  if (stats.separationViolations > mission.maxViolations) {
    return {
      ...prevState,
      status: 'failed',
      failReason: `Standard separation minimum breached (STCA Violations: ${stats.separationViolations})`,
      emergencyHandled,
      goAroundObserved,
      objectives,
    };
  }

  // Victory check when all objectives & constraints are satisfied
  const allMet = objectives.every(obj => obj.completed && !obj.failed);
  if (allMet) {
    return {
      ...prevState,
      status: 'passed',
      emergencyHandled,
      goAroundObserved,
      objectives,
    };
  }

  return {
    ...prevState,
    emergencyHandled,
    goAroundObserved,
    objectives,
  };
}
