/**
 * SKYCONTROL - Offline Kokoro-82M Model Installer & Verifier CLI
 * Run this once on a connected workstation to cache all local ONNX model files inside
 * `local-models/Kokoro-82M-v1.0-ONNX/` so the simulator operates 100% air-gapped offline.
 *
 * Usage:
 *   npx tsx scripts/download_kokoro_model.ts           # Download any missing model files
 *   npx tsx scripts/download_kokoro_model.ts --verify  # Verify local disk files without downloading
 */

import fs from 'node:fs';
import path from 'node:path';
import { ModelManager } from '../server/modelManager';

const REQUIRED_KOKORO_MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
];

const HF_BASE_URL =
  'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main';

async function downloadFile(url: string, destPath: string): Promise<number> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} downloading ${url}`);
  }
  const arr = Buffer.from(await res.arrayBuffer());
  const tmpPath = `${destPath}.tmp`;
  fs.writeFileSync(tmpPath, arr);
  fs.renameSync(tmpPath, destPath);
  return arr.length;
}

async function main() {
  const verifyOnly = process.argv.includes('--verify');
  const modelsDir = path.resolve(process.cwd(), 'local-models');
  const manager = new ModelManager(modelsDir, 'q8');

  console.log(`[ModelInstaller] Target local directory: ${manager.modelDir}`);

  if (!verifyOnly) {
    for (const rel of REQUIRED_KOKORO_MODEL_FILES) {
      const target = path.join(manager.modelDir, rel);
      const exists = fs.existsSync(target) && fs.statSync(target).size > 0;
      if (exists) {
        console.log(`  [OK] Already cached: ${rel} (${fs.statSync(target).size} bytes)`);
        continue;
      }
      const url = `${HF_BASE_URL}/${rel}`;
      console.log(`  [DL] Downloading ${rel}...`);
      const bytes = await downloadFile(url, target);
      console.log(`  [OK] Saved ${rel} (${(bytes / (1024 * 1024)).toFixed(2)} MB)`);
    }
  }

  const inspection = manager.inspectModelFiles();
  console.log('\n[ModelInstaller] Disk Verification Report:', {
    verifiedOnDisk: inspection.verifiedOnDisk,
    totalDiskMb: (inspection.totalDiskBytes / (1024 * 1024)).toFixed(2),
    files: inspection.files,
  });

  if (!inspection.verifiedOnDisk) {
    console.error('[ModelInstaller] ERROR: One or more required Kokoro-82M model files are missing.');
    process.exit(1);
  }

  console.log('[ModelInstaller] Local Kokoro-82M ONNX model is ready for 100% offline operation.');
}

void main();
