/**
 * SKYCONTROL - Unified Full-Stack Local ATC Server (Express + Vite + Offline Kokoro TTS)
 * Runs on port 3000 with zero cloud APIs or runtime internet requirements.
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { localTtsService } from './server/localTtsService';
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
