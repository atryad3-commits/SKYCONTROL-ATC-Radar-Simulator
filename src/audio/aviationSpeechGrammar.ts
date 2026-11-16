/**
 * SKYCONTROL - Aviation Speech Grammar & ICAO Annex 10 Phraseology Engine
 * Pure TypeScript (zero DOM / runtime dependencies), shared by:
 * - Existing ATC simulation communication coordinator & readback builders
 * - Frontend Web Audio VHF radio coordinator
 * - Offline Node.js Kokoro-82M TTS normalization pipeline
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
  FIN: 'Finnair',
  AIC: 'Air India',
  SIA: 'Singapore',
  CPA: 'Cathay',
  TAP: 'Air Portugal',
};

export const NATO_PHONETIC_ALPHABET: Record<string, string> = {
  A: 'Alpha',
  B: 'Bravo',
  C: 'Charlie',
  D: 'Delta',
  E: 'Echo',
  F: 'Foxtrot',
  G: 'Golf',
  H: 'Hotel',
  I: 'India',
  J: 'Juliet',
  K: 'Kilo',
  L: 'Lima',
  M: 'Mike',
  N: 'November',
  O: 'Oscar',
  P: 'Papa',
  Q: 'Quebec',
  R: 'Romeo',
  S: 'Sierra',
  T: 'Tango',
  U: 'Uniform',
  V: 'Victor',
  W: 'Whiskey',
  X: 'X-ray',
  Y: 'Yankee',
  Z: 'Zulu',
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

export type AtcStationRole = 'TOWER' | 'APPROACH' | 'GROUND';

export interface StructuredFlightContext {
  id?: string;
  callsign: string;
  registration?: string;
  airline?: string;
  telephony?: string;
  flightNumber?: string;
  aircraftType?: string;
  isHeavy?: boolean;
  category?: 'Heavy' | 'Large' | 'Small';
  runway?: string;
  assignedRunway?: string;
  altitude?: number;
  targetAltitude?: number;
  heading?: number;
  targetHeading?: number;
  airspeed?: number;
  indicatedAirspeed?: number;
  targetAirspeed?: number;
  frequency?: string;
  squawkCode?: string;
  transponder?: string;
  assignedWaypoint?: string | null;
  routeQueue?: string[];
  holdingWaypoint?: string | null;
  airportName?: string;
  airportIcao?: string;
  directorCallsign?: string;
}

export interface NavigationInstruction {
  type:
    | 'DIRECT'
    | 'ROUTE'
    | 'HOLD'
    | 'ILS_VECTORS'
    | 'ILS_CLEARANCE'
    | 'LINE_UP_WAIT'
    | 'TAKEOFF'
    | 'GO_AROUND'
    | 'HEADING'
    | 'PRESENT_HEADING';
  waypoint?: string;
  routeWaypoints?: string[];
  runway?: string;
  heading?: number;
  turnDirection?: 'LEFT' | 'RIGHT';
  altitudeFeet?: number;
  qnh?: number;
  windDirection?: number;
  windSpeed?: number;
  armIlsAfter?: boolean;
}

export interface AviationPhraseResult {
  displayText: string;
  spokenText: string;
}

/**
 * Converts a string of digits into spaced ICAO words (e.g. "095" -> "zero niner five").
 */
export function speakDigits(digits: string): string {
  return digits
    .split('')
    .map(ch => ICAO_DIGITS[ch] ?? ch)
    .join(' ');
}

/**
 * Converts alphanumeric identifiers (flight suffixes or tail registrations) into ICAO speech.
 */
export function speakAlphanumericTokens(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .split('')
    .map(ch => ICAO_DIGITS[ch] ?? NATO_PHONETIC_ALPHABET[ch] ?? ch)
    .join(' ');
}

