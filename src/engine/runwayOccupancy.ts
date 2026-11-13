/**
 * SKYCONTROL - Runway Occupancy Manager
 * Tracks runway states ('Available', 'Occupied', 'Reserved', 'TemporarilyClosed'),
 * prevents conflicting clearances, and handles automatic release upon runway vacancy.
 */

import { RunwayGeometry, RunwayOccupancyState } from './runwayGeometry';

export interface RunwayOccupancyRecord {
  runwayId: string;
  state: RunwayOccupancyState;
  occupantAircraftId: string | null;
  occupantCallsign: string | null;
  reason: 'Takeoff' | 'Landing' | 'Lineup' | 'Closure' | null;
  occupiedAtSimTimeSec: number;
}

export interface RunwayClearanceValidation {
  allowed: boolean;
  reason?: string;
  currentOccupant?: string;
}

export class RunwayOccupancyManager {
  private runways: Map<string, RunwayOccupancyRecord> = new Map();
  // Map between reciprocal runway designators (e.g. 27R <-> 09L, 27L <-> 09R)
  private reciprocalMap: Map<string, string> = new Map([
    ['27R', '09L'],
    ['09L', '27R'],
    ['27L', '09R'],
    ['09R', '27L'],
  ]);

  constructor(initialRunways: RunwayGeometry[] = []) {
    for (const rwy of initialRunways) {
      this.runways.set(rwy.id, {
        runwayId: rwy.id,
        state: rwy.occupancyState || 'Available',
        occupantAircraftId: null,
        occupantCallsign: null,
        reason: null,
        occupiedAtSimTimeSec: 0,
      });
    }
  }

  public setReciprocal(rwy1: string, rwy2: string): void {
    this.reciprocalMap.set(rwy1, rwy2);
    this.reciprocalMap.set(rwy2, rwy1);
  }

  public setRunwayState(runwayId: string, state: RunwayOccupancyState): void {
    const rec = this.runways.get(runwayId);
    if (rec) {
      rec.state = state;
    }
    const recipId = this.reciprocalMap.get(runwayId);
    if (recipId) {
      const recipRec = this.runways.get(recipId);
      if (recipRec) {
        recipRec.state = state;
      }
    }
  }

  public registerRunway(rwy: RunwayGeometry): void {
    if (!this.runways.has(rwy.id)) {
      this.runways.set(rwy.id, {
        runwayId: rwy.id,
        state: rwy.occupancyState || 'Available',
        occupantAircraftId: null,
        occupantCallsign: null,
        reason: null,
        occupiedAtSimTimeSec: 0,
      });
    }
  }

  public getRunwayState(runwayId: string): RunwayOccupancyState {
    const rec = this.runways.get(runwayId);
    return rec ? rec.state : 'Available';
  }

  public getOccupant(runwayId: string): { aircraftId: string | null; callsign: string | null } {
    const rec = this.runways.get(runwayId);
    return {
      aircraftId: rec?.occupantAircraftId || null,
      callsign: rec?.occupantCallsign || null,
    };
  }

  /**
   * Validates whether an aircraft can be cleared for takeoff on runwayId
   */
  public canClearForTakeoff(runwayId: string, aircraftId: string): RunwayClearanceValidation {
    const rec = this.runways.get(runwayId);
    if (!rec) {
      return { allowed: false, reason: `Runway ${runwayId} does not exist` };
    }

    if (rec.state === 'TemporarilyClosed') {
      return { allowed: false, reason: `Runway ${runwayId} is temporarily closed` };
    }

    // If occupied by someone else:
    if (rec.state === 'Occupied' && rec.occupantAircraftId !== aircraftId) {
      return {
        allowed: false,
        reason: `Runway ${runwayId} is occupied by ${rec.occupantCallsign || rec.occupantAircraftId}`,
        currentOccupant: rec.occupantCallsign || rec.occupantAircraftId || undefined,
      };
    }

    // If reserved for an arrival on short final:
    if (rec.state === 'Reserved' && rec.occupantAircraftId !== aircraftId) {
      return {
        allowed: false,
        reason: `Runway ${runwayId} is reserved for arriving traffic (${rec.occupantCallsign || 'inbound'})`,
        currentOccupant: rec.occupantCallsign || undefined,
      };
    }

    return { allowed: true };
  }

