/**
 * SKYCONTROL - Collapsible Left Operations Dock
 * Consolidates Traffic List, Vertical Flight Progress Strips, VHF Comms Log,
 * and Live Simulation Controls into a clean, hairline-divided workstation rail.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import {
  ShieldAlert,
  AlertTriangle,
  Radio,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Mic,
  CloudSun,
  ArrowUpRight,
} from 'lucide-react';
import { calculateDistance } from '../engine/physics';
import { getAircraftPerformance } from '../engine/aircraftPerformance';
import { TrackStatus } from '../engine/radarTracker';
import { radioAudio } from '../audio/radioAudio';

type DockTab = 'traffic' | 'strips' | 'comms';
type FilterCategory = 'ALL' | 'ARRIVALS' | 'DEPARTURES' | 'CONFLICTS';
type SortField = 'DISTANCE' | 'ALTITUDE' | 'CALLSIGN' | 'SPEED';

interface TrafficPanelProps {
  onOpenAudioStudio?: () => void;
}

export const TrafficPanel: React.FC<TrafficPanelProps> = ({ onOpenAudioStudio }) => {
  const aircraftList = useSimulationStore(state => state.aircraft);
  const selectedAircraftId = useSimulationStore(state => state.selectedAircraftId);
  const selectAircraft = useSimulationStore(state => state.selectAircraft);
  const conflicts = useSimulationStore(state => state.conflicts);
  const radarTracks = useSimulationStore(state => state.radarTracks);
  const radioMessages = useSimulationStore(state => state.radioMessages);
  const activeTransmission = useSimulationStore(state => state.activeTransmission);
  const airportProfile = useSimulationStore(state => state.airportProfile);
  const simSpeed = useSimulationStore(state => state.simSpeed);

  const spawnInbound = useSimulationStore(state => state.spawnInbound);
  const spawnDeparture = useSimulationStore(state => state.spawnDeparture);
  const triggerEmergency = useSimulationStore(state => state.triggerEmergency);
  const setSimSpeed = useSimulationStore(state => state.setSimSpeed);
  const resetSimulation = useSimulationStore(state => state.resetSimulation);
  const broadcastWeatherAdvisory = useSimulationStore(state => state.broadcastWeatherAdvisory);

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<DockTab>('traffic');
  const [filter, setFilter] = useState<FilterCategory>('ALL');
  const [sortBy, setSortBy] = useState<SortField>('DISTANCE');
  const [stripFilter, setStripFilter] = useState<'all' | 'arrivals' | 'departures'>('all');

  const logTopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeTab === 'comms') {
      logTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [radioMessages.length, activeTab]);

  const criticalConflicts = conflicts.filter(c => c.severity === 'Critical');
  const warningConflicts = conflicts.filter(
    c => c.severity === 'Warning' || c.severity === 'Caution'
  );

  const trackMap = useMemo(() => {
    const map = new Map<string, TrackStatus>();
    for (const trk of radarTracks) {
      map.set(trk.aircraftId, trk.status);
    }
    return map;
  }, [radarTracks]);

  const filteredAircraft = useMemo(() => {
    return aircraftList
      .filter(ac => {
        const isConflict = conflicts.some(
          c => c.aircraft1Id === ac.id || c.aircraft2Id === ac.id
        );
        if (filter === 'ARRIVALS') return ac.status !== 'Departing' && ac.status !== 'Outbound';
        if (filter === 'DEPARTURES') return ac.status === 'Departing' || ac.status === 'Outbound';
        if (filter === 'CONFLICTS') return isConflict || Boolean(ac.isEmergency);
        return true;
      })
      .sort((a, b) => {
        const distA = calculateDistance(a.x, a.y, 0, 0);
        const distB = calculateDistance(b.x, b.y, 0, 0);
        if (sortBy === 'DISTANCE') return distA - distB;
        if (sortBy === 'ALTITUDE') return a.altitude - b.altitude;
        if (sortBy === 'SPEED') return b.groundSpeed - a.groundSpeed;
        return a.callsign.localeCompare(b.callsign);
      });
  }, [aircraftList, filter, sortBy, conflicts]);

  const filteredStrips = useMemo(() => {
    return aircraftList.filter(ac => {
      if (stripFilter === 'arrivals') return ac.status !== 'Departing' && ac.status !== 'Outbound';
      if (stripFilter === 'departures') return ac.status === 'Departing' || ac.status === 'Outbound';
      return true;
    });
  }, [aircraftList, stripFilter]);

  const handleRadioCheck = () => {
    radioAudio.initAudioContext();
    const targetAc = aircraftList[0];
    const targetCallsign = targetAc?.callsign || 'BAW452';
    const targetTelephony = targetAc?.telephony || 'Speedbird';
    const flightNum = targetCallsign.slice(3) || '452';
    const freq = airportProfile.vhfFrequency;
    const dir = airportProfile.directorCallsign;

    const nowTime = new Date().toTimeString().split(' ')[0];
    const atcText = `${targetCallsign}, ${airportProfile.airport.name} Director, radio check on ${freq}`;
    const pilotPhrase = 'Readability five, loud and clear';

    useSimulationStore.setState(state => ({
      radioMessages: [
        {
          id: `atc_check_${Date.now()}`,
          timestamp: nowTime,
          sender: 'ATC' as const,
          callsign: dir,
          text: atcText,
          frequency: freq,
        },
        ...state.radioMessages.slice(0, 49),
      ],
    }));

    radioAudio.speakRadioExchange(
      atcText,
      targetCallsign,
      pilotPhrase,
      () => {
        const pilotTime = new Date().toTimeString().split(' ')[0];
        useSimulationStore.setState(state => ({
          radioMessages: [
            {
              id: `pilot_check_${Date.now()}`,
              timestamp: pilotTime,
              sender: 'PILOT' as const,
              callsign: targetCallsign,
              text: `${pilotPhrase}, ${targetTelephony} ${flightNum}`,
              frequency: freq,
            },
            ...state.radioMessages.slice(0, 49),
          ],
        }));
      },
      {
        airportIcao: airportProfile.airport.icao,
        aircraftId: targetAc?.id,
        airline: targetAc?.airline,
        telephony: targetAc?.telephony,
        aircraftType: targetAc?.aircraftType,
        frequency: freq,
        priority: 'ATC_CLEARANCE',
        atcRole: 'APPROACH',
        isHeavy: targetAc?.category === 'Heavy',
        pilotHasCallsign: false,
        activeCallsigns: aircraftList.map(f => f.callsign),
      }
    );
  };

  if (isCollapsed) {
    return (
      <aside className="w-10 h-full bg-[#07110c] border-r border-[#163826] flex flex-col items-center py-2 select-none z-20 shrink-0">
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="p-1.5 rounded hover:bg-[#143322] text-[#00ff66] transition-colors mb-3"
          title="Expand Operations Dock"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="flex-1 flex flex-col items-center gap-1.5 overflow-y-auto w-full px-1">
          {aircraftList.map(ac => {
            const isSelected = ac.id === selectedAircraftId;
            const hasConflict = conflicts.some(
              c => c.aircraft1Id === ac.id || c.aircraft2Id === ac.id
            );

            return (
              <button
                type="button"
                key={ac.id}
                onClick={() => selectAircraft(ac.id)}
                className={`w-8 h-7 rounded flex items-center justify-center text-[9px] font-mono border transition-colors ${
                  isSelected
                    ? 'bg-[#143d27] border-[#00ff66] text-[#00ff66] font-bold'
                    : hasConflict || ac.isEmergency
                    ? 'bg-[#361114] border-[#ff3344] text-[#ff6b6b]'
                    : 'bg-[#0a1711] border-[#163826] text-[#9de8bc] hover:bg-[#11261b]'
                }`}
                title={`${ac.callsign} (${ac.aircraftType}) · ${Math.round(ac.altitude)}ft`}
              >
                {ac.callsign.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-72 h-full bg-[#07110c] border-r border-[#163826] flex flex-col font-mono text-xs select-none z-20 shrink-0">
      {/* 1. Dock Tab Bar + Collapse */}
      <div className="h-9 px-2 bg-[#09150f] border-b border-[#163826] flex items-center justify-between gap-1 shrink-0">
        <div className="flex items-center h-full gap-1">
          {(
            [
              { id: 'traffic', label: `Traffic (${aircraftList.length})` },
              { id: 'strips', label: 'Strips' },
              { id: 'comms', label: 'Comms' },
            ] as const
          ).map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`h-full px-2 text-[11px] border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-[#00ff66] text-[#00ff66] font-semibold'
                    : 'border-transparent text-[#69a683] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="p-1 rounded hover:bg-[#143322] text-[#5da87d] hover:text-[#00ff66] transition-colors shrink-0"
          title="Collapse Dock"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Conditional STCA Safety Banner */}
      {criticalConflicts.length > 0 ? (
        <div className="px-3 py-1.5 bg-[#361114] border-b border-[#ff3344]/60 text-[#ff6b6b] flex items-center gap-2 shrink-0">
          <ShieldAlert className="w-3.5 h-3.5 text-[#ff3344] shrink-0" />
          <span className="text-[11px] font-bold">
            LOSS OF SEPARATION ({criticalConflicts.length})
          </span>
        </div>
      ) : warningConflicts.length > 0 ? (
        <div className="px-3 py-1.5 bg-[#2a200b] border-b border-[#ffb703]/50 text-[#ffb703] flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[10px] font-bold">
            STCA CONVERGENCE ({warningConflicts.length})
          </span>
        </div>
      ) : null}

      {/* 3. Active Dock Tab Body */}
      {activeTab === 'traffic' && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Quiet Filter & Sort Bar */}
          <div className="px-2.5 py-1.5 bg-[#060f0a] border-b border-[#143020] flex items-center justify-between gap-2 text-[10px] shrink-0">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'ALL', label: 'All' },
                  { id: 'ARRIVALS', label: 'Arr' },
                  { id: 'DEPARTURES', label: 'Dep' },
                  { id: 'CONFLICTS', label: 'Alert' },
                ] as const
              ).map(opt => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setFilter(opt.id)}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    filter === opt.id
                      ? 'bg-[#143322] text-[#00ff66] font-semibold'
                      : 'text-[#558f6e] hover:text-[#a2f5bf]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortField)}
              aria-label="Sort traffic by"
              className="bg-transparent text-[#8ad8a8] outline-none cursor-pointer text-[10px]"
            >
              <option value="DISTANCE" className="bg-[#07110c]">
                Dist
              </option>
              <option value="ALTITUDE" className="bg-[#07110c]">
                Alt
              </option>
              <option value="SPEED" className="bg-[#07110c]">
                Spd
              </option>
              <option value="CALLSIGN" className="bg-[#07110c]">
                Call
              </option>
            </select>
          </div>

          {/* Hairline-Divided Traffic List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#112c1d]">
            {filteredAircraft.length === 0 ? (
              <div className="p-6 text-center text-[#45785b] text-[11px]">
                No matching traffic
              </div>
            ) : (
              filteredAircraft.map(ac => {
                const isSelected = ac.id === selectedAircraftId;
                const distFromAirport = calculateDistance(ac.x, ac.y, 0, 0);
                const hasCritical = conflicts.some(
                  c =>
                    (c.aircraft1Id === ac.id || c.aircraft2Id === ac.id) &&
                    c.severity === 'Critical'
                );
                const hasWarning = conflicts.some(
                  c =>
                    (c.aircraft1Id === ac.id || c.aircraft2Id === ac.id) &&
                    c.severity === 'Warning'
                );
                const trackStatus: TrackStatus = trackMap.get(ac.id) || 'CONFIRMED';

                const isDeparture = ac.status === 'Departing' || ac.status === 'Outbound';
                const phaseText = ac.isEmergency
                  ? '7700'
                  : !isDeparture && ac.status === 'Landed'
                  ? ac.flightPhase === 'TAXI_EXIT'
                    ? 'VACATED'
                    : 'ROLLOUT'
                  : !isDeparture && ac.landingCleared
                  ? 'CLR LAND'
                  : !isDeparture && ac.landingClearanceRequested
                  ? 'REQ LAND'
                  : ac.status === 'FinalApproach'
                  ? 'FINAL'
                  : ac.flightPhase === 'LOCALIZER_ESTABLISHED' || ac.ilsLocalizerCaptured
                  ? 'LOC'
                  : ac.flightPhase === 'FINAL_INTERCEPT'
                  ? 'INTCPT'
                  : ac.flightPhase === 'BASE_VECTOR'
                  ? 'BASE'
                  : ac.flightPhase === 'STAR_ENROUTE'
                  ? 'STAR'
                  : ac.flightPhase === 'HANDOFF_READY'
                  ? 'HANDOFF'
                  : ac.flightPhase === 'EXIT_ROUTING'
                  ? 'EXITING'
                  : ac.flightPhase === 'INITIAL_CLIMB'
                  ? 'CLIMB'
                  : ac.flightPhase === 'LINEUP'
                  ? 'LINED UP'
                  : ac.flightPhase === 'HOLD_SHORT'
                  ? 'HOLD SHORT'
                  : ac.flightPhase || ac.status.toUpperCase();

                return (
                  <button
                    type="button"
                    key={ac.id}
                    onClick={() => selectAircraft(ac.id)}
                    className={`w-full text-left px-3 py-2 transition-colors border-l-2 ${
                      isSelected
                        ? 'bg-[#0f291b] border-l-[#00ff66]'
                        : hasCritical || ac.isEmergency
                        ? 'bg-[#2a1012] border-l-[#ff3344] hover:bg-[#361416]'
                        : hasWarning
                        ? 'bg-[#241b09] border-l-[#ffb703] hover:bg-[#2e230c]'
                        : 'border-l-transparent hover:bg-[#0b1b13]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`font-bold text-[12px] ${
                            isSelected
                              ? 'text-[#00ff66]'
                              : ac.isEmergency
                              ? 'text-[#ff6b6b]'
                              : 'text-white'
                          }`}
                        >
                          {ac.callsign}
                        </span>
                        <span className="text-[10px] text-[#558f6e]">
                          {ac.aircraftType} · {getAircraftPerformance(ac.aircraftType).classLabel}
                        </span>
                      </div>

                      <span
                        className={`text-[10px] font-semibold ${
                          ac.isEmergency
                            ? 'text-[#ff4d4d]'
                            : ac.flightPhase === 'HANDOFF_READY' || (!isDeparture && ac.landingCleared)
                            ? 'text-[#00ff66]'
                            : !isDeparture && ac.landingClearanceRequested
                            ? 'text-[#ffd166]'
                            : ac.status === 'Established' ||
                              ac.status === 'FinalApproach' ||
                              ac.flightPhase === 'EXIT_ROUTING' ||
                              ac.flightPhase === 'STAR_ENROUTE' ||
                              ac.flightPhase === 'FINAL_INTERCEPT'
                            ? 'text-[#00e5ff]'
                            : trackStatus === 'STALE' ||
                              trackStatus === 'LOST' ||
                              ac.flightPhase === 'LINEUP' ||
                              ac.flightPhase === 'HOLD_SHORT' ||
                              ac.flightPhase === 'BASE_VECTOR'
                            ? 'text-[#ffd166]'
                            : 'text-[#77bd94]'
                        }`}
                      >
                        {phaseText}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#85cca1] mt-1 tabular-nums">
                      <span>
                        {Math.round(ac.heading).toString().padStart(3, '0')}° ·{' '}
                        {Math.round(ac.groundSpeed || ac.indicatedAirspeed)}kt
                      </span>
                      <span>
                        <span className="text-white">{distFromAirport.toFixed(1)} NM</span> ·{' '}
                        <span className="text-[#00ff66] font-semibold">
                          {Math.round(ac.altitude)}ft
                        </span>
                      </span>
                    </div>

                    {(ac.assignedWaypoint ||
                      ac.assignedExitWaypoint ||
                      ac.assignedStarName ||
                      ac.ilsArmed ||
                      ac.assignedRunway) && (
                      <div className="flex items-center justify-between text-[10px] text-[#558f6e] mt-0.5 tabular-nums">
                        <span className="truncate">
                          {isDeparture && ac.assignedExitWaypoint
                            ? `${ac.assignedWaypoint ? `DIR ${ac.assignedWaypoint}` : `EXIT ${ac.assignedExitWaypoint}`} · RWY ${ac.assignedRunway}`
                            : ac.assignedWaypoint
                            ? `${ac.assignedStarName ? `${ac.assignedStarName} → ` : 'DIR '}${ac.assignedWaypoint}`
                            : `${ac.assignedStarName ? `${ac.assignedStarName} · ` : ''}RWY ${ac.assignedRunway}${
                                ac.landingCleared ? ' CLR' : ac.ilsArmed ? ' ILS' : ''
                              }`}
                        </span>
                        <span>TGT {ac.targetAltitude}ft</span>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === 'strips' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-2.5 py-1.5 bg-[#060f0a] border-b border-[#143020] flex items-center justify-between text-[10px] shrink-0">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'all', label: `All (${aircraftList.length})` },
                  {
                    id: 'arrivals',
                    label: `Arr (${
                      aircraftList.filter(
                        a => a.status !== 'Departing' && a.status !== 'Outbound'
                      ).length
                    })`,
                  },
                  {
                    id: 'departures',
                    label: `Dep (${
                      aircraftList.filter(
                        a => a.status === 'Departing' || a.status === 'Outbound'
                      ).length
                    })`,
                  },
                ] as const
              ).map(opt => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setStripFilter(opt.id)}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    stripFilter === opt.id
                      ? 'bg-[#143322] text-[#00ff66] font-semibold'
                      : 'text-[#558f6e] hover:text-[#a2f5bf]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="text-[#45785b]">STRIP BAY</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#122e1f]">
            {filteredStrips.length === 0 ? (
              <div className="p-6 text-center text-[#45785b] text-[11px]">No active flight strips</div>
            ) : (
              filteredStrips.map(ac => {
                const isSelected = ac.id === selectedAircraftId;
                const isArrival = ac.status !== 'Departing' && ac.status !== 'Outbound';
                const isEmergency = Boolean(ac.isEmergency) || ac.transponder === '7700';

                return (
                  <button
                    type="button"
                    key={ac.id}
                    onClick={() => selectAircraft(ac.id)}
                    className={`w-full text-left px-3 py-2.5 transition-colors border-l-2 tabular-nums ${
                      isSelected
                        ? 'bg-[#0f291b] border-l-[#00ff66]'
                        : isEmergency
                        ? 'bg-[#2a1012] border-l-[#ff3344]'
                        : isArrival
                        ? 'border-l-[#1b4a30] hover:bg-[#0b1b13]'
                        : 'border-l-[#1b4b63] hover:bg-[#0b1721]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {isArrival ? (
                          <PlaneLanding className="w-3 h-3 text-[#00ff66]" />
                        ) : (
                          <PlaneTakeoff className="w-3 h-3 text-[#00e5ff]" />
                        )}
                        <span className="font-bold text-white">{ac.callsign}</span>
                        <span className="text-[10px] text-[#6ca885]">
                          {ac.aircraftType} · {getAircraftPerformance(ac.aircraftType).classLabel}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold ${
                          isEmergency ? 'text-[#ff4d4d]' : 'text-[#00e5ff]'
                        }`}
                      >
                        {isEmergency ? 'SQ 7700' : `SQ ${ac.transponder}`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#9de8bc] mt-1">
                      <span>
                        {ac.origin} → {ac.destination}
                        {!isArrival && ac.assignedExitWaypoint
                          ? ` · EXIT ${ac.assignedExitWaypoint}`
                          : isArrival && ac.assignedIafWaypoint
                          ? ` · IAF ${ac.assignedIafWaypoint}`
                          : ''}
                      </span>
                      <span>
                        FL{Math.round(ac.altitude / 100).toString().padStart(3, '0')} →{' '}
                        <b className="text-[#00ff66]">
                          c{Math.round(ac.targetAltitude / 100).toString().padStart(3, '0')}
                        </b>
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[#5c9474] mt-0.5">
                      <span>
                        HDG {Math.round(ac.targetHeading).toString().padStart(3, '0')}° ·{' '}
                        {Math.round(ac.indicatedAirspeed)}kt
                      </span>
                      <span
                        className={
                          isArrival && ac.landingClearanceRequested && !ac.landingCleared
                            ? 'text-[#ffd166] font-bold'
                            : 'text-[#00ff66]'
                        }
                      >
                        {!isArrival && ac.assignedSidName
                          ? `${ac.assignedSidName} · RWY ${ac.assignedRunway}`
                          : isArrival && ac.assignedStarName
                          ? `${ac.assignedStarName} · RWY ${ac.assignedRunway}${
                              ac.landingCleared ? ' CLR' : ac.landingClearanceRequested ? ' REQ' : ''
                            }`
                          : `RWY ${ac.assignedRunway}`}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === 'comms' && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Frequency & Quick VHF Actions */}
          <div className="px-2.5 py-2 bg-[#060f0a] border-b border-[#143020] flex flex-col gap-1.5 shrink-0">
            <div className="flex items-center justify-between text-[10px] tabular-nums">
              <span className="text-[#00e5ff] font-semibold flex items-center gap-1.5">
                <Radio className="w-3 h-3" />
                <span>VHF {airportProfile.vhfFrequency} MHz</span>
              </span>
              {onOpenAudioStudio && (
                <button
                  type="button"
                  onClick={onOpenAudioStudio}
                  className="text-[#7ec99b] hover:text-[#00ff66] flex items-center gap-0.5 transition-colors"
                >
                  <span>Audio Studio</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <button
                type="button"
                onClick={() => {
                  radioAudio.initAudioContext();
                  broadcastWeatherAdvisory();
                }}
                className="py-1 px-2 bg-[#0b1f26] hover:bg-[#112f3b] text-[#7ae8ff] border border-[#1a4859] rounded flex items-center justify-center gap-1 transition-colors"
              >
                <CloudSun className="w-3 h-3" />
                <span>ATIS / WX</span>
              </button>
              <button
                type="button"
                onClick={handleRadioCheck}
                className="py-1 px-2 bg-[#0d2417] hover:bg-[#153824] text-[#9de8bc] border border-[#1c4830] rounded flex items-center justify-center gap-1 transition-colors"
              >
                <Mic className="w-3 h-3 text-[#00ff66]" />
                <span>Radio Check</span>
              </button>
            </div>

            {activeTransmission && (
              <div className="text-[10px] font-semibold text-[#00ff66] truncate">
                TX ·{' '}
                {activeTransmission.speaker === 'ATC'
                  ? airportProfile.directorCallsign
                  : activeTransmission.callsign}
              </div>
            )}
          </div>

          {/* Radio Transcript Stream */}
          <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2 text-[11px] tabular-nums">
            <div ref={logTopRef} />
            {radioMessages.length === 0 ? (
              <div className="text-[#45785b] text-center py-6">No radio traffic logged</div>
            ) : (
              radioMessages.map(msg => (
                <div key={msg.id} className="leading-snug border-b border-[#0f2419] pb-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span
                      className={`font-bold ${
                        msg.sender === 'ATC' ? 'text-[#00e5ff]' : 'text-[#00ff66]'
                      }`}
                    >
                      {msg.sender === 'ATC'
                        ? msg.callsign || airportProfile.directorCallsign
                        : msg.callsign}
                    </span>
                    <span className="text-[#45785b]">{msg.timestamp}</span>
                  </div>
                  <div className="text-[#d1e7dd] mt-0.5">{msg.text}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 4. Compact Simulation Controls Footer (Moved out of TopBar) */}
      <div className="p-2 bg-[#08150f] border-t border-[#163826] flex flex-col gap-1.5 shrink-0">
        <div className="grid grid-cols-3 gap-1 text-[10px]">
          <button
            type="button"
            onClick={spawnInbound}
            className="py-1 px-1.5 bg-[#0d2418] hover:bg-[#153825] text-[#00ff66] border border-[#1d4a31] rounded flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
            title="Spawn Inbound Arrival"
          >
            <Plus className="w-3 h-3" />
            <span>Arr</span>
          </button>
          <button
            type="button"
            onClick={spawnDeparture}
            className="py-1 px-1.5 bg-[#0b2029] hover:bg-[#11313d] text-[#00e5ff] border border-[#1a4859] rounded flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
            title="Spawn Departure Flight"
          >
            <Plane className="w-3 h-3" />
            <span>Dep</span>
          </button>
          <button
            type="button"
            onClick={() => triggerEmergency()}
            className="py-1 px-1.5 bg-[#2b1113] hover:bg-[#3d171a] text-[#ff6b6b] border border-[#592125] rounded font-semibold transition-colors whitespace-nowrap"
            title="Trigger Squawk 7700 Emergency"
          >
            7700
          </button>
        </div>

        <div className="flex items-center justify-between gap-1.5 text-[10px]">
          <div className="flex items-center bg-[#060f0a] border border-[#163826] rounded p-0.5">
            {[1, 2, 5].map(spd => (
              <button
                type="button"
                key={spd}
                onClick={() => setSimSpeed(spd)}
                className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                  simSpeed === spd
                    ? 'bg-[#173f29] text-[#00ff66]'
                    : 'text-[#558f6e] hover:text-white'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => resetSimulation()}
            className="px-2 py-1 bg-[#0a1b12] hover:bg-[#132e1f] text-[#7cc29a] hover:text-white border border-[#163826] rounded flex items-center gap-1 transition-colors whitespace-nowrap"
            title="Reset Active Sector Traffic"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
