/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { useSimulationStore } from './store/simulationStore';
import { TopBar } from './components/TopBar';
import { RadarCanvas } from './components/RadarCanvas';
import { CommandPanel } from './components/CommandPanel';
import { TrafficPanel } from './components/TrafficPanel';
import { FlightStrips } from './components/FlightStrips';
import { RadioTranscript } from './components/RadioTranscript';
import { HelpModal } from './components/HelpModal';
import { LayersMenu } from './components/LayersMenu';
import { AuthGateModal } from './components/AuthGateModal';
import { OperationsHubModal, OperationsHubTab } from './components/OperationsHubModal';
import { MissionHudOverlay } from './components/MissionHudOverlay';
import { CertificateModal } from './components/CertificateModal';
import { testConnection } from './firebase/config';
import {
  loadGuestProfile,
  loadOrCreateCloudProfile,
  loadUserScenarios,
  migrateGuestScenariosToCloud,
  persistMissionCompletion,
  subscribeAuth,
} from './services/persistenceService';
import { CustomScenarioConfig, UserProfileData } from './types';
import { Radio, Plane } from 'lucide-react';

export default function App() {
  const tickSimulation = useSimulationStore(state => state.tickSimulation);
  const spawnInbound = useSimulationStore(state => state.spawnInbound);
  const isPaused = useSimulationStore(state => state.isPaused);
  const simSpeed = useSimulationStore(state => state.simSpeed);
  const spawnIntervalSec = useSimulationStore(state => state.spawnIntervalSec);
  const maxTraffic = useSimulationStore(state => state.maxTraffic);
  const aircraftCount = useSimulationStore(state => state.aircraft.length);
  const airport = useSimulationStore(state => state.airport);
  const activeScenarioName = useSimulationStore(state => state.activeScenarioName);
  const activeMission = useSimulationStore(state => state.activeMission);
  const stats = useSimulationStore(state => state.stats);

  // Auth & User Persistence State
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [scenarios, setScenarios] = useState<CustomScenarioConfig[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Operational Modals State
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isHubOpen, setIsHubOpen] = useState(false);
  const [hubInitialTab, setHubInitialTab] = useState<OperationsHubTab>('academy');
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [isCertOpen, setIsCertOpen] = useState(false);

  // Bottom rack tab: 'strips' or 'radio'
  const [bottomTab, setBottomTab] = useState<'strips' | 'radio'>('strips');

  const persistedPassRef = useRef<boolean>(false);

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

  const handleOpenHub = (tab: OperationsHubTab = 'academy') => {
    setHubInitialTab(tab);
    setIsHubOpen(true);
  };

  const handleGuestProfileReady = async (profile: UserProfileData) => {
    setUserProfile(profile);
    const list = await loadUserScenarios(profile);
    setScenarios(list);
  };

  const handleSignedOut = () => {
    setUserProfile(null);
    setScenarios([]);
    setIsAuthModalOpen(true);
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-[#050a07] text-[#d1e7dd] overflow-hidden select-none">
      {/* 1. Aviation Workstation Top Bar */}
      <TopBar
        userProfile={userProfile}
        onOpenHelp={() => setIsHelpOpen(true)}
        onOpenOperationsHub={() => handleOpenHub('academy')}
        onOpenAccount={() => setIsAuthModalOpen(true)}
        onToggleLayerMenu={() => setIsLayersOpen(true)}
      />

      {/* 2. Main Workstation Tri-Pane Center Stage */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left Sidebar: Collapsible Traffic Panel & Freshness Monitor */}
        <TrafficPanel />

        {/* Center: High-Performance 2D CRT Radar Display + Mission HUD */}
        <main className="flex-1 h-full min-w-0 relative">
          <RadarCanvas />
          <MissionHudOverlay
            onOpenCertificate={() => setIsCertOpen(true)}
            onOpenAcademy={() => handleOpenHub('academy')}
          />
        </main>

        {/* Right Sidebar: Tactical Aircraft Command Panel */}
        <CommandPanel />
      </div>

      {/* 3. Bottom Multi-Deck: Flight Progress Strips Bay & VHF Comms Log */}
      <div className="flex flex-col shrink-0 bg-[#07100b] border-t border-[#163826]">
        {/* Bay Switcher Tabs */}
        <div className="h-6 px-3 bg-[#08150f] border-b border-[#163826] flex items-center justify-between text-[11px] font-mono">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setBottomTab('strips')}
              className={`px-3 py-0.5 rounded-t font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                bottomTab === 'strips'
                  ? 'bg-[#0f281b] text-[#00ff66] border-t border-x border-[#1e4d35]'
                  : 'text-[#4e8b69] hover:text-[#a2f5bf]'
              }`}
            >
              <Plane className="w-3 h-3" />
              <span>FLIGHT PROGRESS STRIPS ({aircraftCount})</span>
            </button>

            <button
              onClick={() => setBottomTab('radio')}
              className={`px-3 py-0.5 rounded-t font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                bottomTab === 'radio'
                  ? 'bg-[#0f281b] text-[#00ff66] border-t border-x border-[#1e4d35]'
                  : 'text-[#4e8b69] hover:text-[#a2f5bf]'
              }`}
            >
              <Radio className="w-3 h-3" />
              <span>VHF RADIO LOG</span>
            </button>
          </div>

          <div className="text-[10px] text-[#3f7055] hidden sm:block font-mono">
            {airport.icao} · {airport.name.toUpperCase()} · {activeScenarioName}
          </div>
        </div>

        {/* Active Deck View */}
        {bottomTab === 'strips' ? <FlightStrips /> : <RadioTranscript />}
      </div>

      {/* Modals & Dialogs */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <LayersMenu isOpen={isLayersOpen} onClose={() => setIsLayersOpen(false)} />

      <OperationsHubModal
        isOpen={isHubOpen}
        initialTab={hubInitialTab}
        userProfile={userProfile}
        scenarios={scenarios}
        onClose={() => setIsHubOpen(false)}
        onScenariosChanged={setScenarios}
        onOpenCertificate={() => setIsCertOpen(true)}
        onRequireAuth={() => {
          setIsHubOpen(false);
          setIsAuthModalOpen(true);
        }}
      />

      <AuthGateModal
        isOpen={isAuthModalOpen}
        canDismiss={Boolean(userProfile)}
        userProfile={userProfile}
        onClose={() => setIsAuthModalOpen(false)}
        onProfileReady={handleGuestProfileReady}
        onSignedOut={handleSignedOut}
        onOpenCertificate={() => setIsCertOpen(true)}
      />

      <CertificateModal
        isOpen={isCertOpen}
        userProfile={userProfile}
        onClose={() => setIsCertOpen(false)}
      />
    </div>
  );
}
