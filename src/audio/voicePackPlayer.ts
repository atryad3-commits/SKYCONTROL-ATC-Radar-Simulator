/**
 * 100% Offline Bundled Real-Human Voice Pack Engine
 * Decodes local MP3 audio sprites from /voice-pack/ via Web Audio API,
 * tokenizes any ICAO ATC command or Pilot readback/call-in into sample-accurate clips,
 * and schedules seamless crossfaded playback through the VHF Radio DSP chain.
 */

export interface VoicePackSpeakerManifest {
  id: string;
  role: 'TOWER' | 'PILOT';
  label: string;
  file: string;
  clips: Record<string, [number, number]>; // [startSec, durationSec]
}

export interface VoicePackManifest {
  version: number;
  sampleRate: number;
  speakers: Record<string, VoicePackSpeakerManifest>;
}

const KNOWN_AIRLINES = new Set([
  'BAW', 'IRA', 'VIR', 'DLH', 'AFR', 'KLM', 'UAE', 'AAL', 'DAL',
  'UAL', 'QTR', 'SWR', 'IBE', 'SAS', 'RYR', 'EZY', 'THY', 'SKY',
]);

const KNOWN_WAYPOINTS = new Set([
  'BNN', 'LAM', 'BIG', 'OCK', 'EPM', 'CHT', 'LON', 'WOD', 'CPT',
  'DMV', 'VAR', 'SAV', 'KRD', 'TRN', 'RAD', 'RUS',
  'DEER', 'ROBER', 'CAMRN', 'LENDY', 'KENDA', 'ZIGGY',
  'RIDGE', 'VALEY', 'CREST', 'FOXT',
  'D15R', 'D08R', 'D15L', 'D08L', 'APX36', 'APX24', 'ILS15', 'ILS20',
]);

const TOWER_PHRASE_PATTERNS: Array<[RegExp, string]> = [
  [/\bcancel takeoff,\s*i say again cancel takeoff\b/i, 'tc_cancel_to'],
  [/\bhold position,\s*stop immediately,\s*abort takeoff\b/i, 'tc_hold_abort'],
  [/\bcancel route,\s*maintain present heading\b/i, 'tc_cancel_present_hdg'],
  [/\bas published,\s*expect further clearance\b/i, 'tc_as_pub_efc'],
  [/\bgo around,\s*climb straight ahead to\b/i, 'tc_go_around_climb'],
  [/\bcleared ils approach runway\b/i, 'tc_clr_ils_app'],
  [/\bexpect vectors ils runway\b/i, 'tc_expect_vec_ils'],
  [/\bcleared ils runway\b/i, 'tc_clr_ils_rwy'],
  [/\bbehind landing traffic\b/i, 'tc_behind_tfc'],
  [/\bturn left heading\b/i, 'tc_turn_left_hdg'],
  [/\bturn right heading\b/i, 'tc_turn_right_hdg'],
  [/\brecleared route via\b/i, 'tc_reclr_via'],
  [/\bclimb and maintain\b/i, 'tc_climb_maint'],
  [/\bdescend and maintain\b/i, 'tc_desc_maint'],
  [/\bcleared for takeoff\b/i, 'tc_clr_takeoff'],
  [/\bline up and wait\b/i, 'tc_lineup_wait'],
  [/\breduce speed to\b/i, 'tc_reduce_spd'],
  [/\bincrease speed to\b/i, 'tc_increase_spd'],
  [/\bproceed direct\b/i, 'tc_proceed_direct'],
  [/\bcleared direct\b/i, 'tc_clr_direct'],
  [/\breport established\b/i, 'tc_rep_est'],
  [/\bmaintain speed\b/i, 'tc_maint_spd'],
  [/\bradio check on\b/i, 'tc_radio_check'],
  [/\bsurface wind\b/i, 'tc_sfc_wind'],
  [/\bfly heading\b/i, 'tc_fly_hdg'],
  [/\bturn heading\b/i, 'tc_turn_hdg'],
  [/\bdescend to\b/i, 'tc_desc_to'],
  [/\bhold at\b/i, 'tc_hold_at'],
  [/\bexpedite\b/i, 'tc_expedite'],
];

