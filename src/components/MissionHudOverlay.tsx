/**
 * SKYCONTROL - Live Mission HUD Overlay
 * Displays active Academy mission checklist, real-time objective status,
 * pass/fail result banners, and quick restart/next-mission actions.
 */

import React from 'react';
import {
  Award,
  CheckCircle2,
  Circle,
  Play,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';
import { useSimulationStore } from '../store/simulationStore';
import { ACADEMY_MISSIONS } from '../engine/missions';

interface MissionHudOverlayProps {
  onOpenCertificate: () => void;
  onOpenAcademy: () => void;
}

export const MissionHudOverlay: React.FC<MissionHudOverlayProps> = ({
  onOpenCertificate,
  onOpenAcademy,
}) => {
  const activeMission = useSimulationStore(state => state.activeMission);
  const startMission = useSimulationStore(state => state.startMission);
  const exitMission = useSimulationStore(state => state.exitMission);

  if (activeMission.status === 'idle' || !activeMission.mission) {
    return null;
  }

  const msn = activeMission.mission;
  const nextMission = ACADEMY_MISSIONS.find(m => m.number === msn.number + 1);

  return (
    <div className="absolute bottom-10 left-3 z-20 w-80 bg-[#08150f]/95 backdrop-blur-md border border-[#1c4a31] rounded-md shadow-2xl p-3 text-xs select-none pointer-events-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#163826]">
        <div>
          <div className="text-[11px] font-mono text-[#00e5ff]">
            MISSION {msn.number}/5 · {msn.airportIcao} · RWY {msn.landingRunwayId}/{msn.departureRunwayId}
          </div>
          <div className="font-bold text-white text-xs mt-0.5">{msn.title}</div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => startMission(msn.id)}
            className="p-1 rounded hover:bg-[#163826] text-[#85cca1] hover:text-white transition-colors"
            title="Restart Mission"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={exitMission}
            className="p-1 rounded hover:bg-[#2a1214] text-[#85cca1] hover:text-[#ff6b6b] transition-colors"
            title="Exit to Free Operations"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Objectives Checklist */}
      <div className="py-2.5 flex flex-col gap-1.5 tabular-nums">
        {activeMission.objectives.map(obj => (
          <div
            key={obj.id}
            className="flex items-center justify-between gap-2 text-[11px]"
          >
            <div className="flex items-center gap-1.5">
              {obj.failed ? (
                <XCircle className="w-3.5 h-3.5 text-[#ff4d4d] shrink-0" />
              ) : obj.completed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00ff66] shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-[#4e8b69] shrink-0" />
              )}
              <span
                className={
                  obj.failed
                    ? 'text-[#ff858d] font-semibold'
                    : obj.completed
                    ? 'text-[#00ff66] font-semibold'
                    : 'text-[#d1e7dd]'
                }
              >
                {obj.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Pass / Fail Outcome Footer */}
      {activeMission.status === 'passed' && (
        <div className="pt-2.5 border-t border-[#163826] flex flex-col gap-2">
          <div className="p-2 bg-[#0c291b] border border-[#00ff66]/50 rounded text-[#00ff66] font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Mission Accomplished!</span>
          </div>
          <div className="flex items-center gap-2">
            {nextMission ? (
              <button
                onClick={() => startMission(nextMission.id)}
                className="flex-1 py-1.5 px-3 bg-[#00ff66] hover:bg-[#39ff14] text-black font-bold rounded flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Next Mission ({nextMission.number})</span>
              </button>
            ) : (
              <button
                onClick={onOpenCertificate}
                className="flex-1 py-1.5 px-3 bg-[#ffd166] hover:bg-[#ffe08a] text-black font-bold rounded flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Award className="w-3.5 h-3.5" />
                <span>View ATC Certificate</span>
              </button>
            )}
            <button
              onClick={onOpenAcademy}
              className="py-1.5 px-2.5 bg-[#0f281a] hover:bg-[#183d29] text-[#a2f5bf] border border-[#1e4a31] rounded transition-colors whitespace-nowrap"
            >
              Academy
            </button>
          </div>
        </div>
      )}

      {activeMission.status === 'failed' && (
        <div className="pt-2.5 border-t border-[#163826] flex flex-col gap-2">
          <div className="p-2 bg-[#361114] border border-[#ff3344]/60 rounded text-[#ffb3b8] text-[11px] flex items-start gap-1.5">
            <XCircle className="w-4 h-4 text-[#ff4d4d] shrink-0 mt-0.5" />
            <span>{activeMission.failReason || 'Mission Failed.'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => startMission(msn.id)}
              className="flex-1 py-1.5 px-3 bg-[#ff4d4d] hover:bg-[#ff6666] text-black font-bold rounded flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Mission</span>
            </button>
            <button
              onClick={exitMission}
              className="py-1.5 px-2.5 bg-[#0f281a] hover:bg-[#183d29] text-[#a2f5bf] border border-[#1e4a31] rounded transition-colors whitespace-nowrap"
            >
              Free Ops
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
