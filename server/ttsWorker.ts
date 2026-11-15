/**
 * SKYCONTROL - Dedicated Background ONNX Inference Worker (node:worker_threads)
 * Executes Kokoro-82M neural synthesis strictly offline using local-models/
 * completely off the main event loop so radar updates and HTTP routes never stall.
 */

import { parentPort, isMainThread } from 'node:worker_threads';
import { env } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';
import { encodeWavPcm16 } from './wavEncoder';

type WorkerInboundMessage =
  | {
      type: 'LOAD_MODEL';
      requestId: string;
      modelId: string;
      modelsRootDir: string;
      dtype: 'q8' | 'fp32' | 'fp16' | 'q4';
    }
  | {
      type: 'SYNTHESIZE';
      jobId: string;
      text: string;
      kokoroVoiceId: string;
      speed: number;
      stability: number;
    }
  | {
      type: 'UNLOAD_MODEL';
      requestId: string;
    };

let ttsInstance: KokoroTTS | null = null;
let loadedKey: string | null = null;
let loadingPromise: Promise<KokoroTTS> | null = null;

function configureOfflineTransformers(modelsRootDir: string) {
  const normalizedRoot = modelsRootDir.endsWith('/') ? modelsRootDir : `${modelsRootDir}/`;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = normalizedRoot;
  env.useBrowserCache = false;
}

async function ensureModelLoaded(
  modelId: string,
  modelsRootDir: string,
  dtype: 'q8' | 'fp32' | 'fp16' | 'q4'
): Promise<{ instance: KokoroTTS; loadDurationMs: number }> {
  const key = `${modelsRootDir}::${modelId}::${dtype}`;
  if (ttsInstance && loadedKey === key) {
    return { instance: ttsInstance, loadDurationMs: 0 };
  }
  if (loadingPromise) {
    const start = performance.now();
    const instance = await loadingPromise;
    return { instance, loadDurationMs: Math.round(performance.now() - start) };
  }

  configureOfflineTransformers(modelsRootDir);
  const start = performance.now();
  loadingPromise = KokoroTTS.from_pretrained(modelId, {
    dtype,
    device: 'cpu',
  });

  try {
    ttsInstance = await loadingPromise;
    loadedKey = key;
    return { instance: ttsInstance, loadDurationMs: Math.round(performance.now() - start) };
  } finally {
    loadingPromise = null;
  }
}

if (!isMainThread && parentPort) {
  const port = parentPort;

  port.on('message', async (msg: WorkerInboundMessage) => {
    if (msg.type === 'LOAD_MODEL') {
      try {
        const { loadDurationMs } = await ensureModelLoaded(
          msg.modelId,
          msg.modelsRootDir,
          msg.dtype
        );
        port.postMessage({
          type: 'LOAD_RESULT',
          requestId: msg.requestId,
          ok: true,
          loadDurationMs,
        });
      } catch (err) {
        ttsInstance = null;
        loadedKey = null;
        port.postMessage({
          type: 'LOAD_RESULT',
          requestId: msg.requestId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (msg.type === 'UNLOAD_MODEL') {
      ttsInstance = null;
      loadedKey = null;
      port.postMessage({
        type: 'UNLOAD_RESULT',
        requestId: msg.requestId,
        ok: true,
      });
      return;
    }

    if (msg.type === 'SYNTHESIZE') {
      const start = performance.now();
      try {
        if (!ttsInstance) {
          throw new Error('Kokoro model not loaded in background worker');
        }
        const rawAudio = await ttsInstance.generate(msg.text, {
          voice: msg.kokoroVoiceId as Parameters<KokoroTTS['generate']>[1] extends infer O
            ? O extends { voice?: infer V }
              ? V
              : never
            : never,
          speed: msg.speed,
        });

        const wavBuffer = encodeWavPcm16(rawAudio.audio, rawAudio.sampling_rate);
        const wavBytes = new Uint8Array(
          wavBuffer.buffer,
          wavBuffer.byteOffset,
          wavBuffer.byteLength
        ).slice();

        const generationMs = Math.round(performance.now() - start);
        const durationSec = Number((rawAudio.audio.length / rawAudio.sampling_rate).toFixed(3));

        port.postMessage(
          {
            type: 'SYNTHESIZE_RESULT',
            jobId: msg.jobId,
            ok: true,
            wavBytes,
            sampleRate: rawAudio.sampling_rate,
            durationSec,
            generationMs,
          },
          [wavBytes.buffer]
        );
      } catch (err) {
        port.postMessage({
          type: 'SYNTHESIZE_RESULT',
          jobId: msg.jobId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          generationMs: Math.round(performance.now() - start),
        });
      }
    }
  });
}
