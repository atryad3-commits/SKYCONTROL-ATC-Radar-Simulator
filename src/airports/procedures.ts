/**
 * SKYCONTROL - Published Terminal Procedures Registry (STAR, SID, IAF/FAF/EXIT, TMA Boundaries)
 * Provides structured arrival corridors (STAR), departure corridors (SID), leg courses/distances,
 * altitude & speed restrictions, TMA boundary polygons, and per-airport visibility helpers.
 */

import {
  Airport,
  AirportNavVisibility,
  ProcedureLeg,
  PublishedProcedureRoute,
  Waypoint,
} from '../types';
import { calculateBearing, calculateDistance } from '../engine/physics';
import {
  AirportProceduralPackage,
  LegConstraintSpec,
  makeOctagonPolygon,
} from './airportBuilder';
import { EXPANDED_PROCEDURAL_PACKAGES } from './proceduresExpanded';

const AIRPORT_PROCEDURAL_PACKAGES: Record<string, AirportProceduralPackage> = {
  EGLL: {
    waypointOverrides: {
      LAM: { role: 'HOLD', altitudeConstraint: 'FL070–FL120', speedConstraintKt: 220 },
      BNN: { role: 'HOLD', altitudeConstraint: 'FL070–FL120', speedConstraintKt: 220 },
      BIG: { role: 'HOLD', altitudeConstraint: 'FL070–FL120', speedConstraintKt: 220 },
      OCK: { role: 'HOLD', altitudeConstraint: 'FL070–FL120', speedConstraintKt: 220 },
      D15R: { role: 'IAF', isInitialApproachFix: true, altitudeConstraint: 'AT 4000ft', speedConstraintKt: 200 },
      D08R: { role: 'FAF', isFinalApproachFix: true, altitudeConstraint: 'AT 2500ft', speedConstraintKt: 175 },
      D15L: { role: 'IAF', isInitialApproachFix: true, altitudeConstraint: 'AT 4000ft', speedConstraintKt: 200 },
      D08L: { role: 'FAF', isFinalApproachFix: true, altitudeConstraint: 'AT 2500ft', speedConstraintKt: 175 },
      LON: { role: 'VOR' },
    },
    extraWaypoints: [
      {
        name: 'D15W',
        description: '15 NM Initial Approach 09L',
        position: { x: -15.0, y: 0.38 },
        role: 'IAF',
        isInitialApproachFix: true,
        altitudeConstraint: 'AT 4000ft',
        speedConstraintKt: 200,
      },
      {
        name: 'D08W',
        description: '8 NM Final Approach Fix 09L',
        position: { x: -8.0, y: 0.38 },
        role: 'FAF',
        isFinalApproachFix: true,
        altitudeConstraint: 'AT 2500ft',
        speedConstraintKt: 175,
      },
      {
        name: 'D15S',
        description: '15 NM Initial Approach 09R',
        position: { x: -15.0, y: -0.38 },
        role: 'IAF',
        isInitialApproachFix: true,
        altitudeConstraint: 'AT 4000ft',
        speedConstraintKt: 200,
      },
      {
        name: 'D08S',
        description: '8 NM Final Approach Fix 09R',
        position: { x: -8.0, y: -0.38 },
        role: 'FAF',
        isFinalApproachFix: true,
        altitudeConstraint: 'AT 2500ft',
        speedConstraintKt: 175,
      },
      {
        name: 'BPK',
        description: 'Brookmans Park NE Radar Exit',
        position: { x: 14.5, y: 21.0 },
        role: 'EXIT',
        isDepartureExit: true,
        altitudeConstraint: 'MIN FL080',
        speedConstraintKt: 250,
      },
      {
        name: 'DET',
        description: 'Detling SE Radar Exit',
        position: { x: 24.5, y: -11.5 },
        role: 'EXIT',
        isDepartureExit: true,
        altitudeConstraint: 'MIN FL090',
        speedConstraintKt: 250,
      },
      {
        name: 'SAM',
        description: 'Southampton SW Radar Exit',
        position: { x: -23.0, y: -18.5 },
        role: 'EXIT',
        isDepartureExit: true,
        altitudeConstraint: 'MIN FL100',
        speedConstraintKt: 250,
      },
      {
        name: 'MID',
        description: 'Midhurst South Radar Exit',
        position: { x: -6.5, y: -23.5 },
        role: 'EXIT',
        isDepartureExit: true,
        altitudeConstraint: 'MIN FL080',
        speedConstraintKt: 250,
      },
    ],
    stars: [
      {
        id: 'EGLL_STAR_LAM3A',
        name: 'LAM3A',
        type: 'STAR',
        description: 'North-East Lambourne Arrival to 27R (IAF D15R · FAF D08R)',
        runwayIds: ['27R'],
        waypointNames: ['LAM', 'D15R', 'D08R'],
        initialAltitudeFt: 7000,
        finalAltitudeFt: 2500,
        maxSpeedKt: 220,
        legConstraints: [
          { altitudeConstraint: 'MAX 7000ft', maxAltitudeFt: 7000, minAltitudeFt: 4000, speedLimitKt: 220 },
          { altitudeConstraint: '4000→2500ft', maxAltitudeFt: 4000, minAltitudeFt: 2500, speedLimitKt: 180 },
        ],
      },
      {
        id: 'EGLL_STAR_BIG2H',
        name: 'BIG2H',
        type: 'STAR',
        description: 'South-East Biggin Arrival via Epsom to 27L (IAF D15L · FAF D08L)',
        runwayIds: ['27L'],
        waypointNames: ['BIG', 'EPM', 'D15L', 'D08L'],
        initialAltitudeFt: 7000,
        finalAltitudeFt: 2500,
        maxSpeedKt: 220,
        legConstraints: [
          { altitudeConstraint: 'MAX 7000ft', maxAltitudeFt: 7000, minAltitudeFt: 5000, speedLimitKt: 220 },
          { altitudeConstraint: 'AT 4000ft', maxAltitudeFt: 5000, minAltitudeFt: 4000, speedLimitKt: 200 },
          { altitudeConstraint: '4000→2500ft', maxAltitudeFt: 4000, minAltitudeFt: 2500, speedLimitKt: 180 },
        ],
      },
      {
        id: 'EGLL_STAR_BNN1B',
        name: 'BNN1B',
        type: 'STAR',
        description: 'North-West Bovingdon Arrival to 09L (IAF D15W · FAF D08W)',
        runwayIds: ['09L'],
        waypointNames: ['BNN', 'D15W', 'D08W'],
        initialAltitudeFt: 7000,
        finalAltitudeFt: 2500,
        maxSpeedKt: 220,
        legConstraints: [
          { altitudeConstraint: 'MAX 7000ft', maxAltitudeFt: 7000, minAltitudeFt: 4000, speedLimitKt: 210 },
          { altitudeConstraint: '4000→2500ft', maxAltitudeFt: 4000, minAltitudeFt: 2500, speedLimitKt: 180 },
        ],
      },
      {
        id: 'EGLL_STAR_OCK4A',
        name: 'OCK4A',
        type: 'STAR',
        description: 'South-West Ockham Arrival via Compton to 09R (IAF D15S · FAF D08S)',
        runwayIds: ['09R'],
        waypointNames: ['OCK', 'CPT', 'D15S', 'D08S'],
        initialAltitudeFt: 7000,
        finalAltitudeFt: 2500,
        maxSpeedKt: 220,
        legConstraints: [
          { altitudeConstraint: 'MAX 7000ft', maxAltitudeFt: 7000, minAltitudeFt: 5000, speedLimitKt: 220 },
          { altitudeConstraint: 'AT 4000ft', maxAltitudeFt: 5000, minAltitudeFt: 4000, speedLimitKt: 200 },
          { altitudeConstraint: '4000→2500ft', maxAltitudeFt: 4000, minAltitudeFt: 2500, speedLimitKt: 180 },
        ],
      },
    ],
    sids: [
      {
        id: 'EGLL_SID_SAM2G',
        name: 'SAM2G',
        type: 'SID',
        description: 'West/South-West Departure via Woodley & Southampton Gate',
        runwayIds: ['27L', '27R'],
        waypointNames: ['CHT', 'WOD', 'SAM'],
        initialAltitudeFt: 3000,
        finalAltitudeFt: 10000,
        maxSpeedKt: 250,
        legConstraints: [
          { altitudeConstraint: 'MIN 4000ft', minAltitudeFt: 4000, speedLimitKt: 230 },
          { altitudeConstraint: 'MIN FL100', minAltitudeFt: 10000, speedLimitKt: 250 },
        ],
      },
      {
        id: 'EGLL_SID_CPT3F',
        name: 'CPT3F',
        type: 'SID',
        description: 'Western Departure Corridor via Woodley to Compton Exit',
        runwayIds: ['27R', '27L'],
        waypointNames: ['WOD', 'CPT'],
        initialAltitudeFt: 3000,
        finalAltitudeFt: 9000,
        maxSpeedKt: 250,
        legConstraints: [
          { altitudeConstraint: 'MIN FL080', minAltitudeFt: 8000, speedLimitKt: 250 },
        ],
      },
      {
        id: 'EGLL_SID_BPK7J',
        name: 'BPK7J',
        type: 'SID',
        description: 'North-East Departure Corridor via Brookmans Park Exit',
        runwayIds: ['09L', '09R'],
        waypointNames: ['LON', 'BPK'],
        initialAltitudeFt: 3000,
        finalAltitudeFt: 8000,
        maxSpeedKt: 250,
        legConstraints: [
          { altitudeConstraint: 'MIN FL080', minAltitudeFt: 8000, speedLimitKt: 250 },
        ],
      },
      {
        id: 'EGLL_SID_DET2G',
        name: 'DET2G',
        type: 'SID',
        description: 'South-East Departure Corridor via Biggin & Detling Gate',
        runwayIds: ['09R', '09L'],
        waypointNames: ['EPM', 'DET'],
        initialAltitudeFt: 3000,
        finalAltitudeFt: 9000,
        maxSpeedKt: 250,
        legConstraints: [
          { altitudeConstraint: 'MIN FL090', minAltitudeFt: 9000, speedLimitKt: 250 },
        ],
      },
    ],
    tmaBoundary: {
      sectorLabel: 'LONDON TMA (EGLL)',
      floorLabel: 'SFC / 1500ft',
      ceilingLabel: 'FL180',
      transitionAltitudeFt: 6000,
      polygon: makeOctagonPolygon(34.5, 31.0),
    },
  },

  OIII: {
    waypointOverrides: {
      DMV: { role: 'HOLD', altitudeConstraint: 'MIN 10000ft', speedConstraintKt: 220 },
      VAR: { role: 'HOLD', altitudeConstraint: 'MIN 10000ft', speedConstraintKt: 220 },
      SAV: { role: 'HOLD', altitudeConstraint: 'MIN 9500ft', speedConstraintKt: 220 },
      KRD: { role: 'HOLD', altitudeConstraint: 'MIN 9500ft', speedConstraintKt: 220 },
      TRN: { role: 'VOR' },
      RAD: { role: 'IAF', isInitialApproachFix: true, altitudeConstraint: 'AT 8000ft', speedConstraintKt: 200 },
      RUS: { role: 'FAF', isFinalApproachFix: true, altitudeConstraint: 'AT 6500ft', speedConstraintKt: 175 },
    },
    extraWaypoints: [
      {
        name: 'R11L',
        description: '14 NM Initial Approach 11L',
        position: { x: -14.0, y: 4.8 },
        role: 'IAF',
        isInitialApproachFix: true,
        altitudeConstraint: 'AT 8000ft',
        speedConstraintKt: 200,
      },
      {
        name: 'F11L',
        description: '8 NM Final Approach Fix 11L',
        position: { x: -8.5, y: 2.8 },
        role: 'FAF',
        isFinalApproachFix: true,
        altitudeConstraint: 'AT 6500ft',
        speedConstraintKt: 175,
      },
      {
        name: 'SHH',
        description: 'Shahriar West Radar Exit',
        position: { x: -25.5, y: -3.5 },
        role: 'EXIT',
        isDepartureExit: true,
        altitudeConstraint: 'MIN FL120',
        speedConstraintKt: 250,
      },
      {
        name: 'QOM',
        description: 'Qom South Departure Gate',
        position: { x: 4.5, y: -25.0 },
        role: 'EXIT',
        isDepartureExit: true,
        altitudeConstraint: 'MIN FL110',
        speedConstraintKt: 250,
      },
      {
        name: 'FIR',
        description: 'Firuzkuh East Radar Exit',
        position: { x: 26.5, y: 7.5 },
        role: 'EXIT',
        isDepartureExit: true,
        altitudeConstraint: 'MIN FL130',
        speedConstraintKt: 250,
      },
    ],
    stars: [
      {
        id: 'OIII_STAR_DMV1A',
        name: 'DMV1A',
        type: 'STAR',
        description: 'North-East Damavand Arrival to 29R/29L (IAF RAD · FAF RUS)',
        runwayIds: ['29R', '29L'],
        waypointNames: ['DMV', 'RAD', 'RUS'],
        initialAltitudeFt: 11000,
        finalAltitudeFt: 6500,
        maxSpeedKt: 220,
        legConstraints: [
          { altitudeConstraint: '11000→8000ft', maxAltitudeFt: 11000, minAltitudeFt: 8000, speedLimitKt: 210 },
          { altitudeConstraint: '8000→6500ft', maxAltitudeFt: 8000, minAltitudeFt: 6500, speedLimitKt: 180 },
        ],
      },
      {
        id: 'OIII_STAR_VAR2B',
        name: 'VAR2B',
        type: 'STAR',
        description: 'South-East Varamin Arrival to 29R/29L (IAF RAD · FAF RUS)',
        runwayIds: ['29R', '29L'],
        waypointNames: ['VAR', 'RAD', 'RUS'],
        initialAltitudeFt: 10000,
        finalAltitudeFt: 6500,
        maxSpeedKt: 220,
        legConstraints: [
          { altitudeConstraint: '10000→8000ft', maxAltitudeFt: 10000, minAltitudeFt: 8000, speedLimitKt: 210 },
          { altitudeConstraint: '8000→6500ft', maxAltitudeFt: 8000, minAltitudeFt: 6500, speedLimitKt: 180 },
        ],
      },
      {
        id: 'OIII_STAR_KRD1C',
        name: 'KRD1C',
        type: 'STAR',
        description: 'North-West Karaj Arrival to 11L/11R (IAF R11L · FAF F11L)',
        runwayIds: ['11L', '11R'],
        waypointNames: ['KRD', 'R11L', 'F11L'],
        initialAltitudeFt: 10000,
        finalAltitudeFt: 6500,
        maxSpeedKt: 210,
        legConstraints: [
          { altitudeConstraint: '10000→8000ft', maxAltitudeFt: 10000, minAltitudeFt: 8000, speedLimitKt: 205 },
          { altitudeConstraint: '8000→6500ft', maxAltitudeFt: 8000, minAltitudeFt: 6500, speedLimitKt: 180 },
        ],
      },
    ],
    sids: [
      {
        id: 'OIII_SID_SHH2D',
        name: 'SHH2D',
        type: 'SID',
        description: 'West Departure Climb to Shahriar Radar Exit',
        runwayIds: ['29L', '29R'],
        waypointNames: ['TRN', 'SHH'],
        initialAltitudeFt: 6000,
        finalAltitudeFt: 12000,
        maxSpeedKt: 250,
        legConstraints: [
          { altitudeConstraint: 'MIN FL120', minAltitudeFt: 12000, speedLimitKt: 245 },
        ],
      },
      {
        id: 'OIII_SID_SAV1D',
        name: 'SAV1D',
        type: 'SID',
        description: 'South-West Climb via Saveh Hold to Qom Exit',
        runwayIds: ['29L', '29R'],
        waypointNames: ['SAV', 'QOM'],
        initialAltitudeFt: 7000,
        finalAltitudeFt: 11000,
        maxSpeedKt: 250,
        legConstraints: [
          { altitudeConstraint: 'MIN FL110', minAltitudeFt: 11000, speedLimitKt: 250 },
        ],
      },
      {
        id: 'OIII_SID_FIR1E',
        name: 'FIR1E',
        type: 'SID',
        description: 'East Departure Climb via Varamin to Firuzkuh Exit',
        runwayIds: ['11R', '11L'],
        waypointNames: ['VAR', 'FIR'],
        initialAltitudeFt: 7000,
        finalAltitudeFt: 13000,
        maxSpeedKt: 250,
        legConstraints: [
          { altitudeConstraint: 'MIN FL130', minAltitudeFt: 13000, speedLimitKt: 250 },
        ],
      },
    ],
    tmaBoundary: {
      sectorLabel: 'TEHRAN TMA (OIII)',
      floorLabel: '3962ft MSL',
      ceilingLabel: 'FL200',
      transitionAltitudeFt: 11000,
      polygon: makeOctagonPolygon(33.5, 30.5),
    },
  },

  KJFK: {
    waypointOverrides: {
      DEER: { role: 'HOLD', altitudeConstraint: '6000–10000ft', speedConstraintKt: 220 },
      ROBER: { role: 'HOLD', altitudeConstraint: '6000–10000ft', speedConstraintKt: 220 },
      CAMRN: { role: 'HOLD', altitudeConstraint: '6000–10000ft', speedConstraintKt: 220 },
      LENDY: { role: 'HOLD', altitudeConstraint: '6000–10000ft', speedConstraintKt: 220 },
      KENDA: { role: 'IAF', isInitialApproachFix: true, altitudeConstraint: 'AT 4000ft', speedConstraintKt: 200 },
      ZIGGY: { role: 'IAF', isInitialApproachFix: true, altitudeConstraint: 'AT 4000ft', speedConstraintKt: 200 },
    },
    extraWaypoints: [
      {
        name: 'F31L',
        description: '7 NM Final Approach Fix 31L',
        position: { x: 6.0, y: -5.3 },
        role: 'FAF',
        isFinalApproachFix: true,
        altitudeConstraint: 'AT 2400ft',
        speedConstraintKt: 175,
      },
      {
        name: 'F04L',
        description: '7 NM Final Approach Fix 04L',
        position: { x: -4.2, y: -5.1 },
        role: 'FAF',
        isFinalApproachFix: true,
        altitudeConstraint: 'AT 2200ft',
        speedConstraintKt: 175,
      },
      {
        name: 'I13R',
        description: '13 NM Initial Approach 13R',
        position: { x: -10.5, y: 8.6 },
        role: 'IAF',
        isInitialApproachFix: true,
        altitudeConstraint: 'AT 4000ft',
        speedConstraintKt: 200,
      },
      {
        name: 'F13R',
        description: '7 NM Final Approach Fix 13R',
        position: { x: -5.8, y: 4.8 },
        role: 'FAF',
        isFinalApproachFix: true,
        altitudeConstraint: 'AT 2400ft',
        speedConstraintKt: 175,
      },
      {
        name: 'SHIPP',
        description: 'Atlantic East Radar Exit',
        position: { x: 26.0, y: 5.5 },
        role: 'EXIT',
        isDepartureExit: true,
        altitudeConstraint: 'MIN FL100',
        speedConstraintKt: 250,
      },
      {
        name: 'BETTE',
        description: 'South Oceanic Departure Gate',
        position: { x: 11.5, y: -25.0 },
        role: 'EXIT',
        isDepartureExit: true,
        altitudeConstraint: 'MIN FL100',
        speedConstraintKt: 250,
      },
      {
        name: 'COATE',
        description: 'North-West Departure Gate',
        position: { x: -24.0, y: 19.5 },
        role: 'EXIT',
        isDepartureExit: true,
        altitudeConstraint: 'MIN FL110',
        speedConstraintKt: 250,
      },
    ],
    stars: [
      {
        id: 'KJFK_STAR_ROBER2',
        name: 'ROBER2',
        type: 'STAR',
        description: 'South-East Roberts Arrival to RWY 31L (IAF KENDA · FAF F31L)',
        runwayIds: ['31L'],
        waypointNames: ['ROBER', 'KENDA', 'F31L'],
        initialAltitudeFt: 7000,
        finalAltitudeFt: 2400,
        maxSpeedKt: 220,
        legConstraints: [
          { altitudeConstraint: 'MAX 7000ft', maxAltitudeFt: 7000, minAltitudeFt: 4000, speedLimitKt: 210 },
          { altitudeConstraint: '4000→2400ft', maxAltitudeFt: 4000, minAltitudeFt: 2400, speedLimitKt: 180 },
        ],
      },
      {
        id: 'KJFK_STAR_CAMRN4',
        name: 'CAMRN4',
        type: 'STAR',
        description: 'South-West Camrn Arrival to RWY 04L (IAF ZIGGY · FAF F04L)',
        runwayIds: ['04L'],
        waypointNames: ['CAMRN', 'ZIGGY', 'F04L'],
        initialAltitudeFt: 6000,
        finalAltitudeFt: 2200,
        maxSpeedKt: 210,
        legConstraints: [
          { altitudeConstraint: 'MAX 6000ft', maxAltitudeFt: 6000, minAltitudeFt: 4000, speedLimitKt: 205 },
          { altitudeConstraint: '4000→2200ft', maxAltitudeFt: 4000, minAltitudeFt: 2200, speedLimitKt: 175 },
        ],
      },
      {
        id: 'KJFK_STAR_LENDY6',
        name: 'LENDY6',
        type: 'STAR',
        description: 'North-West Lendy Arrival to RWY 13R (IAF I13R · FAF F13R)',
        runwayIds: ['13R', '22R'],
        waypointNames: ['LENDY', 'I13R', 'F13R'],
        initialAltitudeFt: 7000,
        finalAltitudeFt: 2400,
        maxSpeedKt: 220,
        legConstraints: [
          { altitudeConstraint: 'MAX 7000ft', maxAltitudeFt: 7000, minAltitudeFt: 4000, speedLimitKt: 210 },
          { altitudeConstraint: '4000→2400ft', maxAltitudeFt: 4000, minAltitudeFt: 2400, speedLimitKt: 180 },
        ],
      },
    ],
    sids: [
      {
        id: 'KJFK_SID_DEER5',
        name: 'DEER5',
        type: 'SID',
        description: 'North-East Kennedy Climb via Deer Park to Shipp Exit',
        runwayIds: ['04L', '13R'],
        waypointNames: ['DEER', 'SHIPP'],
        initialAltitudeFt: 3000,
        finalAltitudeFt: 10000,
        maxSpeedKt: 250,
        legConstraints: [
          { altitudeConstraint: 'MIN FL100', minAltitudeFt: 10000, speedLimitKt: 250 },
        ],
      },
      {
        id: 'KJFK_SID_BETTE3',
        name: 'BETTE3',
        type: 'SID',
        description: 'South-East Oceanic Climb via Roberts to Bette Gate',
        runwayIds: ['13R', '22R'],
        waypointNames: ['ROBER', 'BETTE'],
        initialAltitudeFt: 3000,
        finalAltitudeFt: 10000,
        maxSpeedKt: 250,
        legConstraints: [
          { altitudeConstraint: 'MIN FL100', minAltitudeFt: 10000, speedLimitKt: 250 },
        ],
      },
      {
        id: 'KJFK_SID_KENDA3',
        name: 'KENDA3',
        type: 'SID',
        description: 'North-West Climb via Lendy to Coate Departure Gate',
        runwayIds: ['31L'],
        waypointNames: ['LENDY', 'COATE'],
        initialAltitudeFt: 3000,
        finalAltitudeFt: 11000,
        maxSpeedKt: 250,
        legConstraints: [
          { altitudeConstraint: 'MIN FL110', minAltitudeFt: 11000, speedLimitKt: 250 },
        ],
      },
    ],
    tmaBoundary: {
      sectorLabel: 'NEW YORK TRACON (N90)',
      floorLabel: 'SFC / 1200ft',
      ceilingLabel: 'FL180',
      transitionAltitudeFt: 18000,
      polygon: makeOctagonPolygon(35.0, 32.0),
    },
  },

  TRN1: {
    waypointOverrides: {
      RIDGE: { role: 'HOLD', altitudeConstraint: '5000–8000ft', speedConstraintKt: 210 },
      BRAVO: { role: 'HOLD', altitudeConstraint: '5000–8000ft', speedConstraintKt: 210 },
      VALEY: { role: 'HOLD', altitudeConstraint: '5000–8000ft', speedConstraintKt: 210 },
      CREST: { role: 'HOLD', altitudeConstraint: '5000–8000ft', speedConstraintKt: 210 },
      APX36: { role: 'IAF', isInitialApproachFix: true, altitudeConstraint: 'AT 3500ft', speedConstraintKt: 195 },
      APX24: { role: 'IAF', isInitialApproachFix: true, altitudeConstraint: 'AT 3500ft', speedConstraintKt: 195 },
    },
    extraWaypoints: [
      {
        name: 'FAF36',
        description: '6 NM Final Fix RWY 36',
        position: { x: 0, y: -6.5 },
        role: 'FAF',
        isFinalApproachFix: true,
        altitudeConstraint: 'AT 2400ft',
        speedConstraintKt: 170,
      },
      {
        name: 'FAF24',
        description: '6 NM Final Fix RWY 24',
        position: { x: 5.2, y: 3.0 },
        role: 'FAF',
        isFinalApproachFix: true,
        altitudeConstraint: 'AT 2400ft',
        speedConstraintKt: 170,
      },
      {
        name: 'XWEST',
        description: 'West Crosswind Radar Exit',
        position: { x: -24.5, y: -12.0 },
        role: 'EXIT',
        isDepartureExit: true,
        altitudeConstraint: 'MIN 8000ft',
        speedConstraintKt: 240,
      },
      {
        name: 'XNRTH',
        description: 'North Ridge Radar Exit',
        position: { x: 2.5, y: 26.0 },
        role: 'EXIT',
        isDepartureExit: true,
        altitudeConstraint: 'MIN 9000ft',
        speedConstraintKt: 240,
      },
    ],
    stars: [
      {
        id: 'TRN1_STAR_VALEY1',
        name: 'VALEY1',
        type: 'STAR',
        description: 'South Straight-In Crosswind Approach to RWY 36 (FAF36)',
        runwayIds: ['36', '18'],
        waypointNames: ['VALEY', 'APX36', 'FAF36'],
        initialAltitudeFt: 6000,
        finalAltitudeFt: 2400,
        maxSpeedKt: 210,
        legConstraints: [
          { altitudeConstraint: 'MAX 6000ft', maxAltitudeFt: 6000, minAltitudeFt: 3500, speedLimitKt: 200 },
          { altitudeConstraint: '3500→2400ft', maxAltitudeFt: 3500, minAltitudeFt: 2400, speedLimitKt: 175 },
        ],
      },
      {
        id: 'TRN1_STAR_BRAVO2',
        name: 'BRAVO2',
        type: 'STAR',
        description: 'North-East Corridor Approach to RWY 24 (FAF24)',
        runwayIds: ['24', '06'],
        waypointNames: ['BRAVO', 'APX24', 'FAF24'],
        initialAltitudeFt: 6000,
        finalAltitudeFt: 2400,
        maxSpeedKt: 210,
        legConstraints: [
          { altitudeConstraint: 'MAX 6000ft', maxAltitudeFt: 6000, minAltitudeFt: 3500, speedLimitKt: 200 },
          { altitudeConstraint: '3500→2400ft', maxAltitudeFt: 3500, minAltitudeFt: 2400, speedLimitKt: 175 },
        ],
      },
    ],
    sids: [
      {
        id: 'TRN1_SID_CREST1',
        name: 'CREST1',
        type: 'SID',
        description: 'RWY 24/06 Departure Climb via Crest to West Exit Gate',
        runwayIds: ['24', '06'],
        waypointNames: ['CREST', 'XWEST'],
        initialAltitudeFt: 3000,
        finalAltitudeFt: 8000,
        maxSpeedKt: 240,
        legConstraints: [
          { altitudeConstraint: 'MIN 8000ft', minAltitudeFt: 8000, speedLimitKt: 240 },
        ],
      },
      {
        id: 'TRN1_SID_RIDGE2',
        name: 'RIDGE2',
        type: 'SID',
        description: 'RWY 36/18 North Climb via Ridge to North Gate',
        runwayIds: ['36', '18'],
        waypointNames: ['RIDGE', 'XNRTH'],
        initialAltitudeFt: 3000,
        finalAltitudeFt: 9000,
        maxSpeedKt: 240,
        legConstraints: [
          { altitudeConstraint: 'MIN 9000ft', minAltitudeFt: 9000, speedLimitKt: 240 },
        ],
      },
    ],
    tmaBoundary: {
      sectorLabel: 'CROSSWIND RIDGE CTR (TRN1)',
      floorLabel: '450ft MSL',
      ceilingLabel: 'FL180',
      transitionAltitudeFt: 6000,
      polygon: makeOctagonPolygon(31.0, 29.0),
    },
  },

  TRN2: {
    waypointOverrides: {
      DELTA: { role: 'HOLD', altitudeConstraint: '5000–8000ft', speedConstraintKt: 210 },
      ECHO: { role: 'HOLD', altitudeConstraint: '5000–8000ft', speedConstraintKt: 210 },
      FOXT: { role: 'HOLD', altitudeConstraint: '5000–8000ft', speedConstraintKt: 210 },
      GOLF: { role: 'HOLD', altitudeConstraint: '5000–8000ft', speedConstraintKt: 210 },
      ILS15: { role: 'IAF', isInitialApproachFix: true, altitudeConstraint: 'AT 3500ft', speedConstraintKt: 195 },
      ILS20: { role: 'IAF', isInitialApproachFix: true, altitudeConstraint: 'AT 3500ft', speedConstraintKt: 195 },
    },
    extraWaypoints: [
      {
        name: 'FAF15',
        description: '6 NM Final Fix RWY 15',
        position: { x: -3.8, y: 5.7 },
        role: 'FAF',
        isFinalApproachFix: true,
        altitudeConstraint: 'AT 2200ft',
        speedConstraintKt: 170,
      },
      {
        name: 'FAF20',
        description: '6 NM Final Fix RWY 20',
        position: { x: 2.8, y: 6.2 },
        role: 'FAF',
        isFinalApproachFix: true,
        altitudeConstraint: 'AT 2200ft',
        speedConstraintKt: 170,
      },
      {
        name: 'DSOUTH',
        description: 'Delta South Radar Exit',
        position: { x: -4.0, y: -25.0 },
        role: 'EXIT',
        isDepartureExit: true,
        altitudeConstraint: 'MIN 9000ft',
        speedConstraintKt: 245,
      },
      {
        name: 'DWEST',
        description: 'Delta West Radar Exit',
        position: { x: -24.5, y: -8.0 },
        role: 'EXIT',
        isDepartureExit: true,
        altitudeConstraint: 'MIN 9000ft',
        speedConstraintKt: 245,
      },
    ],
    stars: [
      {
        id: 'TRN2_STAR_DELTA1',
        name: 'DELTA1',
        type: 'STAR',
        description: 'Converging Approach Corridor to RWY 15 (FAF15)',
        runwayIds: ['15', '33'],
        waypointNames: ['DELTA', 'ILS15', 'FAF15'],
        initialAltitudeFt: 6000,
        finalAltitudeFt: 2200,
        maxSpeedKt: 210,
        legConstraints: [
          { altitudeConstraint: 'MAX 6000ft', maxAltitudeFt: 6000, minAltitudeFt: 3500, speedLimitKt: 200 },
          { altitudeConstraint: '3500→2200ft', maxAltitudeFt: 3500, minAltitudeFt: 2200, speedLimitKt: 175 },
        ],
      },
      {
        id: 'TRN2_STAR_ECHO2',
        name: 'ECHO2',
        type: 'STAR',
        description: 'East Converging Corridor to RWY 20 (FAF20)',
        runwayIds: ['20', '02'],
        waypointNames: ['ECHO', 'ILS20', 'FAF20'],
        initialAltitudeFt: 6000,
        finalAltitudeFt: 2200,
        maxSpeedKt: 210,
        legConstraints: [
          { altitudeConstraint: 'MAX 6000ft', maxAltitudeFt: 6000, minAltitudeFt: 3500, speedLimitKt: 200 },
          { altitudeConstraint: '3500→2200ft', maxAltitudeFt: 3500, minAltitudeFt: 2200, speedLimitKt: 175 },
        ],
      },
    ],
    sids: [
      {
        id: 'TRN2_SID_FOXT1',
        name: 'FOXT1',
        type: 'SID',
        description: 'South Departure Climb via Foxtrot to South Gate',
        runwayIds: ['20', '15'],
        waypointNames: ['FOXT', 'DSOUTH'],
        initialAltitudeFt: 3000,
        finalAltitudeFt: 9000,
        maxSpeedKt: 245,
        legConstraints: [
          { altitudeConstraint: 'MIN 9000ft', minAltitudeFt: 9000, speedLimitKt: 245 },
        ],
      },
      {
        id: 'TRN2_SID_GOLF2',
        name: 'GOLF2',
        type: 'SID',
        description: 'West Departure Climb via Golf to West Gate',
        runwayIds: ['33', '02'],
        waypointNames: ['GOLF', 'DWEST'],
        initialAltitudeFt: 3000,
        finalAltitudeFt: 9000,
        maxSpeedKt: 245,
        legConstraints: [
          { altitudeConstraint: 'MIN 9000ft', minAltitudeFt: 9000, speedLimitKt: 245 },
        ],
      },
    ],
    tmaBoundary: {
      sectorLabel: 'DELTA CONVERGING CTR (TRN2)',
      floorLabel: '120ft MSL',
      ceilingLabel: 'FL180',
      transitionAltitudeFt: 8000,
      polygon: makeOctagonPolygon(31.5, 29.5),
    },
  },
  ...EXPANDED_PROCEDURAL_PACKAGES,
};

