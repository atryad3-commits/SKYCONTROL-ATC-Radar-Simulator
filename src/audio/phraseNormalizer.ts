/**
 * SKYCONTROL - Shared ICAO Annex 10 Aviation Speech Normalizer
 * Delegates to the canonical Aviation Speech Grammar module while preserving
 * existing import paths across frontend and backend modules.
 */

export {
  AIRLINE_CALLSIGNS,
  NATO_PHONETIC_ALPHABET,
  ICAO_DIGITS,
  WAYPOINT_SPEECH_MAP,
  speakDigits,
  speakAlphanumericTokens,
  formatRegistrationForSpeech,
  isRegistrationIdentifier,
  formatCallsignForSpeech,
  formatPilotDisplayCallsign,
  formatRunwayForSpeech,
  formatAltitudeForSpeech,
  formatHeadingForSpeech,
  formatAirspeedForSpeech,
  formatFrequencyForSpeech,
  formatSquawkForSpeech,
  formatWaypointForSpeech,
  formatNavigationForSpeech,
  buildPilotInitialContact,
  formatPhraseForSpeech,
  type AtcStationRole,
  type StructuredFlightContext,
  type NavigationInstruction,
  type AviationPhraseResult,
} from './aviationSpeechGrammar';
