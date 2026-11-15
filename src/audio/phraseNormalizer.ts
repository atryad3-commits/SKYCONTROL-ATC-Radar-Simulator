/**
 * SKYCONTROL - Shared ICAO Annex 10 Aviation Speech Normalizer
 * Pure TypeScript (zero DOM dependencies) used by both the frontend VHF radio coordinator
 * and the offline Node.js Kokoro TTS engine.
 */

export const AIRLINE_CALLSIGNS: Record<string, string> = {
  BAW: 'Speedbird',
  IRA: 'Iranair',
  VIR: 'Virgin',
  DLH: 'Lufthansa',
  AFR: 'Air France',
  KLM: 'KLM',
  UAE: 'Emirates',
  AAL: 'American',
  DAL: 'Delta',
  UAL: 'United',
  QTR: 'Qatari',
  SWR: 'Swiss',
  IBE: 'Iberia',
  SAS: 'Scandinavian',
  RYR: 'Ryanair',
  EZY: 'Easy',
  THY: 'Turkish',
  SKY: 'Skyline',
};

export const ICAO_DIGITS: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'niner',
};

export const WAYPOINT_SPEECH_MAP: Record<string, string> = {
  BNN: 'Bovingdon',
  LAM: 'Lambourne',
  BIG: 'Biggin',
  OCK: 'Ockham',
  VR: 'Varamin',
  MEH: 'Mehrabad',
  RUS: 'Rudeshur',
  SAV: 'Saveh',
  JFK: 'Kennedy',
  DPK: 'Deer Park',
  CAM: 'Camrn',
  CRI: 'Canarsie',
  LND: 'Lindy',
  DMV: 'Damavand',
  VAR: 'Varamin',
  KRD: 'Karaj',
  TRN: 'Tehran',
  RAD: 'Radan',
};

/**
 * Converts a string of digits into spaced ICAO words (e.g. "095" -> "zero niner five")
 */
export function speakDigits(digits: string): string {
  return digits
    .split('')
    .map(ch => ICAO_DIGITS[ch] ?? ch)
    .join(' ');
}

/**
 * Converts runway identifier into ICAO phraseology (e.g. "29R" -> "two niner right")
 */
export function formatRunwayForSpeech(runwayId: string): string {
  const match = runwayId.trim().toUpperCase().match(/^(\d{1,2})([LRC])?$/);
  if (!match) return runwayId;
  const numWords = speakDigits(match[1].padStart(2, '0'));
  const sideMap: Record<string, string> = {
    L: 'left',
    R: 'right',
    C: 'center',
  };
  const side = match[2] ? ` ${sideMap[match[2]]}` : '';
  return `${numWords}${side}`;
}

/**
 * Converts altitude in feet or flight level into natural ICAO aviation speech
 */
export function formatAltitudeForSpeech(altText: string): string {
  const flMatch = altText.trim().toUpperCase().match(/^FL\s*0*(\d{2,3})$/);
  if (flMatch) {
    return `flight level ${speakDigits(flMatch[1].padStart(3, '0'))}`;
  }
  const num = parseInt(altText.replace(/,/g, ''), 10);
  if (Number.isNaN(num)) return altText;
  if (num >= 1000) {
    const thousands = Math.floor(num / 1000);
    const hundreds = Math.round((num % 1000) / 100);
    const thousandWords = speakDigits(String(thousands));
    if (hundreds > 0) {
      return `${thousandWords} thousand ${speakDigits(String(hundreds))} hundred feet`;
    }
    return `${thousandWords} thousand feet`;
  }
  return `${num} feet`;
}

/**
 * Normalizes aviation transcripts into authentic spoken ICAO English for natural TTS synthesis.
 */
export function formatPhraseForSpeech(rawText: string): string {
  let text = rawText;

  text = text.replace(/\b([A-Z]{3})(\d{2,4}[A-Z]?)\b/g, (_, prefix: string, num: string) => {
    const telephony = AIRLINE_CALLSIGNS[prefix];
    if (!telephony) return `${prefix} ${speakDigits(num)}`;
    return `${telephony} ${speakDigits(num)}`;
  });

  text = text.replace(/\b(?:RWY|Runway)\s+(\d{1,2}[LRC]?)\b/gi, (_, rwy: string) => {
    return `runway ${formatRunwayForSpeech(rwy)}`;
  });

  text = text.replace(/\b(?:Flight\s+Level|FL)\s*0*(\d{2,3})\b/gi, (_, fl: string) => {
    return `flight level ${speakDigits(fl.padStart(3, '0'))}`;
  });

  text = text.replace(/\b(\d{1,2},?\d{3})\s*(?:feet|ft)\b/gi, (_, alt: string) => {
    return formatAltitudeForSpeech(alt);
  });

  text = text.replace(/\b(?:heading|hdg)\s+(\d{1,3})\b/gi, (_, hdg: string) => {
    return `heading ${speakDigits(hdg.padStart(3, '0'))}`;
  });

  text = text.replace(/\b(\d{3})\s*(?:knots|kts|kt)\b/gi, (_, spd: string) => {
    return `${speakDigits(spd)} knots`;
  });
  text = text.replace(/\bV1\b/g, 'V one');

  text = text.replace(
    /\bwind\s+(\d{3})\s*(?:degrees\s*)?(?:at|\/)\s*(\d{1,2})(?:\s*(?:knots|kt|kts))?\b/gi,
    (_, dir: string, spd: string) => `wind ${speakDigits(dir)} degrees, ${speakDigits(spd)} knots`
  );

  text = text.replace(/\bQNH\s+(\d{3,4})\b/gi, (_, qnh: string) => `Q N H ${speakDigits(qnh)}`);
  text = text.replace(
    /\b(squawk(?:ing)?)\s+(\d{4})\b/gi,
    (_, word: string, code: string) => `${word} ${speakDigits(code)}`
  );
  text = text.replace(/\b(\d{3})\.(\d{1,3})(?:\s*MHz)?\b/gi, (_, whole: string, frac: string) => {
    const trimmedFrac = frac.replace(/0+$/, '') || '0';
    return `${speakDigits(whole)} decimal ${speakDigits(trimmedFrac)}`;
  });

  text = text.replace(/\bILS\b/g, 'I L S');
  text = text.replace(/\bTMA\b/g, 'terminal area');
  text = text.replace(/\b([A-Z]{2,3})\b/g, code => WAYPOINT_SPEECH_MAP[code] || code);

  text = text.replace(/\s*·\s*/g, ', ').replace(/[()]/g, ', ');
  return text.replace(/\s+/g, ' ').trim();
}
