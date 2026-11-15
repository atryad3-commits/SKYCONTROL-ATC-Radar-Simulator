/**
 * SKYCONTROL - Local TTS Model Manager
 * Verifies local ONNX model storage on disk, manages Kokoro-82M metadata & lifecycle state,
 * enforces offline-only execution (zero remote downloads at runtime), and tracks errors.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  LocalModelFileStatus,
  LocalModelInfo,
  ModelLifecycleState,
} from '../shared/ttsTypes';

export const KOKORO_MODEL_ID = 'Kokoro-82M-v1.0-ONNX';

const REQUIRED_MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
];

export class ModelManager {
  public readonly modelsRootDir: string;
  public readonly modelDir: string;
  public readonly dtype: 'q8' | 'fp32' | 'fp16' | 'q4';
  private state: ModelLifecycleState = 'unloaded';
  private loadDurationMs: number | null = null;
  private lastError: string | null = null;

  constructor(
    modelsRootDir: string = path.resolve(process.cwd(), 'local-models'),
    dtype: 'q8' | 'fp32' | 'fp16' | 'q4' = 'q8'
  ) {
    this.modelsRootDir = modelsRootDir;
    this.modelDir = path.join(modelsRootDir, KOKORO_MODEL_ID);
    this.dtype = dtype;
  }

  public setState(state: ModelLifecycleState, opts?: { loadDurationMs?: number; error?: string | null }) {
    this.state = state;
    if (opts?.loadDurationMs !== undefined) {
      this.loadDurationMs = opts.loadDurationMs;
    }
    if (opts?.error !== undefined) {
      this.lastError = opts.error;
    } else if (state === 'ready') {
      this.lastError = null;
    }
  }

  public getState(): ModelLifecycleState {
    return this.state;
  }

  public inspectModelFiles(): {
    verifiedOnDisk: boolean;
    totalDiskBytes: number;
    files: LocalModelFileStatus[];
  } {
    const files: LocalModelFileStatus[] = REQUIRED_MODEL_FILES.map(rel => {
      const full = path.join(this.modelDir, rel);
      try {
        const st = fs.statSync(full);
        return {
          relativePath: rel,
          exists: st.isFile() && st.size > 0,
          sizeBytes: st.size,
        };
      } catch {
        return {
          relativePath: rel,
          exists: false,
          sizeBytes: 0,
        };
      }
    });

    const verifiedOnDisk = files.every(f => f.exists);
    const totalDiskBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);

    return { verifiedOnDisk, totalDiskBytes, files };
  }

  public countLocalVoiceEmbeddings(): number {
    try {
      const voicesDir = path.resolve(process.cwd(), 'node_modules/kokoro-js/voices');
      if (!fs.existsSync(voicesDir)) return 0;
      return fs.readdirSync(voicesDir).filter(f => f.endsWith('.bin')).length;
    } catch {
      return 0;
    }
  }

  public getModelInfo(): LocalModelInfo {
    const disk = this.inspectModelFiles();
    return {
      modelId: KOKORO_MODEL_ID,
      displayName: 'Kokoro-82M v1.0 Neural TTS (INT8 Quantized ONNX)',
      license: 'Apache-2.0',
      engine: 'kokoro-js (onnxruntime-node)',
      dtype: this.dtype,
      device: 'cpu',
      localDirectory: this.modelDir,
      sampleRate: 24000,
      state: this.state,
      verifiedOnDisk: disk.verifiedOnDisk,
      totalDiskBytes: disk.totalDiskBytes,
      availableVoicesCount: this.countLocalVoiceEmbeddings(),
      loadDurationMs: this.loadDurationMs,
      lastError: this.lastError,
      files: disk.files,
    };
  }
}
