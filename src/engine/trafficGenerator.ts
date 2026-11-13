/**
 * SKYCONTROL - Realistic Airport-Agnostic Traffic Generator
 * Spawns authentic airline arrivals and departures from truly randomized 360° perimeter
 * vectors with spatial anti-clustering, varied intercept courses, and organic curved trail history.
 */

import { Aircraft, AircraftCategory, Airport, Runway } from '../types';
import { calculateBearing, normalizeHeading } from './physics';
import { HEATHROW_AIRPORT } from '../airports/heathrow';

interface AirlineProfile {
  prefix: string;
  airline: string;
  telephony: string;
  types: Array<{ model: string; category: AircraftCategory }>;
  origins: string[];
}

const AIRLINES: AirlineProfile[] = [
  {
    prefix: 'BAW',
    airline: 'British Airways',
    telephony: 'Speedbird',
    types: [
      { model: 'A320', category: 'Large' },
      { model: 'A321', category: 'Large' },
      { model: 'A350', category: 'Heavy' },
      { model: 'B77W', category: 'Heavy' },
      { model: 'B789', category: 'Heavy' },
    ],
    origins: ['KJFK', 'EDDF', 'LFPG', 'EHAM', 'LEMD', 'OMDB', 'KLAX'],
  },
  {
    prefix: 'IRA',
    airline: 'Iran Air',
    telephony: 'Iranair',
    types: [
      { model: 'A320', category: 'Large' },
      { model: 'A321', category: 'Large' },
      { model: 'B77W', category: 'Heavy' },
    ],
    origins: ['OISS', 'OIMM', 'OMDB', 'LTFM', 'EDDF'],
  },
  {
    prefix: 'UAE',
    airline: 'Emirates',
    telephony: 'Emirates',
    types: [
      { model: 'B77W', category: 'Heavy' },
      { model: 'A388', category: 'Heavy' },
      { model: 'A350', category: 'Heavy' },
    ],
    origins: ['OMDB', 'EGLL', 'KJFK', 'OIII'],
  },
  {
    prefix: 'VIR',
    airline: 'Virgin Atlantic',
    telephony: 'Virgin',
    types: [
      { model: 'A350', category: 'Heavy' },
      { model: 'B789', category: 'Heavy' },
      { model: 'A339', category: 'Heavy' },
    ],
    origins: ['KJFK', 'KBOS', 'KMIA', 'EGLL'],
  },
  {
    prefix: 'DLH',
    airline: 'Lufthansa',
    telephony: 'Lufthansa',
    types: [
      { model: 'A320', category: 'Large' },
      { model: 'A321', category: 'Large' },
      { model: 'B789', category: 'Heavy' },
    ],
    origins: ['EDDF', 'EDDM', 'OIII'],
  },
  {
    prefix: 'AFR',
    airline: 'Air France',
    telephony: 'Air France',
    types: [
      { model: 'A320', category: 'Large' },
      { model: 'A220', category: 'Large' },
    ],
    origins: ['LFPG', 'EGLL', 'LIRF'],
  },
  {
    prefix: 'KLM',
    airline: 'KLM Royal Dutch',
    telephony: 'KLM',
    types: [
      { model: 'B738', category: 'Large' },
      { model: 'B789', category: 'Heavy' },
      { model: 'E190', category: 'Large' },
    ],
    origins: ['EHAM', 'EGLL', 'OIII'],
  },
  {
    prefix: 'THY',
    airline: 'Turkish Airlines',
    telephony: 'Turkish',
    types: [
      { model: 'A321', category: 'Large' },
      { model: 'B77W', category: 'Heavy' },
      { model: 'A333', category: 'Heavy' },
    ],
    origins: ['LTFM', 'OIII', 'EGLL', 'KJFK'],
  },
  {
    prefix: 'QTR',
    airline: 'Qatar Airways',
    telephony: 'Qatari',
    types: [
      { model: 'A350', category: 'Heavy' },
      { model: 'B77W', category: 'Heavy' },
      { model: 'A320', category: 'Large' },
    ],
    origins: ['OTHH', 'OIII', 'EGLL', 'KJFK'],
  },
  {
    prefix: 'SWR',
    airline: 'Swiss International',
    telephony: 'Swiss',
    types: [
      { model: 'A220', category: 'Large' },
      { model: 'A321', category: 'Large' },
      { model: 'A333', category: 'Heavy' },
    ],
    origins: ['LSZH', 'LSGG', 'EGLL'],
  },
  {
    prefix: 'DAL',
    airline: 'Delta Air Lines',
    telephony: 'Delta',
    types: [
      { model: 'B738', category: 'Large' },
      { model: 'A321', category: 'Large' },
      { model: 'A350', category: 'Heavy' },
    ],
    origins: ['KATL', 'KLAX', 'EGLL', 'KORD'],
  },
  {
    prefix: 'AAL',
    airline: 'American',
    telephony: 'American',
    types: [
      { model: 'B738', category: 'Large' },
      { model: 'B77W', category: 'Heavy' },
      { model: 'B788', category: 'Heavy' },
    ],
    origins: ['KDFW', 'KORD', 'KJFK'],
  },
];