function buildProcedureLegs(
  waypointNames: string[],
  constraints: LegConstraintSpec[],
  waypointsByName: Map<string, Waypoint>
): ProcedureLeg[] {
  const legs: ProcedureLeg[] = [];
  for (let i = 0; i < waypointNames.length - 1; i++) {
    const fromName = waypointNames[i];
    const toName = waypointNames[i + 1];
    const fromWp = waypointsByName.get(fromName);
    const toWp = waypointsByName.get(toName);
    if (!fromWp || !toWp) continue;

    const courseDeg = Math.round(
      calculateBearing(fromWp.position.x, fromWp.position.y, toWp.position.x, toWp.position.y)
    );
    const distanceNM =
      Math.round(
        calculateDistance(fromWp.position.x, fromWp.position.y, toWp.position.x, toWp.position.y) * 10
      ) / 10;

    const c = constraints[i] || {};
    legs.push({
      fromFix: fromName,
      toFix: toName,
      courseDeg: courseDeg === 0 ? 360 : courseDeg,
      distanceNM,
      altitudeConstraint: c.altitudeConstraint,
      minAltitudeFt: c.minAltitudeFt,
      maxAltitudeFt: c.maxAltitudeFt,
      speedLimitKt: c.speedLimitKt,
    });
  }
  return legs;
}

