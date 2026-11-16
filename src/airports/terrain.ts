/**
 * SKYCONTROL - Topographical Terrain, Elevation Contours & Water Database
 * Coordinates are defined in Nautical Miles (NM) relative to each airport center.
 * Rendered as low-luminance CRT radar topographical overlays (waterways, hills,
 * mountain contours, peaks, and prominent obstacles) across 0–140 NM zoom ranges.
 */

import { Airport, TerrainFeature } from '../types';

const EGLL_TERRAIN: TerrainFeature[] = [
  // River Thames winding West-East just South of Heathrow runways & through London
  {
    id: 'egll_thames',
    kind: 'river',
    label: 'RIVER THAMES',
    points: [
      { x: -38, y: 12 },
      { x: -24, y: 6.5 },
      { x: -14, y: 1.5 },
      { x: -7.5, y: -1.8 },
      { x: -3.2, y: -2.4 },
      { x: -0.5, y: -4.8 },
      { x: 3.5, y: -4.2 },
      { x: 7.5, y: -1.2 },
      { x: 12, y: 0.8 },
      { x: 18, y: 1.9 },
      { x: 26, y: 0.8 },
      { x: 38, y: 0.2 },
      { x: 54, y: 1.4 },
    ],
  },
  // King George VI & Queen Mother Reservoirs adjacent West/SW of field
  {
    id: 'egll_reservoirs',
    kind: 'water',
    label: 'STAINES RES',
    closed: true,
    points: [
      { x: -4.6, y: -0.9 },
      { x: -2.4, y: -0.9 },
      { x: -2.2, y: -2.2 },
      { x: -4.4, y: -2.3 },
    ],
  },
  // Chiltern Hills Escalation NW (~600–850 ft AMSL)
  {
    id: 'egll_chilterns_600',
    kind: 'contour',
    elevationFt: 600,
    label: "600'",
    closed: true,
    points: [
      { x: -46, y: 18 },
      { x: -34, y: 27 },
      { x: -18, y: 31 },
      { x: -6, y: 26 },
      { x: -10, y: 15 },
      { x: -26, y: 10 },
      { x: -42, y: 11 },
    ],
  },
  {
    id: 'egll_chilterns_850',
    kind: 'contour',
    elevationFt: 850,
    label: "850'",
    closed: true,
    points: [
      { x: -36, y: 20 },
      { x: -24, y: 26 },
      { x: -14, y: 23 },
      { x: -18, y: 16 },
      { x: -31, y: 15 },
    ],
  },
  // North Downs Ridge South/SE (~750–880 ft AMSL)
  {
    id: 'egll_north_downs',
    kind: 'contour',
    elevationFt: 750,
    label: "750'",
    closed: true,
    points: [
      { x: -32, y: -18 },
      { x: -12, y: -15 },
      { x: 8, y: -13 },
      { x: 30, y: -18 },
      { x: 38, y: -28 },
      { x: 10, y: -30 },
      { x: -24, y: -26 },
    ],
  },
  {
    id: 'egll_leith_hill',
    kind: 'peak',
    label: "LEITH HILL 965'",
    elevationFt: 965,
    points: [{ x: 3.8, y: -17.5 }],
  },
  {
    id: 'egll_shard_obst',
    kind: 'obstacle',
    label: "CITY TWR 1016'",
    elevationFt: 1016,
    points: [{ x: 13.8, y: 2.1 }],
  },
];