/**
 * Pronounces aircraft registration numbers using ICAO phonetic spelling
 * e.g. "N172SP" -> "November one seven two Sierra Papa"
 *      "G-BOAC" -> "Golf Bravo Oscar Alpha Charlie"
 *      "EP-IAA" -> "Echo Papa India Alpha Alpha"
 */
export function formatRegistrationForSpeech(registration: string): string {
  const clean = registration.trim().toUpperCase();
  if (!clean) return '';
  return speakAlphanumericTokens(clean);
}

/**
 * Detects whether an identifier looks like an aircraft tail registration rather than an airline flight number.
 */
export function isRegistrationIdentifier(identifier: string): boolean {
  const clean = identifier.trim().toUpperCase();
  if (/^[A-Z0-9]{1,2}-[A-Z0-9]{2,5}$/.test(clean)) return true;
  if (/^N\d{1,5}[A-Z]{0,2}$/.test(clean)) return true;
  return false;
}

/**
 * Converts an airline+flightnumber callsign OR registration OR structured flight object into
 * natural ICAO radiotelephony speech.
 */
export function formatCallsignForSpeech(
  input: string | Pick<StructuredFlightContext, 'callsign' | 'registration' | 'airline' | 'telephony' | 'flightNumber' | 'isHeavy' | 'category'>,
  isHeavyOverride?: boolean
): string {
  if (typeof input === 'string') {
    const clean = input.trim().toUpperCase();
    if (!clean) return '';
    const heavyTag = isHeavyOverride ? ' heavy' : '';

    if (isRegistrationIdentifier(clean)) {
      return `${formatRegistrationForSpeech(clean)}${heavyTag}`.trim();
    }

    const airlineMatch = clean.match(/^([A-Z]{3})(\d{1,4}[A-Z]?)$/);
    if (airlineMatch) {
      const prefix = airlineMatch[1];
      const numSuffix = airlineMatch[2];
      const telephony = AIRLINE_CALLSIGNS[prefix] || prefix;
      return `${telephony} ${speakAlphanumericTokens(numSuffix)}${heavyTag}`.trim();
    }

    const prefix = clean.slice(0, 3);
    const tail = clean.slice(3);
    const telephony = AIRLINE_CALLSIGNS[prefix] || prefix;
    return `${telephony} ${speakAlphanumericTokens(tail)}${heavyTag}`.trim();
  }

  const isHeavy = isHeavyOverride ?? input.isHeavy ?? input.category === 'Heavy';
  const heavyTag = isHeavy ? ' heavy' : '';
  const clean = (input.callsign || '').trim().toUpperCase();

  if (input.registration && (!clean || clean === input.registration.trim().toUpperCase())) {
    return `${formatRegistrationForSpeech(input.registration)}${heavyTag}`.trim();
  }

  if (isRegistrationIdentifier(clean)) {
    return `${formatRegistrationForSpeech(clean)}${heavyTag}`.trim();
  }

  const airlineMatch = clean.match(/^([A-Z]{3})(\d{1,4}[A-Z]?)$/);
  const prefix = airlineMatch ? airlineMatch[1] : clean.slice(0, 3);
  const flightNum = input.flightNumber || (airlineMatch ? airlineMatch[2] : clean.slice(3));
  const telephony = input.telephony || AIRLINE_CALLSIGNS[prefix] || (input.airline && AIRLINE_CALLSIGNS[input.airline.toUpperCase()]) || prefix;

  return `${telephony} ${speakAlphanumericTokens(flightNum)}${heavyTag}`.trim();
}

/**
 * Formats an abbreviated pilot callsign label used inside display transcripts (e.g. "Speedbird 452").
 */
export function formatPilotDisplayCallsign(ctx: StructuredFlightContext): string {
  const clean = ctx.callsign.trim().toUpperCase();
  if (ctx.telephony && clean.length > 3 && !isRegistrationIdentifier(clean)) {
    const num = ctx.flightNumber || clean.slice(3);
    return `${ctx.telephony} ${num}`;
  }
  const prefix = clean.slice(0, 3);
  if (AIRLINE_CALLSIGNS[prefix] && clean.length > 3 && !isRegistrationIdentifier(clean)) {
    return `${AIRLINE_CALLSIGNS[prefix]} ${clean.slice(3)}`;
  }
  return clean;
}

