/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useSimulationStore } from './store/simulationStore';
import { TopBar } from './components/TopBar';
import { RadarCanvas } from './components/RadarCanvas';
import { CommandPanel } from './components/CommandPanel';
import { TrafficPanel } from './components/TrafficPanel';
import { FlightStrips } from './components/FlightStrips';
import { RadioTranscript } from './components/RadioTranscript';
import { ScenarioModal } from './components/ScenarioModal';
import { HelpModal } from './components/HelpModal';
import { LayersMenu } from './components/LayersMenu';
import { Radio, Plane } from 'lucide-react';

export default function App() {
  const tickSimulation = useSimulationStore(state => state.tickSimulation);
  const spawnInbound = useSimulationStore(state => state.spawnInbound);
  const isPaused = useSimulationStore(state => state.isPaused);
  const simSpeed = useSimulationStore(state => state.simSpeed);
  const aircraftCount = useSimulationStore(state => state.aircraft.length);

  // Modals state
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isScenarioOpen, setIsScenarioOpen] = useState(false);
  const [isLayersOpen, setIsLayersOpen] = useState(false);

  // Bottom rack tab: 'strips' or 'radio'
  const [bottomTab, setBottomTab] = useState<'strips' | 'radio'>('strips');

  // 1. Deterministic Fixed-Timestep Simulation Loop (20 Hz, 50ms per step)
  useEffect(() => {
    const TICK_INTERVAL_MS = 50; // 20 Hz
    const dt = TICK_INTERVAL_MS / 1000;

    const interval = setInterval(() => {
      tickSimulation(dt);
    }, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [tickSimulation]);

  // 2. Periodic Automatic Traffic Inbound Spawner (keeps TMA active)
  useEffect(() => {
    if (isPaused) return;

    // Spawns a new flight every ~45 seconds (adjusted for simulation speed)
    const spawnTimer = setInterval(() => {
      if (useSimulationStore.getState().aircraft.length < 10) {
        spawnInbound();
      }
    }, Math.max(8000, 45000 / simSpeed));

    return () => clearInterval(spawnTimer);
  }, [isPaused, simSpeed, spawnInbound]);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#050a07] text-[#d1e7dd] overflow-hidden select-none">
      {/* 1. Aviation Workstation Top Bar */}
      <TopBar
        onOpenHelp={() => setIsHelpOpen(true)}
        onOpenScenario={() => setIsScenarioOpen(true)}
        onToggleLayerMenu={() => setIsLayersOpen(true)}
      />

      {/* 2. Main Workstation Tri-Pane Center Stage */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left Sidebar: Collapsible Traffic Panel & Freshness Monitor */}
        <TrafficPanel />

        {/* Center: High-Performance 2D CRT Radar Display */}
        <main className="flex-1 h-full min-w-0 relative">
          <RadarCanvas />
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
              className={`px-3 py-0.5 rounded-t font-semibold flex items-center gap-1.5 transition-colors ${
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
              className={`px-3 py-0.5 rounded-t font-semibold flex items-center gap-1.5 transition-colors ${
                bottomTab === 'radio'
                  ? 'bg-[#0f281b] text-[#00ff66] border-t border-x border-[#1e4d35]'
                  : 'text-[#4e8b69] hover:text-[#a2f5bf]'
              }`}
            >
              <Radio className="w-3 h-3" />
              <span>VHF RADIO LOG</span>
            </button>
          </div>

          <div className="text-[10px] text-[#3f7055] hidden sm:block">
            SKYCONTROL v1.0 · LONDON HEATHROW RADAR APPROACH (EGLL)
          </div>
        </div>

        {/* Active Deck View */}
        {bottomTab === 'strips' ? <FlightStrips /> : <RadioTranscript />}
      </div>

      {/* Modals & Dialogs */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <ScenarioModal isOpen={isScenarioOpen} onClose={() => setIsScenarioOpen(false)} />
      <LayersMenu isOpen={isLayersOpen} onClose={() => setIsLayersOpen(false)} />
    </div>
  );
}
