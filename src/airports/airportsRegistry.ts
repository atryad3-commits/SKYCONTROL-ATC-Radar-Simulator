/**
 * SKYCONTROL - Multi-Airport & Runway Registry
 * Provides international airports (EGLL, OIII, KJFK) and specialized
 * crosswind / converging training airfields (TRN1, TRN2) with exact runway geometry.
 */

import { Airport, AirportProfile, Runway, Waypoint } from '../types';
import { RunwayGeometry } from '../engine/runwayGeometry';
import { HEATHROW_AIRPORT, HEATHROW_RUNWAY_GEOMETRIES } from './heathrow';

const FEET_PER_NM = 6076.12;

interface RunwayPairSpec {
  primaryId: string;
  reciprocalId: string;
  primaryHeading: number;
  centerOffset: { x: number; y: number };
  lengthFeet: number;
  widthFeet: number;
  elevationFeet: number;
  ilsFrequencyPrimary: string;
  ilsFrequencyReciprocal: string;
  activeLandingPrimary?: boolean;
  activeDeparturePrimary?: boolean;
}

function buildRunwayPair(
  airportId: string,
  spec: RunwayPairSpec
): { runways: Runway[]; geometries: RunwayGeometry[]; reciprocal: [string, string] } {
  const halfLenNM = spec.lengthFeet / FEET_PER_NM / 2;
  const hdg1 = spec.primaryHeading;
  const hdg2 = (hdg1 + 180) % 360 || 360;
  const rad1 = (hdg1 * Math.PI) / 180;

  // Threshold of primary runway sits behind center relative to landing direction
  const th1 = {
    x: Math.round((spec.centerOffset.x - halfLenNM * Math.sin(rad1)) * 1000) / 1000,
    y: Math.round((spec.centerOffset.y - halfLenNM * Math.cos(rad1)) * 1000) / 1000,
  };
  const end1 = {
    x: Math.round((spec.centerOffset.x + halfLenNM * Math.sin(rad1)) * 1000) / 1000,
    y: Math.round((spec.centerOffset.y + halfLenNM * Math.cos(rad1)) * 1000) / 1000,
  };

  const r1: Runway = {
    id: spec.primaryId,
    heading: hdg1,
    lengthFeet: spec.lengthFeet,
    threshold: th1,
    endPosition: end1,
    ilsFrequency: spec.ilsFrequencyPrimary,
    glideslopeAngle: 3.0,
    activeLanding: Boolean(spec.activeLandingPrimary),
    activeDeparture: Boolean(spec.activeDeparturePrimary),
    occupied: false,
  };

  const r2: Runway = {
    id: spec.reciprocalId,
    heading: hdg2,
    lengthFeet: spec.lengthFeet,
    threshold: end1,
    endPosition: th1,
    ilsFrequency: spec.ilsFrequencyReciprocal,
    glideslopeAngle: 3.0,
    activeLanding: false,
    activeDeparture: false,
    occupied: false,
  };

  const g1: RunwayGeometry = {
    id: spec.primaryId,
    airportId,
    designator: spec.primaryId,
    threshold: th1,
    oppositeThreshold: end1,
    trueHeading: hdg1,
    magneticHeading: hdg1,
    lengthFeet: spec.lengthFeet,
    widthFeet: spec.widthFeet,
    elevationFeet: spec.elevationFeet,
    activeLanding: Boolean(spec.activeLandingPrimary),
    activeDeparture: Boolean(spec.activeDeparturePrimary),
    occupancyState: 'Available',
    ils: {
      frequency: spec.ilsFrequencyPrimary,
      glideslopeAngleDeg: 3.0,
      localizerCourseDeg: hdg1,
      usableRangeNM: 18.0,
      catCategory: 'CAT_III',
    },
  };

  const g2: RunwayGeometry = {
    id: spec.reciprocalId,
    airportId,
    designator: spec.reciprocalId,
    threshold: end1,
    oppositeThreshold: th1,
    trueHeading: hdg2,
    magneticHeading: hdg2,
    lengthFeet: spec.lengthFeet,
    widthFeet: spec.widthFeet,
    elevationFeet: spec.elevationFeet,
    activeLanding: false,
    activeDeparture: false,
    occupancyState: 'Available',
    ils: {
      frequency: spec.ilsFrequencyReciprocal,
      glideslopeAngleDeg: 3.0,
      localizerCourseDeg: hdg2,
      usableRangeNM: 18.0,
      catCategory: 'CAT_I',
    },
  };

  return {
    runways: [r1, r2],
    geometries: [g1, g2],
    reciprocal: [spec.primaryId, spec.reciprocalId],
  };
}

