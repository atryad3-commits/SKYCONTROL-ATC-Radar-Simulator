/**
 * SKYCONTROL - Top-Down Vector Radar Aircraft Silhouettes
 * Renders crisp, heading-aligned, class-distinctive vector aircraft silhouettes
 * calibrated across radar zoom ranges:
 *   - HEAVY_QUAD: 4-engine widebody (e.g. A380, A388)
 *   - HEAVY_TWIN: 2-engine widebody (e.g. B77W, A350, B789, A333)
 *   - NARROWBODY: Single-aisle twin-jet (e.g. A320, B738, E190)
 *   - BIZJET: Aft-engine T-tail swept-wing executive jet (e.g. GLF5, C56X, LJ45)
 *   - TURBOPROP: Straight-wing twin turboprop with prop arcs (e.g. DH8D, AT76)
 *   - LIGHT_GA: Compact straight-wing single-engine piston prop (e.g. C172, SR22, PA28)
 */

import { RadarSilhouetteType } from '../types';
import { getAircraftPerformance } from '../engine/aircraftPerformance';

export interface SilhouetteDrawOptions {
  aircraftType: string;
  headingDeg: number;
  primaryColor: string;
  isSelected: boolean;
  isFreshHit: boolean;
  rangeNM: number;
}

export function getZoomCompensationFactor(rangeNM: number): number {
  if (rangeNM <= 10) return 1.18;
  if (rangeNM <= 25) return 1.06;
  if (rangeNM <= 50) return 0.96;
  if (rangeNM <= 90) return 0.86;
  return 0.78;
}

