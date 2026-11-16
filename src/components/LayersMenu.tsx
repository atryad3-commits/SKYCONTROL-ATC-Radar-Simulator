/**
 * SKYCONTROL - Radar Display Layers & Per-Airport Procedures Drawer
 * Manages global scope layers (Terrain, Range Rings, Runways, Holds, TMA, etc.),
 * quick declutter presets, AND independent per-airport STAR/SID/Fix toggles.
 */

import React from 'react';
import { useSimulationStore, RadarLayers } from '../store/simulationStore';
import { computeDefaultAirportVisibility } from '../airports/procedures';
import { Layers, X, Check, Navigation, Eye, EyeOff } from 'lucide-react';

interface LayersMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LayersMenu: React.FC<LayersMenuProps> = ({ isOpen, onClose }) => {
  const radarLayers = useSimulationStore(state => state.radarLayers);
  const toggleLayer = useSimulationStore(state => state.toggleLayer);
  const setAllRadarLayers = useSimulationStore(state => state.setAllRadarLayers);
  const applyRadarDeclutter = useSimulationStore(state => state.applyRadarDeclutter);
  const airport = useSimulationStore(state => state.airport);
  const activeLandingRunwayId = useSimulationStore(state => state.activeLandingRunwayId);
  const activeDepartureRunwayId = useSimulationStore(state => state.activeDepartureRunwayId);
  const perAirportVisibility = useSimulationStore(state => state.perAirportVisibility);
  const toggleAirportStar = useSimulationStore(state => state.toggleAirportStar);
  const toggleAirportSid = useSimulationStore(state => state.toggleAirportSid);
  const toggleAirportWaypoint = useSimulationStore(state => state.toggleAirportWaypoint);
  const setAirportAllRoutesVisible = useSimulationStore(state => state.setAirportAllRoutesVisible);
  const matchAirportRoutesToRunways = useSimulationStore(state => state.matchAirportRoutesToRunways);

  if (!isOpen) return null;

  const vis =
    perAirportVisibility[airport.icao] || computeDefaultAirportVisibility(airport);
  const stars = airport.approachRoutes || [];
  const sids = airport.departureRoutes || [];

