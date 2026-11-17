/**
 * SKYCONTROL - Unified Offline ATC Audio Studio
 * Single integrated management interface inside SKYCONTROL with 6 sections:
 * 1. Voice Profiles (up to 15 neural voices, pilot overrides & ATC station assignments)
 * 2. Audio Library (searchable WAV assets, single/bulk generation, cleanup, integrity scan)
 * 3. TTS Engine (Kokoro-82M ONNX status, hardware acceleration, queue, worker recovery)
 * 4. Radio Effects (VHF DSP pipeline, 5 presets, PTT timing, Clean-vs-VHF A/B preview)
 * 5. Audio Diagnostics (latency, cache hit rate, missing/failed counts, CPU/GPU, error logs)
 * 6. Global Settings (master audio/TTS toggles, default voices, storage & DB migrations)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  FileAudio,
  FolderSearch,
  Gauge,
  GitCompare,
  HardDrive,
  Headset,
  Layers,
  Loader2,
  Mic,
  Play,
  Plus,
  Power,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Settings,
  Sliders,
  Square,
  Trash2,
  Users,
  Volume2,
  Waves,
  Wrench,
  X,
} from 'lucide-react';
import {
  MAX_VOICE_PROFILES,
  TtsEngineStatus,
  VoiceProfile,
  VoiceType,
} from '../../shared/ttsTypes';
import {
  AUDIO_LIBRARY_CATEGORY_META,
  AUDIO_LIBRARY_GROUP_LABELS,
} from '../../shared/audioLibraryCatalog';
import {
  AudioLibraryAssetStatus,
  AudioLibraryCategory,
  AudioLibraryGroup,
  AudioLibraryManifestEntry,
  AudioLibrarySummary,
  DuplicateGroup,
  IntegrityScanReport,
} from '../../shared/audioLibraryTypes';
import {
  AudioDiagnosticsReport,
  DEFAULT_GLOBAL_AUDIO_SETTINGS,
  GlobalAudioSettings,
  LocalDatabaseState,
} from '../../shared/audioStudioTypes';
import {
  AtcStationRole,
  CommsManagerSnapshot,
  DEFAULT_PTT_TIMING,
  PttTimingConfig,
  radioAudio,
} from '../audio/radioAudio';
import {
  VHF_RADIO_PRESETS,
  VhfQualityPresetId,
  VhfRadioSettings,
} from '../audio/vhfRadioDsp';
import { localTtsClient } from '../services/localTtsClient';
import { audioLibraryClient } from '../services/audioLibraryClient';
import { useSimulationStore } from '../store/simulationStore';

export type AudioStudioTab =
  | 'voices'
  | 'library'
  | 'engine'
  | 'effects'
  | 'diagnostics'
  | 'settings';

interface AudioStudioModalProps {
  isOpen?: boolean;
  mode?: 'modal' | 'page';
  initialTab?: AudioStudioTab;
  onClose?: () => void;
}

const NAV_ITEMS: Array<{
  id: AudioStudioTab;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'voices', label: 'Voice Profiles', subtitle: '15 Speakers & Fleet', icon: Users },
  { id: 'library', label: 'Audio Library', subtitle: 'WAV Assets & Bulk', icon: Database },
  { id: 'engine', label: 'TTS Engine', subtitle: 'Kokoro-82M & Queue', icon: Cpu },
  { id: 'effects', label: 'Radio Effects', subtitle: 'VHF DSP & PTT', icon: Waves },
  { id: 'diagnostics', label: 'Audio Diagnostics', subtitle: 'Latency & Telemetry', icon: Activity },
  { id: 'settings', label: 'Global Settings', subtitle: 'Defaults & Storage', icon: Settings },
];

const ROLE_ORDER: VoiceType[] = ['TOWER', 'APPROACH', 'GROUND', 'PILOT'];
const PAGE_SIZE = 40;

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getStatusTextClass(status: AudioLibraryAssetStatus): string {
  switch (status) {
    case 'ready':
      return 'text-[#00ff66]';
    case 'queued':
    case 'generating':
      return 'text-[#00e5ff]';
    case 'failed':
      return 'text-[#ff7070]';
    default:
      return 'text-[#ffd166]';
  }
}

function normalizeControllerId(val: string, role: AtcStationRole): string {
  if (val === 'charon') return 'tower_charon';
  if (val === 'fenrir') return 'tower_fenrir';
  if (val === 'kore') return 'tower_kore';
  if (val === 'zephyr') return 'approach_zephyr';
  if (val === 'puck') return 'ground_puck';
  if (!val) {
    return role === 'APPROACH'
      ? 'approach_zephyr'
      : role === 'GROUND'
        ? 'ground_puck'
        : 'tower_charon';
  }
  return val;
}

export const AudioStudioModal: React.FC<AudioStudioModalProps> = ({
  isOpen = true,
  mode = 'modal',
  initialTab = 'voices',
  onClose,
}) => {
  const isActive = mode === 'page' ? true : isOpen;
  const [activeTab, setActiveTab] = useState<AudioStudioTab>(initialTab);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  // Sync external initialTab when opened from deep-links
  useEffect(() => {
    if (isActive) {
      setActiveTab(initialTab);
      setBannerError(null);
      setBannerNotice(null);
    }
  }, [isActive, initialTab]);

  // Shared Audio Engine & Profile State
  const [profiles, setProfiles] = useState<VoiceProfile[]>(localTtsClient.getProfilesSync());
  const [availableSpeakers, setAvailableSpeakers] = useState<string[]>(
    localTtsClient.getAvailableSpeakersSync()
  );
  const [engineStatus, setEngineStatus] = useState<TtsEngineStatus | null>(null);
  const [globalSettings, setGlobalSettings] = useState<GlobalAudioSettings>(
    DEFAULT_GLOBAL_AUDIO_SETTINGS
  );
  const [diagnostics, setDiagnostics] = useState<AudioDiagnosticsReport | null>(null);
  const [dbState, setDbState] = useState<LocalDatabaseState | null>(null);

  // Store telemetry for active flight assignments & global audio state
  const activeAircraft = useSimulationStore(state => state.aircraft);
  const syncGlobalAudioSettings = useSimulationStore(state => state.syncGlobalAudioSettings);

  // Voice Profiles Section State
  const [roleFilter, setRoleFilter] = useState<'ALL' | VoiceType>('ALL');
  const [auditioningId, setAuditioningId] = useState<string | null>(null);
  const [stationDefaults, setStationDefaults] = useState<Record<AtcStationRole, string>>(
    radioAudio.getDefaultStationVoices()
  );
  const [, setAssignmentRevision] = useState(0);
  const [showNewProfileForm, setShowNewProfileForm] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileRole, setNewProfileRole] = useState<VoiceType>('PILOT');
  const [newProfileGender, setNewProfileGender] = useState<'M' | 'F'>('M');
  const [newProfileSpeaker, setNewProfileSpeaker] = useState('bm_george');
  const [newProfileAccent, setNewProfileAccent] = useState('en-GB');
  const [creatingProfile, setCreatingProfile] = useState(false);

  // Audio Library Section State
  const [libSummary, setLibSummary] = useState<AudioLibrarySummary | null>(null);
  const [libItems, setLibItems] = useState<AudioLibraryManifestEntry[]>([]);
  const [libTotal, setLibTotal] = useState(0);
  const [libDuplicates, setLibDuplicates] = useState<DuplicateGroup[]>([]);
  const [scanReport, setScanReport] = useState<IntegrityScanReport | null>(null);
  const [searchText, setSearchText] = useState('');
  const [voiceFilter, setVoiceFilter] = useState('ALL');
  const [groupFilter, setGroupFilter] = useState<AudioLibraryGroup | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<AudioLibraryCategory | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<AudioLibraryAssetStatus | 'ALL'>('ALL');
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [pageOffset, setPageOffset] = useState(0);
  const [libLoading, setLibLoading] = useState(false);
  const [busyAssets, setBusyAssets] = useState<Record<string, boolean>>({});
  const [previewingAssetKey, setPreviewingAssetKey] = useState<string | null>(null);
  const [scanningIntegrity, setScanningIntegrity] = useState(false);
  const [cleaningUnused, setCleaningUnused] = useState(false);
  const [showCustomPhraseForm, setShowCustomPhraseForm] = useState(false);
  const [customVoiceId, setCustomVoiceId] = useState('tower_charon');
  const [customCategory, setCustomCategory] = useState<AudioLibraryCategory>('initial_contact');
  const [customPhraseId, setCustomPhraseId] = useState('');
  const [customPhraseText, setCustomPhraseText] = useState('');
  const [savingCustomPhrase, setSavingCustomPhrase] = useState(false);

  // TTS Engine Section State
  const [modelBusy, setModelBusy] = useState(false);
  const [recoveringWorker, setRecoveringWorker] = useState(false);
  const [testVoiceId, setTestVoiceId] = useState('tower_charon');
  const [testPhrase, setTestPhrase] = useState(
    'BAW452, turn left heading 180, descend 3,000 feet, QNH 1013, cleared ILS runway 27R'
  );
  const [testingSynth, setTestingSynth] = useState(false);

  // Radio Effects Section State
  const [vhfSettings, setVhfSettings] = useState<VhfRadioSettings>(radioAudio.getVhfSettings());
  const [pttTiming, setPttTiming] = useState<PttTimingConfig>(radioAudio.getPttTiming());
  const [commsSnapshot, setCommsSnapshot] = useState<CommsManagerSnapshot>(
    radioAudio.getCommsQueueSnapshot()
  );
  const [previewVoiceId, setPreviewVoiceId] = useState('tower_charon');
  const [previewText, setPreviewText] = useState('');
  const [previewMode, setPreviewMode] = useState<'clean' | 'vhf' | 'ab' | null>(null);
  const [activePhase, setActivePhase] = useState<'clean' | 'vhf' | null>(null);

  const refreshCoreState = useCallback(async () => {
    const [st, profs, settings] = await Promise.all([
      localTtsClient.fetchStatus(),
      localTtsClient.fetchProfiles(),
      localTtsClient.fetchGlobalSettings(),
    ]);
    if (st) setEngineStatus(st);
    setProfiles(profs);
    setAvailableSpeakers(localTtsClient.getAvailableSpeakersSync());
    setGlobalSettings(settings);
    setStationDefaults(radioAudio.getDefaultStationVoices());
  }, []);

  const refreshLibrary = useCallback(async () => {
    setLibLoading(true);
    try {
      const [sum, res] = await Promise.all([
        audioLibraryClient.fetchSummary(),
        audioLibraryClient.searchAssets({
          q: searchText,
          voiceId: voiceFilter,
          group: groupFilter,
          category: categoryFilter,
          status: statusFilter,
          duplicatesOnly,
          limit: PAGE_SIZE,
          offset: pageOffset,
        }),
      ]);
      setLibSummary(sum);
      setLibItems(res.items);
      setLibTotal(res.total);
      setLibDuplicates(res.duplicates);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    } finally {
      setLibLoading(false);
    }
  }, [
    searchText,
    voiceFilter,
    groupFilter,
    categoryFilter,
    statusFilter,
    duplicatesOnly,
    pageOffset,
  ]);

  const refreshDiagnostics = useCallback(async () => {
    const [diag, db] = await Promise.all([
      localTtsClient.fetchDiagnostics(),
      localTtsClient.fetchDatabaseState(),
    ]);
    if (diag) setDiagnostics(diag);
    if (db) setDbState(db);
  }, []);

  // Subscriptions & Polling when modal is open
  useEffect(() => {
    const unsubProfiles = localTtsClient.onProfilesChange(next => setProfiles(next));
    const unsubVhf = radioAudio.onVhfSettingsChange(next => setVhfSettings(next));
    const unsubComms = radioAudio.onCommsQueueChange(next => setCommsSnapshot(next));
    return () => {
      unsubProfiles();
      unsubVhf();
      unsubComms();
    };
  }, []);

  useEffect(() => {
    if (!isActive) return;
    void refreshCoreState();
    void refreshDiagnostics();

    const timer = setInterval(() => {
      void localTtsClient.fetchStatus().then(st => {
        if (st) setEngineStatus(st);
      });
      if (activeTab === 'diagnostics' || activeTab === 'engine') {
        void localTtsClient.fetchDiagnostics().then(diag => {
          if (diag) setDiagnostics(diag);
        });
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [isActive, activeTab, refreshCoreState, refreshDiagnostics]);

  useEffect(() => {
    if (!isActive || activeTab !== 'library') return;
    void refreshLibrary();
  }, [isActive, activeTab, refreshLibrary]);

  useEffect(() => {
    if (!isActive || activeTab !== 'library' || libSummary?.bulkJob.status !== 'running') return;
    const timer = setInterval(() => {
      void refreshLibrary();
    }, 1800);
    return () => clearInterval(timer);
  }, [isActive, activeTab, libSummary?.bulkJob.status, refreshLibrary]);

  const categoriesForSelectedGroup = useMemo(() => {
    const all = Object.entries(AUDIO_LIBRARY_CATEGORY_META) as Array<
      [AudioLibraryCategory, { group: AudioLibraryGroup; label: string; description: string }]
    >;
    if (groupFilter === 'ALL') return all;
    return all.filter(([, meta]) => meta.group === groupFilter);
  }, [groupFilter]);

  if (!isActive) return null;

  // ---------------------------------------------------------------------------
  // Voice Profiles Actions
  // ---------------------------------------------------------------------------
  const handleToggleProfileEnabled = async (profile: VoiceProfile) => {
    setBannerError(null);
    try {
      await localTtsClient.updateProfile(profile.id, { enabled: !profile.enabled });
      await refreshCoreState();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleProfileParam = async (
    profile: VoiceProfile,
    field: 'speed' | 'pitch' | 'stability',
    val: number
  ) => {
    try {
      await localTtsClient.updateProfile(profile.id, { [field]: val });
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleProfileSpeakerChange = async (profile: VoiceProfile, kokoroVoiceId: string) => {
    setBannerError(null);
    try {
      await localTtsClient.updateProfile(profile.id, {
        voiceConfig: { kokoroVoiceId },
      });
      await refreshCoreState();
      setBannerNotice(`Updated ${profile.id} speaker embedding to ${kokoroVoiceId}.`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePlaySample = async (profile: VoiceProfile) => {
    setBannerError(null);
    setAuditioningId(profile.id);
    try {
      const ok = await radioAudio.auditionVoiceProfile(profile);
      if (!ok) {
        setBannerError(`Sample WAV could not play for ${profile.displayName}.`);
      }
    } finally {
      setAuditioningId(null);
    }
  };

  const handleRegenSample = async (profile: VoiceProfile) => {
    setBannerError(null);
    setAuditioningId(profile.id);
    try {
      await localTtsClient.fetchProfileSampleWav(profile.id, true);
      await radioAudio.auditionVoiceProfile(profile);
      await refreshCoreState();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuditioningId(null);
    }
  };

  const handleCreateVoiceProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;
    setCreatingProfile(true);
    setBannerError(null);
    try {
      const created = await localTtsClient.createProfile({
        displayName: newProfileName.trim(),
        voiceType: newProfileRole,
        gender: newProfileGender,
        accent: newProfileAccent,
        kokoroVoiceId: newProfileSpeaker,
      });
      setNewProfileName('');
      setShowNewProfileForm(false);
      await refreshCoreState();
      setBannerNotice(`Created voice profile ${created.id} (${created.displayName}).`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingProfile(false);
    }
  };

  const handleDeleteCustomProfile = async (profile: VoiceProfile) => {
    setBannerError(null);
    try {
      await localTtsClient.deleteProfile(profile.id);
      await refreshCoreState();
      setBannerNotice(`Deleted custom profile ${profile.id}.`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResetProfiles = async () => {
    setBannerError(null);
    try {
      await localTtsClient.resetProfiles();
      await refreshCoreState();
      setBannerNotice('Reset all voice profiles to factory defaults.');
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleStationVoiceChange = async (role: AtcStationRole, profileId: string) => {
    radioAudio.assignStationDefaultVoice(role, profileId);
    setStationDefaults(radioAudio.getDefaultStationVoices());
    const key = role === 'TOWER' ? 'tower' : role === 'APPROACH' ? 'approach' : 'ground';
    try {
      const updated = await localTtsClient.updateGlobalSettings({
        defaultVoices: {
          ...globalSettings.defaultVoices,
          [key]: profileId,
        },
      });
      setGlobalSettings(updated);
      syncGlobalAudioSettings(updated, false);
      setBannerNotice(`Assigned ${role} controller voice to ${profileId}.`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleFlightPilotVoiceChange = (
    flight: { id: string; callsign: string; airline: string; category: string },
    profileId: string
  ) => {
    radioAudio.assignFlightPilotVoice(
      {
        aircraftId: flight.id,
        callsign: flight.callsign,
        airline: flight.airline,
        isHeavy: flight.category === 'Heavy',
      },
      profileId
    );
    setAssignmentRevision(r => r + 1);
    setBannerNotice(`Assigned flight ${flight.callsign} pilot voice to ${profileId}.`);
  };

  // ---------------------------------------------------------------------------
  // Audio Library Actions
  // ---------------------------------------------------------------------------
  const handlePreviewAsset = async (entry: AudioLibraryManifestEntry, mode: 'vhf' | 'dry') => {
    setBannerError(null);
    setPreviewingAssetKey(`${entry.assetId}_${mode}`);
    try {
      const ok = await radioAudio.previewLibraryAsset(entry, mode);
      if (!ok) {
        setBannerError(`Preview failed for ${entry.assetId}.`);
      }
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewingAssetKey(null);
    }
  };

  const handleGenerateAsset = async (entry: AudioLibraryManifestEntry) => {
    setBannerError(null);
    setBusyAssets(prev => ({ ...prev, [entry.assetId]: true }));
    try {
      await audioLibraryClient.generateAsset(entry.assetId, true);
      await refreshLibrary();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAssets(prev => {
        const next = { ...prev };
        delete next[entry.assetId];
        return next;
      });
    }
  };

  const handleDeleteAsset = async (entry: AudioLibraryManifestEntry) => {
    setBannerError(null);
    setBusyAssets(prev => ({ ...prev, [entry.assetId]: true }));
    try {
      await audioLibraryClient.deleteAsset(entry.assetId, Boolean(entry.isCustom));
      await refreshLibrary();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAssets(prev => {
        const next = { ...prev };
        delete next[entry.assetId];
        return next;
      });
    }
  };

  const handleCleanupUnused = async () => {
    setCleaningUnused(true);
    setBannerError(null);
    try {
      const res = await audioLibraryClient.cleanupUnusedAssets();
      await Promise.all([refreshLibrary(), refreshDiagnostics()]);
      setBannerNotice(
        `Cleanup complete: removed ${res.removedOrphanFiles} orphaned WAV files (${formatBytes(
          res.freedBytes
        )} freed) and pruned ${res.removedInactiveEntries} stale entries.`
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    } finally {
      setCleaningUnused(false);
    }
  };

  const handleScanIntegrity = async () => {
    setScanningIntegrity(true);
    setBannerError(null);
    try {
      const report = await audioLibraryClient.scanIntegrity();
      setScanReport(report);
      setLibDuplicates(report.duplicates);
      await refreshLibrary();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanningIntegrity(false);
    }
  };

  const handleBulkStart = async (scope: 'missing' | 'core' | 'voice' | 'category') => {
    setBannerError(null);
    try {
      await audioLibraryClient.startBulkGeneration({
        scope,
        voiceId: scope === 'voice' && voiceFilter !== 'ALL' ? voiceFilter : undefined,
        category: scope === 'category' && categoryFilter !== 'ALL' ? categoryFilter : undefined,
        force: false,
      });
      await refreshLibrary();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateCustomPhrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPhraseText.trim()) return;
    setSavingCustomPhrase(true);
    setBannerError(null);
    try {
      const created = await audioLibraryClient.createCustomAsset({
        voiceId: customVoiceId,
        category: customCategory,
        rawText: customPhraseText.trim(),
        phraseId: customPhraseId.trim() || undefined,
      });
      setCustomPhraseText('');
      setCustomPhraseId('');
      setShowCustomPhraseForm(false);
      await audioLibraryClient.generateAsset(created.assetId, true);
      await refreshLibrary();
      setBannerNotice(`Generated custom library asset ${created.assetId}.`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingCustomPhrase(false);
    }
  };

  // ---------------------------------------------------------------------------
  // TTS Engine Actions
  // ---------------------------------------------------------------------------
  const handleModelLoadToggle = async () => {
    setModelBusy(true);
    setBannerError(null);
    try {
      if (engineStatus?.model.state === 'ready') {
        await localTtsClient.unloadModel();
      } else {
        await localTtsClient.loadModel();
      }
      await refreshCoreState();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    } finally {
      setModelBusy(false);
    }
  };

  const handleRecoverWorker = async () => {
    setRecoveringWorker(true);
    setBannerError(null);
    try {
      const st = await localTtsClient.recoverWorker();
      if (st) setEngineStatus(st);
      await refreshDiagnostics();
      setBannerNotice('Local TTS worker thread recycled and model reloaded cleanly.');
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecoveringWorker(false);
    }
  };

  const handleRunSynthTest = async () => {
    const profile = profiles.find(p => p.id === testVoiceId) || profiles[0];
    if (!profile || !testPhrase.trim()) return;
    setTestingSynth(true);
    setBannerError(null);
    try {
      const ok = await radioAudio.auditionVoiceProfile(profile, testPhrase);
      if (!ok) {
        setBannerError('Local synthesis returned no audio (check model status or mute state).');
      }
      await Promise.all([refreshCoreState(), refreshDiagnostics()]);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingSynth(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Radio Effects Actions
  // ---------------------------------------------------------------------------
  const handleVhfField = <K extends keyof VhfRadioSettings>(
    key: K,
    val: VhfRadioSettings[K]
  ) => {
    radioAudio.updateVhfSettings({ [key]: val });
  };

  const handlePttTimingField = <K extends keyof PttTimingConfig>(key: K, val: number) => {
    const next = radioAudio.setPttTiming({ [key]: val });
    setPttTiming(next);
  };

  const handleVhfPreview = async (mode: 'clean' | 'vhf' | 'ab') => {
    setPreviewMode(mode);
    setActivePhase(null);
    try {
      await radioAudio.previewVhfComparison({
        voiceId: previewVoiceId,
        customText: previewText.trim() || undefined,
        mode,
        onPhaseChange: p => setActivePhase(p),
      });
    } finally {
      setPreviewMode(null);
      setActivePhase(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Global Settings Actions
  // ---------------------------------------------------------------------------
  const handleUpdateGlobalSettings = async (
    patch: Partial<GlobalAudioSettings>,
    applyPreset = false
  ) => {
    setBannerError(null);
    try {
      const next = await localTtsClient.updateGlobalSettings(patch);
      setGlobalSettings(next);
      syncGlobalAudioSettings(next, applyPreset);
      setStationDefaults(radioAudio.getDefaultStationVoices());
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleClearDynamicCache = async () => {
    await localTtsClient.clearCache();
    await Promise.all([refreshCoreState(), refreshDiagnostics()]);
    setBannerNotice('Cleared disk & IndexedDB dynamic WAV cache.');
  };

  const handleResetAllAudioSettings = async () => {
    setBannerError(null);
    try {
      const next = await localTtsClient.updateGlobalSettings({
        ...DEFAULT_GLOBAL_AUDIO_SETTINGS,
      });
      radioAudio.resetVhfSettings();
      setPttTiming(radioAudio.setPttTiming(DEFAULT_PTT_TIMING));
      setGlobalSettings(next);
      syncGlobalAudioSettings(next, true);
      setBannerNotice('Restored default global audio settings and VHF DSP parameters.');
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResetTelemetry = async () => {
    await localTtsClient.resetDiagnostics();
    await refreshDiagnostics();
    setBannerNotice('Audio diagnostics counters and error log reset.');
  };

  // Derived data
  const defaultProfileIds = new Set([
    'tower_charon',
    'tower_fenrir',
    'tower_kore',
    'approach_zephyr',
    'ground_puck',
    'pilot_thomas',
    'pilot_libby',
    'pilot_brian',
    'pilot_clara',
    'pilot_prabhat',
    'pilot_connor',
    'pilot_nova',
    'pilot_liam',
    'pilot_alice',
    'pilot_daniel',
  ]);
  const clientDiag = localTtsClient.getClientDiagnostics();
  const duplicateAssetSet = new Set<string>();
  for (const grp of libDuplicates) {
    for (const id of grp.assetIds) duplicateAssetSet.add(id);
  }
  const bulkRunning = libSummary?.bulkJob.status === 'running';
  const bulkProgressPct =
    libSummary && libSummary.bulkJob.totalCount > 0
      ? Math.round(
          ((libSummary.bulkJob.completedCount +
            libSummary.bulkJob.failedCount +
            libSummary.bulkJob.skippedCount) /
            libSummary.bulkJob.totalCount) *
            100
        )
      : 0;

  const modelState = engineStatus?.model.state || 'unloaded';
  const hardware = diagnostics?.hardware;
  const combinedErrors = [
    ...(diagnostics?.errors.recentErrors || []),
    ...clientDiag.playbackErrors.map(e => ({
      timestamp: e.timestamp,
      source: 'playback' as const,
      message: `${e.source}: ${e.message}`,
    })),
  ].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  const contentShell = (
    <div
      className={
        mode === 'page'
          ? 'w-full h-full bg-[#07100b] flex flex-col overflow-hidden text-[#d1e7dd] text-xs select-none'
          : 'w-full max-w-6xl h-[92vh] bg-[#07100b] border border-[#1d4b32] rounded-md flex flex-col overflow-hidden text-[#d1e7dd]'
      }
    >
      {/* Studio Top Header */}
      <header className="h-12 px-4 bg-[#08150f] border-b border-[#163826] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Radio className="w-4 h-4 text-[#00ff66] shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-mono text-sm font-bold text-[#00ff66] tracking-wide truncate">
                SKYCONTROL Audio Studio
              </h2>
              <span className="hidden sm:inline text-[#296343]" aria-hidden="true">·</span>
              <span className="hidden sm:inline font-mono text-[11px] text-[#7ec99b] whitespace-nowrap">
                Offline Kokoro-82M Neural Audio
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 font-mono text-[11px] shrink-0 tabular-nums">
          <span className="hidden md:inline text-[#7cc99c]">
            Profiles: <b className="text-[#e2f5ea]">{profiles.length}/{MAX_VOICE_PROFILES}</b>
          </span>
          <span className="hidden md:inline text-[#214f36]">|</span>
          <span className="hidden sm:inline text-[#7cc99c]">
            Engine:{' '}
            <b
              className={
                modelState === 'ready'
                  ? 'text-[#00ff66]'
                  : modelState === 'error'
                    ? 'text-[#ff7070]'
                    : 'text-[#ffd166]'
              }
            >
              {modelState.toUpperCase()}
            </b>
          </span>
          {mode === 'modal' && onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded bg-[#0c1e14] hover:bg-[#153423] text-[#87d6a6] border border-[#1d4b32]"
              aria-label="Close Audio Studio"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

        {/* Body: Left Navigation Rail + Main Content Workspace */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Fixed Left Sidebar Navigation (232px on md+) */}
          <aside className="w-full md:w-58 bg-[#08130d] border-b md:border-b-0 md:border-r border-[#163826] p-2 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto shrink-0">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`px-3 py-2 rounded border text-left flex items-center gap-2.5 transition-colors shrink-0 md:w-full ${
                    isActive
                      ? 'bg-[#102b1c] border-[#266942] text-[#00ff66]'
                      : 'bg-transparent border-transparent text-[#85bfa0] hover:bg-[#0c1c13] hover:text-[#d1e7dd]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-[#00ff66]' : 'text-[#558a6a]'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-xs whitespace-nowrap">{item.label}</div>
                    <div className="text-[10px] text-[#5c9474] font-mono whitespace-nowrap hidden md:block">
                      {item.subtitle}
                    </div>
                  </div>
                </button>
              );
            })}

            <div className="hidden md:block mt-auto pt-3 border-t border-[#143322] px-2 space-y-1 font-mono text-[10px] text-[#649e7c] tabular-nums">
              <div className="flex justify-between">
                <span>AUDIO OUTPUT</span>
                <span className={globalSettings.audioEnabled ? 'text-[#00ff66]' : 'text-[#ff7070]'}>
                  {globalSettings.audioEnabled ? 'ENABLED' : 'MUTED'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>LOCAL TTS</span>
                <span className={globalSettings.ttsEnabled ? 'text-[#00ff66]' : 'text-[#ffd166]'}>
                  {globalSettings.ttsEnabled ? 'ACTIVE' : 'FALLBACK'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>VHF DSP</span>
                <span className={vhfSettings.enabled ? 'text-[#00e5ff]' : 'text-[#7ca68f]'}>
                  {vhfSettings.enabled ? 'ON' : 'BYPASS'}
                </span>
              </div>
            </div>
          </aside>

          {/* Main Workspace Area */}
          <main className="flex-1 min-w-0 flex flex-col bg-[#050c08] overflow-hidden">
            {/* Inline Notifications / Errors */}
            {bannerError && (
              <div className="px-4 py-2 bg-[#2d1215] border-b border-[#63262c] text-[#ff9b9b] flex items-center justify-between gap-2 text-xs shrink-0">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{bannerError}</span>
                </span>
                <button
                  onClick={() => setBannerError(null)}
                  className="text-[11px] font-mono underline hover:text-white shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}
            {bannerNotice && (
              <div className="px-4 py-2 bg-[#0c2618] border-b border-[#1f5c3a] text-[#9ff3c1] flex items-center justify-between gap-2 text-xs shrink-0">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#00ff66] shrink-0" />
                  <span>{bannerNotice}</span>
                </span>
                <button
                  onClick={() => setBannerNotice(null)}
                  className="text-[11px] font-mono underline hover:text-white shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Tab Viewport */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* =================================================================
                  SECTION 1: VOICE PROFILES
              ================================================================= */}
              {activeTab === 'voices' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-[#e6f7ed]">
                        Voice Profiles & Live Assignments
                      </h3>
                      <p className="text-[11px] text-[#73aa89]">
                        Configure up to {MAX_VOICE_PROFILES} neural speaker identities, station
                        controller voices, and per-aircraft pilot overrides.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 font-mono">
                      <button
                        onClick={() => setShowNewProfileForm(prev => !prev)}
                        disabled={profiles.length >= MAX_VOICE_PROFILES}
                        className="px-2.5 py-1.5 rounded bg-[#10301e] hover:bg-[#17422a] text-[#00ff66] border border-[#246640] text-[11px] flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Profile ({profiles.length}/{MAX_VOICE_PROFILES})</span>
                      </button>
                      <button
                        onClick={handleResetProfiles}
                        className="px-2.5 py-1.5 rounded bg-[#0c1d14] hover:bg-[#153022] text-[#9ad9b4] border border-[#1d4b32] text-[11px] flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset 15 Defaults</span>
                      </button>
                    </div>
                  </div>

                  {showNewProfileForm && (
                    <form
                      onSubmit={handleCreateVoiceProfile}
                      className="p-3 bg-[#09150f] border border-[#1d4b32] rounded grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                    >
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-mono text-[#6ca884] mb-1">
                          DISPLAY NAME
                        </label>
                        <input
                          type="text"
                          value={newProfileName}
                          onChange={e => setNewProfileName(e.target.value)}
                          placeholder="Capt Adam · Cargo"
                          required
                          className="w-full bg-[#060e09] border border-[#1d4b32] rounded px-2.5 py-1.5 text-xs text-[#e2f5ea]"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-mono text-[#6ca884] mb-1">ROLE</label>
                        <select
                          value={newProfileRole}
                          onChange={e => setNewProfileRole(e.target.value as VoiceType)}
                          className="w-full bg-[#060e09] border border-[#1d4b32] rounded px-2 py-1.5 text-xs text-[#e2f5ea]"
                        >
                          <option value="PILOT">PILOT</option>
                          <option value="TOWER">TOWER</option>
                          <option value="APPROACH">APPROACH</option>
                          <option value="GROUND">GROUND</option>
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-mono text-[#6ca884] mb-1">
                          KOKORO SPEAKER
                        </label>
                        <select
                          value={newProfileSpeaker}
                          onChange={e => setNewProfileSpeaker(e.target.value)}
                          className="w-full bg-[#060e09] border border-[#1d4b32] rounded px-2 py-1.5 text-xs text-[#e2f5ea]"
                        >
                          {(availableSpeakers.length > 0
                            ? availableSpeakers
                            : ['bm_george', 'bf_emma', 'am_michael', 'af_heart']
                          ).map(spk => (
                            <option key={spk} value={spk}>
                              {spk}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-mono text-[#6ca884] mb-1">
                          GENDER / ACCENT
                        </label>
                        <div className="flex gap-1">
                          <select
                            value={newProfileGender}
                            onChange={e => setNewProfileGender(e.target.value as 'M' | 'F')}
                            className="w-1/2 bg-[#060e09] border border-[#1d4b32] rounded px-1.5 py-1.5 text-xs"
                          >
                            <option value="M">M</option>
                            <option value="F">F</option>
                          </select>
                          <select
                            value={newProfileAccent}
                            onChange={e => setNewProfileAccent(e.target.value)}
                            className="w-1/2 bg-[#060e09] border border-[#1d4b32] rounded px-1.5 py-1.5 text-xs"
                          >
                            <option value="en-GB">en-GB</option>
                            <option value="en-US">en-US</option>
                          </select>
                        </div>
                      </div>
                      <div className="sm:col-span-1">
                        <button
                          type="submit"
                          disabled={creatingProfile}
                          className="w-full py-1.5 rounded bg-[#0e3820] hover:bg-[#175532] text-[#00ff66] border border-[#287046] font-mono font-bold text-xs"
                        >
                          {creatingProfile ? '...' : 'Create'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Station Controller & Active Aircraft Assignment Matrix */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                    {/* ATC Station Controller Assignments */}
                    <div className="lg:col-span-5 bg-[#09150f] border border-[#173a27] rounded p-3 space-y-2.5">
                      <div className="flex items-center justify-between border-b border-[#133221] pb-1.5">
                        <span className="font-mono text-[11px] font-bold text-[#00e5ff] flex items-center gap-1.5">
                          <Headset className="w-3.5 h-3.5" />
                          <span>ATC STATION ASSIGNMENTS</span>
                        </span>
                      </div>
                      {(['TOWER', 'APPROACH', 'GROUND'] as AtcStationRole[]).map(role => {
                        const ctrlOptions = profiles.filter(p => p.voiceType !== 'PILOT' && p.enabled);
                        const selectedId = stationDefaults[role];
                        return (
                          <div key={role} className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold text-[#a2f5bf] w-20 shrink-0">
                              {role}
                            </span>
                            <select
                              value={selectedId}
                              onChange={e => void handleStationVoiceChange(role, e.target.value)}
                              aria-label={`${role} Controller Voice`}
                              className="flex-1 bg-[#060e09] border border-[#1d4b32] rounded px-2 py-1 text-[11px] text-[#e2f5ea]"
                            >
                              {ctrlOptions.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.displayName} ({p.voiceConfig.kokoroVoiceId})
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                const prof = profiles.find(p => p.id === selectedId);
                                if (prof) void handlePlaySample(prof);
                              }}
                              className="p-1.5 rounded bg-[#0d2217] hover:bg-[#173a27] text-[#00ff66] border border-[#1f5437]"
                              title={`Preview ${role} voice`}
                            >
                              <Play className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Active Aircraft Pilot Assignments */}
                    <div className="lg:col-span-7 bg-[#09150f] border border-[#173a27] rounded p-3 space-y-2">
                      <div className="flex items-center justify-between border-b border-[#133221] pb-1.5">
                        <span className="font-mono text-[11px] font-bold text-[#00ff66] flex items-center gap-1.5">
                          <Mic className="w-3.5 h-3.5" />
                          <span>ACTIVE AIRCRAFT PILOT VOICES ({activeAircraft.length})</span>
                        </span>
                        <span className="font-mono text-[10px] text-[#6aa382]">
                          Stable per flight · Override any aircraft
                        </span>
                      </div>

                      {activeAircraft.length === 0 ? (
                        <div className="text-[11px] text-[#649e7c] py-3 text-center">
                          No aircraft currently active on radar.
                        </div>
                      ) : (
                        <div className="max-h-36 overflow-y-auto divide-y divide-[#122e1f]">
                          {activeAircraft.map(ac => {
                            const assigned = radioAudio.getPilotVoiceForCallsign(ac.callsign, {
                              aircraftId: ac.id,
                              airline: ac.airline,
                              isHeavy: ac.category === 'Heavy',
                            });
                            const pilotOptions = profiles.filter(
                              p => p.voiceType === 'PILOT' && p.enabled
                            );
                            return (
                              <div
                                key={ac.id}
                                className="py-1.5 flex items-center justify-between gap-2 text-[11px] tabular-nums"
                              >
                                <div className="min-w-0 flex items-center gap-2">
                                  <span className="font-mono font-bold text-[#00ff66] w-16 shrink-0">
                                    {ac.callsign}
                                  </span>
                                  <span className="text-[#78b38f] truncate hidden sm:inline">
                                    {ac.aircraftType} · {ac.status}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <select
                                    value={assigned.localProfileId}
                                    onChange={e =>
                                      handleFlightPilotVoiceChange(ac, e.target.value)
                                    }
                                    aria-label={`Pilot voice for ${ac.callsign}`}
                                    className="bg-[#060e09] border border-[#1d4b32] rounded px-2 py-1 text-[11px] text-[#e2f5ea] max-w-[200px]"
                                  >
                                    {pilotOptions.map(p => (
                                      <option key={p.id} value={p.id}>
                                        {p.displayName}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => {
                                      const prof = profiles.find(
                                        p => p.id === assigned.localProfileId
                                      );
                                      if (prof) void handlePlaySample(prof);
                                    }}
                                    className="p-1.5 rounded bg-[#0d2217] hover:bg-[#173a27] text-[#00ff66] border border-[#1f5437]"
                                    title={`Preview ${ac.callsign} voice`}
                                  >
                                    <Play className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Role Filter Strip */}
                  <div className="flex flex-wrap items-center gap-1.5 font-mono">
                    {(['ALL', 'TOWER', 'APPROACH', 'GROUND', 'PILOT'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setRoleFilter(tab)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold border whitespace-nowrap ${
                          roleFilter === tab
                            ? 'bg-[#113521] text-[#00ff66] border-[#267346]'
                            : 'bg-[#09150f] text-[#79b591] border-[#163826] hover:text-[#d1e7dd]'
                        }`}
                      >
                        {tab === 'ALL'
                          ? `All Profiles (${profiles.length})`
                          : `${tab} (${profiles.filter(p => p.voiceType === tab).length})`}
                      </button>
                    ))}
                  </div>

                  {/* Profiles List */}
                  <div className="space-y-4">
                    {ROLE_ORDER.filter(r => roleFilter === 'ALL' || roleFilter === r).map(role => {
                      const group = profiles.filter(p => p.voiceType === role);
                      if (group.length === 0) return null;
                      return (
                        <div key={role} className="space-y-2">
                          <div className="flex items-center justify-between border-b border-[#143623] pb-1 font-mono text-[11px]">
                            <span className="font-bold text-[#a2f5bf]">
                              {role} PROFILES ({group.length})
                            </span>
                            <span className="text-[#639c79]">
                              {group.filter(p => p.enabled).length} enabled
                            </span>
                          </div>

                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                            {group.map(profile => {
                              const isCustom = !defaultProfileIds.has(profile.id);
                              return (
                                <div
                                  key={profile.id}
                                  className={`p-3 rounded border ${
                                    profile.enabled
                                      ? 'bg-[#09150f] border-[#19402b]'
                                      : 'bg-[#070f0a] border-[#13291d] opacity-65'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-[10px] font-bold text-[#00e5ff] uppercase shrink-0">
                                          {profile.voiceType}
                                        </span>
                                        <span className="font-bold text-[#e6f7ed] truncate">
                                          {profile.displayName}
                                        </span>
                                      </div>
                                      <div className="text-[10px] font-mono text-[#6ca884] mt-0.5 truncate">
                                        {profile.accent} · {profile.gender} · Speaker{' '}
                                        <code className="text-[#00e5ff]">
                                          {profile.voiceConfig.kokoroVoiceId}
                                        </code>{' '}
                                        · {profile.voiceConfig.timbreDescription}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0 font-mono">
                                      <button
                                        onClick={() => void handlePlaySample(profile)}
                                        disabled={auditioningId === profile.id}
                                        className="px-2 py-1 rounded bg-[#10301e] hover:bg-[#17422a] text-[#00ff66] border border-[#225c3a] text-[10px] flex items-center gap-1 whitespace-nowrap"
                                        title={`Play sample: "${profile.sampleText}"`}
                                      >
                                        {auditioningId === profile.id ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Play className="w-3 h-3" />
                                        )}
                                        <span>Sample</span>
                                      </button>
                                      <button
                                        onClick={() => void handleRegenSample(profile)}
                                        disabled={auditioningId === profile.id}
                                        className="p-1 rounded bg-[#0c1e15] hover:bg-[#163625] text-[#83cf9f] border border-[#1d4830]"
                                        title="Regenerate sample WAV with current settings"
                                      >
                                        <RefreshCw className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => void handleToggleProfileEnabled(profile)}
                                        className={`px-2 py-1 rounded text-[10px] font-bold border ${
                                          profile.enabled
                                            ? 'bg-[#0e3820] text-[#00ff66] border-[#216b40]'
                                            : 'bg-[#2c1517] text-[#ff8a8a] border-[#592b2f]'
                                        }`}
                                      >
                                        {profile.enabled ? 'ON' : 'OFF'}
                                      </button>
                                      {isCustom && (
                                        <button
                                          onClick={() => void handleDeleteCustomProfile(profile)}
                                          className="p-1 rounded bg-[#2a1214] hover:bg-[#3e1a1e] text-[#ff8585] border border-[#5c2529]"
                                          title="Delete custom profile"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  <div className="pt-2 border-t border-[#122e1f] grid grid-cols-1 sm:grid-cols-4 gap-2 text-[10px] font-mono tabular-nums items-end">
                                    <div>
                                      <span className="block text-[#6aa382] mb-0.5">
                                        Kokoro Voice
                                      </span>
                                      <select
                                        value={profile.voiceConfig.kokoroVoiceId}
                                        onChange={e =>
                                          void handleProfileSpeakerChange(profile, e.target.value)
                                        }
                                        className="w-full bg-[#060e09] border border-[#1d4b32] rounded px-1.5 py-0.5 text-[10px] text-[#00e5ff]"
                                      >
                                        {(availableSpeakers.length > 0
                                          ? availableSpeakers
                                          : [profile.voiceConfig.kokoroVoiceId]
                                        ).map(s => (
                                          <option key={s} value={s}>
                                            {s}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <label className="flex flex-col gap-0.5">
                                      <span className="text-[#6aa382] flex justify-between">
                                        <span>Speed</span>
                                        <span className="text-[#e2f5ea]">
                                          {profile.speed.toFixed(2)}x
                                        </span>
                                      </span>
                                      <input
                                        type="range"
                                        min="0.75"
                                        max="1.35"
                                        step="0.02"
                                        value={profile.speed}
                                        onChange={e =>
                                          void handleProfileParam(
                                            profile,
                                            'speed',
                                            parseFloat(e.target.value)
                                          )
                                        }
                                        className="w-full h-1 accent-[#00ff66] bg-[#163826] rounded cursor-pointer"
                                      />
                                    </label>
                                    <label className="flex flex-col gap-0.5">
                                      <span className="text-[#6aa382] flex justify-between">
                                        <span>Pitch</span>
                                        <span className="text-[#e2f5ea]">
                                          {profile.pitch.toFixed(2)}x
                                        </span>
                                      </span>
                                      <input
                                        type="range"
                                        min="0.85"
                                        max="1.15"
                                        step="0.01"
                                        value={profile.pitch}
                                        onChange={e =>
                                          void handleProfileParam(
                                            profile,
                                            'pitch',
                                            parseFloat(e.target.value)
                                          )
                                        }
                                        className="w-full h-1 accent-[#00e5ff] bg-[#163826] rounded cursor-pointer"
                                      />
                                    </label>
                                    <label className="flex flex-col gap-0.5">
                                      <span className="text-[#6aa382] flex justify-between">
                                        <span>Stability</span>
                                        <span className="text-[#e2f5ea]">
                                          {Math.round(profile.stability * 100)}%
                                        </span>
                                      </span>
                                      <input
                                        type="range"
                                        min="0.40"
                                        max="1.00"
                                        step="0.02"
                                        value={profile.stability}
                                        onChange={e =>
                                          void handleProfileParam(
                                            profile,
                                            'stability',
                                            parseFloat(e.target.value)
                                          )
                                        }
                                        className="w-full h-1 accent-[#ffd166] bg-[#163826] rounded cursor-pointer"
                                      />
                                    </label>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* =================================================================
                  SECTION 2: AUDIO LIBRARY
              ================================================================= */}
              {activeTab === 'library' && (
                <div className="space-y-3">
                  {/* Top KPI & Actions */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 font-mono tabular-nums">
                    <div className="p-2.5 bg-[#09150f] border border-[#173a27] rounded">
                      <div className="text-[10px] text-[#649e7c]">READY / MATRIX</div>
                      <div className="text-base font-bold text-[#00ff66]">
                        {libSummary?.readyCount ?? 0} / {libSummary?.totalAssets ?? 0}
                      </div>
                    </div>
                    <div className="p-2.5 bg-[#09150f] border border-[#173a27] rounded">
                      <div className="text-[10px] text-[#649e7c]">MISSING / PENDING</div>
                      <div className="text-base font-bold text-[#ffd166]">
                        {libSummary?.missingCount ?? 0}
                      </div>
                    </div>
                    <div className="p-2.5 bg-[#09150f] border border-[#173a27] rounded">
                      <div className="text-[10px] text-[#649e7c]">DISK FOOTPRINT</div>
                      <div className="text-base font-bold text-[#00e5ff]">
                        {formatBytes(libSummary?.totalSizeBytes ?? 0)}
                      </div>
                    </div>
                    <div className="p-2.5 bg-[#09150f] border border-[#173a27] rounded">
                      <div className="text-[10px] text-[#649e7c]">DUPLICATES DETECTED</div>
                      <div className="text-base font-bold text-[#e2f5ea]">
                        {libDuplicates.length}
                      </div>
                    </div>
                  </div>

                  {/* Library Actions Bar */}
                  <div className="p-2.5 bg-[#09150f] border border-[#173a27] rounded flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => void handleScanIntegrity()}
                        disabled={scanningIntegrity}
                        className="px-2.5 py-1 bg-[#0c1e15] hover:bg-[#153122] text-[#a2f5bf] border border-[#1e4d35] rounded flex items-center gap-1 whitespace-nowrap disabled:opacity-45"
                      >
                        {scanningIntegrity ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FolderSearch className="w-3.5 h-3.5 text-[#00e5ff]" />
                        )}
                        <span>Scan Missing & Dupes</span>
                      </button>

                      <button
                        onClick={() => void handleCleanupUnused()}
                        disabled={cleaningUnused}
                        className="px-2.5 py-1 bg-[#251315] hover:bg-[#381c20] text-[#ff8a8a] border border-[#57292e] rounded flex items-center gap-1 whitespace-nowrap disabled:opacity-45"
                      >
                        {cleaningUnused ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        <span>Delete Unused Assets</span>
                      </button>

                      <button
                        onClick={() => setShowCustomPhraseForm(prev => !prev)}
                        className="px-2.5 py-1 bg-[#0c212a] hover:bg-[#12303d] text-[#7ae8ff] border border-[#1b4a5c] rounded flex items-center gap-1 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Custom Phrase</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {!bulkRunning ? (
                        <>
                          <button
                            onClick={() => void handleBulkStart('core')}
                            className="px-2.5 py-1 bg-[#102d1d] hover:bg-[#18442c] text-[#00ff66] border border-[#225c3a] rounded flex items-center gap-1 whitespace-nowrap"
                          >
                            <Layers className="w-3.5 h-3.5" />
                            <span>Bulk Core</span>
                          </button>
                          {voiceFilter !== 'ALL' && (
                            <button
                              onClick={() => void handleBulkStart('voice')}
                              className="px-2.5 py-1 bg-[#102d1d] hover:bg-[#18442c] text-[#00ff66] border border-[#225c3a] rounded whitespace-nowrap"
                            >
                              Gen Voice Missing
                            </button>
                          )}
                          {categoryFilter !== 'ALL' && (
                            <button
                              onClick={() => void handleBulkStart('category')}
                              className="px-2.5 py-1 bg-[#102d1d] hover:bg-[#18442c] text-[#00ff66] border border-[#225c3a] rounded whitespace-nowrap"
                            >
                              Gen Category Missing
                            </button>
                          )}
                          <button
                            onClick={() => void handleBulkStart('missing')}
                            className="px-2.5 py-1 bg-[#0e3820] hover:bg-[#165431] text-[#00ff66] border border-[#267346] rounded font-bold flex items-center gap-1 whitespace-nowrap"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Bulk Generate Missing</span>
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 bg-[#0b333d] border border-[#1c5e6e] rounded px-2.5 py-1">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00e5ff]" />
                          <span className="text-[#00e5ff] font-bold">
                            BULK {libSummary?.bulkJob.scope.toUpperCase()} · {bulkProgressPct}%
                          </span>
                          <button
                            onClick={() => void audioLibraryClient.cancelBulkGeneration().then(refreshLibrary)}
                            className="px-2 py-0.5 bg-[#3b1216] text-[#ff7070] border border-[#63262c] rounded flex items-center gap-1"
                          >
                            <Square className="w-2.5 h-2.5" />
                            <span>Stop</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {scanReport && (
                    <div className="px-3 py-2 bg-[#0c2419] border border-[#1d4b32] rounded text-[11px] flex items-center justify-between">
                      <span>
                        Scan complete: <b>{scanReport.readyCount}</b> ready,{' '}
                        <b>{scanReport.missingCount}</b> missing,{' '}
                        <b>{scanReport.corruptCount}</b> corrupt,{' '}
                        <b>{scanReport.duplicates.length}</b> duplicate groups.
                      </span>
                      <button
                        onClick={() => setScanReport(null)}
                        className="text-[#6ca884] hover:text-white font-mono"
                      >
                        Hide
                      </button>
                    </div>
                  )}

                  {showCustomPhraseForm && (
                    <form
                      onSubmit={handleCreateCustomPhrase}
                      className="p-3 bg-[#09150f] border border-[#1d4b32] rounded grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
                    >
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-mono text-[#649e7c] mb-1">
                          VOICE PROFILE
                        </label>
                        <select
                          value={customVoiceId}
                          onChange={e => setCustomVoiceId(e.target.value)}
                          className="w-full bg-[#060e09] border border-[#1e4d35] rounded px-2 py-1 text-xs"
                        >
                          {profiles.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.id} ({p.voiceType})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-mono text-[#649e7c] mb-1">
                          CATEGORY
                        </label>
                        <select
                          value={customCategory}
                          onChange={e => setCustomCategory(e.target.value as AudioLibraryCategory)}
                          className="w-full bg-[#060e09] border border-[#1e4d35] rounded px-2 py-1 text-xs"
                        >
                          {(Object.entries(AUDIO_LIBRARY_CATEGORY_META) as Array<
                            [AudioLibraryCategory, { label: string }]
                          >).map(([key, meta]) => (
                            <option key={key} value={key}>
                              {meta.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-mono text-[#649e7c] mb-1">
                          PHRASE ID
                        </label>
                        <input
                          type="text"
                          value={customPhraseId}
                          onChange={e => setCustomPhraseId(e.target.value)}
                          placeholder="custom_taxi"
                          className="w-full bg-[#060e09] border border-[#1e4d35] rounded px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-mono text-[#649e7c] mb-1">
                          PHRASE TEXT
                        </label>
                        <input
                          type="text"
                          value={customPhraseText}
                          onChange={e => setCustomPhraseText(e.target.value)}
                          placeholder="Speedbird 452, taxi holding point Alpha"
                          required
                          className="w-full bg-[#060e09] border border-[#1e4d35] rounded px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <button
                          type="submit"
                          disabled={savingCustomPhrase}
                          className="w-full py-1 bg-[#0e3820] hover:bg-[#175532] text-[#00ff66] border border-[#246640] rounded font-mono font-bold"
                        >
                          {savingCustomPhrase ? '...' : 'Save'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Search & Filter Toolbar */}
                  <div className="p-2.5 bg-[#09150f] border border-[#173a27] rounded space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5 font-mono">
                      <button
                        onClick={() => {
                          setGroupFilter('ALL');
                          setCategoryFilter('ALL');
                          setPageOffset(0);
                        }}
                        className={`px-2 py-1 rounded text-[10px] border whitespace-nowrap ${
                          groupFilter === 'ALL'
                            ? 'bg-[#0e3820] text-[#00ff66] border-[#267346] font-bold'
                            : 'bg-[#060e09] text-[#7cc99c] border-[#173a27]'
                        }`}
                      >
                        All Groups
                      </button>
                      {(
                        Object.entries(AUDIO_LIBRARY_GROUP_LABELS) as Array<
                          [AudioLibraryGroup, string]
                        >
                      ).map(([grpKey, label]) => (
                        <button
                          key={grpKey}
                          onClick={() => {
                            setGroupFilter(grpKey);
                            setCategoryFilter('ALL');
                            setPageOffset(0);
                          }}
                          className={`px-2 py-1 rounded text-[10px] border whitespace-nowrap ${
                            groupFilter === grpKey
                              ? 'bg-[#0e3820] text-[#00ff66] border-[#267346] font-bold'
                              : 'bg-[#060e09] text-[#7cc99c] border-[#173a27]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-4 relative">
                        <Search className="w-3.5 h-3.5 text-[#558a6a] absolute left-2 top-2" />
                        <input
                          type="text"
                          value={searchText}
                          onChange={e => {
                            setSearchText(e.target.value);
                            setPageOffset(0);
                          }}
                          placeholder="Search phrase, callsign, asset ID..."
                          className="w-full bg-[#060e09] border border-[#1e4d35] rounded pl-7 pr-2 py-1.5 text-[11px]"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <select
                          value={voiceFilter}
                          onChange={e => {
                            setVoiceFilter(e.target.value);
                            setPageOffset(0);
                          }}
                          aria-label="Filter by Voice"
                          className="w-full bg-[#060e09] border border-[#1e4d35] rounded px-2 py-1.5 text-[11px]"
                        >
                          <option value="ALL">All {profiles.length} Voices</option>
                          {profiles.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.id} ({libSummary?.voiceCounts[p.id]?.ready ?? 0}/
                              {libSummary?.voiceCounts[p.id]?.total ?? 0})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <select
                          value={categoryFilter}
                          onChange={e => {
                            setCategoryFilter(e.target.value as AudioLibraryCategory | 'ALL');
                            setPageOffset(0);
                          }}
                          aria-label="Filter by Category"
                          className="w-full bg-[#060e09] border border-[#1e4d35] rounded px-2 py-1.5 text-[11px]"
                        >
                          <option value="ALL">
                            All Categories ({categoriesForSelectedGroup.length})
                          </option>
                          {categoriesForSelectedGroup.map(([catKey, meta]) => (
                            <option key={catKey} value={catKey}>
                              {meta.label} ({libSummary?.categoryCounts[catKey]?.ready ?? 0}/
                              {libSummary?.categoryCounts[catKey]?.total ?? 0})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2 flex gap-1">
                        <select
                          value={statusFilter}
                          onChange={e => {
                            setStatusFilter(e.target.value as AudioLibraryAssetStatus | 'ALL');
                            setPageOffset(0);
                          }}
                          aria-label="Filter by Status"
                          className="flex-1 bg-[#060e09] border border-[#1e4d35] rounded px-1.5 py-1.5 text-[11px]"
                        >
                          <option value="ALL">All Status</option>
                          <option value="ready">Ready</option>
                          <option value="missing">Missing</option>
                          <option value="failed">Failed</option>
                        </select>
                        <button
                          onClick={() => {
                            setDuplicatesOnly(prev => !prev);
                            setPageOffset(0);
                          }}
                          className={`px-2 py-1 rounded border text-[10px] font-mono ${
                            duplicatesOnly
                              ? 'bg-[#2c2511] text-[#ffd166] border-[#6e5a1d]'
                              : 'bg-[#060e09] text-[#7cc99c] border-[#1e4d35]'
                          }`}
                          title="Filter duplicate hashes"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Duplicate Hash Groups Inspector */}
                  {duplicatesOnly && libDuplicates.length > 0 && (
                    <div className="p-2.5 bg-[#1a1609] border border-[#594b19] rounded space-y-1.5 font-mono text-[11px]">
                      <div className="font-bold text-[#ffd166]">
                        Duplicate SHA-256 Audio Hash Groups ({libDuplicates.length})
                      </div>
                      <div className="divide-y divide-[#383011] max-h-28 overflow-y-auto">
                        {libDuplicates.map(grp => (
                          <div key={`${grp.type}_${grp.key}`} className="py-1 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                            <span className="text-[#ffd166]">
                              {grp.type === 'binary_audio' ? 'SHA' : 'TEXT'} {grp.key.slice(0, 12)}
                            </span>
                            <span className="text-[#e2f5ea] truncate">
                              {grp.assetIds.join(', ')} ({grp.reason})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Asset Results */}
                  <div className="space-y-1.5">
                    {libLoading && libItems.length === 0 ? (
                      <div className="py-10 text-center text-[#649e7c] flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading local audio asset catalog...</span>
                      </div>
                    ) : libItems.length === 0 ? (
                      <div className="py-10 text-center text-[#649e7c]">
                        No assets match current filters.
                      </div>
                    ) : (
                      libItems.map(entry => {
                        const busy = Boolean(busyAssets[entry.assetId]);
                        const catMeta = AUDIO_LIBRARY_CATEGORY_META[entry.category];
                        const isDupe = duplicateAssetSet.has(entry.assetId);
                        return (
                          <div
                            key={entry.assetId}
                            className="bg-[#09150f] border border-[#163826] rounded px-3 py-2 flex flex-col md:flex-row md:items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                                <span className="font-bold text-[#00e5ff]">{entry.voiceId}</span>
                                <span className="text-[#3b6d4e]" aria-hidden="true">·</span>
                                <span className="text-[#a2f5bf]">{entry.phraseId}</span>
                                <span className="text-[#3b6d4e]" aria-hidden="true">·</span>
                                <span className={`text-[10px] uppercase font-bold ${getStatusTextClass(entry.status)}`}>
                                  {entry.status}
                                </span>
                                <span className="text-[#3b6d4e]" aria-hidden="true">·</span>
                                <span className="text-[10px] text-[#6fa885]">
                                  {catMeta?.label || entry.category}
                                  {isDupe ? ' · DUPLICATE' : ''}
                                </span>
                              </div>
                              <div className="text-[#e3f5ea] text-xs">{entry.rawText}</div>
                              <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-[#5c9474] tabular-nums">
                                <span className="flex items-center gap-1">
                                  <FileAudio className="w-3 h-3" />
                                  {entry.filePath}
                                </span>
                                {entry.status === 'ready' && entry.quality && (
                                  <span className="text-[#00ff66]">
                                    {entry.duration.toFixed(2)}s · {formatBytes(entry.sizeBytes)} ·{' '}
                                    {entry.quality.sampleRate}Hz
                                  </span>
                                )}
                                {entry.error && (
                                  <span className="text-[#ff7070]">Err: {entry.error}</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                              <button
                                onClick={() => void handlePreviewAsset(entry, 'vhf')}
                                disabled={entry.status !== 'ready' || Boolean(previewingAssetKey)}
                                className="px-2 py-1 bg-[#0c1e15] hover:bg-[#163625] text-[#00ff66] border border-[#1e4d35] rounded flex items-center gap-1 disabled:opacity-35"
                              >
                                <Radio className="w-3 h-3" />
                                <span>VHF</span>
                              </button>
                              <button
                                onClick={() => void handlePreviewAsset(entry, 'dry')}
                                disabled={entry.status !== 'ready' || Boolean(previewingAssetKey)}
                                className="px-2 py-1 bg-[#0c1e15] hover:bg-[#163625] text-[#7ae8ff] border border-[#1e4d35] rounded flex items-center gap-1 disabled:opacity-35"
                              >
                                <Volume2 className="w-3 h-3" />
                                <span>Dry</span>
                              </button>
                              <button
                                onClick={() => void handleGenerateAsset(entry)}
                                disabled={busy}
                                className="px-2 py-1 bg-[#102d1d] hover:bg-[#17422a] text-[#a2f5bf] border border-[#1e4d35] rounded flex items-center gap-1 disabled:opacity-40"
                              >
                                {busy ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                <span>{entry.status === 'ready' ? 'Regen' : 'Gen'}</span>
                              </button>
                              <button
                                onClick={() => void handleDeleteAsset(entry)}
                                disabled={busy || (entry.status !== 'ready' && !entry.isCustom)}
                                className="p-1 bg-[#1d1113] hover:bg-[#3b1216] text-[#ff8787] border border-[#4a1c21] rounded disabled:opacity-35"
                                title="Delete WAV or custom phrase"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Pagination */}
                  <div className="pt-2 flex items-center justify-between font-mono text-[11px] text-[#7cc99c] tabular-nums">
                    <span>
                      Showing {libTotal === 0 ? 0 : pageOffset + 1}–
                      {Math.min(libTotal, pageOffset + libItems.length)} of {libTotal} assets
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setPageOffset(Math.max(0, pageOffset - PAGE_SIZE))}
                        disabled={pageOffset === 0}
                        className="px-2.5 py-1 bg-[#09150f] border border-[#1e4d35] rounded disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setPageOffset(pageOffset + PAGE_SIZE)}
                        disabled={pageOffset + PAGE_SIZE >= libTotal}
                        className="px-2.5 py-1 bg-[#09150f] border border-[#1e4d35] rounded disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* =================================================================
                  SECTION 3: TTS ENGINE
              ================================================================= */}
              {activeTab === 'engine' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {/* Selected Model & Lifecycle */}
                    <div className="bg-[#09150f] border border-[#173a27] rounded p-3 flex flex-col justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[11px] font-bold text-[#00e5ff] flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5" />
                            <span>Local Model Manager</span>
                          </span>
                          <span
                            className={`font-mono text-[11px] font-bold uppercase ${
                              modelState === 'ready'
                                ? 'text-[#00ff66]'
                                : modelState === 'error'
                                  ? 'text-[#ff7070]'
                                  : 'text-[#ffd166]'
                            }`}
                          >
                            {modelState}
                          </span>
                        </div>
                        <div className="font-mono text-xs text-[#e6f7ed] font-semibold">
                          {engineStatus?.model.displayName || 'Kokoro-82M v1.0 ONNX (INT8)'}
                        </div>
                        <div className="text-[11px] font-mono text-[#73aa89] space-y-1 tabular-nums">
                          <div>
                            Engine: {engineStatus?.model.engine || 'kokoro-js (onnxruntime-node)'}
                          </div>
                          <div>
                            License: {engineStatus?.model.license || 'Apache-2.0'} · Dtype:{' '}
                            {engineStatus?.model.dtype || 'q8'}
                          </div>
                          <div>
                            Disk: {formatBytes(engineStatus?.model.totalDiskBytes || 0)} · Verified:{' '}
                            {engineStatus?.model.verifiedOnDisk ? 'YES' : 'MISSING'}
                          </div>
                          <div>
                            Load Time:{' '}
                            {engineStatus?.model.loadDurationMs != null
                              ? `${engineStatus.model.loadDurationMs} ms`
                              : 'Not loaded yet'}{' '}
                            · Restarts: {engineStatus?.workerRestarts ?? 0}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-1.5 font-mono text-[11px]">
                        <button
                          onClick={() => void handleModelLoadToggle()}
                          disabled={modelBusy}
                          className="flex-1 py-1.5 rounded bg-[#10301e] hover:bg-[#17422a] border border-[#246640] text-[#00ff66] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-45"
                        >
                          {modelBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Power className="w-3.5 h-3.5" />
                          )}
                          <span>{modelState === 'ready' ? 'Unload Model' : 'Load Model'}</span>
                        </button>
                        <button
                          onClick={() => void handleRecoverWorker()}
                          disabled={recoveringWorker}
                          className="px-2.5 py-1.5 rounded bg-[#0c1e15] hover:bg-[#163625] border border-[#1d4b32] text-[#a2f5bf] flex items-center gap-1 disabled:opacity-45"
                          title="Recycle Worker Thread & reload model"
                        >
                          {recoveringWorker ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Wrench className="w-3.5 h-3.5" />
                          )}
                          <span>Recover</span>
                        </button>
                      </div>
                    </div>

                    {/* Hardware Acceleration Telemetry */}
                    <div className="bg-[#09150f] border border-[#173a27] rounded p-3 space-y-2 font-mono text-[11px] tabular-nums">
                      <div className="flex items-center justify-between border-b border-[#133221] pb-1.5">
                        <span className="font-bold text-[#00ff66] flex items-center gap-1.5">
                          <Server className="w-3.5 h-3.5" />
                          <span>HARDWARE ACCELERATION</span>
                        </span>
                        <span className="text-[#00e5ff] uppercase font-bold">
                          EP: {hardware?.executionProvider || 'cpu'}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#e2f5ea] truncate">
                        {hardware?.cpuModel || 'Inspecting CPU...'}
                      </div>
                      <div className="space-y-1 text-[#73aa89]">
                        <div className="flex justify-between">
                          <span>CPU Cores / Usage</span>
                          <span className="text-[#e2f5ea]">
                            {hardware?.cpuCores ?? '--'} cores · {hardware?.cpuUsagePercent ?? 0}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>System RAM Used</span>
                          <span className="text-[#e2f5ea]">
                            {formatBytes(hardware?.ramUsedBytes ?? 0)} /{' '}
                            {formatBytes(hardware?.ramTotalBytes ?? 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>GPU Acceleration</span>
                          <span className={hardware?.gpuAvailable ? 'text-[#00ff66]' : 'text-[#ffd166]'}>
                            {hardware?.gpuAvailable
                              ? `${hardware.gpuName} (${hardware.gpuUtilizationPercent ?? 0}%)`
                              : 'CPU Execution Only'}
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] text-[#5e9474] leading-snug pt-1 border-t border-[#122e1f]">
                        {hardware?.note || 'Worker runs quantized ONNX CPU inference without occupying GPU VRAM.'}
                      </p>
                    </div>

                    {/* Generation Queue */}
                    <div className="bg-[#09150f] border border-[#173a27] rounded p-3 flex flex-col justify-between gap-2 font-mono tabular-nums">
                      <div className="flex items-center justify-between border-b border-[#133221] pb-1.5">
                        <span className="text-[11px] font-bold text-[#a2f5bf] flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5 text-[#00ff66]" />
                          <span>Generation Queue</span>
                        </span>
                        <span className="text-[10px] text-[#00e5ff] font-bold">
                          {engineStatus?.queue.processingCount ? 'ACTIVE' : 'IDLE'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 divide-x divide-[#133221] text-center py-1">
                        <div className="px-2">
                          <div className="text-[10px] text-[#649e7c]">QUEUED</div>
                          <div className="text-base font-bold text-[#ffd166]">
                            {engineStatus?.queue.queuedCount ?? 0}
                          </div>
                        </div>
                        <div className="px-2">
                          <div className="text-[10px] text-[#649e7c]">COMPLETED</div>
                          <div className="text-base font-bold text-[#00ff66]">
                            {engineStatus?.queue.completedCount ?? 0}
                          </div>
                        </div>
                        <div className="px-2">
                          <div className="text-[10px] text-[#649e7c]">FAILED</div>
                          <div className="text-base font-bold text-[#ff7070]">
                            {engineStatus?.queue.failedCount ?? 0}
                          </div>
                        </div>
                      </div>
                      <div className="text-[10px] text-[#73aa89] truncate">
                        {engineStatus?.queue.activeJob
                          ? `Synthesizing ${engineStatus.queue.activeJob.voiceId}: "${engineStatus.queue.activeJob.text}"`
                          : 'Queue idle — zero blocking on 20 Hz radar loop.'}
                      </div>
                      {(engineStatus?.queue.recentJobs?.length ?? 0) > 0 && (
                        <div className="pt-1.5 border-t border-[#122e1f] max-h-24 overflow-y-auto divide-y divide-[#10291b] text-[10px]">
                          {engineStatus!.queue.recentJobs.slice(0, 6).map(job => (
                            <div key={job.jobId} className="py-1 flex items-center justify-between gap-2">
                              <span className="text-[#9acbb0] truncate">
                                <b className="text-[#00e5ff]">{job.voiceId}</b> · {job.text}
                              </span>
                              <span
                                className={`shrink-0 ${
                                  job.status === 'failed'
                                    ? 'text-[#ff7070]'
                                    : job.status === 'completed'
                                      ? 'text-[#00ff66]'
                                      : 'text-[#ffd166]'
                                }`}
                              >
                                {job.status === 'completed' && job.durationMs != null
                                  ? `${job.durationMs}ms`
                                  : job.status.toUpperCase()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Disk Files Verification & Live Synthesis Tester */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <div className="lg:col-span-5 bg-[#09150f] border border-[#173a27] rounded p-3 space-y-2">
                      <div className="font-mono text-[11px] font-bold text-[#a2f5bf]">
                        LOCAL MODEL ARTIFACTS ON DISK
                      </div>
                      <div className="divide-y divide-[#122e1f] font-mono text-[11px] tabular-nums">
                        {(engineStatus?.model.files || []).map(f => (
                          <div
                            key={f.relativePath}
                            className="py-1.5 flex items-center justify-between gap-2"
                          >
                            <span className="text-[#c5e8d3] truncate">{f.relativePath}</span>
                            <span className={f.exists ? 'text-[#00ff66]' : 'text-[#ff7070]'}>
                              {f.exists ? formatBytes(f.sizeBytes) : 'MISSING'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="lg:col-span-7 bg-[#09150f] border border-[#173a27] rounded p-3 space-y-2.5">
                      <div className="font-mono text-[11px] font-bold text-[#00e5ff]">
                        LIVE LOCAL SYNTHESIS TESTER
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-4">
                          <select
                            value={testVoiceId}
                            onChange={e => setTestVoiceId(e.target.value)}
                            className="w-full bg-[#060e09] border border-[#1e4d35] rounded px-2 py-1.5 text-xs"
                          >
                            {profiles.map(p => (
                              <option key={p.id} value={p.id}>
                                [{p.voiceType}] {p.displayName}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-8">
                          <input
                            type="text"
                            value={testPhrase}
                            onChange={e => setTestPhrase(e.target.value)}
                            className="w-full bg-[#060e09] border border-[#1e4d35] rounded px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#73aa89]">
                          Runs through ICAO Speech Grammar + Local Worker + VHF DSP chain
                        </span>
                        <button
                          onClick={() => void handleRunSynthTest()}
                          disabled={testingSynth}
                          className="px-3 py-1.5 rounded bg-[#10301e] hover:bg-[#17422a] text-[#00ff66] border border-[#246640] font-mono text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-45"
                        >
                          {testingSynth ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                          <span>Synthesize & Play VHF</span>
                        </button>
                      </div>
                      {engineStatus?.model.lastError && (
                        <div className="p-2 rounded bg-[#2d1215] border border-[#63262c] text-[#ff9b9b] font-mono text-[11px]">
                          Model Error: {engineStatus.model.lastError}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* =================================================================
                  SECTION 4: RADIO EFFECTS
              ================================================================= */}
              {activeTab === 'effects' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-[#e6f7ed]">
                        Aviation VHF Radio Processing & PTT Timing
                      </h3>
                      <p className="text-[11px] text-[#73aa89]">
                        Independent controls for bandpass filtering, AGC compression, saturation,
                        carrier hiss, RF dropouts, cockpit noise, and PTT squelch gates.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <label className="flex items-center gap-1.5 bg-[#09150f] border border-[#1e4d35] rounded px-2.5 py-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={vhfSettings.enabled}
                          onChange={e => handleVhfField('enabled', e.target.checked)}
                          className="accent-[#00ff66]"
                        />
                        <span className={vhfSettings.enabled ? 'text-[#00ff66] font-bold' : 'text-[#7cc99c]'}>
                          VHF DSP {vhfSettings.enabled ? 'ENABLED' : 'BYPASSED'}
                        </span>
                      </label>
                      <button
                        onClick={() => {
                          radioAudio.resetVhfSettings();
                          setPttTiming(radioAudio.setPttTiming(DEFAULT_PTT_TIMING));
                        }}
                        className="px-2.5 py-1 bg-[#09150f] hover:bg-[#143022] text-[#9ad9b4] border border-[#1e4d35] rounded flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset DSP</span>
                      </button>
                    </div>
                  </div>

                  {/* 5 Propagation Quality Presets */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    {Object.values(VHF_RADIO_PRESETS).map(preset => {
                      const active = vhfSettings.preset === preset.id && vhfSettings.enabled;
                      return (
                        <button
                          key={preset.id}
                          onClick={() =>
                            radioAudio.setVhfPreset(
                              preset.id as Exclude<VhfQualityPresetId, 'custom'>
                            )
                          }
                          className={`text-left p-2.5 rounded border transition-colors ${
                            active
                              ? 'bg-[#0e3820] border-[#00ff66] text-[#e8fff0]'
                              : 'bg-[#09150f] border-[#163826] hover:border-[#275e40] text-[#b4d6c1]'
                          }`}
                        >
                          <div className="font-bold text-xs">{preset.name}</div>
                          <div className="text-[10px] text-[#6fa584] mt-1 leading-snug">
                            {preset.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* A/B Clean vs VHF Comparison Preview */}
                  <div className="p-3 bg-[#09150f] border border-[#1d4b32] rounded space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-[#00e5ff] flex items-center gap-1.5">
                        <GitCompare className="w-3.5 h-3.5" />
                        <span>CLEAN TTS VS PROCESSED VHF A/B PREVIEW</span>
                      </span>
                      {activePhase && (
                        <span className="font-mono text-[10px] font-bold text-[#00ff66]">
                          PLAYING: {activePhase.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                      <select
                        value={previewVoiceId}
                        onChange={e => setPreviewVoiceId(e.target.value)}
                        className="md:col-span-4 bg-[#060e09] border border-[#1e4d35] rounded px-2 py-1.5 text-xs"
                      >
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.id} · {p.voiceType}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={previewText}
                        onChange={e => setPreviewText(e.target.value)}
                        placeholder="Optional custom phrase (defaults to voice sample)"
                        className="md:col-span-8 bg-[#060e09] border border-[#1e4d35] rounded px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 font-mono text-[11px]">
                      <button
                        onClick={() => void handleVhfPreview('clean')}
                        disabled={Boolean(previewMode)}
                        className="px-3 py-1 bg-[#0c212a] hover:bg-[#13323f] text-[#7ae8ff] border border-[#1a4859] rounded disabled:opacity-45"
                      >
                        Preview Clean TTS
                      </button>
                      <button
                        onClick={() => void handleVhfPreview('vhf')}
                        disabled={Boolean(previewMode)}
                        className="px-3 py-1 bg-[#0e3820] hover:bg-[#165230] text-[#00ff66] border border-[#246640] rounded font-bold disabled:opacity-45"
                      >
                        Preview Processed VHF
                      </button>
                      <button
                        onClick={() => void handleVhfPreview('ab')}
                        disabled={Boolean(previewMode)}
                        className="px-3 py-1 bg-[#102d1d] hover:bg-[#18442c] text-[#a2f5bf] border border-[#1e4d35] rounded disabled:opacity-45"
                      >
                        Compare A/B (Clean → VHF)
                      </button>
                      {previewMode && (
                        <button
                          onClick={() => {
                            radioAudio.clearQueue();
                            setPreviewMode(null);
                            setActivePhase(null);
                          }}
                          className="px-2.5 py-1 bg-[#3b1216] text-[#ff7070] border border-[#5e2424] rounded"
                        >
                          Stop
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Independent Sliders */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-[#09150f] border border-[#173a27] rounded p-3 space-y-2.5">
                      <div className="font-mono text-[11px] font-bold text-[#00ff66]">
                        RF NOISE, INTERFERENCE & BANDPASS
                      </div>
                      <StudioSlider
                        label="Static Noise Intensity"
                        valueLabel={`${Math.round(vhfSettings.noiseIntensity * 100)}%`}
                        min={0}
                        max={1}
                        step={0.01}
                        value={vhfSettings.noiseIntensity}
                        onChange={v => handleVhfField('noiseIntensity', v)}
                      />
                      <StudioSlider
                        label="Signal Strength"
                        valueLabel={`${Math.round(vhfSettings.signalStrength * 100)}%`}
                        min={0.05}
                        max={1}
                        step={0.01}
                        value={vhfSettings.signalStrength}
                        onChange={v => handleVhfField('signalStrength', v)}
                      />
                      <StudioSlider
                        label="Interference / Dropout Probability"
                        valueLabel={`${Math.round(vhfSettings.dropoutProbability * 100)}%`}
                        min={0}
                        max={1}
                        step={0.01}
                        value={vhfSettings.dropoutProbability}
                        onChange={v => handleVhfField('dropoutProbability', v)}
                      />
                      <StudioSlider
                        label="Static Center Frequency"
                        valueLabel={`${Math.round(vhfSettings.staticFrequency)} Hz`}
                        min={500}
                        max={2600}
                        step={25}
                        value={vhfSettings.staticFrequency}
                        onChange={v => handleVhfField('staticFrequency', v)}
                      />
                      <div className="grid grid-cols-2 gap-2.5">
                        <StudioSlider
                          label="VHF High-Pass"
                          valueLabel={`${Math.round(vhfSettings.bandpassLowHz)} Hz`}
                          min={220}
                          max={550}
                          step={10}
                          value={vhfSettings.bandpassLowHz}
                          onChange={v => handleVhfField('bandpassLowHz', v)}
                        />
                        <StudioSlider
                          label="VHF Low-Pass"
                          valueLabel={`${Math.round(vhfSettings.bandpassHighHz)} Hz`}
                          min={2100}
                          max={3800}
                          step={50}
                          value={vhfSettings.bandpassHighHz}
                          onChange={v => handleVhfField('bandpassHighHz', v)}
                        />
                      </div>
                    </div>

                    <div className="bg-[#09150f] border border-[#173a27] rounded p-3 space-y-2.5">
                      <div className="font-mono text-[11px] font-bold text-[#00e5ff]">
                        DYNAMICS, COCKPIT BED & PTT TIMING
                      </div>
                      <StudioSlider
                        label="Radio AGC Compression"
                        valueLabel={`${Math.round(vhfSettings.compression * 100)}%`}
                        min={0}
                        max={1}
                        step={0.01}
                        value={vhfSettings.compression}
                        onChange={v => handleVhfField('compression', v)}
                      />
                      <StudioSlider
                        label="Analog Saturation / Distortion"
                        valueLabel={`${Math.round(vhfSettings.distortion * 100)}%`}
                        min={0}
                        max={1}
                        step={0.01}
                        value={vhfSettings.distortion}
                        onChange={v => handleVhfField('distortion', v)}
                      />
                      <StudioSlider
                        label="Radio Clarity"
                        valueLabel={`${Math.round(vhfSettings.radioClarity * 100)}%`}
                        min={0}
                        max={1}
                        step={0.01}
                        value={vhfSettings.radioClarity}
                        onChange={v => handleVhfField('radioClarity', v)}
                      />
                      <div className="pt-1 border-t border-[#122e1f] flex items-center justify-between gap-2 text-[11px]">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vhfSettings.cockpitNoiseEnabled}
                            onChange={e =>
                              handleVhfField('cockpitNoiseEnabled', e.target.checked)
                            }
                            className="accent-[#00ff66]"
                          />
                          <span>Cockpit Ambient Avionics Bed</span>
                        </label>
                        <div className="w-32 flex items-center gap-1.5">
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.02}
                            disabled={!vhfSettings.cockpitNoiseEnabled}
                            value={vhfSettings.cockpitNoiseLevel}
                            onChange={e =>
                              handleVhfField('cockpitNoiseLevel', parseFloat(e.target.value))
                            }
                            className="w-full h-1 accent-[#00e5ff] bg-[#163826] rounded cursor-pointer disabled:opacity-40"
                          />
                          <span className="font-mono text-[10px] w-8 text-right tabular-nums">
                            {Math.round(vhfSettings.cockpitNoiseLevel * 100)}%
                          </span>
                        </div>
                      </div>

                      <div className="pt-1 border-t border-[#122e1f] grid grid-cols-2 gap-2.5">
                        <StudioSlider
                          label="PTT Key / Squelch"
                          valueLabel={`${Math.round(vhfSettings.pttDurationMs)} ms`}
                          min={25}
                          max={220}
                          step={5}
                          value={vhfSettings.pttDurationMs}
                          onChange={v => handleVhfField('pttDurationMs', v)}
                        />
                        <StudioSlider
                          label="PTT Key-Up Lead"
                          valueLabel={`${pttTiming.keyUpLeadMs} ms`}
                          min={0}
                          max={250}
                          step={10}
                          value={pttTiming.keyUpLeadMs}
                          onChange={v => handlePttTimingField('keyUpLeadMs', v)}
                        />
                        <StudioSlider
                          label="Turn Gap (ATC ↔ Pilot)"
                          valueLabel={`${pttTiming.interTurnGapMs} ms`}
                          min={50}
                          max={600}
                          step={10}
                          value={pttTiming.interTurnGapMs}
                          onChange={v => handlePttTimingField('interTurnGapMs', v)}
                        />
                        <StudioSlider
                          label="Unkey Squelch Tail"
                          valueLabel={`${pttTiming.unkeyTailMs} ms`}
                          min={20}
                          max={300}
                          step={10}
                          value={pttTiming.unkeyTailMs}
                          onChange={v => handlePttTimingField('unkeyTailMs', v)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Live Frequency Comms Queue Monitor */}
                  <div className="p-3 bg-[#09150f] border border-[#173a27] rounded flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
                    <div className="flex flex-wrap items-center gap-3 text-[#8bc9a5]">
                      <span>
                        Active TX:{' '}
                        <b className="text-[#00ff66]">
                          {commsSnapshot.activeTx
                            ? `${commsSnapshot.activeTx.callsign} (${commsSnapshot.activeTx.frequency} · ${commsSnapshot.activeTx.priority})`
                            : 'None (Channel Clear)'}
                        </b>
                      </span>
                      <span className="text-[#265c3e]" aria-hidden="true">·</span>
                      <span>
                        Queued Exchanges: <b className="text-[#ffd166]">{commsSnapshot.queueLength}</b>
                      </span>
                      <span className="text-[#265c3e]" aria-hidden="true">·</span>
                      <span>
                        Active Frequencies:{' '}
                        <b className="text-[#00e5ff]">
                          {commsSnapshot.activeFrequencies.length > 0
                            ? commsSnapshot.activeFrequencies.join(', ')
                            : 'Idle'}
                        </b>
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        radioAudio.clearQueue();
                        setBannerNotice('Cleared active VHF transmission & pending radio queue.');
                      }}
                      disabled={!commsSnapshot.activeTx && commsSnapshot.queueLength === 0}
                      className="px-2.5 py-1 bg-[#251315] hover:bg-[#381c20] text-[#ff8a8a] border border-[#57292e] rounded disabled:opacity-40 whitespace-nowrap"
                    >
                      Clear Radio Queue
                    </button>
                  </div>
                </div>
              )}

              {/* =================================================================
                  SECTION 5: AUDIO DIAGNOSTICS
              ================================================================= */}
              {activeTab === 'diagnostics' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-[#e6f7ed]">
                        Audio Pipeline Diagnostics & System Telemetry
                      </h3>
                      <p className="text-[11px] text-[#73aa89]">
                        Real-time synthesis latency, cache efficiency, library health, compute load,
                        and error log.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <button
                        onClick={() => void refreshDiagnostics()}
                        className="px-2.5 py-1 bg-[#09150f] hover:bg-[#143022] text-[#00e5ff] border border-[#1e4d35] rounded flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Refresh</span>
                      </button>
                      <button
                        onClick={() => void handleResetTelemetry()}
                        className="px-2.5 py-1 bg-[#251315] hover:bg-[#381c20] text-[#ff8a8a] border border-[#57292e] rounded flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Telemetry</span>
                      </button>
                    </div>
                  </div>

                  {/* Primary 4 KPI Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 font-mono tabular-nums">
                    <div className="p-3 bg-[#09150f] border border-[#173a27] rounded">
                      <div className="text-[10px] text-[#649e7c]">AVG GENERATION LATENCY</div>
                      <div className="text-lg font-bold text-[#00e5ff] mt-0.5">
                        {diagnostics?.latency.avgMs ?? 0} ms
                      </div>
                      <div className="text-[10px] text-[#6aa382] mt-1">
                        p95: {diagnostics?.latency.p95Ms ?? 0}ms · n={diagnostics?.latency.sampleCount ?? 0}
                      </div>
                    </div>

                    <div className="p-3 bg-[#09150f] border border-[#173a27] rounded">
                      <div className="text-[10px] text-[#649e7c]">CACHE HIT RATE</div>
                      <div className="text-lg font-bold text-[#00ff66] mt-0.5">
                        {diagnostics?.cache.hitRatePercent ?? 0}%
                      </div>
                      <div className="text-[10px] text-[#6aa382] mt-1">
                        Lib: {diagnostics?.cache.libraryHits ?? 0} · Disk:{' '}
                        {diagnostics?.cache.diskHits ?? 0} · IDB: {clientDiag.clientCacheHits}
                      </div>
                    </div>

                    <div className="p-3 bg-[#09150f] border border-[#173a27] rounded">
                      <div className="text-[10px] text-[#649e7c]">GENERATED / MISSING ASSETS</div>
                      <div className="text-lg font-bold text-[#e6f7ed] mt-0.5">
                        {diagnostics?.assets.readyCount ?? 0}{' '}
                        <span className="text-xs font-normal text-[#ffd166]">
                          / {diagnostics?.assets.missingCount ?? 0} missing
                        </span>
                      </div>
                      <div className="text-[10px] text-[#6aa382] mt-1">
                        Matrix: {diagnostics?.assets.totalMatrix ?? 0} · Dyn Cache:{' '}
                        {diagnostics?.assets.cacheEntries ?? 0}
                      </div>
                    </div>

                    <div className="p-3 bg-[#09150f] border border-[#173a27] rounded">
                      <div className="text-[10px] text-[#649e7c]">ERRORS & WORKER RESTARTS</div>
                      <div
                        className={`text-lg font-bold mt-0.5 ${
                          (diagnostics?.errors.ttsFailedCount ?? 0) + clientDiag.playbackErrorCount > 0
                            ? 'text-[#ff7070]'
                            : 'text-[#00ff66]'
                        }`}
                      >
                        {(diagnostics?.errors.ttsFailedCount ?? 0) + clientDiag.playbackErrorCount}
                      </div>
                      <div className="text-[10px] text-[#6aa382] mt-1">
                        Playback Err: {clientDiag.playbackErrorCount} · Restarts:{' '}
                        {diagnostics?.errors.workerRestarts ?? 0}
                      </div>
                    </div>
                  </div>

                  {/* Hardware CPU/GPU & Storage Telemetry */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 font-mono text-[11px] tabular-nums">
                    <div className="p-3 bg-[#09150f] border border-[#173a27] rounded space-y-2">
                      <div className="font-bold text-[#00e5ff] flex items-center gap-1.5 border-b border-[#133221] pb-1.5">
                        <Gauge className="w-3.5 h-3.5" />
                        <span>CPU & GPU RESOURCE UTILIZATION</span>
                      </div>
                      <div className="space-y-1.5 text-[#7cc99c]">
                        <div className="flex justify-between">
                          <span>CPU Load ({hardware?.cpuCores ?? '--'} cores)</span>
                          <span className="text-[#e6f7ed] font-bold">
                            {hardware?.cpuUsagePercent ?? 0}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Host RAM Usage</span>
                          <span className="text-[#e6f7ed]">
                            {formatBytes(hardware?.ramUsedBytes ?? 0)} /{' '}
                            {formatBytes(hardware?.ramTotalBytes ?? 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Server Process RSS / Heap</span>
                          <span className="text-[#e6f7ed]">
                            {formatBytes(hardware?.processRssBytes ?? 0)} /{' '}
                            {formatBytes(hardware?.processHeapUsedBytes ?? 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>GPU Status</span>
                          <span
                            className={
                              hardware?.gpuAvailable ? 'text-[#00ff66]' : 'text-[#ffd166]'
                            }
                          >
                            {hardware?.gpuAvailable
                              ? `${hardware.gpuName} · ${hardware.gpuUtilizationPercent ?? 0}% (${
                                  hardware.gpuMemoryUsedMb ?? 0
                                }/${hardware.gpuMemoryTotalMb ?? 0} MB)`
                              : 'Not detected (CPU ONNX runtime active)'}
                          </span>
                        </div>
                      </div>
                      {diagnostics && diagnostics.latency.recentMs.length > 0 && (
                        <div className="pt-2 border-t border-[#122e1f]">
                          <div className="text-[10px] text-[#649e7c] mb-1">
                            RECENT SYNTHESIS SAMPLES (MS)
                          </div>
                          <div className="flex items-end gap-1 h-10">
                            {diagnostics.latency.recentMs.slice(-20).map((ms, idx) => {
                              const maxMs = Math.max(100, diagnostics.latency.maxMs);
                              const pct = Math.max(12, Math.round((ms / maxMs) * 100));
                              return (
                                <div
                                  key={`${idx}_${ms}`}
                                  style={{ height: `${pct}%` }}
                                  className="flex-1 bg-[#00e5ff]/70 rounded-t"
                                  title={`${ms} ms`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-3 bg-[#09150f] border border-[#173a27] rounded space-y-2">
                      <div className="font-bold text-[#00ff66] flex items-center gap-1.5 border-b border-[#133221] pb-1.5">
                        <HardDrive className="w-3.5 h-3.5" />
                        <span>LOCAL AUDIO STORAGE FOOTPRINT</span>
                      </div>
                      <div className="space-y-1.5 text-[#7cc99c]">
                        <div className="flex justify-between">
                          <span>Pre-Generated Audio Library</span>
                          <span className="text-[#e6f7ed]">
                            {formatBytes(diagnostics?.assets.librarySizeBytes ?? 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Dynamic Kokoro WAV Cache</span>
                          <span className="text-[#e6f7ed]">
                            {formatBytes(diagnostics?.assets.cacheSizeBytes ?? 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Local Kokoro-82M Model Weights</span>
                          <span className="text-[#e6f7ed]">
                            {formatBytes(diagnostics?.assets.modelSizeBytes ?? 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Voice Profile Samples (15)</span>
                          <span className="text-[#e6f7ed]">
                            {formatBytes(diagnostics?.assets.samplesSizeBytes ?? 0)}
                          </span>
                        </div>
                        <div className="flex justify-between pt-1.5 border-t border-[#122e1f] font-bold">
                          <span className="text-[#a2f5bf]">Total Local Storage Used</span>
                          <span className="text-[#00ff66]">
                            {formatBytes(diagnostics?.assets.totalStorageBytes ?? 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Error Log */}
                  <div className="p-3 bg-[#09150f] border border-[#173a27] rounded space-y-2">
                    <div className="font-mono text-[11px] font-bold text-[#ffd166]">
                      RECENT ENGINE & PLAYBACK ERRORS ({combinedErrors.length})
                    </div>
                    {combinedErrors.length === 0 ? (
                      <div className="text-[11px] text-[#6aa382] py-2">
                        Zero runtime TTS synthesis, worker, or Web Audio playback errors recorded.
                      </div>
                    ) : (
                      <div className="max-h-40 overflow-y-auto divide-y divide-[#122e1f] font-mono text-[11px] tabular-nums">
                        {combinedErrors.map((err, i) => (
                          <div key={`${err.timestamp}_${i}`} className="py-1.5 flex gap-3">
                            <span className="text-[#5c9474] shrink-0">
                              {new Date(err.timestamp).toLocaleTimeString()}
                            </span>
                            <span className="text-[#ffd166] uppercase w-20 shrink-0">
                              [{err.source}]
                            </span>
                            <span className="text-[#ff9b9b]">{err.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* =================================================================
                  SECTION 6: GLOBAL SETTINGS
              ================================================================= */}
              {activeTab === 'settings' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-[#e6f7ed]">
                      Global Audio Studio & Storage Settings
                    </h3>
                    <p className="text-[11px] text-[#73aa89]">
                      Persisted locally in <code>local-data/audio-settings.json</code> across
                      restarts with versioned schema migrations.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {/* Audio & Generation Behavior */}
                    <div className="p-3 bg-[#09150f] border border-[#173a27] rounded space-y-3">
                      <div className="font-mono text-[11px] font-bold text-[#00ff66] border-b border-[#133221] pb-1.5">
                        MASTER AUDIO & BACKGROUND SYNTHESIS
                      </div>

                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <div>
                          <div className="text-xs font-semibold text-[#e2f5ea]">
                            Enable Simulator Radio Audio
                          </div>
                          <div className="text-[10px] text-[#6aa382]">
                            Master output gate for all VHF ATC and pilot audio
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={globalSettings.audioEnabled}
                          onChange={e =>
                            void handleUpdateGlobalSettings({ audioEnabled: e.target.checked })
                          }
                          className="accent-[#00ff66] w-4 h-4"
                        />
                      </label>

                      <StudioSlider
                        label="Master VHF Volume"
                        valueLabel={`${Math.round(globalSettings.masterVolume * 100)}%`}
                        min={0}
                        max={1}
                        step={0.05}
                        value={globalSettings.masterVolume}
                        onChange={v => void handleUpdateGlobalSettings({ masterVolume: v })}
                      />

                      <label className="flex items-center justify-between gap-3 cursor-pointer pt-1 border-t border-[#122e1f]">
                        <div>
                          <div className="text-xs font-semibold text-[#e2f5ea]">
                            Enable Local Kokoro Neural TTS
                          </div>
                          <div className="text-[10px] text-[#6aa382]">
                            When off, immediately uses bundled offline voice sprites & OS voices
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={globalSettings.ttsEnabled}
                          onChange={e =>
                            void handleUpdateGlobalSettings({ ttsEnabled: e.target.checked })
                          }
                          className="accent-[#00ff66] w-4 h-4"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <div>
                          <div className="text-xs font-semibold text-[#e2f5ea]">
                            Enable Background Queue Generation
                          </div>
                          <div className="text-[10px] text-[#6aa382]">
                            Controls low-priority background phrase synthesis tasks
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={globalSettings.backgroundGenerationEnabled}
                          onChange={e =>
                            void handleUpdateGlobalSettings({
                              backgroundGenerationEnabled: e.target.checked,
                            })
                          }
                          className="accent-[#00ff66] w-4 h-4"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <div>
                          <div className="text-xs font-semibold text-[#e2f5ea]">
                            Lookahead Pilot Readback Pre-Synthesis
                          </div>
                          <div className="text-[10px] text-[#6aa382]">
                            Pre-warms readback WAV while ATC is transmitting
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={globalSettings.prewarmReadbacksEnabled}
                          onChange={e =>
                            void handleUpdateGlobalSettings({
                              prewarmReadbacksEnabled: e.target.checked,
                            })
                          }
                          className="accent-[#00ff66] w-4 h-4"
                        />
                      </label>
                    </div>

                    {/* Default Voices & Radio Quality */}
                    <div className="p-3 bg-[#09150f] border border-[#173a27] rounded space-y-2.5">
                      <div className="font-mono text-[11px] font-bold text-[#00e5ff] border-b border-[#133221] pb-1.5">
                        DEFAULT VOICES & PROPAGATION PRESET
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                        <div>
                          <label className="block text-[10px] font-mono text-[#649e7c] mb-1">
                            DEFAULT TOWER VOICE
                          </label>
                          <select
                            value={normalizeControllerId(
                              globalSettings.defaultVoices.tower,
                              'TOWER'
                            )}
                            onChange={e =>
                              void handleUpdateGlobalSettings({
                                defaultVoices: {
                                  ...globalSettings.defaultVoices,
                                  tower: e.target.value,
                                },
                              })
                            }
                            className="w-full bg-[#060e09] border border-[#1e4d35] rounded px-2 py-1.5 text-xs"
                          >
                            {profiles
                              .filter(p => p.voiceType !== 'PILOT')
                              .map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.displayName}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono text-[#649e7c] mb-1">
                            DEFAULT APPROACH VOICE
                          </label>
                          <select
                            value={normalizeControllerId(
                              globalSettings.defaultVoices.approach,
                              'APPROACH'
                            )}
                            onChange={e =>
                              void handleUpdateGlobalSettings({
                                defaultVoices: {
                                  ...globalSettings.defaultVoices,
                                  approach: e.target.value,
                                },
                              })
                            }
                            className="w-full bg-[#060e09] border border-[#1e4d35] rounded px-2 py-1.5 text-xs"
                          >
                            {profiles
                              .filter(p => p.voiceType !== 'PILOT')
                              .map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.displayName}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono text-[#649e7c] mb-1">
                            DEFAULT GROUND VOICE
                          </label>
                          <select
                            value={normalizeControllerId(
                              globalSettings.defaultVoices.ground,
                              'GROUND'
                            )}
                            onChange={e =>
                              void handleUpdateGlobalSettings({
                                defaultVoices: {
                                  ...globalSettings.defaultVoices,
                                  ground: e.target.value,
                                },
                              })
                            }
                            className="w-full bg-[#060e09] border border-[#1e4d35] rounded px-2 py-1.5 text-xs"
                          >
                            {profiles
                              .filter(p => p.voiceType !== 'PILOT')
                              .map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.displayName}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono text-[#649e7c] mb-1">
                            PILOT VOICE SELECTION
                          </label>
                          <select
                            value={globalSettings.defaultVoices.pilotStrategy}
                            onChange={e =>
                              void handleUpdateGlobalSettings({
                                defaultVoices: {
                                  ...globalSettings.defaultVoices,
                                  pilotStrategy: e.target.value as
                                    | 'airline_matched'
                                    | 'round_robin',
                                },
                              })
                            }
                            className="w-full bg-[#060e09] border border-[#1e4d35] rounded px-2 py-1.5 text-xs"
                          >
                            <option value="airline_matched">Airline Accent Matched</option>
                            <option value="round_robin">Uniform Round-Robin Pool</option>
                          </select>
                        </div>
                      </div>

                      <div className="pt-1">
                        <label className="block text-[10px] font-mono text-[#649e7c] mb-1">
                          DEFAULT RADIO QUALITY PRESET
                        </label>
                        <select
                          value={globalSettings.defaultRadioPreset}
                          onChange={e =>
                            void handleUpdateGlobalSettings(
                              {
                                defaultRadioPreset: e.target.value as Exclude<
                                  VhfQualityPresetId,
                                  'custom'
                                >,
                              },
                              true
                            )
                          }
                          className="w-full bg-[#060e09] border border-[#1e4d35] rounded px-2 py-1.5 text-xs"
                        >
                          {Object.values(VHF_RADIO_PRESETS).map(preset => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name} — {preset.description}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Storage Management & Versioned Schema Migrations */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="p-3 bg-[#09150f] border border-[#173a27] rounded space-y-3">
                      <div className="font-mono text-[11px] font-bold text-[#ffd166] border-b border-[#133221] pb-1.5">
                        LOCAL AUDIO STORAGE MANAGEMENT
                      </div>

                      <StudioSlider
                        label="Dynamic WAV Disk Cache Ceiling"
                        valueLabel={`${globalSettings.maxCacheSizeMb} MB`}
                        min={50}
                        max={1000}
                        step={25}
                        value={globalSettings.maxCacheSizeMb}
                        onChange={v => void handleUpdateGlobalSettings({ maxCacheSizeMb: v })}
                      />

                      <div className="flex flex-wrap gap-2 font-mono text-[11px] pt-1">
                        <button
                          onClick={() => void handleClearDynamicCache()}
                          className="px-2.5 py-1.5 bg-[#251315] hover:bg-[#381c20] text-[#ff8a8a] border border-[#57292e] rounded flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Clear Dynamic Cache</span>
                        </button>
                        <button
                          onClick={() => void handleCleanupUnused()}
                          disabled={cleaningUnused}
                          className="px-2.5 py-1.5 bg-[#0c1e15] hover:bg-[#153122] text-[#a2f5bf] border border-[#1e4d35] rounded flex items-center gap-1.5 disabled:opacity-45"
                        >
                          <FolderSearch className="w-3.5 h-3.5" />
                          <span>Prune Unused Library WAVs</span>
                        </button>
                        <button
                          onClick={() => void handleResetAllAudioSettings()}
                          className="px-2.5 py-1.5 bg-[#0c1e15] hover:bg-[#153122] text-[#ffd166] border border-[#4e461d] rounded flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reset All Audio Settings</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-3 bg-[#09150f] border border-[#173a27] rounded space-y-2 font-mono text-[11px] tabular-nums">
                      <div className="flex items-center justify-between border-b border-[#133221] pb-1.5">
                        <span className="font-bold text-[#a2f5bf]">
                          LOCAL DATABASE MIGRATIONS
                        </span>
                        <span className="text-[#00ff66]">
                          Schema v{dbState?.schemaVersion ?? 3}
                        </span>
                      </div>
                      <div className="divide-y divide-[#122e1f]">
                        {(dbState?.migrations || []).map(m => (
                          <div key={m.id} className="py-1.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[#e2f5ea] font-semibold">
                                v{m.version} · {m.id}
                              </div>
                              <div className="text-[10px] text-[#649e7c] truncate">
                                {m.description}
                              </div>
                            </div>
                            <span className="text-[10px] text-[#00ff66] shrink-0">APPLIED</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
  );

  if (mode === 'page') {
    return contentShell;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4 text-xs select-none">
      {contentShell}
    </div>
  );
};

interface StudioSliderProps {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (val: number) => void;
}

const StudioSlider: React.FC<StudioSliderProps> = ({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
}) => (
  <div>
    <div className="flex items-center justify-between text-[11px] mb-1">
      <span className="text-[#9acbb0]">{label}</span>
      <span className="font-mono text-[#00ff66] font-bold tabular-nums">{valueLabel}</span>
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
