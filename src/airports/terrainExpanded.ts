/**
 * SKYCONTROL - Topographical Terrain Database for Expanded Airports
 * Authentic coastlines, bays, rivers, desert basins, mountain contours, peaks & obstacles.
 */

import { TerrainFeature } from '../types';

export const EXPANDED_TERRAIN_BY_ICAO: Record<string, TerrainFeature[]> = {
  // OIIE – Tehran Imam Khomeini (Southern Plain, Hoz-e Soltan Salt Basin & Distant Alborz)
  OIIE: [
    {
      id: 'oiie_salt_lake',
      kind: 'water',
      label: 'HOZ-E SOLTAN',
      closed: true,
      points: [
        { x: 6, y: -22 },
        { x: 24, y: -24 },
        { x: 28, y: -36 },
        { x: 10, y: -38 },
        { x: 2, y: -30 },
      ],
    },
    {
      id: 'oiie_rudshur',
      kind: 'river',
      label: 'RUD-E SHUR',
      points: [
        { x: -50, y: 18 },
        { x: -28, y: 9 },
        { x: -12, y: 2 },
        { x: 5, y: -8 },
        { x: 18, y: -21 },
      ],
    },
    {
      id: 'oiie_alborz_north',
      kind: 'contour',
      elevationFt: 7500,
      label: "7,500'",
      closed: true,
      points: [
        { x: -70, y: 34 },
        { x: -20, y: 28 },
        { x: 35, y: 31 },
        { x: 75, y: 40 },
        { x: 75, y: 65 },
        { x: -70, y: 65 },
      ],
    },
    {
      id: 'oiie_hasanabad_5200',
      kind: 'contour',
      elevationFt: 5200,
      label: "5,200'",
      closed: true,
      points: [
        { x: -42, y: -12 },
        { x: -20, y: -10 },
        { x: -12, y: -22 },
        { x: -34, y: -28 },
      ],
    },
    {
      id: 'oiie_qom_peak',
      kind: 'peak',
      label: "KAVIR RIDGE 6,420'",
      elevationFt: 6420,
      points: [{ x: -26, y: -19 }],
    },
  ],

  // OISS – Shiraz Shahid Dastghaib (Zagros Valley & Lake Maharlu)
  OISS: [
    {
      id: 'oiss_maharlu',
      kind: 'water',
      label: 'LAKE MAHARLU',
      closed: true,
      points: [
        { x: 9, y: -5 },
        { x: 24, y: -12 },
        { x: 29, y: -24 },
        { x: 15, y: -22 },
        { x: 7, y: -11 },
      ],
    },
    {
      id: 'oiss_zagros_north',
      kind: 'contour',
      elevationFt: 7500,
      label: "7,500'",
      closed: true,
      points: [
        { x: -68, y: 14 },
        { x: -26, y: 7 },
        { x: 18, y: 8 },
        { x: 58, y: 15 },
        { x: 64, y: 48 },
        { x: -64, y: 48 },
      ],
    },
    {
      id: 'oiss_zagros_9200',
      kind: 'contour',
      elevationFt: 9200,
      label: "9,200'",
      closed: true,
      points: [
        { x: -44, y: 20 },
        { x: -12, y: 13 },
        { x: 24, y: 15 },
        { x: 42, y: 29 },
        { x: -38, y: 34 },
      ],
    },
    {
      id: 'oiss_south_ridge',
      kind: 'contour',
      elevationFt: 7200,
      label: "7,200'",
      closed: true,
      points: [
        { x: -55, y: -12 },
        { x: -18, y: -9 },
        { x: -8, y: -24 },
        { x: -46, y: -32 },
      ],
    },
    {
      id: 'oiss_babakuh_peak',
      kind: 'peak',
      label: "BABA KUH 8,950'",
      elevationFt: 8950,
      points: [{ x: -4.5, y: 10.5 }],
    },
  ],

  // OMDB – Dubai International (Arabian Gulf Coastline, Dubai Creek, Burj Khalifa, Hajar Foothills)
  OMDB: [
    {
      id: 'omdb_gulf_coast',
      kind: 'coastline',
      label: 'ARABIAN GULF',
      points: [
        { x: -65, y: -22 },
        { x: -36, y: -10 },
        { x: -18, y: -2 },
        { x: -7, y: 2.5 },
        { x: 2, y: 7.5 },
        { x: 16, y: 18 },
        { x: 42, y: 38 },
      ],
    },
    {
      id: 'omdb_palm_jumeirah',
      kind: 'water',
      label: 'GULF WATERS',
      closed: true,
      points: [
        { x: -65, y: 60 },
        { x: 45, y: 60 },
        { x: 40, y: 36 },
        { x: 2, y: 7.5 },
        { x: -18, y: -2 },
        { x: -65, y: -22 },
      ],
    },
    {
      id: 'omdb_creek',
      kind: 'river',
      label: 'DUBAI CREEK',
      points: [
        { x: -4.2, y: 1.5 },
        { x: -2.6, y: -0.2 },
        { x: -2.2, y: -2.8 },
        { x: -4.8, y: -6.0 },
      ],
    },
    {
      id: 'omdb_hajar_2500',
      kind: 'contour',
      elevationFt: 2500,
      label: "2,500'",
      closed: true,
      points: [
        { x: 26, y: -8 },
        { x: 58, y: -4 },
        { x: 64, y: -38 },
        { x: 28, y: -34 },
      ],
    },
    {
      id: 'omdb_burj_khalifa',
      kind: 'obstacle',
      label: "BURJ 2,722'",
      elevationFt: 2722,
      points: [{ x: -5.8, y: -3.2 }],
    },
  ],

  // LFPG – Paris Charles de Gaulle (Seine/Marne Rivers & Montmorency Contours)
  LFPG: [
    {
      id: 'lfpg_seine',
      kind: 'river',
      label: 'RIVER SEINE',
      points: [
        { x: -52, y: 14 },
        { x: -32, y: -2 },
        { x: -16, y: -9.5 },
        { x: -7, y: -12.0 },
        { x: 4, y: -16.5 },
        { x: 22, y: -28 },
      ],
    },
    {
      id: 'lfpg_marne',
      kind: 'river',
      label: 'RIVER MARNE',
      points: [
        { x: -6, y: -12 },
        { x: 8, y: -9 },
        { x: 24, y: -6.5 },
        { x: 48, y: -5 },
      ],
    },
    {
      id: 'lfpg_forest_contour',
      kind: 'contour',
      elevationFt: 720,
      label: "720'",
      closed: true,
      points: [
        { x: -26, y: 12 },
        { x: 4, y: 18 },
        { x: 22, y: 10 },
        { x: 6, y: 5 },
        { x: -22, y: 4 },
      ],
    },
    {
      id: 'lfpg_eiffel',
      kind: 'obstacle',
      label: "PARIS TWR 1,083'",
      elevationFt: 1083,
      points: [{ x: -12.8, y: -10.8 }],
    },
  ],

  // EHAM – Amsterdam Schiphol (North Sea Coast, Markermeer/IJmeer, Canal)
  EHAM: [
    {
      id: 'eham_north_sea',
      kind: 'coastline',
      label: 'NORTH SEA',
      points: [
        { x: -28, y: -55 },
        { x: -15, y: -25 },
        { x: -8.5, y: 0 },
        { x: -6.2, y: 22 },
        { x: -1.5, y: 55 },
      ],
    },
    {
      id: 'eham_ijmeer',
      kind: 'water',
      label: 'MARKERMEER',
      closed: true,
      points: [
        { x: 8.5, y: 2.0 },
        { x: 34, y: 8.0 },
        { x: 38, y: 34 },
        { x: 14, y: 32 },
        { x: 6.5, y: 11 },
      ],
    },
    {
      id: 'eham_kanaal',
      kind: 'river',
      label: 'NOORDZEEKANAAL',
      points: [
        { x: -7.5, y: 8.2 },
        { x: -1.5, y: 6.5 },
        { x: 8.5, y: 2.8 },
      ],
    },
  ],

  // EDDF – Frankfurt am Main (Main/Rhine Rivers & Taunus Mountain Ridge)
  EDDF: [
    {
      id: 'eddf_main',
      kind: 'river',
      label: 'RIVER MAIN',
      points: [
        { x: -22, y: -4.5 },
        { x: -9, y: 1.5 },
        { x: 4, y: 4.0 },
        { x: 18, y: 2.5 },
        { x: 42, y: -6.0 },
      ],
    },
    {
      id: 'eddf_rhine',
      kind: 'river',
      label: 'RIVER RHINE',
      points: [
        { x: -18, y: -45 },
        { x: -16, y: -18 },
        { x: -22, y: -4.5 },
        { x: -38, y: 12 },
      ],
    },
    {
      id: 'eddf_taunus_2100',
      kind: 'contour',
      elevationFt: 2100,
      label: "2,100'",
      closed: true,
      points: [
        { x: -36, y: 14 },
        { x: -8, y: 19 },
        { x: 14, y: 17 },
        { x: 6, y: 9 },
        { x: -28, y: 8 },
      ],
    },
    {
      id: 'eddf_feldberg_peak',
      kind: 'peak',
      label: "FELDBERG 2,887'",
      elevationFt: 2887,
      points: [{ x: -6.5, y: 13.5 }],
    },
  ],

  // LSZH – Zurich Kloten (Lake Zurich, Alpine Foothills & Uetliberg Peak)
  LSZH: [
    {
      id: 'lszh_lake_zurich',
      kind: 'water',
      label: 'LAKE ZURICH',
      closed: true,
      points: [
        { x: -1.5, y: -7.2 },
        { x: 2.2, y: -9.5 },
        { x: 12.5, y: -17.5 },
        { x: 10.2, y: -19.5 },
        { x: -0.2, y: -11.5 },
      ],
    },
    {
      id: 'lszh_rhine_north',
      kind: 'river',
      label: 'HIGH RHINE',
      points: [
        { x: -42, y: 12 },
        { x: -15, y: 9 },
        { x: 6, y: 12 },
        { x: 35, y: 16 },
      ],
    },
    {
      id: 'lszh_prealps_4500',
      kind: 'contour',
      elevationFt: 4500,
      label: "4,500'",
      closed: true,
      points: [
        { x: -50, y: -22 },
        { x: -14, y: -16 },
        { x: 22, y: -14 },
        { x: 52, y: -20 },
        { x: 52, y: -52 },
        { x: -50, y: -52 },
      ],
    },
    {
      id: 'lszh_rigi_peak',
      kind: 'peak',
      label: "RIGI ALP 5,899'",
      elevationFt: 5899,
      points: [{ x: -3.2, y: -24.5 }],
    },
  ],

  // KORD – Chicago O'Hare (Lake Michigan Shoreline, Des Plaines River & Sears/Willis Tower)
  KORD: [
    {
      id: 'kord_lake_michigan_coast',
      kind: 'coastline',
      label: 'LAKE MICHIGAN',
      points: [
        { x: 10, y: 55 },
        { x: 10.5, y: 24 },
        { x: 13.0, y: 4 },
        { x: 16.5, y: -12 },
        { x: 24.0, y: -32 },
        { x: 38.0, y: -50 },
      ],
    },
    {
      id: 'kord_lake_water',
      kind: 'water',
      label: 'LAKE MICHIGAN',
      closed: true,
      points: [
        { x: 10, y: 55 },
        { x: 70, y: 55 },
        { x: 70, y: -50 },
        { x: 38, y: -50 },
        { x: 16.5, y: -12 },
        { x: 13.0, y: 4 },
        { x: 10.5, y: 24 },
      ],
    },
    {
      id: 'kord_des_plaines',
      kind: 'river',
      label: 'DES PLAINES R.',
      points: [
        { x: 2.5, y: 38 },
        { x: 2.2, y: 10 },
        { x: 2.8, y: -8 },
        { x: -8.0, y: -26 },
      ],
    },
    {
      id: 'kord_willis_tower',
      kind: 'obstacle',
      label: "WILLIS 1,729'",
      elevationFt: 1729,
      points: [{ x: 12.2, y: -6.2 }],
    },
  ],

  // KSFO – San Francisco Intl (SF Bay Surrounding Runways, Pacific Coast & Peninsula Hills)
  KSFO: [
    {
      id: 'ksfo_bay',
      kind: 'water',
      label: 'SAN FRANCISCO BAY',
      closed: true,
      points: [
        { x: -1.5, y: 14 },
        { x: 8.5, y: 12 },
        { x: 15.0, y: -8 },
        { x: 11.0, y: -18 },
        { x: 2.5, y: -9 },
        { x: 0.4, y: 0.6 },
        { x: -2.0, y: 6.0 },
      ],
    },
    {
      id: 'ksfo_pacific_coast',
      kind: 'coastline',
      label: 'PACIFIC COAST',
      points: [
        { x: -12, y: 48 },
        { x: -7.8, y: 12 },
        { x: -6.4, y: 0 },
        { x: -4.2, y: -16 },
        { x: 4.0, y: -42 },
      ],
    },
    {
      id: 'ksfo_peninsula_1800',
      kind: 'contour',
      elevationFt: 1800,
      label: "1,800'",
      closed: true,
      points: [
        { x: -5.5, y: 4.0 },
        { x: -2.2, y: 1.5 },
        { x: -1.8, y: -12.0 },
        { x: -4.5, y: -10.0 },
      ],
    },
    {
      id: 'ksfo_diablo_peak',
      kind: 'peak',
      label: "MT DIABLO 3,849'",
      elevationFt: 3849,
      points: [{ x: 22.0, y: 11.0 }],
    },
    {
      id: 'ksfo_sutro_tower',
      kind: 'obstacle',
      label: "SUTRO 1,811'",
      elevationFt: 1811,
      points: [{ x: -3.5, y: 7.2 }],
    },
  ],

  // RJTT – Tokyo Haneda (Tokyo Bay Coast, Chiba Peninsula, Western Highlands & Mt Fuji)
  RJTT: [
    {
      id: 'rjtt_bay_coast',
      kind: 'coastline',
      label: 'TOKYO BAY',
      points: [
        { x: -14, y: -38 },
        { x: -6, y: -12 },
        { x: -0.5, y: 0.5 },
        { x: 3.5, y: 11 },
        { x: 16, y: 15 },
        { x: 22, y: -4 },
        { x: 14, y: -28 },
      ],
    },
    {
      id: 'rjtt_bay_water',
      kind: 'water',
      label: 'TOKYO BAY',
      closed: true,
      points: [
        { x: 0.0, y: 0.0 },
        { x: 3.5, y: 10 },
        { x: 15, y: 12 },
        { x: 19, y: -5 },
        { x: 10, y: -24 },
        { x: -4, y: -12 },
      ],
    },
    {
      id: 'rjtt_tama_river',
      kind: 'river',
      label: 'TAMA RIVER',
      points: [
        { x: -38, y: 16 },
        { x: -18, y: 6 },
        { x: -5, y: 0.5 },
        { x: -0.5, y: -0.6 },
      ],
    },
    {
      id: 'rjtt_tanzawa_4200',
      kind: 'contour',
      elevationFt: 4200,
      label: "4,200'",
      closed: true,
      points: [
        { x: -58, y: 8 },
        { x: -28, y: 2 },
        { x: -24, y: -18 },
        { x: -54, y: -24 },
      ],
    },
    {
      id: 'rjtt_mt_fuji',
      kind: 'peak',
      label: "MT FUJI 12,389'",
      elevationFt: 12389,
      points: [{ x: -48.0, y: -11.5 }],
    },
  ],

  // EGJJ – Jersey Channel Islands (Island Coastline, English Channel & Reefs)
  EGJJ: [
    {
      id: 'egjj_jersey_island',
      kind: 'coastline',
      label: 'JERSEY COAST',
      points: [
        { x: -3.2, y: 1.8 },
        { x: 1.5, y: 2.2 },
        { x: 5.0, y: 1.0 },
        { x: 4.5, y: -1.8 },
        { x: -1.5, y: -1.4 },
        { x: -3.5, y: -0.6 },
        { x: -3.2, y: 1.8 },
      ],
    },
    {
      id: 'egjj_guernsey',
      kind: 'coastline',
      label: 'GUERNSEY',
      points: [
        { x: -21, y: 15 },
        { x: -16, y: 16.5 },
        { x: -14, y: 13 },
        { x: -19, y: 11.5 },
        { x: -21, y: 15 },
      ],
    },
    {
      id: 'egjj_channel_water',
      kind: 'water',
      label: 'ENGLISH CHANNEL',
      closed: true,
      points: [
        { x: -18, y: -22 },
        { x: 6, y: -22 },
        { x: 12, y: -8 },
        { x: -12, y: -7 },
      ],
    },
    {
      id: 'egjj_cliffs_450',
      kind: 'contour',
      elevationFt: 450,
      label: "450'",
      closed: true,
      points: [
        { x: -2.0, y: 1.4 },
        { x: 3.4, y: 1.5 },
        { x: 3.0, y: 0.4 },
        { x: -1.8, y: 0.4 },
      ],
    },
  ],
};