/**
 * Converts runway identifier into ICAO phraseology (e.g. "29R" -> "two niner right", "36" -> "three six").
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
 * Converts altitude in feet or flight level into natural ICAO aviation speech.
 */
export function formatAltitudeForSpeech(altInput: string | number): string {
  if (typeof altInput === 'string') {
    const flMatch = altInput.trim().toUpperCase().match(/^FL\s*0*(\d{2,3})$/);
    if (flMatch) {
      return `flight level ${speakDigits(flMatch[1].padStart(3, '0'))}`;
    }
  }
  const num = typeof altInput === 'number' ? Math.round(altInput) : parseInt(String(altInput).replace(/,/g, ''), 10);
  if (Number.isNaN(num)) return String(altInput);
  if (num >= 1000) {
    const thousands = Math.floor(num / 1000);
    const hundreds = Math.round((num % 1000) / 100);
    const thousandWords = speakDigits(String(thousands));
    if (hundreds > 0) {
      return `${thousandWords} thousand ${speakDigits(String(hundreds))} hundred feet`;
    }
    return `${thousandWords} thousand feet`;
  }
  if (num > 0 && num % 100 === 0) {
    return `${speakDigits(String(Math.floor(num / 100)))} hundred feet`;
  }
  return `${speakDigits(String(num))} feet`;
}

/**
 * Formats magnetic heading into 3-digit ICAO speech (e.g. 5 -> "heading zero zero five").
 */
export function formatHeadingForSpeech(heading: number | string, includePrefix: boolean = true): string {
  const raw = typeof heading === 'number' ? Math.round(heading) : parseInt(String(heading), 10);
  if (Number.isNaN(raw)) return String(heading);
  const clamped = ((raw % 360) + 360) % 360;
  const formatted = clamped === 0 && raw === 360 ? '360' : String(clamped).padStart(3, '0');
  const words = speakDigits(formatted);
  return includePrefix ? `heading ${words}` : words;
}

/**
 * Formats indicated airspeed into ICAO knots speech (e.g. 180 -> "one eight zero knots").
 */
export function formatAirspeedForSpeech(knots: number | string): string {
  const raw = typeof knots === 'number' ? Math.round(knots) : parseInt(String(knots), 10);
  if (Number.isNaN(raw)) return String(knots);
  return `${speakDigits(String(raw))} knots`;
}

/**
 * Formats VHF/UHF frequency into ICAO decimal speech (e.g. "119.725 MHz" -> "one one niner decimal seven two five").
 */
export function formatFrequencyForSpeech(frequency: string | number): string {
  const clean = String(frequency).replace(/\s*MHz/gi, '').trim();
  const match = clean.match(/^(\d{3})\.(\d{1,3})$/);
  if (!match) return clean;
  const whole = match[1];
  const fracRaw = match[2];
  const trimmedFrac = fracRaw.replace(/0+$/, '') || '0';
  return `${speakDigits(whole)} decimal ${speakDigits(trimmedFrac)}`;
}

/**
 * Formats a 4-digit SSR transponder code (e.g. "7700" -> "squawk seven seven zero zero").
 */
export function formatSquawkForSpeech(code: string, includePrefix: boolean = true): string {
  const clean = code.replace(/\D/g, '').padStart(4, '0').slice(-4);
  const words = speakDigits(clean);
  return includePrefix ? `squawk ${words}` : words;
}

/**
 * Formats waypoint identifier into pronounced fix/VOR name when known, else NATO phonetics/clean code.
 */
