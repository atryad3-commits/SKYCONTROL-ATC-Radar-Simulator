/**
 * SKYCONTROL - Advanced Runway & Airport Geometry Model
 * Reusable geographic and runway coordinate transformations:
 * - Longitudinal distance along runway centerline (+ ahead of threshold, - on runway)
 * - Lateral deviation from runway centerline (+ right, - left)
 * - Distance and bearing to threshold
 * - Exact rectangular runway boundary containment checks
 * - Threshold crossing detection
 */

import { Position2D } from '../types';

export type RunwayOccupancyState = 'Available' | 'Occupied' | 'Reserved' | 'TemporarilyClosed';

export interface ILSConfig {
  frequency: string;          // e.g. "110.3 MHz"
  glideslopeAngleDeg: number; // e.g. 3.0°
  localizerCourseDeg: number; // Magnetic inbound course (e.g. 270°)
  usableRangeNM: number;      // Maximum reliable range (e.g. 18.0 NM)
  catCategory: 'CAT_I' | 'CAT_II' | 'CAT_III';
}

export interface RunwayGeometry {
  id: string;                         // e.g. "27R"
  airportId: string;                   // e.g. "EGLL"
  designator: string;                 // e.g. "27R"
  threshold: Position2D;              // Threshold coordinates in NM
  oppositeThreshold: Position2D;      // Far end coordinates in NM
  trueHeading: number;                // True heading in degrees
  magneticHeading: number;            // Magnetic heading in degrees
  lengthFeet: number;                 // Length in feet
  widthFeet: number;                  // Width in feet (e.g. 150-200 ft)
  elevationFeet: number;              // Threshold elevation above MSL in feet
  displacedThresholdFeet?: number;    // Displaced threshold distance in feet
  activeLanding: boolean;             // Designated for arrivals
  activeDeparture: boolean;           // Designated for departures
  occupancyState: RunwayOccupancyState;
  occupantId?: string | null;         // Aircraft ID currently occupying runway
  ils: ILSConfig;
}

const FEET_PER_NM = 6076.12;

/**
 * Normalizes any angle to [0, 360) degrees
 */
export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a === 0 ? 0 : a;
}

/**
 * Calculates 2D Euclidean distance in nautical miles from point (x, y) to threshold
 */
export function calculateDistanceToThreshold(x: number, y: number, runway: RunwayGeometry): number {
  const dx = x - runway.threshold.x;
  const dy = y - runway.threshold.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates magnetic bearing from point (x, y) to threshold
 */
export function calculateBearingToThreshold(x: number, y: number, runway: RunwayGeometry): number {
  const dx = runway.threshold.x - x;
  const dy = runway.threshold.y - y;
  const rad = Math.atan2(dx, dy);
  return normalizeAngle((rad * 180) / Math.PI);
}

/**
 * Projects an aircraft position onto the runway coordinate frame:
 * - alongTrackNM: longitudinal distance along extended runway centerline from threshold.
 *   Positive values indicate position before threshold on approach (e.g. +10 NM is 10 NM out).
 *   Negative values indicate position past threshold over runway or rollout.
 * - crossTrackNM: perpendicular distance from runway centerline.
 *   Positive values indicate aircraft is to the RIGHT of approach course.
 *   Negative values indicate aircraft is to the LEFT of approach course.
 */
export function calculateRunwayRelativePosition(
  x: number,
  y: number,
  runway: RunwayGeometry
): {
  alongTrackNM: number;
  crossTrackNM: number;
  crossTrackFeet: number;
} {
  // Vector from threshold to aircraft:
  const dx = x - runway.threshold.x;
  const dy = y - runway.threshold.y;

  // Inbound approach course is runway magnetic heading
  // The vector extending back into approach airspace points toward reciprocal heading (heading + 180°)
  const approachCourseRad = (runway.magneticHeading * Math.PI) / 180;

  // Unit vector along approach course (direction of landing flight)
  const alongUnitX = Math.sin(approachCourseRad);
  const alongUnitY = Math.cos(approachCourseRad);

  // Unit vector perpendicular to approach course (pointing to the RIGHT of aircraft facing landing direction)
  const crossUnitX = Math.cos(approachCourseRad);
  const crossUnitY = -Math.sin(approachCourseRad);

  // Projection:
  // If aircraft is at (x, y), along-track distance from threshold along landing direction:
  // dot product with alongUnit gives distance along landing direction from threshold.
  // We define alongTrackNM such that + is AHEAD of threshold on approach (opposite to landing direction vector):
  const alongTrackNM = -(dx * alongUnitX + dy * alongUnitY);
  const crossTrackNM = dx * crossUnitX + dy * crossUnitY;

  return {
    alongTrackNM: Math.round(alongTrackNM * 1000) / 1000,
    crossTrackNM: Math.round(crossTrackNM * 1000) / 1000,
    crossTrackFeet: Math.round(crossTrackNM * FEET_PER_NM * 10) / 10,
  };
}

/**
 * Determines whether an aircraft is geometrically inside the runway rectangle
 * (from threshold to opposite threshold, within runway width plus optional safety margin)
 */
export function isInsideRunwayBoundaries(
  x: number,
  y: number,
  runway: RunwayGeometry,
  marginFeet: number = 20
): boolean {
  const { alongTrackNM, crossTrackFeet } = calculateRunwayRelativePosition(x, y, runway);
  const runwayLengthNM = runway.lengthFeet / FEET_PER_NM;
  const halfWidthFeet = runway.widthFeet / 2 + marginFeet;

  // On the runway: alongTrackNM is between -runwayLengthNM and 0 (threshold)
  const isAlong = alongTrackNM <= 0.05 && alongTrackNM >= -(runwayLengthNM + 0.05);
  const isAcross = Math.abs(crossTrackFeet) <= halfWidthFeet;

  return isAlong && isAcross;
}

/**
 * Determines whether an aircraft is inside the Runway Protection Zone (RPZ) /
 * Obstacle Free Zone (OFZ), which extends beyond the pavement edge (standard 250 ft from centerline).
 * An aircraft has NOT cleared/vacated the runway until it is outside this protected boundary.
 */
export function isInsideRunwayProtectionZone(
  x: number,
  y: number,
  runway: RunwayGeometry,
  protectedHalfWidthFeet: number = 250
): boolean {
  const { alongTrackNM, crossTrackFeet } = calculateRunwayRelativePosition(x, y, runway);
  const runwayLengthNM = runway.lengthFeet / FEET_PER_NM;

  // Along runway plus 200 ft overrun safety margins
  const overrunNM = 200 / FEET_PER_NM;
  const isAlong = alongTrackNM <= overrunNM && alongTrackNM >= -(runwayLengthNM + overrunNM);
  const isAcross = Math.abs(crossTrackFeet) <= protectedHalfWidthFeet;

  return isAlong && isAcross;
}

/**
 * Detects whether an aircraft has crossed the runway threshold between two steps
 */
export function hasCrossedThreshold(prevAlongTrackNM: number, currentAlongTrackNM: number): boolean {
  return prevAlongTrackNM > 0 && currentAlongTrackNM <= 0;
}