const PILOT_PHRASE_PATTERNS: Array<[RegExp, string]> = [
  [/\bunable to stop,\s*past v1,\s*continuing takeoff\b/i, 'pr_unable_stop_v1'],
  [/\bstopping immediately,\s*aborting takeoff runway\b/i, 'pr_stopping_abort'],
  [/\brequesting immediate priority vectors runway\b/i, 'pr_req_priority'],
  [/\bgear down,\s*landing checks complete\b/i, 'pr_gear_down'],
  [/\breadability five,\s*loud and clear\b/i, 'pr_readability_5'],
  [/\bmayday mayday mayday\b/i, 'pr_mayday'],
  [/\bfully established ils runway\b/i, 'pr_fully_est'],
  [/\bestablished localizer runway\b/i, 'pr_est_loc'],
  [/\bcleared ils approach runway\b/i, 'pr_clr_ils_app'],
  [/\bcleared ils runway\b/i, 'pr_clr_ils_rwy'],
  [/\bcleared for takeoff runway\b/i, 'pr_clr_takeoff_rwy'],
  [/\bline up and wait runway\b/i, 'pr_lineup_wait'],
  [/\bunable line up runway\b/i, 'pr_unable_lineup'],
  [/\bwill report established\b/i, 'pr_will_rep_est'],
  [/\broger,\s*turning heading\b/i, 'pr_turning_hdg'],
  [/\bturning left heading\b/i, 'pr_turning_left'],
  [/\bturning right heading\b/i, 'pr_turning_right'],
  [/\bmaintaining present heading\b/i, 'pr_maint_pres_hdg'],
  [/\bminimum fuel emergency\b/i, 'pr_min_fuel'],
  [/\bmedical emergency on board\b/i, 'pr_medical'],
  [/\bengine failure\b/i, 'pr_eng_fail'],
  [/\binbound for vectors\b/i, 'pr_inbound_vec'],
  [/\bholding short runway\b/i, 'pr_holding_short'],
  [/\bready for departure\b/i, 'pr_ready_dep'],
  [/\bproceeding direct\b/i, 'pr_proc_direct'],
  [/\bentering hold at\b/i, 'pr_entering_hold'],
  [/\breducing speed\b/i, 'pr_reducing_spd'],
  [/\bincreasing to\b/i, 'pr_increasing_to'],
  [/\bdescending to\b/i, 'pr_descending_to'],
  [/\bdescending\b/i, 'pr_descending_to'],
  [/\bcontacting ground\b/i, 'pr_contact_gnd'],
  [/\bon runway heading\b/i, 'pr_on_rwy_hdg'],
  [/\bunable takeoff\b/i, 'pr_unable_takeoff'],
  [/\btouchdown runway\b/i, 'pr_touchdown'],
  [/\brolling out\b/i, 'pr_rolling_out'],
  [/\bgoing around\b/i, 'pr_going_around'],
  [/\bas published\b/i, 'pr_as_published'],
  [/\bwith information\b/i, 'pr_with_info'],
  [/\bexpect runway\b/i, 'pr_expect_rwy'],
  [/\bmissed approach\b/i, 'pr_missed_app'],
  [/\bunstable approach\b/i, 'pr_unstable_app'],
  [/\bis reserved for arriving traffic\b/i, 'pr_rwy_reserved'],
  [/\bis temporarily closed\b/i, 'pr_rwy_closed'],
  [/\brunway occupied\b/i, 'pr_rwy_occupied'],
  [/\bis occupied\b/i, 'pr_rwy_occupied'],
  [/\blanding rejected\b/i, 'pr_landing_rej'],
  [/\bleft heading\b/i, 'pr_left_hdg'],
  [/\bright heading\b/i, 'pr_right_hdg'],
  [/\bfly heading\b/i, 'pr_fly_hdg'],
  [/\bcleared via\b/i, 'pr_clr_via'],
  [/\bsquawking\b/i, 'pr_squawking'],
  [/\bexpediting\b/i, 'pr_expediting'],
  [/\bmaintaining\b/i, 'pr_maintaining'],
  [/\bclimbing\b/i, 'pr_climbing'],
  [/\bvacated\b/i, 'pr_vacated'],
  [/\bpassing\b/i, 'pr_passing'],
  [/\bdirect\b/i, 'pr_proc_direct'],
  [/\broute\b/i, 'pr_route'],
  [/\broger\b/i, 'pr_roger'],
  [/\bwilco\b/i, 'pr_wilco'],
];

