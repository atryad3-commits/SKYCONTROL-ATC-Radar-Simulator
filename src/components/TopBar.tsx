/**
 * SKYCONTROL - Decluttered Aviation Workstation Header
 * Strict 3-zone layout:
 *   Zone 1: Brand wordmark + quiet inline sector/weather/UTC readout
 *   Zone 2: Clean workspace page navigation (Radar Scope | Sector & Setup | Audio Studio | Manual & Profile)
 *   Zone 3: Essential live simulation controls (Pause/Resume, Audio Mute, Controller Callsign)
 */

import React, { useState, useEffect } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { UserProfileData } from '../types';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Award,
  UserCheck,
} from 'lucide-react';

export type WorkspacePage = 'radar' | 'setup' | 'audio' | 'profile';

interface TopBarProps {
  activePage: WorkspacePage;
  onSelectPage: (page: WorkspacePage) => void;
  userProfile: UserProfileData | null;
  onOpenAccount: () => void;
}

const NAV_PAGES: Array<{ id: WorkspacePage; label: string }> = [
  { id: 'radar', label: 'Radar Scope' },
  { id: 'setup', label: 'Sector & Setup' },
  { id: 'audio', label: 'Audio Studio' },
  { id: 'profile', label: 'Manual & Profile' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activePage,
  onSelectPage,
  userProfile,
  onOpenAccount,
}) => {
  const airport = useSimulationStore(state => state.airport);
  const activeLandingRunwayId = useSimulationStore(state => state.activeLandingRunwayId);
  const activeDepartureRunwayId = useSimulationStore(state => state.activeDepartureRunwayId);
  const weather = useSimulationStore(state => state.weather);
  const isPaused = useSimulationStore(state => state.isPaused);
  const stats = useSimulationStore(state => state.stats);
  const audioMuted = useSimulationStore(state => state.audioMuted);
  const aircraftCount = useSimulationStore(state => state.aircraft.length);

  const togglePause = useSimulationStore(state => state.togglePause);
  const setAudioMuted = useSimulationStore(state => state.setAudioMuted);

  const [utcTime, setUtcTime] = useState<string>(() => new Date().toTimeString().split(' ')[0]);

  useEffect(() => {
    const timer = setInterval(() => {
      setUtcTime(new Date().toTimeString().split(' ')[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-12 bg-[#07110c] border-b border-[#163826] px-4 flex items-center justify-between gap-6 text-xs select-none shrink-0 z-30">
      {/* Zone 1: Brand Wordmark + Quiet Inline Sector Context */}
      <div className="flex items-center gap-3 min-w-0 shrink-0">
        <button
          type="button"
          onClick={() => onSelectPage('radar')}
          className="font-mono font-bold tracking-wider text-sm text-[#00ff66] whitespace-nowrap shrink-0 hover:text-[#6bffa6] transition-colors"
        >
          SKYCONTROL
        </button>

        <div className="hidden xl:flex items-center gap-2 text-[11px] font-mono text-[#74b990] tabular-nums whitespace-nowrap">
          <span className="text-[#204a32]" aria-hidden="true">|</span>
          <span className="text-white font-semibold">{airport.icao}</span>
          <span className="text-[#34694a]" aria-hidden="true">·</span>
          <span>RWY {activeLandingRunwayId}/{activeDepartureRunwayId}</span>
          <span className="text-[#34694a]" aria-hidden="true">·</span>
          <span>{weather.windDirection.toString().padStart(3, '0')}°/{weather.windSpeed}kt</span>
          <span className="text-[#34694a]" aria-hidden="true">·</span>
          <span>QNH {weather.qnh}</span>
          <span className="text-[#34694a]" aria-hidden="true">·</span>
          <span>TFC <b className="text-[#00ff66]">{aircraftCount}</b></span>
          {stats.separationViolations > 0 && (
            <>
              <span className="text-[#34694a]" aria-hidden="true">·</span>
              <span className="text-[#ff4d4d] font-bold">STCA {stats.separationViolations}</span>
            </>
          )}
          <span className="text-[#34694a]" aria-hidden="true">·</span>
          <span className="text-[#a2f5bf]">{utcTime}Z</span>
        </div>
      </div>

      {/* Zone 2: Clean Single-Line Workspace Navigation */}
      <nav className="flex items-center gap-5 sm:gap-7 h-full overflow-x-auto no-scrollbar">
        {NAV_PAGES.map(item => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectPage(item.id)}
              className={`h-full flex items-center text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'border-[#00ff66] text-[#00ff66] font-semibold'
                  : 'border-transparent text-[#7bb994] hover:text-white'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Essential Live Simulation State & Controller Identity */}
      <div className="flex items-center gap-2 shrink-0 font-mono">
        <button
          type="button"
          onClick={togglePause}
          className={`px-3 py-1.5 rounded flex items-center gap-1.5 border text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
            isPaused
              ? 'bg-[#d97706] hover:bg-[#f59e0b] text-black border-[#f59e0b]'
              : 'bg-[#0c2116] hover:bg-[#133322] text-[#00ff66] border-[#1d4c32]'
          }`}
          title={isPaused ? 'Resume Radar Simulation' : 'Pause Radar Simulation'}
        >
          {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isPaused ? 'Resume' : 'Pause'}</span>
        </button>

        <button
          type="button"
          onClick={() => setAudioMuted(!audioMuted)}
          className={`p-1.5 rounded border transition-colors shrink-0 ${
            audioMuted
              ? 'bg-[#2b1414] text-[#ff6b6b] border-[#5e2222]'
              : 'bg-[#0c2116] hover:bg-[#133322] text-[#8ad8a8] border-[#1d4c32]'
          }`}
          title={audioMuted ? 'Enable Radio Audio' : 'Mute Radio Audio'}
          aria-label={audioMuted ? 'Enable Radio Audio' : 'Mute Radio Audio'}
        >
          {audioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={() => (userProfile ? onSelectPage('profile') : onOpenAccount())}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-[#0a1b12] hover:bg-[#122e1f] text-[#d1e7dd] border border-[#1a402b] rounded text-[11px] transition-colors whitespace-nowrap shrink-0"
          title="Controller Profile & Certification"
        >
          {userProfile?.certified ? (
            <Award className="w-3.5 h-3.5 text-[#ffd166]" />
          ) : (
            <UserCheck className="w-3.5 h-3.5 text-[#00e5ff]" />
          )}
          <span className="max-w-[96px] truncate font-semibold">
            {userProfile ? userProfile.callsign : 'Sign In'}
          </span>
        </button>
      </div>
    </header>
  );
};