const OIII_TERRAIN: TerrainFeature[] = [
  // Alborz Mountains Northern Wall (6,000 ft Contour)
  {
    id: 'oiii_alborz_6000',
    kind: 'contour',
    elevationFt: 6000,
    label: "6,000'",
    closed: true,
    points: [
      { x: -85, y: 12 },
      { x: -55, y: 10 },
      { x: -24, y: 7.5 },
      { x: -4, y: 6.2 },
      { x: 14, y: 6.5 },
      { x: 34, y: 9.0 },
      { x: 68, y: 14 },
      { x: 92, y: 28 },
      { x: 88, y: 62 },
      { x: -88, y: 58 },
    ],
  },
  // Alborz High Ridge (8,500 ft Contour)
  {
    id: 'oiii_alborz_8500',
    kind: 'contour',
    elevationFt: 8500,
    label: "8,500'",
    closed: true,
    points: [
      { x: -64, y: 17 },
      { x: -30, y: 13 },
      { x: -8, y: 9.5 },
      { x: 10, y: 9.2 },
      { x: 28, y: 13 },
      { x: 60, y: 20 },
      { x: 64, y: 46 },
      { x: -66, y: 45 },
    ],
  },
  // Alborz Alpine Core (11,000 ft Contour)
  {
    id: 'oiii_alborz_11000',
    kind: 'contour',
    elevationFt: 11000,
    label: "11,000'",
    closed: true,
    points: [
      { x: -28, y: 19 },
      { x: -6, y: 12.2 },
      { x: 12, y: 12.0 },
      { x: 34, y: 19 },
      { x: 44, y: 34 },
      { x: -32, y: 35 },
    ],
  },
  // Southern Bibi Shahrbanoo / Foothill Ridge SE of field
  {
    id: 'oiii_se_ridge',
    kind: 'contour',
    elevationFt: 5400,
    label: "5,400'",
    closed: true,
    points: [
      { x: 7, y: -4.5 },
      { x: 15, y: -5.2 },
      { x: 19, y: -10.5 },
      { x: 11, y: -11.5 },
    ],
  },
  // Chitgar Lake NW
  {
    id: 'oiii_chitgar_lake',
    kind: 'water',
    label: 'CHITGAR LAKE',
    closed: true,
    points: [
      { x: -7.6, y: 4.9 },
      { x: -5.9, y: 5.1 },
      { x: -5.8, y: 3.9 },
      { x: -7.4, y: 3.8 },
    ],
  },
  // Karaj River Corridor West
  {
    id: 'oiii_karaj_river',
    kind: 'river',
    label: 'KARAJ RIVER',
    points: [
      { x: -19, y: 24 },
      { x: -16, y: 11 },
      { x: -14.5, y: 2 },
      { x: -17, y: -12 },
      { x: -22, y: -26 },
    ],
  },
  // Prominent Peaks & Obstacles
  {
    id: 'oiii_tochal_peak',
    kind: 'peak',
    label: "TOCHAL 13,005'",
    elevationFt: 13005,
    points: [{ x: 6.2, y: 11.4 }],
  },
  {
    id: 'oiii_damavand_peak',
    kind: 'peak',
    label: "DAMAVAND 18,406'",
    elevationFt: 18406,
    points: [{ x: 37.5, y: 26.5 }],
  },
  {
    id: 'oiii_milad_tower',
    kind: 'obstacle',
    label: "MILAD TWR 5,870'",
    elevationFt: 5870,
    points: [{ x: 3.6, y: 3.6 }],
  },
];

const KJFK_TERRAIN: TerrainFeature[] = [
  // Atlantic Ocean & Jamaica Bay South/SE
  {
    id: 'kjfk_atlantic_ocean',
    kind: 'water',
    label: 'ATLANTIC OCEAN',
    closed: true,
    points: [
      { x: -85, y: -6.5 },
      { x: -18, y: -5.5 },
      { x: -4.5, y: -2.2 },
      { x: 4.5, y: -2.0 },
      { x: 25, y: 3.5 },
      { x: 85, y: 14 },
      { x: 95, y: -75 },
      { x: -85, y: -75 },
    ],
  },
  // Rockaway Peninsula Barrier Island Spit
  {
    id: 'kjfk_rockaway_coast',
    kind: 'coastline',
    label: 'ROCKAWAY PENINSULA',
    points: [
      { x: -9.5, y: -4.8 },
      { x: -2.8, y: -3.2 },
      { x: 4.8, y: -1.9 },
      { x: 16, y: 0.4 },
    ],
  },
  // Hudson River & Manhattan Corridor
  {
    id: 'kjfk_hudson_river',
    kind: 'river',
    label: 'HUDSON / EAST R',
    points: [
      { x: -13.5, y: -4.5 },
      { x: -11.5, y: 1.5 },
      { x: -10.8, y: 11.0 },
      { x: -9.5, y: 26.0 },
      { x: -7.5, y: 48.0 },
    ],
  },
  // Long Island Sound North Coast
  {
    id: 'kjfk_li_sound',
    kind: 'water',
    label: 'LONG ISLAND SOUND',
    closed: true,
    points: [
      { x: -4, y: 12 },
      { x: 15, y: 17 },
      { x: 55, y: 26 },
      { x: 80, y: 45 },
      { x: -25, y: 45 },
      { x: -12, y: 20 },
    ],
  },
  // Watchung / Hudson Palisades Ridges NW (~650–900 ft)
  {
    id: 'kjfk_nj_ridge',
    kind: 'contour',
    elevationFt: 750,
    label: "750'",
    closed: true,
    points: [
      { x: -48, y: 8 },
      { x: -34, y: 22 },
      { x: -18, y: 28 },
      { x: -14, y: 14 },
      { x: -28, y: 4 },
    ],
  },
  {
    id: 'kjfk_owtc_obst',
    kind: 'obstacle',
    label: "1 WTC 1,776'",
    elevationFt: 1776,
    points: [{ x: -11.2, y: 4.1 }],
  },
];