let squawkCounter = 4501;

function getNextSquawk(): string {
  const code = (squawkCounter++).toString();
  if (squawkCounter > 4599) squawkCounter = 4501;
  return code;
}

export interface SpawnFlightOptions {
  airport?: Airport;
  arrivalRunway?: Runway;
  departureRunway?: Runway;
  heavyRatio?: number;
  isEmergency?: boolean;
  emergencyType?: 'ENGINE_FAILURE' | 'MEDICAL' | 'FUEL_CRITICAL';
  /** Active traffic used to prevent overlapping or clustered spawns */
  existingAircraft?: Aircraft[];
  /** Spread initial fleet across inner/mid TMA scope rather than outer perimeter only */
  initialScopeDistribution?: boolean;
}

function pickAirlineAndType(heavyRatio?: number): {
  airline: AirlineProfile;
  aircraftSpec: { model: string; category: AircraftCategory };
} {
  const preferHeavy =
    typeof heavyRatio === 'number' ? Math.random() < heavyRatio : undefined;

  if (preferHeavy !== undefined) {
    const targetCategory: AircraftCategory = preferHeavy ? 'Heavy' : 'Large';
    const matchingAirlines = AIRLINES.filter(a =>
      a.types.some(t => t.category === targetCategory)
    );
    if (matchingAirlines.length > 0) {
      const airline = matchingAirlines[Math.floor(Math.random() * matchingAirlines.length)];
      const matchingTypes = airline.types.filter(t => t.category === targetCategory);
      const spec = matchingTypes[Math.floor(Math.random() * matchingTypes.length)];
      return { airline, aircraftSpec: spec };
    }
  }

  const airline = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
  const aircraftSpec = airline.types[Math.floor(Math.random() * airline.types.length)];
  return { airline, aircraftSpec };
}

function generateUniqueCallsign(
  airline: AirlineProfile,
  existingAircraft: Aircraft[],
  minNum: number = 101
): string {
  const existingSet = new Set(existingAircraft.map(a => a.callsign));
  for (let attempt = 0; attempt < 12; attempt++) {
    const num = Math.floor(minNum + Math.random() * (999 - minNum));
    const candidate = `${airline.prefix}${num}`;
    if (!existingSet.has(candidate)) {
      return candidate;
    }
  }
  return `${airline.prefix}${Math.floor(100 + Math.random() * 899)}`;
}

/**
 * Picks a randomized 360° spawn point maximizing distance from existing aircraft
 * so incoming flights appear around every sector without clustering or repeating the same path.
 */
function pickRandomizedSpawnPosition(
  existingAircraft: Aircraft[],
  isEmergency: boolean,
  initialScopeDistribution: boolean
): { x: number; y: number; spawnDist: number; spawnBearing: number } {
  const minDistRange = isEmergency
    ? 17
    : initialScopeDistribution
    ? 15
    : 27;
  const maxDistRange = isEmergency
    ? 24
    : initialScopeDistribution
    ? 32
    : 36;

  let bestCandidate = {
    x: 0,
    y: 0,
    spawnDist: 30,
    spawnBearing: Math.random() * 360,
    minSeparation: -1,
  };

  const candidatesCount = 24;
  for (let i = 0; i < candidatesCount; i++) {
    // Mix pure random azimuth with sector jitter so every direction around 360° gets sampled fairly
    const sectorJitter = ((i * (360 / candidatesCount)) + Math.random() * 28) % 360;
    const spawnBearing = i === 0 ? Math.random() * 360 : sectorJitter;
    const spawnDist = minDistRange + Math.random() * (maxDistRange - minDistRange);
    const rad = (spawnBearing * Math.PI) / 180;
    const cx = spawnDist * Math.sin(rad);
    const cy = spawnDist * Math.cos(rad);

    if (existingAircraft.length === 0) {
      return { x: cx, y: cy, spawnDist, spawnBearing };
    }

    let minSep = Infinity;
    for (const other of existingAircraft) {
      const dist = Math.hypot(cx - other.x, cy - other.y);
      if (dist < minSep) minSep = dist;
    }

    // Also penalize spawning on nearly the exact same bearing as recent inbounds
    let bearingSpreadPenalty = 0;
    for (const other of existingAircraft) {
      if (other.status === 'Inbound' && Math.hypot(other.x, other.y) > 12) {
        const otherBearing = calculateBearing(0, 0, other.x, other.y);
        const diff = Math.abs(((spawnBearing - otherBearing + 540) % 360) - 180);
        if (diff < 32) {
          bearingSpreadPenalty += (32 - diff) * 0.25;
        }
      }
    }

    const score = minSep - bearingSpreadPenalty;
    if (score > bestCandidate.minSeparation) {
      bestCandidate = {
        x: cx,
        y: cy,
        spawnDist,
        spawnBearing,
        minSeparation: score,
      };
    }

    // Fast-accept if completely clear (>= 15 NM from everyone and well-spaced azimuth)
    if (score >= 15 && i >= 3) {
      break;
    }
  }

  return {
    x: bestCandidate.x,
    y: bestCandidate.y,
    spawnDist: bestCandidate.spawnDist,
    spawnBearing: bestCandidate.spawnBearing,
  };
}

