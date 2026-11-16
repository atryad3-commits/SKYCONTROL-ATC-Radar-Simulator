/**
 * SKYCONTROL - Professional Aviation VHF Radio Transceiver DSP Console
 * Allows independent configuration of all VHF radio processing stages (300-3000Hz bandpass,
 * AGC compression & limiting, mild analog distortion, static hiss/crackles, signal fading/dropouts,
 * PTT key clicks/squelch, and cockpit ambient bed), 5 quality presets, and Clean-vs-VHF A/B preview.
 */

import React, { useEffect, useState } from 'react';
import {
  Activity,
  GitCompare,
  Loader2,
  Play,
  Radio,
  RotateCcw,
  Sliders,
  Square,
  Volume2,
  Waves,
  X,
} from 'lucide-react';
import {
  VHF_RADIO_PRESETS,
  VhfQualityPresetId,
  VhfRadioSettings,
} from '../audio/vhfRadioDsp';
import { radioAudio } from '../audio/radioAudio';
import { localTtsClient } from '../services/localTtsClient';
import { VoiceProfile } from '../../shared/ttsTypes';

interface VhfRadioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_LIST = Object.values(VHF_RADIO_PRESETS);

export const VhfRadioSettingsModal: React.FC<VhfRadioSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [settings, setSettings] = useState<VhfRadioSettings>(radioAudio.getVhfSettings());
  const [profiles, setProfiles] = useState<VoiceProfile[]>(localTtsClient.getProfilesSync());
  const [previewVoiceId, setPreviewVoiceId] = useState<string>('tower_charon');
  const [previewText, setPreviewText] = useState<string>('');
  const [previewMode, setPreviewMode] = useState<'clean' | 'vhf' | 'ab' | null>(null);
  const [activePhase, setActivePhase] = useState<'clean' | 'vhf' | null>(null);

  useEffect(() => {
    const unsubDsp = radioAudio.onVhfSettingsChange(next => setSettings(next));
    const unsubProfiles = localTtsClient.onProfilesChange(list => setProfiles(list));
    return () => {
      unsubDsp();
      unsubProfiles();
    };
  }, []);

  if (!isOpen) return null;

  const updateField = <K extends keyof VhfRadioSettings>(
    key: K,
    value: VhfRadioSettings[K]
  ) => {
    radioAudio.updateVhfSettings({ [key]: value });
  };

  const handlePresetSelect = (presetId: Exclude<VhfQualityPresetId, 'custom'>) => {
    radioAudio.setVhfPreset(presetId);
  };

  const handlePreview = async (mode: 'clean' | 'vhf' | 'ab') => {
    setPreviewMode(mode);
    setActivePhase(null);
    try {
      await radioAudio.previewVhfComparison({
        voiceId: previewVoiceId,
        customText: previewText.trim() || undefined,
        mode,
        onPhaseChange: phase => setActivePhase(phase),
      });
    } finally {
      setPreviewMode(null);
      setActivePhase(null);
    }
  };

  const handleStopPreview = () => {
    radioAudio.clearQueue();
    setPreviewMode(null);
    setActivePhase(null);
  };

  const selectedProfile = profiles.find(p => p.id === previewVoiceId) || profiles[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 font-mono text-xs select-none">
      <div className="w-full max-w-5xl max-h-[92vh] bg-[#07100b] border border-[#1d4b32] rounded-lg shadow-2xl flex flex-col overflow-hidden text-[#d1e7dd]">
        {/* Header */}
        <div className="px-4 py-2.5 bg-[#0a1710] border-b border-[#163826] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-[#00ff66]" />
            <span className="font-bold text-sm text-[#00ff66] tracking-wide">
              AVIATION VHF RADIO DSP PIPELINE
            </span>
            <span className="px-2 py-0.5 rounded bg-[#0b333d] text-[#00e5ff] border border-[#00e5ff]/40 text-[10px] uppercase">
              {settings.enabled
                ? settings.preset === 'custom'
                  ? 'CUSTOM DSP'
                  : VHF_RADIO_PRESETS[settings.preset]?.shortName || settings.preset
                : 'BYPASSED (CLEAN)'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer bg-[#0d1f15] border border-[#1e4d35] rounded px-2 py-1 text-[10px]">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={e => updateField('enabled', e.target.checked)}
                className="accent-[#00ff66]"
              />
              <span className={settings.enabled ? 'text-[#00ff66] font-bold' : 'text-[#7cc99c]'}>
                VHF DSP {settings.enabled ? 'ON' : 'OFF'}
              </span>
            </label>
            <button
              onClick={() => radioAudio.resetVhfSettings()}
              className="px-2 py-1 bg-[#0d1f15] hover:bg-[#153122] text-[#7cc99c] border border-[#1e4d35] rounded text-[10px] flex items-center gap-1"
              title="Reset VHF parameters to Normal Aviation Radio defaults"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 text-[#7cc99c] hover:text-[#00ff66] rounded hover:bg-[#122b1c]"
              title="Close VHF Radio DSP Settings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#050c08]">
          {/* Section 1: 5 Quality Presets */}
          <div>
            <div className="text-[10px] text-[#558a6a] uppercase font-bold mb-1.5 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#00e5ff]" />
              <span>Radio Propagation & Quality Presets</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {PRESET_LIST.map(preset => {
                const active = settings.preset === preset.id && settings.enabled;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetSelect(preset.id)}
                    className={`text-left p-2.5 rounded border transition-colors ${
                      active
                        ? 'bg-[#0e3820] border-[#00ff66] text-[#e8fff0]'
                        : 'bg-[#09140e] border-[#163826] hover:border-[#275e40] text-[#b4d6c1]'
                    }`}
                  >
                    <div className="font-bold text-[11px] flex items-center justify-between">
                      <span>{preset.name}</span>
                      {active && (
                        <span className="w-2 h-2 rounded-full bg-[#00ff66]" />
                      )}
                    </div>
                    <div className="text-[10px] text-[#6fa584] mt-1 leading-snug">
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Clean vs VHF Side-by-Side Comparison Preview */}
          <div className="bg-[#09140e] border border-[#1d4b32] rounded p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-bold text-[#00e5ff] flex items-center gap-1.5">
                <GitCompare className="w-3.5 h-3.5" />
                <span>OFFLINE VOICE IDENTITY & VHF A/B PREVIEW STUDIO</span>
              </div>
              {activePhase && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    activePhase === 'clean'
                      ? 'bg-[#172844] text-[#7cc4ff] border-[#3a68a8]/50'
                      : 'bg-[#0e3820] text-[#00ff66] border-[#00ff66]/50'
                  }`}
                >
                  {activePhase === 'clean'
                    ? 'PLAYING: CLEAN DRY TTS AUDIO'
                    : 'PLAYING: PROCESSED VHF RADIO'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
              <div className="md:col-span-4">
                <label className="block text-[10px] text-[#558a6a] mb-1">
                  VOICE PROFILE (PRESERVES VOCAL IDENTITY)
                </label>
                <select
                  value={previewVoiceId}
                  onChange={e => setPreviewVoiceId(e.target.value)}
                  className="w-full bg-[#07100b] border border-[#1e4d35] rounded px-2 py-1.5 text-[11px] text-[#d1e7dd]"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.voiceType} ({p.accent})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-8">
                <label className="block text-[10px] text-[#558a6a] mb-1">
                  CUSTOM TEST PHRASE (LEAVE BLANK TO USE PROFILE SAMPLE)
                </label>
                <input
                  type="text"
                  value={previewText}
                  onChange={e => setPreviewText(e.target.value)}
                  placeholder={selectedProfile?.sampleText || 'Enter aviation phrase...'}
                  className="w-full bg-[#07100b] border border-[#1e4d35] rounded px-2.5 py-1.5 text-[11px] text-[#d1e7dd] focus:outline-none focus:border-[#00ff66]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={() => void handlePreview('clean')}
                disabled={Boolean(previewMode)}
                className="px-3 py-1.5 bg-[#0d222b] hover:bg-[#13323f] text-[#7ae8ff] border border-[#1a4859] rounded text-[11px] flex items-center gap-1.5 disabled:opacity-45"
              >
                {previewMode === 'clean' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
                <span>Preview Clean TTS</span>
              </button>

              <button
                onClick={() => void handlePreview('vhf')}
                disabled={Boolean(previewMode)}
                className="px-3 py-1.5 bg-[#0e3820] hover:bg-[#165230] text-[#00ff66] border border-[#00ff66]/40 rounded text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-45"
              >
                {previewMode === 'vhf' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Radio className="w-3.5 h-3.5" />
                )}
                <span>Preview Processed VHF</span>
              </button>

              <button
                onClick={() => void handlePreview('ab')}
                disabled={Boolean(previewMode)}
                className="px-3 py-1.5 bg-[#122b1c] hover:bg-[#1b3d28] text-[#a2f5bf] border border-[#1e4d35] rounded text-[11px] flex items-center gap-1.5 disabled:opacity-45"
              >
                {previewMode === 'ab' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>Compare A/B (Clean → VHF)</span>
              </button>

              {previewMode && (
                <button
                  onClick={handleStopPreview}
                  className="px-2.5 py-1.5 bg-[#3b1216] hover:bg-[#52191f] text-[#ff7070] border border-[#ff4d4d]/40 rounded text-[11px] flex items-center gap-1"
                >
                  <Square className="w-3 h-3" />
                  <span>Stop</span>
                </button>
              )}
            </div>
          </div>

          {/* Section 3: Independent Parameter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Column A: RF & Interference Parameters */}
            <div className="bg-[#09140e] border border-[#163826] rounded p-3 space-y-3">
              <div className="text-[11px] font-bold text-[#00ff66] flex items-center gap-1.5">
                <Waves className="w-3.5 h-3.5" />
                <span>RF Carrier, Noise & Interference Controls</span>
              </div>

              <SliderRow
                label="Noise Intensity (Hiss & Crackles)"
                valueLabel={`${Math.round(settings.noiseIntensity * 100)}%`}
                min={0}
                max={1}
                step={0.01}
                value={settings.noiseIntensity}
                onChange={v => updateField('noiseIntensity', v)}
              />
              <SliderRow
                label="Signal Strength (RF Propagation)"
                valueLabel={`${Math.round(settings.signalStrength * 100)}%`}
                min={0.05}
                max={1}
                step={0.01}
                value={settings.signalStrength}
                onChange={v => updateField('signalStrength', v)}
              />
              <SliderRow
                label="Dropout Probability (Signal Fades)"
                valueLabel={`${Math.round(settings.dropoutProbability * 100)}%`}
                min={0}
                max={1}
                step={0.01}
                value={settings.dropoutProbability}
                onChange={v => updateField('dropoutProbability', v)}
              />
              <SliderRow
                label="Static Center Frequency"
                valueLabel={`${Math.round(settings.staticFrequency)} Hz`}
                min={500}
                max={2600}
                step={25}
                value={settings.staticFrequency}
                onChange={v => updateField('staticFrequency', v)}
              />
              <SliderRow
                label="PTT Key / Squelch Duration"
                valueLabel={`${Math.round(settings.pttDurationMs)} ms`}
                min={25}
                max={220}
                step={5}
                value={settings.pttDurationMs}
                onChange={v => updateField('pttDurationMs', v)}
              />
            </div>

            {/* Column B: Transceiver Filtering, Dynamics & Cockpit Environment */}
            <div className="bg-[#09140e] border border-[#163826] rounded p-3 space-y-3">
              <div className="text-[11px] font-bold text-[#00e5ff] flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                <span>Transceiver Dynamics, Bandwidth & Environment</span>
              </div>

              <SliderRow
                label="Radio AGC Compression & Limiting"
                valueLabel={`${Math.round(settings.compression * 100)}%`}
                min={0}
                max={1}
                step={0.01}
                value={settings.compression}
                onChange={v => updateField('compression', v)}
              />
              <SliderRow
                label="Radio Distortion (Mild Saturation)"
                valueLabel={`${Math.round(settings.distortion * 100)}%`}
                min={0}
                max={1}
                step={0.01}
                value={settings.distortion}
                onChange={v => updateField('distortion', v)}
              />
              <SliderRow
                label="Transmission Volume"
                valueLabel={`${Math.round(settings.transmissionVolume * 100)}%`}
                min={0.2}
                max={1.5}
                step={0.02}
                value={settings.transmissionVolume}
                onChange={v => updateField('transmissionVolume', v)}
              />
              <SliderRow
                label="Radio Clarity (Voice Presence)"
                valueLabel={`${Math.round(settings.radioClarity * 100)}%`}
                min={0}
                max={1}
                step={0.01}
                value={settings.radioClarity}
                onChange={v => updateField('radioClarity', v)}
              />

              <div className="grid grid-cols-2 gap-3 pt-1">
                <SliderRow
                  label="High-Pass Cutoff"
                  valueLabel={`${Math.round(settings.bandpassLowHz)} Hz`}
                  min={220}
                  max={550}
                  step={10}
                  value={settings.bandpassLowHz}
                  onChange={v => updateField('bandpassLowHz', v)}
                />
                <SliderRow
                  label="Low-Pass Cutoff"
                  valueLabel={`${Math.round(settings.bandpassHighHz)} Hz`}
                  min={2100}
                  max={3800}
                  step={50}
                  value={settings.bandpassHighHz}
                  onChange={v => updateField('bandpassHighHz', v)}
                />
              </div>

              <div className="pt-1 border-t border-[#163826] flex items-center justify-between gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[#b4d6c1]">
                  <input
                    type="checkbox"
                    checked={settings.cockpitNoiseEnabled}
                    onChange={e => updateField('cockpitNoiseEnabled', e.target.checked)}
                    className="accent-[#00ff66]"
                  />
                  <span>Cockpit Ambient Avionics / Airframe Bed</span>
                </label>
                <div className="w-36 flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    disabled={!settings.cockpitNoiseEnabled}
                    value={settings.cockpitNoiseLevel}
                    onChange={e => updateField('cockpitNoiseLevel', parseFloat(e.target.value))}
                    className="w-full h-1 accent-[#00e5ff] bg-[#163826] rounded cursor-pointer disabled:opacity-40"
                  />
                  <span className="text-[10px] text-[#7cc99c] w-9 text-right tabular-nums">
                    {Math.round(settings.cockpitNoiseLevel * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SliderRowProps {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
}) => (
  <div>
    <div className="flex items-center justify-between text-[10px] mb-0.5">
      <span className="text-[#9acbb0]">{label}</span>
      <span className="text-[#00ff66] font-bold tabular-nums">{valueLabel}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 accent-[#00ff66] bg-[#163826] rounded cursor-pointer"
    />
  </div>
);