// ---------------------------------------------------------------------------
// 1. EGLL – London Heathrow Airport (International · Parallel 27R/27L & 09L/09R)
// ---------------------------------------------------------------------------
const EGLL_PROFILE: AirportProfile = {
  airport: HEATHROW_AIRPORT,
  runwayGeometries: HEATHROW_RUNWAY_GEOMETRIES,
  reciprocalPairs: [
    ['27R', '09L'],
    ['27L', '09R'],
  ],
  category: 'International',
  runwayLayoutLabel: 'Parallel E/W (27R/27L · 09L/09R)',
  difficultyLabel: 'Standard',
  summaryFa: 'فرودگاه بین‌المللی هیترو لندن با دو باند موازی شرق به غرب، ترافیک تجاری متنوع و الگوهای هولدینگ استاندارد.',
  defaultWeather: {
    windDirection: 260,
    windSpeed: 12,
    gusts: 18,
    qnh: 1013,
    visibilityNM: 10,
    ceilingFeet: 5000,
    precipitation: 'None',
  },
  directorCallsign: 'EGLL_DIR',
  vhfFrequency: '119.725 MHz',
};

// ---------------------------------------------------------------------------
// 2. OIII – Tehran Mehrabad International (International · Parallel 29L/29R & 11L/11R)
// ---------------------------------------------------------------------------
const oiiiNorth = buildRunwayPair('OIII', {
  primaryId: '29R',
  reciprocalId: '11L',
  primaryHeading: 290,
  centerOffset: { x: -0.1, y: 0.25 },
  lengthFeet: 13097,
  widthFeet: 148,
  elevationFeet: 3962,
  ilsFrequencyPrimary: '109.9 MHz',
  ilsFrequencyReciprocal: '110.5 MHz',
  activeLandingPrimary: true,
});

const oiiiSouth = buildRunwayPair('OIII', {
  primaryId: '29L',
  reciprocalId: '11R',
  primaryHeading: 290,
  centerOffset: { x: 0.0, y: -0.25 },
  lengthFeet: 13248,
  widthFeet: 197,
  elevationFeet: 3962,
  ilsFrequencyPrimary: '111.3 MHz',
  ilsFrequencyReciprocal: '108.9 MHz',
  activeDeparturePrimary: true,
});

const OIII_WAYPOINTS: Waypoint[] = [
  { name: 'DMV', description: 'Damavand NE Holding Stack', position: { x: 18, y: 14 }, isHoldingFix: true, defaultHoldingHeading: 225, holdingTurnDirection: 'Right' },
  { name: 'VAR', description: 'Varamin SE Holding Stack', position: { x: 20, y: -12 }, isHoldingFix: true, defaultHoldingHeading: 300, holdingTurnDirection: 'Right' },
  { name: 'SAV', description: 'Saveh SW Holding Stack', position: { x: -16, y: -15 }, isHoldingFix: true, defaultHoldingHeading: 40, holdingTurnDirection: 'Left' },
  { name: 'KRD', description: 'Karaj NW Holding Stack', position: { x: -18, y: 12 }, isHoldingFix: true, defaultHoldingHeading: 120, holdingTurnDirection: 'Right' },
  { name: 'TRN', description: 'Tehran VOR', position: { x: 1.5, y: -0.5 } },
  { name: 'RAD', description: 'Radan 14 NM Approach 29R', position: { x: 14.0, y: -4.8 }, isInitialApproachFix: true },
  { name: 'RUS', description: 'Rustam 8 NM Final 29R', position: { x: 8.5, y: -2.8 } },
];

