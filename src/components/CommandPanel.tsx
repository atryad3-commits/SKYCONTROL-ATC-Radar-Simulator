/**
 * SKYCONTROL - Contextual ATC Command & Routing Panel
 * Comprehensive vectoring deck with stacked incremental turns, custom altitude/speed entry,
 * multi-leg waypoint route builder, published holding patterns, live ILS geometry monitor,
 * and automated 30° final intercept vectoring.
 */

import React, { useState, useMemo } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { calculateLocalizerDeviation, calculateGlideslopeDeviation } from '../engine/ils';
import { calculateBearing, calculateDistance, getHeadingDelta } from '../engine/physics';
import {
  Compass,
  ArrowUp,
  Gauge,
  Navigation,
  Crosshair,
  AlertOctagon,
  AlertTriangle,
  X,
  Plane,
  RotateCw,
} from 'lucide-react';

type RoutingMode = 'DIRECT' | 'CHAIN' | 'HOLD';

export const CommandPanel: React.FC = () => {
  const selectedAircraftId = useSimulationStore(state => state.selectedAircraftId);
  const aircraftList = useSimulationStore(state => state.aircraft);
  const airport = useSimulationStore(state => state.airport);
  const activeRunwayGeometries = useSimulationStore(state => state.activeRunwayGeometries);
  const activeLandingRunwayId = useSimulationStore(state => state.activeLandingRunwayId);
  const selectAircraft = useSimulationStore(state => state.selectAircraft);

  // Command store actions
  const setHeading = useSimulationStore(state => state.setHeading);
  const presentHeading = useSimulationStore(state => state.presentHeading);
  const turnLeft = useSimulationStore(state => state.turnLeft);
  const turnRight = useSimulationStore(state => state.turnRight);
  const setAltitude = useSimulationStore(state => state.setAltitude);
  const setSpeed = useSimulationStore(state => state.setSpeed);
  const directTo = useSimulationStore(state => state.directTo);
  const appendWaypointRoute = useSimulationStore(state => state.appendWaypointRoute);
  const clearRoute = useSimulationStore(state => state.clearRoute);
  const assignRunway = useSimulationStore(state => state.assignRunway);
  const vectorToIntercept = useSimulationStore(state => state.vectorToIntercept);
  const clearILS = useSimulationStore(state => state.clearILS);
  const goAround = useSimulationStore(state => state.goAround);
  const holdAt = useSimulationStore(state => state.holdAt);
  const lineUpAndWait = useSimulationStore(state => state.lineUpAndWait);
  const clearTakeoff = useSimulationStore(state => state.clearTakeoff);
  const abortTakeoff = useSimulationStore(state => state.abortTakeoff);

  // Local form & mode states
  const [headingInput, setHeadingInput] = useState<string>('');
  const [altitudeInput, setAltitudeInput] = useState<string>('');
  const [speedInput, setSpeedInput] = useState<string>('');
  const [routingMode, setRoutingMode] = useState<RoutingMode>('DIRECT');

  const aircraft = aircraftList.find(a => a.id === selectedAircraftId);

  const altitudePresets = useMemo(() => {
    const elev = airport.elevationFeet || 0;
    if (elev < 500) {
      return [2000, 3000, 4000, 6000];
    }
    const base = Math.ceil(elev / 1000) * 1000;
    return [base + 2000, base + 3000, base + 4000, base + 6000];
  }, [airport.elevationFeet]);

  const approachRunways = useMemo(() => {
    const activeFirst = [...airport.runways].sort((a, b) => {
      if (a.id === activeLandingRunwayId) return -1;
      if (b.id === activeLandingRunwayId) return 1;
      return 0;
    });
    return activeFirst.slice(0, 4);
  }, [airport.runways, activeLandingRunwayId]);

  if (!aircraft) {
    return null;
  }

  const isHoldingShort =
    aircraft.status === 'Departing' &&
    aircraft.indicatedAirspeed === 0 &&
    (!aircraft.flightPhase || aircraft.flightPhase === 'HOLD_SHORT');
  const isLinedUp =
    aircraft.status === 'Departing' &&
    aircraft.indicatedAirspeed === 0 &&
    aircraft.flightPhase === 'LINEUP';

  const rwyGeom =
    activeRunwayGeometries.find(r => r.id === aircraft.assignedRunway) ||
    activeRunwayGeometries[0];
  const isApproaching =
    aircraft.ilsArmed ||
    aircraft.ilsLocalizerCaptured ||
    aircraft.ilsGlideslopeCaptured ||
    aircraft.status === 'FinalApproach';
  const locDev =
    isApproaching && rwyGeom
      ? calculateLocalizerDeviation(aircraft.x, aircraft.y, rwyGeom)
      : null;
  const gsDev =
    isApproaching && rwyGeom
      ? calculateGlideslopeDeviation(aircraft.x, aircraft.y, aircraft.altitude, rwyGeom)
      : null;

  // Approach intercept geometry telemetry relative to assigned landing runway
  const distToRwyNM = rwyGeom
    ? calculateDistance(aircraft.x, aircraft.y, rwyGeom.threshold.x, rwyGeom.threshold.y)
    : 0;
  const brgToRwy = rwyGeom
    ? calculateBearing(aircraft.x, aircraft.y, rwyGeom.threshold.x, rwyGeom.threshold.y)
    : 0;
  const interceptOffsetDeg = rwyGeom
    ? Math.abs(Math.round(getHeadingDelta(rwyGeom.magneticHeading, aircraft.heading)))
    : 0;
  const courseAligned =
    rwyGeom &&
    distToRwyNM <= 18.5 &&
    interceptOffsetDeg <= 45 &&
    Math.abs(getHeadingDelta(rwyGeom.magneticHeading, brgToRwy)) <= 35;

  const activeRouteList = [
    ...(aircraft.assignedWaypoint ? [aircraft.assignedWaypoint] : []),
    ...(aircraft.routeQueue || []),
  ];

  const handleAssignHeading = (targetHdg: number) => {
    const normalized = ((Math.round(targetHdg) % 360) + 360) % 360;
    setHeading(aircraft.id, normalized);
  };

  const handleWaypointAction = (wpName: string) => {
    if (routingMode === 'HOLD') {
      holdAt(aircraft.id, wpName);
    } else if (routingMode === 'CHAIN') {
      appendWaypointRoute(aircraft.id, wpName);
    } else {
      directTo(aircraft.id, wpName);
    }
  };

  return (
    <aside className="w-80 h-full bg-[#08130e] border-l border-[#163826] flex flex-col font-mono text-xs select-none z-20 shrink-0 shadow-2xl">
      {/* 1. Header with Close Button */}
      <div className="p-3 bg-[#0c1c14] border-b border-[#163826] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`text-base font-bold tracking-wide ${
                aircraft.isEmergency ? 'text-[#ff4d4d]' : 'text-[#00ff66]'
              }`}
            >
              {aircraft.callsign}
            </span>
            <span className="text-[#4e8b69]">·</span>
            <span className="text-[10px] text-[#a2f5bf] font-semibold">
              {aircraft.aircraftType} · {aircraft.category}
            </span>
          </div>
          <div className="text-[11px] text-[#4e8b69] mt-0.5">
            {aircraft.airline} · {aircraft.origin} → {aircraft.destination}
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

      {/* Emergency Squawk 7700 Priority Callout */}
      {aircraft.isEmergency && (
        <div className="px-3 py-2 bg-[#361114] border-b border-[#ff3344]/60 flex items-center gap-2 text-[#ff6b6b]">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#ff3344]" />
          <div className="text-[11px] leading-snug">
            <span className="font-bold text-white">MAYDAY SQUAWK 7700</span>
            <span className="text-[#ffb3b8] block text-[10px]">
              {aircraft.emergencyType ? aircraft.emergencyType.replace('_', ' ') : 'EMERGENCY'} · PRIORITY RWY {activeLandingRunwayId}
            </span>
          </div>
        </div>
      )}

      {/* 2. Status Strip */}
      <div className="px-3 py-1.5 bg-[#091510] border-b border-[#163826] flex items-center justify-between text-[11px] tabular-nums">
        <div className="flex items-center gap-1.5">
          <span className="text-[#4e8b69]">PHASE:</span>
          <span
            className={`font-semibold ${
              aircraft.status === 'FinalApproach' || aircraft.status === 'Established'
                ? 'text-[#00e5ff]'
                : aircraft.status === 'Holding'
                ? 'text-[#ffd166]'
                : aircraft.status === 'GoAround' || aircraft.isEmergency
                ? 'text-[#ff3344]'
                : 'text-[#a2f5bf]'
            }`}
          >
            {aircraft.flightPhase || aircraft.status.toUpperCase()}
          </span>
        </div>

        <div className="text-[#4e8b69]">
          RWY: <span className="font-semibold text-white">{aircraft.assignedRunway}</span>
        </div>
      </div>

      {/* 3. Real-Time Telemetry Bar */}
      <div className="grid grid-cols-3 p-2 bg-[#06100b] border-b border-[#163826] text-center gap-1 tabular-nums">
        <div className="bg-[#091e14] p-1.5 rounded border border-[#163826]">
          <div className="text-[9px] text-[#4e8b69]">HEADING</div>
          <div className="text-sm font-bold text-white">
            {Math.round(aircraft.heading).toString().padStart(3, '0')}°
          </div>
          <div className="text-[9px] text-[#5da87d]">
            Tgt {Math.round(aircraft.targetHeading).toString().padStart(3, '0')}°
          </div>
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

      {/* 4. Live ILS Deviation Monitor */}
      {isApproaching && locDev && gsDev && (
        <div className="mx-3 mt-2 p-2 bg-[#061810] border border-[#00e5ff]/40 rounded">
          <div className="flex items-center justify-between text-[10px] text-[#00e5ff] font-bold mb-1">
            <span>ILS {aircraft.assignedRunway} GUIDANCE</span>
            <span>{locDev.isEstablished ? 'ESTABLISHED' : 'ARMED'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] tabular-nums">
            <div className="bg-[#091e14] p-1 rounded">
              <span className="text-[#5da87d]">LOC: </span>
              <span
                className={
                  Math.abs(locDev.dots) <= 0.5 ? 'text-[#00ff66] font-bold' : 'text-[#ffb703]'
                }
              >
                {locDev.dots > 0 ? `+${locDev.dots}` : locDev.dots} dots
              </span>
            </div>
            <div className="bg-[#091e14] p-1 rounded">
              <span className="text-[#5da87d]">G/S: </span>
              <span
                className={
                  Math.abs(gsDev.dots) <= 0.5 ? 'text-[#00ff66] font-bold' : 'text-[#ffb703]'
                }
              >
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
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[#00ff66] font-bold text-[11px]">
              <Compass className="w-3.5 h-3.5" />
              <span>HEADING VECTORING</span>
            </div>
            <button
              onClick={() => presentHeading(aircraft.id)}
              className="px-1.5 py-0.5 bg-[#0f2b1d] hover:bg-[#19442e] text-[#9ce8be] border border-[#1d4d33] rounded text-[9px] font-semibold transition-colors"
              title="Cancel route & hold present heading"
            >
              HOLD HDG
            </button>
          </div>

          {/* Quick Cardinal Headings */}
          <div className="grid grid-cols-4 gap-1.5 mb-2 text-[10px]">
            {[
              { label: '360° N', hdg: 360 },
              { label: '090° E', hdg: 90 },
              { label: '180° S', hdg: 180 },
              { label: '270° W', hdg: 270 },
            ].map(card => (
              <button
                key={card.label}
                onClick={() => handleAssignHeading(card.hdg)}
                className={`py-1 px-1 rounded border transition-colors font-semibold ${
                  Math.round(aircraft.targetHeading) === (card.hdg % 360) ||
                  (card.hdg === 360 && Math.round(aircraft.targetHeading) === 0)
                    ? 'bg-[#1e4d35] border-[#00ff66] text-[#00ff66]'
                    : 'bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] border-[#1d4d33]'
                }`}
              >
                {card.label}
              </button>
            ))}
          </div>

          {/* Incremental Steppers */}
          <div className="grid grid-cols-6 gap-1 mb-2 text-[10px]">
            <button
              onClick={() => turnLeft(aircraft.id, 30)}
              className="py-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
              title="Turn Left 30°"
            >
              -30°
            </button>
            <button
              onClick={() => turnLeft(aircraft.id, 10)}
              className="py-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
              title="Turn Left 10°"
            >
              -10°
            </button>
            <button
              onClick={() => turnLeft(aircraft.id, 5)}
              className="py-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
              title="Turn Left 5°"
            >
              -5°
            </button>
            <button
              onClick={() => turnRight(aircraft.id, 5)}
              className="py-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
              title="Turn Right 5°"
            >
              +5°
            </button>
            <button
              onClick={() => turnRight(aircraft.id, 10)}
              className="py-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
              title="Turn Right 10°"
            >
              +10°
            </button>
            <button
              onClick={() => turnRight(aircraft.id, 30)}
              className="py-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
              title="Turn Right 30°"
            >
              +30°
            </button>
          </div>

          {/* Interactive Heading Range Slider */}
          <div className="mb-2 bg-[#06100b] p-1.5 rounded border border-[#163826]">
            <div className="flex justify-between items-center text-[10px] text-[#5da87d] mb-1">
              <span>SCRUB HEADING</span>
              <span className="text-[#00ff66] font-bold">
                {Math.round(aircraft.targetHeading).toString().padStart(3, '0')}°
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="359"
              step="1"
              value={Math.round(aircraft.targetHeading)}
              onChange={e => handleAssignHeading(Number(e.target.value))}
              className="w-full accent-[#00ff66] bg-[#050e09] h-2 rounded cursor-pointer"
            />
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
              placeholder="Custom Hdg (001-360°)"
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

          <div className="grid grid-cols-4 gap-1.5 mb-2 tabular-nums">
            {altitudePresets.map(alt => (
              <button
                key={alt}
                onClick={() => setAltitude(aircraft.id, alt)}
                className={`py-1 px-1 rounded border transition-colors whitespace-nowrap ${
                  aircraft.targetAltitude === alt
                    ? 'bg-[#1e4d35] border-[#00ff66] text-[#00ff66] font-bold'
                    : 'bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] border-[#1d4d33]'
                }`}
              >
                {alt / 1000}k
              </button>
            ))}
          </div>

          <div className="grid grid-cols-5 gap-1 mb-2 text-[10px]">
            <button
              onClick={() => setAltitude(aircraft.id, aircraft.targetAltitude - 1000)}
              className="py-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
            >
              -1k
            </button>
            <button
              onClick={() => setAltitude(aircraft.id, aircraft.targetAltitude - 500)}
              className="py-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
            >
              -500
            </button>
            <button
              onClick={() => setAltitude(aircraft.id, aircraft.targetAltitude + 500)}
              className="py-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
            >
              +500
            </button>
            <button
              onClick={() => setAltitude(aircraft.id, aircraft.targetAltitude + 1000)}
              className="py-1 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] transition-colors"
            >
              +1k
            </button>
            <button
              onClick={() => setAltitude(aircraft.id, aircraft.targetAltitude, true)}
              className="py-1 bg-[#3a2010] hover:bg-[#522d16] text-[#ffb703] rounded border border-[#7a421e] font-semibold transition-colors"
              title="Expedite Climb / Descent"
            >
              EXP
            </button>
          </div>

          {/* Interactive Altitude Range Slider */}
          <div className="mb-2 bg-[#06100b] p-1.5 rounded border border-[#163826]">
            <div className="flex justify-between items-center text-[10px] text-[#5da87d] mb-1">
              <span>SCRUB ALTITUDE</span>
              <span className="text-[#00ff66] font-bold">
                {Math.round(aircraft.targetAltitude).toLocaleString()}'
              </span>
            </div>
            <input
              type="range"
              min={Math.max(1000, Math.ceil((airport.elevationFeet || 0) / 500) * 500)}
              max="15000"
              step="500"
              value={Math.round(aircraft.targetAltitude)}
              onChange={e => setAltitude(aircraft.id, Number(e.target.value))}
              className="w-full accent-[#00ff66] bg-[#050e09] h-2 rounded cursor-pointer"
            />
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              const val = parseInt(altitudeInput, 10);
              if (!isNaN(val)) {
                setAltitude(aircraft.id, val);
                setAltitudeInput('');
              }
            }}
            className="flex gap-1.5"
          >
            <input
              type="number"
              min={Math.ceil(airport.elevationFeet / 100) * 100}
              max="20000"
              step="500"
              placeholder="Custom Alt (ft)"
              value={altitudeInput}
              onChange={e => setAltitudeInput(e.target.value)}
              className="flex-1 bg-[#050e09] border border-[#163826] rounded px-2 py-1 text-white placeholder-[#2f5c40] outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1 bg-[#163826] hover:bg-[#205238] text-[#00ff66] rounded font-semibold transition-colors"
            >
              Set
            </button>
          </form>
        </div>

        {/* Section C: Speed Control */}
        <div className="bg-[#091710] p-2.5 rounded border border-[#163826]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[#00ff66] font-bold text-[11px]">
              <Gauge className="w-3.5 h-3.5" />
              <span>SPEED CONTROL</span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setSpeed(aircraft.id, aircraft.targetAirspeed - 10)}
                className="px-1.5 py-0.5 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] text-[10px]"
              >
                -10
              </button>
              <button
                onClick={() => setSpeed(aircraft.id, aircraft.targetAirspeed + 10)}
                className="px-1.5 py-0.5 bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] rounded border border-[#1d4d33] text-[10px]"
              >
                +10
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {[160, 180, 210, 240].map(spd => (
              <button
                key={spd}
                onClick={() => setSpeed(aircraft.id, spd)}
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

          {/* Interactive Speed Range Slider */}
          <div className="mb-2 bg-[#06100b] p-1.5 rounded border border-[#163826]">
            <div className="flex justify-between items-center text-[10px] text-[#5da87d] mb-1">
              <span>SCRUB SPEED</span>
              <span className="text-[#00e5ff] font-bold">
                {Math.round(aircraft.targetAirspeed)} kt
              </span>
            </div>
            <input
              type="range"
              min="140"
              max="280"
              step="5"
              value={Math.round(aircraft.targetAirspeed)}
              onChange={e => setSpeed(aircraft.id, Number(e.target.value))}
              className="w-full accent-[#00e5ff] bg-[#050e09] h-2 rounded cursor-pointer"
            />
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              const val = parseInt(speedInput, 10);
              if (!isNaN(val)) {
                setSpeed(aircraft.id, val);
                setSpeedInput('');
              }
            }}
            className="flex gap-1.5"
          >
            <input
              type="number"
              min="140"
              max="280"
              step="5"
              placeholder="Speed (140-280kt)"
              value={speedInput}
              onChange={e => setSpeedInput(e.target.value)}
              className="flex-1 bg-[#050e09] border border-[#163826] rounded px-2 py-1 text-white placeholder-[#2f5c40] outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1 bg-[#163826] hover:bg-[#205238] text-[#00ff66] rounded font-semibold transition-colors"
            >
              Set
            </button>
          </form>
        </div>

        {/* Section D: Route Builder, Direct-To & Published Holds */}
        <div className="bg-[#091710] p-2.5 rounded border border-[#163826]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[#00ff66] font-bold text-[11px]">
              <Navigation className="w-3.5 h-3.5" />
              <span>ROUTE / HOLD FIX</span>
            </div>

            <div className="flex bg-[#050e09] rounded border border-[#163826] p-0.5 text-[9px]">
              {(['DIRECT', 'CHAIN', 'HOLD'] as RoutingMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setRoutingMode(mode)}
                  className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
                    routingMode === mode
                      ? mode === 'HOLD'
                        ? 'bg-[#362c0b] text-[#ffd166]'
                        : mode === 'CHAIN'
                        ? 'bg-[#0e3240] text-[#00e5ff]'
                        : 'bg-[#1b442d] text-[#00ff66]'
                      : 'text-[#4e8b69] hover:text-white'
                  }`}
                >
                  {mode === 'CHAIN' ? '+LEG' : mode}
                </button>
              ))}
            </div>
          </div>

          {/* Active Route / Holding Readout */}
          {(activeRouteList.length > 0 || aircraft.status === 'Holding') && (
            <div className="mb-2 px-2 py-1 bg-[#05100a] border border-[#1c4830] rounded flex items-center justify-between gap-2 text-[10px]">
              <div className="truncate text-[#ffd166] font-semibold">
                {aircraft.status === 'Holding'
                  ? `HOLD @ ${aircraft.holdingWaypoint} (${aircraft.holdingLeg})`
                  : activeRouteList.join(' ➔ ')}
              </div>
              <button
                onClick={() => clearRoute(aircraft.id)}
                className="text-[#ff6b6b] hover:text-white text-[9px] font-bold shrink-0"
                title="Cancel route & fly present heading"
              >
                CLEAR
              </button>
            </div>
          )}

          <div className="grid grid-cols-4 gap-1.5">
            {airport.waypoints.map(wp => {
              const isActiveFix = aircraft.assignedWaypoint === wp.name;
              const isQueued = (aircraft.routeQueue || []).includes(wp.name);
              const isHoldActive =
                aircraft.status === 'Holding' && aircraft.holdingWaypoint === wp.name;

              return (
                <button
                  key={wp.name}
                  onClick={() => handleWaypointAction(wp.name)}
                  className={`py-1 px-1 rounded border transition-colors flex flex-col items-center justify-center ${
                    isHoldActive
                      ? 'bg-[#3b2f0b] border-[#ffd166] text-[#ffd166] font-bold'
                      : isActiveFix
                      ? 'bg-[#1e4d35] border-[#00ff66] text-[#00ff66] font-bold'
                      : isQueued
                      ? 'bg-[#0f3440] border-[#00e5ff] text-[#00e5ff] font-semibold'
                      : routingMode === 'HOLD' && wp.isHoldingFix
                      ? 'bg-[#172112] hover:bg-[#2a3316] text-[#ffd166] border-[#424921]'
                      : 'bg-[#102a1c] hover:bg-[#1a442c] text-[#a2f5bf] border-[#1d4d33]'
                  }`}
                  title={
                    routingMode === 'HOLD'
                      ? `Enter hold at ${wp.name} (${wp.description})`
                      : routingMode === 'CHAIN'
                      ? `Append ${wp.name} leg`
                      : `Proceed direct ${wp.name} (${wp.description})`
                  }
                >
                  <span>{wp.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section E: Dynamic ILS, Runway Assignment & Final Intercept */}
        <div className="bg-[#091710] p-2.5 rounded border border-[#163826]">
          <div className="flex items-center justify-between text-[#00e5ff] font-bold text-[11px] mb-1.5">
            <div className="flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5" />
              <span>APPROACH / RUNWAY</span>
            </div>
            <span className="text-[10px] font-normal text-[#4e8b69]">
              ELEV {airport.elevationFeet}ft
            </span>
          </div>

          {/* Live ILS Capture Readiness Telemetry */}
          {aircraft.status !== 'Departing' && rwyGeom && (
            <div className="mb-2 px-2 py-1 bg-[#05100a] border border-[#163826] rounded flex items-center justify-between text-[10px] tabular-nums">
              <span className="text-[#6cb68d]">
                {distToRwyNM.toFixed(1)} NM · Δ{interceptOffsetDeg}°
              </span>
              <span
                className={`font-bold ${
                  aircraft.ilsLocalizerCaptured
                    ? 'text-[#00ff66]'
                    : courseAligned
                    ? 'text-[#00e5ff]'
                    : 'text-[#ffb703]'
                }`}
              >
                {aircraft.ilsLocalizerCaptured
                  ? 'LOC CAPTURED'
                  : courseAligned
                  ? 'CAPTURE READY'
                  : 'NEEDS VECTOR'}
              </span>
            </div>
          )}

          {/* Automated 30° ILS Intercept Vector */}
          {aircraft.status !== 'Departing' && (
            <button
              onClick={() => vectorToIntercept(aircraft.id, aircraft.assignedRunway)}
              className="w-full mb-2 py-1.5 bg-[#0b2f38] hover:bg-[#114552] text-[#00e5ff] rounded border border-[#00e5ff]/60 font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              title="Vector onto 30° ILS intercept course and clear approach"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>VECTOR TO FINAL ILS {aircraft.assignedRunway}</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {approachRunways.map(rwy => (
              <div key={rwy.id} className="flex gap-0.5">
                <button
                  onClick={() => clearILS(aircraft.id, rwy.id)}
                  className={`flex-1 py-1.5 px-1 rounded-l border font-semibold transition-colors whitespace-nowrap text-[10px] ${
                    aircraft.ilsArmed && aircraft.assignedRunway === rwy.id
                      ? 'bg-[#113d2e] border-[#00e5ff] text-white'
                      : rwy.id === activeLandingRunwayId
                      ? 'bg-[#0d2a20] hover:bg-[#144232] text-[#00e5ff] border-[#1f634a]'
                      : 'bg-[#091c15] hover:bg-[#123326] text-[#7ccfb0] border-[#163826]'
                  }`}
                  title={`Clear ILS approach Runway ${rwy.id}`}
                >
                  ILS {rwy.id}
                </button>
                <button
                  onClick={() => assignRunway(aircraft.id, rwy.id)}
                  className={`px-1.5 py-1.5 rounded-r border text-[9px] font-bold transition-colors ${
                    aircraft.assignedRunway === rwy.id && !aircraft.ilsArmed
                      ? 'bg-[#1b442d] border-[#00ff66] text-[#00ff66]'
                      : 'bg-[#07150e] hover:bg-[#102c1e] text-[#5da87d] border-[#163826]'
                  }`}
                  title={`Assign expectation Runway ${rwy.id} without arming ILS yet`}
                >
                  RWY
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => goAround(aircraft.id)}
            className="w-full py-1.5 bg-[#381111] hover:bg-[#521818] text-[#ff4d4d] rounded border border-[#ff3344] font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>MANDATORY GO-AROUND</span>
          </button>
        </div>

        {/* Section F: Staged Departure Controls */}
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

              {aircraft.indicatedAirspeed > 80 && (
                <button
                  onClick={() =>
                    setAltitude(
                      aircraft.id,
                      Math.ceil(airport.elevationFeet / 1000) * 1000 + 10000,
                      true
                    )
                  }
                  className="py-1.5 bg-[#0f2e24] hover:bg-[#184738] text-[#00ff66] rounded font-bold border border-[#1d5e46] transition-colors"
                >
                  CLIMB SID FL100+
                </button>
              )}

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
