/**
 * SKYCONTROL - Short Term Conflict Alert (STCA) & Separation Engine
 * Aerospace-grade conflict detection and trajectory prediction:
 * - Uses true ground velocity vectors (accounting for wind & drift)
 * - Exact quadratic intersection for horizontal & vertical conflict intervals
 * - 3D Closest Point of Approach (CPA) calculations
 * - Configurable separation minima
 * - Conflict lifecycle tracking (Initiation, Active, Escalation, Resolution)
 * - Single-deduction penalty accounting to prevent multi-tick score decay
 */

import { Aircraft, ConflictPair, ConflictSeverity, SeparationMinima, ConflictEvent } from '../types';
import { calculateDistance } from './physics';

export const DEFAULT_SEPARATION_MINIMA: SeparationMinima = {
  horizontalNM: 3.0,
  verticalFeet: 1000,
  cautionTimeSec: 100,
  warningTimeSec: 60,
};

/**
 * Computes exact ground velocity in NM/sec for an aircraft.
 * Uses groundVelocityX/Y if present, or derives from groundSpeed & groundTrack/heading.
 */
export function getAircraftGroundVelocityNM_s(ac: Aircraft): { vx: number; vy: number } {
  if (ac.groundVelocityX !== undefined && ac.groundVelocityY !== undefined) {
    return {
      vx: ac.groundVelocityX / 3600,
      vy: ac.groundVelocityY / 3600,
    };
  }

  const track = ac.groundTrack ?? ac.heading;
  const trackRad = (track * Math.PI) / 180;
  const speed = ac.groundSpeed !== undefined && ac.groundSpeed > 0 ? ac.groundSpeed : ac.indicatedAirspeed;
  return {
    vx: (speed / 3600) * Math.sin(trackRad),
    vy: (speed / 3600) * Math.cos(trackRad),
  };
}

/**
 * Calculates 3D Closest Point of Approach (CPA) between two aircraft
 */
export function calculateCPA(
  ac1: Aircraft,
  ac2: Aircraft
): {
  currentDistanceNM: number;
  currentVerticalFt: number;
  timeToCPASec: number;
  cpaDistanceNM: number;
  cpaVerticalFt: number;
  isDiverging: boolean;
} {
  const currentDistanceNM = calculateDistance(ac1.x, ac1.y, ac2.x, ac2.y);
  const currentVerticalFt = Math.abs(ac1.altitude - ac2.altitude);

  const v1 = getAircraftGroundVelocityNM_s(ac1);
  const v2 = getAircraftGroundVelocityNM_s(ac2);

  // Relative position: r = ac2 - ac1 (NM)
  const rx = ac2.x - ac1.x;
  const ry = ac2.y - ac1.y;

  // Relative velocity: v = v2 - v1 (NM/s)
  const vx = v2.vx - v1.vx;
  const vy = v2.vy - v1.vy;

  const relSpeedSq = vx * vx + vy * vy;
  const dotRV = rx * vx + ry * vy;

  // Relative vertical speed in ft/s
  const vs1 = (ac1.verticalSpeed || 0) / 60;
  const vs2 = (ac2.verticalSpeed || 0) / 60;
  const deltaVs = vs2 - vs1;
  const deltaAlt0 = ac2.altitude - ac1.altitude;

  // If relative horizontal velocity is virtually zero (parallel flights at exact same speed)
  if (relSpeedSq < 1e-10) {
    return {
      currentDistanceNM,
      currentVerticalFt,
      timeToCPASec: 0,
      cpaDistanceNM: currentDistanceNM,
      cpaVerticalFt: currentVerticalFt,
      isDiverging: true,
    };
  }

  // Time to horizontal CPA: t = -(r . v) / |v|^2
  const tCPA = -dotRV / relSpeedSq;
  const isDiverging = tCPA <= 0.01;

  // If already diverging, CPA was in the past; closest point is current point
  if (isDiverging) {
    return {
      currentDistanceNM,
      currentVerticalFt,
      timeToCPASec: 0,
      cpaDistanceNM: currentDistanceNM,
      cpaVerticalFt: currentVerticalFt,
      isDiverging: true,
    };
  }

  // Predicted position at tCPA
  const cpaX = rx + vx * tCPA;
  const cpaY = ry + vy * tCPA;
  const cpaDistanceNM = Math.sqrt(cpaX * cpaX + cpaY * cpaY);
  const cpaVerticalFt = Math.abs(deltaAlt0 + deltaVs * tCPA);

  return {
    currentDistanceNM,
    currentVerticalFt,
    timeToCPASec: tCPA,
    cpaDistanceNM,
    cpaVerticalFt,
    isDiverging: false,
  };
}

