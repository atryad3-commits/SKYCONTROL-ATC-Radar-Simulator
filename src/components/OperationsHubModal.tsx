/**
 * SKYCONTROL - Unified Operations Hub Modal
 * Tab 1: Flight Academy (5 Certification Missions)
 * Tab 2: Free Operations (5 International & Training Airports + Runway Layout Selection)
 * Tab 3: Custom Scenario Studio (Create, Edit, Delete, Launch custom scenarios)
 */

import React, { useState, useMemo } from 'react';
import {
  Award,
  CheckCircle2,
  Compass,
  Edit2,
  Flame,
  Layers,
  Play,
  Plus,
  Save,
  Trash2,
  Wind,
  X,
  AlertTriangle,
} from 'lucide-react';
import {
  CustomScenarioConfig,
  MissionId,
  UserProfileData,
  WeatherCondition,
} from '../types';
import { ACADEMY_MISSIONS } from '../engine/missions';
import { ALL_AIRPORT_PROFILES, getAirportProfile } from '../airports/airportsRegistry';
import { useSimulationStore } from '../store/simulationStore';
import { deleteUserScenario, saveUserScenario } from '../services/persistenceService';

export type OperationsHubTab = 'academy' | 'airports' | 'studio';

interface OperationsHubModalProps {
  isOpen: boolean;
  initialTab?: OperationsHubTab;
  userProfile: UserProfileData | null;
  scenarios: CustomScenarioConfig[];
  onClose: () => void;
  onScenariosChanged: (next: CustomScenarioConfig[]) => void;
  onOpenCertificate: () => void;
  onRequireAuth: () => void;
}

type WindPresetKey = 'calm' | 'moderate' | 'crosswind';

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

