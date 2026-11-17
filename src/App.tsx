/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
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
  loadGuestProfile,
  loadOrCreateCloudProfile,
  loadUserScenarios,
  migrateGuestScenariosToCloud,
  persistMissionCompletion,
  subscribeAuth,
} from './services/persistenceService';
import { CustomScenarioConfig, UserProfileData } from './types';

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

  // Auth & User Persistence State
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [scenarios, setScenarios] = useState<CustomScenarioConfig[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Clean 4-Page Workspace Router
  const [activePage, setActivePage] = useState<WorkspacePage>('setup');
  const [setupTab, setSetupTab] = useState<SectorSetupTab>('airport');
  const [audioStudioTab, setAudioStudioTab] = useState<AudioStudioTab>('voices');
  const [isCertOpen, setIsCertOpen] = useState(false);

  const persistedPassRef = useRef<boolean>(false);

  // Hydrate persisted offline Audio Studio settings on boot
  useEffect(() => {
    void localTtsClient.fetchGlobalSettings().then(settings => {
      useSimulationStore.getState().syncGlobalAudioSettings(settings, false);
    });
  }, []);

  // 1. Verify Firestore connection & subscribe to Auth state on boot
  useEffect(() => {
    testConnection();

    const unsubscribe = subscribeAuth(async firebaseUser => {
      if (firebaseUser) {
        try {
          const guestBefore = loadGuestProfile();
          const cloudProfile = await loadOrCreateCloudProfile(firebaseUser, guestBefore);
          await migrateGuestScenariosToCloud(cloudProfile);
          const cloudScenarios = await loadUserScenarios(cloudProfile);
          setUserProfile(cloudProfile);
          setScenarios(cloudScenarios);
          setIsAuthModalOpen(false);
          if (!useSimulationStore.getState().hasCompletedStartupSetup) {
            setSetupTab('airport');
            setActivePage('setup');
          }
        } catch (err) {
          console.error('Auth profile sync failed:', err);
        }
      } else {
        const guest = loadGuestProfile();
        if (guest) {
          setUserProfile(guest);
          const guestScenarios = await loadUserScenarios(guest);
          setScenarios(guestScenarios);
          setIsAuthModalOpen(false);
          if (!useSimulationStore.getState().hasCompletedStartupSetup) {
            setSetupTab('airport');
            setActivePage('setup');
          }
        } else {
          setUserProfile(null);
          setScenarios([]);
          setIsAuthModalOpen(true);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Persist mission completion once when activeMission transitions to 'passed'
  useEffect(() => {
    if (activeMission.status === 'active') {
      persistedPassRef.current = false;
      return;
    }

    if (
      activeMission.status === 'passed' &&
      activeMission.mission &&
      !persistedPassRef.current &&
      userProfile
    ) {
      persistedPassRef.current = true;
      const missionId = activeMission.mission.id;

      persistMissionCompletion(
        userProfile,
        missionId,
        stats.landings,
        stats.departures,
        stats.score
      )
        .then(({ updatedProfile, newlyCertified }) => {
          setUserProfile(updatedProfile);
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
          console.error('Failed to persist mission pass:', err);
        });
    }
  }, [
    activeMission.status,
    activeMission.mission,
    userProfile,
    stats.landings,
    stats.departures,
    stats.score,
  ]);

  // 3. Deterministic Fixed-Timestep Simulation Loop (20 Hz, 50ms per step)
  useEffect(() => {
    const TICK_INTERVAL_MS = 50;
    const dt = TICK_INTERVAL_MS / 1000;

    const interval = setInterval(() => {
      tickSimulation(dt);
    }, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [tickSimulation]);

  // 4. Dynamic Periodic Traffic Inbound Spawner
  useEffect(() => {
    if (isPaused) return;

    const intervalMs = Math.max(6000, (spawnIntervalSec * 1000) / simSpeed);
    const spawnTimer = setInterval(() => {
      const currCount = useSimulationStore.getState().aircraft.length;
      if (currCount < maxTraffic) {
        spawnInbound();
      }
    }, intervalMs);

    return () => clearInterval(spawnTimer);
  }, [isPaused, simSpeed, spawnIntervalSec, maxTraffic, spawnInbound]);

  const handleOpenSetup = (tab: SectorSetupTab = 'airport') => {
    setSetupTab(tab);
    setActivePage('setup');
  };

  const handleOpenAudioStudio = (tab: AudioStudioTab = 'voices') => {
    radioAudio.initAudioContext();
    setAudioStudioTab(tab);
    setActivePage('audio');
  };

  const handleGuestProfileReady = async (profile: UserProfileData) => {
    setUserProfile(profile);
    const list = await loadUserScenarios(profile);
    setScenarios(list);
    setIsAuthModalOpen(false);
    if (!useSimulationStore.getState().hasCompletedStartupSetup) {
      setSetupTab('airport');
      setActivePage('setup');
    }
  };

  const handleSignedOut = () => {
    setUserProfile(null);
    setScenarios([]);
    setIsAuthModalOpen(true);
  };

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
          onProfileReady={handleGuestProfileReady}
          onSignedOut={handleSignedOut}
          onOpenCertificate={() => setIsCertOpen(true)}
          onRequireAuth={() => setIsAuthModalOpen(true)}
          onReturnToRadar={() => setActivePage('radar')}
        />
      )}

      {/* Authentication Gate Modal (Initial Sign-In & Guest Upgrade) */}
      <AuthGateModal
        isOpen={isAuthModalOpen}
        canDismiss={Boolean(userProfile)}
        userProfile={userProfile}
        onClose={() => setIsAuthModalOpen(false)}
        onProfileReady={handleGuestProfileReady}
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
