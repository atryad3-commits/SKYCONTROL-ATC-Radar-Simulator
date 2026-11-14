import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import bundledManifest from '../src/audio/voicePackManifest.json';
import {
  TOWER_VOICE_PROFILES,
  VoiceLike,
  rankOfflineEnglishVoices,
  resolveTowerOfflineVoice,
  resolveOfflinePilotProfile,
  radioAudio,
  formatPhraseForSpeech,
} from '../src/audio/radioAudio';
import {
  tokenizeForVoicePack,
  PILOT_PACK_IDS,
  TOWER_PACK_ID_MAP,
} from '../src/audio/voicePackPlayer';
import { useSimulationStore } from '../src/store/simulationStore';

const MOCK_OFFLINE_VOICES: VoiceLike[] = [
  { voiceURI: 'cloud-google-us', name: 'Google US English', lang: 'en-US', localService: false },
  { voiceURI: 'ms-george', name: 'Microsoft George - English (UK)', lang: 'en-GB', localService: true },
  { voiceURI: 'ms-hazel', name: 'Microsoft Hazel - English (UK)', lang: 'en-GB', localService: true },
  { voiceURI: 'ms-david', name: 'Microsoft David - English (US)', lang: 'en-US', localService: true },
  { voiceURI: 'ms-zira', name: 'Microsoft Zira - English (US)', lang: 'en-US', localService: true },
  { voiceURI: 'apple-karen', name: 'Karen (Enhanced)', lang: 'en-AU', localService: true },
  { voiceURI: 'robot-espeak', name: 'eSpeak English', lang: 'en-US', localService: true },
];

