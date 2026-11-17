/**
 * SKYCONTROL - Middle East, Iran & European Airport Profiles
 * Includes OIIE, OISS, OMDB, LFPG, EHAM, EDDF, LSZH, and EGJJ with
 * varied parallel, quad-pod, tri-angle, crossing, and short regional runways.
 */

import { Airport, AirportProfile, Waypoint } from '../types';
import { buildRunwayPair } from './airportBuilder';
import { attachProceduresToAirport } from './procedures';
import { attachTerrainToAirport } from './terrain';

// ---------------------------------------------------------------------------
// OIIE – Tehran Imam Khomeini International (Iran · Wide Parallel 29R/29L)
// ---------------------------------------------------------------------------
const oiieNorth = buildRunwayPair('OIIE', {
  primaryId: '29R',
  reciprocalId: '11L',
  primaryHeading: 290,
  centerOffset: { x: 0, y: 0.55 },
  lengthFeet: 13940,
  widthFeet: 197,
  elevationFeet: 3305,
  ilsFrequencyPrimary: '109.7 MHz',
  ilsFrequencyReciprocal: '110.3 MHz',
  activeLandingPrimary: true,
});

const oiieSouth = buildRunwayPair('OIIE', {
  primaryId: '29L',
  reciprocalId: '11R',
  primaryHeading: 290,
  centerOffset: { x: 0, y: -0.55 },
  lengthFeet: 13776,
  widthFeet: 148,
  elevationFeet: 3305,
  ilsFrequencyPrimary: '111.5 MHz',
  ilsFrequencyReciprocal: '108.7 MHz',
  activeDeparturePrimary: true,
});