export function attachProceduresToAirport(airport: Airport): Airport {
  const pkg = AIRPORT_PROCEDURAL_PACKAGES[airport.icao];
  if (!pkg) return airport;

  const mergedWaypoints: Waypoint[] = airport.waypoints.map(wp => {
    const override = pkg.waypointOverrides?.[wp.name];
    return override ? { ...wp, ...override } : { ...wp };
  });

  const existingNames = new Set(mergedWaypoints.map(w => w.name));
  for (const extra of pkg.extraWaypoints) {
    if (!existingNames.has(extra.name)) {
      mergedWaypoints.push({ ...extra });
      existingNames.add(extra.name);
    }
  }

  const byName = new Map(mergedWaypoints.map(w => [w.name, w]));

  const approachRoutes: PublishedProcedureRoute[] = pkg.stars.map(spec => ({
    id: spec.id,
    name: spec.name,
    type: 'STAR',
    description: spec.description,
    runwayIds: [...spec.runwayIds],
    waypointNames: [...spec.waypointNames],
    legs: buildProcedureLegs(spec.waypointNames, spec.legConstraints, byName),
    initialAltitudeFt: spec.initialAltitudeFt,
    finalAltitudeFt: spec.finalAltitudeFt,
    maxSpeedKt: spec.maxSpeedKt,
  }));

  const departureRoutes: PublishedProcedureRoute[] = pkg.sids.map(spec => ({
    id: spec.id,
    name: spec.name,
    type: 'SID',
    description: spec.description,
    runwayIds: [...spec.runwayIds],
    waypointNames: [...spec.waypointNames],
    legs: buildProcedureLegs(spec.waypointNames, spec.legConstraints, byName),
    initialAltitudeFt: spec.initialAltitudeFt,
    finalAltitudeFt: spec.finalAltitudeFt,
    maxSpeedKt: spec.maxSpeedKt,
  }));

  return {
    ...airport,
    waypoints: mergedWaypoints,
    approachRoutes,
    departureRoutes,
    tmaBoundary: {
      ...pkg.tmaBoundary,
      polygon: pkg.tmaBoundary.polygon.map(pt => ({ ...pt })),
    },
  };
}