export function formatWaypointForSpeech(waypoint: string): string {
  const upper = waypoint.trim().toUpperCase();
  if (WAYPOINT_SPEECH_MAP[upper]) {
    return WAYPOINT_SPEECH_MAP[upper];
  }
  return upper;
}

/**
 * Formats a structured navigation instruction (direct, route, hold, ILS, vectors, heading) into
 * display text + natural ICAO spoken text.
 */
export function formatNavigationForSpeech(
  nav: NavigationInstruction,
  ctx?: StructuredFlightContext
): AviationPhraseResult {
  const callsignDisplay = ctx?.callsign || '';
  const callsignSpoken = ctx ? formatCallsignForSpeech(ctx) : '';
  const leadDisplay = callsignDisplay ? `${callsignDisplay}, ` : '';
  const leadSpoken = callsignSpoken ? `${callsignSpoken}, ` : '';

  switch (nav.type) {
    case 'DIRECT': {
      const wp = nav.waypoint || ctx?.assignedWaypoint || '';
      const wpSpoken = formatWaypointForSpeech(wp);
      return {
        displayText: `${leadDisplay}cleared direct ${wp}`,
        spokenText: `${leadSpoken}cleared direct ${wpSpoken}.`,
      };
    }
    case 'ROUTE': {
      const wps = nav.routeWaypoints || [];
      const ilsSuffixDisplay = nav.armIlsAfter && nav.runway ? `, then ILS runway ${nav.runway}` : '';
      const ilsSuffixSpoken =
        nav.armIlsAfter && nav.runway
          ? `, then I L S runway ${formatRunwayForSpeech(nav.runway)}`
          : '';
      const wpsSpoken = wps.map(formatWaypointForSpeech).join(', ');
      return {
        displayText: `${leadDisplay}proceed direct ${wps.join(', ')}${ilsSuffixDisplay}`,
        spokenText: `${leadSpoken}proceed direct ${wpsSpoken}${ilsSuffixSpoken}.`,
      };
    }
    case 'HOLD': {
      const wp = nav.waypoint || ctx?.holdingWaypoint || '';
      const wpSpoken = formatWaypointForSpeech(wp);
      return {
        displayText: `${leadDisplay}hold at ${wp} as published, expect further clearance`,
        spokenText: `${leadSpoken}hold at ${wpSpoken} as published, expect further clearance.`,
      };
    }
    case 'ILS_VECTORS': {
      const rwy = nav.runway || ctx?.assignedRunway || '';
      const hdg = nav.heading ?? ctx?.targetHeading ?? 0;
      const hdgStr = String(((Math.round(hdg) % 360) + 360) % 360).padStart(3, '0');
      const alt = nav.altitudeFeet ?? ctx?.targetAltitude ?? 3000;
      const altReadable = alt >= 8000 ? `FL${String(Math.round(alt / 100)).padStart(3, '0')}` : `${alt.toLocaleString('en-US')} ft`;
      const qnhPart = nav.qnh ? ` QNH ${nav.qnh}` : '';
      const qnhSpoken = nav.qnh ? `, Q N H ${speakDigits(String(nav.qnh))}` : '';
      return {
        displayText: `${leadDisplay}turn heading ${hdgStr}, descend to ${altReadable}${qnhPart}, cleared ILS runway ${rwy}`,
        spokenText: `${leadSpoken}turn ${formatHeadingForSpeech(hdg)}, descend to ${formatAltitudeForSpeech(alt)}${qnhSpoken}, cleared I L S runway ${formatRunwayForSpeech(rwy)}.`,
      };
    }
    case 'ILS_CLEARANCE': {
      const rwy = nav.runway || ctx?.assignedRunway || '';
      return {
        displayText: `${leadDisplay}cleared ILS approach runway ${rwy}, report established`,
        spokenText: `${leadSpoken}cleared I L S approach runway ${formatRunwayForSpeech(rwy)}, report established.`,
      };
    }
    case 'LINE_UP_WAIT': {
      const rwy = nav.runway || ctx?.assignedRunway || '';
      return {
        displayText: `${leadDisplay}behind landing traffic, runway ${rwy} line up and wait`,
        spokenText: `${leadSpoken}behind landing traffic, runway ${formatRunwayForSpeech(rwy)}, line up and wait.`,
      };
    }
    case 'TAKEOFF': {
      const rwy = nav.runway || ctx?.assignedRunway || '';
      const windDir = String(Math.round(nav.windDirection ?? 270)).padStart(3, '0');
      const windSpd = Math.round(nav.windSpeed ?? 10);
      const qnh = nav.qnh ?? 1013;
      return {
        displayText: `${leadDisplay}wind ${windDir} degrees ${windSpd} knots, QNH ${qnh}, runway ${rwy} cleared for takeoff`,
        spokenText: `${leadSpoken}wind ${speakDigits(windDir)} degrees, ${speakDigits(String(windSpd))} knots, Q N H ${speakDigits(String(qnh))}, runway ${formatRunwayForSpeech(rwy)} cleared for takeoff.`,
      };
    }
    case 'GO_AROUND': {
      const alt = nav.altitudeFeet ?? 3000;
      const altReadable = `${alt.toLocaleString('en-US')} ft`;
      return {
        displayText: `${leadDisplay}go around, climb straight ahead to ${altReadable}`,
        spokenText: `${leadSpoken}go around, climb straight ahead to ${formatAltitudeForSpeech(alt)}.`,
      };
    }
    case 'PRESENT_HEADING': {
      const hdg = nav.heading ?? ctx?.heading ?? 0;
      const hdgStr = String(((Math.round(hdg) % 360) + 360) % 360).padStart(3, '0');
      return {
        displayText: `${leadDisplay}cancel route, maintain present heading ${hdgStr}`,
        spokenText: `${leadSpoken}cancel route, maintain present ${formatHeadingForSpeech(hdg)}.`,
      };
    }
    case 'HEADING':
    default: {
      const hdg = nav.heading ?? ctx?.targetHeading ?? 0;
      const hdgStr = String(((Math.round(hdg) % 360) + 360) % 360).padStart(3, '0');
      const dirWord =
        nav.turnDirection === 'LEFT'
          ? 'turn left heading'
          : nav.turnDirection === 'RIGHT'
            ? 'turn right heading'
            : 'fly heading';
      return {
        displayText: `${leadDisplay}${dirWord} ${hdgStr}`,
        spokenText: `${leadSpoken}${dirWord.replace(/\s+heading$/, '')} ${formatHeadingForSpeech(hdg)}.`,
      };
    }
  }
}

