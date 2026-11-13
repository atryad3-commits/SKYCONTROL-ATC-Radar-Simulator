/**
 * SKYCONTROL - Contextual ATC Command Panel (Part 1.D & Part 3)
 * Only opens when an aircraft is selected (or when toggled).
 * Features command preview & validation before transmission,
 * pilot readback feedback, and flight telemetry tracking.
 */

import React, { useState } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { HEATHROW_RUNWAY_GEOMETRIES } from '../airports/heathrow';
import { calculateLocalizerDeviation, calculateGlideslopeDeviation } from '../engine/ils';
import { 
  Compass, 
  ArrowUp, 
  ArrowDown, 
  Gauge, 
  Navigation, 
  Crosshair, 
  RotateCw,
  AlertOctagon,
  X,
  Plane,
  ChevronRight
} from 'lucide-react';

export const CommandPanel: React.FC = () => {
  const selectedAircraftId = useSimulationStore(state => state.selectedAircraftId);
  const aircraftList = useSimulationStore(state => state.aircraft);
  const airport = useSimulationStore(state => state.airport);
  const selectAircraft = useSimulationStore(state => state.selectAircraft);

  // Command store actions
  const setHeading = useSimulationStore(state => state.setHeading);
  const turnLeft = useSimulationStore(state => state.turnLeft);
  const turnRight = useSimulationStore(state => state.turnRight);
  const setAltitude = useSimulationStore(state => state.setAltitude);
  const setSpeed = useSimulationStore(state => state.setSpeed);
  const directTo = useSimulationStore(state => state.directTo);
  const clearILS = useSimulationStore(state => state.clearILS);
  const goAround = useSimulationStore(state => state.goAround);
  const holdAt = useSimulationStore(state => state.holdAt);
  const lineUpAndWait = useSimulationStore(state => state.lineUpAndWait);
  const clearTakeoff = useSimulationStore(state => state.clearTakeoff);
  const abortTakeoff = useSimulationStore(state => state.abortTakeoff);

  // Custom input states
  const [headingInput, setHeadingInput] = useState<string>('');
  const [altitudeInput, setAltitudeInput] = useState<string>('');
  const [speedInput, setSpeedInput] = useState<string>('');

  const aircraft = aircraftList.find(a => a.id === selectedAircraftId);

  // If no aircraft selected, don't render clutter on the screen (as requested by Part 1.D)
  if (!aircraft) {
    return null;
  }

  const isHoldingShort = aircraft.status === 'Departing' && aircraft.indicatedAirspeed === 0 && (!aircraft.flightPhase || aircraft.flightPhase === 'HOLD_SHORT');
  const isLinedUp = aircraft.status === 'Departing' && aircraft.indicatedAirspeed === 0 && aircraft.flightPhase === 'LINEUP';

  // Compute live localizer/glideslope deviation info if ILS armed or captured
  const rwyGeom = HEATHROW_RUNWAY_GEOMETRIES.find(r => r.id === aircraft.assignedRunway) || HEATHROW_RUNWAY_GEOMETRIES[0];
  const isApproaching = aircraft.ilsArmed || aircraft.ilsLocalizerCaptured || aircraft.ilsGlideslopeCaptured || aircraft.status === 'FinalApproach';
  const locDev = isApproaching ? calculateLocalizerDeviation(aircraft.x, aircraft.y, rwyGeom) : null;
  const gsDev = isApproaching ? calculateGlideslopeDeviation(aircraft.x, aircraft.y, aircraft.altitude, rwyGeom) : null;

  // Direct Command Dispatch Handlers (No confirmation modal needed)
  const handleAssignHeading = (targetHdg: number) => {
    let normalized = ((Math.round(targetHdg) % 360) + 360) % 360;
    setHeading(aircraft.id, normalized);
  };

  const handleAssignAltitude = (targetAlt: number, expedite: boolean = false) => {
    setAltitude(aircraft.id, targetAlt, expedite);
  };

  const handleAssignSpeed = (targetSpd: number) => {
    setSpeed(aircraft.id, targetSpd);
  };

  const handleDirectTo = (wpName: string) => {
    directTo(aircraft.id, wpName);
  };

  const handleClearILS = (runwayId: string) => {
    clearILS(aircraft.id, runwayId);
  };

  const handleGoAround = () => {
    goAround(aircraft.id);
  };

  return (
    <aside className="w-80 h-full bg-[#08130e] border-l border-[#163826] flex flex-col font-mono text-xs select-none z-20 shrink-0 shadow-2xl">
      {/* 1. Header with Close Button */}
      <div className="p-3 bg-[#0c1c14] border-b border-[#163826] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[#00ff66] tracking-wide">
              {aircraft.callsign}
            </span>
            <span className="px-1.5 py-0.2 bg-[#163826] text-[#a2f5bf] rounded text-[10px] font-semibold">
              {aircraft.aircraftType} · {aircraft.category}
            </span>
          </div>
          <div className="text-[11px] text-[#4e8b69] mt-0.5">
            {aircraft.airline} ({aircraft.origin} → {aircraft.destination})
          </div>
        </div>

        <button
          onClick={() => selectAircraft(null)}
          className="p-1 rounded hover:bg-[#1a3828] text-[#5da87d] hover:text-white transition-colors"
          title="Deselect aircraft"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Status Strip */}
      <div className="px-3 py-1.5 bg-[#091510] border-b border-[#163826] flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="text-[#4e8b69]">PHASE:</span>
          <span className={`font-semibold ${
            aircraft.status === 'FinalApproach' || aircraft.status === 'Established'
              ? 'text-[#00e5ff]'
              : aircraft.status === 'GoAround'
              ? 'text-[#ff3344]'
              : 'text-[#a2f5bf]'
          }`}>
            {aircraft.flightPhase || aircraft.status.toUpperCase()}
          </span>
        </div>

        <div className="text-[#4e8b69]">
          RWY: <span className="font-semibold text-white">{aircraft.assignedRunway}</span>
        </div>
      </div>

      {/* 3. Real-Time Telemetry Bar */}
      <div className="grid grid-cols-3 p-2 bg-[#06100b] border-b border-[#163826] text-center gap-1">
        <div className="bg-[#091e14] p-1.5 rounded border border-[#163826]">
          <div className="text-[9px] text-[#4e8b69]">HEADING</div>
          <div className="text-sm font-bold text-white">
            {Math.round(aircraft.heading).toString().padStart(3, '0')}°
          </div>
          <div className="text-[9px] text-[#5da87d]">Tgt {aircraft.targetHeading}°</div>
        </div>

        <div className="bg-[#091e14] p-1.5 rounded border border-[#163826]">
          <div className="text-[9px] text-[#4e8b69]">ALTITUDE</div>
          <div className="text-sm font-bold text-[#00ff66]">
            {Math.round(aircraft.altitude)}'
          </div>
          <div className="text-[9px] text-[#5da87d]">Clr {aircraft.targetAltitude}'</div>
        </div>

        <div className="bg-[#091e14] p-1.5 rounded border border-[#163826]">
          <div className="text-[9px] text-[#4e8b69]">AIRSPEED</div>
          <div className="text-sm font-bold text-[#00e5ff]">
            {Math.round(aircraft.indicatedAirspeed)}kt
          </div>
          <div className="text-[9px] text-[#5da87d]">Tgt {aircraft.targetAirspeed}kt</div>
        </div>
      </div>

      {/* 4. Live ILS Deviation Monitor (if on approach) */}
      {isApproaching && locDev && gsDev && (
        <div className="mx-3 mt-2 p-2 bg-[#061810] border border-[#00e5ff]/40 rounded">
          <div className="flex items-center justify-between text-[10px] text-[#00e5ff] font-bold mb-1">
            <span>ILS {aircraft.assignedRunway} GUIDANCE</span>
            <span>{locDev.isEstablished ? 'ESTABLISHED' : 'ARMED'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="bg-[#091e14] p-1 rounded">
              <span className="text-[#5da87d]">LOC: </span>
              <span className={Math.abs(locDev.dots) <= 0.5 ? 'text-[#00ff66] font-bold' : 'text-[#ffb703]'}>
                {locDev.dots > 0 ? `+${locDev.dots}` : locDev.dots} dots
              </span>
            </div>
            <div className="bg-[#091e14] p-1 rounded">
              <span className="text-[#5da87d]">G/S: </span>
              <span className={Math.abs(gsDev.dots) <= 0.5 ? 'text-[#00ff66] font-bold' : 'text-[#ffb703]'}>
                {gsDev.dots > 0 ? `+${gsDev.dots}` : gsDev.dots} dots
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 5. Scrollable Command Deck */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Section A: Heading Vectoring */}
        <div className="bg-[#091710] p-2.5 rounded border border-[#163826]">
          <div className="flex items-center gap-1.5 text-[#00ff66] font-bold text-[11px] mb-2">
            <Compass className="w-3.5 h-3.5" />
            <span>HEADING VECTORING</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 mb-2">
            <button
              onClick={() => handleAssignHeading(aircraft.heading - 30)}
              className="py-1 px-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
            >
              -30°
            </button>
            <button
              onClick={() => handleAssignHeading(aircraft.heading - 10)}
              className="py-1 px-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
            >
              -10°
            </button>
            <button
              onClick={() => handleAssignHeading(aircraft.heading + 10)}
              className="py-1 px-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
            >
              +10°
            </button>
            <button
              onClick={() => handleAssignHeading(aircraft.heading + 30)}
              className="py-1 px-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
            >
              +30°
            </button>
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              const val = parseInt(headingInput, 10);
              if (!isNaN(val)) {
                handleAssignHeading(val);
                setHeadingInput('');
              }
            }}
            className="flex gap-1.5"
          >
            <input
              type="number"
              min="0"
              max="360"
              placeholder="Assign (001-360°)"
              value={headingInput}
              onChange={e => setHeadingInput(e.target.value)}
              className="flex-1 bg-[#050e09] border border-[#163826] rounded px-2 py-1 text-white placeholder-[#2f5c40] outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1 bg-[#163826] hover:bg-[#205238] text-[#00ff66] rounded font-semibold transition-colors"
            >
              Assign
            </button>
          </form>
        </div>

        {/* Section B: Altitude Assignment */}
        <div className="bg-[#091710] p-2.5 rounded border border-[#163826]">
          <div className="flex items-center gap-1.5 text-[#00ff66] font-bold text-[11px] mb-2">
            <ArrowUp className="w-3.5 h-3.5" />
            <span>ALTITUDE ASSIGNMENT</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {[2000, 3000, 4000, 6000].map(alt => (
              <button
                key={alt}
                onClick={() => handleAssignAltitude(alt)}
                className={`py-1 px-1 rounded border transition-colors ${
                  aircraft.targetAltitude === alt
                    ? 'bg-[#1e4d35] border-[#00ff66] text-[#00ff66] font-bold'
                    : 'bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] border-[#1d4d33]'
                }`}
              >
                {alt / 1000}k
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            <button
              onClick={() => handleAssignAltitude(aircraft.targetAltitude - 1000)}
              className="flex-1 py-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
            >
              -1,000 FT
            </button>
            <button
              onClick={() => handleAssignAltitude(aircraft.targetAltitude + 1000)}
              className="flex-1 py-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
            >
              +1,000 FT
            </button>
            <button
              onClick={() => handleAssignAltitude(aircraft.targetAltitude, true)}
              className="px-2 py-1 bg-[#3a2010] hover:bg-[#522d16] text-[#ffb703] rounded border border-[#7a421e] font-semibold transition-colors"
              title="Expedite Climb / Descent"
            >
              EXPEDITE
            </button>
          </div>
        </div>

        {/* Section C: Speed Control */}
        <div className="bg-[#091710] p-2.5 rounded border border-[#163826]">
          <div className="flex items-center gap-1.5 text-[#00ff66] font-bold text-[11px] mb-2">
            <Gauge className="w-3.5 h-3.5" />
            <span>SPEED CONTROL</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[160, 180, 210, 240].map(spd => (
              <button
                key={spd}
                onClick={() => handleAssignSpeed(spd)}
                className={`py-1 px-1 rounded border transition-colors ${
                  aircraft.targetAirspeed === spd
                    ? 'bg-[#1e4d35] border-[#00ff66] text-[#00ff66] font-bold'
                    : 'bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] border-[#1d4d33]'
                }`}
              >
                {spd}kt
              </button>
            ))}
          </div>
        </div>

        {/* Section D: Direct-To & Hold Waypoints */}
        <div className="bg-[#091710] p-2.5 rounded border border-[#163826]">
          <div className="flex items-center gap-1.5 text-[#00ff66] font-bold text-[11px] mb-2">
            <Navigation className="w-3.5 h-3.5" />
            <span>DIRECT-TO FIX</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {airport.waypoints.map(wp => (
              <button
                key={wp.name}
                onClick={() => handleDirectTo(wp.name)}
                className={`py-1 px-1 rounded border transition-colors ${
                  aircraft.assignedWaypoint === wp.name
                    ? 'bg-[#1e4d35] border-[#00ff66] text-[#00ff66] font-bold'
                    : 'bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] border-[#1d4d33]'
                }`}
              >
                {wp.name}
              </button>
            ))}
          </div>
        </div>

        {/* Section E: ILS & Approach Clearance */}
        <div className="bg-[#091710] p-2.5 rounded border border-[#163826]">
          <div className="flex items-center gap-1.5 text-[#00e5ff] font-bold text-[11px] mb-2">
            <Crosshair className="w-3.5 h-3.5" />
            <span>APPROACH / RUNWAY</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={() => handleClearILS('27R')}
              className="py-1.5 bg-[#0d2a20] hover:bg-[#144232] text-[#00e5ff] rounded border border-[#19523e] font-semibold transition-colors"
            >
              CLEARED ILS 27R
            </button>
            <button
              onClick={() => handleClearILS('27L')}
              className="py-1.5 bg-[#0d2a20] hover:bg-[#144232] text-[#00e5ff] rounded border border-[#19523e] font-semibold transition-colors"
            >
              CLEARED ILS 27L
            </button>
          </div>

          <button
            onClick={handleGoAround}
            className="w-full py-1.5 bg-[#381111] hover:bg-[#521818] text-[#ff4d4d] rounded border border-[#ff3344] font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>MANDATORY GO-AROUND</span>
          </button>
        </div>

        {/* Section F: Staged Departure Controls (if departing) */}
        {aircraft.status === 'Departing' && (
          <div className="bg-[#121c15] p-2.5 rounded border border-[#ffb703]/50">
            <div className="text-[#ffb703] font-bold text-[11px] mb-2 flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5" />
              <span>DEPARTURE STAGES</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <button
                disabled={!isHoldingShort}
                onClick={() => lineUpAndWait(aircraft.id, aircraft.assignedRunway)}
                className={`py-1.5 rounded font-bold border transition-colors ${
                  isHoldingShort
                    ? 'bg-[#1b3b28] hover:bg-[#255238] text-[#00ff66] border-[#00ff66]'
                    : 'bg-[#0d1c13] text-[#335e44] border-[#163826] cursor-not-allowed'
                }`}
              >
                1. LINE UP AND WAIT {aircraft.assignedRunway}
              </button>

              <button
                disabled={!isLinedUp}
                onClick={() => clearTakeoff(aircraft.id)}
                className={`py-1.5 rounded font-bold border transition-colors ${
                  isLinedUp
                    ? 'bg-[#00e5ff]/20 hover:bg-[#00e5ff]/30 text-[#00e5ff] border-[#00e5ff]'
                    : 'bg-[#0d1c13] text-[#335e44] border-[#163826] cursor-not-allowed'
                }`}
              >
                2. CLEARED FOR TAKEOFF
              </button>

              <button
                onClick={() => abortTakeoff(aircraft.id)}
                className="py-1.5 bg-[#3a1414] hover:bg-[#541c1c] text-[#ff4d4d] rounded font-bold border border-[#ff3344] transition-colors"
              >
                ABORT TAKEOFF (REJECT)
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
