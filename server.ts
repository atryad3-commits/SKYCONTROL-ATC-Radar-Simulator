/**
 * SKYCONTROL - Unified Full-Stack Local ATC Server (Express + Vite + Offline Kokoro TTS)
 * Runs on port 3000 with zero cloud APIs or runtime internet requirements.
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { localTtsService } from './server/localTtsService';
import { LocalAccountManager } from './server/localAccountManager';
import { VoiceProfileUpdatePatch } from './shared/ttsTypes';
import {
  AudioLibraryAssetStatus,
  AudioLibraryCategory,
  AudioLibraryGroup,
} from './shared/audioLibraryTypes';
import { VoiceType } from './shared/ttsTypes';

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const localAccountManager = new LocalAccountManager();

  // Serve pre-generated voice profile WAV samples & pre-generated Audio Library statically
  app.use('/voice-samples', express.static(localTtsService.samplesDir));
  app.use('/audio-library', express.static(localTtsService.libraryManager.libraryDir));

  // =========================================================================
  // Local Offline TTS REST API (/api/tts/*)
  // =========================================================================

  app.get('/api/tts/status', (_req, res) => {
    res.json(localTtsService.getStatus());
  });

  app.get('/api/tts/voices', (_req, res) => {
    const profiles = localTtsService.profileManager.listProfiles().map(p => ({
      ...p,
      sampleAvailable: fs.existsSync(path.join(localTtsService.samplesDir, `${p.id}.wav`)),
    }));
    res.json({
      profiles,
      availableSpeakers: localTtsService.profileManager.getAvailableKokoroVoices(),
      maxProfiles: 15,
    });
  });

  app.patch('/api/tts/voices/:id', (req, res) => {
    try {
      const updated = localTtsService.updateVoiceProfile(
        req.params.id,
        req.body as VoiceProfileUpdatePatch
      );
      res.json({ profile: updated });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/tts/voices', (req, res) => {
    try {
      const created = localTtsService.profileManager.createProfile(req.body);
      res.status(201).json({ profile: created });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.delete('/api/tts/voices/:id', (req, res) => {
    try {
      localTtsService.profileManager.deleteProfile(req.params.id);
      res.json({ deleted: true });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/tts/voices/reset', (_req, res) => {
    const profiles = localTtsService.profileManager.resetToDefaults();
    res.json({ profiles });
  });

  app.post('/api/tts/voices/:id/sample', async (req, res) => {
    try {
      const force = Boolean(req.body?.force);
      const { wavBuffer, profile } = await localTtsService.ensureProfileSample(
        req.params.id,
        force
      );
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('X-Voice-Id', profile.id);
      res.setHeader('X-Kokoro-Voice', profile.voiceConfig.kokoroVoiceId);
      res.send(wavBuffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get('/api/tts/models', (_req, res) => {
    res.json({ model: localTtsService.modelManager.getModelInfo() });
  });

  app.post('/api/tts/models/load', async (_req, res) => {
    try {
      await localTtsService.queue.ensureModelLoaded();
      res.json({ model: localTtsService.modelManager.getModelInfo() });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
        model: localTtsService.modelManager.getModelInfo(),
      });
    }
  });

  app.post('/api/tts/models/unload', async (_req, res) => {
    try {
      await localTtsService.queue.unloadModel();
      res.json({ model: localTtsService.modelManager.getModelInfo() });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/tts/synthesize', async (req, res) => {
    try {
      const result = await localTtsService.synthesizeSpeech(req.body);
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('X-TTS-Cache-Hit', result.cacheHit ? '1' : '0');
      res.setHeader('X-TTS-Cache-Key', result.metadata.cacheKey);
      res.setHeader('X-TTS-Voice-Id', result.profile.id);
      res.setHeader('X-TTS-Kokoro-Speaker', result.profile.voiceConfig.kokoroVoiceId);
      res.setHeader('X-TTS-Duration-Sec', String(result.metadata.durationSec));
      res.setHeader('X-TTS-Generation-Ms', String(result.metadata.generationMs));
      res.setHeader('X-TTS-Sample-Rate', String(result.metadata.sampleRate));
      res.send(result.wavBuffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/tts/queue', (req, res) => {
    try {
      const queued = localTtsService.enqueueBackgroundJob(req.body);
      res.status(202).json(queued);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get('/api/tts/queue/:jobId', (req, res) => {
    const job = localTtsService.queue.getJobById(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({ job });
  });

  app.get('/api/tts/cache', (req, res) => {
    const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 50));
    res.json({
      stats: localTtsService.cacheManager.getStats(),
      entries: localTtsService.cacheManager.listMetadata(limit),
    });
  });

  app.get('/api/tts/cache/:cacheKey/audio', (req, res) => {
    const hit = localTtsService.cacheManager.get(req.params.cacheKey);
    if (!hit) {
      res.status(404).json({ error: 'Cached audio not found' });
      return;
    }
    res.setHeader('Content-Type', 'audio/wav');
    res.send(hit.wavBuffer);
  });

  app.delete('/api/tts/cache', (_req, res) => {
    const cleared = localTtsService.cacheManager.clear();
    res.json({ cleared });
  });

  // =========================================================================
  // Pre-Generated Offline Audio Library REST API (/api/library/*)
  // =========================================================================

  app.get('/api/library/summary', (_req, res) => {
    res.json(localTtsService.libraryManager.getSummary());
  });

  app.get('/api/library/assets', (req, res) => {
    const result = localTtsService.libraryManager.searchAssets({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      voiceId: typeof req.query.voiceId === 'string' ? req.query.voiceId : 'ALL',
      voiceType:
        typeof req.query.voiceType === 'string'
          ? (req.query.voiceType as VoiceType | 'ALL')
          : 'ALL',
      group:
        typeof req.query.group === 'string'
          ? (req.query.group as AudioLibraryGroup | 'ALL')
          : 'ALL',
      category:
        typeof req.query.category === 'string'
          ? (req.query.category as AudioLibraryCategory | 'ALL')
          : 'ALL',
      status:
        typeof req.query.status === 'string'
          ? (req.query.status as AudioLibraryAssetStatus | 'ALL')
          : 'ALL',
      duplicatesOnly: req.query.duplicatesOnly === '1' || req.query.duplicatesOnly === 'true',
      limit: Number(req.query.limit) || 120,
      offset: Number(req.query.offset) || 0,
    });
    res.json(result);
  });

  app.post('/api/library/assets', (req, res) => {
    try {
      const entry = localTtsService.libraryManager.createCustomAsset(req.body);
      res.status(201).json({ entry });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get('/api/library/assets/:assetId/audio', (req, res) => {
    const buf = localTtsService.libraryManager.getAssetAudioBuffer(req.params.assetId);
    if (!buf) {
      res.status(404).json({ error: 'Audio file not generated or missing on disk' });
      return;
    }
    res.setHeader('Content-Type', 'audio/wav');
    res.send(buf);
  });

  app.post('/api/library/assets/:assetId/generate', async (req, res) => {
    try {
      const force = req.body?.force !== undefined ? Boolean(req.body.force) : true;
      const entry = await localTtsService.libraryManager.generateAsset(
        req.params.assetId,
        force,
        'high'
      );
      res.json({ entry });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.delete('/api/library/assets/:assetId', (req, res) => {
    try {
      const removeEntry = req.query.purge === '1' || Boolean(req.body?.purge);
      const outcome = localTtsService.libraryManager.deleteAsset(req.params.assetId, removeEntry);
      res.json(outcome);
    } catch (err) {
      res.status(404).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/library/scan', (_req, res) => {
    const report = localTtsService.libraryManager.scanIntegrity();
    res.json(report);
  });

  app.get('/api/library/bulk', (_req, res) => {
    res.json({ bulkJob: localTtsService.libraryManager.getBulkJobState() });
  });

  app.post('/api/library/bulk', (req, res) => {
    try {
      const bulkJob = localTtsService.libraryManager.startBulkGeneration({
        scope: req.body?.scope || 'missing',
        voiceId: req.body?.voiceId,
        category: req.body?.category,
        force: Boolean(req.body?.force),
      });
      res.status(202).json({ bulkJob });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/library/bulk/cancel', (_req, res) => {
    const bulkJob = localTtsService.libraryManager.cancelBulkGeneration();
    res.json({ bulkJob });
  });

  app.post('/api/library/cleanup-unused', (_req, res) => {
    try {
      const cleanup = localTtsService.libraryManager.cleanupUnusedAssets();
      res.json(cleanup);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/tts/worker/recover', async (_req, res) => {
    try {
      const status = await localTtsService.recoverWorker();
      res.json({ status });
    } catch (err) {
      localTtsService.recordError('worker', err instanceof Error ? err.message : String(err));
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
        status: localTtsService.getStatus(),
      });
    }
  });

  // =========================================================================
  // Audio Studio Global Settings, Diagnostics & Migrations (/api/audio/*)
  // =========================================================================

  app.get('/api/audio/settings', (_req, res) => {
    res.json({ settings: localTtsService.getAudioSettings() });
  });

  app.put('/api/audio/settings', (req, res) => {
    try {
      const settings = localTtsService.updateAudioSettings(req.body || {});
      res.json({ settings });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get('/api/audio/diagnostics', async (_req, res) => {
    try {
      const diagnostics = await localTtsService.getDiagnosticsReport();
      res.json(diagnostics);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/audio/diagnostics/reset', (_req, res) => {
    localTtsService.resetDiagnostics();
    res.json({ reset: true });
  });

  app.get('/api/audio/migrations', (_req, res) => {
    res.json(localTtsService.getDatabaseState());
  });

  // =========================================================================
  // Offline Local Controller Auth & Isolated Storage (/api/local-auth/*)
  // =========================================================================

  const extractSessionToken = (req: express.Request): string | null => {
    const header = req.header('x-local-session');
    if (header) return header.trim();
    const authHdr = req.header('authorization');
    if (authHdr && authHdr.toLowerCase().startsWith('bearer ')) {
      return authHdr.slice(7).trim();
    }
    return null;
  };

  app.post('/api/local-auth/register', (req, res) => {
    try {
      const { identifier, password, callsign } = req.body || {};
      const out = localAccountManager.registerAccount({
        identifier: String(identifier || ''),
        password: String(password || ''),
        callsign: String(callsign || ''),
      });
      res.status(201).json(out);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Offline registration failed.';
      const status = message.includes('already exists') ? 409 : 400;
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/local-auth/login', (req, res) => {
    try {
      const { identifier, password } = req.body || {};
      const out = localAccountManager.loginAccount({
        identifier: String(identifier || ''),
        password: String(password || ''),
      });
      res.json(out);
    } catch (err) {
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Offline sign-in failed.',
      });
    }
  });

  app.post('/api/local-auth/logout', (req, res) => {
    localAccountManager.logoutSession(extractSessionToken(req));
    res.json({ ok: true });
  });

  app.get('/api/local-auth/session', (req, res) => {
    const bundle = localAccountManager.getSessionBundle(extractSessionToken(req));
    if (!bundle) {
      res.status(401).json({ error: 'Offline session expired or not signed in.' });
      return;
    }
    res.json(bundle);
  });

  app.patch('/api/local-auth/profile/callsign', (req, res) => {
    const uid = localAccountManager.resolveSessionUid(extractSessionToken(req));
    if (!uid) {
      res.status(401).json({ error: 'Offline session required.' });
      return;
    }
    try {
      const profile = localAccountManager.updateCallsign(uid, String(req.body?.callsign || ''));
      res.json({ profile });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update callsign.' });
    }
  });

  app.get('/api/local-auth/preferences', (req, res) => {
    const uid = localAccountManager.resolveSessionUid(extractSessionToken(req));
    if (!uid) {
      res.status(401).json({ error: 'Offline session required.' });
      return;
    }
    res.json({ preferences: localAccountManager.getPreferences(uid) });
  });

  app.put('/api/local-auth/preferences', (req, res) => {
    const uid = localAccountManager.resolveSessionUid(extractSessionToken(req));
    if (!uid) {
      res.status(401).json({ error: 'Offline session required.' });
      return;
    }
    try {
      const preferences = localAccountManager.savePreferences(uid, req.body);
      res.json({ preferences });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save preferences.' });
    }
  });

  app.get('/api/local-auth/activities', (req, res) => {
    const uid = localAccountManager.resolveSessionUid(extractSessionToken(req));
    if (!uid) {
      res.status(401).json({ error: 'Offline session required.' });
      return;
    }
    const maxItems = Number(req.query.limit) || 50;
    res.json({ activities: localAccountManager.listActivities(uid, maxItems) });
  });

  app.post('/api/local-auth/activities', (req, res) => {
    const uid = localAccountManager.resolveSessionUid(extractSessionToken(req));
    if (!uid) {
      res.status(401).json({ error: 'Offline session required.' });
      return;
    }
    try {
      const result = localAccountManager.recordActivityAndStats(uid, req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to record activity.' });
    }
  });

  app.delete('/api/local-auth/activities/:id', (req, res) => {
    const uid = localAccountManager.resolveSessionUid(extractSessionToken(req));
    if (!uid) {
      res.status(401).json({ error: 'Offline session required.' });
      return;
    }
    localAccountManager.deleteActivity(uid, req.params.id);
    res.json({ deleted: true });
  });

  app.get('/api/local-auth/scenarios', (req, res) => {
    const uid = localAccountManager.resolveSessionUid(extractSessionToken(req));
    if (!uid) {
      res.status(401).json({ error: 'Offline session required.' });
      return;
    }
    res.json({ scenarios: localAccountManager.listScenarios(uid) });
  });

  app.post('/api/local-auth/scenarios', (req, res) => {
    const uid = localAccountManager.resolveSessionUid(extractSessionToken(req));
    if (!uid) {
      res.status(401).json({ error: 'Offline session required.' });
      return;
    }
    try {
      const scenario = localAccountManager.saveScenario(uid, req.body, false);
      res.status(201).json({ scenario });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save scenario.' });
    }
  });

  app.put('/api/local-auth/scenarios/:id', (req, res) => {
    const uid = localAccountManager.resolveSessionUid(extractSessionToken(req));
    if (!uid) {
      res.status(401).json({ error: 'Offline session required.' });
      return;
    }
    try {
      const scenario = localAccountManager.saveScenario(
        uid,
        { ...req.body, id: req.params.id },
        true
      );
      res.json({ scenario });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update scenario.' });
    }
  });

  app.delete('/api/local-auth/scenarios/:id', (req, res) => {
    const uid = localAccountManager.resolveSessionUid(extractSessionToken(req));
    if (!uid) {
      res.status(401).json({ error: 'Offline session required.' });
      return;
    }
    localAccountManager.deleteScenario(uid, req.params.id);
    res.json({ deleted: true });
  });

  // =========================================================================
  // Frontend Mounting (Vite dev middleware in development, dist/ in prod)
  // =========================================================================
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SKYCONTROL] Server listening on http://0.0.0.0:${PORT}`);
    // Non-blocking background model warmup
    localTtsService.warmupInBackground();
  });

  const gracefulShutdown = async () => {
    await localTtsService.queue.shutdown();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => void gracefulShutdown());
  process.on('SIGTERM', () => void gracefulShutdown());
}

void startServer();
