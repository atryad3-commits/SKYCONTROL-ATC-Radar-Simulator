/**
 * SKYCONTROL - Sector & Setup Workspace Page
 * Consolidates Pre-Flight Operations Briefing, Academy Missions, Multi-Airport Selection,
 * Per-Airport Individual STAR/SID/Fix Configuration, Global Radar Layers & Declutter Presets,
 * Traffic & Weather/QNH, Offline Audio/VHF quick setup, and Custom Scenario Studio.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  Compass,
  Edit2,
  Eye,
  EyeOff,
  Flame,
  Navigation,
  Palette,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Wind,
} from 'lucide-react';
import { RADAR_THEME_LIST } from '../utils/radarThemes';
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
import { deleteUserScenario, saveUserScenario } from '../services/persistenceService';

export type SectorSetupTab = 'airport' | 'routes' | 'traffic_weather' | 'studio';

interface SectorSetupPageProps {
  initialTab?: SectorSetupTab;
  canReturnToRadar: boolean;
  userProfile: UserProfileData | null;
  scenarios: CustomScenarioConfig[];
  onScenariosChanged: (next: CustomScenarioConfig[]) => void;
  onBeforeStartNewSession?: () => Promise<void> | void;
  onLaunchRadar: () => void;
  onOpenCertificate: () => void;
  onRequireAuth: () => void;
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

function buildDefaultScenarioDraft(ownerId: string): CustomScenarioConfig {
  return {
    id: `scn_${Date.now()}`,
    ownerId,
    name: 'Dense Arrival Sequence',
    description: 'Custom mixed-fleet scenario with moderate wind and steady inbound flow.',
    difficulty: 'Intermediate',
    airportIcao: 'EGLL',
    landingRunwayId: '27R',
    departureRunwayId: '27L',
    windDirection: 260,
    windSpeed: 15,
    gusts: 22,
    qnh: 1012,
    visibilityNM: 9,
    ceilingFeet: 4500,
    precipitation: 'None',
    initialInbounds: 4,
    initialDepartures: 2,
    spawnIntervalSec: 36,
    heavyRatio: 0.35,
    allowEmergencies: false,
    emergencyDelaySec: 45,
  };
}

export const SectorSetupPage: React.FC<SectorSetupPageProps> = ({
  initialTab = 'airport',
  canReturnToRadar,
  userProfile,
  scenarios,
  onScenariosChanged,
  onBeforeStartNewSession,
  onLaunchRadar,
  onOpenCertificate,
  onRequireAuth,
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
  const storeRadioPreset = useSimulationStore(state => state.radioPreset);
  const storeSimSpeed = useSimulationStore(state => state.simSpeed);
  const radarLayers = useSimulationStore(state => state.radarLayers);
  const radarTheme = useSimulationStore(state => state.radarTheme);
  const storePerAirportVisibility = useSimulationStore(state => state.perAirportVisibility);

  const toggleLayer = useSimulationStore(state => state.toggleLayer);
  const setAllRadarLayers = useSimulationStore(state => state.setAllRadarLayers);
  const applyRadarDeclutter = useSimulationStore(state => state.applyRadarDeclutter);
  const setRadarTheme = useSimulationStore(state => state.setRadarTheme);
  const applyPreFlightSession = useSimulationStore(state => state.applyPreFlightSession);
  const startMission = useSimulationStore(state => state.startMission);
  const startCustomScenario = useSimulationStore(state => state.startCustomScenario);

  const [activeTab, setActiveTab] = useState<SectorSetupTab>(initialTab);
  const [mode, setMode] = useState<'free' | 'mission' | 'custom'>('free');
  const [selectedMissionId, setSelectedMissionId] = useState<MissionId>('mission_1');
  const [selectedCustomId, setSelectedCustomId] = useState<string>(scenarios[0]?.id || '');

  // Airport catalog search & filter
  const [airportSearch, setAirportSearch] = useState<string>('');
  const [airportCategoryFilter, setAirportCategoryFilter] = useState<
    'ALL' | 'International' | 'Regional' | 'Training'
  >('ALL');

  // Sector & Runways Draft State
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
  const [radioPreset, setRadioPreset] = useState<Exclude<VhfQualityPresetId, 'custom'>>(
    () => storeRadioPreset || 'normal_aviation'
  );
  const [simSpeed, setSimSpeed] = useState<number>(storeSimSpeed || 1);

  // Per-airport route & waypoint visibility draft copy
  const [draftVisMap, setDraftVisMap] = useState<Record<string, AirportNavVisibility>>(() => ({
    ...storePerAirportVisibility,
  }));

  // Scenario Studio State
  const [draft, setDraft] = useState<CustomScenarioConfig>(() =>
    buildDefaultScenarioDraft(userProfile?.uid || '')
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [studioBusy, setStudioBusy] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
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
    setRadioPreset(storeRadioPreset || 'normal_aviation');
    setSimSpeed(storeSimSpeed || 1);
    setDraftVisMap({ ...storePerAirportVisibility });
  }, [
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
    storeRadioPreset,
    storeSimSpeed,
    storePerAirportVisibility,
  ]);

  const selectedProfile = useMemo(() => getAirportProfile(airportIcao), [airportIcao]);
  const draftProfile = useMemo(
    () => getAirportProfile(draft.airportIcao),
    [draft.airportIcao]
  );

  const airportCategoryCounts = useMemo(() => {
    const counts = { ALL: ALL_AIRPORT_PROFILES.length, International: 0, Regional: 0, Training: 0 };
    for (const prof of ALL_AIRPORT_PROFILES) {
      counts[prof.category] = (counts[prof.category] || 0) + 1;
    }
    return counts;
  }, []);

  const filteredAirports = useMemo(() => {
    const q = airportSearch.trim().toLowerCase();
    return ALL_AIRPORT_PROFILES.filter(prof => {
      if (airportCategoryFilter !== 'ALL' && prof.category !== airportCategoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        prof.airport.icao.toLowerCase().includes(q) ||
        prof.airport.iata.toLowerCase().includes(q) ||
        prof.airport.name.toLowerCase().includes(q) ||
        prof.airport.country.toLowerCase().includes(q) ||
        prof.runwayLayoutLabel.toLowerCase().includes(q)
      );
    });
  }, [airportSearch, airportCategoryFilter]);

  const currentAirportVis: AirportNavVisibility = useMemo(() => {
    return draftVisMap[airportIcao] || computeDefaultAirportVisibility(selectedProfile.airport);
  }, [draftVisMap, airportIcao, selectedProfile.airport]);

  const reciprocalConflict = useMemo(() => {
    return selectedProfile.reciprocalPairs.some(
      ([a, b]) =>
        (landingRwyId === a && departureRwyId === b) ||
        (landingRwyId === b && departureRwyId === a)
    );
  }, [selectedProfile.reciprocalPairs, landingRwyId, departureRwyId]);

  const completedSet = new Set(userProfile?.completedMissions || []);

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
    const customScn =
      mode === 'custom' ? scenarios.find(s => s.id === selectedCustomId) : undefined;
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

    void onBeforeStartNewSession?.();
    applyPreFlightSession(config, customScn);
    onLaunchRadar();
  };

  const handleLaunchMissionDirect = (missionId: MissionId) => {
    void onBeforeStartNewSession?.();
    startMission(missionId);
    onLaunchRadar();
  };

  const handleDraftAirportChange = (icao: string) => {
    const prof = getAirportProfile(icao);
    setDraft(prev => ({
      ...prev,
      airportIcao: icao,
      landingRunwayId: prof.airport.defaultArrivalRunway,
      departureRunwayId: prof.airport.defaultDepartureRunway,
      windDirection: prof.defaultWeather.windDirection,
      windSpeed: prof.defaultWeather.windSpeed,
      gusts: prof.defaultWeather.gusts || prof.defaultWeather.windSpeed + 5,
      qnh: prof.defaultWeather.qnh,
    }));
  };

  const handleSaveDraft = async (andRun: boolean) => {
    if (!userProfile) {
      onRequireAuth();
      return;
    }
    setStudioBusy(true);
    setStudioError(null);
    try {
      const isEdit = Boolean(editingId);
      const saved = await saveUserScenario(
        userProfile,
        {
          ...draft,
          id: editingId || `scn_${Date.now()}`,
          ownerId: userProfile.uid,
        },
        isEdit
      );
      const nextList = isEdit
        ? scenarios.map(s => (s.id === saved.id ? saved : s))
        : [saved, ...scenarios];
      onScenariosChanged(nextList);
      setEditingId(saved.id);
      setDraft(saved);

      if (andRun) {
        void onBeforeStartNewSession?.();
        startCustomScenario(saved);
        onLaunchRadar();
      }
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : 'Failed to save scenario');
    } finally {
      setStudioBusy(false);
    }
  };

  const handleDeleteScenario = async (scenarioId: string) => {
    if (!userProfile) return;
    setStudioBusy(true);
    setStudioError(null);
    try {
      await deleteUserScenario(userProfile, scenarioId);
      onScenariosChanged(scenarios.filter(s => s.id !== scenarioId));
      if (editingId === scenarioId) {
        setEditingId(null);
        setDraft(buildDefaultScenarioDraft(userProfile.uid));
      }
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : 'Failed to delete scenario');
    } finally {
      setStudioBusy(false);
    }
  };

  const stars = selectedProfile.airport.approachRoutes || [];
  const sids = selectedProfile.airport.departureRoutes || [];
  const waypoints = selectedProfile.airport.waypoints;

  const globalLayers: Array<{ key: keyof RadarLayers; label: string; desc: string }> = [
    { key: 'terrain', label: 'Terrain & Contours', desc: 'Topographical relief, water & sector peaks' },
    { key: 'rangeRings', label: 'Range Rings & Compass', desc: 'Concentric 1–160 NM rings & 360° dial' },
    { key: 'runways', label: 'Runway Surfaces', desc: 'Physical runway geometry & designators' },
    { key: 'extendedCenterlines', label: 'ILS Feathers & Centerlines', desc: 'Localizer approach courses & 5 NM ticks' },
    { key: 'tmaBoundary', label: 'TMA Sector Boundary', desc: 'Airspace polygon perimeter & TA floor' },
    { key: 'starCorridors', label: 'STAR Approach Corridors', desc: 'Published inbound arrival paths' },
    { key: 'sidCorridors', label: 'SID Departure Corridors', desc: 'Standard instrument departure exits' },
    { key: 'procedureRestrictions', label: 'Corridor Limits & NM', desc: 'Heading, leg NM, altitude & speed limits' },
    { key: 'holdingStacks', label: 'Holding Racetracks', desc: 'Terminal fix orbital hold patterns' },
    { key: 'waypointLabels', label: 'Navigation Fixes', desc: 'IAF, FAF, EXIT & HOLD waypoint labels' },
    { key: 'extendedTargetTags', label: 'Enriched Target Tags', desc: 'Track, VS trend, wake & runway distance' },
    { key: 'trails', label: 'History Trails', desc: 'Phosphor position breadcrumb points' },
    { key: 'speedVectors', label: 'Velocity Vectors', desc: '60-second projected ground track lines' },
    { key: 'radarSweep', label: 'Radar Antenna Sweep', desc: '15 RPM phosphor sweep beam' },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#060f0a] text-[#d1e7dd] text-xs select-none overflow-hidden">
      {/* Sub-Navigation Bar */}
      <div className="px-5 bg-[#08140e] border-b border-[#163826] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-6 overflow-x-auto">
          {(
            [
              { id: 'airport', label: 'Airport & Mode', icon: Compass },
              {
                id: 'routes',
                label: `Routes & Layers · ${airportIcao}`,
                icon: Navigation,
              },
              { id: 'traffic_weather', label: 'Traffic, Weather & Radio', icon: Wind },
              {
                id: 'studio',
                label: `Scenario Studio (${scenarios.length})`,
                icon: Flame,
              },
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
                    ? 'border-[#00ff66] text-[#00ff66] font-semibold'
                    : 'border-transparent text-[#6ba885] hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="hidden lg:flex items-center gap-2.5 text-[11px] font-mono text-[#7ec29a] tabular-nums py-2">
          <span>{userProfile?.callsign || 'CONTROLLER'}</span>
          <span className="text-[#2c5e41]">·</span>
          <span className="text-[#00e5ff]">{airportIcao}</span>
          <span className="text-[#2c5e41]">·</span>
          <span>RWY {landingRwyId}/{departureRwyId}</span>
        </div>
      </div>

      {/* Main Scrollable Content Workspace */}
      <div className="flex-1 overflow-y-auto p-5 max-w-7xl w-full mx-auto">
        {/* ============================================================== */}
        {/* TAB 1: AIRPORT, RUNWAYS, ACADEMY & OPERATION MODE              */}
        {/* ============================================================== */}
        {activeTab === 'airport' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#163826]">
                <span className="font-bold text-white text-sm">Operation Mode</span>
                <div className="flex items-center gap-5 text-xs">
                  {[
                    { id: 'free', label: 'Free Operations' },
                    { id: 'mission', label: `Flight Academy (${completedSet.size}/5)` },
                    { id: 'custom', label: `Saved Scenarios (${scenarios.length})` },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMode(opt.id as 'free' | 'mission' | 'custom')}
                      className={`pb-1 border-b-2 transition-colors whitespace-nowrap ${
                        mode === opt.id
                          ? 'border-[#00e5ff] text-[#00e5ff] font-semibold'
                          : 'border-transparent text-[#6ba885] hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'mission' ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-[11px] text-[#7ec29a]">
                    <span>Complete all 5 missions to earn your serialized ATC Approach Certificate.</span>
                    {userProfile?.certified && (
                      <button
                        type="button"
                        onClick={onOpenCertificate}
                        className="text-[#ffd166] hover:underline font-semibold flex items-center gap-1"
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>View Certificate</span>
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-[#143020] border border-[#163826] rounded bg-[#08130d]">
                    {ACADEMY_MISSIONS.map(msn => {
                      const active = selectedMissionId === msn.id;
                      const isDone = completedSet.has(msn.id);
                      return (
                        <div
                          key={msn.id}
                          onClick={() => handleSelectMission(msn.id)}
                          className={`p-3.5 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-l-2 ${
                            active
                              ? 'bg-[#0d2618] border-l-[#00ff66]'
                              : 'border-l-transparent hover:bg-[#0b1b13]'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-white">
                                {msn.number}. {msn.title}
                              </span>
                              <span className="font-mono text-[#00e5ff]">
                                {msn.airportIcao} · RWY {msn.landingRunwayId}/{msn.departureRunwayId}
                              </span>
                              {isDone && (
                                <span className="text-[#00ff66] flex items-center gap-1 text-[11px] font-semibold">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Passed</span>
                                </span>
                              )}
                            </div>
                            <p className="text-[#85cca1]">{msn.description}</p>
                            <div className="text-[11px] text-[#5c9474] font-mono tabular-nums">
                              LND ≥ {msn.targetLandings}
                              {msn.targetDepartures > 0 ? ` · DEP ≥ ${msn.targetDepartures}` : ''} · WIND{' '}
                              {msn.weather.windDirection}°/{msn.weather.windSpeed}kt · MIN {msn.minScore}%
                              {msn.requireEmergencyHandled ? ' · SQUAWK 7700' : ''}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              handleLaunchMissionDirect(msn.id);
                            }}
                            className="px-3.5 py-1.5 bg-[#123823] hover:bg-[#00ff66] text-[#00ff66] hover:text-black border border-[#246340] rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                          >
                            <Play className="w-3 h-3" />
                            <span>{isDone ? 'Replay' : 'Launch'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : mode === 'custom' && scenarios.length > 0 ? (
                <div className="divide-y divide-[#143020] border border-[#163826] rounded bg-[#08130d]">
                  {scenarios.map(scn => {
                    const active = selectedCustomId === scn.id;
                    return (
                      <button
                        key={scn.id}
                        type="button"
                        onClick={() => handleSelectCustomScenario(scn.id)}
                        className={`w-full text-left p-3.5 transition-colors flex flex-col gap-1 border-l-2 ${
                          active
                            ? 'bg-[#0d2618] border-l-[#00ff66]'
                            : 'border-l-transparent hover:bg-[#0b1b13]'
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
                <div className="flex flex-col gap-3">
                  {mode === 'custom' && scenarios.length === 0 && (
                    <div className="p-3 bg-[#08130d] border border-[#163826] rounded text-[#ffd166]">
                      No saved scenarios yet. Create one in Scenario Studio or pick an airport below:
                    </div>
                  )}

                  {/* Search & Category Filter Toolbar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-[#08130d] border border-[#163826] rounded px-3 py-2">
                    <div className="relative flex-1 min-w-0">
                      <Search className="w-3.5 h-3.5 text-[#5da87d] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={airportSearch}
                        onChange={e => setAirportSearch(e.target.value)}
                        placeholder="Search ICAO, airport, country, or runway layout..."
                        className="w-full bg-[#050d09] border border-[#163826] focus:border-[#00ff66] rounded pl-8 pr-3 py-1 text-white placeholder-[#4b8563] outline-none font-mono text-[11px]"
                      />
                    </div>

                    <div className="flex items-center gap-3 text-[11px] shrink-0 overflow-x-auto">
                      {(
                        [
                          { id: 'ALL', label: `All (${airportCategoryCounts.ALL})` },
                          { id: 'International', label: `Intl (${airportCategoryCounts.International})` },
                          { id: 'Regional', label: `Regional (${airportCategoryCounts.Regional})` },
                          { id: 'Training', label: `Training (${airportCategoryCounts.Training})` },
                        ] as const
                      ).map(tab => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setAirportCategoryFilter(tab.id)}
                          className={`pb-0.5 border-b-2 transition-colors whitespace-nowrap ${
                            airportCategoryFilter === tab.id
                              ? 'border-[#00ff66] text-[#00ff66] font-semibold'
                              : 'border-transparent text-[#6ba885] hover:text-white'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scrollable Airport Catalog */}
                  <div className="divide-y divide-[#143020] border border-[#163826] rounded bg-[#08130d] max-h-[540px] overflow-y-auto">
                    {filteredAirports.length === 0 ? (
                      <div className="p-6 text-center text-[#6ba885]">
                        No airports match "{airportSearch}".
                      </div>
                    ) : (
                      filteredAirports.map(prof => {
                        const isSel = prof.airport.icao === airportIcao;
                        const starCount = prof.airport.approachRoutes?.length || 0;
                        const sidCount = prof.airport.departureRoutes?.length || 0;
                        const fixCount = prof.airport.waypoints.length;
                        const stripCount = prof.reciprocalPairs.length;
                        return (
                          <button
                            key={prof.airport.icao}
                            type="button"
                            onClick={() => handleAirportPick(prof.airport.icao)}
                            className={`w-full text-left p-3.5 transition-colors flex flex-col gap-1 border-l-2 ${
                              isSel
                                ? 'bg-[#0d2618] border-l-[#00ff66]'
                                : 'border-l-transparent hover:bg-[#0b1b13]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 w-full">
                              <div className="flex items-center gap-2 font-mono min-w-0">
                                <span className="text-sm font-bold text-[#00ff66] shrink-0">
                                  {prof.airport.icao}
                                </span>
                                <span className="text-white font-semibold truncate">
                                  {prof.airport.name}
                                </span>
                                <span className="text-[11px] text-[#5da87d] hidden sm:inline shrink-0">
                                  · {prof.airport.country}
                                </span>
                              </div>
                              <span className="text-[11px] text-[#a2f5bf] shrink-0">
                                {prof.category} · {prof.difficultyLabel}
                              </span>
                            </div>
                            <p className="text-[#85cca1] leading-relaxed">{prof.summary}</p>
                            <div className="text-[11px] text-[#5da87d] font-mono tabular-nums">
                              {prof.runwayLayoutLabel} · {stripCount} {stripCount === 1 ? 'Strip' : 'Strips'} /{' '}
                              {prof.airport.runways.length} Ends · ELEV {prof.airport.elevationFeet}ft ·{' '}
                              {starCount} STAR / {sidCount} SID / {fixCount} FIX
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Active Runway Assignment & Sector Summary */}
            <div className="lg:col-span-5 bg-[#08130d] border border-[#163826] rounded p-4 flex flex-col gap-4 h-fit">
              <div className="pb-3 border-b border-[#163826]">
                <div className="text-[11px] text-[#5da87d]">Active Runway Assignment</div>
                <div className="text-base font-bold text-white font-mono mt-0.5">
                  {selectedProfile.airport.icao} · {selectedProfile.airport.name}
                </div>
                <div className="text-[11px] text-[#7ec29a] font-mono mt-1 tabular-nums">
                  ELEV {selectedProfile.airport.elevationFeet}ft · TA{' '}
                  {selectedProfile.airport.sector.transitionAltitude}ft · VHF{' '}
                  {selectedProfile.vhfFrequency}
                </div>
              </div>

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
                            : 'bg-[#060f0a] border-[#163826] text-[#85cca1] hover:border-[#2a6b46]'
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
                            : 'bg-[#060f0a] border-[#163826] text-[#85cca1] hover:border-[#24667d]'
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
                  Caution: Selected arrival and departure runways are reciprocal ends of the same surface.
                </div>
              )}

              <div className="border-t border-[#163826] pt-3 flex items-center justify-between gap-2">
                <span className="text-[#85cca1]">Sync STAR/SID visibility to selected runways:</span>
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
        {/* TAB 2: PER-AIRPORT ROUTES & GLOBAL RADAR DISPLAY LAYERS        */}
        {/* ============================================================== */}
        {activeTab === 'routes' && (
          <div className="flex flex-col gap-6">
            {/* Per-Airport Procedures Header */}
            <div className="pb-3 border-b border-[#163826] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {airportIcao} Approach Corridors (STAR), Exit Routes (SID) &amp; Fixes
                </h3>
                <p className="text-[#85cca1] mt-0.5">
                  Each procedure corridor and fix toggles independently for{' '}
                  <span className="font-mono text-[#00e5ff]">{airportIcao}</span>.
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

            {/* 3-Column Independent Switches */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* STARs */}
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
                          {star.initialAltitudeFt ? `${star.initialAltitudeFt}ft` : ''} →{' '}
                          {star.finalAltitudeFt ? `${star.finalAltitudeFt}ft` : ''} · MAX{' '}
                          {star.maxSpeedKt || 220}KT
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

              {/* SIDs */}
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
                          CLIMB MIN {sid.finalAltitudeFt ? `${sid.finalAltitudeFt}ft` : 'FL090'} · MAX{' '}
                          {sid.maxSpeedKt || 250}KT
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

              {/* Fixes */}
              <div className="flex flex-col gap-2">
                <div className="pb-2 border-b border-[#163826] flex items-center justify-between">
                  <span className="font-bold text-[#00ff66]">Navigation Fixes</span>
                  <span className="font-mono text-[11px] text-[#7ec29a]">
                    {currentAirportVis.visibleWaypoints.length} / {waypoints.length}
                  </span>
                </div>

                <div className="max-h-80 overflow-y-auto flex flex-col gap-1.5 pr-1">
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
                            <span className="text-[10px] text-[#00e5ff]">{roleLabel}</span>
                            {wp.altitudeConstraint && (
                              <span className="text-[10px] text-[#85cca1]">
                                · {wp.altitudeConstraint}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#5da87d] truncate">{wp.description}</div>
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

            {/* Radar Scope Visual Theme Selection */}
            <div className="pt-4 border-t border-[#163826] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <Palette className="w-4 h-4 text-[#00e5ff]" />
                    <span>Radar Scope Color & Visual Theme</span>
                  </h4>
                  <p className="text-[11px] text-[#7ec29a]">
                    Select a pre-designed scope palette for radar tracks, rings, sweep, and contrast. Saved per controller account.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {RADAR_THEME_LIST.map(preset => {
                  const selected = radarTheme === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setRadarTheme(preset.id)}
                      className={`p-3 rounded-md border text-left transition-colors flex items-center justify-between gap-3 ${
                        selected
                          ? 'bg-[#0b271c] border-[#00e5ff] text-white'
                          : 'bg-[#07100b] border-[#163826] text-[#9de3ba] hover:border-[#246340]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="relative w-9 h-9 rounded-full border shrink-0 flex items-center justify-center overflow-hidden"
                          style={{
                            backgroundColor: preset.swatch.bg,
                            borderColor: preset.swatch.ring,
                          }}
                        >
                          <span
                            className="w-5 h-5 rounded-full border flex items-center justify-center"
                            style={{ borderColor: preset.swatch.ring }}
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: preset.swatch.primary }}
                            />
                          </span>
                          <span
                            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                            style={{ backgroundColor: preset.swatch.secondary }}
                          />
                        </span>
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-white truncate">
                            {preset.name}
                          </div>
                          <div className="text-[10px] text-[#7ec29a] truncate">
                            {preset.subtitle}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                          selected
                            ? 'bg-[#00e5ff] border-[#00e5ff] text-black'
                            : 'border-[#2d5c3f] bg-[#060f0a]'
                        }`}
                      >
                        {selected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Global Radar Scope Layers & Declutter Presets */}
            <div className="pt-4 border-t border-[#163826] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-white text-sm">
                    Global Radar Scope Display Layers (
                    {Object.values(radarLayers).filter(Boolean).length}/{globalLayers.length})
                  </h4>
                  <p className="text-[11px] text-[#7ec29a]">
                    Apply declutter presets or toggle terrain, range rings, vectors, and trails.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => applyRadarDeclutter('full')}
                    className="px-2.5 py-1 bg-[#123321] hover:bg-[#19472e] border border-[#246340] text-[#00ff66] rounded font-semibold flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Full Chart</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyRadarDeclutter('tactical')}
                    className="px-2.5 py-1 bg-[#0e2d3b] hover:bg-[#154256] border border-[#1f627d] text-[#00e5ff] rounded font-semibold"
                  >
                    Tactical Vector
                  </button>
                  <button
                    type="button"
                    onClick={() => applyRadarDeclutter('minimal')}
                    className="px-2.5 py-1 bg-[#241c0d] hover:bg-[#362912] border border-[#523f1b] text-[#ffd166] rounded font-semibold"
                  >
                    Minimal Scope
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllRadarLayers(false)}
                    className="px-2.5 py-1 bg-[#241314] hover:bg-[#361b1d] border border-[#522427] text-[#ff858d] rounded font-semibold flex items-center gap-1"
                  >
                    <EyeOff className="w-3 h-3" />
                    <span>Hide All</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {globalLayers.map(item => {
                  const active = radarLayers[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleLayer(item.key)}
                      className={`p-2.5 rounded border text-left flex items-center justify-between gap-2 transition-colors ${
                        active
                          ? 'bg-[#0b1f16] border-[#1d5236] text-white'
                          : 'bg-[#07100b] border-[#12261b] text-[#6ba885]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{item.label}</div>
                        <div className="text-[10px] text-[#5c9474] truncate">{item.desc}</div>
                      </div>
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
        {/* TAB 3: TRAFFIC, WEATHER / QNH, OFFLINE AUDIO & SIM SPEED       */}
        {/* ============================================================== */}
        {activeTab === 'traffic_weather' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Traffic & Sim Speed */}
            <div className="lg:col-span-6 bg-[#08130d] border border-[#163826] rounded p-4 flex flex-col gap-4">
              <div className="pb-2.5 border-b border-[#163826] flex items-center justify-between">
                <span className="text-[#00ff66] font-bold text-sm">
                  Traffic Flow &amp; Simulation Rate
                </span>
                <div className="flex items-center gap-1 font-mono">
                  {[1, 2, 5].map(spd => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setSimSpeed(spd)}
                      className={`px-2.5 py-1 rounded border font-bold transition-colors ${
                        simSpeed === spd
                          ? 'bg-[#123823] border-[#00ff66] text-[#00ff66]'
                          : 'bg-[#060f0a] border-[#163826] text-[#7ec29a]'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
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
                    Spawn Interval: <b className="font-mono text-white">{spawnIntervalSec}s</b>
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

              <div className="pt-2 border-t border-[#163826] flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-[#a2f5bf]">
                  <input
                    type="checkbox"
                    checked={allowEmergencies}
                    onChange={e => setAllowEmergencies(e.target.checked)}
                    className="accent-[#ff4d4d] w-4 h-4"
                  />
                  <span>Automatic Squawk 7700 Emergency</span>
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

              {/* Quick Offline Audio & VHF Quality Presets */}
              <div className="pt-3 border-t border-[#163826] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#00e5ff] flex items-center gap-1.5">
                    <Radio className="w-4 h-4" />
                    <span>Offline VHF Radio &amp; Controller Voice</span>
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!audioMuted}
                      onChange={e => setAudioMuted(!e.target.checked)}
                      className="accent-[#00ff66] w-4 h-4"
                    />
                    <span className={!audioMuted ? 'text-[#00ff66] font-semibold' : 'text-[#ff6b6b]'}>
                      {!audioMuted ? 'Enabled' : 'Muted'}
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[#a2f5bf]">
                      Radio Volume: <b className="font-mono text-white">{Math.round(audioVolume * 100)}%</b>
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

                  <label className="flex flex-col gap-1">
                    <span className="text-[#a2f5bf]">Tower / Approach Voice</span>
                    <select
                      value={towerVoiceId}
                      onChange={e => setTowerVoiceId(e.target.value)}
                      className="bg-[#050d09] border border-[#1a422d] rounded px-2.5 py-1.5 text-white font-mono outline-none"
                    >
                      {TOWER_VOICE_PROFILES.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.shortLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {VHF_PRESET_KEYS.map(key => {
                    const def = VHF_RADIO_PRESETS[key];
                    const active = radioPreset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setRadioPreset(key)}
                        className={`px-2 py-1.5 rounded border text-left font-mono text-[11px] transition-colors ${
                          active
                            ? 'bg-[#102e20] border-[#00ff66] text-white font-bold'
                            : 'bg-[#060f0a] border-[#163826] text-[#85cca1] hover:border-[#246340]'
                        }`}
                      >
                        {def.shortName}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Weather & QNH Panel */}
            <div className="lg:col-span-6 bg-[#08130d] border border-[#163826] rounded p-4 flex flex-col gap-4 h-fit">
              <div className="pb-2.5 border-b border-[#163826] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[#00e5ff] font-bold text-sm">
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
                    Wind Direction:{' '}
                    <b className="font-mono text-white">
                      {weather.windDirection.toString().padStart(3, '0')}°
                    </b>
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
                    Wind Gusts:{' '}
                    <b className="font-mono text-[#ffd166]">{weather.gusts || weather.windSpeed} kt</b>
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
                <span className="text-[#a2f5bf]">Precipitation / Phenomenon:</span>
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
        {/* TAB 4: CUSTOM SCENARIO STUDIO                                  */}
        {/* ============================================================== */}
        {activeTab === 'studio' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Saved Scenarios */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#163826]">
                <h3 className="text-sm font-bold text-white">Saved Scenarios</h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setDraft(buildDefaultScenarioDraft(userProfile?.uid || ''));
                    setStudioError(null);
                  }}
                  className="px-2.5 py-1.5 bg-[#123321] hover:bg-[#19472f] text-[#00ff66] border border-[#246340] rounded font-semibold flex items-center gap-1 transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Scenario</span>
                </button>
              </div>

              {scenarios.length === 0 ? (
                <div className="p-6 bg-[#08130d] border border-[#163826] rounded text-center text-[#70b88d] leading-relaxed">
                  No custom scenarios saved yet. Configure parameters on the right and click Save.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {scenarios.map(sc => (
                    <div
                      key={sc.id}
                      className={`p-3 rounded border transition-colors flex flex-col gap-2 ${
                        editingId === sc.id
                          ? 'bg-[#0f291b] border-[#00ff66]'
                          : 'bg-[#08130d] border-[#163826]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-white text-sm">{sc.name}</div>
                          <div className="text-[11px] text-[#70b88d] font-mono tabular-nums mt-0.5">
                            {sc.airportIcao} · RWY {sc.landingRunwayId}/{sc.departureRunwayId} ·{' '}
                            {sc.windDirection}°/{sc.windSpeed}kt{sc.allowEmergencies ? ' · 7700' : ''}
                          </div>
                        </div>
                        <span className="text-[10px] text-[#a2f5bf] font-mono">{sc.difficulty}</span>
                      </div>

                      {sc.description && <p className="text-[11px] text-[#85cca1]">{sc.description}</p>}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            void onBeforeStartNewSession?.();
                            startCustomScenario(sc);
                            onLaunchRadar();
                          }}
                          className="px-3 py-1 bg-[#143d27] hover:bg-[#00ff66] text-[#00ff66] hover:text-black rounded font-semibold flex items-center gap-1 transition-colors whitespace-nowrap"
                        >
                          <Play className="w-3 h-3" />
                          <span>Launch</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(sc.id);
                            setDraft(sc);
                          }}
                          className="px-2.5 py-1 bg-[#0d2217] hover:bg-[#163826] text-[#a2f5bf] border border-[#1d4d33] rounded flex items-center gap-1 transition-colors whitespace-nowrap"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteScenario(sc.id)}
                          disabled={studioBusy}
                          className="px-2.5 py-1 bg-[#2a1214] hover:bg-[#3d191c] text-[#ff6b6b] border border-[#5e2226] rounded flex items-center gap-1 transition-colors whitespace-nowrap"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Scenario Builder Form */}
            <div className="lg:col-span-7 bg-[#08130d] border border-[#163826] rounded p-4 flex flex-col gap-3.5 h-fit">
              <div className="flex items-center justify-between pb-2 border-b border-[#163826]">
                <h3 className="text-sm font-bold text-white">
                  {editingId ? 'Edit Scenario' : 'Create Custom Scenario'}
                </h3>
                <span className="text-[11px] text-[#5da87d]">
                  {userProfile?.authProvider === 'offline'
                    ? 'Offline Local Storage'
                    : 'Cloud Firestore Storage'}
                </span>
              </div>

              {studioError && (
                <div className="p-2.5 bg-[#361114] border border-[#ff3344]/60 rounded text-[#ffb3b8] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#ff4d4d] shrink-0" />
                  <span>{studioError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#a2f5bf] font-semibold mb-1">Scenario Name</label>
                  <input
                    type="text"
                    maxLength={80}
                    value={draft.name}
                    onChange={e => setDraft({ ...draft, name: e.target.value })}
                    className="w-full bg-[#050d09] border border-[#1a422d] focus:border-[#00ff66] rounded px-3 py-1.5 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#a2f5bf] font-semibold mb-1">Difficulty Tier</label>
                  <select
                    value={draft.difficulty}
                    onChange={e =>
                      setDraft({
                        ...draft,
                        difficulty: e.target.value as CustomScenarioConfig['difficulty'],
                      })
                    }
                    className="w-full bg-[#050d09] border border-[#1a422d] rounded px-3 py-1.5 text-white outline-none"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Master">Master</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#a2f5bf] font-semibold mb-1">Briefing Notes</label>
                <input
                  type="text"
                  maxLength={300}
                  value={draft.description}
                  onChange={e => setDraft({ ...draft, description: e.target.value })}
                  className="w-full bg-[#050d09] border border-[#1a422d] focus:border-[#00ff66] rounded px-3 py-1.5 text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#00ff66] font-semibold mb-1">Airport</label>
                  <select
                    value={draft.airportIcao}
                    onChange={e => handleDraftAirportChange(e.target.value)}
                    className="w-full bg-[#050d09] border border-[#1a422d] rounded px-2.5 py-1.5 text-white font-mono outline-none"
                  >
                    {ALL_AIRPORT_PROFILES.map(p => (
                      <option key={p.airport.icao} value={p.airport.icao}>
                        {p.airport.icao} – {p.airport.name} ({p.airport.country})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#00ff66] font-semibold mb-1">Landing RWY</label>
                  <select
                    value={draft.landingRunwayId}
                    onChange={e => setDraft({ ...draft, landingRunwayId: e.target.value })}
                    className="w-full bg-[#050d09] border border-[#1a422d] rounded px-2.5 py-1.5 text-white font-mono outline-none"
                  >
                    {draftProfile.airport.runways.map(r => (
                      <option key={r.id} value={r.id}>
                        RWY {r.id} ({r.heading}°)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#00e5ff] font-semibold mb-1">Departure RWY</label>
                  <select
                    value={draft.departureRunwayId}
                    onChange={e => setDraft({ ...draft, departureRunwayId: e.target.value })}
                    className="w-full bg-[#050d09] border border-[#1a422d] rounded px-2.5 py-1.5 text-white font-mono outline-none"
                  >
                    {draftProfile.airport.runways.map(r => (
                      <option key={r.id} value={r.id}>
                        RWY {r.id} ({r.heading}°)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-[#163826] tabular-nums">
                <div>
                  <label className="flex justify-between text-[11px] text-[#a2f5bf] mb-1">
                    <span>Wind Dir</span>
                    <span className="font-mono text-white">
                      {draft.windDirection.toString().padStart(3, '0')}°
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={draft.windDirection}
                    onChange={e => setDraft({ ...draft, windDirection: Number(e.target.value) })}
                    className="w-full accent-[#00ff66]"
                  />
                </div>

                <div>
                  <label className="flex justify-between text-[11px] text-[#a2f5bf] mb-1">
                    <span>Wind Speed</span>
                    <span className="font-mono text-white">{draft.windSpeed} kt</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={draft.windSpeed}
                    onChange={e => {
                      const spd = Number(e.target.value);
                      setDraft({ ...draft, windSpeed: spd, gusts: Math.max(spd, draft.gusts) });
                    }}
                    className="w-full accent-[#00ff66]"
                  />
                </div>

                <div>
                  <label className="flex justify-between text-[11px] text-[#a2f5bf] mb-1">
                    <span>QNH</span>
                    <span className="font-mono text-white">{draft.qnh} hPa</span>
                  </label>
                  <input
                    type="range"
                    min={965}
                    max={1040}
                    value={draft.qnh}
                    onChange={e => setDraft({ ...draft, qnh: Number(e.target.value) })}
                    className="w-full accent-[#00e5ff]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-[#163826] tabular-nums">
                <div>
                  <label className="flex justify-between text-[11px] text-[#a2f5bf] mb-1">
                    <span>Arrivals</span>
                    <span className="font-mono text-white">{draft.initialInbounds}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={draft.initialInbounds}
                    onChange={e => setDraft({ ...draft, initialInbounds: Number(e.target.value) })}
                    className="w-full accent-[#00ff66]"
                  />
                </div>

                <div>
                  <label className="flex justify-between text-[11px] text-[#a2f5bf] mb-1">
                    <span>Departures</span>
                    <span className="font-mono text-white">{draft.initialDepartures}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    value={draft.initialDepartures}
                    onChange={e => setDraft({ ...draft, initialDepartures: Number(e.target.value) })}
                    className="w-full accent-[#00e5ff]"
                  />
                </div>

                <div>
                  <label className="flex justify-between text-[11px] text-[#a2f5bf] mb-1">
                    <span>Interval</span>
                    <span className="font-mono text-white">{draft.spawnIntervalSec}s</span>
                  </label>
                  <input
                    type="range"
                    min={15}
                    max={120}
                    step={5}
                    value={draft.spawnIntervalSec}
                    onChange={e => setDraft({ ...draft, spawnIntervalSec: Number(e.target.value) })}
                    className="w-full accent-[#00ff66]"
                  />
                </div>

                <div>
                  <label className="flex justify-between text-[11px] text-[#a2f5bf] mb-1">
                    <span>Heavy Mix</span>
                    <span className="font-mono text-white">{Math.round(draft.heavyRatio * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={draft.heavyRatio}
                    onChange={e => setDraft({ ...draft, heavyRatio: Number(e.target.value) })}
                    className="w-full accent-[#ffd166]"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#0c1a12] border border-[#163826] rounded flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.allowEmergencies}
                    onChange={e => setDraft({ ...draft, allowEmergencies: e.target.checked })}
                    className="w-4 h-4 accent-[#ff4d4d]"
                  />
                  <span className="font-semibold text-white">Inject Squawk 7700 Emergency</span>
                </label>

                {draft.allowEmergencies && (
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="text-[11px] text-[#ffb3b8]">Delay:</span>
                    <input
                      type="range"
                      min={10}
                      max={180}
                      step={5}
                      value={draft.emergencyDelaySec}
                      onChange={e => setDraft({ ...draft, emergencyDelaySec: Number(e.target.value) })}
                      className="w-28 accent-[#ff4d4d]"
                    />
                    <span className="font-mono text-[#ff6b6b] font-bold">{draft.emergencyDelaySec}s</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => handleSaveDraft(false)}
                  disabled={studioBusy}
                  className="px-4 py-2 bg-[#123321] hover:bg-[#19472f] text-[#00ff66] border border-[#246340] rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Scenario</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveDraft(true)}
                  disabled={studioBusy}
                  className="px-4 py-2 bg-[#00ff66] hover:bg-[#39ff14] text-black font-bold rounded flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Save &amp; Launch</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Launch Bar */}
      <footer className="px-5 py-3 bg-[#08150f] border-t border-[#163826] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 text-[11px] font-mono text-[#7ec29a] tabular-nums">
          <span className="text-[#00ff66] font-bold">{airportIcao}</span>
          <span>·</span>
          <span>RWY {landingRwyId}/{departureRwyId}</span>
          <span>·</span>
          <span>
            {currentAirportVis.visibleStarIds.length} STAR / {currentAirportVis.visibleSidIds.length} SID /{' '}
            {currentAirportVis.visibleWaypoints.length} FIX
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">
            {weather.windDirection.toString().padStart(3, '0')}°/{weather.windSpeed}KT · QNH {weather.qnh}
          </span>
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

          {canReturnToRadar && (
            <button
              type="button"
              onClick={onLaunchRadar}
              className="px-3.5 py-2 bg-[#0a1b12] hover:bg-[#122e1f] border border-[#1a402b] text-[#d1e7dd] rounded text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Return to Scope
            </button>
          )}

          <button
            type="button"
            onClick={handleStartOperations}
            className="px-5 py-2 bg-[#00ff66] hover:bg-[#39ff14] text-black font-bold rounded text-xs flex items-center gap-2 transition-colors whitespace-nowrap shadow-[0_0_20px_rgba(0,255,102,0.2)]"
          >
            <Play className="w-4 h-4 fill-black" />
            <span>
              {canReturnToRadar ? `Apply & Open Radar Scope (${airportIcao})` : `Start Radar Operations (${airportIcao})`}
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
};
