/**
 * SKYCONTROL - Electronic Flight Progress Strips Bay
 * Displays authentic ATC flight progress strips with quick selection,
 * cleared levels, squawk codes, and route information.
 */

import React, { useState } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { Plane, PlaneLanding, PlaneTakeoff, ShieldAlert } from 'lucide-react';

export const FlightStrips: React.FC = () => {
  const aircraftList = useSimulationStore(state => state.aircraft);
  const selectedAircraftId = useSimulationStore(state => state.selectedAircraftId);
  const selectAircraft = useSimulationStore(state => state.selectAircraft);
  const conflicts = useSimulationStore(state => state.conflicts);

  const [stripFilter, setStripFilter] = useState<'all' | 'arrivals' | 'departures'>('all');

  const filteredList = aircraftList.filter(ac => {
    if (stripFilter === 'arrivals') return ac.status !== 'Departing' && ac.status !== 'Outbound';
    if (stripFilter === 'departures') return ac.status === 'Departing' || ac.status === 'Outbound';
    return true;
  });

  return (
    <div className="h-34 bg-[#07100b] border-t border-[#163826] flex flex-col font-mono text-xs select-none shrink-0 z-20">
      {/* Strip Bay Header with Filter Tabs */}
      <div className="h-7 px-3 bg-[#0a1710] border-b border-[#163826] flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-3">
          <span className="font-bold text-[#00ff66] flex items-center gap-1.5">
            <Plane className="w-3.5 h-3.5" />
            <span>FLIGHT PROGRESS STRIPS</span>
          </span>

          <div className="flex items-center bg-[#07120c] p-0.5 rounded border border-[#163826]">
            <button
              onClick={() => setStripFilter('all')}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                stripFilter === 'all'
                  ? 'bg-[#194029] text-[#00ff66]'
                  : 'text-[#569871] hover:text-[#a2f5bf]'
              }`}
            >
              All ({aircraftList.length})
            </button>
            <button
              onClick={() => setStripFilter('arrivals')}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                stripFilter === 'arrivals'
                  ? 'bg-[#194029] text-[#00ff66]'
                  : 'text-[#569871] hover:text-[#a2f5bf]'
              }`}
            >
              Arrivals ({aircraftList.filter(a => a.status !== 'Departing' && a.status !== 'Outbound').length})
            </button>
            <button
              onClick={() => setStripFilter('departures')}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                stripFilter === 'departures'
                  ? 'bg-[#194029] text-[#00ff66]'
                  : 'text-[#569871] hover:text-[#a2f5bf]'
              }`}
            >
              Departures ({aircraftList.filter(a => a.status === 'Departing' || a.status === 'Outbound').length})
            </button>
          </div>
        </div>

        <div className="text-[10px] text-[#4e8b69] hidden md:block">
          Click any strip to lock radar vector commands
        </div>
      </div>

      {/* Horizontal Scrollable Strips Rack */}
      <div className="flex-1 p-2 flex items-center gap-2 overflow-x-auto overflow-y-hidden">
        {filteredList.length === 0 ? (
          <div className="text-[#3b6d4e] text-xs px-4">No active flight strips in this bay</div>
        ) : (
          filteredList.map(ac => {
            const isSelected = ac.id === selectedAircraftId;
            const hasConflict = conflicts.some(
              c => (c.aircraft1Id === ac.id || c.aircraft2Id === ac.id) && c.severity === 'Critical'
            );
            const hasWarning = conflicts.some(
              c => (c.aircraft1Id === ac.id || c.aircraft2Id === ac.id) && c.severity === 'Warning'
            );

            // Strip background styling based on flight status
            const isArrival = ac.status !== 'Departing' && ac.status !== 'Outbound';

            return (
              <div
                key={ac.id}
                onClick={() => selectAircraft(ac.id)}
                className={`w-64 h-22 shrink-0 p-2 rounded cursor-pointer border transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#0f2d1e] border-[#00ff66] shadow-[0_0_10px_rgba(0,255,102,0.25)]'
                    : hasConflict
                    ? 'bg-[#2b1212] border-[#ff3344] animate-pulse'
                    : hasWarning
                    ? 'bg-[#2b210f] border-[#ffb703]'
                    : isArrival
                    ? 'bg-[#0b1c13] hover:bg-[#12281c] border-[#163826]'
                    : 'bg-[#0c1824] hover:bg-[#132438] border-[#1d3854]'
                }`}
              >
                {/* Strip Row 1: Callsign, Type, Squawk */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {isArrival ? (
                      <PlaneLanding className="w-3.5 h-3.5 text-[#00ff66]" />
                    ) : (
                      <PlaneTakeoff className="w-3.5 h-3.5 text-[#00e5ff]" />
                    )}
                    <span className="font-bold text-sm text-white">{ac.callsign}</span>
                    <span className="text-[10px] text-[#70b88d]">
                      {ac.aircraftType}{ac.category === 'Heavy' ? '/H' : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {hasConflict && (
                      <ShieldAlert className="w-3.5 h-3.5 text-[#ff3344] animate-bounce" />
                    )}
                    <span className="text-[10px] bg-[#14261c] px-1.5 py-0.5 rounded text-[#00e5ff] font-bold">
                      {ac.transponder}
                    </span>
                  </div>
                </div>

                {/* Strip Row 2: Route, Altitude Status */}
                <div className="flex items-center justify-between text-[11px] text-[#a2f5bf]">
                  <div>
                    <span className="text-[#558a6a]">{ac.origin}</span> → <span className="text-white font-semibold">{ac.destination}</span>
                  </div>

                  <div>
                    <span className="text-[#558a6a]">FL:</span>{' '}
                    <span className="font-bold text-white">{Math.round(ac.altitude / 100).toString().padStart(3, '0')}</span>
                    {' → '}
                    <span className="font-bold text-[#00ff66]">c{Math.round(ac.targetAltitude / 100).toString().padStart(3, '0')}</span>
                  </div>
                </div>

                {/* Strip Row 3: Heading, Speed, Assigned Runway & Status */}
                <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[#173324]">
                  <div className="flex items-center gap-2 text-[#85cca1]">
                    <span>HDG: <b className="text-white">{Math.round(ac.targetHeading).toString().padStart(3, '0')}°</b></span>
                    <span>SPD: <b className="text-white">{Math.round(ac.indicatedAirspeed)}kt</b></span>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="px-1 py-0.2 bg-[#122e1e] text-[#00ff66] rounded font-semibold">
                      {ac.assignedRunway}
                    </span>
                    <span className={`px-1 py-0.2 rounded font-semibold ${
                      ac.status === 'Established' || ac.status === 'FinalApproach'
                        ? 'bg-[#00e5ff]/20 text-[#00e5ff]'
                        : ac.status === 'GoAround'
                        ? 'bg-[#ff3344]/20 text-[#ff3344]'
                        : ac.flightPhase === 'TAKEOFF_ROLL' || ac.flightPhase === 'ROTATION'
                        ? 'bg-[#ffb703]/20 text-[#ffb703]'
                        : 'bg-[#183624] text-[#a2f5bf]'
                    }`}>
                      {ac.flightPhase || (ac.status === 'FinalApproach' ? 'FINAL' : ac.status)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
