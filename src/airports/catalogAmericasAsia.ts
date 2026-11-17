/**
 * SKYCONTROL - Americas & Asia-Pacific Airport Profiles
 * Includes KORD (Dual E/W + Diagonal), KSFO (Close Bay X-Pairs), and RJTT (Tokyo Bay Quad Cross).
 */

import { Airport, AirportProfile, Waypoint } from '../types';
import { buildRunwayPair } from './airportBuilder';
import { attachProceduresToAirport } from './procedures';
import { attachTerrainToAirport } from './terrain';

// ---------------------------------------------------------------------------
// KORD – Chicago O'Hare Intl (USA · Dual E/W Parallels + Diagonal 22R/04L)
// ---------------------------------------------------------------------------
const kord27 = buildRunwayPair('KORD', {
  primaryId: '27R',
  reciprocalId: '09L',
  primaryHeading: 270,
  centerOffset: { x: 0.0, y: 0.6 },
  lengthFeet: 11260,
  widthFeet: 150,
  elevationFeet: 680,
  ilsFrequencyPrimary: '111.75 MHz',
  ilsFrequencyReciprocal: '110.5 MHz',
  activeLandingPrimary: true,
});

const kord28 = buildRunwayPair('KORD', {
  primaryId: '28C',
  reciprocalId: '10C',
  primaryHeading: 270,
  centerOffset: { x: -0.2, y: -0.4 },
  lengthFeet: 10801,
  widthFeet: 200,
  elevationFeet: 680,
  ilsFrequencyPrimary: '108.95 MHz',
  ilsFrequencyReciprocal: '111.3 MHz',
  activeDeparturePrimary: true,
});

const kord22 = buildRunwayPair('KORD', {
  primaryId: '22R',
  reciprocalId: '04L',
  primaryHeading: 223,
  centerOffset: { x: 0.5, y: 0.1 },
  lengthFeet: 8075,
  widthFeet: 150,
  elevationFeet: 680,
  ilsFrequencyPrimary: '110.1 MHz',
  ilsFrequencyReciprocal: '109.75 MHz',
});

