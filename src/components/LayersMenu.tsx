/**
 * SKYCONTROL - Radar Display Layers Menu
 */

import React from 'react';
import { useSimulationStore, RadarLayers } from '../store/simulationStore';
import { Layers, X, Check } from 'lucide-react';

interface LayersMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LayersMenu: React.FC<LayersMenuProps> = ({ isOpen, onClose }) => {
  const radarLayers = useSimulationStore(state => state.radarLayers);
  const toggleLayer = useSimulationStore(state => state.toggleLayer);

  if (!isOpen) return null;

  const layerItems: Array<{ key: keyof RadarLayers; label: string; desc: string }> = [
    { key: 'rangeRings', label: 'Range Rings (5, 10, 20, 30, 40 NM)', desc: 'Concentric distance rings around Heathrow' },
    { key: 'waypointLabels', label: 'Waypoints & Fixes (LAM, BNN, BIG, OCK)', desc: 'Standard terminal arrival and holding fixes' },
    { key: 'extendedCenterlines', label: 'Extended Runway Centerlines & ILS', desc: '15 NM approach feathers with 1 NM tick marks' },
    { key: 'trails', label: 'Target History Trails', desc: 'Fading phosphor breadcrumb trails of aircraft positions' },
    { key: 'speedVectors', label: '1-Minute Velocity Vectors', desc: 'Projected track lines based on current ground speed' },
    { key: 'radarSweep', label: 'Radar Antenna Sweep Beam', desc: '15 RPM phosphor sweep line with target excitation bloom' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#091510] border border-[#1b422d] rounded-lg shadow-2xl flex flex-col font-mono text-xs select-none">
        {/* Header */}
        <div className="px-4 py-2.5 bg-[#0d2016] border-b border-[#1b422d] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#00ff66]">
            <Layers className="w-4 h-4" />
            <span className="font-bold text-sm">RADAR DISPLAY LAYERS</span>
          </div>
          <button onClick={onClose} className="p-1 text-[#4e8b69] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Layer Toggles */}
        <div className="p-3 flex flex-col gap-2">
          {layerItems.map(item => {
            const isEnabled = radarLayers[item.key];
            return (
              <div
                key={item.key}
                onClick={() => toggleLayer(item.key)}
                className="p-2.5 bg-[#0b1b13] hover:bg-[#12281c] border border-[#163826] rounded cursor-pointer transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="font-bold text-white group-hover:text-[#00ff66] transition-colors">
                    {item.label}
                  </div>
                  <div className="text-[10px] text-[#4e8b69] mt-0.5">
                    {item.desc}
                  </div>
                </div>

                <div className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 ${
                  isEnabled ? 'bg-[#00ff66] border-[#00ff66] text-black' : 'border-[#2d5c3f] bg-[#07120c]'
                }`}>
                  {isEnabled && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
