/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import confetti from 'canvas-confetti';
import { useSimulationStore } from './store/simulationStore';
import { TopBar, WorkspacePage } from './components/TopBar';
import { RadarCanvas } from './components/RadarCanvas';
import { CommandPanel } from './components/CommandPanel';
import { TrafficPanel } from './components/TrafficPanel';
import { AuthGateModal } from './components/AuthGateModal';
import { MissionHudOverlay } from './components/MissionHudOverlay';
import { CertificateModal } from './components/CertificateModal';
import { AudioStudioModal, AudioStudioTab } from './components/AudioStudioModal';
import { SectorSetupPage, SectorSetupTab } from './components/SectorSetupPage';
import { ManualProfilePage } from './components/ManualProfilePage';
import { testConnection } from './firebase/config';
import { localTtsClient } from './services/localTtsClient';
import { radioAudio } from './audio/radioAudio';
import {
  isNetworkAuthError,
  loadOrCreateCloudProfile,
  loadOrCreateUserPreferences,
  loadUserActivities,
  loadUserScenarios,
  recordControllerActivityAndStats,
  restoreOfflineAccountBundle,
  saveUserPreferences,
  signOutAccount,
  subscribeAuth,
} from './services/persistenceService';
import {
  ActivityEntry,
  ActivityKind,
  CustomScenarioConfig,
  UserPreferencesData,
  UserProfileData,
} from './types';