export const OperationsHubModal: React.FC<OperationsHubModalProps> = ({
  isOpen,
  initialTab = 'academy',
  userProfile,
  scenarios,
  onClose,
  onScenariosChanged,
  onOpenCertificate,
  onRequireAuth,
}) => {
  const startMission = useSimulationStore(state => state.startMission);
  const switchAirport = useSimulationStore(state => state.switchAirport);
  const startCustomScenario = useSimulationStore(state => state.startCustomScenario);
  const activeAirportIcao = useSimulationStore(state => state.airport.icao);

  const [activeTab, setActiveTab] = useState<OperationsHubTab>(initialTab);

  // Tab 2: Free Operations Airport/Runway configurator
  const [selectedIcao, setSelectedIcao] = useState<string>(activeAirportIcao || 'EGLL');
  const selectedProfile = useMemo(() => getAirportProfile(selectedIcao), [selectedIcao]);
  const [freeLandingRwy, setFreeLandingRwy] = useState<string>(
    selectedProfile.airport.defaultArrivalRunway
  );
  const [freeDepartureRwy, setFreeDepartureRwy] = useState<string>(
    selectedProfile.airport.defaultDepartureRunway
  );
  const [windPreset, setWindPreset] = useState<WindPresetKey>('moderate');

  // Tab 3: Custom Scenario Studio state
  const [draft, setDraft] = useState<CustomScenarioConfig>(() =>
    buildDefaultScenarioDraft(userProfile?.uid || 'guest_local')
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [studioBusy, setStudioBusy] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);

  const draftProfile = useMemo(
    () => getAirportProfile(draft.airportIcao),
    [draft.airportIcao]
  );

  if (!isOpen) return null;

  const handleSelectAirportCard = (icao: string) => {
    const prof = getAirportProfile(icao);
    setSelectedIcao(icao);
    setFreeLandingRwy(prof.airport.defaultArrivalRunway);
    setFreeDepartureRwy(prof.airport.defaultDepartureRunway);
  };

  const handleLaunchFreeOps = () => {
    const baseWeather = selectedProfile.defaultWeather;
    const arrRwy = selectedProfile.airport.runways.find(r => r.id === freeLandingRwy);
    const arrHdg = arrRwy ? arrRwy.heading : 270;

    let customWeather: WeatherCondition = { ...baseWeather };
    if (windPreset === 'calm') {
      customWeather = {
        ...baseWeather,
        windDirection: arrHdg,
        windSpeed: 6,
        gusts: 8,
        visibilityNM: 10,
        precipitation: 'None',
      };
    } else if (windPreset === 'crosswind') {
      customWeather = {
        ...baseWeather,
        windDirection: (arrHdg + 75) % 360,
        windSpeed: 28,
        gusts: 36,
        qnh: 997,
        visibilityNM: 6,
        ceilingFeet: 2800,
        precipitation: 'Light Rain',
      };
    }

    switchAirport(selectedIcao, freeLandingRwy, freeDepartureRwy, customWeather);
    onClose();
  };

  const handleLaunchMission = (missionId: MissionId) => {
    startMission(missionId);
    onClose();
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
        startCustomScenario(saved);
        onClose();
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

  const completedSet = new Set(userProfile?.completedMissions || []);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[88vh] bg-[#08130e] border border-[#1b422d] rounded-lg shadow-2xl flex flex-col overflow-hidden select-none">
        {/* Header & Segmented Navigation */}
        <div className="px-5 py-3 bg-[#0c1d14] border-b border-[#163826] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Compass className="w-5 h-5 text-[#00ff66]" />
            <h2 className="text-sm font-bold text-white">
              Operations Hub, Flight Academy &amp; Scenario Studio
            </h2>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#06100b] border border-[#163826] rounded-md">
            <button
              onClick={() => setActiveTab('academy')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeTab === 'academy'
                  ? 'bg-[#173f29] text-[#00ff66]'
                  : 'text-[#6ba885] hover:text-white'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Flight Academy ({completedSet.size}/5)</span>
            </button>

            <button
              onClick={() => setActiveTab('airports')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeTab === 'airports'
                  ? 'bg-[#173f29] text-[#00ff66]'
                  : 'text-[#6ba885] hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Free Ops &amp; Airports</span>
            </button>

            <button
              onClick={() => setActiveTab('studio')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeTab === 'studio'
                  ? 'bg-[#173f29] text-[#00ff66]'
                  : 'text-[#6ba885] hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Scenario Studio ({scenarios.length})</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#163826] text-[#5da87d] hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Active Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 text-xs">
          {/* ============================================================== */}
          {/* TAB 1: TRAINING ACADEMY & CERTIFICATION                        */}
          {/* ============================================================== */}
          {activeTab === 'academy' && (
            <div className="flex flex-col gap-5">
              {/* Academy Progress Bar */}
              <div className="pb-4 border-b border-[#163826] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Official Air Traffic Controller (ATC) Qualification Path
                  </h3>
                  <p className="text-[#85cca1] mt-1">
                    Complete all 5 operational missions below to earn your serialized ATC Approach Director certificate. All 5 airports remain unlocked in Free Ops at any time.
                  </p>
                </div>

                {userProfile?.certified ? (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenCertificate();
                    }}
                    className="px-4 py-2 bg-[#ffd166] hover:bg-[#ffe08a] text-black font-bold rounded flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Award className="w-4 h-4" />
                    <span>View ATC Certificate</span>
                  </button>
                ) : (
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-[11px] text-[#5da87d]">CERTIFICATION PROGRESS</div>
                    <div className="text-base font-bold text-[#00ff66]">{completedSet.size} / 5 COMPLETED</div>
                  </div>
                )}
              </div>

              {/* Mission List */}
              <div className="grid grid-cols-1 gap-3">
                {ACADEMY_MISSIONS.map(msn => {
                  const isDone = completedSet.has(msn.id);
                  return (
                    <div
                      key={msn.id}
                      className={`p-4 rounded border transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        isDone
                          ? 'bg-[#0b2116] border-[#00ff66]/45'
                          : 'bg-[#0a1711] border-[#163826] hover:border-[#24593b]'
                      }`}
                    >
                      <div className="flex-1 flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-white">
                            {msn.number}. {msn.title}
                          </span>
                          <span className="text-[#4e8b69]">·</span>
                          <span className="font-mono text-[#00e5ff]">
                            {msn.airportIcao} · RWY {msn.landingRunwayId}/{msn.departureRunwayId}
                          </span>
                          <span className="text-[#4e8b69]">·</span>
                          {isDone ? (
                            <span className="text-[#00ff66] font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Completed</span>
                            </span>
                          ) : (
                            <span className="text-[#ffd166] font-semibold">Ready</span>
                          )}
                        </div>

                        <p className="text-[#a2f5bf] leading-relaxed">{msn.description}</p>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#70b88d] font-mono tabular-nums">
                          <span>LND ≥ {msn.targetLandings}</span>
                          {msn.targetDepartures > 0 && (
                            <>
                              <span>·</span>
                              <span>DEP ≥ {msn.targetDepartures}</span>
                            </>
                          )}
                          <span>·</span>
                          <span>WIND {msn.weather.windDirection}°/{msn.weather.windSpeed}kt</span>
                          <span>·</span>
                          <span>MIN SCR {msn.minScore}%</span>
                          {msn.requireEmergencyHandled && (
                            <>
                              <span>·</span>
                              <span className="text-[#ff6b6b]">SQUAWK 7700</span>
                            </>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleLaunchMission(msn.id)}
                        className="px-4 py-2 bg-[#143d27] hover:bg-[#00ff66] text-[#00ff66] hover:text-black border border-[#246642] font-bold rounded flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{isDone ? 'Replay Mission' : 'Launch Mission'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: FREE OPERATIONS – AIRPORT & RUNWAY SELECTOR             */}
          {/* ============================================================== */}
          {activeTab === 'airports' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left: 5 Airport Cards */}
              <div className="lg:col-span-7 flex flex-col gap-3">
                <h3 className="text-sm font-bold text-white pb-2 border-b border-[#163826]">
                  1. Select International Airport or Training Sector
                </h3>

                {ALL_AIRPORT_PROFILES.map(prof => {
                  const isSel = prof.airport.icao === selectedIcao;
                  return (
                    <button
                      type="button"
                      key={prof.airport.icao}
                      onClick={() => handleSelectAirportCard(prof.airport.icao)}
                      className={`text-left p-3.5 rounded border transition-colors flex flex-col gap-1.5 ${
                        isSel
                          ? 'bg-[#0f2b1c] border-[#00ff66]'
                          : 'bg-[#0a1711] hover:bg-[#10241a] border-[#163826]'
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
                        {prof.runwayLayoutLabel} · ELEV {prof.airport.elevationFeet}ft · WIND {prof.defaultWeather.windDirection}°/{prof.defaultWeather.windSpeed}kt
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right: Runway Direction & Wind Configurator */}
              <div className="lg:col-span-5 flex flex-col gap-4 bg-[#0a1610] border border-[#163826] rounded p-4 h-fit">
                <div className="pb-3 border-b border-[#163826]">
                  <div className="text-xs text-[#5da87d]">Active Runway &amp; Sector Configuration</div>
                  <div className="text-base font-bold text-white font-mono mt-0.5">
                    {selectedProfile.airport.icao} · {selectedProfile.airport.name}
                  </div>
                </div>

                {/* Landing Runway Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-[#00ff66]">Active Landing Runway (ILS)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedProfile.airport.runways.map(rwy => (
                      <button
                        type="button"
                        key={`arr_${rwy.id}`}
                        onClick={() => setFreeLandingRwy(rwy.id)}
                        className={`py-2 px-3 rounded border font-mono text-left transition-colors whitespace-nowrap ${
                          freeLandingRwy === rwy.id
                            ? 'bg-[#17402a] border-[#00ff66] text-white font-bold'
                            : 'bg-[#07110c] border-[#163826] text-[#7ec29a] hover:border-[#2a6b48]'
                        }`}
                      >
                        RWY {rwy.id} ({rwy.heading.toString().padStart(3, '0')}°)
                      </button>
                    ))}
                  </div>
                </div>

                {/* Departure Runway Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-[#00e5ff]">Active Departure Runway (SID)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedProfile.airport.runways.map(rwy => (
                      <button
                        type="button"
                        key={`dep_${rwy.id}`}
                        onClick={() => setFreeDepartureRwy(rwy.id)}
                        className={`py-2 px-3 rounded border font-mono text-left transition-colors whitespace-nowrap ${
                          freeDepartureRwy === rwy.id
                            ? 'bg-[#0f3342] border-[#00e5ff] text-white font-bold'
                            : 'bg-[#07110c] border-[#163826] text-[#7ec29a] hover:border-[#2a6b48]'
                        }`}
                      >
                        RWY {rwy.id} ({rwy.heading.toString().padStart(3, '0')}°)
                      </button>
                    ))}
                  </div>
                </div>

                {/* Wind Profile */}
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-[#ffd166] flex items-center gap-1.5">
                    <Wind className="w-3.5 h-3.5" />
                    <span>Wind &amp; Weather Profile</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { key: 'calm', label: 'Calm (6kt)' },
                        { key: 'moderate', label: 'Field Default' },
                        { key: 'crosswind', label: 'Crosswind (28kt)' },
                      ] as const
                    ).map(opt => (
                      <button
                        type="button"
                        key={opt.key}
                        onClick={() => setWindPreset(opt.key)}
                        className={`py-2 px-2 rounded border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                          windPreset === opt.key
                            ? 'bg-[#2b220d] border-[#ffd166] text-[#ffd166]'
                            : 'bg-[#07110c] border-[#163826] text-[#7ec29a] hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLaunchFreeOps}
                  className="mt-2 w-full py-2.5 px-4 bg-[#00ff66] hover:bg-[#39ff14] text-black font-bold rounded flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Play className="w-4 h-4" />
                  <span>Open Radar at {selectedProfile.airport.icao}</span>
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: FULL CUSTOM SCENARIO STUDIO                             */}
          {/* ============================================================== */}
          {activeTab === 'studio' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Saved User Scenarios List */}
              <div className="lg:col-span-5 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#163826]">
                  <h3 className="text-sm font-bold text-white">Saved Custom Scenarios</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setDraft(buildDefaultScenarioDraft(userProfile?.uid || 'guest_local'));
                      setStudioError(null);
                    }}
                    className="px-2.5 py-1.5 bg-[#123321] hover:bg-[#19472f] text-[#00ff66] border border-[#246340] rounded font-semibold flex items-center gap-1 transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Scenario</span>
                  </button>
                </div>

                {scenarios.length === 0 ? (
                  <div className="p-6 bg-[#0a1711] border border-[#163826] rounded text-center text-[#70b88d] leading-relaxed">
                    No custom scenarios saved yet. Configure the airport, wind, traffic density, and emergency parameters on the right to save your own scenario.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {scenarios.map(sc => (
                      <div
                        key={sc.id}
                        className={`p-3 rounded border transition-colors flex flex-col gap-2 ${
                          editingId === sc.id
                            ? 'bg-[#0f291b] border-[#00ff66]'
                            : 'bg-[#0a1711] border-[#163826]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-white text-sm">{sc.name}</div>
                            <div className="text-[11px] text-[#70b88d] font-mono tabular-nums mt-0.5">
                              {sc.airportIcao} · RWY {sc.landingRunwayId}/{sc.departureRunwayId} · {sc.windDirection}°/{sc.windSpeed}kt
                              {sc.allowEmergencies ? ' · 7700' : ''}
                            </div>
                          </div>
                          <span className="text-[10px] text-[#a2f5bf] font-mono">{sc.difficulty}</span>
                        </div>

                        {sc.description && (
                          <p className="text-[11px] text-[#85cca1]">{sc.description}</p>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              startCustomScenario(sc);
                              onClose();
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
              <div className="lg:col-span-7 bg-[#0a1610] border border-[#163826] rounded p-4 flex flex-col gap-3.5">
                <div className="flex items-center justify-between pb-2 border-b border-[#163826]">
                  <h3 className="text-sm font-bold text-white">
                    {editingId ? 'Edit Selected Scenario' : 'Design New Scenario'}
                  </h3>
                  <span className="text-[11px] text-[#5da87d]">
                    {userProfile?.mode === 'google' ? 'Cloud Firestore Storage' : 'Local Browser Storage'}
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
                  <label className="block text-[#a2f5bf] font-semibold mb-1">Operational Briefing Notes</label>
                  <input
                    type="text"
                    maxLength={300}
                    value={draft.description}
                    onChange={e => setDraft({ ...draft, description: e.target.value })}
                    className="w-full bg-[#050d09] border border-[#1a422d] focus:border-[#00ff66] rounded px-3 py-1.5 text-white outline-none"
                  />
                </div>

                {/* Airport & Runways */}
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
                          {p.airport.icao} – {p.airport.name}
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

                {/* Weather Controls */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-[#163826] tabular-nums">
                  <div>
                    <label className="flex justify-between text-[11px] text-[#a2f5bf] mb-1">
                      <span>Wind Direction</span>
                      <span className="font-mono text-white">{draft.windDirection.toString().padStart(3, '0')}°</span>
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
                      <span>Gusts</span>
                      <span className="font-mono text-white">{draft.gusts} kt</span>
                    </label>
                    <input
                      type="range"
                      min={draft.windSpeed}
                      max={65}
                      value={draft.gusts}
                      onChange={e => setDraft({ ...draft, gusts: Number(e.target.value) })}
                      className="w-full accent-[#ffd166]"
                    />
                  </div>

                  <div>
                    <label className="flex justify-between text-[11px] text-[#a2f5bf] mb-1">
                      <span>QNH Pressure</span>
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

                  <div>
                    <label className="flex justify-between text-[11px] text-[#a2f5bf] mb-1">
                      <span>Visibility</span>
                      <span className="font-mono text-white">{draft.visibilityNM} NM</span>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={15}
                      step={0.5}
                      value={draft.visibilityNM}
                      onChange={e => setDraft({ ...draft, visibilityNM: Number(e.target.value) })}
                      className="w-full accent-[#00e5ff]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#a2f5bf] mb-1">Precipitation / Fog</label>
                    <select
                      value={draft.precipitation}
                      onChange={e =>
                        setDraft({
                          ...draft,
                          precipitation: e.target.value as CustomScenarioConfig['precipitation'],
                        })
                      }
                      className="w-full bg-[#050d09] border border-[#1a422d] rounded px-2 py-1 text-white outline-none"
                    >
                      <option value="None">Clear (None)</option>
                      <option value="Light Rain">Light Rain</option>
                      <option value="Rain">Heavy Rain</option>
                      <option value="Fog">Dense Fog</option>
                    </select>
                  </div>
                </div>

                {/* Traffic & Emergency Controls */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-[#163826] tabular-nums">
                  <div>
                    <label className="flex justify-between text-[11px] text-[#a2f5bf] mb-1">
                      <span>Initial Arrivals</span>
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
                      <span>Initial Departures</span>
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
                      <span>Spawn Interval</span>
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
                      <span>Heavy Aircraft Ratio</span>
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

                {/* Emergency Toggle */}
                <div className="p-3 bg-[#0d1c14] border border-[#1b422d] rounded flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.allowEmergencies}
                      onChange={e => setDraft({ ...draft, allowEmergencies: e.target.checked })}
                      className="w-4 h-4 accent-[#ff4d4d]"
                    />
                    <span className="font-semibold text-white">
                      Inject Automatic Emergency (Squawk 7700)
                    </span>
                  </label>

                  {draft.allowEmergencies && (
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className="text-[11px] text-[#ffb3b8]">Trigger Delay:</span>
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

                {/* Save / Save & Run Actions */}
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
      </div>
    </div>
  );
};
