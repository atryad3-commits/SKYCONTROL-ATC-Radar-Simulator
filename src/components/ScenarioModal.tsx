/**
 * SKYCONTROL - Scenario Selector Modal
 */

import React from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { X, Play, Shield, Wind, Flame, Users } from 'lucide-react';
import { generateInboundFlight, generateDepartureFlight } from '../engine/trafficGenerator';

interface ScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ScenarioDef {
  id: string;
  title: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  description: string;
  icon: React.ReactNode;
  setup: () => void;
}

export const ScenarioModal: React.FC<ScenarioModalProps> = ({ isOpen, onClose }) => {
  const resetSimulation = useSimulationStore(state => state.resetSimulation);

  if (!isOpen) return null;

  const scenarios: ScenarioDef[] = [
    {
      id: 'beginner',
      title: 'Normal Operations (Westerly 27R/27L)',
      difficulty: 'Beginner',
      description: 'Standard Heathrow dual runway flow. Inbounds landing 27R, departures climbing 27L with calm 12kt headwind.',
      icon: <Users className="w-5 h-5 text-[#00ff66]" />,
      setup: () => {
        resetSimulation('beginner');
        onClose();
      },
    },
    {
      id: 'rush_hour',
      title: 'Heathrow Evening Rush Hour',
      difficulty: 'Intermediate',
      description: 'Dense traffic entering concurrently from Bovingdon (BNN), Lambourne (LAM), Biggin (BIG), and Ockham (OCK). Maintain 3 NM spacing on final.',
      icon: <Users className="w-5 h-5 text-[#00e5ff]" />,
      setup: () => {
        const store = useSimulationStore.getState();
        const f1 = generateInboundFlight(10);
        f1.x = 26; f1.y = 16; f1.altitude = 11000; f1.heading = 230; f1.targetHeading = 230;
        const f2 = generateInboundFlight(11);
        f2.x = 22; f2.y = -18; f2.altitude = 9000; f2.heading = 310; f2.targetHeading = 310;
        const f3 = generateInboundFlight(12);
        f3.x = -24; f3.y = 22; f3.altitude = 12000; f3.heading = 140; f3.targetHeading = 140;
        const f4 = generateInboundFlight(13);
        f4.x = 16; f4.y = 0.38; f4.altitude = 4000; f4.heading = 270; f4.targetHeading = 270; f4.ilsArmed = true;
        const f5 = generateInboundFlight(14);
        f5.x = 24; f5.y = 0.38; f5.altitude = 6000; f5.heading = 270; f5.targetHeading = 270;
        const dep1 = generateDepartureFlight();

        useSimulationStore.setState({
          aircraft: [f1, f2, f3, f4, f5, dep1],
          selectedAircraftId: f1.id,
          stats: {
            landings: 0,
            departures: 0,
            goArounds: 0,
            separationViolations: 0,
            score: 100,
            elapsedSeconds: 0,
          },
        });
        onClose();
      },
    },
    {
      id: 'crosswind',
      title: 'Strong Crosswind & Gusts',
      difficulty: 'Advanced',
      description: 'Wind 200° at 24 knots with gusts to 32 knots. Account for significant ground drift during vectoring onto localizer 27R.',
      icon: <Wind className="w-5 h-5 text-[#ffd166]" />,
      setup: () => {
        resetSimulation('crosswind');
        useSimulationStore.setState({
          weather: {
            windDirection: 200,
            windSpeed: 24,
            gusts: 32,
            qnh: 998,
            visibilityNM: 6,
            ceilingFeet: 2500,
            precipitation: 'Light Rain',
          },
        });
        onClose();
      },
    },
    {
      id: 'conflict_masterclass',
      title: 'Imminent Conflict Resolution',
      difficulty: 'Expert',
      description: 'Two inbound airliners on converging headings at identical flight levels. Take immediate tactical action to prevent STCA violation.',
      icon: <Flame className="w-5 h-5 text-[#ff3344]" />,
      setup: () => {
        const ac1 = generateInboundFlight(91);
        ac1.callsign = 'BAW208';
        ac1.airline = 'British Airways';
        ac1.telephony = 'Speedbird';
        ac1.x = 14; ac1.y = 12;
        ac1.altitude = 6000; ac1.targetAltitude = 6000;
        ac1.heading = 220; ac1.targetHeading = 220;
        ac1.indicatedAirspeed = 230; ac1.targetAirspeed = 230;

        const ac2 = generateInboundFlight(92);
        ac2.callsign = 'VIR44';
        ac2.airline = 'Virgin Atlantic';
        ac2.telephony = 'Virgin';
        ac2.x = 10; ac2.y = 4;
        ac2.altitude = 6000; ac2.targetAltitude = 6000;
        ac2.heading = 330; ac2.targetHeading = 330;
        ac2.indicatedAirspeed = 230; ac2.targetAirspeed = 230;

        useSimulationStore.setState({
          aircraft: [ac1, ac2],
          selectedAircraftId: ac1.id,
          stats: {
            landings: 0,
            departures: 0,
            goArounds: 0,
            separationViolations: 0,
            score: 100,
            elapsedSeconds: 0,
          },
        });
        onClose();
      },
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[#091510] border border-[#1b422d] rounded-lg shadow-2xl flex flex-col font-mono text-xs select-none">
        {/* Header */}
        <div className="px-4 py-3 bg-[#0d2016] border-b border-[#1b422d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#00ff66]" />
            <span className="font-bold text-sm text-[#00ff66]">SELECT ATC SCENARIO</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#4e8b69] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scenarios List */}
        <div className="p-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
          {scenarios.map(sc => (
            <div
              key={sc.id}
              onClick={sc.setup}
              className="p-3 bg-[#0a1711] hover:bg-[#132c1e] border border-[#163826] hover:border-[#00ff66] rounded cursor-pointer transition-all flex items-start gap-3 group"
            >
              <div className="p-2 bg-[#0d2116] rounded border border-[#1a422c] shrink-0 mt-0.5">
                {sc.icon}
              </div>

              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-white group-hover:text-[#00ff66] transition-colors">
                    {sc.title}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                    sc.difficulty === 'Beginner'
                      ? 'bg-[#00ff66]/15 text-[#00ff66]'
                      : sc.difficulty === 'Intermediate'
                      ? 'bg-[#00e5ff]/15 text-[#00e5ff]'
                      : sc.difficulty === 'Advanced'
                      ? 'bg-[#ffd166]/15 text-[#ffd166]'
                      : 'bg-[#ff3344]/15 text-[#ff3344]'
                  }`}>
                    {sc.difficulty}
                  </span>
                </div>
                <p className="text-[#85cca1] text-[11px] leading-relaxed">
                  {sc.description}
                </p>
              </div>

              <div className="shrink-0 self-center pl-2">
                <Play className="w-4 h-4 text-[#4e8b69] group-hover:text-[#00ff66] transition-colors" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
