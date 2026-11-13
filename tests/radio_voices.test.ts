import { describe, it, expect, beforeEach } from 'vitest';
import {
  TOWER_VOICE_PROFILES,
  VoiceLike,
  rankOfflineEnglishVoices,
  resolveTowerOfflineVoice,
  resolveOfflinePilotProfile,
  radioAudio,
  formatPhraseForSpeech,
} from '../src/audio/radioAudio';
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

describe('100% Offline Multi-Voice Radio Engine & Selectable Tower Voice', () => {
  beforeEach(() => {
    radioAudio.setTowerVoiceId('charon');
    useSimulationStore.getState().setTowerVoice('charon');
  });

  it('prioritizes local offline OS voices above non-local cloud voices and robotic voices', () => {
    const ranked = rankOfflineEnglishVoices(MOCK_OFFLINE_VOICES);
    expect(ranked[0].localService).toBe(true);
    // Cloud-only Google voice and robotic eSpeak rank below natural local voices
    const cloudIdx = ranked.findIndex(v => v.voiceURI === 'cloud-google-us');
    const robotIdx = ranked.findIndex(v => v.voiceURI === 'robot-espeak');
    expect(cloudIdx).toBeGreaterThan(3);
    expect(robotIdx).toBe(ranked.length - 1);
  });

  it('supports selecting both preset Tower controller roles and exact installed offline voices', () => {
    expect(TOWER_VOICE_PROFILES).toHaveLength(5);

    const femalePreset = resolveTowerOfflineVoice(MOCK_OFFLINE_VOICES, 'kore', 'EGLL');
    expect(femalePreset.voice?.voiceURI).toBe('ms-hazel');

    const customDevice = resolveTowerOfflineVoice(MOCK_OFFLINE_VOICES, 'voice:apple-karen', 'EGLL');
    expect(customDevice.voice?.voiceURI).toBe('apple-karen');

    useSimulationStore.getState().setTowerVoice('voice:ms-david');
    expect(useSimulationStore.getState().towerVoiceId).toBe('voice:ms-david');
    expect(radioAudio.getTowerVoiceId()).toBe('voice:ms-david');
  });

  it('never assigns any flight the same offline voice as the user-selected Tower voice', () => {
    const fleet = ['BAW452', 'IRA712', 'AFR228', 'UAE310', 'DAL114'];

    for (const preset of TOWER_VOICE_PROFILES) {
      const tower = resolveTowerOfflineVoice(MOCK_OFFLINE_VOICES, preset.id, 'EGLL');
      for (const cs of fleet) {
        const pilot = resolveOfflinePilotProfile(cs, MOCK_OFFLINE_VOICES, tower.voice, {
          activeCallsigns: fleet,
        });
        expect(pilot.voiceURI).not.toBe(tower.voice?.voiceURI);
      }
    }

    const customTower = resolveTowerOfflineVoice(MOCK_OFFLINE_VOICES, 'voice:ms-george', 'EGLL');
    for (const cs of fleet) {
      const pilot = resolveOfflinePilotProfile(cs, MOCK_OFFLINE_VOICES, customTower.voice, {
        activeCallsigns: fleet,
      });
      expect(pilot.voiceURI).not.toBe('ms-george');
    }
  });

  it('gives every flight a distinct voice & acoustic hardware profile, even on single-voice OS setups', () => {
    const fleet = ['BAW452', 'IRA712', 'AFR228', 'UAE310'];

    // Case A: Multi-voice device distributes across distinct installed offline voices
    const tower = resolveTowerOfflineVoice(MOCK_OFFLINE_VOICES, 'charon', 'EGLL');
    const multiProfiles = fleet.map(cs =>
      resolveOfflinePilotProfile(cs, MOCK_OFFLINE_VOICES, tower.voice, {
        airline: cs.slice(0, 3),
        activeCallsigns: fleet,
      })
    );
    expect(new Set(multiProfiles.map(p => p.voiceURI)).size).toBe(4);
    expect(new Set(multiProfiles.map(p => p.carrierCenterHz)).size).toBeGreaterThanOrEqual(3);

    // Case B: Minimal 1-voice device still differentiates every flight via vocal pitch/rate register & mic DSP
    const singleVoice: VoiceLike[] = [
      { voiceURI: 'only-voice', name: 'Local Default Voice', lang: 'en-US', localService: true },
    ];
    const singleProfiles = fleet.map(cs =>
      resolveOfflinePilotProfile(cs, singleVoice, singleVoice[0], {
        airline: cs.slice(0, 3),
        activeCallsigns: fleet,
      })
    );
    expect(new Set(singleProfiles.map(p => `${p.pitch.toFixed(2)}_${p.rate.toFixed(2)}`)).size).toBeGreaterThanOrEqual(3);
  });

  it('preserves ICAO radiotelephony formatting for offline speech synthesis', () => {
    const spoken = formatPhraseForSpeech('IRA712, cleared ILS runway 29R, descend 3,000 feet');
    expect(spoken).toContain('Iranair seven one two');
    expect(spoken).toContain('I L S');
    expect(spoken).toContain('runway two niner right');
    expect(spoken).toContain('three thousand feet');
  });
});