const AIRPORT_PATTERNS: Array<[RegExp, string]> = [
  [/\bLondon Heathrow Airport\b|\bLondon Heathrow\b/i, 'ap_EGLL'],
  [/\bTehran Mehrabad\b/i, 'ap_OIII'],
  [/\bNew York Kennedy\b/i, 'ap_KJFK'],
  [/\bCrosswind Ridge Academy\b/i, 'ap_TRN1'],
  [/\bConverging Delta Base\b/i, 'ap_TRN2'],
];

const SINGLE_WORD_MAP: Record<string, string> = {
  director: 'fac_director',
  tower: 'fac_tower',
  heavy: 'w_heavy',
  runway: 'w_runway',
  rwy: 'w_runway',
  left: 'w_left',
  right: 'w_right',
  center: 'w_center',
  heading: 'w_heading',
  hdg: 'w_heading',
  feet: 'w_feet',
  ft: 'w_feet',
  knots: 'w_knots',
  kts: 'w_knots',
  kt: 'w_knots',
  degrees: 'w_degrees',
  decimal: 'w_decimal',
  hundred: 'w_hundred',
  thousand: 'w_thousand',
  qnh: 'w_qnh',
  ils: 'w_ils',
  v1: 'w_v1',
  then: 'w_then',
  to: 'w_to',
  at: 'w_at',
  on: 'w_on',
  via: 'w_via',
  with: 'w_with',
  for: 'w_for',
  by: 'w_by',
  is: 'w_is',
  alpha: 'nato_A',
  bravo: 'nato_B',
  charlie: 'nato_C',
  delta: 'nato_D',
  echo: 'nato_E',
  foxtrot: 'nato_F',
  golf: 'nato_G',
  // Airline telephony words when already expanded in pilot readbacks
  speedbird: 'al_BAW',
  iranair: 'al_IRA',
  virgin: 'al_VIR',
  lufthansa: 'al_DLH',
  emirates: 'al_UAE',
  american: 'al_AAL',
  united: 'al_UAL',
  qatari: 'al_QTR',
  swiss: 'al_SWR',
  iberia: 'al_IBE',
  scandinavian: 'al_SAS',
  ryanair: 'al_RYR',
  easy: 'al_EZY',
  turkish: 'al_THY',
  skyline: 'al_SKY',
};

function digitsToTokens(numStr: string): string[] {
  return numStr
    .split('')
    .filter(ch => ch >= '0' && ch <= '9')
    .map(ch => `d_${ch}`);
}

function runwayDesignatorToTokens(rwy: string): string[] {
  const m = rwy.trim().toUpperCase().match(/^(\d{1,2})([LRC])?$/);
  if (!m) return [];
  const tokens = digitsToTokens(m[1].padStart(2, '0'));
  if (m[2] === 'L') tokens.push('w_left');
  if (m[2] === 'R') tokens.push('w_right');
  if (m[2] === 'C') tokens.push('w_center');
  return tokens;
}