const TRN1_TERRAIN: TerrainFeature[] = [
  // North Alpine Massif (5,800 ft & 7,900 ft contours)
  {
    id: 'trn1_north_5800',
    kind: 'contour',
    elevationFt: 5800,
    label: "5,800'",
    closed: true,
    points: [
      { x: -65, y: 20 },
      { x: -22, y: 13 },
      { x: 12, y: 14 },
      { x: 48, y: 21 },
      { x: 55, y: 52 },
      { x: -68, y: 50 },
    ],
  },
  {
    id: 'trn1_north_7900',
    kind: 'contour',
    elevationFt: 7900,
    label: "7,900'",
    closed: true,
    points: [
      { x: -34, y: 26 },
      { x: -8, y: 21 },
      { x: 20, y: 22 },
      { x: 30, y: 38 },
      { x: -36, y: 40 },
    ],
  },
  // South Ridge Flanking Valley
  {
    id: 'trn1_south_4200',
    kind: 'contour',
    elevationFt: 4200,
    label: "4,200'",
    closed: true,
    points: [
      { x: -50, y: -19 },
      { x: -15, y: -15 },
      { x: 24, y: -17 },
      { x: 52, y: -25 },
      { x: 40, y: -48 },
      { x: -48, y: -45 },
    ],
  },
  // Alpine Valley River W-E
  {
    id: 'trn1_valley_river',
    kind: 'river',
    label: 'INN VALLEY RIVER',
    points: [
      { x: -60, y: -3.2 },
      { x: -28, y: -2.0 },
      { x: -8, y: -3.6 },
      { x: 8, y: -2.5 },
      { x: 28, y: 1.5 },
      { x: 58, y: 4.5 },
    ],
  },
  {
    id: 'trn1_north_peak',
    kind: 'peak',
    label: "NORDKETTE 8,640'",
    elevationFt: 8640,
    points: [{ x: 3.5, y: 25.0 }],
  },
  {
    id: 'trn1_south_peak',
    kind: 'peak',
    label: "PATSCHER 5,120'",
    elevationFt: 5120,
    points: [{ x: 8.5, y: -22.5 }],
  },
];

const TRN2_TERRAIN: TerrainFeature[] = [
  // Confluence Delta River System
  {
    id: 'trn2_delta_west',
    kind: 'river',
    label: 'DELTA RIVER W',
    points: [
      { x: -55, y: 14 },
      { x: -24, y: 6.5 },
      { x: -8, y: -2.5 },
      { x: 2, y: -11 },
      { x: 12, y: -32 },
    ],
  },
  {
    id: 'trn2_delta_east',
    kind: 'river',
    label: 'DELTA RIVER E',
    points: [
      { x: 44, y: 18 },
      { x: 18, y: 5.5 },
      { x: 6, y: -3.5 },
      { x: 2, y: -11 },
    ],
  },
  // Delta Estuary Basin South
  {
    id: 'trn2_basin_water',
    kind: 'water',
    label: 'DELTA BAY',
    closed: true,
    points: [
      { x: -12, y: -26 },
      { x: 18, y: -24 },
      { x: 30, y: -58 },
      { x: -28, y: -58 },
    ],
  },
  // Eastern Plateau Escarpment (3,400 ft / 4,900 ft)
  {
    id: 'trn2_east_3400',
    kind: 'contour',
    elevationFt: 3400,
    label: "3,400'",
    closed: true,
    points: [
      { x: 16, y: 28 },
      { x: 38, y: 22 },
      { x: 52, y: -6 },
      { x: 30, y: -16 },
      { x: 15, y: -2 },
    ],
  },
  {
    id: 'trn2_west_3800',
    kind: 'contour',
    elevationFt: 3800,
    label: "3,800'",
    closed: true,
    points: [
      { x: -45, y: 26 },
      { x: -19, y: 19 },
      { x: -15, y: -12 },
      { x: -42, y: -20 },
    ],
  },
  {
    id: 'trn2_east_peak',
    kind: 'peak',
    label: "ECHO CREST 5,450'",
    elevationFt: 5450,
    points: [{ x: 27.5, y: 7.5 }],
  },
];

const TERRAIN_BY_ICAO: Record<string, TerrainFeature[]> = {
  EGLL: EGLL_TERRAIN,
  OIII: OIII_TERRAIN,
  KJFK: KJFK_TERRAIN,
  TRN1: TRN1_TERRAIN,
  TRN2: TRN2_TERRAIN,
};

export function attachTerrainToAirport(airport: Airport): Airport {
  const terrainFeatures = TERRAIN_BY_ICAO[airport.icao] || [];
  return {
    ...airport,
    terrainFeatures,
  };
}
