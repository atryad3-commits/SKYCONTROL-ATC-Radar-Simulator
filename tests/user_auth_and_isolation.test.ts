import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ALL_VALID_AIRPORT_ICAOS,
  buildDefaultUserPreferences,
  DEFAULT_RADAR_LAYERS_CONFIG,
  deleteUserScenario,
  loadOrCreateUserPreferences,
  loadUserActivities,
  loadUserScenarios,
  mapAuthErrorMessage,
  recordControllerActivityAndStats,
  registerOfflineAccount,
  restoreOfflineAccountBundle,
  sanitizeCallsign,
  sanitizePerAirportVisibilityMap,
  sanitizeRadarLayers,
  sanitizeScenarioInput,
  saveUserPreferences,
  saveUserScenario,
  signInOfflineAccount,
  signOutAccount,
  updateControllerCallsign,
} from '../src/services/persistenceService';
import { clearMemoryOfflineStoreForTests } from '../src/services/offlineAccountService';
import { LocalAccountManager } from '../server/localAccountManager';
import { ALL_AIRPORT_PROFILES } from '../src/airports/airportsRegistry';
import { DEFAULT_RADAR_LAYERS, useSimulationStore } from '../src/store/simulationStore';
import { CustomScenarioConfig, UserPreferencesData } from '../src/types';
import {
  DEFAULT_RADAR_THEME_ID,
  getRadarTheme,
  normalizeRadarThemeId,
  RADAR_THEME_LIST,
} from '../src/utils/radarThemes';
import { getAltitudeColor } from '../src/utils/altitudeColor';