describe('100% Offline Multi-Voice Pack & Selectable Tower Voice', () => {
  beforeEach(() => {
    radioAudio.setTowerVoiceId('charon');
    useSimulationStore.getState().setTowerVoice('charon');
  });

  it('prioritizes local offline OS voices above non-local cloud voices and robotic voices', () => {
    const ranked = rankOfflineEnglishVoices(MOCK_OFFLINE_VOICES);
    expect(ranked[0].localService).toBe(true);
    const cloudIdx = ranked.findIndex(v => v.voiceURI === 'cloud-google-us');
    const robotIdx = ranked.findIndex(v => v.voiceURI === 'robot-espeak');
    expect(cloudIdx).toBeGreaterThan(3);
    expect(robotIdx).toBe(ranked.length - 1);
  });

  it('supports selecting both 5 bundled Tower voices and exact installed offline OS voices', () => {
    expect(TOWER_VOICE_PROFILES).toHaveLength(5);
    expect(Object.keys(TOWER_PACK_ID_MAP)).toHaveLength(5);

    const femalePreset = resolveTowerOfflineVoice(MOCK_OFFLINE_VOICES, 'kore', 'EGLL');
    expect(femalePreset.packSpeakerId).toBe('tower_kore');
    expect(femalePreset.voice?.voiceURI).toBe('ms-hazel');

    const customDevice = resolveTowerOfflineVoice(MOCK_OFFLINE_VOICES, 'voice:apple-karen', 'EGLL');
    expect(customDevice.packSpeakerId).toBeNull();
    expect(customDevice.voice?.voiceURI).toBe('apple-karen');

    useSimulationStore.getState().setTowerVoice('voice:ms-david');
    expect(useSimulationStore.getState().towerVoiceId).toBe('voice:ms-david');
    expect(radioAudio.getTowerVoiceId()).toBe('voice:ms-david');
  });

  it('keeps Tower voice pool and 6 Pilot voice packs 100% disjoint and distributes active flights', () => {
    const towerPackIds = new Set(Object.values(TOWER_PACK_ID_MAP));
    for (const pId of PILOT_PACK_IDS) {
      expect(towerPackIds.has(pId)).toBe(false);
    }

    const fleet = ['BAW452', 'IRA712', 'AFR228', 'UAE310', 'DAL114', 'DLH802'];
    const profiles = fleet.map(cs =>
      resolveOfflinePilotProfile(cs, MOCK_OFFLINE_VOICES, MOCK_OFFLINE_VOICES[1], {
        airline: cs.slice(0, 3),
        activeCallsigns: fleet,
      })
    );
    // All 6 flights receive distinct bundled pilot voices AND never share Tower OS voice
    expect(new Set(profiles.map(p => p.packSpeakerId)).size).toBe(6);
    for (const p of profiles) {
      expect(p.voiceURI).not.toBe(MOCK_OFFLINE_VOICES[1].voiceURI);
    }
  });

  it('tokenizes all ATC Tower commands cleanly into voice-pack tokens', () => {
    const atcCommands = [
      'BAW452, fly heading 270',
      'IRA712, cancel route, maintain present heading 095',
      'AFR228, turn left heading 180',
      'UAE310, turn right heading 315',
      'DAL114, climb and maintain 12,000 feet',
      'BAW452, descend and maintain 3,000 feet, QNH 1013, expedite',
      'IRA712, reduce speed to 180 knots',
      'AFR228, increase speed to 220 knots',
      'UAE310, maintain speed 190 knots',
      'BAW452, cleared direct BNN',
      'BAW452, recleared route via BNN then LAM',
      'IRA712, proceed direct DMV, VAR, then ILS runway 29R',
      'BAW452, expect vectors ILS runway 27R',
      'IRA712, turn heading 240, descend to 3,000 feet QNH 1016, cleared ILS runway 29R',
      'DAL114, cleared ILS approach runway 31L, report established',
      'BAW452, go around, climb straight ahead to 3,000 feet',
      'BAW452, hold at OCK as published, expect further clearance',
      'BAW452, behind landing traffic, runway 27L line up and wait',
      'BAW452, surface wind 260 degrees 14 knots, QNH 1013, runway 27L cleared for takeoff',
      'BAW452, cancel takeoff, I say again cancel takeoff!',
      'BAW452, hold position, stop immediately, abort takeoff!',
      'BAW452, London Heathrow Airport Director, radio check on 119.725 MHz',
    ];

    for (const cmd of atcCommands) {
      const tokens = tokenizeForVoicePack(cmd, 'TOWER');
      expect(tokens, `Failed to tokenize ATC command: ${cmd}`).not.toBeNull();
      expect(tokens!.length).toBeGreaterThan(2);
    }
  });

  it('tokenizes all Pilot readbacks, check-ins, ILS callouts, and Maydays cleanly', () => {
    const pilotMessages = [
      'Roger, turning heading 270, Speedbird 452',
      'Maintaining present heading 095, Iranair 712',
      'Turning left heading 180, Air France 228',
      'Wilco, right 315, Emirates 310',
      'Climbing 12,000 feet, Delta 114',
      'Descending to 3,000 feet, expediting, QNH 1013, Speedbird 452',
      'Reducing speed 180 knots, Iranair 712',
      'Increasing to 220 knots, Air France 228',
      'Maintaining 190 knots, Emirates 310',
      'Proceeding direct BNN, Speedbird 452',
      'Cleared via BNN then LAM, Speedbird 452',
      'Route DMV, VAR, then ILS runway 29R, Iranair 712',
      'Expect runway 27R, Speedbird 452',
      'Heading 240, descending 3,000 feet, cleared ILS runway 29R, Iranair 712',
      'Cleared ILS approach runway 31L, will report established, Delta 114',
      'Going around, climbing 3,000 feet on runway heading, Speedbird 452',
      'Entering hold at OCK as published, Speedbird 452',
      'Line up and wait runway 27L, Speedbird 452',
      'Unable line up runway 27L, Runway 27L is occupied by BAW452',
      'Cleared for takeoff runway 27L, Speedbird 452',
      'Unable to stop, past V1, continuing takeoff, Speedbird 452',
      'Stopping immediately, aborting takeoff runway 27L, Speedbird 452',
      'London Heathrow Airport Director, BAW452 Heavy, passing 8,000 feet direct LAM, with information Alpha.',
      'Tehran Mehrabad Tower, IRA712, holding short runway 29L, ready for departure.',
      'Mayday Mayday Mayday! New York Kennedy Director, AAL101 Heavy, squawking 7700, engine failure, requesting immediate priority vectors runway 31L!',
      'London Heathrow Airport Director, BAW452, established localizer runway 27R.',
      'BAW452, fully established ILS runway 27R, gear down, landing checks complete.',
      'BAW452, touchdown runway 27R, rolling out.',
      'BAW452, runway 27R vacated, contacting ground 121.9.',
      'BAW452, going around runway 27R, missed approach.',
      'Readability five, loud and clear, Speedbird 452',
    ];

    for (const msg of pilotMessages) {
      const tokens = tokenizeForVoicePack(msg, 'PILOT');
      expect(tokens, `Failed to tokenize Pilot message: ${msg}`).not.toBeNull();
      expect(tokens!.length).toBeGreaterThan(2);
    }
  });

  it('preserves ICAO radiotelephony formatting for OS speech synthesis fallback', () => {
    const spoken = formatPhraseForSpeech('IRA712, cleared ILS runway 29R, descend 3,000 feet');
    expect(spoken).toContain('Iranair seven one two');
    expect(spoken).toContain('I L S');
    expect(spoken).toContain('runway two niner right');
    expect(spoken).toContain('three thousand feet');
  });

  it('ships valid offline MP3 audio sprites and synchronized manifest entries for all 11 speakers', () => {
    const expectedSpeakers = [
      ...Object.values(TOWER_PACK_ID_MAP),
      ...PILOT_PACK_IDS,
    ];
    expect(expectedSpeakers).toHaveLength(11);

    const publicManifestPath = path.resolve(process.cwd(), 'public/voice-pack/manifest.json');
    expect(fs.existsSync(publicManifestPath)).toBe(true);
    const publicManifest = JSON.parse(fs.readFileSync(publicManifestPath, 'utf8'));

    expect(Object.keys(bundledManifest.speakers).sort()).toEqual([...expectedSpeakers].sort());
    expect(Object.keys(publicManifest.speakers).sort()).toEqual([...expectedSpeakers].sort());

    const atcSamples = [
      'BAW452, fly heading 270',
      'IRA712, cancel route, maintain present heading 095',
      'DAL114, climb and maintain 12,000 feet',
      'BAW452, descend and maintain 3,000 feet, QNH 1013, expedite',
      'IRA712, reduce speed to 180 knots',
      'BAW452, cleared direct BNN',
      'BAW452, recleared route via BNN then LAM',
      'IRA712, proceed direct DMV, VAR, then ILS runway 29R',
      'BAW452, expect vectors ILS runway 27R',
      'DAL114, cleared ILS approach runway 31L, report established',
      'BAW452, go around, climb straight ahead to 3,000 feet',
      'BAW452, hold at OCK as published, expect further clearance',
      'BAW452, behind landing traffic, runway 27L line up and wait',
      'BAW452, surface wind 260 degrees 14 knots, QNH 1013, runway 27L cleared for takeoff',
      'BAW452, cancel takeoff, I say again cancel takeoff!',
      'BAW452, hold position, stop immediately, abort takeoff!',
      'BAW452, London Heathrow Airport Director, radio check on 119.725 MHz',
    ];

    const pilotSamples = [
      'Roger, turning heading 270, Speedbird 452',
      'Maintaining present heading 095, Iranair 712',
      'Turning left heading 180, Air France 228',
      'Wilco, right 315, Emirates 310',
      'Climbing 12,000 feet, Delta 114',
      'Descending to 3,000 feet, expediting, QNH 1013, Speedbird 452',
      'Proceeding direct BNN, Speedbird 452',
      'Route DMV, VAR, then ILS runway 29R, Iranair 712',
      'Expect runway 27R, Speedbird 452',
      'Cleared ILS approach runway 31L, will report established, Delta 114',
      'Going around, climbing 3,000 feet on runway heading, Speedbird 452',
      'Entering hold at OCK as published, Speedbird 452',
      'Line up and wait runway 27L, Speedbird 452',
      'Unable line up runway 27L, Runway 27L is occupied by BAW452',
      'Cleared for takeoff runway 27L, Speedbird 452',
      'Unable to stop, past V1, continuing takeoff, Speedbird 452',
      'Stopping immediately, aborting takeoff runway 27L, Speedbird 452',
      'London Heathrow Airport Director, BAW452 Heavy, passing 8,000 feet direct LAM, with information Alpha.',
      'Tehran Mehrabad Tower, IRA712, holding short runway 29L, ready for departure.',
      'Mayday Mayday Mayday! New York Kennedy Director, AAL101 Heavy, squawking 7700, engine failure, requesting immediate priority vectors runway 31L!',
      'London Heathrow Airport Director, BAW452, established localizer runway 27R.',
      'BAW452, fully established ILS runway 27R, gear down, landing checks complete.',
      'BAW452, touchdown runway 27R, rolling out.',
      'BAW452, runway 27R vacated, contacting ground 121.9.',
      'BAW452, going around runway 27R, missed approach.',
      'Readability five, loud and clear, Speedbird 452',
    ];

    for (const speakerId of expectedSpeakers) {
      const mp3Path = path.resolve(process.cwd(), `public/voice-pack/${speakerId}.mp3`);
      expect(fs.existsSync(mp3Path), `Missing MP3 file for ${speakerId}`).toBe(true);
      expect(fs.statSync(mp3Path).size, `MP3 too small for ${speakerId}`).toBeGreaterThan(300_000);

      const spk = (bundledManifest.speakers as unknown as Record<string, { role: 'TOWER' | 'PILOT'; clips: Record<string, [number, number]> }>)[speakerId];
      expect(spk, `Missing bundled manifest entry for ${speakerId}`).toBeDefined();

      const samples = spk.role === 'TOWER' ? atcSamples : pilotSamples;
      for (const sample of samples) {
        const tokens = tokenizeForVoicePack(sample, spk.role, spk.clips);
        expect(tokens, `Missing clip token for ${speakerId} on: ${sample}`).not.toBeNull();
      }
    }
  });
});
