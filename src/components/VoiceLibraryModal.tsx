/**
 * SKYCONTROL - Pre-Generated Offline Audio Library Manager Modal
 * Searchable asset database across all 15 voice profiles and all 24 aviation phrase categories
 * (A: 14 ATC Phrase categories, B: 8 Number categories, C: NATO Alphabet Alpha-Zulu, D: Templates).
 * Supports individual generation/regeneration, bulk generation, missing-file & duplicate scanning,
 * custom phrase addition, deletion, and VHF/Dry audio preview (100% offline).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  FileAudio,
  FolderSearch,
  Layers,
  Loader2,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
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
import { VoiceProfile } from '../../shared/ttsTypes';
import { radioAudio } from '../audio/radioAudio';
import { audioLibraryClient } from '../services/audioLibraryClient';
import { localTtsClient } from '../services/localTtsClient';

interface VoiceLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PAGE_SIZE = 50;

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getStatusBadge(status: AudioLibraryAssetStatus): string {
  switch (status) {
    case 'ready':
      return 'bg-[#0e3820] text-[#00ff66] border-[#00ff66]/40';
    case 'queued':
    case 'generating':
      return 'bg-[#0b333d] text-[#00e5ff] border-[#00e5ff]/40';
    case 'failed':
      return 'bg-[#3b1216] text-[#ff7070] border-[#ff4d4d]/50';
    case 'missing':
    case 'pending':
    default:
      return 'bg-[#2c2511] text-[#ffd166] border-[#6e5a1d]/60';
  }
}

export const VoiceLibraryModal: React.FC<VoiceLibraryModalProps> = ({ isOpen, onClose }) => {
  const [summary, setSummary] = useState<AudioLibrarySummary | null>(null);
  const [profiles, setProfiles] = useState<VoiceProfile[]>(localTtsClient.getProfilesSync());
  const [items, setItems] = useState<AudioLibraryManifestEntry[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [scanReport, setScanReport] = useState<IntegrityScanReport | null>(null);

  // Filters & search
  const [searchText, setSearchText] = useState('');
  const [voiceFilter, setVoiceFilter] = useState<string>('ALL');
  const [groupFilter, setGroupFilter] = useState<AudioLibraryGroup | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<AudioLibraryCategory | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<AudioLibraryAssetStatus | 'ALL'>('ALL');
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [pageOffset, setPageOffset] = useState(0);

  // Action states
  const [loading, setLoading] = useState(false);
  const [busyAssetIds, setBusyAssetIds] = useState<Record<string, boolean>>({});
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [showDuplicatesPanel, setShowDuplicatesPanel] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add custom phrase form
  const [customVoiceId, setCustomVoiceId] = useState<string>('tower_charon');
  const [customCategory, setCustomCategory] = useState<AudioLibraryCategory>('initial_contact');
  const [customText, setCustomText] = useState('');
  const [customPhraseId, setCustomPhraseId] = useState('');
  const [creatingCustom, setCreatingCustom] = useState(false);

  const categoriesForSelectedGroup = useMemo(() => {
    const all = Object.entries(AUDIO_LIBRARY_CATEGORY_META) as Array<
      [AudioLibraryCategory, { group: AudioLibraryGroup; label: string; description: string }]
    >;
    if (groupFilter === 'ALL') return all;
    return all.filter(([, meta]) => meta.group === groupFilter);
  }, [groupFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, searchRes, profs] = await Promise.all([
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
        localTtsClient.fetchProfiles(),
      ]);
      setSummary(sum);
      setItems(searchRes.items);
      setTotalMatches(searchRes.total);
      setDuplicates(searchRes.duplicates);
      setProfiles(profs);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
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

  useEffect(() => {
    if (!isOpen) return;
    void loadData();
  }, [isOpen, loadData]);

  // Poll while bulk generation job is actively running
  useEffect(() => {
    if (!isOpen || summary?.bulkJob.status !== 'running') return;
    const timer = setInterval(() => {
      void loadData();
    }, 1800);
    return () => clearInterval(timer);
  }, [isOpen, summary?.bulkJob.status, loadData]);

  if (!isOpen) return null;

  const duplicateAssetSet = new Set<string>();
  for (const grp of duplicates) {
    for (const id of grp.assetIds) duplicateAssetSet.add(id);
  }

  const handlePreview = async (entry: AudioLibraryManifestEntry, mode: 'vhf' | 'dry') => {
    setErrorMsg(null);
    setPreviewingId(`${entry.assetId}_${mode}`);
    try {
      const ok = await radioAudio.previewLibraryAsset(entry, mode);
      if (!ok) {
        setErrorMsg(`Preview could not play WAV for ${entry.assetId}.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewingId(null);
    }
  };

  const handleGenerateSingle = async (entry: AudioLibraryManifestEntry) => {
    setErrorMsg(null);
    setBusyAssetIds(prev => ({ ...prev, [entry.assetId]: true }));
    try {
      await audioLibraryClient.generateAsset(entry.assetId, true);
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAssetIds(prev => {
        const next = { ...prev };
        delete next[entry.assetId];
        return next;
      });
    }
  };

  const handleDeleteAsset = async (entry: AudioLibraryManifestEntry) => {
    setErrorMsg(null);
    setBusyAssetIds(prev => ({ ...prev, [entry.assetId]: true }));
    try {
      await audioLibraryClient.deleteAsset(entry.assetId, Boolean(entry.isCustom));
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAssetIds(prev => {
        const next = { ...prev };
        delete next[entry.assetId];
        return next;
      });
    }
  };

  const handleScanIntegrity = async () => {
    setScanning(true);
    setErrorMsg(null);
    try {
      const report = await audioLibraryClient.scanIntegrity();
      setScanReport(report);
      setDuplicates(report.duplicates);
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const handleBulkStart = async (
    scope: 'missing' | 'core' | 'all' | 'voice' | 'category',
    force: boolean = false
  ) => {
    setErrorMsg(null);
    try {
      await audioLibraryClient.startBulkGeneration({
        scope,
        voiceId: scope === 'voice' && voiceFilter !== 'ALL' ? voiceFilter : undefined,
        category: scope === 'category' && categoryFilter !== 'ALL' ? categoryFilter : undefined,
        force,
      });
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBulkCancel = async () => {
    try {
      await audioLibraryClient.cancelBulkGeneration();
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim()) return;
    setCreatingCustom(true);
    setErrorMsg(null);
    try {
      const created = await audioLibraryClient.createCustomAsset({
        voiceId: customVoiceId,
        category: customCategory,
        rawText: customText.trim(),
        phraseId: customPhraseId.trim() || undefined,
      });
      setCustomText('');
      setCustomPhraseId('');
      setShowAddForm(false);
      await audioLibraryClient.generateAsset(created.assetId, true);
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingCustom(false);
    }
  };

  const bulkRunning = summary?.bulkJob.status === 'running';
  const bulkProgressPct =
    summary && summary.bulkJob.totalCount > 0
      ? Math.round(
          ((summary.bulkJob.completedCount +
            summary.bulkJob.failedCount +
            summary.bulkJob.skippedCount) /
            summary.bulkJob.totalCount) *
            100
        )
      : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 font-mono text-xs select-none">
      <div className="w-full max-w-6xl max-h-[92vh] bg-[#07100b] border border-[#1d4b32] rounded-lg shadow-2xl flex flex-col overflow-hidden text-[#d1e7dd]">
        {/* Header */}
        <div className="px-4 py-2.5 bg-[#0a1710] border-b border-[#163826] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Database className="w-4 h-4 text-[#00ff66]" />
            <span className="font-bold text-sm text-[#00ff66] tracking-wide">
              PRE-GENERATED OFFLINE AUDIO LIBRARY
            </span>
            <span className="px-2 py-0.5 rounded bg-[#0e3820] text-[#00ff66] border border-[#00ff66]/40 text-[10px]">
              15 VOICES · 24 CATEGORIES · ZERO CLOUD
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#7cc99c] hover:text-[#00ff66] rounded hover:bg-[#122b1c]"
            title="Close Audio Library"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary Telemetry & Bulk Controls */}
        <div className="px-4 py-2.5 bg-[#09140e] border-b border-[#163826] grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-[#0d1f15] border border-[#1a432d] rounded px-2.5 py-1.5">
              <div className="text-[10px] text-[#558a6a]">READY / MATRIX</div>
              <div className="text-sm font-bold text-[#00ff66]">
                {summary?.readyCount ?? 0} / {summary?.totalAssets ?? 0}
              </div>
            </div>
            <div className="bg-[#0d1f15] border border-[#1a432d] rounded px-2.5 py-1.5">
              <div className="text-[10px] text-[#558a6a]">MISSING / PENDING</div>
              <div className="text-sm font-bold text-[#ffd166]">
                {summary?.missingCount ?? 0}
              </div>
            </div>
            <div className="bg-[#0d1f15] border border-[#1a432d] rounded px-2.5 py-1.5">
              <div className="text-[10px] text-[#558a6a]">DISK FOOTPRINT</div>
              <div className="text-sm font-bold text-[#00e5ff]">
                {formatBytes(summary?.totalSizeBytes ?? 0)}
              </div>
              <div className="text-[9px] text-[#558a6a]">
                {summary?.totalDurationSec ?? 0}s PCM WAV
              </div>
            </div>
            <div className="bg-[#0d1f15] border border-[#1a432d] rounded px-2.5 py-1.5">
              <div className="text-[10px] text-[#558a6a]">DUPLICATES</div>
              <button
                onClick={() => setShowDuplicatesPanel(prev => !prev)}
                className="text-sm font-bold text-[#7ae8ff] hover:underline flex items-center gap-1"
              >
                <span>{duplicates.length}</span>
                <span className="text-[9px] text-[#558a6a]">inspect</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 flex flex-wrap items-center justify-end gap-1.5">
            <button
              onClick={handleScanIntegrity}
              disabled={scanning}
              className="px-2.5 py-1.5 bg-[#0d1f15] hover:bg-[#153122] text-[#a2f5bf] border border-[#1e4d35] rounded text-[11px] flex items-center gap-1 disabled:opacity-50"
              title="Scan disk for missing or corrupt WAV files and detect duplicates"
            >
              {scanning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FolderSearch className="w-3.5 h-3.5 text-[#00e5ff]" />
              )}
              <span>Scan Missing & Dupes</span>
            </button>

            <button
              onClick={() => setShowAddForm(prev => !prev)}
              className="px-2.5 py-1.5 bg-[#0d222b] hover:bg-[#13323f] text-[#7ae8ff] border border-[#1a4859] rounded text-[11px] flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Custom Phrase</span>
            </button>

            {!bulkRunning ? (
              <>
                <button
                  onClick={() => handleBulkStart('core', false)}
                  className="px-2.5 py-1.5 bg-[#122b1c] hover:bg-[#1b3d28] text-[#00ff66] border border-[#1e4d35] rounded text-[11px] flex items-center gap-1"
                  title="Generate high-priority core ATC phrases, digits, alphabet, and templates across all 15 voices"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Bulk Core</span>
                </button>
                {voiceFilter !== 'ALL' && (
                  <button
                    onClick={() => handleBulkStart('voice', false)}
                    className="px-2.5 py-1.5 bg-[#122b1c] hover:bg-[#1b3d28] text-[#00ff66] border border-[#1e4d35] rounded text-[11px] flex items-center gap-1"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Gen Voice Missing</span>
                  </button>
                )}
                {categoryFilter !== 'ALL' && (
                  <button
                    onClick={() => handleBulkStart('category', false)}
                    className="px-2.5 py-1.5 bg-[#122b1c] hover:bg-[#1b3d28] text-[#00ff66] border border-[#1e4d35] rounded text-[11px] flex items-center gap-1"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Gen Category Missing</span>
                  </button>
                )}
                <button
                  onClick={() => handleBulkStart('missing', false)}
                  className="px-2.5 py-1.5 bg-[#0e3820] hover:bg-[#165230] text-[#00ff66] border border-[#00ff66]/40 rounded text-[11px] font-bold flex items-center gap-1"
                  title="Queue all remaining missing assets in low-priority background worker"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Bulk Generate Missing</span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2 bg-[#0b333d] border border-[#00e5ff]/40 rounded px-2.5 py-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00e5ff]" />
                <div className="text-[10px]">
                  <div className="text-[#00e5ff] font-bold">
                    BULK {summary?.bulkJob.scope.toUpperCase()} · {bulkProgressPct}%
                  </div>
                  <div className="text-[#9ad4e3]">
                    {summary?.bulkJob.completedCount}/{summary?.bulkJob.totalCount} ready
                    {summary?.bulkJob.currentAssetId ? ` · ${summary.bulkJob.currentAssetId}` : ''}
                  </div>
                </div>
                <button
                  onClick={handleBulkCancel}
                  className="px-2 py-0.5 bg-[#3b1216] hover:bg-[#52191f] text-[#ff7070] border border-[#ff4d4d]/40 rounded text-[10px] flex items-center gap-1"
                >
                  <Square className="w-2.5 h-2.5" />
                  <span>Stop</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Status / Error / Scan / Duplicates Banners */}
        {errorMsg && (
          <div className="px-4 py-1.5 bg-[#3b1216] border-b border-[#ff4d4d]/40 text-[#ff9b9b] flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {errorMsg}
            </span>
            <button onClick={() => setErrorMsg(null)} className="hover:text-white">
              Dismiss
            </button>
          </div>
        )}

        {scanReport && (
          <div className="px-4 py-1.5 bg-[#0c2419] border-b border-[#1d4b32] text-[#a2f5bf] flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00ff66]" />
              Integrity scan ({new Date(scanReport.scannedAt).toLocaleTimeString()}):{' '}
              <b>{scanReport.readyCount}</b> verified ready, <b>{scanReport.missingCount}</b> missing,{' '}
              <b>{scanReport.corruptCount}</b> corrupt, <b>{scanReport.duplicates.length}</b> duplicate groups.
            </span>
            <button onClick={() => setScanReport(null)} className="text-[#558a6a] hover:text-white">
              Hide
            </button>
          </div>
        )}

        {showDuplicatesPanel && (
          <div className="px-4 py-2 bg-[#141e18] border-b border-[#25543a] text-[11px] max-h-36 overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-[#00e5ff] flex items-center gap-1.5">
                <Copy className="w-3.5 h-3.5" />
                Duplicate Asset Analysis ({duplicates.length} groups detected)
              </span>
              <button
                onClick={() => setShowDuplicatesPanel(false)}
                className="text-[#558a6a] hover:text-white"
              >
                Close
              </button>
            </div>
            {duplicates.length === 0 ? (
              <div className="text-[#7cc99c]">
                No semantic phrase collisions or identical binary WAV duplicates detected across the manifest.
              </div>
            ) : (
              <div className="space-y-1">
                {duplicates.map(grp => (
                  <div
                    key={`${grp.type}_${grp.key}`}
                    className="bg-[#09140e] border border-[#1d4b32] rounded px-2 py-1 flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      <b className="text-[#ffd166] uppercase">[{grp.type}]</b> {grp.reason}
                    </span>
                    <span className="text-[#7ae8ff] text-[10px]">{grp.assetIds.join(', ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showAddForm && (
          <form
            onSubmit={handleCreateCustom}
            className="px-4 py-2.5 bg-[#0b1b13] border-b border-[#1d4b32] grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
          >
            <div className="sm:col-span-3">
              <label className="block text-[10px] text-[#558a6a] mb-0.5">VOICE PROFILE</label>
              <select
                value={customVoiceId}
                onChange={e => setCustomVoiceId(e.target.value)}
                className="w-full bg-[#07100b] border border-[#1e4d35] rounded px-2 py-1 text-[#d1e7dd]"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.id} ({p.voiceType})
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[10px] text-[#558a6a] mb-0.5">CATEGORY</label>
              <select
                value={customCategory}
                onChange={e => setCustomCategory(e.target.value as AudioLibraryCategory)}
                className="w-full bg-[#07100b] border border-[#1e4d35] rounded px-2 py-1 text-[#d1e7dd]"
              >
                {(Object.entries(AUDIO_LIBRARY_CATEGORY_META) as Array<
                  [AudioLibraryCategory, { label: string }]
                >).map(([catKey, meta]) => (
                  <option key={catKey} value={catKey}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] text-[#558a6a] mb-0.5">PHRASE ID (OPT)</label>
              <input
                type="text"
                value={customPhraseId}
                onChange={e => setCustomPhraseId(e.target.value)}
                placeholder="custom_clearance"
                className="w-full bg-[#07100b] border border-[#1e4d35] rounded px-2 py-1 text-[#d1e7dd]"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[10px] text-[#558a6a] mb-0.5">AVIATION PHRASE TEXT</label>
              <input
                type="text"
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                placeholder="Speedbird 452, climb FL180..."
                required
                className="w-full bg-[#07100b] border border-[#1e4d35] rounded px-2 py-1 text-[#d1e7dd]"
              />
            </div>
            <div className="sm:col-span-1">
              <button
                type="submit"
                disabled={creatingCustom}
                className="w-full px-2 py-1 bg-[#0e3820] hover:bg-[#175431] text-[#00ff66] border border-[#00ff66]/40 rounded font-bold flex items-center justify-center gap-1"
              >
                {creatingCustom ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
              </button>
            </div>
          </form>
        )}

        {/* Group Tabs & Search/Filter Toolbar */}
        <div className="px-4 py-2 bg-[#08120c] border-b border-[#163826] space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => {
                setGroupFilter('ALL');
                setCategoryFilter('ALL');
                setPageOffset(0);
              }}
              className={`px-2 py-1 rounded text-[10px] border ${
                groupFilter === 'ALL'
                  ? 'bg-[#0e3820] text-[#00ff66] border-[#00ff66]/50 font-bold'
                  : 'bg-[#0c1a12] text-[#7cc99c] border-[#1a432d]'
              }`}
            >
              All Groups
            </button>
            {(Object.entries(AUDIO_LIBRARY_GROUP_LABELS) as Array<[AudioLibraryGroup, string]>).map(
              ([grpKey, label]) => (
                <button
                  key={grpKey}
                  onClick={() => {
                    setGroupFilter(grpKey);
                    setCategoryFilter('ALL');
                    setPageOffset(0);
                  }}
                  className={`px-2 py-1 rounded text-[10px] border ${
                    groupFilter === grpKey
                      ? 'bg-[#0e3820] text-[#00ff66] border-[#00ff66]/50 font-bold'
                      : 'bg-[#0c1a12] text-[#7cc99c] border-[#1a432d]'
                  }`}
                >
                  {label}
                </button>
              )
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
            <div className="sm:col-span-4 relative">
              <Search className="w-3.5 h-3.5 text-[#558a6a] absolute left-2 top-1.5" />
              <input
                type="text"
                value={searchText}
                onChange={e => {
                  setSearchText(e.target.value);
                  setPageOffset(0);
                }}
                placeholder="Search phrase, callsign, assetId, category..."
                className="w-full bg-[#07100b] border border-[#1e4d35] rounded pl-7 pr-2 py-1 text-[11px] text-[#d1e7dd] focus:outline-none focus:border-[#00ff66]"
              />
            </div>

            <div className="sm:col-span-3">
              <select
                value={voiceFilter}
                onChange={e => {
                  setVoiceFilter(e.target.value);
                  setPageOffset(0);
                }}
                aria-label="Filter by Voice Profile"
                className="w-full bg-[#07100b] border border-[#1e4d35] rounded px-2 py-1 text-[11px] text-[#d1e7dd]"
              >
                <option value="ALL">All 15 Voice Profiles</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.id} ({p.voiceType}) ·{' '}
                    {summary?.voiceCounts[p.id]?.ready ?? 0}/{summary?.voiceCounts[p.id]?.total ?? 0}
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
                className="w-full bg-[#07100b] border border-[#1e4d35] rounded px-2 py-1 text-[11px] text-[#d1e7dd]"
              >
                <option value="ALL">All Categories ({categoriesForSelectedGroup.length})</option>
                {categoriesForSelectedGroup.map(([catKey, meta]) => (
                  <option key={catKey} value={catKey}>
                    {meta.label} ({summary?.categoryCounts[catKey]?.ready ?? 0}/
                    {summary?.categoryCounts[catKey]?.total ?? 0})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 flex items-center gap-1.5">
              <select
                value={statusFilter}
                onChange={e => {
                  setStatusFilter(e.target.value as AudioLibraryAssetStatus | 'ALL');
                  setPageOffset(0);
                }}
                aria-label="Filter by Status"
                className="flex-1 bg-[#07100b] border border-[#1e4d35] rounded px-2 py-1 text-[11px] text-[#d1e7dd]"
              >
                <option value="ALL">All Status</option>
                <option value="ready">Ready</option>
                <option value="missing">Missing</option>
                <option value="queued">Queued</option>
                <option value="generating">Generating</option>
                <option value="failed">Failed</option>
              </select>
              <button
                onClick={() => {
                  setDuplicatesOnly(prev => !prev);
                  setPageOffset(0);
                }}
                className={`px-2 py-1 rounded border text-[10px] ${
                  duplicatesOnly
                    ? 'bg-[#2c2511] text-[#ffd166] border-[#ffd166]/60'
                    : 'bg-[#07100b] text-[#7cc99c] border-[#1e4d35]'
                }`}
                title="Show only duplicate assets"
              >
                Dupes
              </button>
            </div>
          </div>
        </div>

        {/* Asset List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 bg-[#050c08]">
          {loading && items.length === 0 ? (
            <div className="py-12 flex items-center justify-center gap-2 text-[#558a6a]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading offline audio asset manifest...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-[#558a6a]">
              No audio assets match the current filter criteria.
            </div>
          ) : (
            items.map(entry => {
              const busy = Boolean(busyAssetIds[entry.assetId]);
              const catMeta = AUDIO_LIBRARY_CATEGORY_META[entry.category];
              const isDupe = duplicateAssetSet.has(entry.assetId);

              return (
                <div
                  key={entry.assetId}
                  className="bg-[#09140e] border border-[#163826] hover:border-[#255d3f] rounded px-3 py-2 flex flex-col md:flex-row md:items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-[#00e5ff] text-[11px]">{entry.voiceId}</span>
                      <span className="text-[#3b6d4e]">·</span>
                      <span className="text-[#a2f5bf] text-[11px]">{entry.phraseId}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded border text-[9px] uppercase font-bold ${getStatusBadge(
                          entry.status
                        )}`}
                      >
                        {entry.status}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-[#0c1f16] border border-[#1d4b32] text-[#7cc99c] text-[9px]">
                        {catMeta?.label || entry.category}
                      </span>
                      {entry.isCustom && (
                        <span className="px-1.5 py-0.2 rounded bg-[#172844] text-[#7cc4ff] border border-[#3a68a8]/50 text-[9px]">
                          CUSTOM
                        </span>
                      )}
                      {isDupe && (
                        <span className="px-1.5 py-0.2 rounded bg-[#2c2511] text-[#ffd166] border border-[#ffd166]/40 text-[9px]">
                          DUPLICATE
                        </span>
                      )}
                    </div>

                    <div className="text-[#e3f5ea] text-[11px] leading-snug">
                      {entry.rawText}
                      {entry.spokenText && entry.spokenText !== entry.rawText && (
                        <span className="text-[#699e7e] ml-2 text-[10px]">
                          → "{entry.spokenText}"
                        </span>
                      )}
                    </div>

                    {entry.templatePattern && (
                      <div className="text-[10px] text-[#7ae8ff]/80">
                        Template: <code>{entry.templatePattern}</code>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#558a6a] tabular-nums">
                      <span className="flex items-center gap-1">
                        <FileAudio className="w-3 h-3" />
                        {entry.filePath} ({entry.fileFormat.toUpperCase()})
                      </span>
                      <span>Model: {entry.modelVersion}</span>
                      {entry.status === 'ready' && entry.quality && (
                        <>
                          <span className="text-[#00ff66]">
                            {entry.duration.toFixed(2)}s · {formatBytes(entry.sizeBytes)}
                          </span>
                          <span>
                            {entry.quality.sampleRate}Hz / {entry.quality.bitsPerSample}-bit /{' '}
                            {entry.quality.bitrateKbps}kbps
                          </span>
                          <span>
                            RMS {entry.quality.rmsDb}dB · Peak {entry.quality.peakDb}dB · SNR{' '}
                            {entry.quality.snrEstimateDb}dB
                            {entry.quality.clippingDetected ? ' · CLIP' : ''}
                          </span>
                        </>
                      )}
                      {entry.error && <span className="text-[#ff7070]">Err: {entry.error}</span>}
                    </div>
                  </div>

                  {/* Per-asset Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handlePreview(entry, 'vhf')}
                      disabled={entry.status !== 'ready' || Boolean(previewingId)}
                      className="px-2 py-1 bg-[#0d1f15] hover:bg-[#173625] text-[#00ff66] border border-[#1e4d35] rounded text-[10px] flex items-center gap-1 disabled:opacity-40"
                      title="Preview through VHF Radio Transceiver DSP"
                    >
                      {previewingId === `${entry.assetId}_vhf` ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Radio className="w-3 h-3" />
                      )}
                      <span>VHF</span>
                    </button>

                    <button
                      onClick={() => handlePreview(entry, 'dry')}
                      disabled={entry.status !== 'ready' || Boolean(previewingId)}
                      className="px-2 py-1 bg-[#0d1f15] hover:bg-[#173625] text-[#7ae8ff] border border-[#1e4d35] rounded text-[10px] flex items-center gap-1 disabled:opacity-40"
                      title="Preview clean dry WAV PCM studio output"
                    >
                      {previewingId === `${entry.assetId}_dry` ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Volume2 className="w-3 h-3" />
                      )}
                      <span>Dry</span>
                    </button>

                    <button
                      onClick={() => handleGenerateSingle(entry)}
                      disabled={busy}
                      className="px-2 py-1 bg-[#122b1c] hover:bg-[#1b3d28] text-[#a2f5bf] border border-[#1e4d35] rounded text-[10px] flex items-center gap-1 disabled:opacity-40"
                      title={entry.status === 'ready' ? 'Regenerate WAV asset' : 'Generate WAV asset'}
                    >
                      {busy ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : entry.status === 'ready' ? (
                        <RefreshCw className="w-3 h-3" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                      <span>{entry.status === 'ready' ? 'Regen' : 'Gen'}</span>
                    </button>

                    <button
                      onClick={() => handleDeleteAsset(entry)}
                      disabled={busy || (entry.status !== 'ready' && !entry.isCustom)}
                      className="p-1 bg-[#1b1113] hover:bg-[#3b1216] text-[#ff8787] border border-[#4a1c21] rounded disabled:opacity-35"
                      title={
                        entry.isCustom
                          ? 'Delete custom phrase & WAV'
                          : 'Delete WAV file from disk (marks Missing)'
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Pagination */}
        <div className="px-4 py-2 bg-[#0a1710] border-t border-[#163826] flex items-center justify-between text-[11px] text-[#7cc99c]">
          <div>
            Showing {totalMatches === 0 ? 0 : pageOffset + 1}–
            {Math.min(totalMatches, pageOffset + items.length)} of {totalMatches} matching assets
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPageOffset(Math.max(0, pageOffset - PAGE_SIZE))}
              disabled={pageOffset === 0}
              className="px-2.5 py-1 bg-[#0d1f15] border border-[#1e4d35] rounded disabled:opacity-40 hover:bg-[#153122]"
            >
              Prev
            </button>
            <button
              onClick={() => setPageOffset(pageOffset + PAGE_SIZE)}
              disabled={pageOffset + PAGE_SIZE >= totalMatches}
              className="px-2.5 py-1 bg-[#0d1f15] border border-[#1e4d35] rounded disabled:opacity-40 hover:bg-[#153122]"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
