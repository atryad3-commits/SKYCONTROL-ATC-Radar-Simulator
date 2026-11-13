/**
 * SKYCONTROL - Sector Traffic & STCA Alert Sidebar
 * Displays active traffic list, distance from airport center,
 * and live Short Term Conflict Alerts (STCA).
 */

import React from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { ShieldAlert, AlertTriangle, Radio, Plane } from 'lucide-react';
import { calculateDistance } from '../engine/physics';

export const TrafficList: React.FC = () => {
  const aircraftList = useSimulationStore(state => state.aircraft);
  const selectedAircraftId = useSimulationStore(state => state.selectedAircraftId);
  const selectAircraft = useSimulationStore(state => state.selectAircraft);
  const conflicts = useSimulationStore(state => state.conflicts);

  const criticalConflicts = conflicts.filter(c => c.severity === 'Critical');
  const warningConflicts = conflicts.filter(c => c.severity === 'Warning' || c.severity === 'Caution');

  return (
    <aside className="w-72 h-full bg-[#08130e] border-r border-[#163826] flex flex-col font-mono text-xs select-none">
      {/* 1. STCA Safety & Conflict Monitor Banner */}
      {criticalConflicts.length > 0 ? (
        <div className="p-2.5 bg-[#381111] border-b border-[#ff3344] text-[#ff3344] flex items-center gap-2 animate-pulse">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <div className="flex-1 text-[11px] font-bold leading-tight">
            LOSS OF SEPARATION DETECTED ({criticalConflicts.length})
          </div>
        </div>
      ) : warningConflicts.length > 0 ? (
        <div className="p-2 bg-[#2d220b] border-b border-[#ffb703] text-[#ffb703] flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <div className="flex-1 text-[11px] font-bold leading-tight">
            STCA CONVERGENCE WARNING ({warningConflicts.length})
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 bg-[#091610] border-b border-[#163826] flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-[#00ff66]">
            <Radio className="w-3.5 h-3.5" />
            <span className="font-semibold">SEPARATION NOMINAL</span>
          </div>
          <span className="text-[#3b6d4e]">3.0NM / 1000FT</span>
        </div>
      )}

      {/* 2. Active Conflict Details (if any) */}
      {conflicts.length > 0 && (
        <div className="p-2 bg-[#121c17] border-b border-[#163826] flex flex-col gap-1.5 max-h-36 overflow-y-auto">
          {conflicts.map((c, idx) => (
            <div
              key={idx}
              className={`p-1.5 rounded border text-[10px] ${
                c.severity === 'Critical'
                  ? 'bg-[#3b1212] border-[#ff3344] text-[#ffb4b4]'
                  : 'bg-[#2b200b] border-[#ffb703] text-[#ffe6a0]'
              }`}
            >
              <div className="flex items-center justify-between font-bold">
                <span>{c.callsign1} ↔ {c.callsign2}</span>
                <span>{c.currentHorizontalNM.toFixed(1)} NM · {c.currentVerticalFt} FT</span>
              </div>
              <div className="text-[9px] mt-0.5 opacity-90">
                {c.alertMessage}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Traffic List Header */}
      <div className="px-3 py-1.5 bg-[#0a1710] border-b border-[#163826] flex items-center justify-between text-[11px] text-[#4e8b69]">
        <span>ACTIVE SECTOR ({aircraftList.length})</span>
        <span>DIST / ALT</span>
      </div>

      {/* 4. Aircraft Items */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
        {aircraftList.length === 0 ? (
          <div className="p-4 text-center text-[#3b6d4e]">
            No aircraft in active radar sector
          </div>
        ) : (
          aircraftList.map(ac => {
            const isSelected = ac.id === selectedAircraftId;
            const distFromAirport = calculateDistance(ac.x, ac.y, 0, 0);

            const hasCritical = conflicts.some(
              c => (c.aircraft1Id === ac.id || c.aircraft2Id === ac.id) && c.severity === 'Critical'
            );
            const hasWarning = conflicts.some(
              c => (c.aircraft1Id === ac.id || c.aircraft2Id === ac.id) && c.severity === 'Warning'
            );

            return (
              <div
                key={ac.id}
                onClick={() => selectAircraft(ac.id)}
                className={`p-2 rounded border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-[#102b1d] border-[#00ff66] shadow-[0_0_8px_rgba(0,255,102,0.2)]'
                    : hasCritical
                    ? 'bg-[#3b1212] border-[#ff3344]'
                    : hasWarning
                    ? 'bg-[#2b200b] border-[#ffb703]'
                    : 'bg-[#0a1711] hover:bg-[#12281c] border-[#163826]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Plane className={`w-3 h-3 ${isSelected ? 'text-[#00ff66]' : 'text-[#4e8b69]'}`} />
                    <span className="font-bold text-white">{ac.callsign}</span>
                    <span className="text-[10px] text-[#4e8b69]">{ac.aircraftType}</span>
                  </div>

                  <span className={`text-[10px] font-semibold px-1 py-0.2 rounded ${
                    ac.status === 'Established' || ac.status === 'FinalApproach'
                      ? 'bg-[#00e5ff]/20 text-[#00e5ff]'
                      : 'bg-[#153322] text-[#85cca1]'
                  }`}>
                    {ac.status === 'FinalApproach' ? 'FINAL' : ac.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#85cca1]">
                  <div>
                    <span>HDG: <b className="text-white">{Math.round(ac.heading).toString().padStart(3, '0')}°</b></span>
                    {' · '}
                    <span>{Math.round(ac.indicatedAirspeed)}kt</span>
                  </div>

                  <div className="text-right">
                    <span className="font-semibold text-white">{distFromAirport.toFixed(1)} NM</span>
                    {' · '}
                    <span className="text-[#00ff66] font-bold">{Math.round(ac.altitude)}ft</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
