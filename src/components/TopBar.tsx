/**
 * SKYCONTROL - Aviation Console Top Bar
 * Adheres to strict one-row workstation layout with UTC clock, sim speed controls,
 * weather status, audio toggle, and scenario actions.
 */

import React, { useState, useEffect } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { UserProfileData } from '../types';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Plus,
  RotateCcw,
  HelpCircle,
  Layers,
  Wind,
  Compass,
  Award,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';

interface TopBarProps {
  userProfile: UserProfileData | null;
  onOpenHelp: () => void;
  onOpenOperationsHub: () => void;
  onOpenAccount: () => void;
  onToggleLayerMenu: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  userProfile,
  onOpenHelp,
  onOpenOperationsHub,
  onOpenAccount,
  onToggleLayerMenu,
}) => {
  const airport = useSimulationStore(state => state.airport);
  const activeLandingRunwayId = useSimulationStore(state => state.activeLandingRunwayId);
  const activeDepartureRunwayId = useSimulationStore(state => state.activeDepartureRunwayId);
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
  const triggerEmergency = useSimulationStore(state => state.triggerEmergency);
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
    <header className="h-13 bg-[#08130e] border-b border-[#163826] px-3 flex items-center justify-between gap-3 text-xs font-mono select-none shrink-0 z-30">
      {/* Zone 1: Brand Wordmark & Dynamic Airport Sector */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="font-bold tracking-wider text-sm text-[#00ff66] whitespace-nowrap shrink-0">
          SKYCONTROL
        </span>
        <span className="text-[#204a32] hidden sm:inline">|</span>
        <button
          onClick={onOpenOperationsHub}
          className="hidden sm:flex items-center gap-1.5 text-[#a2f5bf] hover:text-white transition-colors whitespace-nowrap shrink-0"
          title="تغییر فرودگاه، مأموریت‌های آموزشی و سناریوهای شخصی"
        >
          <span className="font-semibold text-white">{airport.icao}</span>
          <span className="text-[#4e8b69] hidden xl:inline">{airport.name}</span>
          <span className="text-[#3f7d58] text-[11px] tabular-nums">
            · RWY {activeLandingRunwayId}/{activeDepartureRunwayId}
          </span>
        </button>
      </div>

      {/* Zone 2: Live Telemetry Metrics */}
      <div className="hidden lg:flex items-center gap-4 text-[#86d9a5] tabular-nums whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[#407d57]">UTC</span>
          <span className="font-semibold text-white">{utcTime}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Wind className="w-3.5 h-3.5 text-[#407d57]" />
          <span>{weather.windDirection.toString().padStart(3, '0')}°/{weather.windSpeed}kt</span>
          <span className="text-[#407d57]">QNH</span>
          <span>{weather.qnh}</span>
        </div>

        <div className="flex items-center gap-3">
          <span>
            <span className="text-[#407d57]">TFC </span>
            <span className="font-semibold text-[#00ff66]">{aircraftCount}</span>
          </span>
          <span>
            <span className="text-[#407d57]">LND </span>
            <span className="font-semibold text-[#00e5ff]">{stats.landings}</span>
          </span>
          <span>
            <span className="text-[#407d57]">SCR </span>
            <span
              className={`font-semibold ${
                stats.score >= 90 ? 'text-[#00ff66]' : stats.score >= 70 ? 'text-[#ffb703]' : 'text-[#ff3344]'
              }`}
            >
              {stats.score}%
            </span>
          </span>
          {stats.separationViolations > 0 && (
            <span className="text-[#ff4d4d] font-bold">
              STCA {stats.separationViolations}
            </span>
          )}
        </div>
      </div>

      {/* Zone 3: Tactical Sim Controls, Operations Hub & Account */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Operations Hub (Academy + Airports + Scenario Studio) */}
        <button
          onClick={onOpenOperationsHub}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#123321] hover:bg-[#19472f] text-[#00ff66] border border-[#246340] rounded font-semibold transition-colors whitespace-nowrap shrink-0"
          title="آکادمی گواهینامه، انتخاب فرودگاه و استودیوی سناریو"
        >
          <Compass className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">آکادمی و سناریوها</span>
        </button>

        {/* Spawn Controls */}
        <button
          onClick={spawnInbound}
          className="hidden md:flex items-center gap-1 px-2 py-1.5 bg-[#0f281a] hover:bg-[#183d29] text-[#00ff66] border border-[#1e4a31] rounded transition-colors whitespace-nowrap shrink-0"
          title="ورود پرواز جدید به رادار"
        >
          <Plus className="w-3 h-3" />
          <span>Inbound</span>
        </button>

        <button
          onClick={spawnDeparture}
          className="hidden md:flex items-center gap-1 px-2 py-1.5 bg-[#0f281a] hover:bg-[#183d29] text-[#00e5ff] border border-[#1e4a31] rounded transition-colors whitespace-nowrap shrink-0"
          title={`پرواز خروجی از باند ${activeDepartureRunwayId}`}
        >
          <Plus className="w-3 h-3" />
          <span>Dep</span>
        </button>

        <button
          onClick={() => triggerEmergency('ENGINE_FAILURE')}
          className="hidden xl:flex items-center gap-1 px-2 py-1.5 bg-[#2a1214] hover:bg-[#3d191c] text-[#ff6b6b] border border-[#5e2226] rounded transition-colors whitespace-nowrap shrink-0 tabular-nums"
          title="اعلام وضعیت اضطراری Squawk 7700"
        >
          <AlertTriangle className="w-3 h-3" />
          <span>7700</span>
        </button>

        {/* Speed multiplier */}
        <div className="flex items-center bg-[#0a1710] border border-[#163826] rounded p-0.5 shrink-0">
          {[1, 2, 5].map(spd => (
            <button
              key={spd}
              onClick={() => setSimSpeed(spd)}
              className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition-colors whitespace-nowrap ${
                simSpeed === spd
                  ? 'bg-[#194029] text-[#00ff66]'
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
          className={`px-2 py-1.5 rounded flex items-center gap-1 border transition-colors whitespace-nowrap shrink-0 ${
            isPaused
              ? 'bg-[#d97706] text-black border-[#f59e0b] font-bold'
              : 'bg-[#0f281a] hover:bg-[#183d29] text-[#00ff66] border-[#1e4a31]'
          }`}
          title={isPaused ? 'ادامه شبیه‌سازی' : 'توقف موقت'}
        >
          {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isPaused ? 'RESUME' : 'PAUSE'}</span>
        </button>

        {/* Audio Mute */}
        <button
          onClick={() => setAudioMuted(!audioMuted)}
          className={`p-1.5 rounded border transition-colors shrink-0 ${
            audioMuted
              ? 'bg-[#2b1616] text-[#ff6b6b] border-[#5e2222]'
              : 'bg-[#0f281a] hover:bg-[#183d29] text-[#00ff66] border-[#1e4a31]'
          }`}
          title={audioMuted ? 'فعال‌سازی صدای رادیو' : 'قطع صدای رادیو'}
        >
          {audioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        {/* Layers */}
        <button
          onClick={onToggleLayerMenu}
          className="p-1.5 bg-[#0f281a] hover:bg-[#183d29] text-[#a2f5bf] border border-[#1e4a31] rounded transition-colors shrink-0"
          title="لایه‌های رادار"
        >
          <Layers className="w-3.5 h-3.5" />
        </button>

        {/* Reset */}
        <button
          onClick={() => resetSimulation()}
          className="p-1.5 bg-[#0f281a] hover:bg-[#183d29] text-[#a2f5bf] border border-[#1e4a31] rounded transition-colors shrink-0"
          title="شروع مجدد رادار"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Account & Certification Trigger */}
        <button
          onClick={onOpenAccount}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#0c2017] hover:bg-[#153526] text-[#d1e7dd] border border-[#1e4a31] rounded transition-colors whitespace-nowrap shrink-0"
          title="حساب کنترلر و گواهینامه"
        >
          {userProfile?.certified ? (
            <Award className="w-3.5 h-3.5 text-[#ffd166]" />
          ) : (
            <UserCheck className="w-3.5 h-3.5 text-[#00e5ff]" />
          )}
          <span className="max-w-[96px] truncate font-semibold">
            {userProfile ? userProfile.callsign : 'ورود کنترلر'}
          </span>
        </button>

        {/* Help */}
        <button
          onClick={onOpenHelp}
          className="p-1.5 bg-[#0f281a] hover:bg-[#183d29] text-[#00ff66] border border-[#1e4a31] rounded transition-colors shrink-0"
          title="راهنمای عملیاتی"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