describe('Per-User Auth, Preferences & State Isolation', () => {
  beforeEach(() => {
    useSimulationStore.getState().resetForSignOut();
  });

  it('includes all 16 registered airports in scenario validation allowlist', () => {
    const registryIcaos = ALL_AIRPORT_PROFILES.map(p => p.airport.icao);
    for (const icao of registryIcaos) {
      expect(ALL_VALID_AIRPORT_ICAOS).toContain(icao);
    }
    expect(ALL_VALID_AIRPORT_ICAOS.length).toBe(registryIcaos.length);
  });

  it('preserves all 16 airports and clamps numeric bounds in sanitizeScenarioInput', () => {
    const base: CustomScenarioConfig = {
      id: 'scn_test_1',
      ownerId: 'spoofed_other_user',
      name: '  Tehran Rush Hour  ',
      description: 'Dense arrivals with gusty crosswind.',
      difficulty: 'Advanced',
      airportIcao: 'OIII',
      landingRunwayId: '29L',
      departureRunwayId: '29R',
      windDirection: 750,
      windSpeed: 120,
      gusts: 15,
      qnh: 1200,
      visibilityNM: 99,
      ceilingFeet: 50000,
      precipitation: 'Rain',
      initialInbounds: 40,
      initialDepartures: -5,
      spawnIntervalSec: 3,
      heavyRatio: 4.5,
      allowEmergencies: true,
      emergencyDelaySec: 999,
    };

    const sanitized = sanitizeScenarioInput(base, 'uid_controller_a');
    expect(sanitized.ownerId).toBe('uid_controller_a');
    expect(sanitized.airportIcao).toBe('OIII');
    expect(sanitized.name).toBe('Tehran Rush Hour');
    expect(sanitized.windDirection).toBe(30);
    expect(sanitized.windSpeed).toBe(60);
    expect(sanitized.gusts).toBe(60);
    expect(sanitized.qnh).toBe(1050);
    expect(sanitized.visibilityNM).toBe(20);
    expect(sanitized.ceilingFeet).toBe(20000);
    expect(sanitized.initialInbounds).toBe(12);
    expect(sanitized.initialDepartures).toBe(0);
    expect(sanitized.spawnIntervalSec).toBe(10);
    expect(sanitized.heavyRatio).toBe(1);
    expect(sanitized.emergencyDelaySec).toBe(300);

    // Training and international airports stay valid
    for (const icao of ['OIIE', 'OISS', 'RJTT', 'TRN1', 'TRN2'] as const) {
      const scn = sanitizeScenarioInput({ ...base, airportIcao: icao }, 'uid_controller_a');
      expect(scn.airportIcao).toBe(icao);
    }
  });

  it('sanitizes radar layers and per-airport visibility maps without leaking invalid keys', () => {
    const layers = sanitizeRadarLayers({ terrain: false, speedVectors: false });
    expect(layers.terrain).toBe(false);
    expect(layers.speedVectors).toBe(false);
    expect(layers.runways).toBe(DEFAULT_RADAR_LAYERS_CONFIG.runways);

    const vis = sanitizePerAirportVisibilityMap({
      OIII: {
        visibleStarIds: ['INVALID_STAR'],
        visibleSidIds: [],
        visibleWaypoints: ['NON_EXISTENT_FIX'],
      },
    });

    expect(Object.keys(vis).length).toBe(ALL_AIRPORT_PROFILES.length);
    expect(vis.OIII.visibleStarIds).toEqual([]);
    expect(vis.OIII.visibleSidIds).toEqual([]);
    expect(vis.OIII.visibleWaypoints).toEqual([]);
  });

  it('strictly isolates radar, route, airport, and audio preferences between two users', () => {
    const prefsUserA: UserPreferencesData = {
      ...buildDefaultUserPreferences('uid_user_a'),
      preferredAirportIcao: 'OIII',
      preferredLandingRunwayId: '29L',
      preferredDepartureRunwayId: '29R',
      simSpeed: 2,
      audioMuted: true,
      audioVolume: 0.35,
      towerVoiceId: 'fenrir',
      radioPreset: 'weak_signal',
      radarLayers: {
        ...DEFAULT_RADAR_LAYERS,
        terrain: false,
        radarSweep: false,
      },
      perAirportVisibility: sanitizePerAirportVisibilityMap({
        OIII: {
          visibleStarIds: [],
          visibleSidIds: [],
          visibleWaypoints: [],
        },
      }),
    };

    useSimulationStore.getState().applyUserPreferences(prefsUserA);

    let state = useSimulationStore.getState();
    expect(state.airport.icao).toBe('OIII');
    expect(state.activeLandingRunwayId).toBe('29L');
    expect(state.activeDepartureRunwayId).toBe('29R');
    expect(state.simSpeed).toBe(2);
    expect(state.audioMuted).toBe(true);
    expect(state.audioVolume).toBeCloseTo(0.35, 2);
    expect(state.radioPreset).toBe('weak_signal');
    expect(state.radarLayers.terrain).toBe(false);
    expect(state.radarLayers.radarSweep).toBe(false);
    expect(state.perAirportVisibility.OIII.visibleStarIds).toEqual([]);
    expect(state.isPaused).toBe(true);
    expect(state.hasCompletedStartupSetup).toBe(false);

    // Signing out must completely reset state so User B never sees User A's settings
    useSimulationStore.getState().resetForSignOut();

    state = useSimulationStore.getState();
    expect(state.airport.icao).toBe('EGLL');
    expect(state.simSpeed).toBe(1);
    expect(state.audioMuted).toBe(false);
    expect(state.audioVolume).toBeCloseTo(0.8, 2);
    expect(state.towerVoiceId).toBe('charon');
    expect(state.radioPreset).toBe('normal_aviation');
    expect(state.radarLayers.terrain).toBe(true);
    expect(state.radarLayers.radarSweep).toBe(true);
    expect(state.perAirportVisibility.OIII.visibleStarIds.length).toBeGreaterThan(0);

    // User B signs in with independent preferences
    const prefsUserB: UserPreferencesData = {
      ...buildDefaultUserPreferences('uid_user_b'),
      preferredAirportIcao: 'KJFK',
      preferredLandingRunwayId: '31R',
      preferredDepartureRunwayId: '31L',
      simSpeed: 5,
      audioMuted: false,
      audioVolume: 0.95,
      radioPreset: 'clear_communication',
    };
    useSimulationStore.getState().applyUserPreferences(prefsUserB);

    state = useSimulationStore.getState();
    expect(state.airport.icao).toBe('KJFK');
    expect(state.simSpeed).toBe(5);
    expect(state.audioMuted).toBe(false);
    expect(state.radioPreset).toBe('clear_communication');
  });

  it('supports 6 radar scope themes, high-contrast light altitude colors, and per-user theme persistence', () => {
    expect(RADAR_THEME_LIST.length).toBe(6);
    expect(DEFAULT_RADAR_THEME_ID).toBe('phosphor_crt');
    expect(normalizeRadarThemeId('amber_atc')).toBe('amber_atc');
    expect(normalizeRadarThemeId('daylight_paper')).toBe('daylight_paper');
    expect(normalizeRadarThemeId('invalid_theme_name')).toBe('phosphor_crt');
    expect(normalizeRadarThemeId(undefined)).toBe('phosphor_crt');

    const daylight = getRadarTheme('daylight_paper');
    expect(daylight.isLight).toBe(true);
    expect(daylight.crtScanlineOpacity).toBe(0);
    expect(getAltitudeColor(11000, false)).not.toBe(getAltitudeColor(11000, true));

    useSimulationStore.getState().setRadarTheme('obsidian_blue');
    expect(useSimulationStore.getState().radarTheme).toBe('obsidian_blue');

    const prefsWithTheme: UserPreferencesData = {
      ...buildDefaultUserPreferences('uid_theme_user'),
      radarTheme: 'amber_atc',
    };
    useSimulationStore.getState().applyUserPreferences(prefsWithTheme);
    expect(useSimulationStore.getState().radarTheme).toBe('amber_atc');

    useSimulationStore.getState().resetForSignOut();
    expect(useSimulationStore.getState().radarTheme).toBe('phosphor_crt');
  });

  it('sanitizes callsigns and maps Firebase auth errors cleanly', () => {
    expect(sanitizeCallsign('  CTR-ALPHA1  ')).toBe('CTR-ALPHA1');
    expect(sanitizeCallsign('x')).toBe('ATC-TRAINEE');

    expect(mapAuthErrorMessage({ code: 'auth/operation-not-allowed' })).toContain(
      'Email/Password sign-in is not yet enabled'
    );
    expect(mapAuthErrorMessage({ code: 'auth/invalid-credential' })).toContain(
      'Invalid email or password'
    );
    expect(mapAuthErrorMessage({ code: 'auth/email-already-in-use' })).toContain(
      'already exists'
    );
    expect(mapAuthErrorMessage({ code: 'auth/weak-password' })).toContain('at least 6 characters');
    expect(mapAuthErrorMessage({ code: 'auth/network-request-failed' })).toContain(
      'Offline Local Mode'
    );
  });
});

