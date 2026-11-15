/**
 * SKYCONTROL - Local Offline Speech Engine & 15-Voice Profile Manager Modal
 * Allows operators to inspect the offline Kokoro-82M ONNX model, monitor background worker queue
 * & WAV disk/IndexedDB caches, tune all 15 distinct ATC/Pilot voices, audition WAV samples,
 * and test live local ICAO speech synthesis without touching any external network or cloud API.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Cpu,
  Database,
  Play,
  RefreshCw,
  RotateCcw,
  Sliders,
  Trash2,
  Volume2,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Power,
  Radio,
} from 'lucide-react';
import {
  MAX_VOICE_PROFILES,
  TtsEngineStatus,
  VoiceProfile,
  VoiceType,
} from '../../shared/ttsTypes';
import { localTtsClient } from '../services/localTtsClient';
import { radioAudio } from '../audio/radioAudio';

interface VoiceEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_ORDER: VoiceType[] = ['TOWER', 'APPROACH', 'GROUND', 'PILOT'];

const ROLE_LABELS: Record<VoiceType, { title: string; badgeClass: string }> = {
  TOWER: {
    title: 'Tower Controllers (3)',
    badgeClass: 'bg-[#0b333d] text-[#00e5ff] border-[#00e5ff]/40',
  },
  APPROACH: {
    title: 'Approach Director (1)',
    badgeClass: 'bg-[#172844] text-[#7cc4ff] border-[#3a68a8]/50',
  },
  GROUND: {
    title: 'Ground Controller (1)',
    badgeClass: 'bg-[#2c2511] text-[#ffd166] border-[#6e5a1d]/60',
  },
  PILOT: {
    title: 'Flight Deck Pilot Crews (10)',
    badgeClass: 'bg-[#0e3820] text-[#00ff66] border-[#00ff66]/40',
  },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const VoiceEngineModal: React.FC<VoiceEngineModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<TtsEngineStatus | null>(null);
  const [profiles, setProfiles] = useState<VoiceProfile[]>(localTtsClient.getProfilesSync());
  const [roleFilter, setRoleFilter] = useState<'ALL' | VoiceType>('ALL');
  const [auditioningId, setAuditioningId] = useState<string | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [testPhrase, setTestPhrase] = useState(
    'BAW452, turn left heading 180, descend 3,000 feet, QNH 1013, cleared ILS runway 27R'
  );
  const [testVoiceId, setTestVoiceId] = useState('tower_charon');
  const [testingSynth, setTestingSynth] = useState(false);

  const refreshAll = useCallback(async () => {
    const [st, profs] = await Promise.all([
      localTtsClient.fetchStatus(),
      localTtsClient.fetchProfiles(),
    ]);
    if (st) setStatus(st);
    setProfiles(profs);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void refreshAll();
    const timer = setInterval(() => {
      void localTtsClient.fetchStatus().then(st => {
        if (st) setStatus(st);
      });
    }, 2000);
    const unsub = localTtsClient.onProfilesChange(next => setProfiles(next));
    return () => {
      clearInterval(timer);
      unsub();
    };
  }, [isOpen, refreshAll]);

  if (!isOpen) return null;

  const handleToggleEnabled = async (profile: VoiceProfile) => {
    setErrorMsg(null);
    try {
      await localTtsClient.updateProfile(profile.id, { enabled: !profile.enabled });
      await refreshAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleParamChange = async (
    profile: VoiceProfile,
    field: 'speed' | 'pitch' | 'stability',
    value: number
  ) => {
    setErrorMsg(null);
    try {
      await localTtsClient.updateProfile(profile.id, { [field]: value });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePlaySample = async (profile: VoiceProfile) => {
    setErrorMsg(null);
    setAuditioningId(profile.id);
    try {
      const ok = await radioAudio.auditionVoiceProfile(profile);
      if (!ok) {
        setErrorMsg(`Sample audio could not play for ${profile.displayName}.`);
      }
    } finally {
      setAuditioningId(null);
    }
  };

  const handleRegenerateSample = async (profile: VoiceProfile) => {
    setErrorMsg(null);
    setAuditioningId(profile.id);
    try {
      await localTtsClient.fetchProfileSampleWav(profile.id, true);
      await radioAudio.auditionVoiceProfile(profile);
      await refreshAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setAuditioningId(null);
    }
  };

  const handleLoadToggle = async () => {
    setModelBusy(true);
    setErrorMsg(null);
    try {
      if (status?.model.state === 'ready') {
        await localTtsClient.unloadModel();
      } else {
        await localTtsClient.loadModel();
      }
      await refreshAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setModelBusy(false);
    }
  };

  const handleClearCache = async () => {
    await localTtsClient.clearCache();
    await refreshAll();
  };

  const handleResetProfiles = async () => {
    setErrorMsg(null);
    await localTtsClient.resetProfiles();
    await refreshAll();
  };

  const handleRunCustomTest = async () => {
    const profile = profiles.find(p => p.id === testVoiceId) || profiles[0];
    if (!profile || !testPhrase.trim()) return;
    setTestingSynth(true);
    setErrorMsg(null);
    try {
      const ok = await radioAudio.auditionVoiceProfile(profile, testPhrase);
      if (!ok) {
        setErrorMsg('Local synthesis did not return audio (check model load status).');
      }
      await refreshAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingSynth(false);
    }
  };

  const filteredGroups = ROLE_ORDER.filter(r => roleFilter === 'ALL' || roleFilter === r);
  const modelState = status?.model.state || 'unloaded';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono text-xs select-none">
      <div className="w-full max-w-5xl max-h-[90vh] bg-[#07110c] border border-[#1d4c33] rounded-lg shadow-2xl flex flex-col overflow-hidden text-[#d1e7dd]">
        {/* Modal Header */}
        <div className="px-4 py-3 bg-[#0a1911] border-b border-[#193f2b] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-[#00ff66]" />
            <div>
              <h2 className="text-sm font-bold text-[#00ff66] tracking-wide">
                LOCAL OFFLINE SPEECH ENGINE · KOKORO-82M ONNX
              </h2>
              <p className="text-[10px] text-[#6ca884]">
                100% Local Worker Inference · Zero Cloud APIs · {profiles.length}/{MAX_VOICE_PROFILES} Neural Speaker Profiles
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded bg-[#0e2217] hover:bg-[#173625] text-[#84cfa3] border border-[#1d4a31]"
            aria-label="Close Local TTS Engine Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Engine, Model & Cache Telemetry Strip */}
        <div className="p-3 bg-[#09160f] border-b border-[#163826] grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {/* Model Status */}
          <div className="p-2.5 rounded bg-[#0c1d14] border border-[#1a432d] flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#a2f5bf]">
                <Cpu className="w-3.5 h-3.5 text-[#00e5ff]" />
                LOCAL MODEL MANAGER
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${
                  modelState === 'ready'
                    ? 'bg-[#0e3820] text-[#00ff66] border-[#00ff66]/40'
                    : modelState === 'loading'
                    ? 'bg-[#2c2511] text-[#ffd166] border-[#ffd166]/40'
                    : modelState === 'error'
                    ? 'bg-[#361414] text-[#ff6b6b] border-[#ff6b6b]/40'
                    : 'bg-[#12221a] text-[#7ea68f] border-[#294f3a]'
                }`}
              >
                {modelState}
              </span>
            </div>
            <div className="text-[10px] text-[#7cb493] space-y-0.5 tabular-nums">
              <div className="truncate text-[#d1e7dd]">
                {status?.model.modelId || 'Kokoro-82M-v1.0-ONNX'} ({status?.model.dtype || 'q8'})
              </div>
              <div>
                Disk: {status ? formatBytes(status.model.totalDiskBytes) : '88.1 MB'} ·{' '}
                {status?.model.availableVoicesCount ?? 28} speaker bins · Apache-2.0
              </div>
              {status?.model.loadDurationMs !== null && status?.model.loadDurationMs !== undefined && (
                <div>Load time: {status.model.loadDurationMs} ms · Worker: {status.workerAlive ? 'Online' : 'Idle'}</div>
              )}
            </div>
            <button
              onClick={handleLoadToggle}
              disabled={modelBusy}
              className="w-full py-1 rounded bg-[#112c1d] hover:bg-[#19402b] border border-[#24593b] text-[#00ff66] text-[10px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {modelBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
              <span>{modelState === 'ready' ? 'Unload Worker Model' : 'Load Local Model'}</span>
            </button>
          </div>

          {/* Background Queue Status */}
          <div className="p-2.5 rounded bg-[#0c1d14] border border-[#1a432d] flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#a2f5bf]">
                <Sliders className="w-3.5 h-3.5 text-[#00ff66]" />
                BACKGROUND WORKER QUEUE
              </span>
              <span className="text-[10px] text-[#00e5ff] tabular-nums">
                {status?.queue.processingCount ? 'SYNTHESIZING' : 'IDLE'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center tabular-nums">
              <div className="p-1.5 rounded bg-[#08130d] border border-[#153523]">
                <div className="text-[9px] text-[#5e9474]">QUEUED</div>
                <div className="text-sm font-bold text-[#ffd166]">{status?.queue.queuedCount ?? 0}</div>
              </div>
              <div className="p-1.5 rounded bg-[#08130d] border border-[#153523]">
                <div className="text-[9px] text-[#5e9474]">COMPLETED</div>
                <div className="text-sm font-bold text-[#00ff66]">{status?.queue.completedCount ?? 0}</div>
              </div>
              <div className="p-1.5 rounded bg-[#08130d] border border-[#153523]">
                <div className="text-[9px] text-[#5e9474]">FAILED</div>
                <div className="text-sm font-bold text-[#ff6b6b]">{status?.queue.failedCount ?? 0}</div>
              </div>
            </div>
            <div className="text-[10px] text-[#6ca884] truncate">
              {status?.queue.activeJob
                ? `Active: ${status.queue.activeJob.voiceId} · "${status.queue.activeJob.text}"`
                : `Active profiles: ${status?.enabledProfilesCount ?? profiles.filter(p => p.enabled).length}/${profiles.length}`}
            </div>
          </div>

          {/* WAV Cache & Metadata Store */}
          <div className="p-2.5 rounded bg-[#0c1d14] border border-[#1a432d] flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#a2f5bf]">
                <Database className="w-3.5 h-3.5 text-[#ffd166]" />
                WAV DISK & BROWSER CACHE
              </span>
              <span className="text-[10px] text-[#7cc99c] tabular-nums">
                {status ? `${status.cache.entryCount} WAVs` : 'Local'}
              </span>
            </div>
            <div className="text-[10px] text-[#7cb493] space-y-0.5 tabular-nums">
              <div>
                Disk Used: {status ? formatBytes(status.cache.totalSizeBytes) : '0 B'} / 250 MB
              </div>
              <div>
                Hits: {status?.cache.hitCount ?? 0} · Misses: {status?.cache.missCount ?? 0} · Format: 24kHz PCM-16 WAV
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleClearCache}
                className="flex-1 py-1 rounded bg-[#231414] hover:bg-[#361d1d] border border-[#542929] text-[#ff8a8a] text-[10px] font-semibold flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear WAV Cache</span>
              </button>
              <button
                onClick={handleResetProfiles}
                className="px-2.5 py-1 rounded bg-[#10261b] hover:bg-[#173626] border border-[#235238] text-[#9ee8bc] text-[10px] font-semibold flex items-center gap-1"
                title="Reset all 15 voice profiles to default tuning"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Synthesis Tester Bar */}
        <div className="px-3 py-2 bg-[#08130d] border-b border-[#163826] flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold text-[#00e5ff] uppercase shrink-0">Live Test:</span>
          <select
            value={testVoiceId}
            onChange={e => setTestVoiceId(e.target.value)}
            className="bg-[#0d1f15] border border-[#1d4b32] rounded px-2 py-1 text-[11px] text-[#d1e7dd] max-w-[200px]"
          >
            {profiles.map(p => (
              <option key={p.id} value={p.id}>
                [{p.voiceType}] {p.displayName} ({p.voiceConfig.kokoroVoiceId})
              </option>
            ))}
          </select>
          <input
            type="text"
            value={testPhrase}
            onChange={e => setTestPhrase(e.target.value)}
            className="flex-1 min-w-[220px] bg-[#0d1f15] border border-[#1d4b32] rounded px-2.5 py-1 text-[11px] text-[#d1e7dd] focus:outline-none focus:border-[#00ff66]"
            placeholder="Enter ICAO ATC or Pilot phrase to synthesize offline..."
          />
          <button
            onClick={handleRunCustomTest}
            disabled={testingSynth}
            className="px-3 py-1 rounded bg-[#133b24] hover:bg-[#1c5233] text-[#00ff66] border border-[#266b43] font-semibold text-[11px] flex items-center gap-1.5 disabled:opacity-50"
          >
            {testingSynth ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
            <span>Synthesize & Play VHF</span>
          </button>
        </div>

        {errorMsg && (
          <div className="px-4 py-1.5 bg-[#331313] border-b border-[#662626] text-[#ff9b9b] text-[11px] flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="px-3 py-2 bg-[#0a1710] border-b border-[#163826] flex items-center gap-1.5">
          {(['ALL', 'TOWER', 'APPROACH', 'GROUND', 'PILOT'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setRoleFilter(tab)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                roleFilter === tab
                  ? 'bg-[#17422a] text-[#00ff66] border border-[#2b7a4f]'
                  : 'bg-[#0d1e15] text-[#6aa382] border border-[#173624] hover:text-[#b2f0ca]'
              }`}
            >
              {tab === 'ALL'
                ? `ALL (${profiles.length})`
                : `${tab} (${profiles.filter(p => p.voiceType === tab).length})`}
            </button>
          ))}
        </div>

        {/* Scrollable 15 Voice Profiles Grid */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {filteredGroups.map(role => {
            const groupProfiles = profiles.filter(p => p.voiceType === role);
            if (groupProfiles.length === 0) return null;
            const roleMeta = ROLE_LABELS[role];

            return (
              <section key={role} className="space-y-2">
                <div className="flex items-center justify-between border-b border-[#163826] pb-1">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#9adbb4]">
                    {roleMeta.title}
                  </h3>
                  <span className="text-[10px] text-[#5e9474]">
                    {groupProfiles.filter(p => p.enabled).length} enabled
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                  {groupProfiles.map(profile => (
                    <div
                      key={profile.id}
                      className={`p-2.5 rounded border transition-colors ${
                        profile.enabled
                          ? 'bg-[#0c1d14] border-[#1d4a31]'
                          : 'bg-[#08120c] border-[#142b1e] opacity-65'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${roleMeta.badgeClass}`}
                            >
                              {profile.voiceType}
                            </span>
                            <span className="font-bold text-[#e2f5ea] truncate">
                              {profile.displayName}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#6ca884] mt-0.5 truncate">
                            {profile.accent} · {profile.gender === 'M' ? 'Male' : 'Female'} · Kokoro{' '}
                            <code className="text-[#00e5ff]">{profile.voiceConfig.kokoroVoiceId}</code>{' '}
                            ({profile.voiceConfig.qualityGrade}) · {profile.voiceConfig.timbreDescription}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handlePlaySample(profile)}
                            disabled={auditioningId === profile.id}
                            className="px-2 py-1 rounded bg-[#133522] hover:bg-[#1a4a2f] text-[#00ff66] border border-[#246340] text-[10px] font-semibold flex items-center gap-1"
                            title={`Play sample WAV: "${profile.sampleText}"`}
                          >
                            {auditioningId === profile.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                            <span>Sample</span>
                          </button>

                          <button
                            onClick={() => handleRegenerateSample(profile)}
                            disabled={auditioningId === profile.id}
                            className="p-1 rounded bg-[#0e2318] hover:bg-[#163625] text-[#7cc99c] border border-[#1d4830]"
                            title="Re-synthesize WAV sample with current speed"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>

                          <button
                            onClick={() => handleToggleEnabled(profile)}
                            className={`px-2 py-1 rounded text-[10px] font-bold border flex items-center gap-1 ${
                              profile.enabled
                                ? 'bg-[#0e3820] text-[#00ff66] border-[#00ff66]/40'
                                : 'bg-[#2a1515] text-[#ff8a8a] border-[#592b2b]'
                            }`}
                          >
                            {profile.enabled && <CheckCircle2 className="w-3 h-3" />}
                            <span>{profile.enabled ? 'ON' : 'OFF'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Tuning Sliders: Speed, Pitch, Stability */}
                      <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-[#143422] text-[10px] tabular-nums">
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[#6aa382] flex justify-between">
                            <span>Speed</span>
                            <span className="text-[#d1e7dd]">{profile.speed.toFixed(2)}x</span>
                          </span>
                          <input
                            type="range"
                            min="0.75"
                            max="1.35"
                            step="0.02"
                            value={profile.speed}
                            onChange={e =>
                              handleParamChange(profile, 'speed', parseFloat(e.target.value))
                            }
                            className="w-full h-1 accent-[#00ff66] bg-[#163826] rounded cursor-pointer"
                          />
                        </label>

                        <label className="flex flex-col gap-0.5">
                          <span className="text-[#6aa382] flex justify-between">
                            <span>Pitch Trim</span>
                            <span className="text-[#d1e7dd]">{profile.pitch.toFixed(2)}x</span>
                          </span>
                          <input
                            type="range"
                            min="0.85"
                            max="1.15"
                            step="0.01"
                            value={profile.pitch}
                            onChange={e =>
                              handleParamChange(profile, 'pitch', parseFloat(e.target.value))
                            }
                            className="w-full h-1 accent-[#00e5ff] bg-[#163826] rounded cursor-pointer"
                          />
                        </label>

                        <label className="flex flex-col gap-0.5">
                          <span className="text-[#6aa382] flex justify-between">
                            <span>Stability</span>
                            <span className="text-[#d1e7dd]">{Math.round(profile.stability * 100)}%</span>
                          </span>
                          <input
                            type="range"
                            min="0.40"
                            max="1.00"
                            step="0.02"
                            value={profile.stability}
                            onChange={e =>
                              handleParamChange(profile, 'stability', parseFloat(e.target.value))
                            }
                            className="w-full h-1 accent-[#ffd166] bg-[#163826] rounded cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
