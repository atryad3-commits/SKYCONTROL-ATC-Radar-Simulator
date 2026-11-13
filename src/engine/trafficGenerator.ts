/**
 * SKYCONTROL - Realistic Airport-Agnostic Traffic Generator
 * Spawns authentic airline arrivals and departures for any configured Airport,
 * respecting active runways, field elevation, heavy/light traffic ratio, and emergencies.
 */

import { Aircraft, AircraftCategory, Airport, Runway } from '../types';
import { calculateBearing } from './physics';
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
    origins: ['LFPG', 'EGLL'],
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

function findNearestWaypoint(x: number, y: number, airport: Airport): string | null {
  const holdingFixes = airport.waypoints.filter(w => w.isHoldingFix);
  const candidates = holdingFixes.length > 0 ? holdingFixes : airport.waypoints;
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestDist = Infinity;
  for (const wp of candidates) {
    const d = Math.hypot(wp.position.x - x, wp.position.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = wp;
    }
  }
  return best.name;
}

/**
 * Spawns a realistic inbound flight from any 360-degree radar perimeter position
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

  const { airline, aircraftSpec } = pickAirlineAndType(options.heavyRatio);
  const flightNumber = Math.floor(100 + Math.random() * 899);
  const callsign = `${airline.prefix}${flightNumber}`;
  const validOrigins = airline.origins.filter(o => o !== airport.icao);
  const origin =
    validOrigins[Math.floor(Math.random() * validOrigins.length)] || 'EDDF';

  // Random 360-degree perimeter spawn
  const spawnBearing = Math.random() * 360;
  const spawnDist = options.isEmergency ? 24 + Math.random() * 6 : 34 + Math.random() * 11;
  const spawnAngleRad = (spawnBearing * Math.PI) / 180;

  const x = spawnDist * Math.sin(spawnAngleRad);
  const y = spawnDist * Math.cos(spawnAngleRad);

  const bearingToCenter = calculateBearing(x, y, 0, 0);
  const heading = Math.round((bearingToCenter + (Math.random() * 20 - 10) + 360) % 360);

  const targetFix = findNearestWaypoint(x, y, airport);

  // Entry altitude scaled cleanly above airport field elevation (always rounds cleanly to 1,000 ft)
  const baseThousands = Math.ceil(airport.elevationFeet / 1000) * 1000;
  const altitudeOffsets = options.isEmergency ? [5000, 6000] : [8000, 9000, 10000, 11000, 12000];
  const altitude =
    baseThousands +
    altitudeOffsets[Math.floor(Math.random() * altitudeOffsets.length)];
  const targetAltitude = baseThousands + (options.isEmergency ? 3000 : 5000);
  const indicatedAirspeed = 235 + Math.floor(Math.random() * 20);

  const id = `ac_${Date.now()}_${idSuffix || Math.floor(Math.random() * 10000)}`;

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
    targetAirspeed: options.isEmergency ? 190 : 220,
    groundSpeed: indicatedAirspeed,
    heading,
    targetHeading: heading,
    verticalSpeed: -1500,
    expediteAltitude: Boolean(options.isEmergency),
    turnRate: 0,
    status: 'Inbound',
    assignedRunway: arrivalRwy.id,
    transponder: options.isEmergency ? '7700' : getNextSquawk(),
    isEmergency: Boolean(options.isEmergency),
    emergencyType: options.isEmergency ? options.emergencyType || 'ENGINE_FAILURE' : null,
    assignedWaypoint: targetFix,
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
    tagOffset: { x: 30, y: -25 },
    history: (() => {
      const headingRad = (heading * Math.PI) / 180;
      const pts = [];
      for (let s = 6; s >= 1; s--) {
        const d = s * 2.2;
        pts.push({
          x: x - d * Math.sin(headingRad),
          y: y - d * Math.cos(headingRad),
          altitude: Math.min(20000, altitude + s * 450),
          timestamp: 0 - s * 15,
        });
      }
      pts.push({ x, y, altitude, timestamp: 0 });
      return pts;
    })(),
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

  const { airline, aircraftSpec } = pickAirlineAndType(options.heavyRatio);
  const flightNumber = Math.floor(200 + Math.random() * 799);
  const callsign = `${airline.prefix}${flightNumber}`;
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