/**
 * Solves for the time window [tStart, tEnd] where horizontal separation <= D_min
 * |r + v*t|^2 <= D_min^2  ==>  |v|^2 * t^2 + 2*(r.v)*t + (|r|^2 - D_min^2) <= 0
 */
export function getHorizontalViolationWindow(
  rx: number,
  ry: number,
  vx: number,
  vy: number,
  dMinNM: number
): { tStart: number; tEnd: number } | null {
  const currentDistSq = rx * rx + ry * ry;
  const dMinSq = dMinNM * dMinNM;

  const a = vx * vx + vy * vy;
  const b = 2 * (rx * vx + ry * vy);
  const c = currentDistSq - dMinSq;

  // If currently violating:
  if (currentDistSq <= dMinSq) {
    if (a < 1e-10) return { tStart: 0, tEnd: Infinity };
    const disc = b * b - 4 * a * c;
    const tEnd = disc >= 0 ? (-b + Math.sqrt(disc)) / (2 * a) : Infinity;
    return { tStart: 0, tEnd: Math.max(0, tEnd) };
  }

  if (a < 1e-10) return null; // Parallel and not currently violating

  const disc = b * b - 4 * a * c;
  if (disc < 0) return null; // Never reaches dMin

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);

  const tStart = Math.min(t1, t2);
  const tEnd = Math.max(t1, t2);

  // If violation ended in the past:
  if (tEnd <= 0) return null;

  return {
    tStart: Math.max(0, tStart),
    tEnd,
  };
}

/**
 * Solves for the time window [tStart, tEnd] where vertical separation <= H_min
 * |deltaAlt0 + deltaVs * t| <= H_min
 */
export function getVerticalViolationWindow(
  deltaAlt0: number,
  deltaVsFt_s: number,
  hMinFt: number
): { tStart: number; tEnd: number } | null {
  const curDiff = Math.abs(deltaAlt0);

  // If no relative vertical motion:
  if (Math.abs(deltaVsFt_s) < 1e-6) {
    return curDiff <= hMinFt ? { tStart: 0, tEnd: Infinity } : null;
  }

  // -hMin <= deltaAlt0 + deltaVs * t <= hMin
  const t1 = (-hMinFt - deltaAlt0) / deltaVsFt_s;
  const t2 = (hMinFt - deltaAlt0) / deltaVsFt_s;

  const tStart = Math.min(t1, t2);
  const tEnd = Math.max(t1, t2);

  if (tEnd <= 0) return null;

  return {
    tStart: Math.max(0, tStart),
    tEnd,
  };
}

/**
 * Conflict Event Tracker
 * Retains state between simulation steps to manage conflict lifecycle
 * and prevent repeated score penalties.
 */
export class ConflictEventTracker {
  private activeEvents: Map<string, ConflictEvent> = new Map();

  /**
   * Generates a canonical sorted pair key for two aircraft IDs
   */
  public static getPairKey(id1: string, id2: string): string {
    return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
  }

  public getActiveEvents(): ConflictEvent[] {
    return Array.from(this.activeEvents.values());
  }

  public clear(): void {
    this.activeEvents.clear();
  }