  const globalLayers: Array<{ key: keyof RadarLayers; label: string; desc: string }> = [
    { key: 'terrain', label: 'Terrain, Water & Elevations', desc: 'Topographical contours, mountains, rivers & obstacles' },
    { key: 'rangeRings', label: 'Multi-Tier Range Rings & Compass', desc: 'Adaptive 1–160 NM range rings, radials & 360° dial' },
    { key: 'runways', label: 'Airport Runway Surfaces', desc: 'Physical runway geometry & threshold designators' },
    { key: 'extendedCenterlines', label: 'Extended RWY & ILS Feathers', desc: 'Localizer approach courses and 5 NM marker tics' },
    { key: 'tmaBoundary', label: 'TMA Sector Boundary', desc: 'Airspace perimeter polygon, floor/ceiling & TA' },
    { key: 'starCorridors', label: 'STAR Arrival Corridors', desc: 'Published inbound approach paths & directional arrows' },
    { key: 'sidCorridors', label: 'SID Departure Corridors', desc: 'Standard instrument departure & radar exit tracks' },
    { key: 'procedureRestrictions', label: 'Altitude, Speed & Leg NM', desc: 'Course headings, NM leg lengths, FL/kt limits' },
    { key: 'holdingStacks', label: 'Holding Racetrack Patterns', desc: 'Orbital holding racetrack boundaries at terminal fixes' },
    { key: 'waypointLabels', label: 'Waypoints & Fixes (IAF/FAF/EXIT)', desc: 'Terminal holds, approach gates and departure fixes' },
    { key: 'extendedTargetTags', label: 'Enriched Target Telemetry', desc: 'Track/drift, VS trend, wake category & runway/route dist' },
    { key: 'trails', label: 'Target History Trails', desc: 'Fading phosphor position breadcrumbs' },
    { key: 'speedVectors', label: '1-Minute Velocity Vectors', desc: 'Projected 60-second ground track lines' },
    { key: 'radarSweep', label: 'Radar Antenna Sweep Beam', desc: '15 RPM phosphor sweep excitation' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[88vh] bg-[#08130e] border border-[#1b422d] rounded-lg shadow-2xl flex flex-col overflow-hidden font-mono text-xs select-none">
        {/* Header */}
        <div className="px-4 py-3 bg-[#0c1d14] border-b border-[#1b422d] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-[#00ff66]">
            <Layers className="w-4 h-4" />
            <span className="font-bold text-sm">
              RADAR DISPLAY LAYERS &amp; PROCEDURES · {airport.icao}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={() => applyRadarDeclutter('full')}
              className="px-2 py-1 bg-[#123321] hover:bg-[#19472e] border border-[#246340] text-[#00ff66] rounded font-semibold flex items-center gap-1 transition-colors"
            >
              <Eye className="w-3 h-3" />
              <span>Full Chart</span>
            </button>
            <button
              type="button"
              onClick={() => applyRadarDeclutter('tactical')}
              className="px-2 py-1 bg-[#0e2d3b] hover:bg-[#154256] border border-[#1f627d] text-[#00e5ff] rounded font-semibold transition-colors"
            >
              Tactical Vector
            </button>
            <button
              type="button"
              onClick={() => applyRadarDeclutter('minimal')}
              className="px-2 py-1 bg-[#241c0d] hover:bg-[#362912] border border-[#523f1b] text-[#ffd166] rounded font-semibold transition-colors"
            >
              Minimal Scope
            </button>
            <button
              type="button"
              onClick={() => setAllRadarLayers(false)}
              className="px-2 py-1 bg-[#241314] hover:bg-[#361b1d] border border-[#522427] text-[#ff858d] rounded font-semibold flex items-center gap-1 transition-colors"
            >
              <EyeOff className="w-3 h-3" />
              <span>Hide All</span>
            </button>
            <button onClick={onClose} className="p-1 ml-1 text-[#4e8b69] hover:text-white transition-colors" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Two-Pane Body */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Global Scope Overlays */}
          <div className="lg:col-span-5 flex flex-col gap-1.5">
            <div className="text-[11px] font-bold text-[#a2f5bf] pb-1.5 border-b border-[#163826] mb-1">
              SCOPE DISPLAY LAYERS ({Object.values(radarLayers).filter(Boolean).length}/{globalLayers.length})
            </div>
            {globalLayers.map(item => {
              const isEnabled = radarLayers[item.key];
              return (
                <div
                  key={item.key}
                  onClick={() => toggleLayer(item.key)}
                  className="px-2.5 py-1.5 bg-[#0a1811] hover:bg-[#11261b] border border-[#163826] rounded cursor-pointer transition-colors flex items-center justify-between gap-2 group"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-white group-hover:text-[#00ff66] transition-colors truncate">
                      {item.label}
                    </div>
                    <div className="text-[10px] text-[#4e8b69] truncate">
                      {item.desc}
                    </div>
                  </div>

                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                      isEnabled
                        ? 'bg-[#00ff66] border-[#00ff66] text-black'
                        : 'border-[#2d5c3f] bg-[#07120c]'
                    }`}
                  >
                    {isEnabled && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Per-Airport Individual STAR, SID & Waypoint Switches */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="pb-2 border-b border-[#163826] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[#00e5ff] font-bold text-[11px]">
                <Navigation className="w-3.5 h-3.5" />
                <span>
                  {airport.icao} PROCEDURES (RWY {activeLandingRunwayId}/{activeDepartureRunwayId})
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() =>
                    matchAirportRoutesToRunways(
                      airport.icao,
                      activeLandingRunwayId,
                      activeDepartureRunwayId
                    )
                  }
                  className="px-2 py-1 bg-[#0e2d3b] hover:bg-[#154256] border border-[#1f627d] text-[#00e5ff] rounded font-semibold transition-colors"
                >
                  Match Active RWY
                </button>
                <button
                  type="button"
                  onClick={() => setAirportAllRoutesVisible(airport.icao, true)}
                  className="px-2 py-1 bg-[#123321] hover:bg-[#19472e] border border-[#246340] text-[#00ff66] rounded font-semibold transition-colors"
                >
                  All On
                </button>
                <button
                  type="button"
                  onClick={() => setAirportAllRoutesVisible(airport.icao, false)}
                  className="px-2 py-1 bg-[#241314] hover:bg-[#361b1d] border border-[#522427] text-[#ff858d] rounded font-semibold transition-colors"
                >
                  All Off
                </button>
              </div>
            </div>

            {/* STAR & SID Switches */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* STARs */}
              <div className="flex flex-col gap-1.5">
                <div className="text-[10px] font-bold text-[#00e5ff]">
                  STAR APPROACHES ({vis.visibleStarIds.length}/{stars.length})
                </div>
                {stars.map(star => {
                  const on = vis.visibleStarIds.includes(star.id);
                  return (
                    <div
                      key={star.id}
                      onClick={() => toggleAirportStar(airport.icao, star.id)}
                      className={`px-2.5 py-2 rounded border cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                        on
                          ? 'bg-[#0b1f16] border-[#1d5236]'
                          : 'bg-[#07100b] border-[#12261b] opacity-60 hover:opacity-95'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#00e5ff]">
                          {star.name} <span className="text-[#85cca1] font-normal">· RWY {star.runwayIds.join('/')}</span>
                        </div>
                        <div className="text-[10px] text-[#5da87d] truncate">
                          {star.waypointNames.join(' → ')}
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                          on
                            ? 'bg-[#00e5ff] border-[#00e5ff] text-black'
                            : 'border-[#2d5c3f] bg-[#060f0a]'
                        }`}
                      >
                        {on && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* SIDs */}
              <div className="flex flex-col gap-1.5">
                <div className="text-[10px] font-bold text-[#ffd166]">
                  SID DEPARTURES ({vis.visibleSidIds.length}/{sids.length})
                </div>
                {sids.map(sid => {
                  const on = vis.visibleSidIds.includes(sid.id);
                  return (
                    <div
                      key={sid.id}
                      onClick={() => toggleAirportSid(airport.icao, sid.id)}
                      className={`px-2.5 py-2 rounded border cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                        on
                          ? 'bg-[#171a0d] border-[#52461a]'
                          : 'bg-[#07100b] border-[#12261b] opacity-60 hover:opacity-95'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#ffd166]">
                          {sid.name} <span className="text-[#a2f5bf] font-normal">· RWY {sid.runwayIds.join('/')}</span>
                        </div>
                        <div className="text-[10px] text-[#8aa875] truncate">
                          {sid.waypointNames.join(' → ')}
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                          on
                            ? 'bg-[#ffd166] border-[#ffd166] text-black'
                            : 'border-[#2d5c3f] bg-[#060f0a]'
                        }`}
                      >
                        {on && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Individual Waypoints */}
            <div className="flex flex-col gap-1.5">
              <div className="text-[10px] font-bold text-[#00ff66]">
                INDIVIDUAL FIXES &amp; WAYPOINTS ({vis.visibleWaypoints.length}/{airport.waypoints.length})
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {airport.waypoints.map(wp => {
                  const on = vis.visibleWaypoints.includes(wp.name);
                  const role =
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
                    <button
                      key={wp.name}
                      type="button"
                      onClick={() => toggleAirportWaypoint(airport.icao, wp.name)}
                      className={`px-2 py-1.5 rounded border text-left transition-colors flex items-center justify-between gap-1.5 ${
                        on
                          ? 'bg-[#0b1f16] border-[#1d5236] text-white'
                          : 'bg-[#07100b] border-[#12261b] text-[#568268] opacity-60 hover:opacity-95'
                      }`}
                    >
                      <span className="truncate">
                        <b className="text-[11px]">{wp.name}</b>{' '}
                        <span className="text-[9px] text-[#7ec29a]">{role}</span>
                      </span>
                      <div
                        className={`w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 ${
                          on
                            ? 'bg-[#00ff66] border-[#00ff66] text-black'
                            : 'border-[#2d5c3f] bg-[#060f0a]'
                        }`}
                      >
                        {on && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
