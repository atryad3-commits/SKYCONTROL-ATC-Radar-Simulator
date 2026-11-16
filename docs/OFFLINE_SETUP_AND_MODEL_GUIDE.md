# Offline Setup, Model Installation & Audio Generation Guide

This document details how to deploy SKYCONTROL on a completely offline / air-gapped workstation with zero external internet access during runtime.

---

## 1. Local Artifacts Layout

To operate offline, the project relies exclusively on local workspace directories:

```text
local-models/
  Kokoro-82M-v1.0-ONNX/
    config.json
    tokenizer.json
    tokenizer_config.json
    onnx/
      model_quantized.onnx        (~88–89 MB INT8 q8 quantized ONNX weights)

local-data/
  audio-studio-db.json            (Versioned DB migration tracker, currently v3)
  audio-settings.json             (Global Audio Studio settings persisted across restarts)
  voice-profiles.json             (Up to 15 configured pilot & ATC speaker profiles)
  audio-library-manifest.json     (Pre-generated WAV asset metadata & SHA-256 hashes)
  tts-cache/                      (Dynamic synthesized WAV disk cache + metadata index)

public/
  voice-samples/*.wav             (15 pre-generated audition samples)
  audio-library/<voiceId>/*.wav   (Pre-generated 24kHz PCM-16 WAV phrase assets)
  voice-pack/*                    (Offline bundled sprite pack fallback)
```

---

## 2. Offline / Air-Gapped Transfer Procedure

1. On a connected staging machine:
   - Run `npm install`
   - Run `npx tsx scripts/download_kokoro_model.ts`
   - Run `npx tsx scripts/generate_samples.ts`
   - Run `npx tsx scripts/build_audio_library.ts --core`
   - *(Optional)* Run `npm run build`
2. Package the repository including `node_modules/`, `local-models/`, `local-data/`, `public/voice-samples/`, and `public/audio-library/`.
3. Copy to the offline target host and run `npm run dev` (or `npm start` for the production bundle).
4. In `Audio Studio -> Global Settings`, confirm `Enable Simulator Radio Audio` and `Enable Local Kokoro Neural TTS` are active. Verify in `Audio Studio -> TTS Engine` that **Verified: YES** is shown.

---

## 3. Model Installation Details

- **Model**: `onnx-community/Kokoro-82M-v1.0-ONNX` (`q8` INT8 quantized ONNX)
- **License**: Apache-2.0
- **Runtime**: `kokoro-js` running over `onnxruntime-node` inside a dedicated background `node:worker_threads` thread (`server/ttsWorker.ts`), configured with `env.allowRemoteModels = false` so no network fetches occur at runtime.
- **Speaker Count**: Supports all 28 English Kokoro speakers natively, mapped to 15 configurable profiles (`10 Pilot`, `3 Tower`, `1 Approach`, `1 Ground`).

To verify model files offline without attempting network downloads:

```bash
npx tsx scripts/download_kokoro_model.ts --verify
```

---

## 4. Pre-Generated Audio Library Commands

| Command | Purpose |
| --- | --- |
| `npx tsx scripts/generate_samples.ts` | Generates all 15 WAV audition clips in `public/voice-samples/` |
| `npx tsx scripts/build_audio_library.ts --core` | Generates the 77 core WAVs spanning all 24 categories and all 15 voices |
| `npx tsx scripts/build_audio_library.ts --all` | Generates the entire catalog × 15 voice matrix |
| `npx tsx scripts/build_audio_library.ts --scan` | Audits disk files against `audio-library-manifest.json` for missing/corrupt/duplicate WAVs |

Inside the web UI, you can also open **Audio Studio → Audio Library** to search phrases, generate individual assets, add custom phrases, run **Bulk Core / Bulk Missing**, preview Clean (`Dry`) vs `VHF` DSP output, and run **Delete Unused Assets**.

---

## 5. Database Schema Migrations & Recovery

Schema migrations execute automatically at boot via `server/localDatabase.ts`:

- `v1` (`001_init_voice_profiles`): Seeds and enforces the 15-profile ceiling in `local-data/voice-profiles.json`.
- `v2` (`002_upgrade_audio_library_manifest`): Upgrades `audio-library-manifest.json` to schema v2 without overwriting existing generated WAV entries.
- `v3` (`003_init_global_audio_settings`): Initializes `local-data/audio-settings.json` with default voices, radio quality preset, cache ceiling, and background queue controls.

If local model inference encounters a worker fault, click **Recover** in **Audio Studio → TTS Engine** (`POST /api/tts/worker/recover`) to recycle the worker thread and reload local ONNX weights cleanly without interrupting the radar simulation.