const OIIE_WAYPOINTS: Waypoint[] = [
  { name: 'VARAM', description: 'Varamin East Holding Fix', position: { x: 20, y: 6 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 260, holdingTurnDirection: 'Right' },
  { name: 'KHMIR', description: 'Kavir South-East Hold', position: { x: 18, y: -14 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 300, holdingTurnDirection: 'Right' },
  { name: 'SAVEH', description: 'Saveh South-West Hold', position: { x: -17, y: -15 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 70, holdingTurnDirection: 'Left' },
  { name: 'RUDEN', description: 'Rudeshur West Hold', position: { x: -19, y: 11 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 110, holdingTurnDirection: 'Right' },
  { name: 'IKA', description: 'Imam Khomeini VOR', position: { x: 0.4, y: 0.0 }, role: 'VOR' },
];

const OIIE_AIRPORT: Airport = attachTerrainToAirport(
  attachProceduresToAirport({
    icao: 'OIIE',
    iata: 'IKA',
    name: 'Tehran Imam Khomeini',
    country: 'Iran',
    centerCoordinates: { lat: 35.4161, lon: 51.1522 },
    elevationFeet: 3305,
    magneticVariation: 4.6,
    defaultArrivalRunway: '29R',
    defaultDepartureRunway: '29L',
    sector: {
      id: 'OIIE_TMA',
      name: 'Imam Khomeini Approach Control',
      radiusNM: 48,
      floorAltitude: 3305,
      ceilingAltitude: 22000,
      transitionAltitude: 11000,
    },
    runways: [...oiieNorth.runways, ...oiieSouth.runways],
    waypoints: OIIE_WAYPOINTS,
  })
);

export const OIIE_PROFILE: AirportProfile = {
  airport: OIIE_AIRPORT,
  runwayGeometries: [...oiieNorth.geometries, ...oiieSouth.geometries],
  reciprocalPairs: [oiieNorth.reciprocal, oiieSouth.reciprocal],
  category: 'International',
  runwayLayoutLabel: 'Wide Parallel 290°/110° (29R/29L · 1.1 NM sep)',
  difficultyLabel: 'Standard',
  summary: 'Tehran Imam Khomeini International featuring wide-spaced 13,900 ft heavy runways at 3,305 ft elevation over southern salt plains.',
  defaultWeather: {
    windDirection: 280,
    windSpeed: 12,
    gusts: 17,
    qnh: 1015,
    visibilityNM: 10,
    ceilingFeet: 7500,
    precipitation: 'None',
  },
  directorCallsign: 'OIIE_APP',
  vhfFrequency: '121.850 MHz',
};

// ---------------------------------------------------------------------------
// OISS – Shiraz Shahid Dastghaib International (Iran · High Mountain Valley)
// ---------------------------------------------------------------------------
const oissNorth = buildRunwayPair('OISS', {
  primaryId: '29R',
  reciprocalId: '11L',
  primaryHeading: 292,
  centerOffset: { x: 0.2, y: 0.2 },
  lengthFeet: 14220,
  widthFeet: 148,
  elevationFeet: 4921,
  ilsFrequencyPrimary: '109.9 MHz',
  ilsFrequencyReciprocal: '110.7 MHz',
  activeLandingPrimary: true,
});

const oissSouth = buildRunwayPair('OISS', {
  primaryId: '29L',
  reciprocalId: '11R',
  primaryHeading: 292,
  centerOffset: { x: -0.2, y: -0.22 },
  lengthFeet: 14016,
  widthFeet: 148,
  elevationFeet: 4921,
  ilsFrequencyPrimary: '111.1 MHz',
  ilsFrequencyReciprocal: '108.9 MHz',
  activeDeparturePrimary: true,
});

const OISS_WAYPOINTS: Waypoint[] = [
  { name: 'DARAB', description: 'Darab SE Valley Hold', position: { x: 20, y: -11 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 292, holdingTurnDirection: 'Right' },
  { name: 'MARVD', description: 'Marvdasht NE Ridge Hold', position: { x: 16, y: 14 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 230, holdingTurnDirection: 'Right' },
  { name: 'FIROZ', description: 'Firuzabad South Hold', position: { x: -10, y: -17 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 20, holdingTurnDirection: 'Left' },
  { name: 'KAZRN', description: 'Kazerun West Pass Hold', position: { x: -19, y: 6 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 112, holdingTurnDirection: 'Right' },
  { name: 'SYZ', description: 'Shiraz VOR', position: { x: 0.0, y: 0.0 }, role: 'VOR' },
];

const OISS_AIRPORT: Airport = attachTerrainToAirport(
  attachProceduresToAirport({
    icao: 'OISS',
    iata: 'SYZ',
    name: 'Shiraz Shahid Dastghaib',
    country: 'Iran',
    centerCoordinates: { lat: 29.5392, lon: 52.5898 },
    elevationFeet: 4921,
    magneticVariation: 3.4,
    defaultArrivalRunway: '29R',
    defaultDepartureRunway: '29L',
    sector: {
      id: 'OISS_TMA',
      name: 'Shiraz Zagros Approach',
      radiusNM: 45,
      floorAltitude: 4921,
      ceilingAltitude: 22000,
      transitionAltitude: 12000,
    },
    runways: [...oissNorth.runways, ...oissSouth.runways],
    waypoints: OISS_WAYPOINTS,
  })
);

export const OISS_PROFILE: AirportProfile = {
  airport: OISS_AIRPORT,
  runwayGeometries: [...oissNorth.geometries, ...oissSouth.geometries],
  reciprocalPairs: [oissNorth.reciprocal, oissSouth.reciprocal],
  category: 'International',
  runwayLayoutLabel: 'Zagros Valley Parallel (29R/29L · 11L/11R)',
  difficultyLabel: 'Challenging',
  summary: 'High-altitude 4,921 ft AMSL mountain-valley hub flanked by 9,000+ ft Zagros ridges and Lake Maharlu, requiring disciplined energy management.',
  defaultWeather: {
    windDirection: 295,
    windSpeed: 15,
    gusts: 23,
    qnh: 1017,
    visibilityNM: 9,
    ceilingFeet: 8500,
    precipitation: 'None',
  },
  directorCallsign: 'OISS_APP',
  vhfFrequency: '124.200 MHz',
};

// ---------------------------------------------------------------------------
// OMDB – Dubai International (UAE · Super-Heavy Gulf Coastal Parallel 30L/30R)
// ---------------------------------------------------------------------------
const omdbSouth = buildRunwayPair('OMDB', {
  primaryId: '30L',
  reciprocalId: '12R',
  primaryHeading: 300,
  centerOffset: { x: -0.1, y: -0.2 },
  lengthFeet: 14600,
  widthFeet: 197,
  elevationFeet: 62,
  ilsFrequencyPrimary: '110.9 MHz',
  ilsFrequencyReciprocal: '109.5 MHz',
  activeLandingPrimary: true,
});

const omdbNorth = buildRunwayPair('OMDB', {
  primaryId: '30R',
  reciprocalId: '12L',
  primaryHeading: 300,
  centerOffset: { x: 0.1, y: 0.25 },
  lengthFeet: 13123,
  widthFeet: 197,
  elevationFeet: 62,
  ilsFrequencyPrimary: '111.3 MHz',
  ilsFrequencyReciprocal: '110.1 MHz',
  activeDeparturePrimary: true,
});

const OMDB_WAYPOINTS: Waypoint[] = [
  { name: 'DESDI', description: 'Arabian Gulf NW Hold', position: { x: -16, y: 17 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 120, holdingTurnDirection: 'Right' },
  { name: 'BUBIN', description: 'North-East Hajar Hold', position: { x: 18, y: 12 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 240, holdingTurnDirection: 'Right' },
  { name: 'VUTEB', description: 'South-East Desert Hold', position: { x: 19, y: -12 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 300, holdingTurnDirection: 'Right' },
  { name: 'LOVEM', description: 'West Coastal Hold', position: { x: -18, y: -8 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 60, holdingTurnDirection: 'Left' },
  { name: 'DXB', description: 'Dubai VOR', position: { x: 0.2, y: 0.0 }, role: 'VOR' },
];

const OMDB_AIRPORT: Airport = attachTerrainToAirport(
  attachProceduresToAirport({
    icao: 'OMDB',
    iata: 'DXB',
    name: 'Dubai International',
    country: 'United Arab Emirates',
    centerCoordinates: { lat: 25.2532, lon: 55.3657 },
    elevationFeet: 62,
    magneticVariation: 2.1,
    defaultArrivalRunway: '30L',
    defaultDepartureRunway: '30R',
    sector: {
      id: 'OMDB_TMA',
      name: 'Emirates Radar Approach',
      radiusNM: 48,
      floorAltitude: 0,
      ceilingAltitude: 20000,
      transitionAltitude: 13000,
    },
    runways: [...omdbSouth.runways, ...omdbNorth.runways],
    waypoints: OMDB_WAYPOINTS,
  })
);

export const OMDB_PROFILE: AirportProfile = {
  airport: OMDB_AIRPORT,
  runwayGeometries: [...omdbSouth.geometries, ...omdbNorth.geometries],
  reciprocalPairs: [omdbSouth.reciprocal, omdbNorth.reciprocal],
  category: 'International',
  runwayLayoutLabel: 'Super-Heavy Parallel (30L/30R · 12R/12L)',
  difficultyLabel: 'Standard',
  summary: 'Dubai International widebody super-hub along the Arabian Gulf shore with 14,600 ft runways, high heavy-wake ratio, and Burj Khalifa obstacle clearance.',
  defaultWeather: {
    windDirection: 305,
    windSpeed: 13,
    gusts: 19,
    qnh: 1010,
    visibilityNM: 8,
    ceilingFeet: 10000,
    precipitation: 'None',
  },
  directorCallsign: 'EMIRATES_APP',
  vhfFrequency: '124.900 MHz',
};

// ---------------------------------------------------------------------------
// LFPG – Paris Charles de Gaulle (France · Quad Staggered Parallel Pods)
// ---------------------------------------------------------------------------
const lfpgNorthOuter = buildRunwayPair('LFPG', {
  primaryId: '27R',
  reciprocalId: '09L',
  primaryHeading: 266,
  centerOffset: { x: -0.25, y: 0.65 },
  lengthFeet: 8858,
  widthFeet: 148,
  elevationFeet: 392,
  ilsFrequencyPrimary: '110.35 MHz',
  ilsFrequencyReciprocal: '109.1 MHz',
  activeLandingPrimary: true,
});

const lfpgNorthInner = buildRunwayPair('LFPG', {
  primaryId: '27L',
  reciprocalId: '09R',
  primaryHeading: 266,
  centerOffset: { x: -0.25, y: 0.42 },
  lengthFeet: 13829,
  widthFeet: 148,
  elevationFeet: 392,
  ilsFrequencyPrimary: '111.15 MHz',
  ilsFrequencyReciprocal: '108.35 MHz',
});

const lfpgSouthInner = buildRunwayPair('LFPG', {
  primaryId: '26R',
  reciprocalId: '08L',
  primaryHeading: 266,
  centerOffset: { x: 0.25, y: -0.42 },
  lengthFeet: 13780,
  widthFeet: 148,
  elevationFeet: 392,
  ilsFrequencyPrimary: '109.75 MHz',
  ilsFrequencyReciprocal: '110.55 MHz',
  activeDeparturePrimary: true,
});

const lfpgSouthOuter = buildRunwayPair('LFPG', {
  primaryId: '26L',
  reciprocalId: '08R',
  primaryHeading: 266,
  centerOffset: { x: 0.25, y: -0.65 },
  lengthFeet: 8858,
  widthFeet: 148,
  elevationFeet: 392,
  ilsFrequencyPrimary: '108.95 MHz',
  ilsFrequencyReciprocal: '111.75 MHz',
});

const LFPG_WAYPOINTS: Waypoint[] = [
  { name: 'MOPAR', description: 'North-East Ardennes Hold', position: { x: 18, y: 15 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 230, holdingTurnDirection: 'Right' },
  { name: 'LORNI', description: 'South-East Marne Hold', position: { x: 19, y: -13 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 290, holdingTurnDirection: 'Right' },
  { name: 'BANOX', description: 'South Orly Border Hold', position: { x: -9, y: -17 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 30, holdingTurnDirection: 'Left' },
  { name: 'OKIPA', description: 'West Beauvais Hold', position: { x: -18, y: 12 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 100, holdingTurnDirection: 'Right' },
  { name: 'CGN', description: 'Charles de Gaulle VOR', position: { x: 0.0, y: 0.0 }, role: 'VOR' },
];

const LFPG_AIRPORT: Airport = attachTerrainToAirport(
  attachProceduresToAirport({
    icao: 'LFPG',
    iata: 'CDG',
    name: 'Paris Charles de Gaulle',
    country: 'France',
    centerCoordinates: { lat: 49.0097, lon: 2.5479 },
    elevationFeet: 392,
    magneticVariation: 1.5,
    defaultArrivalRunway: '27R',
    defaultDepartureRunway: '26R',
    sector: {
      id: 'LFPG_TMA',
      name: 'Paris Nord De Gaulle Approach',
      radiusNM: 45,
      floorAltitude: 392,
      ceilingAltitude: 19500,
      transitionAltitude: 5000,
    },
    runways: [
      ...lfpgNorthOuter.runways,
      ...lfpgNorthInner.runways,
      ...lfpgSouthInner.runways,
      ...lfpgSouthOuter.runways,
    ],
    waypoints: LFPG_WAYPOINTS,
  })
);

export const LFPG_PROFILE: AirportProfile = {
  airport: LFPG_AIRPORT,
  runwayGeometries: [
    ...lfpgNorthOuter.geometries,
    ...lfpgNorthInner.geometries,
    ...lfpgSouthInner.geometries,
    ...lfpgSouthOuter.geometries,
  ],
  reciprocalPairs: [
    lfpgNorthOuter.reciprocal,
    lfpgNorthInner.reciprocal,
    lfpgSouthInner.reciprocal,
    lfpgSouthOuter.reciprocal,
  ],
  category: 'International',
  runwayLayoutLabel: 'Quad Staggered Pods (27R/27L · 26R/26L)',
  difficultyLabel: 'Moderate',
  summary: 'Four staggered parallel runways split across North & South terminal pods (8 active runway ends) for simultaneous dual-pod arrival/departure flows.',
  defaultWeather: {
    windDirection: 265,
    windSpeed: 13,
    gusts: 19,
    qnh: 1013,
    visibilityNM: 9,
    ceilingFeet: 4500,
    precipitation: 'None',
  },
  directorCallsign: 'DE_GAULLE_APP',
  vhfFrequency: '118.150 MHz',
};

// ---------------------------------------------------------------------------
// EHAM – Amsterdam Schiphol (Netherlands · Tri-Angle Multi-Directional Hub, -11ft)
// ---------------------------------------------------------------------------
const ehamPolder = buildRunwayPair('EHAM', {
  primaryId: '18R',
  reciprocalId: '36L',
  primaryHeading: 183,
  centerOffset: { x: -1.65, y: 0.9 },
  lengthFeet: 12467,
  widthFeet: 197,
  elevationFeet: -11,
  ilsFrequencyPrimary: '110.1 MHz',
  ilsFrequencyReciprocal: '108.9 MHz',
  activeLandingPrimary: true,
});

const ehamZwanenburg = buildRunwayPair('EHAM', {
  primaryId: '18C',
  reciprocalId: '36C',
  primaryHeading: 183,
  centerOffset: { x: -0.35, y: 0.55 },
  lengthFeet: 10827,
  widthFeet: 148,
  elevationFeet: -11,
  ilsFrequencyPrimary: '109.5 MHz',
  ilsFrequencyReciprocal: '109.1 MHz',
});

const ehamKaag = buildRunwayPair('EHAM', {
  primaryId: '06',
  reciprocalId: '24',
  primaryHeading: 61,
  centerOffset: { x: 0.1, y: -0.7 },
  lengthFeet: 11483,
  widthFeet: 148,
  elevationFeet: -11,
  ilsFrequencyPrimary: '110.55 MHz',
  ilsFrequencyReciprocal: '111.55 MHz',
  activeDeparturePrimary: true,
});

const EHAM_WAYPOINTS: Waypoint[] = [
  { name: 'SUGOL', description: 'North Sea West Holding Stack', position: { x: -17, y: 15 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 140, holdingTurnDirection: 'Right' },
  { name: 'ARTIP', description: 'Markermeer NE Holding Stack', position: { x: 18, y: 14 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 240, holdingTurnDirection: 'Right' },
  { name: 'RIVER', description: 'Rotterdam SW Holding Stack', position: { x: -15, y: -16 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 61, holdingTurnDirection: 'Left' },
  { name: 'NARSO', description: 'South-East River Hold', position: { x: 16, y: -14 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 310, holdingTurnDirection: 'Right' },
  { name: 'SPL', description: 'Schiphol VOR', position: { x: 0.0, y: 0.0 }, role: 'VOR' },
];

const EHAM_AIRPORT: Airport = attachTerrainToAirport(
  attachProceduresToAirport({
    icao: 'EHAM',
    iata: 'AMS',
    name: 'Amsterdam Schiphol',
    country: 'Netherlands',
    centerCoordinates: { lat: 52.3105, lon: 4.7683 },
    elevationFeet: -11,
    magneticVariation: 1.9,
    defaultArrivalRunway: '18R',
    defaultDepartureRunway: '06',
    sector: {
      id: 'EHAM_TMA',
      name: 'Schiphol TMA',
      radiusNM: 44,
      floorAltitude: 0,
      ceilingAltitude: 19500,
      transitionAltitude: 3000,
    },
    runways: [...ehamPolder.runways, ...ehamZwanenburg.runways, ...ehamKaag.runways],
    waypoints: EHAM_WAYPOINTS,
  })
);

export const EHAM_PROFILE: AirportProfile = {
  airport: EHAM_AIRPORT,
  runwayGeometries: [...ehamPolder.geometries, ...ehamZwanenburg.geometries, ...ehamKaag.geometries],
  reciprocalPairs: [ehamPolder.reciprocal, ehamZwanenburg.reciprocal, ehamKaag.reciprocal],
  category: 'International',
  runwayLayoutLabel: 'Tri-Angle Multi-Directional (18R/18C · 06/24)',
  difficultyLabel: 'Moderate',
  summary: 'Below-sea-level (-11 ft) European hub featuring offset Polderbaan 18R, Zwanenburgbaan 18C, and diagonal Kaagbaan 06/24 by the North Sea.',
  defaultWeather: {
    windDirection: 195,
    windSpeed: 16,
    gusts: 24,
    qnh: 1008,
    visibilityNM: 8,
    ceilingFeet: 3500,
    precipitation: 'Light Rain',
  },
  directorCallsign: 'SCHIPHOL_APP',
  vhfFrequency: '121.200 MHz',
};

// ---------------------------------------------------------------------------
// EDDF – Frankfurt am Main (Germany · Dual 25C/25L + Crossing South 18/36)
// ---------------------------------------------------------------------------
const eddfCenter = buildRunwayPair('EDDF', {
  primaryId: '25C',
  reciprocalId: '07C',
  primaryHeading: 249,
  centerOffset: { x: 0.0, y: 0.12 },
  lengthFeet: 13123,
  widthFeet: 197,
  elevationFeet: 364,
  ilsFrequencyPrimary: '110.55 MHz',
  ilsFrequencyReciprocal: '110.95 MHz',
  activeLandingPrimary: true,
});

const eddfSouth = buildRunwayPair('EDDF', {
  primaryId: '25L',
  reciprocalId: '07R',
  primaryHeading: 249,
  centerOffset: { x: 0.0, y: -0.36 },
  lengthFeet: 13123,
  widthFeet: 148,
  elevationFeet: 364,
  ilsFrequencyPrimary: '111.15 MHz',
  ilsFrequencyReciprocal: '110.15 MHz',
});

const eddfWest18 = buildRunwayPair('EDDF', {
  primaryId: '18',
  reciprocalId: '36',
  primaryHeading: 180,
  centerOffset: { x: -0.95, y: -0.7 },
  lengthFeet: 13123,
  widthFeet: 148,
  elevationFeet: 364,
  ilsFrequencyPrimary: '108.75 MHz',
  ilsFrequencyReciprocal: '108.35 MHz',
  activeDeparturePrimary: true,
});

const EDDF_WAYPOINTS: Waypoint[] = [
  { name: 'GEDRN', description: 'Gedern NE Holding Stack', position: { x: 18, y: 15 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 225, holdingTurnDirection: 'Right' },
  { name: 'SPESA', description: 'Spessart SE Holding Stack', position: { x: 20, y: -11 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 255, holdingTurnDirection: 'Right' },
  { name: 'UNOKO', description: 'South Rhine Holding Fix', position: { x: -2, y: -16 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 360, holdingTurnDirection: 'Left' },
  { name: 'ROLIS', description: 'Taunus West Holding Fix', position: { x: -18, y: 11 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 90, holdingTurnDirection: 'Right' },
  { name: 'FFM', description: 'Frankfurt VOR', position: { x: 0.2, y: 0.0 }, role: 'VOR' },
];

const EDDF_AIRPORT: Airport = attachTerrainToAirport(
  attachProceduresToAirport({
    icao: 'EDDF',
    iata: 'FRA',
    name: 'Frankfurt am Main',
    country: 'Germany',
    centerCoordinates: { lat: 50.0379, lon: 8.5622 },
    elevationFeet: 364,
    magneticVariation: 3.1,
    defaultArrivalRunway: '25C',
    defaultDepartureRunway: '18',
    sector: {
      id: 'EDDF_TMA',
      name: 'Langen Frankfurt Radar',
      radiusNM: 45,
      floorAltitude: 364,
      ceilingAltitude: 20000,
      transitionAltitude: 5000,
    },
    runways: [...eddfCenter.runways, ...eddfSouth.runways, ...eddfWest18.runways],
    waypoints: EDDF_WAYPOINTS,
  })
);

export const EDDF_PROFILE: AirportProfile = {
  airport: EDDF_AIRPORT,
  runwayGeometries: [...eddfCenter.geometries, ...eddfSouth.geometries, ...eddfWest18.geometries],
  reciprocalPairs: [eddfCenter.reciprocal, eddfSouth.reciprocal, eddfWest18.reciprocal],
  category: 'International',
  runwayLayoutLabel: 'Parallel 25C/25L + South Startbahn 18',
  difficultyLabel: 'Moderate',
  summary: 'Frankfurt Main hub combining dual 249° parallel landing strips with iconic perpendicular Southbound departure runway 18 between the Main and Taunus hills.',
  defaultWeather: {
    windDirection: 245,
    windSpeed: 13,
    gusts: 19,
    qnh: 1014,
    visibilityNM: 9,
    ceilingFeet: 5000,
    precipitation: 'None',
  },
  directorCallsign: 'LANGEN_APP',
  vhfFrequency: '120.800 MHz',
};

// ---------------------------------------------------------------------------
// LSZH – Zurich Kloten (Switzerland · Converging Trio 14/32 · 16/34 · 10/28)
// ---------------------------------------------------------------------------
const lszh14 = buildRunwayPair('LSZH', {
  primaryId: '14',
  reciprocalId: '32',
  primaryHeading: 138,
  centerOffset: { x: -0.35, y: 0.45 },
  lengthFeet: 10827,
  widthFeet: 197,
  elevationFeet: 1416,
  ilsFrequencyPrimary: '108.3 MHz',
  ilsFrequencyReciprocal: '109.9 MHz',
  activeLandingPrimary: true,
});

const lszh16 = buildRunwayPair('LSZH', {
  primaryId: '16',
  reciprocalId: '34',
  primaryHeading: 155,
  centerOffset: { x: 0.05, y: 0.0 },
  lengthFeet: 12139,
  widthFeet: 197,
  elevationFeet: 1416,
  ilsFrequencyPrimary: '110.5 MHz',
  ilsFrequencyReciprocal: '110.75 MHz',
});

const lszh10 = buildRunwayPair('LSZH', {
  primaryId: '10',
  reciprocalId: '28',
  primaryHeading: 96,
  centerOffset: { x: 0.1, y: -0.25 },
  lengthFeet: 8202,
  widthFeet: 197,
  elevationFeet: 1416,
  ilsFrequencyPrimary: '109.1 MHz',
  ilsFrequencyReciprocal: '109.75 MHz',
  activeDeparturePrimary: false,
});
// Set RWY 28 as active departure by default
lszh10.runways[1].activeDeparture = true;
lszh10.geometries[1].activeDeparture = true;

const LSZH_WAYPOINTS: Waypoint[] = [
  { name: 'GIPOL', description: 'North-West Rhine Stack', position: { x: -16, y: 15 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 138, holdingTurnDirection: 'Right' },
  { name: 'EKRON', description: 'East Bodensee Stack', position: { x: 18, y: 8 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 276, holdingTurnDirection: 'Right' },
  { name: 'AMIKI', description: 'South Alpine Hold', position: { x: 10, y: -16 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 330, holdingTurnDirection: 'Left' },
  { name: 'RILAX', description: 'West Plateau Hold', position: { x: -17, y: -6 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 85, holdingTurnDirection: 'Right' },
  { name: 'KLO', description: 'Kloten VOR', position: { x: 0.0, y: 0.0 }, role: 'VOR' },
];

const LSZH_AIRPORT: Airport = attachTerrainToAirport(
  attachProceduresToAirport({
    icao: 'LSZH',
    iata: 'ZRH',
    name: 'Zurich Kloten',
    country: 'Switzerland',
    centerCoordinates: { lat: 47.4647, lon: 8.5492 },
    elevationFeet: 1416,
    magneticVariation: 2.8,
    defaultArrivalRunway: '14',
    defaultDepartureRunway: '28',
    sector: {
      id: 'LSZH_TMA',
      name: 'Zurich Alpine Terminal',
      radiusNM: 42,
      floorAltitude: 1416,
      ceilingAltitude: 19500,
      transitionAltitude: 7000,
    },
    runways: [...lszh14.runways, ...lszh16.runways, ...lszh10.runways],
    waypoints: LSZH_WAYPOINTS,
  })
);

export const LSZH_PROFILE: AirportProfile = {
  airport: LSZH_AIRPORT,
  runwayGeometries: [...lszh14.geometries, ...lszh16.geometries, ...lszh10.geometries],
  reciprocalPairs: [lszh14.reciprocal, lszh16.reciprocal, lszh10.reciprocal],
  category: 'International',
  runwayLayoutLabel: 'Converging Trio (14/32 · 16/34 · 10/28)',
  difficultyLabel: 'Challenging',
  summary: 'Zurich Alpine terminal featuring intersecting runways 14, 16, and 28 beside Lake Zurich with pre-Alpine missed-approach terrain constraints.',
  defaultWeather: {
    windDirection: 230,
    windSpeed: 14,
    gusts: 21,
    qnh: 1016,
    visibilityNM: 8,
    ceilingFeet: 4200,
    precipitation: 'None',
  },
  directorCallsign: 'ZURICH_APP',
  vhfFrequency: '120.750 MHz',
};

// ---------------------------------------------------------------------------
// EGJJ – Jersey Channel Islands Regional (Short Island Cross-Strips · GA/Turboprop)
// ---------------------------------------------------------------------------
const egjjMain = buildRunwayPair('EGJJ', {
  primaryId: '26',
  reciprocalId: '08',
  primaryHeading: 262,
  centerOffset: { x: 0.0, y: 0.0 },
  lengthFeet: 5597,
  widthFeet: 148,
  elevationFeet: 277,
  ilsFrequencyPrimary: '110.9 MHz',
  ilsFrequencyReciprocal: '110.3 MHz',
  activeLandingPrimary: true,
  activeDeparturePrimary: true,
});

const egjjCross = buildRunwayPair('EGJJ', {
  primaryId: '21',
  reciprocalId: '03',
  primaryHeading: 210,
  centerOffset: { x: 0.15, y: -0.1 },
  lengthFeet: 3750,
  widthFeet: 98,
  elevationFeet: 277,
  ilsFrequencyPrimary: '109.7 MHz',
  ilsFrequencyReciprocal: '108.5 MHz',
});

const EGJJ_WAYPOINTS: Waypoint[] = [
  { name: 'ORTAC', description: 'North Channel Hold', position: { x: 2, y: 16 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 180, holdingTurnDirection: 'Right' },
  { name: 'JSYE', description: 'Jersey East Bay Hold', position: { x: 14, y: 2 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 262, holdingTurnDirection: 'Right' },
  { name: 'DINRD', description: 'Dinard South Coast Hold', position: { x: 4, y: -15 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 350, holdingTurnDirection: 'Left' },
  { name: 'JSYW', description: 'Jersey West Reef Hold', position: { x: -15, y: -2 }, role: 'HOLD', isHoldingFix: true, defaultHoldingHeading: 82, holdingTurnDirection: 'Right' },
  { name: 'JSY', description: 'Jersey VOR', position: { x: 0.0, y: 0.0 }, role: 'VOR' },
];

const EGJJ_AIRPORT: Airport = attachTerrainToAirport(
  attachProceduresToAirport({
    icao: 'EGJJ',
    iata: 'JER',
    name: 'Jersey Channel Islands',
    country: 'United Kingdom',
    centerCoordinates: { lat: 49.2079, lon: -2.1955 },
    elevationFeet: 277,
    magneticVariation: -1.4,
    defaultArrivalRunway: '26',
    defaultDepartureRunway: '26',
    sector: {
      id: 'EGJJ_CTR',
      name: 'Jersey Zone Control',
      radiusNM: 35,
      floorAltitude: 0,
      ceilingAltitude: 12000,
      transitionAltitude: 5000,
    },
    runways: [...egjjMain.runways, ...egjjCross.runways],
    waypoints: EGJJ_WAYPOINTS,
  })
);

export const EGJJ_PROFILE: AirportProfile = {
  airport: EGJJ_AIRPORT,
  runwayGeometries: [...egjjMain.geometries, ...egjjCross.geometries],
  reciprocalPairs: [egjjMain.reciprocal, egjjCross.reciprocal],
  category: 'Regional',
  runwayLayoutLabel: 'Short Island Cross-Strip (26/08 5.6k · 21/03 3.7k)',
  difficultyLabel: 'High Crosswind',
  summary: 'Maritime regional island field with short 5,597 ft & 3,750 ft cross-strips tailored for Turboprops, Bizjets, and Light GA traffic in gusty Channel winds.',
  defaultWeather: {
    windDirection: 235,
    windSpeed: 21,
    gusts: 29,
    qnh: 1004,
    visibilityNM: 7,
    ceilingFeet: 2800,
    precipitation: 'Light Rain',
  },
  directorCallsign: 'JERSEY_APP',
  vhfFrequency: '120.300 MHz',
};

export const MIDDLE_EAST_EUROPE_PROFILES: AirportProfile[] = [
  OIIE_PROFILE,
  OISS_PROFILE,
  OMDB_PROFILE,
  LFPG_PROFILE,
  EHAM_PROFILE,
  EDDF_PROFILE,
  LSZH_PROFILE,
  EGJJ_PROFILE,
];
