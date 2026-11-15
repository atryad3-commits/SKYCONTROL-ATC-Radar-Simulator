/**
 * SKYCONTROL - Pre-Generated Offline Aviation Audio Library Catalog
 * Complete structured phrase catalog spanning:
 * A. Standard ATC Phrases (14 operational categories)
 * B. Aviation Numbers (8 categories: 0-9, flight, runway, altitude, heading, speed, frequency, squawk)
 * C. Aviation Alphabet (All 26 NATO letters Alpha-Zulu + cadence drill)
 * D. Controlled Complete-Sentence Communication Templates
 *
 * NOTE: Every phrase is written as natural complete aviation speech with proper punctuation pauses
 * so Kokoro-82M neural synthesis maintains realistic cadence without robotic word concatenation.
 */

import {
  AudioLibraryCatalogItem,
  AudioLibraryCategory,
  AudioLibraryGroup,
} from './audioLibraryTypes';
import { formatPhraseForSpeech } from '../src/audio/phraseNormalizer';

export const AUDIO_LIBRARY_GROUP_LABELS: Record<AudioLibraryGroup, string> = {
  A_ATC_PHRASES: 'A · Standard ATC Phrases',
  B_AVIATION_NUMBERS: 'B · Aviation Numbers',
  C_AVIATION_ALPHABET: 'C · Aviation Alphabet',
  D_COMM_TEMPLATES: 'D · Communication Templates',
};

export const AUDIO_LIBRARY_CATEGORY_META: Record<
  AudioLibraryCategory,
  { group: AudioLibraryGroup; label: string; description: string }
> = {
  // A. Standard ATC Phrases (14)
  initial_contact: {
    group: 'A_ATC_PHRASES',
    label: 'Initial Contact',
    description: 'First check-in & radar identification',
  },
  frequency_change: {
    group: 'A_ATC_PHRASES',
    label: 'Frequency Change',
    description: 'Sector & tower/ground handoffs',
  },
  clearance_delivery: {
    group: 'A_ATC_PHRASES',
    label: 'Clearance Delivery',
    description: 'IFR route, SID & squawk clearances',
  },
  taxi_instructions: {
    group: 'A_ATC_PHRASES',
    label: 'Taxi Instructions',
    description: 'Apron, taxiway & hold-short routing',
  },
  takeoff_clearance: {
    group: 'A_ATC_PHRASES',
    label: 'Takeoff Clearance',
    description: 'Line up & wait and departure clearances',
  },
  landing_clearance: {
    group: 'A_ATC_PHRASES',
    label: 'Landing Clearance',
    description: 'Approach & runway landing clearances',
  },
  holding_instructions: {
    group: 'A_ATC_PHRASES',
    label: 'Holding Instructions',
    description: 'Publish hold entry & expected approach time',
  },
  traffic_information: {
    group: 'A_ATC_PHRASES',
    label: 'Traffic Information',
    description: 'Clock position, altitude & wake caution alerts',
  },
  altitude_instructions: {
    group: 'A_ATC_PHRASES',
    label: 'Altitude Instructions',
    description: 'Climb, descend & flight level clearances',
  },
  heading_instructions: {
    group: 'A_ATC_PHRASES',
    label: 'Heading Instructions',
    description: 'Left/right radar vectors & present heading',
  },
  speed_instructions: {
    group: 'A_ATC_PHRASES',
    label: 'Speed Instructions',
    description: 'Indicated airspeed adjustments & resume normal speed',
  },
  readback: {
    group: 'A_ATC_PHRASES',
    label: 'Readback',
    description: 'Pilot acknowledgments & readback confirmations',
  },
  go_around: {
    group: 'A_ATC_PHRASES',
    label: 'Go-Around',
    description: 'Missed approach & go-around commands',
  },
  emergency_communications: {
    group: 'A_ATC_PHRASES',
    label: 'Emergency Communications',
    description: 'Mayday, Pan-Pan, priority vectors & emergency services',
  },
  // B. Aviation Numbers (8)
  numbers_digits: {
    group: 'B_AVIATION_NUMBERS',
    label: 'Numbers 0–9',
    description: 'ICAO digits zero through niner',
  },
  numbers_flight: {
    group: 'B_AVIATION_NUMBERS',
    label: 'Flight Numbers',
    description: 'Airline callsign & flight number enunciations',
  },
  numbers_runway: {
    group: 'B_AVIATION_NUMBERS',
    label: 'Runway Numbers',
    description: 'Runway designations left, right & center',
  },
  numbers_altitude: {
    group: 'B_AVIATION_NUMBERS',
    label: 'Altitudes',
    description: 'Standard feet & flight level readouts',
  },
  numbers_heading: {
    group: 'B_AVIATION_NUMBERS',
    label: 'Headings',
    description: 'Compass radar vector headings',
  },
  numbers_speed: {
    group: 'B_AVIATION_NUMBERS',
    label: 'Speeds',
    description: 'Indicated airspeeds in knots',
  },
  numbers_frequency: {
    group: 'B_AVIATION_NUMBERS',
    label: 'Frequencies',
    description: 'VHF airband COM frequencies',
  },
  numbers_squawk: {
    group: 'B_AVIATION_NUMBERS',
    label: 'Squawk Codes',
    description: 'Transponder 4-digit squawk codes',
  },
  // C. Aviation Alphabet
  nato_alphabet: {
    group: 'C_AVIATION_ALPHABET',
    label: 'NATO Phonetic (Alpha–Zulu)',
    description: 'All 26 ICAO letters plus full alphabet drill',
  },
  // D. Common Communication Templates
  comm_templates: {
    group: 'D_COMM_TEMPLATES',
    label: 'Communication Templates',
    description: 'Complete-sentence controlled aviation templates',
  },
};

