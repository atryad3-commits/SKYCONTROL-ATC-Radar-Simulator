/**
 * SKYCONTROL - Realistic Traffic Generator
 * Spawns authentic airline arrivals and departures around London Heathrow
 */

import { Aircraft, AircraftCategory } from '../types';
import { calculateBearing } from './physics';

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
    prefix: 'VIR',
    airline: 'Virgin Atlantic',
    telephony: 'Virgin',
    types: [
      { model: 'A350', category: 'Heavy' },
      { model: 'B789', category: 'Heavy' },
      { model: 'A339', category: 'Heavy' },
    ],
    origins: ['KJFK', 'KBOS', 'KMIA', 'VHHH'],
  },
  {
    prefix: 'DLH',
    airline: 'Lufthansa',
    telephony: 'Lufthansa',
    types: [
      { model: 'A320', category: 'Large' },
      { model: 'A321', category: 'Large' },
    ],
    origins: ['EDDF', 'EDDM'],
  },
  {
    prefix: 'AFR',
    airline: 'Air France',
    telephony: 'Air France',
    types: [
      { model: 'A320', category: 'Large' },
      { model: 'A220', category: 'Large' },
    ],
    origins: ['LFPG'],
  },
  {
    prefix: 'UAE',
    airline: 'Emirates',
    telephony: 'Emirates',
    types: [
      { model: 'A380', category: 'Heavy' },
      { model: 'B77W', category: 'Heavy' },
    ],
    origins: ['OMDB'],
  },
  {
    prefix: 'AAL',
    airline: 'American',
    telephony: 'American',
    types: [
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

/**
 * Spawns a realistic inbound flight into the London TMA
 */
export function generateInboundFlight(idSuffix?: number): Aircraft {
  const airline = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
  const aircraftSpec = airline.types[Math.floor(Math.random() * airline.types.length)];
  const flightNumber = Math.floor(100 + Math.random() * 899);
  const callsign = `${airline.prefix}${flightNumber}`;
  const origin = airline.origins[Math.floor(Math.random() * airline.origins.length)];

  // Spawn randomly from anywhere along the 360-degree perimeter of the radar scope
  const spawnBearing = Math.random() * 360;
  const spawnDist = 34 + Math.random() * 11; // 34 to 45 NM perimeter
  const spawnAngleRad = (spawnBearing * Math.PI) / 180;

  const x = spawnDist * Math.sin(spawnAngleRad);
  const y = spawnDist * Math.cos(spawnAngleRad);

  // Initial heading points inward towards Heathrow center with realistic dispersion
  const bearingToCenter = calculateBearing(x, y, 0, 0);
  const heading = Math.round((bearingToCenter + (Math.random() * 24 - 12) + 360) % 360);

  // Assign nearest published TMA entry fix based on quadrant
  let targetFix = 'LAM';
  if (spawnBearing >= 270 && spawnBearing < 360) {
    targetFix = 'BNN';
  } else if (spawnBearing >= 180 && spawnBearing < 270) {
    targetFix = 'OCK';
  } else if (spawnBearing >= 90 && spawnBearing < 180) {
    targetFix = 'BIG';
  }

  // Realistic entry altitudes: FL080 - FL130
  const possibleAltitudes = [8000, 9000, 10000, 11000, 12000, 13000];
  const altitude = possibleAltitudes[Math.floor(Math.random() * possibleAltitudes.length)];
  const targetAltitude = altitude <= 9000 ? 5000 : 7000;
  const indicatedAirspeed = 240 + Math.floor(Math.random() * 20);

  const id = `ac_${Date.now()}_${idSuffix || Math.floor(Math.random() * 1000)}`;

  return {
    id,
    callsign,
    airline: airline.airline,
    telephony: airline.telephony,
    aircraftType: aircraftSpec.model,
    category: aircraftSpec.category,
    origin,
    destination: 'EGLL',
    x,
    y,
    altitude,
    targetAltitude,
    indicatedAirspeed,
    targetAirspeed: 220,
    groundSpeed: indicatedAirspeed,
    heading,
    targetHeading: heading,
    verticalSpeed: -1500,
    expediteAltitude: false,
    turnRate: 0,
    status: 'Inbound',
    assignedRunway: '27R',
    transponder: getNextSquawk(),
    assignedWaypoint: targetFix,
    holdingWaypoint: null,
    holdingInboundHeading: 270,
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
          altitude: Math.min(18000, altitude + s * 450),
          timestamp: 0 - s * 15,
        });
      }
      pts.push({ x, y, altitude, timestamp: 0 });
      return pts;
    })(),
  };
}

/**
 * Spawns a departure aircraft lined up or taking off on runway 27L
 */
export function generateDepartureFlight(): Aircraft {
  const airline = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
  const aircraftSpec = airline.types[Math.floor(Math.random() * airline.types.length)];
  const flightNumber = Math.floor(200 + Math.random() * 799);
  const callsign = `${airline.prefix}${flightNumber}`;
  const destination = airline.origins[Math.floor(Math.random() * airline.origins.length)];

  // 27L departure roll
  const id = `ac_dep_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  return {
    id,
    callsign,
    airline: airline.airline,
    telephony: airline.telephony,
    aircraftType: aircraftSpec.model,
    category: aircraftSpec.category,
    origin: 'EGLL',
    destination,
    x: 0.95,
    y: -0.38,
    altitude: 83,
    targetAltitude: 6000,
    indicatedAirspeed: 0,
    targetAirspeed: 210,
    groundSpeed: 0,
    heading: 270,
    targetHeading: 270,
    verticalSpeed: 0,
    expediteAltitude: false,
    turnRate: 0,
    status: 'Departing',
    assignedRunway: '27L',
    transponder: getNextSquawk(),
    assignedWaypoint: 'CHT',
    holdingWaypoint: null,
    holdingInboundHeading: 270,
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
    history: [{ x: 0.95, y: -0.38, altitude: 83, timestamp: Date.now() }],
  };
}
