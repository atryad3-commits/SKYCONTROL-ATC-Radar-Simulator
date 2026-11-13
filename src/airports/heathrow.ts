/**
 * London Heathrow Airport (EGLL / LHR)
 * Navigational Data, Dual Runways (27L/27R, 09L/09R) & Approach Fixes
 */

import { Airport, Waypoint } from '../types';

// Heathrow center reference point (between parallel runways):
// Latitude: 51.4700° N, Longitude: -0.4543° W
// 1 Nautical Mile ≈ 1.852 km
// At 51.47° N: 1° Lat ≈ 60 NM, 1° Lon ≈ 60 * cos(51.47°) ≈ 37.38 NM

const NM_PER_DEG_LAT = 60.0;
const NM_PER_DEG_LON = 37.38;

export function latLonToNM(lat: number, lon: number): { x: number; y: number } {
  const centerLat = 51.4700;
  const centerLon = -0.4543;
  return {
    x: (lon - centerLon) * NM_PER_DEG_LON,
    y: (lat - centerLat) * NM_PER_DEG_LAT,
  };
}

export function nmToLatLon(x: number, y: number): { lat: number; lon: number } {
  const centerLat = 51.4700;
  const centerLon = -0.4543;
  return {
    lat: centerLat + y / NM_PER_DEG_LAT,
    lon: centerLon + x / NM_PER_DEG_LON,
  };
}

// Heathrow Navigational Fixes & Holding Stacks:
// BNN (Bovingdon) NW Holding Stack: 51.7247° N, -0.5408° W
// LAM (Lambourne) NE Holding Stack: 51.6447° N, +0.1517° E
// BIG (Biggin) SE Holding Stack: 51.3308° N, +0.0347° E
// OCK (Ockham) SW Holding Stack: 51.3056° N, -0.4472° W
// Intermediate and Final Approach Fixes for 27L/27R and 09L/09R
export const HEATHROW_WAYPOINTS: Waypoint[] = [
  {
    name: 'BNN',
    description: 'Bovingdon VOR (North-West Holding Stack)',
    position: latLonToNM(51.7247, -0.5408),
    isHoldingFix: true,
    defaultHoldingHeading: 165,
  },
  {
    name: 'LAM',
    description: 'Lambourne VOR (North-East Holding Stack)',
    position: latLonToNM(51.6447, 0.1517),
    isHoldingFix: true,
    defaultHoldingHeading: 205,
  },
  {
    name: 'BIG',
    description: 'Biggin VOR (South-East Holding Stack)',
    position: latLonToNM(51.3308, 0.0347),
    isHoldingFix: true,
    defaultHoldingHeading: 310,
  },
  {
    name: 'OCK',
    description: 'Ockham VOR (South-West Holding Stack)',
    position: latLonToNM(51.3056, -0.4472),
    isHoldingFix: true,
    defaultHoldingHeading: 10,
  },
  {
    name: 'EPM',
    description: 'Epsom NDB (Approach Fix)',
    position: latLonToNM(51.3325, -0.3400),
  },
  {
    name: 'CHT',
    description: 'Chertsey (Departure Routing)',
    position: latLonToNM(51.3917, -0.5333),
  },
  {
    name: 'LON',
    description: 'London VOR (Airport Center)',
    position: latLonToNM(51.4883, -0.4617),
  },
  {
    name: 'WOD',
    description: 'Woodley NDB (Western Departure Fix)',
    position: latLonToNM(51.4500, -0.8400),
  },
  {
    name: 'CPT',
    description: 'Compton VOR (West Inbound Fix)',
    position: latLonToNM(51.4917, -1.2183),
  },
  // Final Approach Fixes for Runways 27L & 27R (approx 8 NM and 15 NM east of thresholds)
  {
    name: 'D15R',
    description: '15 NM Final Approach 27R',
    position: { x: 15.0, y: 0.38 },
    isInitialApproachFix: true,
  },
  {
    name: 'D08R',
    description: '8 NM Intermediate Approach 27R',
    position: { x: 8.0, y: 0.38 },
  },
  {
    name: 'D15L',
    description: '15 NM Final Approach 27L',
    position: { x: 15.0, y: -0.38 },
    isInitialApproachFix: true,
  },
  {
    name: 'D08L',
    description: '8 NM Intermediate Approach 27L',
    position: { x: 8.0, y: -0.38 },
  },
];