const OIII_AIRPORT: Airport = {
  icao: 'OIII',
  iata: 'THR',
  name: 'Tehran Mehrabad',
  country: 'Iran',
  centerCoordinates: { lat: 35.6892, lon: 51.3134 },
  elevationFeet: 3962,
  magneticVariation: 4.5,
  defaultArrivalRunway: '29R',
  defaultDepartureRunway: '29L',
  sector: {
    id: 'OIII_TMA',
    name: 'Tehran Terminal Control Area',
    radiusNM: 45,
    floorAltitude: 3962,
    ceilingAltitude: 20000,
    transitionAltitude: 11000,
  },
  runways: [...oiiiNorth.runways, ...oiiiSouth.runways],
  waypoints: OIII_WAYPOINTS,
};

const OIII_PROFILE: AirportProfile = {
  airport: OIII_AIRPORT,
  runwayGeometries: [...oiiiNorth.geometries, ...oiiiSouth.geometries],
  reciprocalPairs: [oiiiNorth.reciprocal, oiiiSouth.reciprocal],
  category: 'International',
  runwayLayoutLabel: 'Parallel 290°/110° (29R/29L · 11L/11R)',
  difficultyLabel: 'Moderate',
  summaryFa: 'فرودگاه بین‌المللی مهرآباد تهران با ارتفاع ۳۹۶۲ پا، باندهای موازی ۲۹ و ۱۱ و تقرب زاویه‌دار ۲۹۰ درجه.',
  defaultWeather: {
    windDirection: 285,
    windSpeed: 14,
    gusts: 21,
    qnh: 1016,
    visibilityNM: 9,
    ceilingFeet: 6500,
    precipitation: 'None',
  },
  directorCallsign: 'OIII_APP',
  vhfFrequency: '125.100 MHz',
};

// ---------------------------------------------------------------------------
// 3. KJFK – New York JFK (International · Crossing 31L/13R & 04L/22R)
// ---------------------------------------------------------------------------
const jfk31 = buildRunwayPair('KJFK', {
  primaryId: '31L',
  reciprocalId: '13R',
  primaryHeading: 310,
  centerOffset: { x: -0.3, y: -0.2 },
  lengthFeet: 14511,
  widthFeet: 200,
  elevationFeet: 13,
  ilsFrequencyPrimary: '111.35 MHz',
  ilsFrequencyReciprocal: '109.5 MHz',
  activeLandingPrimary: true,
});

const jfk04 = buildRunwayPair('KJFK', {
  primaryId: '04L',
  reciprocalId: '22R',
  primaryHeading: 40,
  centerOffset: { x: 0.35, y: 0.15 },
  lengthFeet: 12079,
  widthFeet: 200,
  elevationFeet: 13,
  ilsFrequencyPrimary: '110.9 MHz',
  ilsFrequencyReciprocal: '109.1 MHz',
  activeDeparturePrimary: true,
});

const KJFK_WAYPOINTS: Waypoint[] = [
  { name: 'DEER', description: 'Deer Park NE Holding Fix', position: { x: 18, y: 15 }, isHoldingFix: true, defaultHoldingHeading: 220, holdingTurnDirection: 'Right' },
  { name: 'ROBER', description: 'Roberts SE Holding Fix', position: { x: 16, y: -15 }, isHoldingFix: true, defaultHoldingHeading: 310, holdingTurnDirection: 'Right' },
  { name: 'CAMRN', description: 'Camrn SW Holding Fix', position: { x: -16, y: -14 }, isHoldingFix: true, defaultHoldingHeading: 40, holdingTurnDirection: 'Left' },
  { name: 'LENDY', description: 'Lendy NW Holding Fix', position: { x: -17, y: 16 }, isHoldingFix: true, defaultHoldingHeading: 130, holdingTurnDirection: 'Right' },
  { name: 'KENDA', description: '31L Initial Fix 12 NM', position: { x: 10.0, y: -8.5 }, isInitialApproachFix: true },
  { name: 'ZIGGY', description: '04L Initial Fix 10 NM', position: { x: -6.5, y: -7.8 }, isInitialApproachFix: true },
];

