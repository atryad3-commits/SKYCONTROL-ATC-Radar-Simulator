/**
 * Pre-generates genuine Kokoro-82M 24kHz PCM-16 WAV sample audio files
 * for all 15 distinct voice profiles into public/voice-samples/<id>.wav.
 * Runs 100% offline against local-models/Kokoro-82M-v1.0-ONNX/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { localTtsService } from '../server/localTtsService';

async function main() {
  const profiles = localTtsService.profileManager.listProfiles();
  console.log(`Pre-generating Kokoro-82M WAV samples for ${profiles.length} distinct voice profiles...`);

  await localTtsService.queue.ensureModelLoaded();

  for (const profile of profiles) {
    const outPath = path.join(localTtsService.samplesDir, `${profile.id}.wav`);
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 2000) {
      console.log(`  [SKIP] ${profile.id} (${profile.voiceConfig.kokoroVoiceId}) already exists`);
      continue;
    }
    const t0 = performance.now();
    const { wavBuffer } = await localTtsService.ensureProfileSample(profile.id, true);
    const ms = Math.round(performance.now() - t0);
    console.log(
      `  [OK] ${profile.id} (${profile.voiceConfig.kokoroVoiceId}) -> ${(wavBuffer.length / 1024).toFixed(1)} KB (${ms}ms)`
    );
  }

  await localTtsService.queue.shutdown();
  console.log('Done! All 15 voice profile WAV samples ready offline.');
}

main().catch(err => {
  console.error('Failed generating samples:', err);
  process.exit(1);
});