function altitudeNumToTokens(altStr: string): string[] {
  const num = parseInt(altStr.replace(/,/g, ''), 10);
  if (Number.isNaN(num)) return digitsToTokens(altStr);
  if (num >= 1000) {
    const thousands = Math.floor(num / 1000);
    const hundreds = Math.round((num % 1000) / 100);
    const out = [...digitsToTokens(String(thousands)), 'w_thousand'];
    if (hundreds > 0) {
      out.push(...digitsToTokens(String(hundreds)), 'w_hundred');
    }
    return out;
  }
  return digitsToTokens(String(num));
}

/**
 * Converts a raw ATC or Pilot transcript into an ordered list of audio sprite token keys.
 * Returns null if any segment cannot be represented cleanly so browser fallback can speak it.
 */
export function tokenizeForVoicePack(
  rawText: string,
  role: 'TOWER' | 'PILOT',
  availableClips?: Record<string, [number, number]>
): string[] | null {
  let text = rawText.trim();
  if (!text) return null;

  // Replace structured constructs with explicit {{tok:...}} placeholders
  const emit = (tokens: string[]) => ` ${tokens.map(t => `__TOK_${t}__`).join(' ')} `;

  // Multi-word airline name first
  text = text.replace(/\bAir France\b/gi, () => emit(['al_AFR']));

  // Airports
  for (const [regex, tok] of AIRPORT_PATTERNS) {
    text = text.replace(regex, () => emit([tok]));
  }

  // Callsigns e.g. BAW452, IRA712A
  text = text.replace(/\b([A-Z]{3})(\d{2,4})([A-Z])?\b/g, (_, prefix: string, digits: string, suffix?: string) => {
    const out: string[] = KNOWN_AIRLINES.has(prefix)
      ? [`al_${prefix}`]
      : prefix.split('').map(ch => `nato_${ch}`);
    out.push(...digitsToTokens(digits));
    if (suffix) out.push(`nato_${suffix}`);
    return emit(out);
  });

  // Role-specific multi-word phrases FIRST (before runway designator consumes the word "runway")
  const phrasePatterns = role === 'TOWER' ? TOWER_PHRASE_PATTERNS : PILOT_PHRASE_PATTERNS;
  for (const [regex, tok] of phrasePatterns) {
    text = text.replace(regex, () => emit([tok]));
  }

  // Runway designators: "runway 27R", "RWY 29L" (standalone cases not consumed by a phrase ending in "runway")
  text = text.replace(/\b(?:RWY|Runway)\s+(\d{1,2}[LRC]?)\b/gi, (_, rwy: string) => {
    return emit(['w_runway', ...runwayDesignatorToTokens(rwy)]);
  });

  // Flight levels
  text = text.replace(/\b(?:Flight Level|FL)\s*0*(\d{2,3})\b/gi, (_, fl: string) => {
    return emit(['w_fl', ...digitsToTokens(fl.padStart(3, '0'))]);
  });

  // Altitudes ("3,500 feet", "4000 ft")
  text = text.replace(/\b(\d{1,2},?\d{3})\s*(?:feet|ft)\b/gi, (_, alt: string) => {
    return emit([...altitudeNumToTokens(alt), 'w_feet']);
  });

  // Speed ("180 knots", "210kt")
  text = text.replace(/\b(\d{2,3})\s*(?:knots|kts|kt)\b/gi, (_, spd: string) => {
    return emit([...digitsToTokens(spd), 'w_knots']);
  });

  // Frequencies ("119.725 MHz", "121.9")
  text = text.replace(/\b(\d{3})\.(\d{1,3})(?:\s*MHz)?\b/gi, (_, whole: string, frac: string) => {
    const trimmed = frac.replace(/0+$/, '') || '0';
    return emit([...digitsToTokens(whole), 'w_decimal', ...digitsToTokens(trimmed)]);
  });

  // Wind ("260/14kt" -> normalized)
  text = text.replace(
    /\bwind\s+(\d{3})\s*(?:degrees\s*)?(?:at|\/)\s*(\d{1,2})(?:\s*(?:knots|kt|kts))?\b/gi,
    (_, dir: string, spd: string) =>
      emit([...digitsToTokens(dir), 'w_degrees', ...digitsToTokens(spd), 'w_knots'])
  );

  // Parse remaining words & placeholders
  const parts = text
    .replace(/[,;·()!?]/g, ' ')
    .replace(/\.(?=\s|$)/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const tokens: string[] = [];
  for (const part of parts) {
    const tokMatch = part.match(/^__TOK_([A-Za-z0-9_]+)__$/);
    if (tokMatch) {
      tokens.push(tokMatch[1]);
      continue;
    }

    const upper = part.toUpperCase();
    const lower = part.toLowerCase();

    if (KNOWN_WAYPOINTS.has(upper)) {
      tokens.push(`wp_${upper}`);
      continue;
    }
    if (SINGLE_WORD_MAP[lower]) {
      tokens.push(SINGLE_WORD_MAP[lower]);
      continue;
    }
    if (/^\d+$/.test(part)) {
      tokens.push(...digitsToTokens(part));
      continue;
    }
    if (/^[A-Z]$/.test(upper)) {
      tokens.push(`nato_${upper}`);
      continue;
    }
    if (/^\d{1,2}[LRC]$/.test(upper)) {
      tokens.push(...runwayDesignatorToTokens(upper));
      continue;
    }

    // Unrecognized word -> bail out cleanly so browser fallback handles it
    return null;
  }

  if (tokens.length === 0) return null;
  if (availableClips) {
    for (const t of tokens) {
      if (!availableClips[t]) return null;
    }
  }

  return tokens;
}

export const PILOT_PACK_IDS = [
  'pilot_thomas',
  'pilot_libby',
  'pilot_brian',
  'pilot_clara',
  'pilot_prabhat',
  'pilot_connor',
] as const;

export const TOWER_PACK_ID_MAP: Record<string, string> = {
  charon: 'tower_charon',
  fenrir: 'tower_fenrir',
  kore: 'tower_kore',
  zephyr: 'tower_zephyr',
  puck: 'tower_puck',
};

export class OfflineVoicePackPlayer {
  private manifest: VoicePackManifest | null = null;
  private manifestPromise: Promise<VoicePackManifest | null> | null = null;
  private bufferCache = new Map<string, AudioBuffer>();
  private bufferPromises = new Map<string, Promise<AudioBuffer | null>>();
  private activeNodes: AudioBufferSourceNode[] = [];

  public async loadManifest(): Promise<VoicePackManifest | null> {
    if (this.manifest) return this.manifest;
    if (this.manifestPromise) return this.manifestPromise;

    if (typeof fetch !== 'function') return null;

    this.manifestPromise = fetch('/voice-pack/manifest.json')
      .then(async res => {
        if (!res.ok) return null;
        const data = (await res.json()) as VoicePackManifest;
        if (!data?.speakers) return null;
        this.manifest = data;
        return data;
      })
      .catch(() => null);

    return this.manifestPromise;
  }

  public getManifestSync(): VoicePackManifest | null {
    return this.manifest;
  }

  public async loadSpeakerBuffer(
    speakerId: string,
    ctx: AudioContext
  ): Promise<AudioBuffer | null> {
    const cached = this.bufferCache.get(speakerId);
    if (cached) return cached;

    const existingPromise = this.bufferPromises.get(speakerId);
    if (existingPromise) return existingPromise;

    const manifest = await this.loadManifest();
    const spec = manifest?.speakers?.[speakerId];
    if (!spec) return null;

    const p = fetch(spec.file)
      .then(async res => {
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arr);
        this.bufferCache.set(speakerId, audioBuf);
        return audioBuf;
      })
      .catch(() => null);

    this.bufferPromises.set(speakerId, p);
    return p;
  }

  public stopActive() {
    for (const node of this.activeNodes) {
      try {
        node.stop();
      } catch {
        // Ignore already-stopped nodes
      }
    }
    this.activeNodes = [];
  }

  /**
   * Plays a tokenized aviation transmission from the offline real-human MP3 sprite pack
   * through an authentic VHF Radio DSP filter chain (350-3000Hz + compressor).
   */
  public async playTransmission(params: {
    ctx: AudioContext;
    speakerId: string;
    role: 'TOWER' | 'PILOT';
    rawText: string;
    volume: number;
    playbackRate?: number;
    bandpassHz?: number;
    shouldAbort: () => boolean;
  }): Promise<boolean> {
    const manifest = await this.loadManifest();
    const spk = manifest?.speakers?.[params.speakerId];
    if (!spk || params.shouldAbort()) return false;

    const tokens = tokenizeForVoicePack(params.rawText, params.role, spk.clips);
    if (!tokens || tokens.length === 0) return false;

    const audioBuffer = await this.loadSpeakerBuffer(params.speakerId, params.ctx);
    if (!audioBuffer || params.shouldAbort()) return false;

    const rate = params.playbackRate ?? 1.0;

    // Build VHF Aviation Radio DSP chain
    const highpass = params.ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 340;

    const presence = params.ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = params.bandpassHz ?? (params.role === 'TOWER' ? 1320 : 1520);
    presence.Q.value = 1.15;
    presence.gain.value = params.role === 'PILOT' ? 5.0 : 3.2;

    const lowpass = params.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = params.role === 'TOWER' ? 3200 : 2850;

    const compressor = params.ctx.createDynamicsCompressor();
    compressor.threshold.value = -19;
    compressor.knee.value = 8;
    compressor.ratio.value = 7;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.14;

    const masterGain = params.ctx.createGain();
    masterGain.gain.value = Math.min(1.25, params.volume * (params.role === 'TOWER' ? 1.08 : 0.98));

    highpass.connect(presence);
    presence.connect(lowpass);
    lowpass.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(params.ctx.destination);

    let scheduledCursor = params.ctx.currentTime + 0.025;
    const sources: AudioBufferSourceNode[] = [];
    const wordGapSec = 0.028;

    for (const tok of tokens) {
      const span = spk.clips[tok];
      if (!span) continue;
      const [clipOffset, clipDur] = span;
      if (clipDur <= 0.01) continue;

      const scaledDur = clipDur / rate;
      const src = params.ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.playbackRate.value = rate;

      // Micro fade envelope prevents splice clicks between tokens
      const clipGain = params.ctx.createGain();
      clipGain.gain.setValueAtTime(0.001, scheduledCursor);
      clipGain.gain.linearRampToValueAtTime(1.0, scheduledCursor + 0.008);
      clipGain.gain.setValueAtTime(1.0, Math.max(scheduledCursor + 0.009, scheduledCursor + scaledDur - 0.01));
      clipGain.gain.linearRampToValueAtTime(0.001, scheduledCursor + scaledDur + 0.004);

      src.connect(clipGain);
      clipGain.connect(highpass);

      src.start(scheduledCursor, Math.max(0, clipOffset - 0.004), clipDur + 0.012);
      sources.push(src);

      scheduledCursor += scaledDur + wordGapSec;
    }

    if (sources.length === 0) return false;
    this.activeNodes = sources;

    const totalMs = Math.max(80, (scheduledCursor - params.ctx.currentTime) * 1000);
    return new Promise<boolean>(resolve => {
      let finished = false;
      const done = (ok: boolean) => {
        if (finished) return;
        finished = true;
        this.activeNodes = [];
        resolve(ok);
      };

      const lastSource = sources[sources.length - 1];
      lastSource.onended = () => done(!params.shouldAbort());

      setTimeout(() => {
        if (!finished) done(!params.shouldAbort());
      }, totalMs + 250);
    });
  }
}

export const voicePackPlayer = new OfflineVoicePackPlayer();
