/**
 * SKYCONTROL - Realistic Airport-Agnostic Mixed-Fleet Traffic Generator
 * Spawns authentic Heavy Widebodies, Narrowbody Jets, Regional Turboprops,
 * Business Jets, and Light GA Piston Aircraft with model-matched initial speeds,
 * altitudes, callsigns/tail registrations, and organic curved entry trails.
 */

import { Aircraft, AircraftCategory, AircraftClass, Airport, Runway } from '../types';
import { calculateBearing, normalizeHeading } from './physics';
import { getAircraftPerformance } from './aircraftPerformance';
import { HEATHROW_AIRPORT } from '../airports/heathrow';

interface OperatorProfile {
  prefix: string;
  airline: string;
  telephony: string;
  isRegistrationPrefix?: boolean;
  types: Array<{ model: string; category: AircraftCategory; aircraftClass: AircraftClass }>;
  origins: string[];
}

const OPERATORS: OperatorProfile[] = [
  {
    prefix: 'BAW',
    airline: 'British Airways',
    telephony: 'Speedbird',
    types: [
      { model: 'A320', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'A321', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'A350', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
      { model: 'B77W', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
      { model: 'B789', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
    ],
    origins: ['KJFK', 'EDDF', 'LFPG', 'EHAM', 'LEMD', 'OMDB', 'KLAX'],
  },
  {
    prefix: 'IRA',
    airline: 'Iran Air',
    telephony: 'Iranair',
    types: [
      { model: 'A320', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'A321', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'B77W', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
      { model: 'AT76', category: 'Large', aircraftClass: 'REGIONAL_TURBOPROP' },
    ],
    origins: ['OISS', 'OIMM', 'OMDB', 'LTFM', 'EDDF'],
  },
  {
    prefix: 'UAE',
    airline: 'Emirates',
    telephony: 'Emirates',
    types: [
      { model: 'B77W', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
      { model: 'A388', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
      { model: 'A350', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
    ],
    origins: ['OMDB', 'EGLL', 'KJFK', 'OIII'],
  },
  {
    prefix: 'VIR',
    airline: 'Virgin Atlantic',
    telephony: 'Virgin',
    types: [
      { model: 'A350', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
      { model: 'B789', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
      { model: 'A339', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
    ],
    origins: ['KJFK', 'KBOS', 'KMIA', 'EGLL'],
  },
  {
    prefix: 'DLH',
    airline: 'Lufthansa',
    telephony: 'Lufthansa',
    types: [
      { model: 'A320', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'A321', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'B789', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
    ],
    origins: ['EDDF', 'EDDM', 'OIII'],
  },
  {
    prefix: 'AFR',
    airline: 'Air France',
    telephony: 'Air France',
    types: [
      { model: 'A320', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'A220', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'AT76', category: 'Large', aircraftClass: 'REGIONAL_TURBOPROP' },
    ],
    origins: ['LFPG', 'EGLL', 'LIRF'],
  },
  {
    prefix: 'KLM',
    airline: 'KLM Royal Dutch',
    telephony: 'KLM',
    types: [
      { model: 'B738', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'B789', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
      { model: 'E190', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
    ],
    origins: ['EHAM', 'EGLL', 'OIII'],
  },
  {
    prefix: 'THY',
    airline: 'Turkish Airlines',
    telephony: 'Turkish',
    types: [
      { model: 'A321', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'B77W', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
      { model: 'A333', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
    ],
    origins: ['LTFM', 'OIII', 'EGLL', 'KJFK'],
  },
  {
    prefix: 'QTR',
    airline: 'Qatar Airways',
    telephony: 'Qatari',
    types: [
      { model: 'A350', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
      { model: 'B77W', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
      { model: 'A320', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
    ],
    origins: ['OTHH', 'OIII', 'EGLL', 'KJFK'],
  },
  {
    prefix: 'SWR',
    airline: 'Swiss International',
    telephony: 'Swiss',
    types: [
      { model: 'A220', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'A321', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'A333', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
    ],
    origins: ['LSZH', 'LSGG', 'EGLL'],
  },
  {
    prefix: 'DAL',
    airline: 'Delta Air Lines',
    telephony: 'Delta',
    types: [
      { model: 'B738', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'A321', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'A350', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
    ],
    origins: ['KATL', 'KLAX', 'EGLL', 'KORD'],
  },
  {
    prefix: 'AAL',
    airline: 'American',
    telephony: 'American',
    types: [
      { model: 'B738', category: 'Large', aircraftClass: 'NARROWBODY_JET' },
      { model: 'B77W', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
      { model: 'B788', category: 'Heavy', aircraftClass: 'HEAVY_WIDEBODY' },
    ],
    origins: ['KDFW', 'KORD', 'KJFK'],
  },
  // Regional Turboprop Operators
  {
    prefix: 'BEE',
    airline: 'Flybe Regional',
    telephony: 'Jersey',
    types: [
      { model: 'DH8D', category: 'Large', aircraftClass: 'REGIONAL_TURBOPROP' },
      { model: 'AT76', category: 'Large', aircraftClass: 'REGIONAL_TURBOPROP' },
    ],
    origins: ['EGPH', 'EGCC', 'EGBB', 'OISS', 'LFOB'],
  },
  {
    prefix: 'LOG',
    airline: 'Loganair',
    telephony: 'Logan',
    types: [
      { model: 'AT76', category: 'Large', aircraftClass: 'REGIONAL_TURBOPROP' },
      { model: 'DH8D', category: 'Large', aircraftClass: 'REGIONAL_TURBOPROP' },
    ],
    origins: ['EGPD', 'EGPF', 'EGNT', 'EIDW'],
  },
  // Business Jet Operators
  {
    prefix: 'EJA',
    airline: 'NetJets Aviation',
    telephony: 'Execjet',
    types: [
      { model: 'C56X', category: 'Small', aircraftClass: 'BIZJET' },
      { model: 'LJ45', category: 'Small', aircraftClass: 'BIZJET' },
      { model: 'GLF5', category: 'Large', aircraftClass: 'BIZJET' },
    ],
    origins: ['KTEB', 'EGLF', 'LFPB', 'LSGG', 'KBED'],
  },
  {
    prefix: 'VJT',
    airline: 'VistaJet',
    telephony: 'Vista',
    types: [
      { model: 'GLF5', category: 'Large', aircraftClass: 'BIZJET' },
      { model: 'C56X', category: 'Small', aircraftClass: 'BIZJET' },
      { model: 'LJ45', category: 'Small', aircraftClass: 'BIZJET' },
    ],
    origins: ['LFPB', 'EGLF', 'OMDW', 'LSZH'],
  },
  // General Aviation Light Aircraft
  {
    prefix: 'GA',
    airline: 'General Aviation',
    telephony: '',
    isRegistrationPrefix: true,
    types: [
      { model: 'C172', category: 'Small', aircraftClass: 'LIGHT_GA' },
      { model: 'SR22', category: 'Small', aircraftClass: 'LIGHT_GA' },
      { model: 'PA28', category: 'Small', aircraftClass: 'LIGHT_GA' },
    ],
    origins: ['EGTB', 'EGKA', 'KFRG', 'KCDW', 'OIFM', 'OIIP'],
  },
];

const GA_REGISTRATIONS = [
  'N172SP',
  'N22SR',
  'N418PA',
  'G-SKY1',
  'G-BOAC',
  'G-C172',
  'G-SR22',
  'EP-GA1',
  'EP-PA2',
  'N738C',
  'D-EFLY',
  'F-HBCD',
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

function pickOperatorAndType(
  heavyRatio?: number,
  runwayLengthFt?: number
): {
  operator: OperatorProfile;
  aircraftSpec: { model: string; category: AircraftCategory; aircraftClass: AircraftClass };
} {
  // Choose class distribution respecting heavyRatio and runway suitability
  const effectiveHeavyRatio =
    typeof runwayLengthFt === 'number' && runwayLengthFt < 6500
      ? 0
      : typeof heavyRatio === 'number'
      ? heavyRatio
      : 0.25;

  const roll = Math.random();
  let desiredClass: AircraftClass;

  if (roll < effectiveHeavyRatio) {
    desiredClass = 'HEAVY_WIDEBODY';
  } else {
    const remRoll = (roll - effectiveHeavyRatio) / Math.max(0.05, 1 - effectiveHeavyRatio);
    if (typeof runwayLengthFt === 'number' && runwayLengthFt < 6500) {
      // Regional/Training strips favor Light GA, Turboprops, and Bizjets
      if (remRoll < 0.45) desiredClass = 'LIGHT_GA';
      else if (remRoll < 0.78) desiredClass = 'REGIONAL_TURBOPROP';
      else desiredClass = 'BIZJET';
    } else {
      // Major hubs get authentic mixed fleet: Narrowbodies, Turboprops, Bizjets & GA
      if (remRoll < 0.50) desiredClass = 'NARROWBODY_JET';
      else if (remRoll < 0.72) desiredClass = 'REGIONAL_TURBOPROP';
      else if (remRoll < 0.87) desiredClass = 'BIZJET';
      else desiredClass = 'LIGHT_GA';
    }
  }

  const matchingOperators = OPERATORS.filter(op =>
    op.types.some(t => t.aircraftClass === desiredClass)
  );
  if (matchingOperators.length > 0) {
    const operator =
      matchingOperators[Math.floor(Math.random() * matchingOperators.length)];
    const matchingTypes = operator.types.filter(
      t => t.aircraftClass === desiredClass
    );
    const aircraftSpec =
      matchingTypes[Math.floor(Math.random() * matchingTypes.length)];
    return { operator, aircraftSpec };
  }

  const operator = OPERATORS[0];
  return { operator, aircraftSpec: operator.types[0] };
}

function generateUniqueCallsign(
  operator: OperatorProfile,
  existingAircraft: Aircraft[],
  minNum: number = 101
): string {
  const existingSet = new Set(existingAircraft.map(a => a.callsign));

  if (operator.isRegistrationPrefix) {
    for (let attempt = 0; attempt < 15; attempt++) {
      const candidate =
        GA_REGISTRATIONS[Math.floor(Math.random() * GA_REGISTRATIONS.length)];
      if (!existingSet.has(candidate)) {
        return candidate;
      }
    }
    const randDigits = Math.floor(100 + Math.random() * 899);
    const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    const l1 = letters[Math.floor(Math.random() * letters.length)];
    const l2 = letters[Math.floor(Math.random() * letters.length)];
    return `N${randDigits}${l1}${l2}`;
  }

  for (let attempt = 0; attempt < 12; attempt++) {
    const num = Math.floor(minNum + Math.random() * (999 - minNum));
    const candidate = `${operator.prefix}${num}`;
    if (!existingSet.has(candidate)) {
      return candidate;
    }
  }
  return `${operator.prefix}${Math.floor(100 + Math.random() * 899)}`;
}

/**
 * Picks a randomized 360° spawn point maximizing distance from existing aircraft
 * so incoming flights appear around every sector without clustering or repeating the same path.
 */
function pickRandomizedSpawnPosition(
  existingAircraft: Aircraft[],
  isEmergency: boolean,
  initialScopeDistribution: boolean,
  aircraftClass: AircraftClass
): { x: number; y: number; spawnDist: number; spawnBearing: number } {
  // Light GA enters closer to the airport perimeter than widebody heavies
  const isSlowProp = aircraftClass === 'LIGHT_GA';
  const minDistRange = isEmergency
    ? isSlowProp
      ? 11
      : 17
    : initialScopeDistribution
    ? isSlowProp
      ? 9
      : 15
    : isSlowProp
    ? 14
    : 26;
  const maxDistRange = isEmergency
    ? isSlowProp
      ? 16
      : 24
    : initialScopeDistribution
    ? isSlowProp
      ? 18
      : 32
    : isSlowProp
    ? 22
    : 36;

  let bestCandidate = {
    x: 0,
    y: 0,
    spawnDist: (minDistRange + maxDistRange) / 2,
    spawnBearing: Math.random() * 360,
    minSeparation: -1,
  };

  const candidatesCount = 24;
  for (let i = 0; i < candidatesCount; i++) {
    const sectorJitter = (i * (360 / candidatesCount) + Math.random() * 28) % 360;
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

    let bearingSpreadPenalty = 0;
    for (const other of existingAircraft) {
      if (other.status === 'Inbound' && Math.hypot(other.x, other.y) > 10) {
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
 * scaled cleanly to the aircraft's airspeed and descent rate.
 */
function buildOrganicEntryHistory(
  x: number,
  y: number,
  heading: number,
  altitude: number,
  indicatedAirspeed: number,
  descentFpm: number,
  maxCeilingFt: number
): Aircraft['history'] {
  const pts: Aircraft['history'] = [];
  const curveSign = Math.random() < 0.5 ? -1 : 1;
  const curveRatePerStep = (0.8 + Math.random() * 2.2) * curveSign;

  let backX = x;
  let backY = y;
  let backHeading = heading;
  // Scale trail dot distance realistically to ~15s flight intervals at aircraft speed
  const stepDist = Math.max(0.35, (indicatedAirspeed / 3600) * 15);
  const altPerStep = Math.max(120, Math.round((descentFpm / 60) * 15));

  const backwardsPts: Aircraft['history'] = [];
  for (let s = 1; s <= 6; s++) {
    backHeading = normalizeHeading(backHeading - curveRatePerStep);
    const rad = (backHeading * Math.PI) / 180;
    backX -= stepDist * Math.sin(rad);
    backY -= stepDist * Math.cos(rad);
    backwardsPts.push({
      x: backX,
      y: backY,
      altitude: Math.min(maxCeilingFt, Math.round(altitude + s * altPerStep)),
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
 * with speed, altitude, and callsign matched strictly to its aircraft model profile.
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
  const { operator, aircraftSpec } = pickOperatorAndType(
    options.heavyRatio,
    arrivalRwy?.lengthFeet
  );
  const perf = getAircraftPerformance(aircraftSpec.model);
  const callsign = generateUniqueCallsign(operator, existingAircraft, 101);

  const validOrigins = operator.origins.filter(o => o !== airport.icao);
  const origin =
    validOrigins[Math.floor(Math.random() * validOrigins.length)] || 'EDDF';

  const { x, y, spawnDist } = pickRandomizedSpawnPosition(
    existingAircraft,
    Boolean(options.isEmergency),
    Boolean(options.initialScopeDistribution),
    aircraftSpec.aircraftClass
  );

  const offsetDist = options.isEmergency ? 2 + Math.random() * 4 : 3 + Math.random() * 8;
  const offsetAngleRad = Math.random() * Math.PI * 2;
  const aimX = offsetDist * Math.sin(offsetAngleRad);
  const aimY = offsetDist * Math.cos(offsetAngleRad);

  const inboundTrack = calculateBearing(x, y, aimX, aimY);
  const heading = Math.round(normalizeHeading(inboundTrack + (Math.random() * 16 - 8)));

  const starAssignment = resolveArrivalProcedureAssignment(
    airport,
    arrivalRwy,
    x,
    y
  );

  let assignedWaypoint: string | null = null;
  let routeQueue: string[] = [];
  if (
    !options.isEmergency &&
    !options.initialScopeDistribution &&
    starAssignment.arrivalRouteWaypoints.length > 0 &&
    Math.random() < 0.14
  ) {
    // Some inbound flights check in already transitioning along their assigned STAR
    assignedWaypoint = starAssignment.arrivalRouteWaypoints[0];
    routeQueue = starAssignment.arrivalRouteWaypoints.slice(1);
  } else if (
    !options.isEmergency &&
    !options.initialScopeDistribution &&
    Math.random() < 0.1 &&
    airport.waypoints.length > 0
  ) {
    const frontCandidates = airport.waypoints.filter(wp => {
      const brg = calculateBearing(x, y, wp.position.x, wp.position.y);
      const diff = Math.abs(((brg - inboundTrack + 540) % 360) - 180);
      return diff < 55;
    });
    if (frontCandidates.length > 0) {
      assignedWaypoint =
        frontCandidates[Math.floor(Math.random() * frontCandidates.length)].name;
    }
  }

  // Model-matched entry altitude and airspeed
  const baseThousands = Math.ceil(airport.elevationFeet / 1000) * 1000;
  const minAgl = perf.initialSpawnAltMinAglFt;
  const maxAgl = perf.initialSpawnAltMaxAglFt;
  const rawAgl = options.isEmergency
    ? minAgl + Math.floor(Math.random() * 3) * 500
    : options.initialScopeDistribution
    ? minAgl + Math.floor(Math.random() * Math.max(2, Math.floor((maxAgl - minAgl) / 1000))) * 1000
    : minAgl + 1000 + Math.floor(Math.random() * Math.max(2, Math.floor((maxAgl - minAgl) / 1000))) * 1000;
  const altitude = Math.min(perf.serviceCeilingFt, baseThousands + rawAgl);

  const targetOffsetAgl =
    aircraftSpec.aircraftClass === 'LIGHT_GA'
      ? options.isEmergency
        ? 1500
        : 2000 + Math.floor(Math.random() * 2) * 500
      : options.isEmergency
      ? 3000
      : 4000 + Math.floor(Math.random() * 3) * 1000;
  const targetAltitude = Math.min(
    perf.serviceCeilingFt,
    altitude,
    baseThousands + targetOffsetAgl
  );

  const minSpd = perf.initialSpawnSpeedMinIAS;
  const maxSpd = perf.initialSpawnSpeedMaxIAS;
  const indicatedAirspeed = options.isEmergency
    ? Math.max(perf.minAirspeedIAS + 10, Math.round(minSpd))
    : Math.round(minSpd + Math.random() * (maxSpd - minSpd));

  const targetAirspeed = Math.max(
    perf.minAirspeedIAS,
    Math.min(
      perf.maxAirspeedIAS,
      options.isEmergency
        ? Math.round(perf.typicalApproachSpeedIAS + 18)
        : Math.round(minSpd + (maxSpd - minSpd) * 0.45)
    )
  );

  const id = `ac_${Date.now()}_${idSuffix || Math.floor(Math.random() * 10000)}_${Math.floor(Math.random() * 999)}`;

  return {
    id,
    callsign,
    airline: operator.airline,
    telephony: operator.telephony || callsign,
    aircraftType: aircraftSpec.model,
    category: aircraftSpec.category,
    aircraftClass: aircraftSpec.aircraftClass,
    origin,
    destination: airport.icao,
    x,
    y,
    altitude,
    targetAltitude,
    indicatedAirspeed,
    targetAirspeed,
    groundSpeed: indicatedAirspeed,
    heading,
    targetHeading: heading,
    maxBankAngle: perf.maxBankAngleDeg,
    verticalSpeed: -perf.normalDescentRateFpm,
    expediteAltitude: Boolean(options.isEmergency),
    turnRate: 0,
    status: 'Inbound',
    flightPhase: assignedWaypoint ? 'STAR_ENROUTE' : 'ARRIVAL',
    assignedRunway: arrivalRwy.id,
    transponder: options.isEmergency ? '7700' : getNextSquawk(),
    isEmergency: Boolean(options.isEmergency),
    emergencyType: options.isEmergency ? options.emergencyType || 'ENGINE_FAILURE' : null,
    assignedWaypoint,
    routeQueue,
    autoInterceptILS: Boolean(assignedWaypoint && routeQueue.length > 0),
    assignedStarId: starAssignment.assignedStarId,
    assignedStarName: starAssignment.assignedStarName,
    assignedIafWaypoint: starAssignment.assignedIafWaypoint,
    arrivalFafWaypoint: starAssignment.arrivalFafWaypoint,
    arrivalRouteWaypoints: starAssignment.arrivalRouteWaypoints,
    landingCleared: false,
    landingClearanceRequested: false,
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
    history: buildOrganicEntryHistory(
      x,
      y,
      heading,
      altitude,
      indicatedAirspeed,
      perf.normalDescentRateFpm,
      perf.serviceCeilingFt
    ),
  };
}

export interface ArrivalProcedureAssignment {
  assignedStarId: string;
  assignedStarName: string;
  assignedIafWaypoint: string;
  arrivalFafWaypoint: string;
  arrivalRouteWaypoints: string[];
}

/**
 * Resolves a matching published STAR corridor, Initial Approach Fix (IAF), and Final Approach Fix (FAF)
 * for an arriving aircraft based on its entry sector and assigned landing runway.
 */
export function resolveArrivalProcedureAssignment(
  airport: Airport,
  arrivalRunway: Runway,
  spawnX: number = 0,
  spawnY: number = 0
): ArrivalProcedureAssignment {
  const stars = airport.approachRoutes || [];
  const matchingRwyStars = stars.filter(
    s => s.runwayIds.includes(arrivalRunway.id) && s.waypointNames.length > 0
  );
  const starPool =
    matchingRwyStars.length > 0
      ? matchingRwyStars
      : stars.filter(s => s.waypointNames.length > 0);

  if (starPool.length > 0) {
    // Score candidate STARs by proximity of entry fix to aircraft's entry coordinates
    let bestStar = starPool[0];
    let bestScore = Infinity;
    for (const candidate of starPool) {
      const entryFixName = candidate.waypointNames[0];
      const entryWp = airport.waypoints.find(w => w.name === entryFixName);
      if (entryWp) {
        const dist = Math.hypot(entryWp.position.x - spawnX, entryWp.position.y - spawnY);
        if (dist < bestScore) {
          bestScore = dist;
          bestStar = candidate;
        }
      }
    }

    const routeWps = bestStar.waypointNames.filter(name =>
      airport.waypoints.some(w => w.name === name)
    );
    const iafWp =
      routeWps.find(name => airport.waypoints.find(w => w.name === name)?.isInitialApproachFix) ||
      routeWps[Math.max(0, routeWps.length - 2)] ||
      routeWps[0] ||
      '';
    const fafWp =
      routeWps.find(name => airport.waypoints.find(w => w.name === name)?.isFinalApproachFix) ||
      routeWps[routeWps.length - 1] ||
      iafWp;

    return {
      assignedStarId: bestStar.id,
      assignedStarName: bestStar.name,
      assignedIafWaypoint: iafWp,
      arrivalFafWaypoint: fafWp,
      arrivalRouteWaypoints: routeWps,
    };
  }

  // Fallback for airfields without explicit STAR definitions
  const iafCandidates = airport.waypoints.filter(
    w => w.isInitialApproachFix || w.role === 'IAF' || w.isHoldingFix
  );
  const fafCandidates = airport.waypoints.filter(
    w => w.isFinalApproachFix || w.role === 'FAF'
  );
  const chosenIaf =
    iafCandidates[0] || airport.waypoints[0];
  const chosenFaf =
    fafCandidates[0] || chosenIaf;
  const routeWps = Array.from(
    new Set([chosenIaf?.name, chosenFaf?.name].filter(Boolean) as string[])
  );

  return {
    assignedStarId: `${airport.icao}_STAR_${arrivalRunway.id}`,
    assignedStarName: `${chosenIaf?.name || 'ARR'}1A`,
    assignedIafWaypoint: chosenIaf?.name || '',
    arrivalFafWaypoint: chosenFaf?.name || chosenIaf?.name || '',
    arrivalRouteWaypoints: routeWps,
  };
}

export interface DepartureExitAssignment {
  assignedSidId: string;
  assignedSidName: string;
  assignedExitWaypoint: string;
  departureRouteWaypoints: string[];
  exitClimbMinAltitudeFt: number;
  exitClimbMinSpeedKt: number;
}

/**
 * Resolves a mandatory departure SID/Exit route matching the departure runway and airport
 * waypoint catalog so every generated departure has a filed radar exit destination.
 */
export function resolveDepartureExitAssignment(
  airport: Airport,
  departureRwy: Runway,
  aircraftType: string
): DepartureExitAssignment {
  const perf = getAircraftPerformance(aircraftType);
  const sids = airport.departureRoutes || [];
  const matchingRwySids = sids.filter(
    s => s.runwayIds.includes(departureRwy.id) && s.waypointNames.length > 0
  );
  const sidPool = matchingRwySids.length > 0 ? matchingRwySids : sids.filter(s => s.waypointNames.length > 0);

  const minClimbAglFt = perf.aircraftClass === 'LIGHT_GA' ? 1000 : 1500;
  const exitClimbMinAltitudeFt = Math.min(
    perf.serviceCeilingFt,
    Math.ceil(airport.elevationFeet / 500) * 500 + minClimbAglFt
  );
  const exitClimbMinSpeedKt =
    perf.aircraftClass === 'LIGHT_GA'
      ? Math.min(90, perf.cruiseAirspeedIAS)
      : perf.aircraftClass === 'REGIONAL_TURBOPROP'
      ? Math.min(150, perf.cruiseAirspeedIAS)
      : Math.min(185, perf.cruiseAirspeedIAS);

  if (sidPool.length > 0) {
    const selectedSid = sidPool[Math.floor(Math.random() * sidPool.length)];
    const routeWps = [...selectedSid.waypointNames];
    const exitFix = routeWps[routeWps.length - 1];
    return {
      assignedSidId: selectedSid.id,
      assignedSidName: selectedSid.name,
      assignedExitWaypoint: exitFix,
      departureRouteWaypoints: routeWps,
      exitClimbMinAltitudeFt,
      exitClimbMinSpeedKt,
    };
  }

  // Fallback to published EXIT waypoints or outward radial fixes
  const exitWaypoints = airport.waypoints.filter(
    w => w.role === 'EXIT' || w.isDepartureExit
  );
  const outerFixes =
    exitWaypoints.length > 0
      ? exitWaypoints
      : airport.waypoints.filter(w => Math.hypot(w.position.x, w.position.y) >= 8);
  const pool = outerFixes.length > 0 ? outerFixes : airport.waypoints;
  const chosenExit = pool[Math.floor(Math.random() * pool.length)];
  const exitName = chosenExit?.name || 'EXIT';

  return {
    assignedSidId: `${airport.icao}_RADAR_${exitName}`,
    assignedSidName: `${exitName}1D`,
    assignedExitWaypoint: exitName,
    departureRouteWaypoints: chosenExit ? [chosenExit.name] : [],
    exitClimbMinAltitudeFt,
    exitClimbMinSpeedKt,
  };
}

/**
 * Spawns a departure aircraft holding short on the configured departure runway
 * with a mandatory filed SID/Exit route and model-matched climb parameters.
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
  const { operator, aircraftSpec } = pickOperatorAndType(
    options.heavyRatio,
    departureRwy?.lengthFeet
  );
  const perf = getAircraftPerformance(aircraftSpec.model);
  const callsign = generateUniqueCallsign(operator, existingAircraft, 201);
  const validDests = operator.origins.filter(o => o !== airport.icao);
  const destination =
    validDests[Math.floor(Math.random() * validDests.length)] || 'LFPG';

  const exitPlan = resolveDepartureExitAssignment(airport, departureRwy, aircraftSpec.model);

  const id = `ac_dep_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const startX = departureRwy.threshold.x;
  const startY = departureRwy.threshold.y;
  const climbTarget = Math.min(
    perf.serviceCeilingFt,
    Math.ceil(airport.elevationFeet / 1000) * 1000 + perf.initialDepartureClearanceAglFt
  );

  return {
    id,
    callsign,
    airline: operator.airline,
    telephony: operator.telephony || callsign,
    aircraftType: aircraftSpec.model,
    category: aircraftSpec.category,
    aircraftClass: aircraftSpec.aircraftClass,
    origin: airport.icao,
    destination,
    x: startX,
    y: startY,
    altitude: airport.elevationFeet,
    targetAltitude: climbTarget,
    indicatedAirspeed: 0,
    targetAirspeed: Math.min(210, perf.cruiseAirspeedIAS),
    groundSpeed: 0,
    heading: departureRwy.heading,
    targetHeading: departureRwy.heading,
    maxBankAngle: perf.maxBankAngleDeg,
    verticalSpeed: 0,
    expediteAltitude: false,
    turnRate: 0,
    status: 'Departing',
    flightPhase: 'HOLD_SHORT',
    assignedRunway: departureRwy.id,
    transponder: getNextSquawk(),
    assignedWaypoint: null,
    routeQueue: [],
    assignedSidId: exitPlan.assignedSidId,
    assignedSidName: exitPlan.assignedSidName,
    assignedExitWaypoint: exitPlan.assignedExitWaypoint,
    departureRouteWaypoints: exitPlan.departureRouteWaypoints,
    exitClimbMinAltitudeFt: exitPlan.exitClimbMinAltitudeFt,
    exitClimbMinSpeedKt: exitPlan.exitClimbMinSpeedKt,
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