describe('Offline Local Registration, Sign-In & Per-User Data Isolation', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    clearMemoryOfflineStoreForTests();
    useSimulationStore.getState().resetForSignOut();
  });

  afterEach(() => {
    clearMemoryOfflineStoreForTests();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('registers, signs out, restores session, and isolates two offline accounts end-to-end', async () => {
    // Register Offline User 1
    const user1 = await registerOfflineAccount('CTR-ARIA1', 'aria_pilot', 'pass1234');
    expect(user1.uid.startsWith('local_')).toBe(true);
    expect(user1.authProvider).toBe('offline');
    expect(user1.emailVerified).toBe(true);
    expect(user1.callsign).toBe('CTR-ARIA1');

    // Duplicate username/email is rejected
    await expect(
      registerOfflineAccount('CTR-DUP', 'ARIA_PILOT', 'pass1234')
    ).rejects.toThrow(/already exists/i);

    // Save custom preferences, activity, scenario & updated callsign for User 1
    const u1Prefs: UserPreferencesData = {
      ...buildDefaultUserPreferences(user1.uid),
      preferredAirportIcao: 'OIII',
      preferredLandingRunwayId: '29L',
      preferredDepartureRunwayId: '29R',
      simSpeed: 3,
      audioMuted: true,
      audioVolume: 0.4,
      radioPreset: 'weak_signal',
      radarTheme: 'crimson_tactical',
    };
    await saveUserPreferences(user1.uid, u1Prefs);

    const { updatedProfile: u1AfterAct } = await recordControllerActivityAndStats(user1, {
      kind: 'free_ops',
      title: 'Tehran Evening Approach',
      airportIcao: 'OIII',
      landingRunwayId: '29L',
      departureRunwayId: '29R',
      landings: 4,
      departures: 2,
      goArounds: 0,
      violations: 0,
      score: 96,
      durationSeconds: 420,
    });
    expect(u1AfterAct.totalLandings).toBe(4);
    expect(u1AfterAct.bestScore).toBe(96);

    const u1Renamed = await updateControllerCallsign(u1AfterAct, 'CTR-TEHRAN1');
    expect(u1Renamed.callsign).toBe('CTR-TEHRAN1');

    const u1Scenario: CustomScenarioConfig = {
      id: 'scn_offline_u1',
      ownerId: user1.uid,
      name: 'Mehrabad Crosswind',
      description: 'Offline user 1 custom scenario',
      difficulty: 'Intermediate',
      airportIcao: 'OIII',
      landingRunwayId: '29L',
      departureRunwayId: '29R',
      windDirection: 240,
      windSpeed: 18,
      gusts: 26,
      qnh: 1015,
      visibilityNM: 8,
      ceilingFeet: 3500,
      precipitation: 'Light Rain',
      initialInbounds: 4,
      initialDepartures: 2,
      spawnIntervalSec: 35,
      heavyRatio: 0.3,
      allowEmergencies: false,
      emergencyDelaySec: 120,
    };
    await saveUserScenario(u1Renamed, u1Scenario, false);

    // Active offline session should survive restoreOfflineAccountBundle()
    const restoredU1 = await restoreOfflineAccountBundle();
    expect(restoredU1).not.toBeNull();
    expect(restoredU1!.profile.callsign).toBe('CTR-TEHRAN1');
    expect(restoredU1!.preferences.preferredAirportIcao).toBe('OIII');
    expect(restoredU1!.preferences.radarTheme).toBe('crimson_tactical');
    expect(restoredU1!.activities.length).toBe(1);
    expect(restoredU1!.scenarios.length).toBe(1);

    // Sign out clears active offline session without deleting account data
    await signOutAccount();
    expect(await restoreOfflineAccountBundle()).toBeNull();

    // Register Offline User 2 cleanly with zero bleed-over from User 1
    const user2 = await registerOfflineAccount('CTR-SINA2', 'sina@local', 'secret99');
    expect(user2.uid).not.toBe(user1.uid);
    const u2Prefs = await loadOrCreateUserPreferences(user2.uid);
    expect(u2Prefs.preferredAirportIcao).toBe('EGLL');
    expect(u2Prefs.radarTheme).toBe('phosphor_crt');
    expect(await loadUserActivities(user2.uid)).toEqual([]);
    expect(await loadUserScenarios(user2)).toEqual([]);

    // User 2 cannot delete User 1's scenario
    await deleteUserScenario(user2, 'scn_offline_u1');

    // Wrong password rejected when signing back into User 1
    await expect(signInOfflineAccount('aria_pilot', 'wrongpass')).rejects.toThrow(/Invalid/i);

    // Signing back into User 1 restores all personal records, logbook, prefs & scenario
    const signedInU1 = await signInOfflineAccount('aria_pilot', 'pass1234');
    expect(signedInU1.callsign).toBe('CTR-TEHRAN1');
    expect(signedInU1.totalLandings).toBe(4);
    const reloadedU1Prefs = await loadOrCreateUserPreferences(signedInU1.uid);
    expect(reloadedU1Prefs.preferredAirportIcao).toBe('OIII');
    expect(reloadedU1Prefs.radarTheme).toBe('crimson_tactical');
    expect((await loadUserActivities(signedInU1.uid)).length).toBe(1);
    expect((await loadUserScenarios(signedInU1)).map(s => s.id)).toEqual(['scn_offline_u1']);
  });

  it('persists salted scrypt offline accounts across restarts in server LocalAccountManager', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skycontrol-local-auth-'));
    tempDirs.push(dir);

    const manager1 = new LocalAccountManager(dir);
    const regA = manager1.registerAccount({
      identifier: 'controller_a',
      password: 'offlinePass1',
      callsign: 'CTR-DISK1',
    });
    const regB = manager1.registerAccount({
      identifier: 'controller_b',
      password: 'offlinePass2',
      callsign: 'CTR-DISK2',
    });

    expect(regA.profile.uid).not.toBe(regB.profile.uid);
    expect(manager1.resolveSessionUid(regA.token)).toBe(regA.profile.uid);

    manager1.savePreferences(regA.profile.uid, {
      ...buildDefaultUserPreferences(regA.profile.uid),
      preferredAirportIcao: 'KJFK',
      audioMuted: true,
    });
    manager1.recordActivityAndStats(regA.profile.uid, {
      kind: 'mission_pass',
      title: 'Mission 1: First Arrivals',
      missionId: 'mission_1',
      airportIcao: 'KJFK',
      landingRunwayId: '31R',
      departureRunwayId: '31L',
      landings: 5,
      departures: 0,
      goArounds: 0,
      violations: 0,
      score: 98,
      durationSeconds: 300,
    });

    // Wrong password fails
    expect(() =>
      manager1.loginAccount({ identifier: 'controller_a', password: 'bad-pass' })
    ).toThrow(/Invalid/i);

    // Simulate server restart reading from local-accounts.json on disk
    const manager2 = new LocalAccountManager(dir);
    const bundleA = manager2.getSessionBundle(regA.token);
    expect(bundleA).not.toBeNull();
    expect(bundleA!.profile.completedMissions).toEqual(['mission_1']);
    expect(bundleA!.preferences?.preferredAirportIcao).toBe('KJFK');

    const bundleB = manager2.getSessionBundle(regB.token);
    expect(bundleB).not.toBeNull();
    expect(bundleB!.profile.completedMissions).toEqual([]);
    expect(bundleB!.activities).toEqual([]);

    // Logout invalidates token
    manager2.logoutSession(regA.token);
    expect(manager2.resolveSessionUid(regA.token)).toBeNull();

    // Re-login issues a fresh valid session token
    const reloginA = manager2.loginAccount({
      identifier: 'controller_a',
      password: 'offlinePass1',
    });
    expect(reloginA.profile.totalLandings).toBe(5);
    expect(manager2.resolveSessionUid(reloginA.token)).toBe(regA.profile.uid);
  });
});