const KJFK_AIRPORT: Airport = {
  icao: 'KJFK',
  iata: 'JFK',
  name: 'New York Kennedy',
  country: 'United States',
  centerCoordinates: { lat: 40.6413, lon: -73.7781 },
  elevationFeet: 13,
  magneticVariation: -13.0,
  defaultArrivalRunway: '31L',
  defaultDepartureRunway: '04L',
  sector: {
    id: 'KJFK_N90',
    name: 'New York TRACON (N90)',
    radiusNM: 45,
    floorAltitude: 0,
    ceilingAltitude: 18000,
    transitionAltitude: 18000,
  },
  runways: [...jfk31.runways, ...jfk04.runways],
  waypoints: KJFK_WAYPOINTS,
};

const KJFK_PROFILE: AirportProfile = {
  airport: KJFK_AIRPORT,
  runwayGeometries: [...jfk31.geometries, ...jfk04.geometries],
  reciprocalPairs: [jfk31.reciprocal, jfk04.reciprocal],
  category: 'International',
  runwayLayoutLabel: 'Intersecting 310° & 040° (31L/04L)',
  difficultyLabel: 'Challenging',
  summaryFa: 'فرودگاه جان اف کندی نیویورک با باندهای متقاطع ۳۱ چپ و ۰۴ چپ؛ نیازمند زمان‌بندی دقیق تلاقی پروازها.',
  defaultWeather: {
    windDirection: 330,
    windSpeed: 16,
    gusts: 23,
    qnh: 1011,
    visibilityNM: 8,
    ceilingFeet: 4000,
    precipitation: 'None',
  },
  directorCallsign: 'NY_APP',
  vhfFrequency: '127.400 MHz',
};

// ---------------------------------------------------------------------------
// 4. TRN1 – Crosswind Ridge Academy (Training · X-Intersecting 36/18 & 24/06 + Strong Crosswind)
// ---------------------------------------------------------------------------
const trn1NS = buildRunwayPair('TRN1', {
  primaryId: '36',
  reciprocalId: '18',
  primaryHeading: 360,
  centerOffset: { x: 0, y: 0 },
  lengthFeet: 10500,
  widthFeet: 164,
  elevationFeet: 450,
  ilsFrequencyPrimary: '110.1 MHz',
  ilsFrequencyReciprocal: '109.3 MHz',
  activeLandingPrimary: true,
});

const trn1SW = buildRunwayPair('TRN1', {
  primaryId: '24',
  reciprocalId: '06',
  primaryHeading: 240,
  centerOffset: { x: 0, y: 0 },
  lengthFeet: 9800,
  widthFeet: 164,
  elevationFeet: 450,
  ilsFrequencyPrimary: '111.5 MHz',
  ilsFrequencyReciprocal: '108.7 MHz',
  activeDeparturePrimary: true,
});

const TRN1_WAYPOINTS: Waypoint[] = [
  { name: 'RIDGE', description: 'North Crosswind Hold', position: { x: 4, y: 18 }, isHoldingFix: true, defaultHoldingHeading: 180, holdingTurnDirection: 'Right' },
  { name: 'BRAVO', description: 'East Corridor Hold', position: { x: 18, y: 5 }, isHoldingFix: true, defaultHoldingHeading: 240, holdingTurnDirection: 'Right' },
  { name: 'VALEY', description: 'South Approach Hold', position: { x: -2, y: -17 }, isHoldingFix: true, defaultHoldingHeading: 360, holdingTurnDirection: 'Left' },
  { name: 'CREST', description: 'West Departure Fix', position: { x: -18, y: -6 }, isHoldingFix: true, defaultHoldingHeading: 60, holdingTurnDirection: 'Right' },
  { name: 'APX36', description: '10 NM South Final 36', position: { x: 0, y: -10.9 }, isInitialApproachFix: true },
  { name: 'APX24', description: '10 NM NE Final 24', position: { x: 9.4, y: 5.4 }, isInitialApproachFix: true },
];

