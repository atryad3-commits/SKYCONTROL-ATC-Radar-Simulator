/**
 * SKYCONTROL - Aviation Console Top Bar
 * Adheres to strict one-row workstation layout with UTC clock, sim speed controls,
 * weather status, audio toggle, and scenario actions.
 */

import React, { useState, useEffect } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Plus, 
  RotateCcw, 
  HelpCircle, 
  Layers,
  Wind
} from 'lucide-react';

interface TopBarProps {
  onOpenHelp: () => void;
  onOpenScenario: () => void;
  onToggleLayerMenu: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenHelp,
  onOpenScenario,
  onToggleLayerMenu,
}) => {
  const airport = useSimulationStore(state => state.airport);
  const weather = useSimulationStore(state => state.weather);
  const isPaused = useSimulationStore(state => state.isPaused);
  const simSpeed = useSimulationStore(state => state.simSpeed);
  const stats = useSimulationStore(state => state.stats);
  const audioMuted = useSimulationStore(state => state.audioMuted);
  const aircraftCount = useSimulationStore(state => state.aircraft.length);

  const togglePause = useSimulationStore(state => state.togglePause);
  const setSimSpeed = useSimulationStore(state => state.setSimSpeed);
  const setAudioMuted = useSimulationStore(state => state.setAudioMuted);
  const spawnInbound = useSimulationStore(state => state.spawnInbound);
  const spawnDeparture = useSimulationStore(state => state.spawnDeparture);
  const resetSimulation = useSimulationStore(state => state.resetSimulation);

  // UTC Simulation Clock
  const [utcTime, setUtcTime] = useState<string>('00:00:00');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setUtcTime(now.toTimeString().split(' ')[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-13 bg-[#08130e] border-b border-[#163826] px-4 flex items-center justify-between gap-4 text-xs font-mono select-none shrink-0 z-30">
      {/* Zone 1: Brand Wordmark & Airport Lockup */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm bg-[#00ff66] shadow-[0_0_8px_#00ff66]" />
          <span className="font-bold tracking-wider text-sm text-[#00ff66]">
            SKYCONTROL
          </span>
        </div>
        <span className="text-[#204a32] hidden sm:inline">|</span>
        <div className="hidden sm:flex items-center gap-1.5 text-[#a2f5bf]">
          <span className="font-semibold text-white">{airport.icao}</span>
          <span className="text-[#4e8b69]">{airport.name.replace(' Airport', '')}</span>
          <span className="text-[#305f42] text-[11px]">(RWY 27R/27L)</span>
        </div>
      </div>

      {/* Zone 2: Telemetry Metrics & Simulation Status */}
      <div className="hidden lg:flex items-center gap-5 text-[#86d9a5] tabular-nums">
        <div className="flex items-center gap-1.5">
          <span className="text-[#407d57]">UTC:</span>
          <span className="font-semibold text-white">{utcTime}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Wind className="w-3.5 h-3.5 text-[#407d57]" />
          <span>{weather.windDirection.toString().padStart(3, '0')}° / {weather.windSpeed}kt</span>
          <span className="text-[#407d57]">QNH</span>
          <span>{weather.qnh}</span>
        </div>

        <div className="flex items-center gap-3">
          <div>
            <span className="text-[#407d57]">TRAFFIC: </span>
            <span className="font-semibold text-[#00ff66]">{aircraftCount}</span>
          </div>
          <div>
            <span className="text-[#407d57]">LANDED: </span>
            <span className="font-semibold text-[#00e5ff]">{stats.landings}</span>
          </div>
          <div>
            <span className="text-[#407d57]">SCORE: </span>
            <span className={`font-semibold ${stats.score >= 90 ? 'text-[#00ff66]' : stats.score >= 70 ? 'text-[#ffb703]' : 'text-[#ff3344]'}`}>
              {stats.score}%
            </span>
          </div>
          {/* Radar Scan Indicator */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#091e14] border border-[#163826] rounded text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff66] animate-pulse" />
            <span className="text-[#00ff66] font-semibold">15 RPM</span>
          </div>
          {/* Active Alerts Badge if any */}
          {stats.separationViolations > 0 && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[#3b1212] border border-[#ff3344] rounded text-[10px] text-[#ff4d4d] font-bold">
              <span>ALERTS: {stats.separationViolations}</span>
            </div>
          )}
        </div>
      </div>

      {/* Zone 3: Interactive Tactical Sim Controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Spawn Controls */}
        <button
          onClick={spawnInbound}
          className="hidden md:flex items-center gap-1 px-2.5 py-1.5 bg-[#0f281a] hover:bg-[#183d29] text-[#00ff66] border border-[#1e4a31] rounded transition-colors whitespace-nowrap"
          title="Spawn new inbound flight"
        >
          <Plus className="w-3 h-3" />
          <span>Inbound</span>
        </button>

        <button
          onClick={spawnDeparture}
          className="hidden md:flex items-center gap-1 px-2.5 py-1.5 bg-[#0f281a] hover:bg-[#183d29] text-[#00e5ff] border border-[#1e4a31] rounded transition-colors whitespace-nowrap"
          title="Spawn departure from 27L"
        >
          <Plus className="w-3 h-3" />
          <span>Departure</span>
        </button>

        <div className="h-4 w-[1px] bg-[#163826] hidden md:block" />

        {/* Speed multiplier selector */}
        <div className="flex items-center bg-[#0a1710] border border-[#163826] rounded p-0.5">
          {[1, 2, 5].map(spd => (
            <button
              key={spd}
              onClick={() => setSimSpeed(spd)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                simSpeed === spd
                  ? 'bg-[#194029] text-[#00ff66] shadow-sm'
                  : 'text-[#569871] hover:text-[#a2f5bf]'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>

        {/* Pause / Resume */}
        <button
          onClick={togglePause}
          className={`px-2.5 py-1.5 rounded flex items-center gap-1 border transition-colors ${
            isPaused
              ? 'bg-[#d97706] text-black border-[#f59e0b] font-bold animate-pulse'
              : 'bg-[#0f281a] hover:bg-[#183d29] text-[#00ff66] border-[#1e4a31]'
          }`}
          title={isPaused ? 'Resume simulation' : 'Pause simulation'}
        >
          {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          <span>{isPaused ? 'RESUME' : 'PAUSE'}</span>
        </button>

        {/* Audio Mute */}
        <button
          onClick={() => setAudioMuted(!audioMuted)}
          className={`p-1.5 rounded border transition-colors ${
            audioMuted
              ? 'bg-[#2b1616] text-[#ff6b6b] border-[#5e2222]'
              : 'bg-[#0f281a] hover:bg-[#183d29] text-[#00ff66] border-[#1e4a31]'
          }`}
          title={audioMuted ? 'Unmute VHF radio audio' : 'Mute VHF radio audio'}
        >
          {audioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        {/* Layers menu trigger */}
        <button
          onClick={onToggleLayerMenu}
          className="p-1.5 bg-[#0f281a] hover:bg-[#183d29] text-[#a2f5bf] border border-[#1e4a31] rounded transition-colors"
          title="Toggle radar layers"
        >
          <Layers className="w-3.5 h-3.5" />
        </button>

        {/* Scenario Selector */}
        <button
          onClick={onOpenScenario}
          className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 bg-[#0f281a] hover:bg-[#183d29] text-[#a2f5bf] border border-[#1e4a31] rounded transition-colors"
          title="Select simulation scenario"
        >
          <span>Scenarios</span>
        </button>

        {/* Reset */}
        <button
          onClick={() => resetSimulation()}
          className="p-1.5 bg-[#0f281a] hover:bg-[#183d29] text-[#a2f5bf] border border-[#1e4a31] rounded transition-colors"
          title="Reset simulation to initial state"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Help */}
        <button
          onClick={onOpenHelp}
          className="p-1.5 bg-[#0f281a] hover:bg-[#183d29] text-[#00ff66] border border-[#1e4a31] rounded transition-colors"
          title="View ATC Radar instructions & quick guide"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
