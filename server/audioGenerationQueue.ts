/**
 * SKYCONTROL - Priority Background Audio Generation Queue & Worker Lifecycle Manager
 * Dispatches speech synthesis tasks to the isolated Node Worker Thread with:
 * - Priority ordering (critical > high > normal > low)
 * - Identical in-flight job deduplication
 * - Bounded retry + automatic worker crash recovery
 * - Zero blocking on the main event loop
 */

import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import {
  AudioGenerationJob,
  GenerationPriority,
  QueueStats,
  VoiceProfile,
} from '../shared/ttsTypes';
import { KOKORO_MODEL_ID, ModelManager } from './modelManager';

const PRIORITY_WEIGHT: Record<GenerationPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export interface WorkerSynthesisResult {
  wavBuffer: Buffer;
  sampleRate: number;
  durationSec: number;
  generationMs: number;
}

interface InternalQueuedTask {
  job: AudioGenerationJob;
  kokoroVoiceId: string;
  speed: number;
  stability: number;
  resolve: (result: WorkerSynthesisResult) => void;
  reject: (err: Error) => void;
}

export class AudioGenerationQueue {
  private readonly modelManager: ModelManager;
  private worker: Worker | null = null;
  private workerRestarts = 0;
  private loadPromise: Promise<void> | null = null;
  private pendingLoadResolvers = new Map<
    string,
    { resolve: (loadMs: number) => void; reject: (err: Error) => void }
  >();
  private pendingSynthResolvers = new Map<
    string,
    {
      task: InternalQueuedTask;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >();

  private queue: InternalQueuedTask[] = [];
  private activeTask: InternalQueuedTask | null = null;
  private inFlightByCacheKey = new Map<string, Promise<WorkerSynthesisResult>>();
  private recentJobs: AudioGenerationJob[] = [];
  private completedCount = 0;
  private failedCount = 0;

  constructor(modelManager: ModelManager) {
    this.modelManager = modelManager;
  }

  private resolveWorkerEntry(): { url: URL; execArgv: string[] } {
    const isTsRuntime = import.meta.url.endsWith('.ts');
    if (isTsRuntime) {
      const tsCandidate = new URL('./ttsWorker.ts', import.meta.url);
      if (fs.existsSync(tsCandidate)) {
        const req = createRequire(import.meta.url);
        const tsxLoader = req.resolve('tsx');
        return { url: tsCandidate, execArgv: ['--import', tsxLoader] };
      }
    }
    const jsCandidate = new URL('./ttsWorker.js', import.meta.url);
    if (fs.existsSync(jsCandidate)) {
      return { url: jsCandidate, execArgv: [] };
    }
    const nestedJsCandidate = new URL('./server/ttsWorker.js', import.meta.url);
    if (fs.existsSync(nestedJsCandidate)) {
      return { url: nestedJsCandidate, execArgv: [] };
    }
    const fallbackDist = path.resolve(process.cwd(), 'dist-server/server/ttsWorker.js');
    return { url: new URL(`file://${fallbackDist}`), execArgv: [] };
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const { url, execArgv } = this.resolveWorkerEntry();
    const worker = new Worker(url, { execArgv });

    worker.on('message', (msg: any) => {
      if (msg?.type === 'LOAD_RESULT') {
        const pending = this.pendingLoadResolvers.get(msg.requestId);
        if (pending) {
          this.pendingLoadResolvers.delete(msg.requestId);
          if (msg.ok) {
            pending.resolve(msg.loadDurationMs ?? 0);
          } else {
            pending.reject(new Error(msg.error || 'Failed to load Kokoro model'));
          }
        }
        return;
      }

      if (msg?.type === 'UNLOAD_RESULT') {
        const pending = this.pendingLoadResolvers.get(msg.requestId);
        if (pending) {
          this.pendingLoadResolvers.delete(msg.requestId);
          pending.resolve(0);
        }
        return;
      }

      if (msg?.type === 'SYNTHESIZE_RESULT') {
        const entry = this.pendingSynthResolvers.get(msg.jobId);
        if (!entry) return;
        this.pendingSynthResolvers.delete(msg.jobId);
        clearTimeout(entry.timeoutId);

        const { task } = entry;
        this.activeTask = null;

        if (msg.ok && msg.wavBytes) {
          task.job.status = 'completed';
          task.job.completedAt = new Date().toISOString();
          task.job.durationMs = msg.generationMs ?? null;
          this.completedCount += 1;
          this.recordRecentJob(task.job);

          const wavBuffer = Buffer.from(
            msg.wavBytes.buffer,
            msg.wavBytes.byteOffset,
            msg.wavBytes.byteLength
          );
          task.resolve({
            wavBuffer,
            sampleRate: msg.sampleRate || 24000,
            durationSec: msg.durationSec || 0,
            generationMs: msg.generationMs || 0,
          });
        } else {
          const errMsg = msg.error || 'Synthesis worker error';
          if (task.job.attempts < 2) {
            task.job.attempts += 1;
            task.job.status = 'queued';
            this.queue.unshift(task);
          } else {
            task.job.status = 'failed';
            task.job.completedAt = new Date().toISOString();
            task.job.error = errMsg;
            this.failedCount += 1;
            this.recordRecentJob(task.job);
            task.reject(new Error(errMsg));
          }
        }

        void this.pump();
      }
    });

    worker.on('error', err => {
      console.error('[AudioGenerationQueue] Worker crashed:', err);
      this.handleWorkerExit(err.message);
    });

    worker.on('exit', code => {
      if (this.worker === worker) {
        if (code !== 0) {
          console.warn(`[AudioGenerationQueue] Worker exited unexpectedly with code ${code}`);
        }
        this.handleWorkerExit(`Worker exited with code ${code}`);
      }
    });

    this.worker = worker;
    return worker;
  }

  private handleWorkerExit(reason: string) {
    this.worker = null;
    this.loadPromise = null;
    this.modelManager.setState('error', { error: reason });

    for (const [reqId, pending] of this.pendingLoadResolvers.entries()) {
      this.pendingLoadResolvers.delete(reqId);
      pending.reject(new Error(reason));
    }

    for (const [jobId, entry] of this.pendingSynthResolvers.entries()) {
      this.pendingSynthResolvers.delete(jobId);
      clearTimeout(entry.timeoutId);
      if (entry.task.job.attempts < 2) {
        entry.task.job.attempts += 1;
        entry.task.job.status = 'queued';
        this.queue.unshift(entry.task);
      } else {
        entry.task.job.status = 'failed';
        entry.task.job.error = reason;
        entry.task.job.completedAt = new Date().toISOString();
        this.failedCount += 1;
        this.recordRecentJob(entry.task.job);
        entry.task.reject(new Error(reason));
      }
    }

    this.activeTask = null;
    this.workerRestarts += 1;

    if (this.queue.length > 0) {
      setTimeout(() => void this.pump(), 150);
    }
  }

  public isWorkerAlive(): boolean {
    return this.worker !== null;
  }

  public getWorkerRestarts(): number {
    return this.workerRestarts;
  }

  /**
   * Loads the local Kokoro-82M ONNX model inside the background worker thread.
   */
  public async ensureModelLoaded(): Promise<void> {
    if (this.modelManager.getState() === 'ready' && this.worker) {
      return;
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    const disk = this.modelManager.inspectModelFiles();
    if (!disk.verifiedOnDisk) {
      const missing = disk.files.filter(f => !f.exists).map(f => f.relativePath).join(', ');
      const err = new Error(`Local Kokoro model files missing on disk: ${missing}`);
      this.modelManager.setState('error', { error: err.message });
      throw err;
    }

    this.modelManager.setState('loading', { error: null });
    this.loadPromise = (async () => {
      const worker = this.ensureWorker();
      const requestId = `load_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const loadMs = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingLoadResolvers.delete(requestId);
          reject(new Error('Timed out loading local Kokoro model (60s)'));
        }, 60_000);

        this.pendingLoadResolvers.set(requestId, {
          resolve: ms => {
            clearTimeout(timer);
            resolve(ms);
          },
          reject: err => {
            clearTimeout(timer);
            reject(err);
          },
        });

        worker.postMessage({
          type: 'LOAD_MODEL',
          requestId,
          modelId: KOKORO_MODEL_ID,
          modelsRootDir: this.modelManager.modelsRootDir,
          dtype: this.modelManager.dtype,
        });
      });

      this.modelManager.setState('ready', { loadDurationMs: loadMs, error: null });
    })()
      .catch(err => {
        this.modelManager.setState('error', {
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      })
      .finally(() => {
        this.loadPromise = null;
      });

    return this.loadPromise;
  }

  public async unloadModel(): Promise<void> {
    if (!this.worker) {
      this.modelManager.setState('unloaded', { error: null });
      return;
    }
    const worker = this.worker;
    const requestId = `unload_${Date.now()}`;
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        this.pendingLoadResolvers.delete(requestId);
        resolve();
      }, 2000);
      this.pendingLoadResolvers.set(requestId, {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: () => {
          clearTimeout(timer);
          resolve();
        },
      });
      worker.postMessage({ type: 'UNLOAD_MODEL', requestId });
    });
    this.modelManager.setState('unloaded', { error: null });
  }

  public async shutdown(): Promise<void> {
    for (const task of this.queue) {
      task.job.status = 'cancelled';
      task.reject(new Error('TTS engine shutting down'));
    }
    this.queue = [];
    if (this.worker) {
      const w = this.worker;
      this.worker = null;
      await w.terminate();
    }
    this.modelManager.setState('unloaded', { error: null });
  }

  /**
   * Enqueues a speech synthesis job with deduplication and priority sorting.
   */
  public enqueue(params: {
    cacheKey: string;
    rawText: string;
    normalizedText: string;
    profile: VoiceProfile;
    speed: number;
    priority?: GenerationPriority;
  }): { job: AudioGenerationJob; promise: Promise<WorkerSynthesisResult> } {
    const existingPromise = this.inFlightByCacheKey.get(params.cacheKey);
    if (existingPromise) {
      const matchingJob =
        (this.activeTask?.job.cacheKey === params.cacheKey ? this.activeTask.job : undefined) ||
        this.queue.find(t => t.job.cacheKey === params.cacheKey)?.job ||
        this.recentJobs.find(j => j.cacheKey === params.cacheKey);

      if (matchingJob) {
        return { job: { ...matchingJob }, promise: existingPromise };
      }
    }

    const priority = params.priority || 'normal';
    const job: AudioGenerationJob = {
      jobId: `tts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      cacheKey: params.cacheKey,
      text: params.rawText,
      normalizedText: params.normalizedText,
      voiceId: params.profile.id,
      voiceType: params.profile.voiceType,
      priority,
      status: 'queued',
      attempts: 1,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      durationMs: null,
      error: null,
    };

    const promise = new Promise<WorkerSynthesisResult>((resolve, reject) => {
      const task: InternalQueuedTask = {
        job,
        kokoroVoiceId: params.profile.voiceConfig.kokoroVoiceId,
        speed: params.speed,
        stability: params.profile.stability,
        resolve,
        reject,
      };

      // Insert ordered by priority descending
      const weight = PRIORITY_WEIGHT[priority];
      let insertIdx = this.queue.length;
      for (let i = 0; i < this.queue.length; i++) {
        if (PRIORITY_WEIGHT[this.queue[i].job.priority] < weight) {
          insertIdx = i;
          break;
        }
      }
      this.queue.splice(insertIdx, 0, task);
      void this.pump();
    }).finally(() => {
      this.inFlightByCacheKey.delete(params.cacheKey);
    });

    this.inFlightByCacheKey.set(params.cacheKey, promise);
    return { job: { ...job }, promise };
  }

  private async pump(): Promise<void> {
    if (this.activeTask || this.queue.length === 0) return;

    const next = this.queue.shift();
    if (!next) return;
    this.activeTask = next;

    try {
      await this.ensureModelLoaded();
      if (!this.worker) {
        throw new Error('Background TTS worker unavailable after model load');
      }

      next.job.status = 'processing';
      next.job.startedAt = new Date().toISOString();

      const timeoutId = setTimeout(() => {
        const entry = this.pendingSynthResolvers.get(next.job.jobId);
        if (!entry) return;
        this.pendingSynthResolvers.delete(next.job.jobId);
        this.activeTask = null;
        next.job.status = 'failed';
        next.job.error = 'Synthesis timed out (25s)';
        next.job.completedAt = new Date().toISOString();
        this.failedCount += 1;
        this.recordRecentJob(next.job);
        next.reject(new Error('Synthesis timed out (25s)'));
        void this.pump();
      }, 25_000);

      this.pendingSynthResolvers.set(next.job.jobId, { task: next, timeoutId });

      this.worker.postMessage({
        type: 'SYNTHESIZE',
        jobId: next.job.jobId,
        text: next.job.normalizedText,
        kokoroVoiceId: next.kokoroVoiceId,
        speed: next.speed,
        stability: next.stability,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.activeTask = null;
      next.job.status = 'failed';
      next.job.error = errMsg;
      next.job.completedAt = new Date().toISOString();
      this.failedCount += 1;
      this.recordRecentJob(next.job);
      next.reject(err instanceof Error ? err : new Error(errMsg));
      void this.pump();
    }
  }

  private recordRecentJob(job: AudioGenerationJob) {
    this.recentJobs.unshift({ ...job });
    if (this.recentJobs.length > 30) {
      this.recentJobs = this.recentJobs.slice(0, 30);
    }
  }

  public getJobById(jobId: string): AudioGenerationJob | null {
    if (this.activeTask?.job.jobId === jobId) return { ...this.activeTask.job };
    const queued = this.queue.find(t => t.job.jobId === jobId);
    if (queued) return { ...queued.job };
    const recent = this.recentJobs.find(j => j.jobId === jobId);
    return recent ? { ...recent } : null;
  }

  public getStats(): QueueStats {
    return {
      queuedCount: this.queue.length,
      processingCount: this.activeTask ? 1 : 0,
      completedCount: this.completedCount,
      failedCount: this.failedCount,
      activeJob: this.activeTask ? { ...this.activeTask.job } : null,
      recentJobs: this.recentJobs.map(j => ({ ...j })),
    };
  }
}