/**
 * Generates an organic curved or slightly angled radar trail leading into the spawn position
 */
function buildOrganicEntryHistory(
  x: number,
  y: number,
  heading: number,
  altitude: number
): Aircraft['history'] {
  const pts: Aircraft['history'] = [];
  const curveSign = Math.random() < 0.5 ? -1 : 1;
  const curveRatePerStep = (0.8 + Math.random() * 2.2) * curveSign;

  let backX = x;
  let backY = y;
  let backHeading = heading;
  const stepDist = 2.05;

  const backwardsPts: Aircraft['history'] = [];
  for (let s = 1; s <= 6; s++) {
    backHeading = normalizeHeading(backHeading - curveRatePerStep);
    const rad = (backHeading * Math.PI) / 180;
    backX -= stepDist * Math.sin(rad);
    backY -= stepDist * Math.cos(rad);
    backwardsPts.push({
      x: backX,
      y: backY,
      altitude: Math.min(20000, Math.round(altitude + s * (380 + Math.random() * 140))),
      timestamp: -s * 15,
    });
  }

  for (let i = backwardsPts.length - 1; i >= 0; i--) {
    pts.push(backwardsPts[i]);
  }
  pts.push({ x, y, altitude, timestamp: 0 });
  return pts;
}

/**
 * Spawns a realistic inbound flight from any 360-degree radar perimeter position
 * along a non-fixed intercept vector (never constrained to a single fixed point or route).
 */
export function generateInboundFlight(
  idSuffix?: number,
  options: SpawnFlightOptions = {}
): Aircraft {
  const airport = options.airport || HEATHROW_AIRPORT;
  const arrivalRwy =
    options.arrivalRunway ||
    airport.runways.find(r => r.activeLanding) ||
    airport.runways.find(r => r.id === airport.defaultArrivalRunway) ||
    airport.runways[0];

  const existingAircraft = options.existingAircraft || [];
  const { airline, aircraftSpec } = pickAirlineAndType(options.heavyRatio);
  const callsign = generateUniqueCallsign(airline, existingAircraft, 101);

  const validOrigins = airline.origins.filter(o => o !== airport.icao);
  const origin =
    validOrigins[Math.floor(Math.random() * validOrigins.length)] || 'EDDF';

  const { x, y, spawnDist } = pickRandomizedSpawnPosition(
    existingAircraft,
    Boolean(options.isEmergency),
    Boolean(options.initialScopeDistribution)
  );

  // Pick a randomized target/offset point around the airport TMA so aircraft arrive along
  // genuinely varied downwind, base, or diagonal crosswind vectors rather than fixed lines.
  const offsetDist = options.isEmergency ? 2 + Math.random() * 4 : 3 + Math.random() * 9;
  const offsetAngleRad = Math.random() * Math.PI * 2;
  const aimX = offsetDist * Math.sin(offsetAngleRad);
  const aimY = offsetDist * Math.cos(offsetAngleRad);

  const inboundTrack = calculateBearing(x, y, aimX, aimY);
  const heading = Math.round(normalizeHeading(inboundTrack + (Math.random() * 16 - 8)));

  // Occasionally (~20%, non-emergency) assign a randomized inbound STAR/waypoint on the same side;
  // otherwise keep assignedWaypoint null so aircraft flies its unique random entry vector.
  let assignedWaypoint: string | null = null;
  if (!options.isEmergency && !options.initialScopeDistribution && Math.random() < 0.22 && airport.waypoints.length > 0) {
    const frontCandidates = airport.waypoints.filter(wp => {
      const brg = calculateBearing(x, y, wp.position.x, wp.position.y);
      const diff = Math.abs(((brg - inboundTrack + 540) % 360) - 180);
      return diff < 55;
    });
    if (frontCandidates.length > 0) {
      assignedWaypoint = frontCandidates[Math.floor(Math.random() * frontCandidates.length)].name;
    }
  }

  // Entry altitude scaled cleanly above airport field elevation
  const baseThousands = Math.ceil(airport.elevationFeet / 1000) * 1000;
  const altitudeOffsets = options.isEmergency
    ? [4000, 5000, 6000]
    : options.initialScopeDistribution
    ? [5000, 6000, 7000, 8000, 9000]
    : [7000, 8000, 9000, 10000, 11000, 12000];
  const altitude =
    baseThousands +
    altitudeOffsets[Math.floor(Math.random() * altitudeOffsets.length)];
  const targetAltitude =
    baseThousands + (options.isEmergency ? 3000 : 4000 + Math.floor(Math.random() * 3) * 1000);
  const indicatedAirspeed = options.isEmergency
    ? 200 + Math.floor(Math.random() * 15)
    : 220 + Math.floor(Math.random() * 30);

  const id = `ac_${Date.now()}_${idSuffix || Math.floor(Math.random() * 10000)}_${Math.floor(Math.random() * 999)}`;

  return {
    id,
    callsign,
    airline: airline.airline,
    telephony: airline.telephony,
    aircraftType: aircraftSpec.model,
    category: aircraftSpec.category,
    origin,
    destination: airport.icao,
    x,
    y,
    altitude,
    targetAltitude,
    indicatedAirspeed,
    targetAirspeed: options.isEmergency ? 185 : 210 + Math.floor(Math.random() * 20),
    groundSpeed: indicatedAirspeed,
    heading,
    targetHeading: heading,
    verticalSpeed: -1400,
    expediteAltitude: Boolean(options.isEmergency),
    turnRate: 0,
    status: 'Inbound',
    assignedRunway: arrivalRwy.id,
    transponder: options.isEmergency ? '7700' : getNextSquawk(),
    isEmergency: Boolean(options.isEmergency),
    emergencyType: options.isEmergency ? options.emergencyType || 'ENGINE_FAILURE' : null,
    assignedWaypoint,
    holdingWaypoint: null,
    holdingInboundHeading: arrivalRwy.heading,
    holdingLegTime: 60,
    holdingTimer: 0,
    holdingLeg: 'Inbound',
    ilsArmed: false,
    ilsLocalizerCaptured: false,
    ilsGlideslopeCaptured: false,
    distanceToThreshold: Math.round(spawnDist * 10) / 10,
    glidepathDeviation: 0,
    localizerDeviation: 0,
    tagOffset: {
      x: x >= 0 ? -72 : 30,
      y: y >= 0 ? 24 : -26,
    },
    history: buildOrganicEntryHistory(x, y, heading, altitude),
  };
}

