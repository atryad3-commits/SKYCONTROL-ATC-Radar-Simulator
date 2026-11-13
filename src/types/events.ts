/**
 * SKYCONTROL - Simulation Event System
 * Structured, simulation-timestamped events for ATC operations,
 * approach capture, runway occupancy, landing transitions, and safety alerts.
 */

export type SimulationEventType =
  | 'ILS_CAPTURED'
  | 'LOCALIZER_ESTABLISHED'
  | 'GLIDESLOPE_CAPTURED'
  | 'UNSTABLE_APPROACH'
  | 'GO_AROUND'
  | 'RUNWAY_OCCUPIED'
  | 'RUNWAY_RELEASED'
  | 'TAKEOFF_CLEARANCE'
  | 'TAKEOFF_ROLL'
  | 'ROTATION'
  | 'LIFTOFF'
  | 'TOUCHDOWN'
  | 'LANDING_REJECTED'
  | 'DEPARTURE_ESTABLISHED'
  | 'SEPARATION_VIOLATION'
  | 'COMMAND_EXECUTED';

export interface SimulationEvent {
  id: string;
  simTimeSec: number;
  timestampFormatted: string; // UTC HH:MM:SS
  type: SimulationEventType;
  aircraftId?: string;
  callsign?: string;
  runwayId?: string;
  message: string;
  severity?: 'Info' | 'Warning' | 'Critical';
}
