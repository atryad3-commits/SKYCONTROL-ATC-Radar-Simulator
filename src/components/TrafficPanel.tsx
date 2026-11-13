/**
 * SKYCONTROL - Collapsible Left Traffic Panel (Part 1.B)
 * High-density ATC flight list with track freshness states,
 * flight phase badges, distance to reference, STCA conflict monitoring,
 * and comprehensive filtering/sorting.
 */

import React, { useState, useMemo } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { 
  ShieldAlert, 
  AlertTriangle, 
  Radio, 
  Plane, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  ArrowUpDown, 
  Wifi, 
  WifiOff 
} from 'lucide-react';
import { calculateDistance } from '../engine/physics';
import { TrackStatus } from '../engine/radarTracker';

type FilterCategory = 'ALL' | 'ARRIVALS' | 'DEPARTURES' | 'CONFLICTS' | 'STALE';
type SortField = 'DISTANCE' | 'ALTITUDE' | 'CALLSIGN' | 'SPEED';

export const TrafficPanel: React.FC = () => {
  const aircraftList = useSimulationStore(state => state.aircraft);
  const selectedAircraftId = useSimulationStore(state => state.selectedAircraftId);
  const selectAircraft = useSimulationStore(state => state.selectAircraft);
  const conflicts = useSimulationStore(state => state.conflicts);
  const radarTracks = useSimulationStore(state => state.radarTracks);

  // Panel state
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [filter, setFilter] = useState<FilterCategory>('ALL');
  const [sortBy, setSortBy] = useState<SortField>('DISTANCE');

  const criticalConflicts = conflicts.filter(c => c.severity === 'Critical');
  const warningConflicts = conflicts.filter(c => c.severity === 'Warning' || c.severity === 'Caution');

  // Map of radar track by aircraft ID for fast freshness lookup
  const trackMap = useMemo(() => {
    const map = new Map<string, TrackStatus>();
    for (const trk of radarTracks) {
      map.set(trk.aircraftId, trk.status);
    }
    return map;
  }, [radarTracks]);

  // Filter & sort logic
  const filteredAircraft = useMemo(() => {
    return aircraftList.filter(ac => {
      const isConflict = conflicts.some(c => c.aircraft1Id === ac.id || c.aircraft2Id === ac.id);
      const trackStatus = trackMap.get(ac.id) || 'CONFIRMED';

      if (filter === 'ARRIVALS') {
        return ac.status !== 'Departing';
      }
      if (filter === 'DEPARTURES') {
        return ac.status === 'Departing';
      }
      if (filter === 'CONFLICTS') {
        return isConflict;
      }
      if (filter === 'STALE') {
        return trackStatus === 'STALE' || trackStatus === 'LOST';
      }
      return true;
    }).sort((a, b) => {
      const distA = calculateDistance(a.x, a.y, 0, 0);
      const distB = calculateDistance(b.x, b.y, 0, 0);

      if (sortBy === 'DISTANCE') return distA - distB;
      if (sortBy === 'ALTITUDE') return a.altitude - b.altitude;
      if (sortBy === 'SPEED') return b.groundSpeed - a.groundSpeed;
      if (sortBy === 'CALLSIGN') return a.callsign.localeCompare(b.callsign);
      return 0;
    });
  }, [aircraftList, filter, sortBy, conflicts, trackMap]);

  if (isCollapsed) {
    return (
      <aside className="w-10 h-full bg-[#08130e] border-r border-[#163826] flex flex-col items-center py-2 select-none z-20 shrink-0">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-1.5 rounded hover:bg-[#153424] text-[#00ff66] transition-colors mb-4"
          title="Expand Traffic Panel"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="flex-1 flex flex-col items-center gap-2 overflow-y-auto w-full px-1">
          {aircraftList.map(ac => {
            const isSelected = ac.id === selectedAircraftId;
            const hasConflict = conflicts.some(c => c.aircraft1Id === ac.id || c.aircraft2Id === ac.id);
            const status = trackMap.get(ac.id) || 'CONFIRMED';

            return (
              <button
                key={ac.id}
                onClick={() => selectAircraft(ac.id)}
                className={`w-8 h-8 rounded flex flex-col items-center justify-center text-[9px] font-mono border transition-all ${
                  isSelected
                    ? 'bg-[#15422a] border-[#00ff66] text-[#00ff66]'
                    : hasConflict
                    ? 'bg-[#3b1212] border-[#ff3344] text-[#ff4d4d]'
                    : status === 'STALE'
                    ? 'bg-[#2b2413] border-[#ffb703] text-[#ffe6a0]'
                    : status === 'LOST'
                    ? 'bg-[#3b1515] border-[#ff3344] text-[#ff6b6b]'
                    : 'bg-[#0a1711] border-[#163826] text-[#a2f5bf] hover:bg-[#12281c]'
                }`}
                title={`${ac.callsign} (${ac.aircraftType}) - ${Math.round(ac.altitude)}ft`}
              >
                <span>{ac.callsign.slice(0, 3)}</span>
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-76 h-full bg-[#08130e] border-r border-[#163826] flex flex-col font-mono text-xs select-none z-20 shrink-0">
      {/* 1. Header & Collapse Toggle */}
      <div className="h-9 px-3 bg-[#0a1710] border-b border-[#163826] flex items-center justify-between text-[#a2f5bf]">
        <div className="flex items-center gap-2">
          <Plane className="w-3.5 h-3.5 text-[#00ff66]" />
          <span className="font-bold text-[11px] text-white tracking-wide">
            TRAFFIC LIST ({aircraftList.length})
          </span>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 rounded hover:bg-[#153424] text-[#5da87d] hover:text-[#00ff66] transition-colors"
          title="Collapse Panel"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* 2. STCA Safety Banner */}
      {criticalConflicts.length > 0 ? (
        <div className="p-2 bg-[#381111] border-b border-[#ff3344] text-[#ff3344] flex items-center gap-2 animate-pulse">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <div className="flex-1 text-[11px] font-bold leading-tight">
            LOSS OF SEPARATION ({criticalConflicts.length})
          </div>
        </div>
      ) : warningConflicts.length > 0 ? (
        <div className="p-1.5 bg-[#2d220b] border-b border-[#ffb703] text-[#ffb703] flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <div className="flex-1 text-[10px] font-bold leading-tight">
            STCA CONVERGENCE ({warningConflicts.length})
          </div>
        </div>
      ) : (
        <div className="px-3 py-1.5 bg-[#091610] border-b border-[#163826] flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1.5 text-[#00ff66]">
            <Radio className="w-3 h-3" />
            <span className="font-semibold">SEPARATION NOMINAL</span>
          </div>
          <span className="text-[#3b6d4e]">3.0NM / 1000FT</span>
        </div>
      )}

      {/* 3. Filter Category Tabs */}
      <div className="grid grid-cols-5 p-1 bg-[#06100b] border-b border-[#163826] text-[10px] text-center gap-0.5">
        {(['ALL', 'ARRIVALS', 'DEPARTURES', 'CONFLICTS', 'STALE'] as FilterCategory[]).map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`py-1 rounded transition-colors truncate ${
              filter === cat
                ? 'bg-[#153826] text-[#00ff66] font-bold shadow-sm'
                : 'text-[#4e8b69] hover:text-[#a2f5bf] hover:bg-[#0a1711]'
            }`}
          >
            {cat === 'ARRIVALS' ? 'ARR' : cat === 'DEPARTURES' ? 'DEP' : cat === 'CONFLICTS' ? 'STCA' : cat}
          </button>
        ))}
      </div>

      {/* 4. Sort Options Subheader */}
      <div className="px-3 py-1 bg-[#091510] border-b border-[#163826] flex items-center justify-between text-[10px] text-[#4e8b69]">
        <div className="flex items-center gap-1">
          <Filter className="w-2.5 h-2.5" />
          <span>FILTER: <b className="text-[#a2f5bf]">{filter}</b></span>
        </div>
        <div className="flex items-center gap-1">
          <ArrowUpDown className="w-2.5 h-2.5" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortField)}
            className="bg-transparent text-[#a2f5bf] outline-none cursor-pointer"
          >
            <option value="DISTANCE" className="bg-[#08130e]">DIST</option>
            <option value="ALTITUDE" className="bg-[#08130e]">ALT</option>
            <option value="SPEED" className="bg-[#08130e]">SPD</option>
            <option value="CALLSIGN" className="bg-[#08130e]">CALL</option>
          </select>
        </div>
      </div>

      {/* 5. Scrollable Aircraft Card List */}
      <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1.5">
        {filteredAircraft.length === 0 ? (
          <div className="p-6 text-center text-[#3b6d4e] text-xs">
            No matching aircraft
          </div>
        ) : (
          filteredAircraft.map(ac => {
            const isSelected = ac.id === selectedAircraftId;
            const distFromAirport = calculateDistance(ac.x, ac.y, 0, 0);

            const hasCritical = conflicts.some(
              c => (c.aircraft1Id === ac.id || c.aircraft2Id === ac.id) && c.severity === 'Critical'
            );
            const hasWarning = conflicts.some(
              c => (c.aircraft1Id === ac.id || c.aircraft2Id === ac.id) && c.severity === 'Warning'
            );

            const trackStatus: TrackStatus = trackMap.get(ac.id) || 'CONFIRMED';

            return (
              <div
                key={ac.id}
                onClick={() => selectAircraft(ac.id)}
                className={`p-2 rounded border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-[#102b1d] border-[#00ff66] shadow-[0_0_10px_rgba(0,255,102,0.25)]'
                    : hasCritical
                    ? 'bg-[#3b1212] border-[#ff3344]'
                    : hasWarning
                    ? 'bg-[#2b200b] border-[#ffb703]'
                    : 'bg-[#0a1711] hover:bg-[#12281c] border-[#163826]'
                }`}
              >
                {/* Line 1: Callsign, Type, and Track Freshness Indicator */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Plane className={`w-3 h-3 ${isSelected ? 'text-[#00ff66]' : 'text-[#4e8b69]'}`} />
                    <span className="font-bold text-white text-[12px]">{ac.callsign}</span>
                    <span className="text-[10px] text-[#4e8b69]">{ac.aircraftType}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Track Freshness Pill */}
                    <span className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                      trackStatus === 'CONFIRMED'
                        ? 'bg-[#00ff66]/15 text-[#00ff66]'
                        : trackStatus === 'PREDICTED'
                        ? 'bg-[#00e5ff]/15 text-[#00e5ff]'
                        : trackStatus === 'STALE'
                        ? 'bg-[#ffb703]/20 text-[#ffb703]'
                        : 'bg-[#ff3344]/20 text-[#ff3344] animate-pulse'
                    }`}>
                      {trackStatus === 'CONFIRMED' ? 'SCAN' : trackStatus}
                    </span>

                    {/* Flight Phase Pill */}
                    <span className={`text-[9px] font-semibold px-1 py-0.2 rounded ${
                      ac.status === 'Established' || ac.status === 'FinalApproach'
                        ? 'bg-[#00e5ff]/20 text-[#00e5ff]'
                        : ac.status === 'GoAround'
                        ? 'bg-[#ff3344]/20 text-[#ff3344]'
                        : 'bg-[#153322] text-[#85cca1]'
                    }`}>
                      {ac.status === 'FinalApproach' ? 'FINAL' : ac.status}
                    </span>
                  </div>
                </div>

                {/* Line 2: Spatial Navigation Metrics */}
                <div className="flex items-center justify-between text-[11px] text-[#85cca1]">
                  <div>
                    <span>HDG: <b className="text-white">{Math.round(ac.heading).toString().padStart(3, '0')}°</b></span>
                    {' · '}
                    <span>{Math.round(ac.groundSpeed || ac.indicatedAirspeed)}kt</span>
                  </div>

                  <div className="text-right">
                    <span className="font-semibold text-white">{distFromAirport.toFixed(1)} NM</span>
                    {' · '}
                    <span className="text-[#00ff66] font-bold">{Math.round(ac.altitude)}ft</span>
                  </div>
                </div>

                {/* Sub-line for ILS or Waypoint */}
                {(ac.assignedWaypoint || ac.ilsArmed || ac.assignedRunway) && (
                  <div className="mt-1 pt-1 border-t border-[#163826]/60 flex items-center justify-between text-[10px] text-[#4e8b69]">
                    <span>
                      {ac.assignedWaypoint ? `DIR TO: ${ac.assignedWaypoint}` : `RWY: ${ac.assignedRunway}`}
                    </span>
                    <span>
                      TGT: <b className="text-[#a2f5bf]">{ac.targetAltitude}ft</b>
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
