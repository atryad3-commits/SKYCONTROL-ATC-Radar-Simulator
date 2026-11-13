/**
 * SKYCONTROL - ATC Manual & Quick Reference Guide
 */

import React from 'react';
import { X, BookOpen, Compass, Shield, Crosshair, MousePointer } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#08130e] border border-[#1b422d] rounded-lg shadow-2xl flex flex-col font-mono text-xs select-none max-h-[85vh]">
        {/* Header */}
        <div className="px-4 py-3 bg-[#0d2016] border-b border-[#1b422d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#00ff66]" />
            <span className="font-bold text-sm text-[#00ff66]">
              CONTROLLER OPERATIONAL MANUAL (EGLL TMA)
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#4e8b69] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex flex-col gap-5 text-[#a2f5bf] leading-relaxed">
          {/* Section 1: Core Objective */}
          <div>
            <h3 className="text-sm font-bold text-white mb-1.5 flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-[#00ff66]" />
              <span>1. Objective & Airspace</span>
            </h3>
            <p className="text-[11px] text-[#85cca1]">
              You are the Terminal Radar Approach Controller for London Heathrow (EGLL). Your primary mission is to safely sequence arrival traffic onto runways 27R and 27L while managing departing flights and preventing separation losses.
            </p>
          </div>

          {/* Section 2: Separation Standards & STCA */}
          <div className="p-3 bg-[#0a1711] border border-[#163826] rounded">
            <h3 className="text-sm font-bold text-[#ffb703] mb-1.5 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-[#ffb703]" />
              <span>2. Terminal Separation Standards (STCA)</span>
            </h3>
            <ul className="text-[11px] text-[#b4e0c4] flex flex-col gap-1 list-disc list-inside">
              <li><b>Horizontal Separation:</b> Maintain at least <b className="text-white">3.0 Nautical Miles</b> between all airborne aircraft.</li>
              <li><b>Vertical Separation:</b> Maintain at least <b className="text-white">1,000 Feet</b> vertical separation until established on final approach.</li>
              <li><b>STCA Warning:</b> The radar automatically projects trajectories and alerts when Closest Point of Approach (CPA) is within 60 seconds of infringement.</li>
            </ul>
          </div>

          {/* Section 3: ILS Intercept Geometry */}
          <div>
            <h3 className="text-sm font-bold text-white mb-1.5 flex items-center gap-1.5">
              <Crosshair className="w-4 h-4 text-[#00e5ff]" />
              <span>3. ILS Approach & Sequencing</span>
            </h3>
            <p className="text-[11px] text-[#85cca1] mb-2">
              Runway 27R (northern parallel) is the primary landing runway (heading 270°). To clear an aircraft for landing:
            </p>
            <ol className="text-[11px] text-[#b4e0c4] flex flex-col gap-1 list-decimal list-inside">
              <li>Vector aircraft to intercept the extended centerline at approximately <b className="text-[#00e5ff]">30°</b> (headings 240° or 300°).</li>
              <li>Descend aircraft to intercept altitude (nominally 3,000 ft at 10 NM).</li>
              <li>Click <b className="text-[#00e5ff]">"CLEARED ILS 27R"</b>. When within localizer beam, the aircraft will automatically capture the localizer and track the 3.0° glideslope down to touchdown.</li>
            </ol>
          </div>

          {/* Section 4: Workstation Controls */}
          <div>
            <h3 className="text-sm font-bold text-white mb-1.5 flex items-center gap-1.5">
              <MousePointer className="w-4 h-4 text-[#00ff66]" />
              <span>4. Workstation Controls & Mouse Shortcuts</span>
            </h3>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 bg-[#0c1c14] border border-[#163826] rounded">
                <span className="font-bold text-[#00ff66]">Left-Click:</span>
                <p className="text-[#85cca1] mt-0.5">Select aircraft or drag data tags to avoid radar label overlap.</p>
              </div>
              <div className="p-2 bg-[#0c1c14] border border-[#163826] rounded">
                <span className="font-bold text-[#00ff66]">Mouse Wheel:</span>
                <p className="text-[#85cca1] mt-0.5">Zoom in / Zoom out radar scope between 12 NM and 65 NM.</p>
              </div>
              <div className="p-2 bg-[#0c1c14] border border-[#163826] rounded">
                <span className="font-bold text-[#00ff66]">Right-Click & Drag:</span>
                <p className="text-[#85cca1] mt-0.5">Measure tactical distance (NM) and magnetic bearing (°) between any points.</p>
              </div>
              <div className="p-2 bg-[#0c1c14] border border-[#163826] rounded">
                <span className="font-bold text-[#00ff66]">Flight Strips:</span>
                <p className="text-[#85cca1] mt-0.5">Click any progress strip in the bottom bay to lock command focus on that flight.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[#0d2016] border-t border-[#1b422d] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#00ff66] hover:bg-[#39ff14] text-black font-bold rounded transition-colors text-xs"
          >
            Acknowledge & Return to Radar
          </button>
        </div>
      </div>
    </div>
  );
};