export default function App() {
  const tickSimulation = useSimulationStore(state => state.tickSimulation);
  const spawnInbound = useSimulationStore(state => state.spawnInbound);
  const isPaused = useSimulationStore(state => state.isPaused);
  const simSpeed = useSimulationStore(state => state.simSpeed);
  const spawnIntervalSec = useSimulationStore(state => state.spawnIntervalSec);
  const maxTraffic = useSimulationStore(state => state.maxTraffic);
  const activeMission = useSimulationStore(state => state.activeMission);
  const stats = useSimulationStore(state => state.stats);
  const hasCompletedStartupSetup = useSimulationStore(state => state.hasCompletedStartupSetup);

  // Strict Auth & Per-User Persistence State
  const [authInitialized, setAuthInitialized] = useState(false);
  const [pendingVerificationUser, setPendingVerificationUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [scenarios, setScenarios] = useState<CustomScenarioConfig[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Clean 4-Page Workspace Router
  const [activePage, setActivePage] = useState<WorkspacePage>('setup');
  const [setupTab, setSetupTab] = useState<SectorSetupTab>('airport');
  const [audioStudioTab, setAudioStudioTab] = useState<AudioStudioTab>('voices');
  const [isCertOpen, setIsCertOpen] = useState(false);

  const registerCallsignHintRef = useRef<string | undefined>(undefined);
  const prefsHydratedUidRef = useRef<string | null>(null);
  const userProfileRef = useRef<UserProfileData | null>(null);
  const recordedMissionRunRef = useRef<string | null>(null);
  const lastLoggedSessionKeyRef = useRef<string | null>(null);
  const prefsSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingPrefsSync = useCallback(() => {
    if (prefsSyncTimerRef.current) {
      clearTimeout(prefsSyncTimerRef.current);
      prefsSyncTimerRef.current = null;
    }
  }, []);

  const hydrateUserBundle = useCallback(
    (
      profile: UserProfileData,
      prefs: UserPreferencesData,
      userScenarios: CustomScenarioConfig[],
      userActivities: ActivityEntry[]
    ) => {
      cancelPendingPrefsSync();
      useSimulationStore.getState().applyUserPreferences(prefs);
      prefsHydratedUidRef.current = profile.uid;
      userProfileRef.current = profile;
      lastLoggedSessionKeyRef.current = null;
      recordedMissionRunRef.current = null;

      setUserProfile(profile);
      setScenarios(userScenarios);
      setActivities(userActivities);
      setPendingVerificationUser(null);
      setIsAuthModalOpen(false);
      setSetupTab('airport');
      setActivePage('setup');
      setAuthInitialized(true);
    },
    [cancelPendingPrefsSync]
  );

  const resetToAuthGate = useCallback(
    (pendingUser: User | null = null) => {
      cancelPendingPrefsSync();
      prefsHydratedUidRef.current = null;
      userProfileRef.current = null;
      lastLoggedSessionKeyRef.current = null;
      recordedMissionRunRef.current = null;
      useSimulationStore.getState().resetForSignOut();
      setUserProfile(null);
      setScenarios([]);
      setActivities([]);
      setPendingVerificationUser(pendingUser);
      setIsAuthModalOpen(true);
      setAuthInitialized(true);
    },
    [cancelPendingPrefsSync]
  );

  const hydrateVerifiedUser = useCallback(
    async (firebaseUser: User) => {
      cancelPendingPrefsSync();
      prefsHydratedUidRef.current = null;

      const cloudProfile = await loadOrCreateCloudProfile(
        firebaseUser,
        registerCallsignHintRef.current
      );
      registerCallsignHintRef.current = undefined;

      const [prefs, cloudScenarios, cloudActivities] = await Promise.all([
        loadOrCreateUserPreferences(firebaseUser),
        loadUserScenarios(cloudProfile),
        loadUserActivities(cloudProfile.uid, 50),
      ]);

      hydrateUserBundle(cloudProfile, prefs, cloudScenarios, cloudActivities);
    },
    [cancelPendingPrefsSync, hydrateUserBundle]
  );

  const handleOfflineAuthenticated = useCallback(
    async (offlineProfile: UserProfileData) => {
      cancelPendingPrefsSync();
      prefsHydratedUidRef.current = null;

      const [prefs, offlineScenarios, offlineActivities] = await Promise.all([
        loadOrCreateUserPreferences(offlineProfile.uid),
        loadUserScenarios(offlineProfile),
        loadUserActivities(offlineProfile.uid, 50),
      ]);

      hydrateUserBundle(offlineProfile, prefs, offlineScenarios, offlineActivities);
    },
    [cancelPendingPrefsSync, hydrateUserBundle]
  );

  // Hydrate offline Audio Studio voice/engine catalog only when no verified user prefs exist yet
  useEffect(() => {
    void localTtsClient.fetchGlobalSettings().then(settings => {
      if (!prefsHydratedUidRef.current) {
        useSimulationStore.getState().syncGlobalAudioSettings(settings, false);
      }
    });
  }, []);

  // 1. Verify Firestore connection & subscribe to Firebase Auth state (+ offline local session fallback)
  useEffect(() => {
    if (typeof navigator === 'undefined' || navigator.onLine) {
      testConnection();
    }
    let mounted = true;

    const unsubscribe = subscribeAuth(async firebaseUser => {
      if (!mounted) return;

      if (firebaseUser && !firebaseUser.emailVerified) {
        resetToAuthGate(firebaseUser);
        return;
      }

      if (firebaseUser && firebaseUser.emailVerified) {
        try {
          await hydrateVerifiedUser(firebaseUser);
          return;
        } catch (err) {
          console.error('Verified user hydration failed:', err);
          if (!mounted) return;
          if (isNetworkAuthError(err) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
            const offlineBundle = await restoreOfflineAccountBundle().catch(() => null);
            if (!mounted) return;
            if (offlineBundle) {
              hydrateUserBundle(
                offlineBundle.profile,
                offlineBundle.preferences,
                offlineBundle.scenarios,
                offlineBundle.activities
              );
              return;
            }
          }
          resetToAuthGate(null);
          return;
        }
      }

      // No Firebase user signed in: check for an active persisted offline local controller session
      const offlineBundle = await restoreOfflineAccountBundle().catch(() => null);
      if (!mounted) return;
      if (offlineBundle) {
        hydrateUserBundle(
          offlineBundle.profile,
          offlineBundle.preferences,
          offlineBundle.scenarios,
          offlineBundle.activities
        );
        return;
      }

      resetToAuthGate(null);
    });

    return () => {
      mounted = false;
      unsubscribe();
      cancelPendingPrefsSync();
    };
  }, [cancelPendingPrefsSync, hydrateUserBundle, hydrateVerifiedUser, resetToAuthGate]);

  // 2. Debounced per-user Firestore preferences sync for radar, airport, route & audio settings
  useEffect(() => {
    const uid = userProfile?.uid;
    if (!uid) {
      cancelPendingPrefsSync();
      return;
    }

    const unsubscribeStore = useSimulationStore.subscribe((state, prevState) => {
      if (prefsHydratedUidRef.current !== uid) return;

      const changed =
        state.airport.icao !== prevState.airport.icao ||
        state.activeLandingRunwayId !== prevState.activeLandingRunwayId ||
        state.activeDepartureRunwayId !== prevState.activeDepartureRunwayId ||
        state.simSpeed !== prevState.simSpeed ||
        state.audioMuted !== prevState.audioMuted ||
        state.audioVolume !== prevState.audioVolume ||
        state.towerVoiceId !== prevState.towerVoiceId ||
        state.radioPreset !== prevState.radioPreset ||
        state.radarTheme !== prevState.radarTheme ||
        state.radarLayers !== prevState.radarLayers ||
        state.perAirportVisibility !== prevState.perAirportVisibility;

      if (!changed) return;

      cancelPendingPrefsSync();
      prefsSyncTimerRef.current = setTimeout(() => {
        if (prefsHydratedUidRef.current !== uid) return;
        const snapshot = useSimulationStore.getState();
        void saveUserPreferences(uid, {
          preferredAirportIcao: snapshot.airport.icao,
          preferredLandingRunwayId: snapshot.activeLandingRunwayId,
          preferredDepartureRunwayId: snapshot.activeDepartureRunwayId,
          simSpeed: snapshot.simSpeed,
          audioMuted: snapshot.audioMuted,
          audioVolume: snapshot.audioVolume,
          towerVoiceId: snapshot.towerVoiceId,
          radioPreset: snapshot.radioPreset,
          radarTheme: snapshot.radarTheme,
          radarLayers: snapshot.radarLayers,
          perAirportVisibility: snapshot.perAirportVisibility,
        }).catch(err => {
          console.error('Failed to sync user preferences:', err);
        });
      }, 900);
    });

    return () => {
      unsubscribeStore();
      cancelPendingPrefsSync();
    };
  }, [userProfile?.uid, cancelPendingPrefsSync]);

  // 3. Flush active Free Ops / Custom Ops shift into personal Activity Logbook
  const flushCurrentFreeOrCustomSession = useCallback(async () => {
    const profile = userProfileRef.current;
    if (!profile) return;

    const s = useSimulationStore.getState();
    if (!s.hasCompletedStartupSetup || s.activeMission.status !== 'idle') return;
    if (s.stats.elapsedSeconds < 15 && s.stats.landings === 0 && s.stats.departures === 0) {
      return;
    }

    const sessionSig = `${s.activeScenarioName}|${s.airport.icao}|${Math.floor(
      s.stats.elapsedSeconds
    )}|${s.stats.landings}|${s.stats.departures}`;
    if (lastLoggedSessionKeyRef.current === sessionSig) return;
    lastLoggedSessionKeyRef.current = sessionSig;

    const kind: ActivityKind =
      s.activeScenarioName.startsWith('Free') || s.activeScenarioName.startsWith('Briefed')
        ? 'free_ops'
        : 'custom_ops';

    try {
      const { updatedProfile, entry } = await recordControllerActivityAndStats(profile, {
        kind,
        title: s.activeScenarioName || `Free Operations · ${s.airport.icao}`,
        airportIcao: s.airport.icao,
        landingRunwayId: s.activeLandingRunwayId,
        departureRunwayId: s.activeDepartureRunwayId,
        landings: s.stats.landings,
        departures: s.stats.departures,
        goArounds: s.stats.goArounds,
        violations: s.stats.separationViolations,
        score: s.stats.score,
        durationSeconds: s.stats.elapsedSeconds,
      });

      userProfileRef.current = updatedProfile;
      setUserProfile(updatedProfile);
      setActivities(prev => [entry, ...prev.filter(a => a.id !== entry.id)].slice(0, 50));
    } catch (err) {
      console.error('Failed to log shift activity:', err);
    }
  }, []);

  // 4. Persist Mission Pass / Fail once per mission attempt into Activity Logbook & Profile
  useEffect(() => {
    if (activeMission.status === 'active') {
      recordedMissionRunRef.current = null;
      return;
    }

    if (
      (activeMission.status === 'passed' || activeMission.status === 'failed') &&
      activeMission.mission &&
      !recordedMissionRunRef.current &&
      userProfile
    ) {
      const msn = activeMission.mission;
      recordedMissionRunRef.current = `${msn.id}:${activeMission.status}`;
      const state = useSimulationStore.getState();

      recordControllerActivityAndStats(userProfile, {
        kind: activeMission.status === 'passed' ? 'mission_pass' : 'mission_fail',
        title: `Mission ${msn.number}: ${msn.title}`,
        missionId: msn.id,
        airportIcao: state.airport.icao,
        landingRunwayId: state.activeLandingRunwayId,
        departureRunwayId: state.activeDepartureRunwayId,
        landings: stats.landings,
        departures: stats.departures,
        goArounds: stats.goArounds,
        violations: stats.separationViolations,
        score: stats.score,
        durationSeconds: stats.elapsedSeconds,
      })
        .then(({ updatedProfile, entry, newlyCertified }) => {
          userProfileRef.current = updatedProfile;
          setUserProfile(updatedProfile);
          setActivities(prev => [entry, ...prev.filter(a => a.id !== entry.id)].slice(0, 50));
          if (newlyCertified) {
            setIsCertOpen(true);
            confetti({
              particleCount: 80,
              spread: 70,
              origin: { y: 0.6 },
            });
          }
        })
        .catch(err => {
          console.error('Failed to record mission result:', err);
        });
    }
  }, [
    activeMission.status,
    activeMission.mission,
    userProfile,
    stats.landings,
    stats.departures,
    stats.goArounds,
    stats.separationViolations,
    stats.score,
    stats.elapsedSeconds,
  ]);

  // 5. Deterministic Fixed-Timestep Simulation Loop (20 Hz, 50ms per step)
  useEffect(() => {
    if (!userProfile) return;
    const TICK_INTERVAL_MS = 50;
    const dt = TICK_INTERVAL_MS / 1000;

    const interval = setInterval(() => {
      tickSimulation(dt);
    }, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [tickSimulation, userProfile]);

  // 6. Dynamic Periodic Traffic Inbound Spawner
  useEffect(() => {
    if (isPaused || !userProfile) return;

    const intervalMs = Math.max(6000, (spawnIntervalSec * 1000) / simSpeed);
    const spawnTimer = setInterval(() => {
      const currCount = useSimulationStore.getState().aircraft.length;
      if (currCount < maxTraffic) {
        spawnInbound();
      }
    }, intervalMs);

    return () => clearInterval(spawnTimer);
  }, [isPaused, userProfile, simSpeed, spawnIntervalSec, maxTraffic, spawnInbound]);

  const handleOpenSetup = (tab: SectorSetupTab = 'airport') => {
    setSetupTab(tab);
    setActivePage('setup');
  };

  const handleOpenAudioStudio = (tab: AudioStudioTab = 'voices') => {
    radioAudio.initAudioContext();
    setAudioStudioTab(tab);
    setActivePage('audio');
  };

  const handleProfileUpdated = (profile: UserProfileData) => {
    userProfileRef.current = profile;
    setUserProfile(profile);
  };

  const handleSignedOut = useCallback(async () => {
    await flushCurrentFreeOrCustomSession();
    cancelPendingPrefsSync();
    prefsHydratedUidRef.current = null;
    await signOutAccount();
    resetToAuthGate(null);
  }, [cancelPendingPrefsSync, flushCurrentFreeOrCustomSession, resetToAuthGate]);

  // Strict Pre-Entry Screen 1: Loading while checking Firebase session
  if (!authInitialized) {
    return (
      <div className="w-screen h-screen bg-[#050a07] text-[#d1e7dd] flex items-center justify-center p-6 select-none">
        <div className="bg-[#08130e] border border-[#1b422d] rounded-lg px-8 py-6 text-center space-y-2 max-w-sm w-full">
          <div className="font-mono font-bold text-base tracking-wider text-[#00ff66]">
            SKYCONTROL
          </div>
          <div className="text-xs font-mono text-[#70b88d]">
            Verifying controller credentials &amp; personal sector profile...
          </div>
        </div>
      </div>
    );
  }

  // Strict Pre-Entry Screen 2: No simulator access until signed in & verified
  if (!userProfile) {
    return (
      <div className="w-screen h-screen bg-[#050a07] text-[#d1e7dd] overflow-hidden select-none">
        <AuthGateModal
          isOpen={true}
          canDismiss={false}
          userProfile={null}
          pendingVerificationUser={pendingVerificationUser}
          onClose={() => undefined}
          onProfileReady={handleProfileUpdated}
          onOfflineAuthenticated={handleOfflineAuthenticated}
          onVerificationComplete={hydrateVerifiedUser}
          onRegisterCallsignHint={cs => {
            registerCallsignHintRef.current = cs;
          }}
          onSignedOut={handleSignedOut}
          onOpenCertificate={() => undefined}
        />
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-[#050a07] text-[#d1e7dd] overflow-hidden select-none">
      {/* 1. Decluttered 3-Zone Top Bar */}
      <TopBar
        activePage={activePage}
        onSelectPage={page => {
          if (page === 'audio') {
            radioAudio.initAudioContext();
          }
          setActivePage(page);
        }}
        userProfile={userProfile}
        onOpenAccount={() => setIsAuthModalOpen(true)}
      />

      {/* 2. Active Workspace View */}
      {activePage === 'radar' && (
        <div className="flex-1 flex min-h-0 relative">
          <TrafficPanel onOpenAudioStudio={() => handleOpenAudioStudio('voices')} />

          <main className="flex-1 h-full min-w-0 relative">
            <RadarCanvas onOpenSetupRoutes={() => handleOpenSetup('routes')} />
            <MissionHudOverlay
              onOpenCertificate={() => setIsCertOpen(true)}
              onOpenAcademy={() => handleOpenSetup('airport')}
            />
          </main>

          <CommandPanel />
        </div>
      )}

      {activePage === 'setup' && (
        <SectorSetupPage
          initialTab={setupTab}
          canReturnToRadar={hasCompletedStartupSetup}
          userProfile={userProfile}
          scenarios={scenarios}
          onScenariosChanged={setScenarios}
          onBeforeStartNewSession={flushCurrentFreeOrCustomSession}
          onLaunchRadar={() => setActivePage('radar')}
          onOpenCertificate={() => setIsCertOpen(true)}
          onRequireAuth={() => setIsAuthModalOpen(true)}
        />
      )}

      {activePage === 'audio' && (
        <div className="flex-1 min-h-0 flex">
          <AudioStudioModal mode="page" initialTab={audioStudioTab} />
        </div>
      )}

      {activePage === 'profile' && (
        <ManualProfilePage
          userProfile={userProfile}
          activities={activities}
          onProfileReady={handleProfileUpdated}
          onActivitiesChanged={setActivities}
          onSignedOut={handleSignedOut}
          onLogCurrentSession={flushCurrentFreeOrCustomSession}
          onOpenCertificate={() => setIsCertOpen(true)}
          onRequireAuth={() => setIsAuthModalOpen(true)}
          onReturnToRadar={() => setActivePage('radar')}
        />
      )}

      {/* Authenticated Account Console Modal */}
      <AuthGateModal
        isOpen={isAuthModalOpen}
        canDismiss={true}
        userProfile={userProfile}
        pendingVerificationUser={pendingVerificationUser}
        onClose={() => setIsAuthModalOpen(false)}
        onProfileReady={handleProfileUpdated}
        onOfflineAuthenticated={handleOfflineAuthenticated}
        onVerificationComplete={hydrateVerifiedUser}
        onRegisterCallsignHint={cs => {
          registerCallsignHintRef.current = cs;
        }}
        onSignedOut={handleSignedOut}
        onOpenCertificate={() => setIsCertOpen(true)}
      />

      {/* Official ATC Rating Certificate Modal */}
      <CertificateModal
        isOpen={isCertOpen}
        userProfile={userProfile}
        onClose={() => setIsCertOpen(false)}
      />
    </div>
  );
}
