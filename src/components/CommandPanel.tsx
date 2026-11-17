/**
 * SKYCONTROL - Contextual Right Vectoring Panel
 * Clean, hairline-divided ATC command deck organized into 3 tactical tabs:
 *   - Vector: Heading, Altitude, and Airspeed clearances
 *   - Route: Direct-To, Multi-Leg Route Builder, and Holding Patterns
 *   - Approach / Departure: ILS Intercepts, Runway Assignment, Go-Around, and Takeoff Stages
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { calculateLocalizerDeviation, calculateGlideslopeDeviation } from '../engine/ils';
import { calculateBearing, calculateDistance, getHeadingDelta } from '../engine/physics';
import {
  getAircraftClassPresets,
  getAircraftOperationalBounds,
  getAircraftPerformance,
} from '../engine/aircraftPerformance';
import { evaluateDepartureGates } from '../engine/takeoff';
import {
  AlertOctagon,
  AlertTriangle,
  X,
  RotateCw,
} from 'lucide-react';

type CommandTab = 'vector' | 'route' | 'approach';
type RoutingMode = 'DIRECT' | 'CHAIN' | 'HOLD';

export const CommandPanel: React.FC = () => {
  const selectedAircraftId = useSimulationStore(state => state.selectedAircraftId);
  const aircraftList = useSimulationStore(state => state.aircraft);
  const airport = useSimulationStore(state => state.airport);
  const activeRunwayGeometries = useSimulationStore(state => state.activeRunwayGeometries);
  const activeLandingRunwayId = useSimulationStore(state => state.activeLandingRunwayId);
  const selectAircraft = useSimulationStore(state => state.selectAircraft);
  const envelopeWarning = useSimulationStore(state => state.envelopeWarning);
  const clearEnvelopeWarning = useSimulationStore(state => state.clearEnvelopeWarning);

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
  const proceedDepartureOnExit = useSimulationStore(state => state.proceedDepartureOnExit);
  const handoffDeparture = useSimulationStore(state => state.handoffDeparture);

  const [activeTab, setActiveTab] = useState<CommandTab>('vector');
  const [routingMode, setRoutingMode] = useState<RoutingMode>('DIRECT');
  const [headingInput, setHeadingInput] = useState<string>('');
  const [altitudeInput, setAltitudeInput] = useState<string>('');
  const [speedInput, setSpeedInput] = useState<string>('');

  const aircraft = aircraftList.find(a => a.id === selectedAircraftId);

  // Default to Departure tab when selecting a departure flight, else Vector
  useEffect(() => {
    if (!aircraft) return;
    const isDep = aircraft.status === 'Departing' || aircraft.status === 'Outbound';
    if (isDep) {
      setActiveTab('approach');
    } else if (activeTab === 'approach' && !isDep && !aircraft.ilsArmed) {
      setActiveTab('vector');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraft?.id]);

  const modelPerf = useMemo(
    () => (aircraft ? getAircraftPerformance(aircraft.aircraftType) : null),
    [aircraft?.aircraftType]
  );

  const modelBounds = useMemo(
    () =>
      aircraft
        ? getAircraftOperationalBounds(aircraft.aircraftType, airport.elevationFeet || 0)
        : null,
    [aircraft?.aircraftType, airport.elevationFeet]
  );

  const { speedPresetsKt, altitudePresetsFt } = useMemo(() => {
    if (!aircraft) {
      return { speedPresetsKt: [160, 190, 220, 250], altitudePresetsFt: [2000, 3000, 4000, 6000] };
    }
    return getAircraftClassPresets(aircraft.aircraftType, airport.elevationFeet || 0);
  }, [aircraft?.aircraftType, airport.elevationFeet]);

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

  const isDepartureFlight =
    aircraft.status === 'Departing' || aircraft.status === 'Outbound';
  const isHoldingShort =
    aircraft.status === 'Departing' &&
    aircraft.indicatedAirspeed === 0 &&
    (!aircraft.flightPhase || aircraft.flightPhase === 'HOLD_SHORT');
  const isLinedUp =
    aircraft.status === 'Departing' &&
    aircraft.indicatedAirspeed === 0 &&
    aircraft.flightPhase === 'LINEUP';
  const departureGates = isDepartureFlight
    ? evaluateDepartureGates(aircraft, airport.elevationFeet || 0, airport.waypoints)
    : null;

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
    <aside className="w-76 h-full bg-[#07110c] border-l border-[#163826] flex flex-col font-mono text-xs select-none z-20 shrink-0">
      {/* 1. Flight Identity Header */}
      <div className="px-3.5 py-3 bg-[#0a1710] border-b border-[#163826] flex items-start justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-base font-bold tracking-wide ${
                aircraft.isEmergency ? 'text-[#ff4d4d]' : 'text-[#00ff66]'
              }`}
            >
              {aircraft.callsign}
            </span>
            <span className="text-[11px] text-[#85cca1]">
              {aircraft.aircraftType} · {modelPerf?.classLabel || aircraft.category}
            </span>
          </div>
          <div className="text-[11px] text-[#558f6e] truncate mt-0.5">
            {aircraft.airline} · {aircraft.origin} → {aircraft.destination} · RWY {aircraft.assignedRunway}
          </div>
          {modelBounds && modelPerf && (
            <div className="text-[10px] text-[#45785b] tabular-nums mt-0.5 truncate">
              ENV {modelBounds.minSpeedKt}–{modelBounds.maxSpeedKt} kt · MAX{' '}
              {modelBounds.maxAltitudeFt.toLocaleString()} ft · Vref {modelPerf.typicalApproachSpeedIAS} kt
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => selectAircraft(null)}
          className="p-1 rounded hover:bg-[#143322] text-[#5da87d] hover:text-white transition-colors shrink-0"
          title="Deselect aircraft"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Emergency Squawk 7700 Callout */}
      {aircraft.isEmergency && (
        <div className="px-3.5 py-2 bg-[#361114] border-b border-[#ff3344]/60 flex items-center gap-2 text-[#ff6b6b] shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#ff3344]" />
          <div className="text-[11px] leading-snug">
            <span className="font-bold text-white">MAYDAY SQUAWK 7700</span>
            <span className="text-[#ffb3b8] block text-[10px]">
              {aircraft.emergencyType ? aircraft.emergencyType.replace('_', ' ') : 'EMERGENCY'} · PRIORITY RWY{' '}
              {activeLandingRunwayId}
            </span>
          </div>
        </div>
      )}

      {/* Soft-Limit Envelope Advisory Warning */}
      {envelopeWarning && envelopeWarning.aircraftId === aircraft.id && (
        <div className="px-3.5 py-2 bg-[#2a200b] border-b border-[#ffb703]/60 flex items-start justify-between gap-2 text-[#ffd166] shrink-0">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#ffb703] mt-0.5" />
            <span className="text-[10px] leading-snug tabular-nums">
              {envelopeWarning.message}
            </span>
          </div>
          <button
            type="button"
            onClick={clearEnvelopeWarning}
            className="text-[#ffb703] hover:text-white shrink-0"
            title="Dismiss warning"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Hairline Telemetry Readout Bar */}
      <div className="grid grid-cols-3 divide-x divide-[#143020] bg-[#060f0a] border-b border-[#163826] text-center py-2 tabular-nums shrink-0">
        <div>
          <div className="text-[9px] text-[#4e8b69]">HDG</div>
          <div className="text-sm font-bold text-white">
            {Math.round(aircraft.heading).toString().padStart(3, '0')}°
          </div>
          <div className="text-[10px] text-[#5da87d]">
            {Math.round(aircraft.targetHeading).toString().padStart(3, '0')}°
          </div>
        </div>

        <div>
          <div className="text-[9px] text-[#4e8b69]">ALT</div>
          <div className="text-sm font-bold text-[#00ff66]">{Math.round(aircraft.altitude)}'</div>
          <div className="text-[10px] text-[#5da87d]">{aircraft.targetAltitude}'</div>
        </div>

        <div>
          <div className="text-[9px] text-[#4e8b69]">IAS</div>
          <div className="text-sm font-bold text-[#00e5ff]">
            {Math.round(aircraft.indicatedAirspeed)}kt
          </div>
          <div className="text-[10px] text-[#5da87d]">{aircraft.targetAirspeed}kt</div>
        </div>
      </div>

      {/* 3. Contextual Tab Switcher */}
      <div className="grid grid-cols-3 bg-[#09150f] border-b border-[#163826] text-[11px] shrink-0">
        {(
          [
            { id: 'vector', label: 'Vector' },
            { id: 'route', label: 'Route' },
            {
              id: 'approach',
              label: isDepartureFlight ? 'Departure' : 'Approach',
            },
          ] as const
        ).map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 border-b-2 transition-colors ${
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

      {/* 4. Scrollable Active Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'vector' && (
          <div className="divide-y divide-[#122e1f]">
            {/* Heading Section */}
            <div className="p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#00ff66]">HEADING</span>
                <button
                  type="button"
                  onClick={() => presentHeading(aircraft.id)}
                  className="px-2 py-0.5 bg-[#0e2619] hover:bg-[#163d28] text-[#9de8bc] border border-[#1d4d33] rounded text-[10px] transition-colors"
                  title="Cancel route & hold present heading"
                >
                  Hold Hdg
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1 text-[10px]">
                {[
                  { label: '360°', hdg: 360 },
                  { label: '090°', hdg: 90 },
                  { label: '180°', hdg: 180 },
                  { label: '270°', hdg: 270 },
                ].map(card => {
                  const isActive =
                    Math.round(aircraft.targetHeading) === card.hdg % 360 ||
                    (card.hdg === 360 && Math.round(aircraft.targetHeading) === 0);
                  return (
                    <button
                      type="button"
                      key={card.label}
                      onClick={() => handleAssignHeading(card.hdg)}
                      className={`py-1 rounded border font-semibold transition-colors ${
                        isActive
                          ? 'bg-[#19442d] border-[#00ff66] text-[#00ff66]'
                          : 'bg-[#0b1f15] hover:bg-[#133322] text-[#a2f5bf] border-[#19402b]'
                      }`}
                    >
                      {card.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-6 gap-1 text-[10px]">
                {[-30, -10, -5, 5, 10, 30].map(delta => (
                  <button
                    type="button"
                    key={delta}
                    onClick={() =>
                      delta < 0
                        ? turnLeft(aircraft.id, Math.abs(delta))
                        : turnRight(aircraft.id, delta)
                    }
                    className="py-1 bg-[#0b1f15] hover:bg-[#133322] text-[#a2f5bf] rounded border border-[#19402b] transition-colors"
                  >
                    {delta > 0 ? `+${delta}°` : `${delta}°`}
                  </button>
                ))}
              </div>

              <input
                type="range"
                min="0"
                max="359"
                step="1"
                value={Math.round(aircraft.targetHeading)}
                onChange={e => handleAssignHeading(Number(e.target.value))}
                className="w-full accent-[#00ff66] bg-[#050e09] h-1.5 rounded cursor-pointer"
              />

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
                  placeholder="Heading (001-360°)"
                  value={headingInput}
                  onChange={e => setHeadingInput(e.target.value)}
                  className="flex-1 bg-[#050d09] border border-[#163826] rounded px-2 py-1 text-white placeholder-[#346147] outline-none"
                />
                <button
                  type="submit"
                  className="px-3 py-1 bg-[#143322] hover:bg-[#1d4730] text-[#00ff66] rounded font-semibold transition-colors"
                >
                  Set
                </button>
              </form>
            </div>

            {/* Altitude Section */}
            <div className="p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[#00ff66]">ALTITUDE</span>
                  {modelBounds && (
                    <span className="text-[10px] text-[#4e8b69] tabular-nums">
                      ≤{(modelBounds.maxAltitudeFt / 1000).toFixed(modelBounds.maxAltitudeFt % 1000 === 0 ? 0 : 1)}k
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setAltitude(aircraft.id, aircraft.targetAltitude, true)}
                  className="px-2 py-0.5 bg-[#331e0d] hover:bg-[#472a12] text-[#ffb703] border border-[#6e411a] rounded text-[10px] font-semibold transition-colors"
                  title="Expedite Climb or Descent"
                >
                  Expedite
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1 text-[10px] tabular-nums">
                {altitudePresetsFt.map(alt => (
                  <button
                    type="button"
                    key={alt}
                    onClick={() => setAltitude(aircraft.id, alt)}
                    className={`py-1 rounded border transition-colors ${
                      aircraft.targetAltitude === alt
                        ? 'bg-[#19442d] border-[#00ff66] text-[#00ff66] font-bold'
                        : 'bg-[#0b1f15] hover:bg-[#133322] text-[#a2f5bf] border-[#19402b]'
                    }`}
                  >
                    {alt % 1000 === 0 ? `${alt / 1000}k` : `${(alt / 1000).toFixed(1)}k`}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-1 text-[10px] tabular-nums">
                {[-1000, -500, 500, 1000].map(delta => (
                  <button
                    type="button"
                    key={delta}
                    onClick={() => setAltitude(aircraft.id, aircraft.targetAltitude + delta)}
                    className="py-1 bg-[#0b1f15] hover:bg-[#133322] text-[#a2f5bf] rounded border border-[#19402b] transition-colors"
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </button>
                ))}
              </div>

              <input
                type="range"
                min={modelBounds?.minAltitudeFt ?? 1000}
                max={modelBounds?.maxAltitudeFt ?? 20000}
                step="500"
                value={Math.max(
                  modelBounds?.minAltitudeFt ?? 1000,
                  Math.min(modelBounds?.maxAltitudeFt ?? 20000, Math.round(aircraft.targetAltitude))
                )}
                onChange={e => setAltitude(aircraft.id, Number(e.target.value))}
                className="w-full accent-[#00ff66] bg-[#050e09] h-1.5 rounded cursor-pointer"
              />

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
                  step="100"
                  placeholder={`Alt (max ${(modelBounds?.maxAltitudeFt ?? 20000).toLocaleString()} ft)`}
                  value={altitudeInput}
                  onChange={e => setAltitudeInput(e.target.value)}
                  className="flex-1 bg-[#050d09] border border-[#163826] rounded px-2 py-1 text-white placeholder-[#346147] outline-none tabular-nums"
                />
                <button
                  type="submit"
                  className="px-3 py-1 bg-[#143322] hover:bg-[#1d4730] text-[#00ff66] rounded font-semibold transition-colors"
                >
                  Set
                </button>
              </form>
            </div>

            {/* Airspeed Section */}
            <div className="p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[#00e5ff]">AIRSPEED</span>
                  {modelBounds && (
                    <span className="text-[10px] text-[#4e8b69] tabular-nums">
                      {modelBounds.minSpeedKt}–{modelBounds.maxSpeedKt}kt
                    </span>
                  )}
                </div>
                <div className="flex gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setSpeed(aircraft.id, aircraft.targetAirspeed - 10)}
                    className="px-2 py-0.5 bg-[#0b1f15] hover:bg-[#133322] text-[#a2f5bf] rounded border border-[#19402b]"
                  >
                    -10
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpeed(aircraft.id, aircraft.targetAirspeed + 10)}
                    className="px-2 py-0.5 bg-[#0b1f15] hover:bg-[#133322] text-[#a2f5bf] rounded border border-[#19402b]"
                  >
                    +10
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1 text-[10px] tabular-nums">
                {speedPresetsKt.map(spd => (
                  <button
                    type="button"
                    key={spd}
                    onClick={() => setSpeed(aircraft.id, spd)}
                    className={`py-1 rounded border transition-colors ${
                      aircraft.targetAirspeed === spd
                        ? 'bg-[#0e3240] border-[#00e5ff] text-[#00e5ff] font-bold'
                        : 'bg-[#0b1f15] hover:bg-[#133322] text-[#a2f5bf] border-[#19402b]'
                    }`}
                  >
                    {spd}kt
                  </button>
                ))}
              </div>

              <input
                type="range"
                min={modelBounds?.minSpeedKt ?? 140}
                max={modelBounds?.maxSpeedKt ?? 280}
                step="5"
                value={Math.max(
                  modelBounds?.minSpeedKt ?? 140,
                  Math.min(modelBounds?.maxSpeedKt ?? 280, Math.round(aircraft.targetAirspeed))
                )}
                onChange={e => setSpeed(aircraft.id, Number(e.target.value))}
                className="w-full accent-[#00e5ff] bg-[#050e09] h-1.5 rounded cursor-pointer"
              />

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
                  step="5"
                  placeholder={`Speed (${modelBounds?.minSpeedKt ?? 140}-${modelBounds?.maxSpeedKt ?? 280} kt)`}
                  value={speedInput}
                  onChange={e => setSpeedInput(e.target.value)}
                  className="flex-1 bg-[#050d09] border border-[#163826] rounded px-2 py-1 text-white placeholder-[#346147] outline-none tabular-nums"
                />
                <button
                  type="submit"
                  className="px-3 py-1 bg-[#143322] hover:bg-[#1d4730] text-[#00ff66] rounded font-semibold transition-colors"
                >
                  Set
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'route' && (
          <div className="p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#00ff66]">FIX ROUTING</span>
              <div className="flex bg-[#050d09] rounded border border-[#163826] p-0.5 text-[10px]">
                {(['DIRECT', 'CHAIN', 'HOLD'] as RoutingMode[]).map(mode => (
                  <button
                    type="button"
                    key={mode}
                    onClick={() => setRoutingMode(mode)}
                    className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                      routingMode === mode
                        ? mode === 'HOLD'
                          ? 'bg-[#362c0b] text-[#ffd166]'
                          : mode === 'CHAIN'
                          ? 'bg-[#0e3240] text-[#00e5ff]'
                          : 'bg-[#19442d] text-[#00ff66]'
                        : 'text-[#558f6e] hover:text-white'
                    }`}
                  >
                    {mode === 'CHAIN' ? '+Leg' : mode === 'HOLD' ? 'Hold' : 'Direct'}
                  </button>
                ))}
              </div>
            </div>

            {(activeRouteList.length > 0 || aircraft.status === 'Holding') && (
              <div className="px-2.5 py-2 bg-[#06120c] border border-[#1a452e] rounded flex items-center justify-between gap-2 text-[10px]">
                <span className="truncate text-[#ffd166] font-semibold">
                  {aircraft.status === 'Holding'
                    ? `HOLD @ ${aircraft.holdingWaypoint} (${aircraft.holdingLeg})`
                    : activeRouteList.join(' → ')}
                </span>
                <button
                  type="button"
                  onClick={() => clearRoute(aircraft.id)}
                  className="text-[#ff6b6b] hover:text-white font-bold shrink-0"
                >
                  Clear
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5">
              {airport.waypoints.map(wp => {
                const isActiveFix = aircraft.assignedWaypoint === wp.name;
                const isQueued = (aircraft.routeQueue || []).includes(wp.name);
                const isHoldActive =
                  aircraft.status === 'Holding' && aircraft.holdingWaypoint === wp.name;

                return (
                  <button
                    type="button"
                    key={wp.name}
                    onClick={() => handleWaypointAction(wp.name)}
                    className={`py-1.5 px-1.5 rounded border transition-colors text-center ${
                      isHoldActive
                        ? 'bg-[#3b2f0b] border-[#ffd166] text-[#ffd166] font-bold'
                        : isActiveFix
                        ? 'bg-[#19442d] border-[#00ff66] text-[#00ff66] font-bold'
                        : isQueued
                        ? 'bg-[#0e3240] border-[#00e5ff] text-[#00e5ff] font-semibold'
                        : routingMode === 'HOLD' && wp.isHoldingFix
                        ? 'bg-[#172112] hover:bg-[#2a3316] text-[#ffd166] border-[#424921]'
                        : 'bg-[#0b1f15] hover:bg-[#133322] text-[#a2f5bf] border-[#19402b]'
                    }`}
                    title={wp.description}
                  >
                    <div className="text-[11px] truncate">{wp.name}</div>
                    {wp.role && (
                      <div className="text-[9px] text-[#5c9474]">{wp.role}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'approach' && (
          <div className="divide-y divide-[#122e1f]">
            {/* Staged Departure, Exit Routing & Center Handoff Pipeline */}
            {isDepartureFlight && departureGates && (
              <div className="p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#ffd166]">
                    DEPARTURE · RWY {aircraft.assignedRunway}
                  </span>
                  <span className="text-[10px] font-semibold text-[#00e5ff] tabular-nums">
                    {aircraft.assignedSidName || 'RADAR SID'}
                  </span>
                </div>

                {/* Filed Exit Route & Initial Climb Gate Readout */}
                <div className="p-2.5 bg-[#060f0a] border border-[#163826] space-y-1 text-[10px] tabular-nums">
                  <div className="flex items-center justify-between">
                    <span className="text-[#5da87d]">FILED EXIT</span>
                    <span className="text-[#00e5ff] font-bold">
                      {departureGates.exitWaypointName || '—'}
                      {departureGates.exitFixDistNM !== null
                        ? ` · ${departureGates.exitFixDistNM.toFixed(1)} NM`
                        : ''}
                    </span>
                  </div>

                  {aircraft.departureRouteWaypoints && aircraft.departureRouteWaypoints.length > 0 && (
                    <div className="text-[#9de8bc] truncate">
                      {aircraft.departureRouteWaypoints.join(' → ')}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-[#122e1f]">
                    <span className="text-[#5da87d]">CLIMB GATE</span>
                    <span
                      className={
                        departureGates.isClimbGateMet
                          ? 'text-[#00ff66] font-bold'
                          : 'text-[#ffd166]'
                      }
                    >
                      {departureGates.aglFt.toLocaleString()}/{departureGates.minClimbAglFt.toLocaleString()}ft ·{' '}
                      {Math.round(aircraft.indicatedAirspeed)}/{departureGates.minClimbSpeedKt}kt
                    </span>
                  </div>
                </div>

                {/* Step 1: Line Up & Wait */}
                <button
                  type="button"
                  disabled={!isHoldingShort}
                  onClick={() => lineUpAndWait(aircraft.id, aircraft.assignedRunway)}
                  className={`w-full py-2 font-bold border transition-colors ${
                    isHoldingShort
                      ? 'bg-[#173b27] hover:bg-[#215438] text-[#00ff66] border-[#00ff66]'
                      : 'bg-[#0a1710] text-[#356147] border-[#143020] cursor-not-allowed'
                  }`}
                >
                  {isHoldingShort
                    ? `1. Line Up & Wait ${aircraft.assignedRunway}`
                    : `1. Lined Up ${aircraft.assignedRunway} ✓`}
                </button>

                {/* Step 2: Cleared for Takeoff */}
                <button
                  type="button"
                  disabled={!isLinedUp}
                  onClick={() => clearTakeoff(aircraft.id)}
                  className={`w-full py-2 font-bold border transition-colors ${
                    isLinedUp
                      ? 'bg-[#0d3340] hover:bg-[#144b5e] text-[#00e5ff] border-[#00e5ff]'
                      : 'bg-[#0a1710] text-[#356147] border-[#143020] cursor-not-allowed'
                  }`}
                >
                  {aircraft.status === 'Outbound' ||
                  aircraft.indicatedAirspeed > 0 ||
                  aircraft.flightPhase === 'TAKEOFF_ROLL' ||
                  aircraft.flightPhase === 'ROTATION' ||
                  aircraft.flightPhase === 'LIFTOFF' ||
                  aircraft.flightPhase === 'INITIAL_CLIMB'
                    ? `2. Airborne RWY ${aircraft.assignedRunway} ✓`
                    : '2. Cleared for Takeoff'}
                </button>

                {/* Step 3: Proceed on Assigned Exit Route */}
                {(() => {
                  const canProceedExit =
                    departureGates.isClimbGateMet && !departureGates.isExitRouteActive;
                  return (
                    <button
                      type="button"
                      disabled={!canProceedExit}
                      onClick={() => proceedDepartureOnExit(aircraft.id)}
                      className={`w-full py-2 font-bold border transition-colors ${
                        departureGates.isExitRouteActive
                          ? 'bg-[#0c261c] text-[#00ff66] border-[#1c593a] cursor-default'
                          : canProceedExit
                          ? 'bg-[#0e3240] hover:bg-[#154c61] text-[#00e5ff] border-[#00e5ff]'
                          : 'bg-[#0a1710] text-[#356147] border-[#143020] cursor-not-allowed'
                      }`}
                    >
                      {departureGates.isExitRouteActive
                        ? `3. Proceeding via ${departureGates.exitWaypointName || 'Exit'} ✓`
                        : `3. Proceed on Exit ${departureGates.exitWaypointName || 'SID'}`}
                    </button>
                  );
                })()}

                {/* Step 4: Center Handoff ("Goodbye") */}
                {(() => {
                  const canHandoff =
                    departureGates.isHandoffReady ||
                    (departureGates.isClimbGateMet &&
                      (departureGates.exitFixDistNM === null ||
                        departureGates.exitFixDistNM <= 5.0));
                  return (
                    <button
                      type="button"
                      disabled={!canHandoff}
                      onClick={() => handoffDeparture(aircraft.id)}
                      className={`w-full py-2 font-bold border transition-colors ${
                        departureGates.isHandoffReady
                          ? 'bg-[#124529] hover:bg-[#1a633b] text-[#00ff66] border-[#00ff66]'
                          : canHandoff
                          ? 'bg-[#0f3322] hover:bg-[#164d33] text-[#85f5b0] border-[#298050]'
                          : 'bg-[#0a1710] text-[#356147] border-[#143020] cursor-not-allowed'
                      }`}
                    >
                      4. Center Handoff (Goodbye)
                    </button>
                  );
                })()}

                {/* Ground Abort Guard (only while rolling on runway before liftoff) */}
                {aircraft.status === 'Departing' &&
                  departureGates.aglFt <= 15 &&
                  aircraft.indicatedAirspeed > 0 && (
                    <button
                      type="button"
                      onClick={() => abortTakeoff(aircraft.id)}
                      className="w-full py-2 bg-[#361114] hover:bg-[#4d181c] text-[#ff6b6b] font-bold border border-[#ff3344]/70 transition-colors"
                    >
                      Abort Takeoff (Reject)
                    </button>
                  )}
              </div>
            )}

            {/* ILS & Approach Guidance (shown for arrivals or emergency returns) */}
            {(!isDepartureFlight || aircraft.isEmergency) && (
              <div className="p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#00e5ff]">ILS &amp; RUNWAY</span>
                  <span className="text-[10px] text-[#558f6e]">ELEV {airport.elevationFeet}ft</span>
                </div>

                {!isDepartureFlight && rwyGeom && (
                  <div className="px-2.5 py-1.5 bg-[#060f0a] border border-[#143020] flex items-center justify-between text-[10px] tabular-nums">
                    <span className="text-[#7ec29a]">
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

                {isApproaching && locDev && gsDev && (
                  <div className="grid grid-cols-2 gap-2 text-[10px] tabular-nums bg-[#060f0a] border border-[#1a4859] p-2">
                    <div>
                      <span className="text-[#5da87d]">LOC </span>
                      <span
                        className={
                          Math.abs(locDev.dots) <= 0.5
                            ? 'text-[#00ff66] font-bold'
                            : 'text-[#ffb703]'
                        }
                      >
                        {locDev.dots > 0 ? `+${locDev.dots}` : locDev.dots} dots
                      </span>
                    </div>
                    <div>
                      <span className="text-[#5da87d]">G/S </span>
                      <span
                        className={
                          Math.abs(gsDev.dots) <= 0.5
                            ? 'text-[#00ff66] font-bold'
                            : 'text-[#ffb703]'
                        }
                      >
                        {gsDev.dots > 0 ? `+${gsDev.dots}` : gsDev.dots} dots
                      </span>
                    </div>
                  </div>
                )}

                {!isDepartureFlight && (
                  <button
                    type="button"
                    onClick={() => vectorToIntercept(aircraft.id, aircraft.assignedRunway)}
                    className="w-full py-2 bg-[#0b2f38] hover:bg-[#114552] text-[#00e5ff] border border-[#00e5ff]/60 font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Vector to Final ILS {aircraft.assignedRunway}</span>
                  </button>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  {approachRunways.map(rwy => (
                    <div key={rwy.id} className="flex gap-0.5">
                      <button
                        type="button"
                        onClick={() => clearILS(aircraft.id, rwy.id)}
                        className={`flex-1 py-1.5 px-1.5 border font-semibold transition-colors text-[10px] ${
                          aircraft.ilsArmed && aircraft.assignedRunway === rwy.id
                            ? 'bg-[#113d2e] border-[#00e5ff] text-white'
                            : rwy.id === activeLandingRunwayId
                            ? 'bg-[#0d2a20] hover:bg-[#144232] text-[#00e5ff] border-[#1f634a]'
                            : 'bg-[#091c15] hover:bg-[#123326] text-[#7ccfb0] border-[#163826]'
                        }`}
                      >
                        ILS {rwy.id}
                      </button>
                      <button
                        type="button"
                        onClick={() => assignRunway(aircraft.id, rwy.id)}
                        className={`px-2 py-1.5 border text-[9px] font-bold transition-colors ${
                          aircraft.assignedRunway === rwy.id && !aircraft.ilsArmed
                            ? 'bg-[#1b442d] border-[#00ff66] text-[#00ff66]'
                            : 'bg-[#07150e] hover:bg-[#102c1e] text-[#5da87d] border-[#163826]'
                        }`}
                        title={`Assign Runway ${rwy.id}`}
                      >
                        RWY
                      </button>
                    </div>
                  ))}
                </div>

                {!isDepartureFlight && (
                  <button
                    type="button"
                    onClick={() => goAround(aircraft.id)}
                    className="w-full py-2 bg-[#361114] hover:bg-[#4d181c] text-[#ff6b6b] border border-[#ff3344]/70 font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <AlertOctagon className="w-3.5 h-3.5" />
                    <span>Mandatory Go-Around</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