const TRN1_AIRPORT: Airport = {
  icao: 'TRN1',
  iata: 'XWA',
  name: 'Crosswind Ridge Academy',
  country: 'ATC Training Sector',
  centerCoordinates: { lat: 47.25, lon: 11.35 },
  elevationFeet: 450,
  magneticVariation: 2.0,
  defaultArrivalRunway: '36',
  defaultDepartureRunway: '24',
  sector: {
    id: 'TRN1_CTR',
    name: 'Crosswind Ridge Training Sector',
    radiusNM: 45,
    floorAltitude: 450,
    ceilingAltitude: 18000,
    transitionAltitude: 6000,
  },
  runways: [...trn1NS.runways, ...trn1SW.runways],
  waypoints: TRN1_WAYPOINTS,
};

const TRN1_PROFILE: AirportProfile = {
  airport: TRN1_AIRPORT,
  runwayGeometries: [...trn1NS.geometries, ...trn1SW.geometries],
  reciprocalPairs: [trn1NS.reciprocal, trn1SW.reciprocal],
  category: 'Training',
  runwayLayoutLabel: 'X-Crossing 360° & 240° (36/24)',
  difficultyLabel: 'High Crosswind',
  summaryFa: 'پایگاه تمرینی تخصصی با باندهای متقاطع X و باد جانبی شدید ۲۵ تا ۳۶ نات برای مهارت زاویه خرچنگی و انتخاب باند.',
  defaultWeather: {
    windDirection: 275,
    windSpeed: 26,
    gusts: 34,
    qnh: 996,
    visibilityNM: 7,
    ceilingFeet: 3200,
    precipitation: 'Light Rain',
  },
  directorCallsign: 'XWIND_TWR',
  vhfFrequency: '122.850 MHz',
};

// ---------------------------------------------------------------------------
// 5. TRN2 – Converging Delta Base (Training · Converging V-Runways 15/33 & 20/02)
// ---------------------------------------------------------------------------
const trn2A = buildRunwayPair('TRN2', {
  primaryId: '15',
  reciprocalId: '33',
  primaryHeading: 150,
  centerOffset: { x: -0.75, y: 0.45 },
  lengthFeet: 11000,
  widthFeet: 164,
  elevationFeet: 120,
  ilsFrequencyPrimary: '110.7 MHz',
  ilsFrequencyReciprocal: '109.7 MHz',
  activeLandingPrimary: true,
});

const trn2B = buildRunwayPair('TRN2', {
  primaryId: '20',
  reciprocalId: '02',
  primaryHeading: 200,
  centerOffset: { x: 0.75, y: 0.45 },
  lengthFeet: 10800,
  widthFeet: 164,
  elevationFeet: 120,
  ilsFrequencyPrimary: '111.1 MHz',
  ilsFrequencyReciprocal: '108.5 MHz',
  activeDeparturePrimary: true,
});

const TRN2_WAYPOINTS: Waypoint[] = [
  { name: 'DELTA', description: 'North Converging Stack', position: { x: -5, y: 17 }, isHoldingFix: true, defaultHoldingHeading: 150, holdingTurnDirection: 'Right' },
  { name: 'ECHO', description: 'East Base Hold', position: { x: 16, y: 12 }, isHoldingFix: true, defaultHoldingHeading: 200, holdingTurnDirection: 'Right' },
  { name: 'FOXT', description: 'South Missed Approach Fix', position: { x: 2, y: -16 }, isHoldingFix: true, defaultHoldingHeading: 330, holdingTurnDirection: 'Left' },
  { name: 'GOLF', description: 'West Vectoring Fix', position: { x: -16, y: -4 }, isHoldingFix: true, defaultHoldingHeading: 20, holdingTurnDirection: 'Right' },
  { name: 'ILS15', description: '10 NM Final 15', position: { x: -6.2, y: 9.8 }, isInitialApproachFix: true },
  { name: 'ILS20', description: '10 NM Final 20', position: { x: 4.5, y: 10.6 }, isInitialApproachFix: true },
];

