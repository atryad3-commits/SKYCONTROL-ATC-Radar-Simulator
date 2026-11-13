/**
 * SKYCONTROL - Radio Communications Log & VHF Transceiver
 * Displays live transcripts of ATC controller commands and pilot readbacks,
 * with realistic VHF radio check, mute/volume controls, and active frequency indicators.
 */

import React, { useRef, useEffect, useState } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { Radio, Volume2, VolumeX, Mic, Headset } from 'lucide-react';
import {
  radioAudio,
  TOWER_VOICE_PROFILES,
  TowerVoiceId,
  OfflineVoiceOption,
} from '../audio/radioAudio';

export const RadioTranscript: React.FC = () => {
  const radioMessages = useSimulationStore(state => state.radioMessages);
  const airportProfile = useSimulationStore(state => state.airportProfile);
  const aircraft = useSimulationStore(state => state.aircraft);
  const audioMuted = useSimulationStore(state => state.audioMuted);
  const audioVolume = useSimulationStore(state => state.audioVolume);
  const towerVoiceId = useSimulationStore(state => state.towerVoiceId);
  const activeTransmission = useSimulationStore(state => state.activeTransmission);
  const setAudioMuted = useSimulationStore(state => state.setAudioMuted);
  const setAudioVolume = useSimulationStore(state => state.setAudioVolume);
  const setTowerVoice = useSimulationStore(state => state.setTowerVoice);

  const [offlineVoices, setOfflineVoices] = useState<OfflineVoiceOption[]>([]);
  const listTopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return radioAudio.onVoicesChange(voices => setOfflineVoices(voices));
  }, []);

  // Keep newest message (prepended at index 0) visible at top of log
  useEffect(() => {
    listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [radioMessages.length]);

  const handleTestRadio = () => {
    radioAudio.initAudioContext();
    const targetAc = aircraft[0];
    const targetCallsign = targetAc?.callsign || 'BAW452';
    const targetTelephony = targetAc?.telephony || 'Speedbird';
    const flightNum = targetCallsign.slice(3) || '452';
    const freq = airportProfile.vhfFrequency;
    const dir = airportProfile.directorCallsign;

    const nowTime = new Date().toTimeString().split(' ')[0];
    const atcText = `${targetCallsign}, ${airportProfile.airport.name} Director, radio check on ${freq}`;
    const pilotPhrase = `Readability five, loud and clear`;

    const atcMsg = {
      id: `atc_check_${Date.now()}`,
      timestamp: nowTime,
      sender: 'ATC' as const,
      callsign: dir,
      text: atcText,
      frequency: freq,
    };

    useSimulationStore.setState(state => ({
      radioMessages: [atcMsg, ...state.radioMessages.slice(0, 49)],
    }));

    radioAudio.speakRadioExchange(
      atcText,
      targetCallsign,
      pilotPhrase,
      () => {
        const pilotTime = new Date().toTimeString().split(' ')[0];
        const pilotMsg = {
          id: `pilot_check_${Date.now()}`,
          timestamp: pilotTime,
          sender: 'PILOT' as const,
          callsign: targetCallsign,
          text: `${pilotPhrase}, ${targetTelephony} ${flightNum}`,
          frequency: freq,
        };
        useSimulationStore.setState(state => ({
          radioMessages: [pilotMsg, ...state.radioMessages.slice(0, 49)],
        }));
      },
      {
        airportIcao: airportProfile.airport.icao,
        airline: targetAc?.airline,
        aircraftType: targetAc?.aircraftType,
        isHeavy: targetAc?.category === 'Heavy',
        pilotHasCallsign: false,
        activeCallsigns: aircraft.map(f => f.callsign),
      }
    );
  };

  return (
    <div className="h-28 bg-[#07100b] border-t border-[#163826] flex flex-col font-mono text-xs select-none shrink-0">
      {/* Header Bar */}
      <div className="h-7 px-3 bg-[#0a1710] border-b border-[#163826] flex items-center justify-between text-[11px] gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-bold text-[#00ff66] flex items-center gap-1.5 truncate">
            <Radio className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              VHF COMMS ({airportProfile.vhfFrequency} · {airportProfile.airport.name.toUpperCase()})
            </span>
          </span>

          {activeTransmission && (
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase shrink-0 ${
                activeTransmission.speaker === 'ATC'
                  ? 'bg-[#0b333d] text-[#00e5ff] border border-[#00e5ff]/40'
                  : 'bg-[#0e3820] text-[#00ff66] border border-[#00ff66]/40'
              }`}
            >
              TX ·{' '}
              {activeTransmission.speaker === 'ATC'
                ? airportProfile.directorCallsign
                : activeTransmission.callsign}
              {activeTransmission.voiceLabel ? ` (${activeTransmission.voiceLabel})` : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* User-Selectable Offline Tower / ATC Controller Voice */}
          <label
            className="flex items-center gap-1 text-[10px] text-[#7cc99c] bg-[#0d1f15] border border-[#1e4d35] rounded px-1.5 py-0.5 max-w-[230px]"
            title="انتخاب صدای کنترلر برج مراقبت (آفلاین · از صداهای سیستم)"
          >
            <Headset className="w-3 h-3 text-[#00e5ff] shrink-0" />
            <span className="text-[#558a6a] hidden sm:inline">TOWER:</span>
            <select
              value={towerVoiceId}
              onChange={e => setTowerVoice(e.target.value as TowerVoiceId)}
              aria-label="Tower ATC Voice"
              className="bg-transparent text-[#00e5ff] font-semibold focus:outline-none cursor-pointer text-[10px] truncate max-w-[175px]"
            >
              <optgroup label="پروفایل‌های برج (آفلاین)" className="bg-[#07100b] text-[#7cc99c]">
                {TOWER_VOICE_PROFILES.map(profile => (
                  <option key={profile.id} value={profile.id} className="bg-[#07100b] text-[#d1e7dd]">
                    {profile.shortLabel}
                  </option>
                ))}
              </optgroup>
              {offlineVoices.length > 0 && (
                <optgroup
                  label={`صداهای نصب‌شده دستگاه (${offlineVoices.length})`}
                  className="bg-[#07100b] text-[#7cc99c]"
                >
                  {offlineVoices.map(v => (
                    <option
                      key={v.voiceURI}
                      value={`voice:${v.voiceURI}`}
                      className="bg-[#07100b] text-[#d1e7dd]"
                    >
                      {v.displayName}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

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
        <div ref={listTopRef} />
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
      </div>
    </div>
  );
};
