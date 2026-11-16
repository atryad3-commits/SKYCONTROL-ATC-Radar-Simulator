/**
 * SKYCONTROL - Pre-Flight Operations & Radar Configuration Console
 * Mandatory startup briefing modal shown after user sign-in/guest entry while
 * radar simulation remains paused, and reopenable mid-session from TopBar.
 * Covers Airport/Runways, Per-Airport Individual STAR/SID/Waypoint Toggles,
 * Traffic & Weather/QNH, and Offline Audio/VHF/Simulation Speed settings.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Compass,
  Navigation,
  Play,
  Radio,
  RotateCcw,
  Sliders,
  Users,
  Wind,
  X,
} from 'lucide-react';
import {
  AirportNavVisibility,
  CustomScenarioConfig,
  MissionId,
  PreFlightSessionConfig,
  UserProfileData,
  WeatherCondition,
} from '../types';
import { ALL_AIRPORT_PROFILES, getAirportProfile } from '../airports/airportsRegistry';
import {
  computeDefaultAirportVisibility,
  computeRunwayMatchedVisibility,
} from '../airports/procedures';
import { ACADEMY_MISSIONS } from '../engine/missions';
import { RadarLayers, useSimulationStore } from '../store/simulationStore';
import { radioAudio, TOWER_VOICE_PROFILES } from '../audio/radioAudio';
import { VHF_RADIO_PRESETS, VhfQualityPresetId } from '../audio/vhfRadioDsp';

export type PreFlightTab = 'airport' | 'routes' | 'traffic_weather' | 'audio_sim';

interface PreFlightSetupModalProps {
  isOpen: boolean;
  canDismiss: boolean;
  userProfile: UserProfileData | null;
  scenarios: CustomScenarioConfig[];
  onClose: () => void;
}

const VHF_PRESET_KEYS: Array<Exclude<VhfQualityPresetId, 'custom'>> = [
  'clear_communication',
  'normal_aviation',
  'weak_signal',
  'heavy_interference',
  'emergency_transmission',
];

const PRECIPITATION_OPTIONS: Array<{
  value: WeatherCondition['precipitation'];
  label: string;
}> = [
  { value: 'None', label: 'Clear (None)' },
  { value: 'Light Rain', label: 'Light Rain' },
  { value: 'Rain', label: 'Heavy Rain' },
  { value: 'Fog', label: 'Dense Fog' },
];

export const PreFlightSetupModal: React.FC<PreFlightSetupModalProps> = ({
  isOpen,
  canDismiss,
  userProfile,
  scenarios,
  onClose,
}) => {
  const storeAirport = useSimulationStore(state => state.airport);
  const storeLandingRwy = useSimulationStore(state => state.activeLandingRunwayId);
  const storeDepartureRwy = useSimulationStore(state => state.activeDepartureRunwayId);
  const storeSpawnInterval = useSimulationStore(state => state.spawnIntervalSec);
  const storeMaxTraffic = useSimulationStore(state => state.maxTraffic);
  const storeHeavyRatio = useSimulationStore(state => state.heavyRatio);
  const storeAllowEmergencies = useSimulationStore(state => state.allowEmergencies);
  const storeEmergencyDelay = useSimulationStore(state => state.emergencyDelaySec);
  const storeWeather = useSimulationStore(state => state.weather);
  const storeAudioMuted = useSimulationStore(state => state.audioMuted);
  const storeAudioVolume = useSimulationStore(state => state.audioVolume);
  const storeTowerVoiceId = useSimulationStore(state => state.towerVoiceId);
  const storeSimSpeed = useSimulationStore(state => state.simSpeed);
  const radarLayers = useSimulationStore(state => state.radarLayers);
  const storePerAirportVisibility = useSimulationStore(state => state.perAirportVisibility);

  const toggleLayer = useSimulationStore(state => state.toggleLayer);
  const applyPreFlightSession = useSimulationStore(state => state.applyPreFlightSession);

  const [activeTab, setActiveTab] = useState<PreFlightTab>('airport');
  const [mode, setMode] = useState<'free' | 'mission' | 'custom'>('free');
  const [selectedMissionId, setSelectedMissionId] = useState<MissionId>('mission_1');
  const [selectedCustomId, setSelectedCustomId] = useState<string>(scenarios[0]?.id || '');

  // Airport & Runways Draft State
  const [airportIcao, setAirportIcao] = useState<string>(storeAirport.icao || 'EGLL');
  const [landingRwyId, setLandingRwyId] = useState<string>(storeLandingRwy || '27R');
  const [departureRwyId, setDepartureRwyId] = useState<string>(storeDepartureRwy || '27L');

  // Traffic & Weather Draft State
  const [spawnIntervalSec, setSpawnIntervalSec] = useState<number>(storeSpawnInterval || 45);
  const [maxTraffic, setMaxTraffic] = useState<number>(storeMaxTraffic || 10);
  const [initialInbounds, setInitialInbounds] = useState<number>(3);
  const [initialDepartures, setInitialDepartures] = useState<number>(1);
  const [heavyRatio, setHeavyRatio] = useState<number>(storeHeavyRatio ?? 0.35);
  const [allowEmergencies, setAllowEmergencies] = useState<boolean>(storeAllowEmergencies);
  const [emergencyDelaySec, setEmergencyDelaySec] = useState<number>(storeEmergencyDelay || 45);
  const [weather, setWeather] = useState<WeatherCondition>({ ...storeWeather });

  // Audio & Sim Draft State
  const [audioMuted, setAudioMuted] = useState<boolean>(storeAudioMuted);
  const [audioVolume, setAudioVolume] = useState<number>(storeAudioVolume ?? 0.85);
  const [towerVoiceId, setTowerVoiceId] = useState<string>(storeTowerVoiceId || 'charon');
  const [radioPreset, setRadioPreset] = useState<Exclude<VhfQualityPresetId, 'custom'>>(() => {
    const cur = radioAudio.getVhfSettings().preset;
    return cur === 'custom' ? 'normal_aviation' : cur;
  });
  const [simSpeed, setSimSpeed] = useState<number>(storeSimSpeed || 1);

  // Per-airport route & waypoint visibility draft copy
  const [draftVisMap, setDraftVisMap] = useState<Record<string, AirportNavVisibility>>(() => ({
    ...storePerAirportVisibility,
  }));

  useEffect(() => {
    if (!isOpen) return;
    setAirportIcao(storeAirport.icao);
    setLandingRwyId(storeLandingRwy);
    setDepartureRwyId(storeDepartureRwy);
    setSpawnIntervalSec(storeSpawnInterval);
    setMaxTraffic(storeMaxTraffic);
    setHeavyRatio(storeHeavyRatio);
    setAllowEmergencies(storeAllowEmergencies);
    setEmergencyDelaySec(storeEmergencyDelay);
    setWeather({ ...storeWeather });
    setAudioMuted(storeAudioMuted);
    setAudioVolume(storeAudioVolume);
    setTowerVoiceId(storeTowerVoiceId);
    const curPreset = radioAudio.getVhfSettings().preset;
    setRadioPreset(curPreset === 'custom' ? 'normal_aviation' : curPreset);
    setSimSpeed(storeSimSpeed || 1);
    setDraftVisMap({ ...storePerAirportVisibility });
  }, [
    isOpen,
    storeAirport.icao,
    storeLandingRwy,
    storeDepartureRwy,
    storeSpawnInterval,
    storeMaxTraffic,
    storeHeavyRatio,
    storeAllowEmergencies,
    storeEmergencyDelay,
    storeWeather,
    storeAudioMuted,
    storeAudioVolume,
    storeTowerVoiceId,
    storeSimSpeed,
    storePerAirportVisibility,
  ]);

  const selectedProfile = useMemo(() => getAirportProfile(airportIcao), [airportIcao]);

  const currentAirportVis: AirportNavVisibility = useMemo(() => {
    return (
      draftVisMap[airportIcao] || computeDefaultAirportVisibility(selectedProfile.airport)
    );
  }, [draftVisMap, airportIcao, selectedProfile.airport]);

  const reciprocalConflict = useMemo(() => {
    return selectedProfile.reciprocalPairs.some(
      ([a, b]) =>
        (landingRwyId === a && departureRwyId === b) ||
        (landingRwyId === b && departureRwyId === a)
    );
  }, [selectedProfile.reciprocalPairs, landingRwyId, departureRwyId]);

  if (!isOpen) return null;

  const handleAirportPick = (icao: string) => {
    const prof = getAirportProfile(icao);
    setAirportIcao(icao);
    setLandingRwyId(prof.airport.defaultArrivalRunway);
    setDepartureRwyId(prof.airport.defaultDepartureRunway);
    setWeather({ ...prof.defaultWeather });
    setMode('free');
  };

  const handleSelectMission = (missionId: MissionId) => {
    setMode('mission');
    setSelectedMissionId(missionId);
    const msn = ACADEMY_MISSIONS.find(m => m.id === missionId);
    if (msn) {
      setAirportIcao(msn.airportIcao);
      setLandingRwyId(msn.landingRunwayId);
      setDepartureRwyId(msn.departureRunwayId);
      setWeather({ ...msn.weather });
      setSpawnIntervalSec(msn.spawnIntervalSec);
      setMaxTraffic(msn.maxTraffic);
      setInitialInbounds(msn.initialInbounds);
      setInitialDepartures(msn.initialDepartures);
      setAllowEmergencies(Boolean(msn.requireEmergencyHandled));
    }
  };

  const handleSelectCustomScenario = (scnId: string) => {
    setMode('custom');
    setSelectedCustomId(scnId);
    const scn = scenarios.find(s => s.id === scnId);
    if (scn) {
      setAirportIcao(scn.airportIcao);
      setLandingRwyId(scn.landingRunwayId);
      setDepartureRwyId(scn.departureRunwayId);
      setWeather({
        windDirection: scn.windDirection,
        windSpeed: scn.windSpeed,
        gusts: scn.gusts,
        qnh: scn.qnh,
        visibilityNM: scn.visibilityNM,
        ceilingFeet: scn.ceilingFeet,
        precipitation: scn.precipitation,
      });
      setSpawnIntervalSec(scn.spawnIntervalSec);
      setInitialInbounds(scn.initialInbounds);
      setInitialDepartures(scn.initialDepartures);
      setHeavyRatio(scn.heavyRatio);
      setAllowEmergencies(scn.allowEmergencies);
      setEmergencyDelaySec(scn.emergencyDelaySec);
    }
  };

  const toggleDraftStar = (starId: string) => {
    const cur = currentAirportVis;
    const exists = cur.visibleStarIds.includes(starId);
    const nextStarIds = exists
      ? cur.visibleStarIds.filter(id => id !== starId)
      : [...cur.visibleStarIds, starId];
    setDraftVisMap(prev => ({
      ...prev,
      [airportIcao]: { ...cur, visibleStarIds: nextStarIds },
    }));
  };

  const toggleDraftSid = (sidId: string) => {
    const cur = currentAirportVis;
    const exists = cur.visibleSidIds.includes(sidId);
    const nextSidIds = exists
      ? cur.visibleSidIds.filter(id => id !== sidId)
      : [...cur.visibleSidIds, sidId];
    setDraftVisMap(prev => ({
      ...prev,
      [airportIcao]: { ...cur, visibleSidIds: nextSidIds },
    }));
  };

  const toggleDraftWaypoint = (wpName: string) => {
    const cur = currentAirportVis;
    const exists = cur.visibleWaypoints.includes(wpName);
    const nextWps = exists
      ? cur.visibleWaypoints.filter(n => n !== wpName)
      : [...cur.visibleWaypoints, wpName];
    setDraftVisMap(prev => ({
      ...prev,
      [airportIcao]: { ...cur, visibleWaypoints: nextWps },
    }));
  };

  const handleSetAllRoutesForCurrent = (visible: boolean) => {
    const nextVis: AirportNavVisibility = visible
      ? computeDefaultAirportVisibility(selectedProfile.airport)
      : { visibleStarIds: [], visibleSidIds: [], visibleWaypoints: [] };
    setDraftVisMap(prev => ({ ...prev, [airportIcao]: nextVis }));
  };

  const handleMatchRunwaysForCurrent = () => {
    const matched = computeRunwayMatchedVisibility(
      selectedProfile.airport,
      landingRwyId,
      departureRwyId
    );
    setDraftVisMap(prev => ({ ...prev, [airportIcao]: matched }));
  };

  const applyWeatherPreset = (preset: 'calm' | 'airport' | 'crosswind' | 'storm') => {
    const arrRwy = selectedProfile.airport.runways.find(r => r.id === landingRwyId);
    const arrHdg = arrRwy ? arrRwy.heading : 270;
    const base = selectedProfile.defaultWeather;

    if (preset === 'calm') {
      setWeather({
        windDirection: arrHdg,
        windSpeed: 6,
        gusts: 9,
        qnh: 1016,
        visibilityNM: 10,
        ceilingFeet: 6500,
        precipitation: 'None',
      });
    } else if (preset === 'airport') {
      setWeather({ ...base });
    } else if (preset === 'crosswind') {
      setWeather({
        windDirection: (arrHdg + 75) % 360,
        windSpeed: 26,
        gusts: 34,
        qnh: 998,
        visibilityNM: 7,
        ceilingFeet: 3200,
        precipitation: 'Light Rain',
      });
    } else {
      setWeather({
        windDirection: (arrHdg + 55) % 360,
        windSpeed: 30,
        gusts: 42,
        qnh: 991,
        visibilityNM: 3,
        ceilingFeet: 1500,
        precipitation: 'Fog',
      });
    }
  };

  const handleStartOperations = () => {
    const customScn = mode === 'custom' ? scenarios.find(s => s.id === selectedCustomId) : undefined;
    const config: PreFlightSessionConfig = {
      airportIcao,
      landingRunwayId: landingRwyId,
      departureRunwayId: departureRwyId,
      mode,
      missionId: mode === 'mission' ? selectedMissionId : undefined,
      customScenarioId: mode === 'custom' ? selectedCustomId : undefined,
      spawnIntervalSec,
      maxTraffic,
      initialInbounds,
      initialDepartures,
      heavyRatio,
      allowEmergencies,
      emergencyDelaySec,
      weather,
      radioPreset,
      audioMuted,
      audioVolume,
      towerVoiceId,
      simSpeed,
      perAirportVisibility: draftVisMap,
    };

    applyPreFlightSession(config, customScn);
    onClose();
  };

  const stars = selectedProfile.airport.approachRoutes || [];
  const sids = selectedProfile.airport.departureRoutes || [];
  const waypoints = selectedProfile.airport.waypoints;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl max-h-[92vh] bg-[#07100b] border border-[#1b422d] rounded-lg shadow-2xl flex flex-col overflow-hidden select-none">
        {/* Top Briefing Header */}
        <div className="px-5 py-3.5 bg-[#09150f] border-b border-[#163826] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Compass className="w-5 h-5 text-[#00ff66]" />
            <div>
              <h2 className="text-sm font-bold text-white">
                Pre-Flight Operations &amp; Radar Setup Briefing
              </h2>
              <div className="text-[11px] text-[#7ec29a] flex items-center gap-2 mt-0.5 font-mono">
                <span>OP: {userProfile?.callsign || 'CTR-GUEST'}</span>
                <span>·</span>
                <span className="text-[#00e5ff]">{selectedProfile.airport.icao}</span>
                <span>·</span>
                <span>RWY {landingRwyId}/{departureRwyId}</span>
                <span>·</span>
                <span>{selectedProfile.airport.tmaBoundary?.sectorLabel || selectedProfile.airport.sector.name}</span>
              </div>
            </div>
          </div>

          {canDismiss && (
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[#163826] text-[#5da87d] hover:text-white transition-colors"
              title="Close and Return to Radar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Hairline Sub-Navigation Tabs */}
        <div className="px-5 bg-[#08130e] border-b border-[#163826] flex items-center gap-6 overflow-x-auto text-xs">
          {(
            [
              { id: 'airport', label: '1. Airport, Runways & Mode', icon: Compass },
              {
                id: 'routes',
                label: `2. ${airportIcao} Procedures (${currentAirportVis.visibleStarIds.length} STAR · ${currentAirportVis.visibleSidIds.length} SID · ${currentAirportVis.visibleWaypoints.length} FIX)`,
                icon: Navigation,
              },
              { id: 'traffic_weather', label: '3. Traffic, Weather & QNH', icon: Wind },
              { id: 'audio_sim', label: '4. Offline Audio, VHF & Sim Speed', icon: Radio },
            ] as const
          ).map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-[#00ff66] text-[#00ff66] font-bold'
                    : 'border-transparent text-[#6ba885] hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main Configuration Workspace */}
        <div className="flex-1 overflow-y-auto p-5 text-xs">
          {/* ============================================================== */}
          {/* TAB 1: AIRPORT, RUNWAYS & OPERATION MODE                       */}
          {/* ============================================================== */}
          {activeTab === 'airport' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Mode & Airport Selector */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                {/* Operation Mode */}
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#163826]">
                  <span className="font-bold text-white">Launch Mode:</span>
                  <div className="flex items-center gap-4 text-xs">
                    {[
                      { id: 'free', label: 'Free & Custom Operations' },
                      { id: 'mission', label: 'Academy Missions' },
                      { id: 'custom', label: `Saved Scenarios (${scenarios.length})` },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMode(opt.id as 'free' | 'mission' | 'custom')}
                        className={`pb-1 border-b-2 transition-colors whitespace-nowrap ${
                          mode === opt.id
                            ? 'border-[#00e5ff] text-[#00e5ff] font-bold'
                            : 'border-transparent text-[#6ba885] hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {mode === 'mission' ? (
                  <div className="flex flex-col gap-2.5">
                    {ACADEMY_MISSIONS.map(msn => {
                      const active = selectedMissionId === msn.id;
                      return (
                        <button
                          key={msn.id}
                          type="button"
                          onClick={() => handleSelectMission(msn.id)}
                          className={`text-left p-3.5 rounded border transition-colors flex flex-col gap-1 ${
                            active
                              ? 'bg-[#0e291b] border-[#00ff66]'
                              : 'bg-[#0a1610] hover:bg-[#0f2319] border-[#163826]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 w-full">
                            <span className="font-bold text-white">
                              {msn.number}. {msn.title}
                            </span>
                            <span className="font-mono text-[#00e5ff]">
                              {msn.airportIcao} · RWY {msn.landingRunwayId}/{msn.departureRunwayId}
                            </span>
                          </div>
                          <p className="text-[#85cca1]">{msn.description}</p>
                        </button>
                      );
                    })}
                  </div>
                ) : mode === 'custom' && scenarios.length > 0 ? (
                  <div className="flex flex-col gap-2.5">
                    {scenarios.map(scn => {
                      const active = selectedCustomId === scn.id;
                      return (
                        <button
                          key={scn.id}
                          type="button"
                          onClick={() => handleSelectCustomScenario(scn.id)}
                          className={`text-left p-3.5 rounded border transition-colors flex flex-col gap-1 ${
                            active
                              ? 'bg-[#0e291b] border-[#00ff66]'
                              : 'bg-[#0a1610] hover:bg-[#0f2319] border-[#163826]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 w-full">
                            <span className="font-bold text-white">{scn.name}</span>
                            <span className="font-mono text-[#00e5ff]">
                              {scn.airportIcao} · RWY {scn.landingRunwayId}/{scn.departureRunwayId}
                            </span>
                          </div>
                          <p className="text-[#85cca1]">{scn.description}</p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {mode === 'custom' && scenarios.length === 0 && (
                      <div className="text-[#ffd166] pb-2">
                        No saved scenarios found; select an airport below to begin:
                      </div>
                    )}
                    {ALL_AIRPORT_PROFILES.map(prof => {
                      const isSel = prof.airport.icao === airportIcao;
                      const starCount = prof.airport.approachRoutes?.length || 0;
                      const sidCount = prof.airport.departureRoutes?.length || 0;
                      const fixCount = prof.airport.waypoints.length;
                      return (
                        <button
                          key={prof.airport.icao}
                          type="button"
                          onClick={() => handleAirportPick(prof.airport.icao)}
                          className={`text-left p-3.5 rounded border transition-colors flex flex-col gap-1.5 ${
                            isSel
                              ? 'bg-[#0e291b] border-[#00ff66]'
                              : 'bg-[#0a1610] hover:bg-[#0f2319] border-[#163826]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 w-full">
                            <div className="flex items-center gap-2 font-mono">
                              <span className="text-sm font-bold text-[#00ff66]">{prof.airport.icao}</span>
                              <span className="text-white font-semibold">{prof.airport.name}</span>
                            </div>
                            <span className="text-[11px] text-[#a2f5bf]">
                              {prof.category} · {prof.difficultyLabel}
                            </span>
                          </div>
                          <p className="text-[#85cca1] leading-relaxed">{prof.summary}</p>
                          <div className="text-[11px] text-[#5da87d] font-mono tabular-nums">
                            {prof.runwayLayoutLabel} · ELEV {prof.airport.elevationFeet}ft · {starCount} STAR / {sidCount} SID / {fixCount} FIX
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Runway Assignment & Sector Info */}
              <div className="lg:col-span-5 bg-[#09160f] border border-[#163826] rounded p-4 flex flex-col gap-4 h-fit">
                <div className="pb-3 border-b border-[#163826]">
                  <div className="text-[11px] text-[#5da87d]">Active Runway Assignment</div>
                  <div className="text-base font-bold text-white font-mono mt-0.5">
                    {selectedProfile.airport.icao} · {selectedProfile.airport.name}
                  </div>
                  <div className="text-[11px] text-[#7ec29a] font-mono mt-1 tabular-nums">
                    ELEV {selectedProfile.airport.elevationFeet}ft · TA {selectedProfile.airport.sector.transitionAltitude}ft · VHF {selectedProfile.vhfFrequency}
                  </div>
                </div>

                {/* Active Landing Runway */}
                <div className="flex flex-col gap-2">
                  <label className="font-semibold text-[#00ff66]">
                    Active Landing Runway (Arrival / ILS)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedProfile.runwayGeometries.map(rwy => {
                      const active = landingRwyId === rwy.id;
                      return (
                        <button
                          key={`arr-${rwy.id}`}
                          type="button"
                          onClick={() => setLandingRwyId(rwy.id)}
                          className={`p-2.5 rounded border text-left font-mono transition-colors ${
                            active
                              ? 'bg-[#123823] border-[#00ff66] text-white'
                              : 'bg-[#07120c] border-[#163826] text-[#85cca1] hover:border-[#2a6b46]'
                          }`}
                        >
                          <div className="font-bold text-sm">RWY {rwy.id}</div>
                          <div className="text-[10px] text-[#5da87d] tabular-nums">
                            {rwy.magneticHeading.toString().padStart(3, '0')}° · ILS {rwy.ils?.frequency}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Active Departure Runway */}
                <div className="flex flex-col gap-2">
                  <label className="font-semibold text-[#00e5ff]">
                    Active Departure Runway (Departure / SID)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedProfile.runwayGeometries.map(rwy => {
                      const active = departureRwyId === rwy.id;
                      return (
                        <button
                          key={`dep-${rwy.id}`}
                          type="button"
                          onClick={() => setDepartureRwyId(rwy.id)}
                          className={`p-2.5 rounded border text-left font-mono transition-colors ${
                            active
                              ? 'bg-[#0c2d3b] border-[#00e5ff] text-white'
                              : 'bg-[#07120c] border-[#163826] text-[#85cca1] hover:border-[#24667d]'
                          }`}
                        >
                          <div className="font-bold text-sm">RWY {rwy.id}</div>
                          <div className="text-[10px] text-[#66b8cc] tabular-nums">
                            {rwy.magneticHeading.toString().padStart(3, '0')}° · {(rwy.lengthFeet / 1000).toFixed(1)}k ft
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {reciprocalConflict && (
                  <div className="text-[11px] text-[#ffd166] border-t border-[#163826] pt-2.5">
                    Caution: Selected arrival and departure runways are reciprocal ends of the same physical runway surface (requires strict opposite-direction coordination).
                  </div>
                )}

                <div className="border-t border-[#163826] pt-3 flex items-center justify-between gap-2">
                  <span className="text-[#85cca1]">Sync STAR/SID routes to selected runways:</span>
                  <button
                    type="button"
                    onClick={handleMatchRunwaysForCurrent}
                    className="px-3 py-1.5 bg-[#0f2b1c] hover:bg-[#18452d] border border-[#246340] text-[#00ff66] rounded font-semibold transition-colors whitespace-nowrap"
                  >
                    Match Active RWY
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: PER-AIRPORT INDIVIDUAL ROUTES & WAYPOINTS               */}
          {/* ============================================================== */}
          {activeTab === 'routes' && (
            <div className="flex flex-col gap-5">
              {/* Top Quick Action Strip */}
              <div className="pb-3 border-b border-[#163826] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Per-Airport Approach (STAR), Departure (SID) &amp; Fix Visibility · {airportIcao}
                  </h3>
                  <p className="text-[#85cca1] mt-0.5">
                    Each procedure corridor and navigation fix is saved independently for <span className="font-mono text-[#00e5ff]">{airportIcao}</span> and can also be toggled live from the radar Layers control.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleMatchRunwaysForCurrent}
                    className="px-3 py-1.5 bg-[#0f2e3b] hover:bg-[#164254] border border-[#1f627d] text-[#00e5ff] rounded font-semibold transition-colors whitespace-nowrap"
                  >
                    Match RWY {landingRwyId}/{departureRwyId}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllRoutesForCurrent(true)}
                    className="px-3 py-1.5 bg-[#123321] hover:bg-[#1a472e] border border-[#246340] text-[#00ff66] rounded font-semibold transition-colors whitespace-nowrap"
                  >
                    All On
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllRoutesForCurrent(false)}
                    className="px-3 py-1.5 bg-[#1f1314] hover:bg-[#2e1b1c] border border-[#4d2629] text-[#ff858d] rounded font-semibold transition-colors whitespace-nowrap"
                  >
                    All Off
                  </button>
                </div>
              </div>

              {/* 3-Column Independent Route & Fix Switches */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Column A: Individual STAR Corridors */}
                <div className="flex flex-col gap-2">
                  <div className="pb-2 border-b border-[#163826] flex items-center justify-between">
                    <span className="font-bold text-[#00e5ff]">Approach Routes (STARs)</span>
                    <span className="font-mono text-[11px] text-[#7ec29a]">
                      {currentAirportVis.visibleStarIds.length} / {stars.length}
                    </span>
                  </div>

                  {stars.map(star => {
                    const enabled = currentAirportVis.visibleStarIds.includes(star.id);
                    const totalNm = star.legs.reduce((s, l) => s + l.distanceNM, 0);
                    return (
                      <div
                        key={star.id}
                        onClick={() => toggleDraftStar(star.id)}
                        className={`p-2.5 rounded border cursor-pointer transition-colors flex items-start justify-between gap-2.5 ${
                          enabled
                            ? 'bg-[#0b1f16] border-[#1d5236]'
                            : 'bg-[#07100b] border-[#12261b] opacity-65 hover:opacity-95'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 font-mono">
                            <span className="font-bold text-[#00e5ff]">{star.name}</span>
                            <span className="text-[10px] text-[#85cca1]">
                              RWY {star.runwayIds.join('/')}
                            </span>
                            <span className="text-[10px] text-[#ffd166] tabular-nums">
                              {totalNm.toFixed(1)}NM
                            </span>
                          </div>
                          <div className="text-[11px] text-[#a2f5bf] font-mono mt-0.5 truncate">
                            {star.waypointNames.join(' → ')}
                          </div>
                          <div className="text-[10px] text-[#5da87d] mt-0.5">
                            {star.initialAltitudeFt ? `${star.initialAltitudeFt}ft` : ''} → {star.finalAltitudeFt ? `${star.finalAltitudeFt}ft` : ''} · MAX {star.maxSpeedKt || 220}KT
                          </div>
                        </div>

                        <div
                          className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center border shrink-0 ${
                            enabled
                              ? 'bg-[#00e5ff] border-[#00e5ff] text-black'
                              : 'border-[#2d5c3f] bg-[#060f0a]'
                          }`}
                        >
                          {enabled && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Column B: Individual SID Exit Corridors */}
                <div className="flex flex-col gap-2">
                  <div className="pb-2 border-b border-[#163826] flex items-center justify-between">
                    <span className="font-bold text-[#ffd166]">Departure Corridors (SIDs)</span>
                    <span className="font-mono text-[11px] text-[#7ec29a]">
                      {currentAirportVis.visibleSidIds.length} / {sids.length}
                    </span>
                  </div>

                  {sids.map(sid => {
                    const enabled = currentAirportVis.visibleSidIds.includes(sid.id);
                    const totalNm = sid.legs.reduce((s, l) => s + l.distanceNM, 0);
                    return (
                      <div
                        key={sid.id}
                        onClick={() => toggleDraftSid(sid.id)}
                        className={`p-2.5 rounded border cursor-pointer transition-colors flex items-start justify-between gap-2.5 ${
                          enabled
                            ? 'bg-[#171a0d] border-[#52461a]'
                            : 'bg-[#07100b] border-[#12261b] opacity-65 hover:opacity-95'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 font-mono">
                            <span className="font-bold text-[#ffd166]">{sid.name}</span>
                            <span className="text-[10px] text-[#a2f5bf]">
                              DEP {sid.runwayIds.join('/')}
                            </span>
                            <span className="text-[10px] text-[#00e5ff] tabular-nums">
                              {totalNm.toFixed(1)}NM
                            </span>
                          </div>
                          <div className="text-[11px] text-[#e6f4ea] font-mono mt-0.5 truncate">
                            {sid.waypointNames.join(' → ')}
                          </div>
                          <div className="text-[10px] text-[#9bb885] mt-0.5">
                            CLIMB MIN {sid.finalAltitudeFt ? `${sid.finalAltitudeFt}ft` : 'FL090'} · MAX {sid.maxSpeedKt || 250}KT
                          </div>
                        </div>

                        <div
                          className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center border shrink-0 ${
                            enabled
                              ? 'bg-[#ffd166] border-[#ffd166] text-black'
                              : 'border-[#2d5c3f] bg-[#060f0a]'
                          }`}
                        >
                          {enabled && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Column C: Individual Waypoints & Fixes (IAF / FAF / HOLD / EXIT) */}
                <div className="flex flex-col gap-2">
                  <div className="pb-2 border-b border-[#163826] flex items-center justify-between">
                    <span className="font-bold text-[#00ff66]">Navigation Fixes (IAF / FAF / EXIT / HOLD)</span>
                    <span className="font-mono text-[11px] text-[#7ec29a]">
                      {currentAirportVis.visibleWaypoints.length} / {waypoints.length}
                    </span>
                  </div>

                  <div className="max-h-72 overflow-y-auto flex flex-col gap-1.5 pr-1">
                    {waypoints.map(wp => {
                      const enabled = currentAirportVis.visibleWaypoints.includes(wp.name);
                      const roleLabel =
                        wp.role ||
                        (wp.isFinalApproachFix
                          ? 'FAF'
                          : wp.isInitialApproachFix
                          ? 'IAF'
                          : wp.isDepartureExit
                          ? 'EXIT'
                          : wp.isHoldingFix
                          ? 'HOLD'
                          : 'FIX');
                      const roleColor =
                        roleLabel === 'FAF'
                          ? 'text-[#00ff66]'
                          : roleLabel === 'IAF'
                          ? 'text-[#00e5ff]'
                          : roleLabel === 'EXIT'
                          ? 'text-[#ffd166]'
                          : roleLabel === 'HOLD'
                          ? 'text-[#74d8ff]'
                          : 'text-[#85cca1]';

                      return (
                        <div
                          key={wp.name}
                          onClick={() => toggleDraftWaypoint(wp.name)}
                          className={`px-2.5 py-2 rounded border cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                            enabled
                              ? 'bg-[#0b1b13] border-[#163826] hover:border-[#246340]'
                              : 'bg-[#07100b] border-[#12261b] opacity-60 hover:opacity-95'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 font-mono">
                              <span className="font-bold text-white">{wp.name}</span>
                              <span className={`text-[10px] font-bold ${roleColor}`}>
                                [{roleLabel}]
                              </span>
                              {wp.altitudeConstraint && (
                                <span className="text-[10px] text-[#85cca1]">
                                  · {wp.altitudeConstraint}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#5da87d] truncate">
                              {wp.description}
                            </div>
                          </div>

                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                              enabled
                                ? 'bg-[#00ff66] border-[#00ff66] text-black'
                                : 'border-[#2d5c3f] bg-[#060f0a]'
                            }`}
                          >
                            {enabled && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Scope Information Layer Flags */}
              <div className="pt-3 border-t border-[#163826]">
                <div className="font-bold text-white mb-2.5">
                  Additional Scope Overlays &amp; Terrain Display:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {(
                    [
                      { key: 'terrain', label: 'Topographical Terrain & Elevation Contours' },
                      { key: 'tmaBoundary', label: 'TMA Sector Boundary & Altitude Envelope' },
                      { key: 'procedureRestrictions', label: 'Corridor Altitude, Speed & NM Constraints' },
                      { key: 'extendedTargetTags', label: 'Enriched Target Tags (Wake / VS / RWY / NM)' },
                      { key: 'extendedCenterlines', label: 'Extended Runway Centerlines & ILS Feathers' },
                      { key: 'rangeRings', label: 'Multi-Tier Concentric Range Rings & Compass' },
                    ] as Array<{ key: keyof RadarLayers; label: string }>
                  ).map(item => {
                    const active = radarLayers[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => toggleLayer(item.key)}
                        className={`p-2.5 rounded border text-left flex items-center justify-between gap-2 transition-colors ${
                          active
                            ? 'bg-[#0d2418] border-[#1d5236] text-white'
                            : 'bg-[#07100b] border-[#12261b] text-[#6ba885]'
                        }`}
                      >
                        <span className="text-[11px] font-semibold">{item.label}</span>
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                            active
                              ? 'bg-[#00ff66] border-[#00ff66] text-black'
                              : 'border-[#2d5c3f] bg-[#060f0a]'
                          }`}
                        >
                          {active && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: TRAFFIC RATES & FULL WEATHER / QNH                      */}
          {/* ============================================================== */}
          {activeTab === 'traffic_weather' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Traffic Panel */}
              <div className="lg:col-span-6 bg-[#09160f] border border-[#163826] rounded p-4 flex flex-col gap-4">
                <div className="pb-2.5 border-b border-[#163826] flex items-center gap-2 text-[#00ff66] font-bold">
                  <Users className="w-4 h-4" />
                  <span>Air Traffic Density &amp; Arrival Rate</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[#a2f5bf]">
                      Initial Inbounds: <b className="font-mono text-white">{initialInbounds}</b>
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={8}
                      value={initialInbounds}
                      onChange={e => setInitialInbounds(Number(e.target.value))}
                      className="accent-[#00ff66]"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[#a2f5bf]">
                      Initial Departures: <b className="font-mono text-white">{initialDepartures}</b>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={4}
                      value={initialDepartures}
                      onChange={e => setInitialDepartures(Number(e.target.value))}
                      className="accent-[#00e5ff]"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[#a2f5bf]">
                      Max Concurrent Traffic: <b className="font-mono text-white">{maxTraffic}</b>
                    </span>
                    <input
                      type="range"
                      min={4}
                      max={18}
                      value={maxTraffic}
                      onChange={e => setMaxTraffic(Number(e.target.value))}
                      className="accent-[#00ff66]"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[#a2f5bf]">
                      New Arrival Interval: <b className="font-mono text-white">{spawnIntervalSec}s</b>
                    </span>
                    <input
                      type="range"
                      min={15}
                      max={90}
                      step={5}
                      value={spawnIntervalSec}
                      onChange={e => setSpawnIntervalSec(Number(e.target.value))}
                      className="accent-[#00ff66]"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1.5 pt-2 border-t border-[#163826]">
                  <span className="text-[#a2f5bf]">
                    Heavy Wake Turbulence Mix:{' '}
                    <b className="font-mono text-[#ffd166]">{Math.round(heavyRatio * 100)}%</b>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(heavyRatio * 100)}
                    onChange={e => setHeavyRatio(Number(e.target.value) / 100)}
                    className="accent-[#ffd166]"
                  />
                </label>

                <div className="pt-2 border-t border-[#163826] flex items-center justify-between gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-[#a2f5bf]">
                    <input
                      type="checkbox"
                      checked={allowEmergencies}
                      onChange={e => setAllowEmergencies(e.target.checked)}
                      className="accent-[#ff4d4d] w-4 h-4"
                    />
                    <span>Inject Automatic Emergency (Squawk 7700)</span>
                  </label>

                  {allowEmergencies && (
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="text-[#85cca1]">AFTER</span>
                      <input
                        type="number"
                        min={15}
                        max={240}
                        value={emergencyDelaySec}
                        onChange={e => setEmergencyDelaySec(Math.max(15, Number(e.target.value)))}
                        className="w-16 bg-[#050d09] border border-[#1a422d] rounded px-2 py-1 text-white text-center"
                      />
                      <span className="text-[#85cca1]">SEC</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Weather & QNH Panel */}
              <div className="lg:col-span-6 bg-[#09160f] border border-[#163826] rounded p-4 flex flex-col gap-4">
                <div className="pb-2.5 border-b border-[#163826] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[#00e5ff] font-bold">
                    <Wind className="w-4 h-4" />
                    <span>Weather, Wind &amp; Altimeter QNH</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px]">
                    {[
                      { id: 'calm', label: 'Calm' },
                      { id: 'airport', label: 'Field Default' },
                      { id: 'crosswind', label: 'Crosswind' },
                      { id: 'storm', label: 'Storm' },
                    ].map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyWeatherPreset(p.id as 'calm' | 'airport' | 'crosswind' | 'storm')}
                        className="px-2 py-1 bg-[#0b1f16] hover:bg-[#143827] border border-[#1a452e] text-[#a2f5bf] rounded transition-colors"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[#a2f5bf]">
                      Wind Direction: <b className="font-mono text-white">{weather.windDirection.toString().padStart(3, '0')}°</b>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={359}
                      value={weather.windDirection}
                      onChange={e =>
                        setWeather(w => ({ ...w, windDirection: Number(e.target.value) }))
                      }
                      className="accent-[#00e5ff]"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[#a2f5bf]">
                      Wind Speed: <b className="font-mono text-white">{weather.windSpeed} kt</b>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={45}
                      value={weather.windSpeed}
                      onChange={e =>
                        setWeather(w => ({
                          ...w,
                          windSpeed: Number(e.target.value),
                          gusts: Math.max(w.gusts || 0, Number(e.target.value)),
                        }))
                      }
                      className="accent-[#00e5ff]"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[#a2f5bf]">
                      Wind Gusts: <b className="font-mono text-[#ffd166]">{weather.gusts || weather.windSpeed} kt</b>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={55}
                      value={weather.gusts || weather.windSpeed}
                      onChange={e => setWeather(w => ({ ...w, gusts: Number(e.target.value) }))}
                      className="accent-[#ffd166]"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[#a2f5bf]">
                      Altimeter QNH: <b className="font-mono text-white">{weather.qnh} hPa</b>
                    </span>
                    <input
                      type="range"
                      min={980}
                      max={1040}
                      value={weather.qnh}
                      onChange={e => setWeather(w => ({ ...w, qnh: Number(e.target.value) }))}
                      className="accent-[#00ff66]"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[#a2f5bf]">
                      Visibility: <b className="font-mono text-white">{weather.visibilityNM} NM</b>
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={weather.visibilityNM}
                      onChange={e =>
                        setWeather(w => ({ ...w, visibilityNM: Number(e.target.value) }))
                      }
                      className="accent-[#00e5ff]"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[#a2f5bf]">
                      Cloud Ceiling: <b className="font-mono text-white">{weather.ceilingFeet} ft</b>
                    </span>
                    <input
                      type="range"
                      min={500}
                      max={10000}
                      step={500}
                      value={weather.ceilingFeet}
                      onChange={e =>
                        setWeather(w => ({ ...w, ceilingFeet: Number(e.target.value) }))
                      }
                      className="accent-[#00e5ff]"
                    />
                  </label>
                </div>

                <div className="pt-2 border-t border-[#163826] flex items-center justify-between gap-3">
                  <span className="text-[#a2f5bf]">Precipitation / Weather Phenomenon:</span>
                  <select
                    value={weather.precipitation}
                    onChange={e =>
                      setWeather(w => ({
                        ...w,
                        precipitation: e.target.value as WeatherCondition['precipitation'],
                      }))
                    }
                    className="bg-[#050d09] border border-[#1a422d] rounded px-3 py-1.5 text-white font-mono outline-none"
                  >
                    {PRECIPITATION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: OFFLINE AUDIO, VHF RADIO & SIMULATION SPEED             */}
          {/* ============================================================== */}
          {activeTab === 'audio_sim' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Audio & VHF Radio Quality */}
              <div className="lg:col-span-7 bg-[#09160f] border border-[#163826] rounded p-4 flex flex-col gap-4">
                <div className="pb-2.5 border-b border-[#163826] flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#00ff66] font-bold">
                    <Radio className="w-4 h-4" />
                    <span>Offline Speech Engine, VHF Filter &amp; Controller Voice</span>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={!audioMuted}
                      onChange={e => setAudioMuted(!e.target.checked)}
                      className="accent-[#00ff66] w-4 h-4"
                    />
                    <span className={!audioMuted ? 'text-[#00ff66] font-bold' : 'text-[#ff6b6b]'}>
                      {!audioMuted ? 'Radio Audio Enabled' : 'Radio Audio Muted'}
                    </span>
                  </label>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[#a2f5bf]">
                    Master Radio Volume: <b className="font-mono text-white">{Math.round(audioVolume * 100)}%</b>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(audioVolume * 100)}
                    onChange={e => setAudioVolume(Number(e.target.value) / 100)}
                    className="accent-[#00ff66]"
                  />
                </label>

                <div className="flex flex-col gap-2">
                  <span className="font-semibold text-[#00e5ff]">VHF Aviation Radio Quality Preset:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {VHF_PRESET_KEYS.map(key => {
                      const def = VHF_RADIO_PRESETS[key];
                      const active = radioPreset === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setRadioPreset(key)}
                          className={`p-2.5 rounded border text-left transition-colors ${
                            active
                              ? 'bg-[#102e20] border-[#00ff66] text-white'
                              : 'bg-[#07120c] border-[#163826] text-[#85cca1] hover:border-[#246340]'
                          }`}
                        >
                          <div className="font-bold font-mono text-xs">{def.name}</div>
                          <div className="text-[10px] text-[#5da87d] mt-0.5 line-clamp-2">
                            {def.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#163826] flex flex-col gap-2">
                  <span className="font-semibold text-[#a2f5bf]">Primary Tower / Approach Controller Voice:</span>
                  <select
                    value={towerVoiceId}
                    onChange={e => setTowerVoiceId(e.target.value)}
                    className="bg-[#050d09] border border-[#1a422d] rounded px-3 py-2 text-white font-mono outline-none"
                  >
                    {TOWER_VOICE_PROFILES.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.shortLabel} ({v.label})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sim Speed & Readiness Summary */}
              <div className="lg:col-span-5 bg-[#09160f] border border-[#163826] rounded p-4 flex flex-col gap-4 h-fit">
                <div className="pb-2.5 border-b border-[#163826] flex items-center gap-2 text-[#ffd166] font-bold">
                  <Sliders className="w-4 h-4" />
                  <span>Simulation Speed &amp; Flight Readiness Summary</span>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[#a2f5bf]">Initial Radar Simulation Speed:</span>
                  <div className="grid grid-cols-3 gap-2 font-mono">
                    {[1, 2, 5].map(spd => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setSimSpeed(spd)}
                        className={`py-2.5 rounded border font-bold transition-colors ${
                          simSpeed === spd
                            ? 'bg-[#123823] border-[#00ff66] text-[#00ff66]'
                            : 'bg-[#07120c] border-[#163826] text-[#7ec29a] hover:text-white'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-[#163826] pt-3 flex flex-col gap-1.5 font-mono text-[11px] tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-[#5da87d]">SECTOR / RWYS</span>
                    <span className="text-white">{airportIcao} · {landingRwyId}/{departureRwyId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5da87d]">ACTIVE CHARTS</span>
                    <span className="text-[#00e5ff]">
                      {currentAirportVis.visibleStarIds.length} STAR · {currentAirportVis.visibleSidIds.length} SID · {currentAirportVis.visibleWaypoints.length} FIX
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5da87d]">TRAFFIC FLEET</span>
                    <span className="text-[#00ff66]">
                      {initialInbounds} ARR / {initialDepartures} DEP · MAX {maxTraffic}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5da87d]">METAR SURFACE</span>
                    <span className="text-[#ffd166]">
                      {weather.windDirection.toString().padStart(3, '0')}°/{weather.windSpeed}KT · QNH {weather.qnh}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5da87d]">VHF PROFILE</span>
                    <span className="text-white">
                      {audioMuted ? 'MUTED' : VHF_RADIO_PRESETS[radioPreset].shortName}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Launch Strip */}
        <div className="px-5 py-3.5 bg-[#09150f] border-t border-[#163826] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-[11px] font-mono text-[#7ec29a] tabular-nums">
            <span className="text-[#00ff66] font-bold">{airportIcao}</span>
            <span>·</span>
            <span>RWY {landingRwyId}/{departureRwyId}</span>
            <span>·</span>
            <span>{currentAirportVis.visibleStarIds.length} STAR / {currentAirportVis.visibleSidIds.length} SID / {currentAirportVis.visibleWaypoints.length} FIX</span>
            <span>·</span>
            <span>{weather.windDirection.toString().padStart(3, '0')}°/{weather.windSpeed}KT · QNH {weather.qnh}</span>
            <span>·</span>
            <span>{simSpeed}x</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleAirportPick(airportIcao)}
              className="px-3.5 py-2 bg-[#0c1d14] hover:bg-[#143021] border border-[#1b422d] text-[#a2f5bf] rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <button
              type="button"
              onClick={handleStartOperations}
              className="px-6 py-2 bg-[#00ff66] hover:bg-[#39ff14] text-black font-bold rounded text-xs flex items-center gap-2 transition-colors whitespace-nowrap shadow-[0_0_20px_rgba(0,255,102,0.25)]"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>Start Radar Operations ({airportIcao})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