  /**
   * Updates conflict tracker with current conflicts detected in step.
   * Returns list of new penalty events to be assessed for scoring.
   */
  public updateEvents(
    currentPairs: ConflictPair[],
    simTimeSec: number
  ): {
    penaltiesToDeduct: Array<{ event: ConflictEvent; severity: ConflictSeverity; penaltyPoints: number }>;
    newlyResolved: ConflictEvent[];
  } {
    const activePairKeys = new Set<string>();
    const penaltiesToDeduct: Array<{ event: ConflictEvent; severity: ConflictSeverity; penaltyPoints: number }> = [];

    // 1. Process current active conflicts
    for (const pair of currentPairs) {
      const key = ConflictEventTracker.getPairKey(pair.aircraft1Id, pair.aircraft2Id);
      activePairKeys.add(key);

      let event = this.activeEvents.get(key);
      if (!event) {
        // Conflict Initiation
        event = {
          id: `conf_${key}_${Math.round(simTimeSec)}`,
          pairKey: key,
          aircraft1Id: pair.aircraft1Id,
          aircraft2Id: pair.aircraft2Id,
          callsign1: pair.callsign1,
          callsign2: pair.callsign2,
          startTime: simTimeSec,
          lastActiveTime: simTimeSec,
          highestSeverity: pair.severity,
          currentSeverity: pair.severity,
          penalizedSeverities: [],
          isResolved: false,
        };
        this.activeEvents.set(key, event);
        pair.phase = 'Initiated';
      } else {
        event.lastActiveTime = simTimeSec;
        event.currentSeverity = pair.severity;

        // Escalation check
        const severityRank = { None: 0, Caution: 1, Warning: 2, Critical: 3 };
        if (severityRank[pair.severity] > severityRank[event.highestSeverity]) {
          event.highestSeverity = pair.severity;
          pair.phase = 'Escalated';
        } else {
          pair.phase = 'Active';
        }
      }

      // Check if this severity level has already been penalized for this conflict
      if (pair.severity === 'Critical' && !event.penalizedSeverities.includes('Critical')) {
        event.penalizedSeverities.push('Critical');
        penaltiesToDeduct.push({ event, severity: 'Critical', penaltyPoints: 20 });
      } else if (pair.severity === 'Warning' && !event.penalizedSeverities.includes('Warning')) {
        event.penalizedSeverities.push('Warning');
        penaltiesToDeduct.push({ event, severity: 'Warning', penaltyPoints: 5 });
      }
    }

    // 2. Detect resolved conflicts (pairs that were active but are no longer conflicting)
    const newlyResolved: ConflictEvent[] = [];
    for (const [key, event] of this.activeEvents.entries()) {
      if (!activePairKeys.has(key)) {
        event.isResolved = true;
        newlyResolved.push(event);
        this.activeEvents.delete(key);
      }
    }

    return { penaltiesToDeduct, newlyResolved };
  }
}

/**
 * Detects conflicts among all active aircraft according to separation minima.
 */