function item(
  phraseId: string,
  category: AudioLibraryCategory,
  rawText: string,
  opts?: {
    spokenText?: string;
    templatePattern?: string;
    corePriority?: boolean;
    recommendedRole?: 'ATC' | 'PILOT' | 'BOTH';
  }
): AudioLibraryCatalogItem {
  const meta = AUDIO_LIBRARY_CATEGORY_META[category];
  return {
    phraseId,
    group: meta.group,
    category,
    rawText,
    spokenText: opts?.spokenText || formatPhraseForSpeech(rawText) || rawText,
    templatePattern: opts?.templatePattern,
    corePriority: opts?.corePriority ?? false,
    recommendedRole: opts?.recommendedRole ?? 'BOTH',
  };
}

const NATO_LETTERS: ReadonlyArray<[string, string]> = [
  ['alpha', 'Alpha.'],
  ['bravo', 'Bravo.'],
  ['charlie', 'Charlie.'],
  ['delta', 'Delta.'],
  ['echo', 'Echo.'],
  ['foxtrot', 'Foxtrot.'],
  ['golf', 'Golf.'],
  ['hotel', 'Hotel.'],
  ['india', 'India.'],
  ['juliett', 'Juliett.'],
  ['kilo', 'Kilo.'],
  ['lima', 'Lima.'],
  ['mike', 'Mike.'],
  ['november', 'November.'],
  ['oscar', 'Oscar.'],
  ['papa', 'Papa.'],
  ['quebec', 'Quebec.'],
  ['romeo', 'Romeo.'],
  ['sierra', 'Sierra.'],
  ['tango', 'Tango.'],
  ['uniform', 'Uniform.'],
  ['victor', 'Victor.'],
  ['whiskey', 'Whiskey.'],
  ['xray', 'X-ray.'],
  ['yankee', 'Yankee.'],
  ['zulu', 'Zulu.'],
];