export function getSilhouetteFillColor(primaryColor: string, isSelected: boolean): string {
  if (primaryColor.startsWith('#') && (primaryColor.length === 7 || primaryColor.length === 4)) {
    const hex = primaryColor.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map(c => c + c)
            .join('')
        : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${isSelected ? 0.42 : 0.28})`;
    }
  }
  return primaryColor;
}

function drawSweptJetShape(
  ctx: CanvasRenderingContext2D,
  options: {
    noseY: number;
    tailY: number;
    bodyHalfW: number;
    wingRootLeadY: number;
    wingRootTrailY: number;
    wingSpanX: number;
    wingTipLeadY: number;
    wingTipTrailY: number;
    tailSpanX: number;
    tailLeadY: number;
    tailTipY: number;
    enginesX: number[];
    engineYOffset: (x: number) => number;
    engineLen: number;
    engineHalfW: number;
  }
): void {
  const {
    noseY,
    tailY,
    bodyHalfW,
    wingRootLeadY,
    wingRootTrailY,
    wingSpanX,
    wingTipLeadY,
    wingTipTrailY,
    tailSpanX,
    tailLeadY,
    tailTipY,
    enginesX,
    engineYOffset,
    engineLen,
    engineHalfW,
  } = options;

  // Unified airframe outline (nose -> right wing -> right tail -> tail -> left tail -> left wing -> nose)
  ctx.beginPath();
  ctx.moveTo(0, noseY);
  ctx.lineTo(bodyHalfW, noseY + 2.4);
  ctx.lineTo(bodyHalfW, wingRootLeadY);
  ctx.lineTo(wingSpanX, wingTipLeadY);
  ctx.lineTo(wingSpanX, wingTipTrailY);
  ctx.lineTo(bodyHalfW, wingRootTrailY);
  ctx.lineTo(bodyHalfW * 0.72, tailLeadY);
  ctx.lineTo(tailSpanX, tailTipY);
  ctx.lineTo(tailSpanX, tailTipY + 0.8);
  ctx.lineTo(bodyHalfW * 0.45, tailY - 0.6);
  ctx.lineTo(0, tailY);
  ctx.lineTo(-bodyHalfW * 0.45, tailY - 0.6);
  ctx.lineTo(-tailSpanX, tailTipY + 0.8);
  ctx.lineTo(-tailSpanX, tailTipY);
  ctx.lineTo(-bodyHalfW * 0.72, tailLeadY);
  ctx.lineTo(-bodyHalfW, wingRootTrailY);
  ctx.lineTo(-wingSpanX, wingTipTrailY);
  ctx.lineTo(-wingSpanX, wingTipLeadY);
  ctx.lineTo(-bodyHalfW, wingRootLeadY);
  ctx.lineTo(-bodyHalfW, noseY + 2.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Engine nacelles along wing/aft fuselage
  for (const ex of enginesX) {
    const ey = engineYOffset(Math.abs(ex));
    ctx.fillRect(ex - engineHalfW, ey, engineHalfW * 2, engineLen);
    ctx.strokeRect(ex - engineHalfW, ey, engineHalfW * 2, engineLen);
  }
}

function drawTurbopropShape(ctx: CanvasRenderingContext2D): void {
  // Fuselage + straight high-aspect wing + T-tail
  ctx.beginPath();
  ctx.moveTo(0, -8.8);
  ctx.lineTo(0.82, -6.2);
  ctx.lineTo(0.82, -1.7);
  ctx.lineTo(9.0, -1.1);
  ctx.lineTo(9.0, 0.45);
  ctx.lineTo(0.82, 0.8);
  ctx.lineTo(0.55, 7.0);
  ctx.lineTo(3.4, 7.3);
  ctx.lineTo(3.4, 8.2);
  ctx.lineTo(0, 8.4);
  ctx.lineTo(-3.4, 8.2);
  ctx.lineTo(-3.4, 7.3);
  ctx.lineTo(-0.55, 7.0);
  ctx.lineTo(-0.82, 0.8);
  ctx.lineTo(-9.0, 0.45);
  ctx.lineTo(-9.0, -1.1);
  ctx.lineTo(-0.82, -1.7);
  ctx.lineTo(-0.82, -6.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Twin wing-mounted turboprop nacelles & spinning prop disc ticks
  for (const sign of [-1, 1]) {
    const nx = sign * 3.4;
    ctx.fillRect(nx - 0.65, -3.5, 1.3, 3.3);
    ctx.strokeRect(nx - 0.65, -3.5, 1.3, 3.3);
    ctx.beginPath();
    ctx.moveTo(nx - 1.75, -3.9);
    ctx.lineTo(nx + 1.75, -3.9);
    ctx.stroke();
  }
}

function drawLightGAShape(ctx: CanvasRenderingContext2D): void {
  // Compact straight-wing single-engine piston silhouette
  ctx.beginPath();
  ctx.moveTo(0, -7.2);
  ctx.lineTo(1.0, -4.4);
  ctx.lineTo(1.0, -2.6);
  ctx.lineTo(8.4, -2.3);
  ctx.lineTo(8.4, 0.2);
  ctx.lineTo(0.95, 0.45);
  ctx.lineTo(0.5, 5.4);
  ctx.lineTo(3.0, 5.7);
  ctx.lineTo(3.0, 6.6);
  ctx.lineTo(0, 7.0);
  ctx.lineTo(-3.0, 6.6);
  ctx.lineTo(-3.0, 5.7);
  ctx.lineTo(-0.5, 5.4);
  ctx.lineTo(-0.95, 0.45);
  ctx.lineTo(-8.4, 0.2);
  ctx.lineTo(-8.4, -2.3);
  ctx.lineTo(-1.0, -2.6);
  ctx.lineTo(-1.0, -4.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Front single propeller disc bar + spinner
  ctx.beginPath();
  ctx.moveTo(-2.5, -7.8);
  ctx.lineTo(2.5, -7.8);
  ctx.moveTo(0, -7.2);
  ctx.lineTo(0, -8.4);
  ctx.stroke();
}

export function drawRadarAircraftSilhouette(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  options: SilhouetteDrawOptions
): void {
  const perf = getAircraftPerformance(options.aircraftType);
  const silhouette: RadarSilhouetteType = perf.radarSilhouette;
  const zoomComp = getZoomCompensationFactor(options.rangeNM);
  const selectedBoost = options.isSelected ? 1.12 : 1.0;
  const scale = perf.wingSpanScale * zoomComp * selectedBoost;

  ctx.save();
  ctx.translate(sx, sy);

  // Subtle selection reticle ring underneath rotated silhouette so heading & shape remain crisp
  if (options.isSelected) {
    const ringRadius = Math.max(11, 11.5 * perf.wingSpanScale * zoomComp);
    ctx.strokeStyle = 'rgba(0, 255, 102, 0.55)';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.rotate((options.headingDeg * Math.PI) / 180);
  ctx.scale(scale, scale);

  ctx.strokeStyle = options.primaryColor;
  ctx.fillStyle = getSilhouetteFillColor(options.primaryColor, options.isSelected);
  ctx.lineWidth = (options.isFreshHit || options.isSelected ? 1.55 : 1.25) / scale;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (silhouette === 'HEAVY_QUAD') {
    drawSweptJetShape(ctx, {
      noseY: -9.5,
      tailY: 9.2,
      bodyHalfW: 1.25,
      wingRootLeadY: -3.4,
      wingRootTrailY: 1.2,
      wingSpanX: 9.6,
      wingTipLeadY: 2.8,
      wingTipTrailY: 4.1,
      tailSpanX: 4.0,
      tailLeadY: 6.4,
      tailTipY: 8.6,
      enginesX: [-6.4, -3.5, 3.5, 6.4],
      engineYOffset: absX => (absX > 5 ? 0.5 : -1.3),
      engineLen: 2.1,
      engineHalfW: 0.5,
    });
  } else if (silhouette === 'HEAVY_TWIN') {
    drawSweptJetShape(ctx, {
      noseY: -9.4,
      tailY: 9.0,
      bodyHalfW: 1.05,
      wingRootLeadY: -2.9,
      wingRootTrailY: 0.9,
      wingSpanX: 9.2,
      wingTipLeadY: 2.9,
      wingTipTrailY: 4.0,
      tailSpanX: 3.6,
      tailLeadY: 6.4,
      tailTipY: 8.4,
      enginesX: [-3.7, 3.7],
      engineYOffset: () => -1.3,
      engineLen: 2.3,
      engineHalfW: 0.58,
    });
  } else if (silhouette === 'NARROWBODY') {
    drawSweptJetShape(ctx, {
      noseY: -8.8,
      tailY: 8.4,
      bodyHalfW: 0.85,
      wingRootLeadY: -2.3,
      wingRootTrailY: 0.7,
      wingSpanX: 8.4,
      wingTipLeadY: 2.3,
      wingTipTrailY: 3.3,
      tailSpanX: 3.2,
      tailLeadY: 6.0,
      tailTipY: 7.8,
      enginesX: [-3.2, 3.2],
      engineYOffset: () => -1.1,
      engineLen: 1.9,
      engineHalfW: 0.45,
    });
  } else if (silhouette === 'BIZJET') {
    drawSweptJetShape(ctx, {
      noseY: -9.2,
      tailY: 8.0,
      bodyHalfW: 0.68,
      wingRootLeadY: -1.8,
      wingRootTrailY: 1.4,
      wingSpanX: 8.0,
      wingTipLeadY: 2.9,
      wingTipTrailY: 3.8,
      tailSpanX: 3.1,
      tailLeadY: 6.3,
      tailTipY: 7.7,
      enginesX: [-1.45, 1.45],
      engineYOffset: () => 2.6,
      engineLen: 2.2,
      engineHalfW: 0.42,
    });
  } else if (silhouette === 'TURBOPROP') {
    drawTurbopropShape(ctx);
  } else {
    drawLightGAShape(ctx);
  }

  ctx.restore();
}