export function detectConflicts(
  aircraftList: Aircraft[],
  minima: SeparationMinima = DEFAULT_SEPARATION_MINIMA
): ConflictPair[] {
  // Only evaluate airborne aircraft that have climbed above field elevation
  const airborne = aircraftList.filter(
    ac => ac.status !== 'Landed' && ac.altitude > 150
  );

  const conflicts: ConflictPair[] = [];

  for (let i = 0; i < airborne.length; i++) {
    for (let j = i + 1; j < airborne.length; j++) {
      const ac1 = airborne[i];
      const ac2 = airborne[j];

      const currentDistNM = calculateDistance(ac1.x, ac1.y, ac2.x, ac2.y);
      const currentVertFt = Math.abs(ac1.altitude - ac2.altitude);

      const v1 = getAircraftGroundVelocityNM_s(ac1);
      const v2 = getAircraftGroundVelocityNM_s(ac2);
      const rx = ac2.x - ac1.x;
      const ry = ac2.y - ac1.y;
      const vx = v2.vx - v1.vx;
      const vy = v2.vy - v1.vy;

      const vs1 = (ac1.verticalSpeed || 0) / 60;
      const vs2 = (ac2.verticalSpeed || 0) / 60;
      const deltaVs = vs2 - vs1;
      const deltaAlt0 = ac2.altitude - ac1.altitude;

      // CPA Calculation
      const cpa = calculateCPA(ac1, ac2);

      // Solve for horizontal and vertical violation intervals
      const hWindow = getHorizontalViolationWindow(rx, ry, vx, vy, minima.horizontalNM);
      const vWindow = getVerticalViolationWindow(deltaAlt0, deltaVs, minima.verticalFeet);

      // Determine if there is a 3D intersection window
      let has3DConflict = false;
      let conflictStartTime = 0;

      if (hWindow && vWindow) {
        const overlapStart = Math.max(hWindow.tStart, vWindow.tStart);
        const overlapEnd = Math.min(hWindow.tEnd, vWindow.tEnd);

        if (overlapStart <= overlapEnd && overlapStart <= minima.cautionTimeSec) {
          has3DConflict = true;
          conflictStartTime = overlapStart;
        }
      }

      let severity: ConflictSeverity = 'None';
      let alertMsg = '';

      // 1. Loss of Separation (Critical Infringement active NOW)
      if (currentDistNM < minima.horizontalNM && currentVertFt < minima.verticalFeet) {
        severity = 'Critical';
        alertMsg = `SEPARATION INFRINGEMENT: ${ac1.callsign} & ${ac2.callsign} (${currentDistNM.toFixed(1)} NM / ${Math.round(currentVertFt)} ft)`;
      }
      // 2. Imminent Warning (< warningTimeSec to 3D violation, or CPA violation imminent)
      else if (
        has3DConflict && conflictStartTime <= minima.warningTimeSec
      ) {
        severity = 'Warning';
        alertMsg = `STCA WARNING: ${ac1.callsign} & ${ac2.callsign} CPA ${cpa.cpaDistanceNM.toFixed(1)} NM in ${Math.round(cpa.timeToCPASec)}s`;
      }
      // 3. Caution / Advisory (< cautionTimeSec to 3D violation)
      else if (
        has3DConflict && conflictStartTime <= minima.cautionTimeSec
      ) {
        severity = 'Caution';
        alertMsg = `TRAFFIC ADVISORY: ${ac1.callsign} & ${ac2.callsign} converging in ${Math.round(conflictStartTime)}s`;
      }
      // 4. Secondary check: CPA below minima within warning time
      else if (
        !cpa.isDiverging &&
        cpa.timeToCPASec > 0 &&
        cpa.timeToCPASec <= minima.warningTimeSec &&
        cpa.cpaDistanceNM < minima.horizontalNM &&
        cpa.cpaVerticalFt < minima.verticalFeet
      ) {
        severity = 'Warning';
        alertMsg = `STCA WARNING: ${ac1.callsign} & ${ac2.callsign} CPA ${cpa.cpaDistanceNM.toFixed(1)} NM in ${Math.round(cpa.timeToCPASec)}s`;
      }

      if (severity !== 'None') {
        const pairId = ConflictEventTracker.getPairKey(ac1.id, ac2.id);
        conflicts.push({
          id: `conf_${pairId}`,
          aircraft1Id: ac1.id,
          aircraft2Id: ac2.id,
          callsign1: ac1.callsign,
          callsign2: ac2.callsign,
          currentHorizontalNM: Math.round(currentDistNM * 10) / 10,
          currentVerticalFt: Math.round(currentVertFt),
          closestPointOfApproachNM: Math.round(cpa.cpaDistanceNM * 10) / 10,
          predictedHorizontalSeparationNM: Math.round(cpa.cpaDistanceNM * 10) / 10,
          predictedVerticalSeparationFt: Math.round(cpa.cpaVerticalFt),
          timeToCPASec: Math.round(cpa.timeToCPASec),
          severity,
          alertMessage: alertMsg,
        });
      }
    }
  }

  // Sort by severity (Critical first, then Warning, then Caution)
  const severityRank: Record<ConflictSeverity, number> = {
    Critical: 3,
    Warning: 2,
    Caution: 1,
    None: 0,
  };

  return conflicts.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
}