const KORD_WAYPOINTS: Waypoint[] = [
  { name: 'WATSN', description: 'Lake Michigan NE Hold', position: { x: 16, y: 15 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 250, holdingTurnDirection: 'Right' },
  { name: 'FYTTE', description: 'South-East Lake Shore Hold', position: { x: 18, y: -13 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 280, holdingTurnDirection: 'Right' },
  { name: 'ROYKO', description: 'South-West Joliet Hold', position: { x: -16, y: -12 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 60, holdingTurnDirection: 'Left' },
  { name: 'BENKY', description: 'North-West Fox Valley Hold', position: { x: -16, y: 14 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 120, holdingTurnDirection: 'Right' },
  { name: 'ORD', description: 'Chicago O’Hare VOR', position: { x: 0.0, y: 0.0 }, role: 'VOR' },
];

const KORD_AIRPORT: Airport = attachTerrainToAirport(
  attachProceduresToAirport({
    icao: 'KORD',
    iata: 'ORD',
    name: 'Chicago O’Hare',
    country: 'United States',
    centerCoordinates: { lat: 41.9742, lon: -87.9073 },
    elevationFeet: 680,
    magneticVariation: -4.2,
    defaultArrivalRunway: '27R',
    defaultDepartureRunway: '28C',
    sector: {
      id: 'KORD_C90',
      name: 'Chicago TRACON (C90)',
      radiusNM: 48,
      floorAltitude: 680,
      ceilingAltitude: 18000,
      transitionAltitude: 18000,
    },
    runways: [...kord27.runways, ...kord28.runways, ...kord22.runways],
    waypoints: KORD_WAYPOINTS,
  })
);

export const KORD_PROFILE: AirportProfile = {
  airport: KORD_AIRPORT,
  runwayGeometries: [...kord27.geometries, ...kord28.geometries, ...kord22.geometries],
  reciprocalPairs: [kord27.reciprocal, kord28.reciprocal, kord22.reciprocal],
  category: 'International',
  runwayLayoutLabel: 'Dual E/W Parallels + Diagonal 22R/04L',
  difficultyLabel: 'Moderate',
  summary: 'Chicago O’Hare high-capacity Great Lakes hub along Lake Michigan with staggered E/W parallel arrivals and crossing diagonal 22R/04L.',
  defaultWeather: {
    windDirection: 275,
    windSpeed: 18,
    gusts: 26,
    qnh: 1009,
    visibilityNM: 9,
    ceilingFeet: 4000,
    precipitation: 'None',
  },
  directorCallsign: 'CHICAGO_APP',
  vhfFrequency: '124.350 MHz',
};

// ---------------------------------------------------------------------------
// KSFO – San Francisco Intl (USA · Close Bay X-Pairs: 28L/28R × 01L/01R)
// ---------------------------------------------------------------------------
const ksfo28R = buildRunwayPair('KSFO', {
  primaryId: '28R',
  reciprocalId: '10L',
  primaryHeading: 284,
  centerOffset: { x: 0.0, y: 0.14 },
  lengthFeet: 11870,
  widthFeet: 200,
  elevationFeet: 13,
  ilsFrequencyPrimary: '111.7 MHz',
  ilsFrequencyReciprocal: '109.5 MHz',
  activeLandingPrimary: true,
});

const ksfo28L = buildRunwayPair('KSFO', {
  primaryId: '28L',
  reciprocalId: '10R',
  primaryHeading: 284,
  centerOffset: { x: -0.05, y: -0.14 },
  lengthFeet: 11381,
  widthFeet: 200,
  elevationFeet: 13,
  ilsFrequencyPrimary: '109.55 MHz',
  ilsFrequencyReciprocal: '110.7 MHz',
});

const ksfo01R = buildRunwayPair('KSFO', {
  primaryId: '01R',
  reciprocalId: '19L',
  primaryHeading: 14,
  centerOffset: { x: 0.35, y: 0.0 },
  lengthFeet: 8650,
  widthFeet: 200,
  elevationFeet: 13,
  ilsFrequencyPrimary: '110.3 MHz',
  ilsFrequencyReciprocal: '108.9 MHz',
  activeDeparturePrimary: true,
});

const ksfo01L = buildRunwayPair('KSFO', {
  primaryId: '01L',
  reciprocalId: '19R',
  primaryHeading: 14,
  centerOffset: { x: 0.15, y: 0.0 },
  lengthFeet: 7650,
  widthFeet: 200,
  elevationFeet: 13,
  ilsFrequencyPrimary: '110.9 MHz',
  ilsFrequencyReciprocal: '108.5 MHz',
});

const KSFO_WAYPOINTS: Waypoint[] = [
  { name: 'PNTRE', description: 'North Point Reyes Bay Hold', position: { x: -13, y: 18 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 155, holdingTurnDirection: 'Right' },
  { name: 'MODES', description: 'East Bay Modesto Hold', position: { x: 19, y: 10 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 260, holdingTurnDirection: 'Right' },
  { name: 'BGSUR', description: 'South Big Sur Hold', position: { x: 16, y: -15 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 300, holdingTurnDirection: 'Right' },
  { name: 'CEDES', description: 'Pacific Coastal West Hold', position: { x: -15, y: -11 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 45, holdingTurnDirection: 'Left' },
  { name: 'SFO', description: 'San Francisco VOR', position: { x: 0.0, y: 0.0 }, role: 'VOR' },
];

const KSFO_AIRPORT: Airport = attachTerrainToAirport(
  attachProceduresToAirport({
    icao: 'KSFO',
    iata: 'SFO',
    name: 'San Francisco Intl',
    country: 'United States',
    centerCoordinates: { lat: 37.6213, lon: -122.379 },
    elevationFeet: 13,
    magneticVariation: 13.4,
    defaultArrivalRunway: '28R',
    defaultDepartureRunway: '01R',
    sector: {
      id: 'KSFO_NCT',
      name: 'NorCal Bay TRACON',
      radiusNM: 45,
      floorAltitude: 0,
      ceilingAltitude: 18000,
      transitionAltitude: 18000,
    },
    runways: [...ksfo28R.runways, ...ksfo28L.runways, ...ksfo01R.runways, ...ksfo01L.runways],
    waypoints: KSFO_WAYPOINTS,
  })
);

export const KSFO_PROFILE: AirportProfile = {
  airport: KSFO_AIRPORT,
  runwayGeometries: [
    ...ksfo28R.geometries,
    ...ksfo28L.geometries,
    ...ksfo01R.geometries,
    ...ksfo01L.geometries,
  ],
  reciprocalPairs: [
    ksfo28R.reciprocal,
    ksfo28L.reciprocal,
    ksfo01R.reciprocal,
    ksfo01L.reciprocal,
  ],
  category: 'International',
  runwayLayoutLabel: 'Close Bay X-Pairs (28L/28R × 01L/01R)',
  difficultyLabel: 'Challenging',
  summary: 'Classic close-parallel Bay Area X-configuration requiring tightly coordinated 28L/28R visual/ILS approaches intersecting 01L/01R departures.',
  defaultWeather: {
    windDirection: 290,
    windSpeed: 17,
    gusts: 25,
    qnh: 1015,
    visibilityNM: 7,
    ceilingFeet: 2200,
    precipitation: 'None',
  },
  directorCallsign: 'NORCAL_APP',
  vhfFrequency: '135.100 MHz',
};

// ---------------------------------------------------------------------------
// RJTT – Tokyo Haneda (Japan · Reclaimed Tokyo Bay Quad Cross 34L/34R × 22/23)
// ---------------------------------------------------------------------------
const rjtt34L = buildRunwayPair('RJTT', {
  primaryId: '34L',
  reciprocalId: '16R',
  primaryHeading: 337,
  centerOffset: { x: -0.45, y: 0.0 },
  lengthFeet: 9843,
  widthFeet: 197,
  elevationFeet: 21,
  ilsFrequencyPrimary: '111.7 MHz',
  ilsFrequencyReciprocal: '108.9 MHz',
  activeLandingPrimary: true,
});

const rjtt34R = buildRunwayPair('RJTT', {
  primaryId: '34R',
  reciprocalId: '16L',
  primaryHeading: 337,
  centerOffset: { x: 0.45, y: 0.25 },
  lengthFeet: 11024,
  widthFeet: 197,
  elevationFeet: 21,
  ilsFrequencyPrimary: '108.5 MHz',
  ilsFrequencyReciprocal: '110.1 MHz',
});

const rjtt22 = buildRunwayPair('RJTT', {
  primaryId: '22',
  reciprocalId: '04',
  primaryHeading: 221,
  centerOffset: { x: 0.55, y: -0.45 },
  lengthFeet: 8202,
  widthFeet: 197,
  elevationFeet: 21,
  ilsFrequencyPrimary: '109.7 MHz',
  ilsFrequencyReciprocal: '109.3 MHz',
  activeDeparturePrimary: true,
});

const rjtt23 = buildRunwayPair('RJTT', {
  primaryId: '23',
  reciprocalId: '05',
  primaryHeading: 230,
  centerOffset: { x: 1.05, y: -0.65 },
  lengthFeet: 8202,
  widthFeet: 197,
  elevationFeet: 21,
  ilsFrequencyPrimary: '110.9 MHz',
  ilsFrequencyReciprocal: '111.3 MHz',
});

const RJTT_WAYPOINTS: Waypoint[] = [
  { name: 'ADDUM', description: 'North-East Tokyo Bay Hold', position: { x: 16, y: 15 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 221, holdingTurnDirection: 'Right' },
  { name: 'CREAM', description: 'Chiba South-East Hold', position: { x: 18, y: -12 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 337, holdingTurnDirection: 'Right' },
  { name: 'ARLON', description: 'Sagami Bay South-West Hold', position: { x: -12, y: -18 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 337, holdingTurnDirection: 'Left' },
  { name: 'SPENS', description: 'Yokohama West Hold', position: { x: -18, y: 6 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 140, holdingTurnDirection: 'Right' },
  { name: 'HND', description: 'Haneda VOR', position: { x: 0.0, y: 0.0 }, role: 'VOR' },
];

const RJTT_AIRPORT: Airport = attachTerrainToAirport(
  attachProceduresToAirport({
    icao: 'RJTT',
    iata: 'HND',
    name: 'Tokyo Haneda',
    country: 'Japan',
    centerCoordinates: { lat: 35.5494, lon: 139.7798 },
    elevationFeet: 21,
    magneticVariation: -7.5,
    defaultArrivalRunway: '34L',
    defaultDepartureRunway: '22',
    sector: {
      id: 'RJTT_TMA',
      name: 'Tokyo Terminal Radar',
      radiusNM: 48,
      floorAltitude: 0,
      ceilingAltitude: 20000,
      transitionAltitude: 14000,
    },
    runways: [...rjtt34L.runways, ...rjtt34R.runways, ...rjtt22.runways, ...rjtt23.runways],
    waypoints: RJTT_WAYPOINTS,
  })
);

export const RJTT_PROFILE: AirportProfile = {
  airport: RJTT_AIRPORT,
  runwayGeometries: [
    ...rjtt34L.geometries,
    ...rjtt34R.geometries,
    ...rjtt22.geometries,
    ...rjtt23.geometries,
  ],
  reciprocalPairs: [
    rjtt34L.reciprocal,
    rjtt34R.reciprocal,
    rjtt22.reciprocal,
    rjtt23.reciprocal,
  ],
  category: 'International',
  runwayLayoutLabel: 'Tokyo Bay Quad Cross (34L/34R × 22/23)',
  difficultyLabel: 'Challenging',
  summary: 'Reclaimed Tokyo Bay mega-hub with parallel 337° maritime runways and crossing 221°/230° bay runways beneath Mt. Fuji’s western horizon.',
  defaultWeather: {
    windDirection: 340,
    windSpeed: 15,
    gusts: 22,
    qnh: 1012,
    visibilityNM: 9,
    ceilingFeet: 4800,
    precipitation: 'None',
  },
  directorCallsign: 'TOKYO_APP',
  vhfFrequency: '119.100 MHz',
};

export const AMERICAS_ASIA_PROFILES: AirportProfile[] = [
  KORD_PROFILE,
  KSFO_PROFILE,
  RJTT_PROFILE,
];