export function computeDefaultAirportVisibility(airport: Airport): AirportNavVisibility {
  return {
    visibleStarIds: (airport.approachRoutes || []).map(r => r.id),
    visibleSidIds: (airport.departureRoutes || []).map(r => r.id),
    visibleWaypoints: airport.waypoints.map(w => w.name),
  };
}

export function computeRunwayMatchedVisibility(
  airport: Airport,
  landingRunwayId: string,
  departureRunwayId: string
): AirportNavVisibility {
  const matchingStars = (airport.approachRoutes || []).filter(r =>
    r.runwayIds.includes(landingRunwayId)
  );
  const matchingSids = (airport.departureRoutes || []).filter(r =>
    r.runwayIds.includes(departureRunwayId)
  );

  const fixSet = new Set<string>();
  for (const star of matchingStars) {
    for (const wpName of star.waypointNames) fixSet.add(wpName);
  }
  for (const sid of matchingSids) {
    for (const wpName of sid.waypointNames) fixSet.add(wpName);
  }
  // Keep VOR center station & holding fixes on matching corridors visible
  for (const wp of airport.waypoints) {
    if (wp.role === 'VOR') fixSet.add(wp.name);
  }

  return {
    visibleStarIds: matchingStars.map(r => r.id),
    visibleSidIds: matchingSids.map(r => r.id),
    visibleWaypoints: airport.waypoints.filter(w => fixSet.has(w.name)).map(w => w.name),
  };
}
