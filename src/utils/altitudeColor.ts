/**
 * SKYCONTROL - Continuous Altitude Color Spectrum for Radar Flight Paths
 * Provides continuous RGB interpolation between key altitude stops:
 * - 12,000+ ft: Electric Cyan (0, 229, 255)
 * - 8,500 ft: Emerald Green (0, 255, 102)
 * - 5,500 ft: Amber Gold (255, 209, 102)
 * - 3,000 ft: Orange (255, 146, 51)
 * - 500 ft: Coral Red (255, 77, 109)
 */

export interface AltitudeBand {
  minFt: number;
  maxFt: number;
  hex: string;
  rgb: string;
  label: string;
  description: string;
}

export const ALTITUDE_BANDS: AltitudeBand[] = [
  { minFt: 10000, maxFt: 99999, hex: '#00e5ff', rgb: '0, 229, 255', label: 'FL100+', description: 'TMA Entry / Cruise' },
  { minFt: 7000, maxFt: 10000, hex: '#00ff66', rgb: '0, 255, 102', label: '7,000 - 10,000 ft', description: 'Upper Sector Descent' },
  { minFt: 4500, maxFt: 7000, hex: '#ffd166', rgb: '255, 209, 102', label: '4,500 - 7,000 ft', description: 'Intermediate Approach' },
  { minFt: 2500, maxFt: 4500, hex: '#ff9233', rgb: '255, 146, 51', label: '2,500 - 4,500 ft', description: 'LOC / Intercept Vector' },
  { minFt: 0, maxFt: 2500, hex: '#ff4d6d', rgb: '255, 77, 109', label: '< 2,500 ft', description: 'Glideslope / Final Land' },
];

interface ColorStop {
  alt: number;
  r: number;
  g: number;
  b: number;
}

const COLOR_STOPS_DARK: ColorStop[] = [
  { alt: 12000, r: 0, g: 229, b: 255 },  // Electric Cyan
  { alt: 8500,  r: 0, g: 255, b: 102 },  // Emerald Green
  { alt: 5500,  r: 255, g: 209, b: 102 }, // Amber Gold
  { alt: 3000,  r: 255, g: 146, b: 51 },  // Radiant Orange
  { alt: 500,   r: 255, g: 77, b: 109 },  // Coral Red
];

const COLOR_STOPS_LIGHT: ColorStop[] = [
  { alt: 12000, r: 3, g: 105, b: 161 },   // Deep Sky Blue
  { alt: 8500,  r: 4, g: 120, b: 87 },    // Deep Emerald Ink
  { alt: 5500,  r: 161, g: 98, b: 7 },    // Burnished Amber Ink
  { alt: 3000,  r: 194, g: 65, b: 12 },   // Deep Orange Ink
  { alt: 500,   r: 190, g: 18, b: 60 },   // Crimson Ink
];

export function getContinuousAltitudeRgbComponents(
  altitudeFt: number,
  isLight: boolean = false
): { r: number; g: number; b: number } {
  const stops = isLight ? COLOR_STOPS_LIGHT : COLOR_STOPS_DARK;
  if (altitudeFt >= stops[0].alt) {
    return stops[0];
  }
  if (altitudeFt <= stops[stops.length - 1].alt) {
    return stops[stops.length - 1];
  }

  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    if (altitudeFt <= s1.alt && altitudeFt >= s2.alt) {
      const factor = (altitudeFt - s2.alt) / (s1.alt - s2.alt);
      return {
        r: Math.round(s2.r + factor * (s1.r - s2.r)),
        g: Math.round(s2.g + factor * (s1.g - s2.g)),
        b: Math.round(s2.b + factor * (s1.b - s2.b)),
      };
    }
  }

  return stops[0];
}

export function getAltitudeColor(altitudeFt: number, isLight: boolean = false): string {
  const { r, g, b } = getContinuousAltitudeRgbComponents(altitudeFt, isLight);
  return `rgb(${r}, ${g}, ${b})`;
}

export function getAltitudeRgba(
  altitudeFt: number,
  alpha: number,
  isLight: boolean = false
): string {
  const { r, g, b } = getContinuousAltitudeRgbComponents(altitudeFt, isLight);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