/**
 * Generates an initial contact / check-in phrase from structured aircraft fields.
 */
export function buildPilotInitialContact(
  ctx: StructuredFlightContext,
  options: { isDeparture?: boolean; informationLetter?: string; emergencyReason?: string } = {}
): AviationPhraseResult {
  const facilityBase = ctx.airportName || ctx.airportIcao || 'Tower';
  const regOrCsDisplay = ctx.registration || ctx.callsign;
  const heavyDisplay = ctx.isHeavy || ctx.category === 'Heavy' ? ' Heavy' : '';
  const spokenId = formatCallsignForSpeech(ctx);

  if (options.emergencyReason) {
    const squawk = ctx.transponder || ctx.squawkCode || '7700';
    const rwy = ctx.assignedRunway || ctx.runway || '27R';
    return {
      displayText: `Mayday Mayday Mayday! ${facilityBase} Director, ${regOrCsDisplay}${heavyDisplay}, squawking ${squawk}, ${options.emergencyReason}, requesting immediate priority vectors runway ${rwy}!`,
      spokenText: `Mayday, Mayday, Mayday! ${facilityBase} Director, ${spokenId}, ${formatSquawkForSpeech(squawk, false).replace(/^/, 'squawking ')}, ${options.emergencyReason}, requesting immediate priority vectors runway ${formatRunwayForSpeech(rwy)}!`,
    };
  }

  if (options.isDeparture) {
    const rwy = ctx.assignedRunway || ctx.runway || '27L';
    return {
      displayText: `${facilityBase} Tower, ${regOrCsDisplay}${heavyDisplay}, holding short runway ${rwy}, ready for departure.`,
      spokenText: `${facilityBase} Tower, ${spokenId}, holding short runway ${formatRunwayForSpeech(rwy)}, ready for departure.`,
    };
  }

  const alt = Math.round(ctx.altitude ?? 8000);
  const altDisplay = alt >= 8000 ? `FL${String(Math.round(alt / 100)).padStart(3, '0')}` : `${alt.toLocaleString('en-US')} ft`;
  const altSpoken = alt >= 8000 ? formatAltitudeForSpeech(`FL${Math.round(alt / 100)}`) : formatAltitudeForSpeech(alt);
  const info = options.informationLetter ? `, with information ${options.informationLetter}` : '';

  if (ctx.assignedWaypoint) {
    return {
      displayText: `${facilityBase} Director, ${regOrCsDisplay}${heavyDisplay}, passing ${altDisplay} direct ${ctx.assignedWaypoint}${info}.`,
      spokenText: `${facilityBase} Director, ${spokenId}, passing ${altSpoken}, direct ${formatWaypointForSpeech(ctx.assignedWaypoint)}${info}.`,
    };
  }

  const hdg = Math.round(ctx.heading ?? 270);
  const hdgStr = String(((hdg % 360) + 360) % 360).padStart(3, '0');
  return {
    displayText: `${facilityBase} Director, ${regOrCsDisplay}${heavyDisplay}, passing ${altDisplay} heading ${hdgStr}${info}.`,
    spokenText: `${facilityBase} Director, ${spokenId}, passing ${altSpoken}, ${formatHeadingForSpeech(hdg)}${info}.`,
  };
}

