/**
 * SKYCONTROL - ATC Manual & Quick Reference Guide
 */

import React from 'react';
import { X, BookOpen, Compass, Shield, Crosshair, MousePointer, Award } from 'lucide-react';
import { useSimulationStore } from '../store/simulationStore';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const airport = useSimulationStore(state => state.airport);
  const airportProfile = useSimulationStore(state => state.airportProfile);
  const activeLandingRunwayId = useSimulationStore(state => state.activeLandingRunwayId);
  const activeDepartureRunwayId = useSimulationStore(state => state.activeDepartureRunwayId);

  if (!isOpen) return null;

  const activeArrRwy = airport.runways.find(r => r.id === activeLandingRunwayId);
  const arrHeading = activeArrRwy ? activeArrRwy.heading.toString().padStart(3, '0') : '270';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#08130e] border border-[#1b422d] rounded-lg shadow-2xl flex flex-col font-mono text-xs select-none max-h-[85vh]">
        {/* Header */}
        <div className="px-4 py-3 bg-[#0d2016] border-b border-[#1b422d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#00ff66]" />
            <span className="font-bold text-sm text-[#00ff66]">
              CONTROLLER OPERATIONAL MANUAL · {airport.icao} TMA
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#4e8b69] hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex flex-col gap-5 text-[#a2f5bf] leading-relaxed">
          {/* Section 1: Active Airspace */}
          <div>
            <h3 className="text-sm font-bold text-white mb-1.5 flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-[#00ff66]" />
              <span>1. Active Airspace: {airport.name} ({airport.icao})</span>
            </h3>
            <p className="text-[11px] text-[#85cca1]">
              Elevation: <b className="text-white">{airport.elevationFeet} ft</b> · VHF: <b className="text-white">{airportProfile.vhfFrequency}</b> · Active Landing RWY <b className="text-[#00ff66]">{activeLandingRunwayId}</b> (HDG {arrHeading}°) · Departure RWY <b className="text-[#00e5ff]">{activeDepartureRunwayId}</b>.
            </p>
            <p className="text-[11px] text-[#85cca1] mt-1">
              {airportProfile.summary}
            </p>
          </div>

          {/* Section 2: Separation Standards & Emergency 7700 */}
          <div className="p-3 bg-[#0a1711] border border-[#163826] rounded">
            <h3 className="text-sm font-bold text-[#ffb703] mb-1.5 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-[#ffb703]" />
              <span>2. Separation Standards (STCA) &amp; Squawk 7700</span>
            </h3>
            <ul className="text-[11px] text-[#b4e0c4] flex flex-col gap-1 list-disc list-inside tabular-nums">
              <li><b>Horizontal Separation:</b> Maintain at least <b className="text-white">3.0 NM</b> between airborne aircraft.</li>
              <li><b>Vertical Separation:</b> Maintain at least <b className="text-white">1,000 ft</b> until established on ILS final.</li>
              <li><b>Terrain Clearance:</b> Observe published terrain elevation contours and sector peaks in the radar background before descending aircraft below MSA.</li>
              <li><b>Squawk 7700 (Mayday):</b> Emergency flights appear with a red diamond target. Clear conflicting traffic and vector them straight onto ILS <b className="text-[#00e5ff]">{activeLandingRunwayId}</b>.</li>
            </ul>
          </div>

          {/* Section 3: Academy & Custom Scenarios */}
          <div>
            <h3 className="text-sm font-bold text-white mb-1.5 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-[#ffd166]" />
              <span>3. Flight Academy &amp; Scenario Studio</span>
            </h3>
            <p className="text-[11px] text-[#85cca1]">
              Open <b>Academy &amp; Ops</b> or <b>Pre-Flight Setup</b> to switch freely between 5 airports (EGLL, OIII, KJFK, TRN1, TRN2), complete 5 certification missions to earn your official ATC rating certificate, configure individual STAR/SID/Fix visibility per airport, or build custom weather and traffic scenarios.
            </p>
          </div>

          {/* Section 4: ILS Intercept Geometry */}
          <div>
            <h3 className="text-sm font-bold text-white mb-1.5 flex items-center gap-1.5">
              <Crosshair className="w-4 h-4 text-[#00e5ff]" />
              <span>4. ILS Approach &amp; Vectoring</span>
            </h3>
            <ol className="text-[11px] text-[#b4e0c4] flex flex-col gap-1 list-decimal list-inside tabular-nums">
              <li>Vector inbound traffic to intercept the RWY {activeLandingRunwayId} extended centerline (HDG {arrHeading}°) at ~30° angle.</li>
              <li>Descend to pattern intercept altitude (~{Math.ceil(airport.elevationFeet / 1000) * 1000 + 3000} ft at 10–14 NM).</li>
              <li>Click <b className="text-[#00e5ff]">&quot;CLEARED ILS {activeLandingRunwayId}&quot;</b> to arm localizer and glideslope capture.</li>
            </ol>
          </div>

          {/* Section 5: Workstation Controls */}
          <div>
            <h3 className="text-sm font-bold text-white mb-1.5 flex items-center gap-1.5">
              <MousePointer className="w-4 h-4 text-[#00ff66]" />
              <span>5. Radar Mouse &amp; Keyboard Shortcuts</span>
            </h3>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 bg-[#0c1c14] border border-[#163826] rounded">
                <span className="font-bold text-[#00ff66]">Left-Click / Drag:</span>
                <p className="text-[#85cca1] mt-0.5">Select aircraft, drag data tags, pan scope, or drag heading vector handle.</p>
              </div>
              <div className="p-2 bg-[#0c1c14] border border-[#163826] rounded">
                <span className="font-bold text-[#00ff66]">Mouse Wheel / [+/-]:</span>
                <p className="text-[#85cca1] mt-0.5">Continuous radar zoom from 2.5 NM runway close-up out to 140 NM enroute view.</p>
              </div>
              <div className="p-2 bg-[#0c1c14] border border-[#163826] rounded">
                <span className="font-bold text-[#00ff66]">Right-Click Drag / [M]:</span>
                <p className="text-[#85cca1] mt-0.5">Measure tactical distance (NM) and magnetic bearing (°).</p>
              </div>
              <div className="p-2 bg-[#0c1c14] border border-[#163826] rounded">
                <span className="font-bold text-[#00ff66]">[H] / [D] / [C] &amp; Layers:</span>
                <p className="text-[#85cca1] mt-0.5">Heading vector, Direct-To fix, Center view, and instant scope declutter controls.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[#0d2016] border-t border-[#1b422d] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#00ff66] hover:bg-[#39ff14] text-black font-bold rounded transition-colors text-xs whitespace-nowrap"
          >
            Acknowledge &amp; Return to Radar
          </button>
        </div>
      </div>
    </div>
  );
};