const ICAO_DIGITS_CATALOG: ReadonlyArray<[string, string, string]> = [
  ['0', '0', 'Zero.'],
  ['1', '1', 'One.'],
  ['2', '2', 'Two.'],
  ['3', '3', 'Three.'],
  ['4', '4', 'Four.'],
  ['5', '5', 'Five.'],
  ['6', '6', 'Six.'],
  ['7', '7', 'Seven.'],
  ['8', '8', 'Eight.'],
  ['9', '9', 'Niner.'],
];

export const AUDIO_LIBRARY_CATALOG: AudioLibraryCatalogItem[] = [
  // =========================================================================
  // A. STANDARD ATC PHRASES (14 Categories)
  // =========================================================================

  // 1. Initial Contact
  item(
    'atc_init_radar_contact',
    'initial_contact',
    'Radar contact, identified, maintain present heading and altitude, expect vectors for the ILS approach.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),
  item(
    'atc_init_pilot_checkin',
    'initial_contact',
    'Approach, good day, with you passing eight thousand feet, information Alpha.',
    { corePriority: true, recommendedRole: 'PILOT' }
  ),
  item(
    'atc_init_radio_check',
    'initial_contact',
    'Radio check, readability five, loud and clear.',
    { corePriority: false, recommendedRole: 'BOTH' }
  ),

  // 2. Frequency Change
  item(
    'atc_freq_contact_tower',
    'frequency_change',
    'Contact Tower on 118.500, good day.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),
  item(
    'atc_freq_contact_ground',
    'frequency_change',
    'Vacate runway when able, contact Ground on 121.900.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),
  item(
    'atc_freq_contact_approach',
    'frequency_change',
    'Contact Approach on 119.725, squawk normal.',
    { corePriority: false, recommendedRole: 'ATC' }
  ),

  // 3. Clearance Delivery
  item(
    'atc_clr_ifr_departure',
    'clearance_delivery',
    'Cleared to destination as filed, climb initially to five thousand feet, squawk 4215.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),
  item(
    'atc_clr_sid_release',
    'clearance_delivery',
    'Cleared via standard instrument departure, QNH 1013, departure frequency 119.725.',
    { corePriority: false, recommendedRole: 'ATC' }
  ),

  // 4. Taxi Instructions
  item(
    'atc_taxi_to_holding_point',
    'taxi_instructions',
    'Taxi to holding point runway 27R via taxiway Alpha and Bravo, hold short of runway 27R.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),
  item(
    'atc_taxi_vacate_apron',
    'taxi_instructions',
    'Turn next right, taxi to parking stand via taxiway Charlie.',
    { corePriority: false, recommendedRole: 'ATC' }
  ),

  // 5. Takeoff Clearance
  item(
    'atc_takeoff_cleared',
    'takeoff_clearance',
    'Wind 260 degrees at 14 knots, runway 27L, cleared for takeoff.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),
  item(
    'atc_takeoff_lineup_wait',
    'takeoff_clearance',
    'Behind landing traffic, runway 27L, line up and wait.',
    { corePriority: false, recommendedRole: 'ATC' }
  ),
  item(
    'atc_takeoff_cancel',
    'takeoff_clearance',
    'Hold position, cancel takeoff clearance, I say again cancel takeoff clearance.',
    { corePriority: false, recommendedRole: 'ATC' }
  ),

  // 6. Landing Clearance
  item(
    'atc_land_cleared_ils',
    'landing_clearance',
    'Cleared ILS approach runway 27R, report established on the localizer.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),
  item(
    'atc_land_cleared_to_land',
    'landing_clearance',
    'Wind 250 degrees at 12 knots, runway 27R, cleared to land.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),

  // 7. Holding Instructions
  item(
    'atc_hold_published',
    'holding_instructions',
    'Hold at Ockham as published, maintain five thousand feet, expect onward clearance in ten minutes.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),
  item(
    'atc_hold_pilot_entering',
    'holding_instructions',
    'Entering the hold at Ockham as published, maintaining five thousand feet.',
    { corePriority: false, recommendedRole: 'PILOT' }
  ),

  // 8. Traffic Information
  item(
    'atc_traffic_clock',
    'traffic_information',
    'Traffic alert, twelve o-clock, five miles, opposite direction, heavy widebody climbing.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),
  item(
    'atc_traffic_in_sight',
    'traffic_information',
    'Traffic in sight, maintaining visual separation.',
    { corePriority: true, recommendedRole: 'PILOT' }
  ),

  // 9. Altitude Instructions
  item(
    'atc_alt_descend_3000',
    'altitude_instructions',
    'Descend to 3,000 feet, QNH 1013.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),
  item(
    'atc_alt_climb_fl120',
    'altitude_instructions',
    'Climb to Flight Level 120, expedite through five thousand feet.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),

  // 10. Heading Instructions
  item(
    'atc_hdg_left_180',
    'heading_instructions',
    'Turn left heading 180, intercept localizer.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),
  item(
    'atc_hdg_right_270',
    'heading_instructions',
    'Turn right heading 270, vectors for final approach.',
    { corePriority: false, recommendedRole: 'ATC' }
  ),

  // 11. Speed Instructions
  item(
    'atc_spd_reduce_180',
    'speed_instructions',
    'Reduce speed to 180 knots for spacing.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),
  item(
    'atc_spd_resume_normal',
    'speed_instructions',
    'Resume normal speed, no speed restrictions.',
    { corePriority: false, recommendedRole: 'ATC' }
  ),

  // 12. Readback
  item(
    'pilot_rb_wilco_roger',
    'readback',
    'Roger, wilco, standing by on this frequency.',
    { corePriority: true, recommendedRole: 'PILOT' }
  ),
  item(
    'pilot_rb_cleared_land',
    'readback',
    'Cleared to land runway 27R, gear down, landing checks complete.',
    { corePriority: true, recommendedRole: 'PILOT' }
  ),
  item(
    'pilot_rb_holding_short',
    'readback',
    'Holding short runway 27L, ready for immediate departure.',
    { corePriority: false, recommendedRole: 'PILOT' }
  ),

  // 13. Go-Around
  item(
    'atc_go_around_command',
    'go_around',
    'Go around, I say again go around, climb straight ahead to 3,000 feet.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),
  item(
    'pilot_go_around_call',
    'go_around',
    'Going around, climbing three thousand feet on runway heading.',
    { corePriority: true, recommendedRole: 'PILOT' }
  ),

  // 14. Emergency Communications
  item(
    'pilot_emg_mayday_fuel',
    'emergency_communications',
    'Mayday, Mayday, Mayday, minimum fuel emergency, requesting immediate priority landing vectors.',
    { corePriority: true, recommendedRole: 'PILOT' }
  ),
  item(
    'pilot_emg_pan_medical',
    'emergency_communications',
    'Pan-Pan, Pan-Pan, Pan-Pan, medical emergency on board, requesting priority approach.',
    { corePriority: false, recommendedRole: 'PILOT' }
  ),
  item(
    'atc_emg_priority_ack',
    'emergency_communications',
    'Roger Mayday, emergency services alerted, turn right heading 270, cleared direct to final.',
    { corePriority: true, recommendedRole: 'ATC' }
  ),

  // =========================================================================
  // B. AVIATION NUMBERS (8 Categories)
  // =========================================================================

  // B1. Numbers 0-9 (Individual reference + natural cadence drill)
  ...ICAO_DIGITS_CATALOG.map(([digit, label, spoken], idx) =>
    item(`num_digit_${digit}`, 'numbers_digits', label, {
      spokenText: spoken,
      corePriority: idx === 0 || idx === 9,
      recommendedRole: 'BOTH',
    })
  ),
  item(
    'num_digits_drill_0_9',
    'numbers_digits',
    'Zero, one, two, three, four, five, six, seven, eight, niner.',
    {
      spokenText: 'Zero, one, two, three, four, five, six, seven, eight, niner.',
      corePriority: true,
      recommendedRole: 'BOTH',
    }
  ),

  // B2. Flight Numbers
  item('num_flt_baw452', 'numbers_flight', 'BAW452', {
    spokenText: 'Speedbird four five two.',
    corePriority: true,
    recommendedRole: 'BOTH',
  }),
  item('num_flt_ira712', 'numbers_flight', 'IRA712', {
    spokenText: 'Iranair seven one two.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),
  item('num_flt_aal101', 'numbers_flight', 'AAL101 heavy', {
    spokenText: 'American one zero one heavy.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),
  item('num_flt_dlh802', 'numbers_flight', 'DLH802', {
    spokenText: 'Lufthansa eight zero two.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),

  // B3. Runway Numbers
  item('num_rwy_27l', 'numbers_runway', 'Runway 27L', {
    spokenText: 'Runway two seven left.',
    corePriority: true,
    recommendedRole: 'BOTH',
  }),
  item('num_rwy_27r', 'numbers_runway', 'Runway 27R', {
    spokenText: 'Runway two seven right.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),
  item('num_rwy_29l', 'numbers_runway', 'Runway 29L', {
    spokenText: 'Runway two niner left.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),
  item('num_rwy_31l', 'numbers_runway', 'Runway 31L', {
    spokenText: 'Runway three one left.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),

  // B4. Altitudes
  item('num_alt_3000', 'numbers_altitude', 'Three thousand feet.', {
    spokenText: 'Three thousand feet.',
    corePriority: true,
    recommendedRole: 'BOTH',
  }),
  item('num_alt_5000', 'numbers_altitude', 'Five thousand feet.', {
    spokenText: 'Five thousand feet.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),
  item('num_alt_fl120', 'numbers_altitude', 'FL120', {
    spokenText: 'Flight level one two zero.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),
  item('num_alt_fl240', 'numbers_altitude', 'FL240', {
    spokenText: 'Flight level two four zero.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),

  // B5. Headings
  item('num_hdg_090', 'numbers_heading', 'Heading 090', {
    spokenText: 'Heading zero niner zero.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),
  item('num_hdg_180', 'numbers_heading', 'Heading 180', {
    spokenText: 'Heading one eight zero.',
    corePriority: true,
    recommendedRole: 'BOTH',
  }),
  item('num_hdg_270', 'numbers_heading', 'Heading 270', {
    spokenText: 'Heading two seven zero.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),
  item('num_hdg_360', 'numbers_heading', 'Heading 360', {
    spokenText: 'Heading three six zero.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),

  // B6. Speeds
  item('num_spd_160', 'numbers_speed', '160 knots', {
    spokenText: 'One six zero knots.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),
  item('num_spd_180', 'numbers_speed', '180 knots', {
    spokenText: 'One eight zero knots.',
    corePriority: true,
    recommendedRole: 'BOTH',
  }),
  item('num_spd_210', 'numbers_speed', '210 knots', {
    spokenText: 'Two one zero knots.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),
  item('num_spd_250', 'numbers_speed', '250 knots', {
    spokenText: 'Two five zero knots.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),

  // B7. Frequencies
  item('num_freq_118_5', 'numbers_frequency', '118.500', {
    spokenText: 'One one eight decimal five.',
    corePriority: true,
    recommendedRole: 'BOTH',
  }),
  item('num_freq_119_725', 'numbers_frequency', '119.725', {
    spokenText: 'One one niner decimal seven two five.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),
  item('num_freq_121_9', 'numbers_frequency', '121.900', {
    spokenText: 'One two one decimal niner.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),

  // B8. Squawk Codes
  item('num_sqk_4215', 'numbers_squawk', 'Squawk 4215', {
    spokenText: 'Squawk four two one five.',
    corePriority: true,
    recommendedRole: 'BOTH',
  }),
  item('num_sqk_7700', 'numbers_squawk', 'Squawk 7700', {
    spokenText: 'Squawk seven seven zero zero.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),
  item('num_sqk_7600', 'numbers_squawk', 'Squawk 7600', {
    spokenText: 'Squawk seven six zero zero.',
    corePriority: false,
    recommendedRole: 'BOTH',
  }),

  // =========================================================================
  // C. AVIATION ALPHABET (All 26 NATO Phonetic Letters Alpha–Zulu + Drill)
  // =========================================================================
  ...NATO_LETTERS.map(([id, word]) =>
    item(`nato_${id}`, 'nato_alphabet', word.replace(/\.$/, ''), {
      spokenText: word,
      corePriority: true,
      recommendedRole: 'BOTH',
    })
  ),
  item(
    'nato_full_alphabet_drill',
    'nato_alphabet',
    'Alpha, Bravo, Charlie, Delta, Echo, Foxtrot, Golf, Hotel, India, Juliett, Kilo, Lima, Mike, November, Oscar, Papa, Quebec, Romeo, Sierra, Tango, Uniform, Victor, Whiskey, X-ray, Yankee, Zulu.',
    {
      spokenText:
        'Alpha, Bravo, Charlie, Delta, Echo, Foxtrot, Golf, Hotel, India, Juliett, Kilo, Lima, Mike, November, Oscar, Papa, Quebec, Romeo, Sierra, Tango, Uniform, Victor, Whiskey, X-ray, Yankee, Zulu.',
      corePriority: false,
      recommendedRole: 'BOTH',
    }
  ),

  // =========================================================================
  // D. COMMON COMMUNICATION TEMPLATES (Controlled Complete Sentences)
  // =========================================================================
  item(
    'tpl_vector_altitude_ils',
    'comm_templates',
    'BAW452, turn left heading 180, descend 3,000 feet, QNH 1013, cleared ILS runway 27R.',
    {
      templatePattern:
        '{CALLSIGN}, turn {DIR} heading {HEADING}, descend {ALTITUDE}, QNH {QNH}, cleared ILS runway {RUNWAY}.',
      corePriority: true,
      recommendedRole: 'ATC',
    }
  ),
  item(
    'tpl_takeoff_wind_clearance',
    'comm_templates',
    'BAW452, surface wind 260 degrees at 14 knots, runway 27L, cleared for takeoff.',
    {
      templatePattern:
        '{CALLSIGN}, surface wind {WIND}, runway {RUNWAY}, cleared for takeoff.',
      corePriority: true,
      recommendedRole: 'ATC',
    }
  ),
  item(
    'tpl_landing_wind_clearance',
    'comm_templates',
    'IRA712, wind 250 degrees at 12 knots, runway 29R, cleared to land.',
    {
      templatePattern: '{CALLSIGN}, wind {WIND}, runway {RUNWAY}, cleared to land.',
      corePriority: false,
      recommendedRole: 'ATC',
    }
  ),
  item(
    'tpl_pilot_readback_vector_alt',
    'comm_templates',
    'Turning left heading 180, descending 3,000 feet, Speedbird 452.',
    {
      templatePattern: 'Turning {DIR} heading {HEADING}, descending {ALTITUDE}, {CALLSIGN}.',
      corePriority: true,
      recommendedRole: 'PILOT',
    }
  ),
  item(
    'tpl_handoff_frequency',
    'comm_templates',
    'DAL114, vacate via taxiway Bravo, contact Ground on 121.900.',
    {
      templatePattern: '{CALLSIGN}, vacate via taxiway {TAXIWAY}, contact Ground on {FREQUENCY}.',
      corePriority: false,
      recommendedRole: 'ATC',
    }
  ),
  item(
    'tpl_weather_qnh_advisory',
    'comm_templates',
    'All stations, weather update, wind 260 degrees at 14 knots, visibility good, QNH 1013.',
    {
      templatePattern:
        'All stations, weather update, wind {WIND}, visibility {VISIBILITY}, QNH {QNH}.',
      corePriority: false,
      recommendedRole: 'ATC',
    }
  ),
];

export function getCatalogCategories(): AudioLibraryCategory[] {
  return Object.keys(AUDIO_LIBRARY_CATEGORY_META) as AudioLibraryCategory[];
}