/**
 * Normalizes arbitrary aviation radio transcripts (ATC commands, pilot readbacks, weather updates,
 * squawk calls, registrations, speeds, altitudes, headings, frequencies) into authentic spoken
 * ICAO English with natural comma phrasing pauses for Kokoro-82M / offline TTS.
 */
export function formatPhraseForSpeech(rawText: string): string {
  let text = rawText;

  // 1. Aircraft registrations (e.g. N172SP, G-BOAC, EP-IAA, D-AIXA) before airline prefix pass
  text = text.replace(
    /\b([A-Z]{1,2}-[A-Z0-9]{2,5})\b/g,
    (_, reg: string) => formatRegistrationForSpeech(reg)
  );
  text = text.replace(
    /\b(N\d{1,5}[A-Z]{0,2})\b/g,
    (_, reg: string) => formatRegistrationForSpeech(reg)
  );

  // 2. Airline 3-letter callsigns (e.g. BAW452, IRA712, AAL101A)
  text = text.replace(/\b([A-Z]{3})(\d{1,4}[A-Z]?)\b/g, (_, prefix: string, num: string) => {
    const telephony = AIRLINE_CALLSIGNS[prefix] || prefix;
    return `${telephony} ${speakAlphanumericTokens(num)}`;
  });

  // 3. Runways (RWY 29R, Runway 09L, runway 36)
  text = text.replace(/\b(?:RWY|Runway)\s+(\d{1,2}[LRC]?)\b/gi, (_, rwy: string) => {
    return `runway ${formatRunwayForSpeech(rwy)}`;
  });

  // 4. Flight Levels & Altitudes
  text = text.replace(/\b(?:Flight\s+Level|FL)\s*0*(\d{2,3})\b/gi, (_, fl: string) => {
    return `flight level ${speakDigits(fl.padStart(3, '0'))}`;
  });
  text = text.replace(/\b(\d{1,2},?\d{3})\s*(?:feet|ft)\b/gi, (_, alt: string) => {
    return formatAltitudeForSpeech(alt);
  });

  // 5. Headings
  text = text.replace(/\b(?:heading|hdg)\s+(\d{1,3})\b/gi, (_, hdg: string) => {
    return formatHeadingForSpeech(hdg, true);
  });
  text = text.replace(/\b(?:turn\s+)?(left|right)\s+(\d{3})\b/gi, (_, dir: string, hdg: string) => {
    return `${dir.toLowerCase()} ${speakDigits(hdg)}`;
  });

  // 6. Airspeeds (both 2-digit e.g. 85 knots and 3-digit e.g. 180 knots, plus Mach)
  text = text.replace(/\bMach\s+0?\.(\d{1,2})\b/gi, (_, frac: string) => {
    return `Mach decimal ${speakDigits(frac)}`;
  });
  text = text.replace(/\b(\d{2,3})\s*(?:knots|kts|kt)\b/gi, (_, spd: string) => {
    return formatAirspeedForSpeech(spd);
  });
  text = text.replace(/\bV1\b/g, 'V one');

  // 7. Surface wind
  text = text.replace(
    /\bwind\s+(\d{3})\s*(?:degrees\s*)?(?:at|\/)?\s*(\d{1,2})(?:\s*(?:knots|kt|kts))?\b/gi,
    (_, dir: string, spd: string) => `wind ${speakDigits(dir)} degrees, ${speakDigits(spd)} knots`
  );
  text = text.replace(
    /\bgusting\s+(\d{1,2})\s*(?:knots|kt|kts)?\b/gi,
    (_, gst: string) => `gusting ${speakDigits(gst)} knots`
  );

  // 8. Pressure settings & Squawk codes
  text = text.replace(/\bQNH\s+(\d{3,4})\b/gi, (_, qnh: string) => `Q N H ${speakDigits(qnh)}`);
  text = text.replace(/\baltimeter\s+(\d{4})\b/gi, (_, altm: string) => `altimeter ${speakDigits(altm)}`);
  text = text.replace(
    /\b(squawk(?:ing)?)\s+(\d{4})\b/gi,
    (_, word: string, code: string) => `${word} ${speakDigits(code)}`
  );

  // 9. VHF Frequencies (e.g. 119.725 MHz, 121.9)
  text = text.replace(/\b(\d{3})\.(\d{1,3})(?:\s*MHz)?\b/gi, (_, whole: string, frac: string) => {
    const trimmedFrac = frac.replace(/0+$/, '') || '0';
    return `${speakDigits(whole)} decimal ${speakDigits(trimmedFrac)}`;
  });

  // 10. Aviation acronyms & Navigation Fixes
  text = text.replace(/\bILS\b/g, 'I L S');
  text = text.replace(/\bSSR\b/g, 'S S R');
  text = text.replace(/\bTMA\b/g, 'terminal area');
  text = text.replace(/\bATIS\b/g, 'A T I S');
  text = text.replace(/\b([A-Z]{2,3})\b/g, code => WAYPOINT_SPEECH_MAP[code] || code);

  // 11. Spoken callsign trailing numbers like "Speedbird 452" -> "Speedbird four five two"
  const knownTelephonies = Array.from(new Set(Object.values(AIRLINE_CALLSIGNS)))
    .filter(name => !/^[A-Z]{2,3}$/.test(name))
    .join('|');
  if (knownTelephonies) {
    const trailingRegex = new RegExp(`\\b(${knownTelephonies})\\s+(\\d{1,4}[A-Z]?)\\b`, 'gi');
    text = text.replace(trailingRegex, (_, name: string, num: string) => {
      return `${name} ${speakAlphanumericTokens(num)}`;
    });
  }

  // 12. Smooth clause punctuation pauses
  text = text.replace(/\s*·\s*/g, ', ').replace(/[()]/g, ', ');
  return text.replace(/\s+/g, ' ').trim();
}
