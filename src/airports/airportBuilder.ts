/**
 * SKYCONTROL - Airport & Runway Geometry Builder Helpers
 * Shared geometry and procedural data contract helpers for modular airport catalogs.
 */

import { Position2D, Runway, TmaBoundary, Waypoint } from '../types';
import { RunwayGeometry } from '../engine/runwayGeometry';

export const FEET_PER_NM = 6076.12;

export interface RunwayPairSpec {
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

export function buildRunwayPair(
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

export interface LegConstraintSpec {
  altitudeConstraint?: string;
  minAltitudeFt?: number;
  maxAltitudeFt?: number;
  speedLimitKt?: number;
}

export interface ProcedureSpec {
  id: string;
  name: string;
  type: 'STAR' | 'SID';
  description: string;
  runwayIds: string[];
  waypointNames: string[];
  legConstraints: LegConstraintSpec[];
  initialAltitudeFt?: number;
  finalAltitudeFt?: number;
  maxSpeedKt?: number;
}

export interface AirportProceduralPackage {
  extraWaypoints: Waypoint[];
  waypointOverrides?: Record<string, Partial<Waypoint>>;
  stars: ProcedureSpec[];
  sids: ProcedureSpec[];
  tmaBoundary: TmaBoundary;
}

export function makeOctagonPolygon(radiusX: number, radiusY: number, skewX = 0, skewY = 0): Position2D[] {
  const vertices: Position2D[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 + Math.PI / 8;
    vertices.push({
      x: Math.round((radiusX * Math.sin(angle) + skewX) * 10) / 10,
      y: Math.round((radiusY * Math.cos(angle) + skewY) * 10) / 10,
    });
  }
  return vertices;
}

/**
 * Helper computing a point (distNM) out along a runway's final approach extended centerline.
 */
export function approachFixOnCenterline(
  runwayHeading: number,
  centerOffset: Position2D,
  distFromCenterNM: number
): Position2D {
  const rad = (runwayHeading * Math.PI) / 180;
  return {
    x: Math.round((centerOffset.x - distFromCenterNM * Math.sin(rad)) * 10) / 10,
    y: Math.round((centerOffset.y - distFromCenterNM * Math.cos(rad)) * 10) / 10,
  };
}