  /**
   * Validates whether an aircraft can land on runwayId
   */
  public canClearForLanding(runwayId: string, aircraftId: string): RunwayClearanceValidation {
    const rec = this.runways.get(runwayId);
    if (!rec) {
      return { allowed: false, reason: `Runway ${runwayId} does not exist` };
    }

    if (rec.state === 'TemporarilyClosed') {
      return { allowed: false, reason: `Runway ${runwayId} is temporarily closed` };
    }

    if (rec.state === 'Occupied' && rec.occupantAircraftId !== aircraftId) {
      return {
        allowed: false,
        reason: `Runway ${runwayId} is occupied by ${rec.occupantCallsign || rec.occupantAircraftId}`,
        currentOccupant: rec.occupantCallsign || rec.occupantAircraftId || undefined,
      };
    }

    return { allowed: true };
  }

  /**
   * Marks a runway as Occupied by an aircraft
   */
  public occupyRunway(
    runwayId: string,
    aircraftId: string,
    callsign: string,
    reason: 'Takeoff' | 'Landing' | 'Lineup',
    simTimeSec: number = 0
  ): boolean {
    const rec = this.runways.get(runwayId);
    if (!rec) return false;

    // If occupied by this aircraft, update state to Occupied and update reason
    if (rec.occupantAircraftId === aircraftId) {
      rec.state = 'Occupied';
      rec.reason = reason;
      rec.occupiedAtSimTimeSec = simTimeSec;
      const recipId = this.reciprocalMap.get(runwayId);
      if (recipId) {
        const recipRec = this.runways.get(recipId);
        if (recipRec) {
          recipRec.state = 'Occupied';
          recipRec.reason = reason;
        }
      }
      return true;
    }

    // If occupied by another aircraft and not available, cannot occupy
    if (rec.state === 'Occupied' && rec.occupantAircraftId !== aircraftId) {
      return false;
    }

    rec.state = 'Occupied';
    rec.occupantAircraftId = aircraftId;
    rec.occupantCallsign = callsign;
    rec.reason = reason;
    rec.occupiedAtSimTimeSec = simTimeSec;

    // Sync reciprocal runway
    const recipId = this.reciprocalMap.get(runwayId);
    if (recipId) {
      const recipRec = this.runways.get(recipId);
      if (recipRec) {
        recipRec.state = 'Occupied';
        recipRec.occupantAircraftId = aircraftId;
        recipRec.occupantCallsign = callsign;
        recipRec.reason = reason;
        recipRec.occupiedAtSimTimeSec = simTimeSec;
      }
    }
    return true;
  }

  /**
   * Reserves a runway for an inbound flight on final approach
   */
  public reserveRunway(
    runwayId: string,
    aircraftId: string,
    callsign: string,
    simTimeSec: number = 0
  ): boolean {
    const rec = this.runways.get(runwayId);
    if (!rec || rec.state === 'Occupied') return false;

    rec.state = 'Reserved';
    rec.occupantAircraftId = aircraftId;
    rec.occupantCallsign = callsign;
    rec.reason = 'Landing';
    rec.occupiedAtSimTimeSec = simTimeSec;

    const recipId = this.reciprocalMap.get(runwayId);
    if (recipId) {
      const recipRec = this.runways.get(recipId);
      if (recipRec) {
        recipRec.state = 'Reserved';
        recipRec.occupantAircraftId = aircraftId;
        recipRec.occupantCallsign = callsign;
        recipRec.reason = 'Landing';
        recipRec.occupiedAtSimTimeSec = simTimeSec;
      }
    }
    return true;
  }

  /**
   * Releases runway when aircraft has vacated or taken off
   */
  public releaseRunway(runwayId: string, aircraftId?: string): boolean {
    const rec = this.runways.get(runwayId);
    if (!rec) return false;

    if (aircraftId && rec.occupantAircraftId && rec.occupantAircraftId !== aircraftId) {
      // Trying to release someone else's occupancy
      return false;
    }

    rec.state = 'Available';
    rec.occupantAircraftId = null;
    rec.occupantCallsign = null;
    rec.reason = null;
    rec.occupiedAtSimTimeSec = 0;

    const recipId = this.reciprocalMap.get(runwayId);
    if (recipId) {
      const recipRec = this.runways.get(recipId);
      if (recipRec && (!aircraftId || recipRec.occupantAircraftId === aircraftId)) {
        recipRec.state = 'Available';
        recipRec.occupantAircraftId = null;
        recipRec.occupantCallsign = null;
        recipRec.reason = null;
        recipRec.occupiedAtSimTimeSec = 0;
      }
    }
    return true;
  }

  public clearAll(): void {
    for (const rec of this.runways.values()) {
      rec.state = 'Available';
      rec.occupantAircraftId = null;
      rec.occupantCallsign = null;
      rec.reason = null;
      rec.occupiedAtSimTimeSec = 0;
    }
  }
}