/**
 * Spawns a departure aircraft lined up or holding short on the configured departure runway
 */
export function generateDepartureFlight(options: SpawnFlightOptions = {}): Aircraft {
  const airport = options.airport || HEATHROW_AIRPORT;
  const departureRwy =
    options.departureRunway ||
    airport.runways.find(r => r.activeDeparture) ||
    airport.runways.find(r => r.id === airport.defaultDepartureRunway) ||
    airport.runways[1] ||
    airport.runways[0];

  const existingAircraft = options.existingAircraft || [];
  const { airline, aircraftSpec } = pickAirlineAndType(options.heavyRatio);
  const callsign = generateUniqueCallsign(airline, existingAircraft, 201);
  const validDests = airline.origins.filter(o => o !== airport.icao);
  const destination =
    validDests[Math.floor(Math.random() * validDests.length)] || 'LFPG';

  const id = `ac_dep_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const startX = departureRwy.threshold.x;
  const startY = departureRwy.threshold.y;
  const climbTarget = Math.ceil(airport.elevationFeet / 1000) * 1000 + 6000;

  return {
    id,
    callsign,
    airline: airline.airline,
    telephony: airline.telephony,
    aircraftType: aircraftSpec.model,
    category: aircraftSpec.category,
    origin: airport.icao,
    destination,
    x: startX,
    y: startY,
    altitude: airport.elevationFeet,
    targetAltitude: climbTarget,
    indicatedAirspeed: 0,
    targetAirspeed: 210,
    groundSpeed: 0,
    heading: departureRwy.heading,
    targetHeading: departureRwy.heading,
    verticalSpeed: 0,
    expediteAltitude: false,
    turnRate: 0,
    status: 'Departing',
    flightPhase: 'HOLD_SHORT',
    assignedRunway: departureRwy.id,
    transponder: getNextSquawk(),
    assignedWaypoint: null,
    holdingWaypoint: null,
    holdingInboundHeading: departureRwy.heading,
    holdingLegTime: 60,
    holdingTimer: 0,
    holdingLeg: 'Inbound',
    ilsArmed: false,
    ilsLocalizerCaptured: false,
    ilsGlideslopeCaptured: false,
    distanceToThreshold: 0,
    glidepathDeviation: 0,
    localizerDeviation: 0,
    tagOffset: { x: 25, y: 25 },
    history: [{ x: startX, y: startY, altitude: airport.elevationFeet, timestamp: 0 }],
  };
}
