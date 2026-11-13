/**
 * SKYCONTROL - Flight Phase Management State Machine
 * Centralized, validated lifecycle of aircraft operational phases:
 * Departures (PARKED -> TAXI -> HOLD_SHORT -> LINEUP -> TAKEOFF_ROLL -> ROTATION -> LIFTOFF -> INITIAL_CLIMB)
 * Arrivals (ARRIVAL -> APPROACH -> FINAL -> THRESHOLD_CROSSING -> FLARE -> TOUCHDOWN -> ROLLOUT -> RUNWAY_EXIT -> LANDED)
 * Non-normal (GO_AROUND, EMERGENCY)
 */

export type FlightPhase =
  | 'PARKED'
  | 'TAXI'
  | 'HOLD_SHORT'
  | 'LINEUP'
  | 'TAKEOFF_ROLL'
  | 'ROTATION'
  | 'LIFTOFF'
  | 'INITIAL_CLIMB'
  | 'DEPARTURE_NAVIGATION'
  | 'CLIMB'
  | 'CRUISE'
  | 'DESCENT'
  | 'ARRIVAL'
  | 'APPROACH'
  | 'FINAL'
  | 'THRESHOLD_CROSSING'
  | 'FLARE'
  | 'TOUCHDOWN'
  | 'ROLLOUT'
  | 'RUNWAY_EXIT'
  | 'LANDED'
  | 'GO_AROUND'
  | 'EMERGENCY';

/**
 * Valid transitions from each flight phase
 */
const ALLOWED_TRANSITIONS: Record<FlightPhase, FlightPhase[]> = {
  PARKED: ['TAXI', 'EMERGENCY'],
  TAXI: ['HOLD_SHORT', 'PARKED', 'EMERGENCY'],
  HOLD_SHORT: ['LINEUP', 'TAXI', 'EMERGENCY'],
  LINEUP: ['TAKEOFF_ROLL', 'HOLD_SHORT', 'EMERGENCY'],
  TAKEOFF_ROLL: ['ROTATION', 'ROLLOUT', 'EMERGENCY'], // Can abort takeoff to ROLLOUT
  ROTATION: ['LIFTOFF', 'EMERGENCY'],
  LIFTOFF: ['INITIAL_CLIMB', 'EMERGENCY'],
  INITIAL_CLIMB: ['DEPARTURE_NAVIGATION', 'CLIMB', 'GO_AROUND', 'EMERGENCY'],
  DEPARTURE_NAVIGATION: ['CLIMB', 'CRUISE', 'EMERGENCY'],
  CLIMB: ['CRUISE', 'DESCENT', 'EMERGENCY'],
  CRUISE: ['DESCENT', 'ARRIVAL', 'EMERGENCY'],
  DESCENT: ['ARRIVAL', 'APPROACH', 'EMERGENCY'],
  ARRIVAL: ['APPROACH', 'DESCENT', 'HOLD_SHORT', 'GO_AROUND', 'EMERGENCY'],
  APPROACH: ['FINAL', 'ARRIVAL', 'GO_AROUND', 'EMERGENCY'],
  FINAL: ['THRESHOLD_CROSSING', 'FLARE', 'GO_AROUND', 'EMERGENCY'],
  THRESHOLD_CROSSING: ['FLARE', 'TOUCHDOWN', 'GO_AROUND', 'EMERGENCY'],
  FLARE: ['TOUCHDOWN', 'GO_AROUND', 'EMERGENCY'],
  TOUCHDOWN: ['ROLLOUT', 'GO_AROUND', 'EMERGENCY'],
  ROLLOUT: ['RUNWAY_EXIT', 'LANDED', 'EMERGENCY'],
  RUNWAY_EXIT: ['LANDED', 'TAXI', 'EMERGENCY'],
  LANDED: ['TAXI', 'PARKED', 'EMERGENCY'],
  GO_AROUND: ['INITIAL_CLIMB', 'APPROACH', 'ARRIVAL', 'EMERGENCY'],
  EMERGENCY: [
    'PARKED', 'TAXI', 'HOLD_SHORT', 'LINEUP', 'TAKEOFF_ROLL', 'ROTATION',
    'LIFTOFF', 'INITIAL_CLIMB', 'DEPARTURE_NAVIGATION', 'CLIMB', 'CRUISE',
    'DESCENT', 'ARRIVAL', 'APPROACH', 'FINAL', 'THRESHOLD_CROSSING', 'FLARE',
    'TOUCHDOWN', 'ROLLOUT', 'RUNWAY_EXIT', 'LANDED', 'GO_AROUND'
  ],
};

/**
 * Validates whether a transition from currentPhase to targetPhase is permissible
 */
export function isValidPhaseTransition(currentPhase: FlightPhase, targetPhase: FlightPhase): boolean {
  if (currentPhase === targetPhase) return true;
  const allowed = ALLOWED_TRANSITIONS[currentPhase];
  return allowed ? allowed.includes(targetPhase) : false;
}

/**
 * Maps high-level legacy AircraftStatus to fine-grained FlightPhase
 */
export function mapStatusToFlightPhase(status: string): FlightPhase {
  switch (status) {
    case 'Inbound': return 'ARRIVAL';
    case 'Holding': return 'ARRIVAL';
    case 'LocalizerIntercept': return 'APPROACH';
    case 'Established': return 'APPROACH';
    case 'FinalApproach': return 'FINAL';
    case 'Landed': return 'LANDED';
    case 'Departing': return 'LINEUP';
    case 'Outbound': return 'INITIAL_CLIMB';
    case 'GoAround': return 'GO_AROUND';
    default: return 'ARRIVAL';
  }
}