const TRN2_AIRPORT: Airport = {
  icao: 'TRN2',
  iata: 'DLT',
  name: 'Converging Delta Base',
  country: 'ATC Training Sector',
  centerCoordinates: { lat: 39.10, lon: -84.66 },
  elevationFeet: 120,
  magneticVariation: -4.0,
  defaultArrivalRunway: '15',
  defaultDepartureRunway: '20',
  sector: {
    id: 'TRN2_CTR',
    name: 'Delta Converging Approach',
    radiusNM: 45,
    floorAltitude: 120,
    ceilingAltitude: 18000,
    transitionAltitude: 8000,
  },
  runways: [...trn2A.runways, ...trn2B.runways],
  waypoints: TRN2_WAYPOINTS,
};

const TRN2_PROFILE: AirportProfile = {
  airport: TRN2_AIRPORT,
  runwayGeometries: [...trn2A.geometries, ...trn2B.geometries],
  reciprocalPairs: [trn2A.reciprocal, trn2B.reciprocal],
  category: 'Training',
  runwayLayoutLabel: 'Converging V (15/33 · 20/02)',
  difficultyLabel: 'Challenging',
  summaryFa: 'پایگاه تمرینی دلتا با باندهای همگرا (۱۵ و ۲۰ درجه) برای تمرین ترافیک فشرده و جلوگیری از تداخل Go-Around.',
  defaultWeather: {
    windDirection: 175,
    windSpeed: 16,
    gusts: 24,
    qnh: 1009,
    visibilityNM: 9,
    ceilingFeet: 4500,
    precipitation: 'None',
  },
  directorCallsign: 'DELTA_APP',
  vhfFrequency: '124.300 MHz',
};

export const AIRPORTS_REGISTRY: Record<string, AirportProfile> = {
  EGLL: EGLL_PROFILE,
  OIII: OIII_PROFILE,
  KJFK: KJFK_PROFILE,
  TRN1: TRN1_PROFILE,
  TRN2: TRN2_PROFILE,
};

export const ALL_AIRPORT_PROFILES: AirportProfile[] = [
  EGLL_PROFILE,
  OIII_PROFILE,
  KJFK_PROFILE,
  TRN1_PROFILE,
  TRN2_PROFILE,
];

export function getAirportProfile(icao: string): AirportProfile {
  return AIRPORTS_REGISTRY[icao] || EGLL_PROFILE;
}

/**
 * Returns a fresh cloned Airport and RunwayGeometry[] configured with specified active landing/departure runways
 */
export function resolveConfiguredAirport(
  icao: string,
  landingRunwayId?: string,
  departureRunwayId?: string
): {
  profile: AirportProfile;
  airport: Airport;
  runwayGeometries: RunwayGeometry[];
  landingRunwayId: string;
  departureRunwayId: string;
} {
  const profile = getAirportProfile(icao);
  const validLanding =
    landingRunwayId && profile.runwayGeometries.some(r => r.id === landingRunwayId)
      ? landingRunwayId
      : profile.airport.defaultArrivalRunway;
  const validDeparture =
    departureRunwayId && profile.runwayGeometries.some(r => r.id === departureRunwayId)
      ? departureRunwayId
      : profile.airport.defaultDepartureRunway;

  const runways = profile.airport.runways.map(r => ({
    ...r,
    activeLanding: r.id === validLanding,
    activeDeparture: r.id === validDeparture,
    occupied: false,
  }));

  const runwayGeometries = profile.runwayGeometries.map(g => ({
    ...g,
    activeLanding: g.id === validLanding,
    activeDeparture: g.id === validDeparture,
    occupancyState: 'Available' as const,
  }));

  const airport: Airport = {
    ...profile.airport,
    defaultArrivalRunway: validLanding,
    defaultDepartureRunway: validDeparture,
    runways,
  };

  return {
    profile,
    airport,
    runwayGeometries,
    landingRunwayId: validLanding,
    departureRunwayId: validDeparture,
  };
}
