/**
 * SKYCONTROL - Radio Communications Log & VHF Transceiver
 * Displays live transcripts of ATC controller commands and pilot readbacks,
 * with audio volume control and frequency indicators.
 */

import React, { useRef, useEffect } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { Radio, Volume2, VolumeX, Mic } from 'lucide-react';
import { radioAudio } from '../audio/radioAudio';

export const RadioTranscript: React.FC = () => {
  const radioMessages = useSimulationStore(state => state.radioMessages);
  const airportProfile = useSimulationStore(state => state.airportProfile);
  const aircraft = useSimulationStore(state => state.aircraft);
  const audioMuted = useSimulationStore(state => state.audioMuted);
  const audioVolume = useSimulationStore(state => state.audioVolume);
  const setAudioMuted = useSimulationStore(state => state.setAudioMuted);
  const setAudioVolume = useSimulationStore(state => state.setAudioVolume);

  const logEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll transcript log to latest message
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [radioMessages]);

  // Trigger test radio click transmission
  const handleTestRadio = () => {
    radioAudio.initAudioContext();
    const targetAc = aircraft[0];
    const targetCallsign = targetAc?.callsign || 'SKY101';
    const targetTelephony = targetAc?.telephony || 'Skyline';
    const freq = airportProfile.vhfFrequency;
    const dir = airportProfile.directorCallsign;

    const nowTime = new Date().toTimeString().split(' ')[0];
    const atcMsg = {
      id: `atc_check_${Date.now()}`,
      timestamp: nowTime,
      sender: 'ATC' as const,
      callsign: dir,
      text: `${targetCallsign}, ${airportProfile.airport.name} Radar, radio check on ${freq}`,
      frequency: freq,
    };
    useSimulationStore.setState(state => ({
      radioMessages: [atcMsg, ...state.radioMessages.slice(0, 49)],
    }));

    setTimeout(() => {
      const pilotTime = new Date().toTimeString().split(' ')[0];
      const text = `Readability five, loud and clear, ${targetTelephony}`;
      const pilotMsg = {
        id: `pilot_check_${Date.now()}`,
        timestamp: pilotTime,
        sender: 'PILOT' as const,
        callsign: targetCallsign,
        text,
        frequency: freq,
      };
      useSimulationStore.setState(state => ({
        radioMessages: [pilotMsg, ...state.radioMessages.slice(0, 49)],
      }));
      radioAudio.speakPilotReadback(targetCallsign, text);
    }, 1200);
  };

  return (
    <div className="h-28 bg-[#07100b] border-t border-[#163826] flex flex-col font-mono text-xs select-none shrink-0">
      {/* Header Bar */}
      <div className="h-6 px-3 bg-[#0a1710] border-b border-[#163826] flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-3">
          <span className="font-bold text-[#00ff66] flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5" />
            <span>
              VHF COMMS TRANSCRIPT ({airportProfile.vhfFrequency} · {airportProfile.airport.name.toUpperCase()})
            </span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Test radio transmission */}
          <button
            onClick={handleTestRadio}
            className="px-2 py-0.5 bg-[#122b1c] hover:bg-[#1b3d28] text-[#a2f5bf] border border-[#1e4d35] rounded text-[10px] flex items-center gap-1 transition-colors whitespace-nowrap"
            title="Send test radio check"
          >
            <Mic className="w-3 h-3 text-[#00ff66]" />
            <span>Radio Check</span>
          </button>

          {/* Volume slider */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setAudioMuted(!audioMuted)}
              className="text-[#558a6a] hover:text-[#00ff66]"
              title={audioMuted ? 'Unmute VHF' : 'Mute VHF'}
            >
              {audioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audioVolume}
              onChange={e => setAudioVolume(parseFloat(e.target.value))}
              className="w-16 h-1 accent-[#00ff66] bg-[#163826] rounded cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Transcript Log List */}
      <div className="flex-1 p-2 overflow-y-auto flex flex-col gap-1 text-[11px] tabular-nums">
        {radioMessages.map(msg => (
          <div key={msg.id} className="flex items-baseline gap-2">
            <span className="text-[#3b6d4e] shrink-0 text-[10px]">{msg.timestamp}</span>
            <span
              className={`font-bold shrink-0 ${
                msg.sender === 'ATC' ? 'text-[#00e5ff]' : 'text-[#00ff66]'
              }`}
            >
              {msg.sender === 'ATC' ? `${msg.callsign || airportProfile.directorCallsign}:` : `${msg.callsign}:`}
            </span>
            <span className="text-[#d1e7dd]">{msg.text}</span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};