export const HEATHROW_AIRPORT: Airport = {
  icao: 'EGLL',
  iata: 'LHR',
  name: 'London Heathrow Airport',
  country: 'United Kingdom',
  centerCoordinates: { lat: 51.4700, lon: -0.4543 },
  elevationFeet: 83,
  magneticVariation: -1.0, // 1° W
  defaultArrivalRunway: '27R',
  defaultDepartureRunway: '27L',
  sector: {
    id: 'EGLL_TMA',
    name: 'London Terminal Control Area (LTMA)',
    radiusNM: 45,
    floorAltitude: 0,
    ceilingAltitude: 18000,
    transitionAltitude: 6000,
  },
  runways: [
    {
      id: '27R',
      heading: 270,
      lengthFeet: 12800,
      // 27R threshold is on the East side (traffic lands heading West 270°)
      // Runway is roughly 2.1 NM long; threshold is at x ≈ +1.0 NM, y = +0.38 NM (northern parallel)
      threshold: { x: 1.05, y: 0.38, lat: 51.4763, lon: -0.4260 },
      endPosition: { x: -1.05, y: 0.38, lat: 51.4763, lon: -0.4820 },
      ilsFrequency: '110.3 MHz',
      glideslopeAngle: 3.0,
      activeLanding: true,
      activeDeparture: false,
      occupied: false,
    },
    {
      id: '27L',
      heading: 270,
      lengthFeet: 12000,
      // 27L threshold is on the East side (southern parallel)
      threshold: { x: 0.95, y: -0.38, lat: 51.4637, lon: -0.4287 },
      endPosition: { x: -1.00, y: -0.38, lat: 51.4637, lon: -0.4810 },
      ilsFrequency: '109.5 MHz',
      glideslopeAngle: 3.0,
      activeLanding: false,
      activeDeparture: true,
      occupied: false,
    },
    {
      id: '09L',
      heading: 90,
      lengthFeet: 12800,
      threshold: { x: -1.05, y: 0.38, lat: 51.4763, lon: -0.4820 },
      endPosition: { x: 1.05, y: 0.38, lat: 51.4763, lon: -0.4260 },
      ilsFrequency: '110.3 MHz',
      glideslopeAngle: 3.0,
      activeLanding: false,
      activeDeparture: false,
      occupied: false,
    },
    {
      id: '09R',
      heading: 90,
      lengthFeet: 12000,
      threshold: { x: -1.00, y: -0.38, lat: 51.4637, lon: -0.4810 },
      endPosition: { x: 0.95, y: -0.38, lat: 51.4637, lon: -0.4287 },
      ilsFrequency: '109.5 MHz',
      glideslopeAngle: 3.0,
      activeLanding: false,
      activeDeparture: false,
      occupied: false,
    },
  ],
  waypoints: HEATHROW_WAYPOINTS,
};

import { RunwayGeometry } from '../engine/runwayGeometry';

export const HEATHROW_RUNWAY_GEOMETRIES: RunwayGeometry[] = [
  {
    id: '27R',
    airportId: 'EGLL',
    designator: '27R',
    threshold: { x: 1.05, y: 0.38, lat: 51.4763, lon: -0.4260 },
    oppositeThreshold: { x: -1.05, y: 0.38, lat: 51.4763, lon: -0.4820 },
    trueHeading: 269.0,
    magneticHeading: 270.0,
    lengthFeet: 12800,
    widthFeet: 164,
    elevationFeet: 83,
    activeLanding: true,
    activeDeparture: false,
    occupancyState: 'Available',
    ils: {
      frequency: '110.3 MHz',
      glideslopeAngleDeg: 3.0,
      localizerCourseDeg: 270.0,
      usableRangeNM: 18.0,
      catCategory: 'CAT_III',
    },
  },
  {
    id: '27L',
    airportId: 'EGLL',
    designator: '27L',
    threshold: { x: 0.95, y: -0.38, lat: 51.4637, lon: -0.4287 },
    oppositeThreshold: { x: -1.00, y: -0.38, lat: 51.4637, lon: -0.4810 },
    trueHeading: 269.0,
    magneticHeading: 270.0,
    lengthFeet: 12000,
    widthFeet: 164,
    elevationFeet: 83,
    activeLanding: false,
    activeDeparture: true,
    occupancyState: 'Available',
    ils: {
      frequency: '109.5 MHz',
      glideslopeAngleDeg: 3.0,
      localizerCourseDeg: 270.0,
      usableRangeNM: 18.0,
      catCategory: 'CAT_III',
    },
  },
  {
    id: '09L',
    airportId: 'EGLL',
    designator: '09L',
    threshold: { x: -1.05, y: 0.38, lat: 51.4763, lon: -0.4820 },
    oppositeThreshold: { x: 1.05, y: 0.38, lat: 51.4763, lon: -0.4260 },
    trueHeading: 89.0,
    magneticHeading: 90.0,
    lengthFeet: 12800,
    widthFeet: 164,
    elevationFeet: 83,
    activeLanding: false,
    activeDeparture: false,
    occupancyState: 'Available',
    ils: {
      frequency: '110.3 MHz',
      glideslopeAngleDeg: 3.0,
      localizerCourseDeg: 90.0,
      usableRangeNM: 18.0,
      catCategory: 'CAT_III',
    },
  },
  {
    id: '09R',
    airportId: 'EGLL',
    designator: '09R',
    threshold: { x: -1.00, y: -0.38, lat: 51.4637, lon: -0.4810 },
    oppositeThreshold: { x: 0.95, y: -0.38, lat: 51.4637, lon: -0.4287 },
    trueHeading: 89.0,
    magneticHeading: 90.0,
    lengthFeet: 12000,
    widthFeet: 164,
    elevationFeet: 83,
    activeLanding: false,
    activeDeparture: false,
    occupancyState: 'Available',
    ils: {
      frequency: '109.5 MHz',
      glideslopeAngleDeg: 3.0,
      localizerCourseDeg: 90.0,
      usableRangeNM: 18.0,
      catCategory: 'CAT_III',
    },
  },
];
