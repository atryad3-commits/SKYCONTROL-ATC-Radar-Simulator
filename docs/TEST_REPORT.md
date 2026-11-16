# SKYCONTROL — Verification & Test Report

**Generated:** 2026-11-16T10:13:03Z  
**Workspace:** `/app/applet`  
**Runtime:** Node.js Full-Stack Server (`Express` + `Vite` middleware on port `3000`)

---

## 1. Build, TypeScript & Lint Verification

| Check | Command | Outcome | Notes |
| :--- | :--- | :--- | :--- |
| **Production Build** | `compile_applet` (`npm run build`) | **PASS** | Client & server TypeScript modules built with 0 errors |
| **Type Check & Lint** | `lint_applet` (`npx tsc --noEmit`) | **PASS** | Zero TypeScript errors across `src/`, `server/`, `shared/`, `scripts/`, `tests/` |

---

## 2. Offline Kokoro-82M Model Verification

Executed `npx tsx scripts/download_kokoro_model.ts --verify`:

- **Target Directory:** `/app/applet/local-models/Kokoro-82M-v1.0-ONNX`
- **Verified on Disk:** `true`
- **Total Disk Footprint:** `92,364,770` bytes (`88.09 MiB`)
- **Verified Files:**
  - `config.json` (`44` bytes)
  - `tokenizer.json` (`3,497` bytes)
  - `tokenizer_config.json` (`113` bytes)
  - `onnx/model_quantized.onnx` (`92,361,116` bytes)
- **Live Load Telemetry (`/api/tts/status`):**
  - `engine`: `kokoro-js (onnxruntime-node)`
  - `dtype`: `q8`
  - `device`: `cpu`
  - `state`: `ready`
  - `loadDurationMs`: `1,367 ms`
  - `availableVoicesCount`: `54`
  - `workerAlive`: `true`, `workerRestarts`: `0`, `offlineOnly`: `true`

---

## 3. Pre-Generated Offline Audio Library Build (`--core`)

Executed `npx tsx scripts/build_audio_library.ts --core`:

- **Total Catalog Matrix (`103` phrases × `15` voices):** `1,545` assets
- **Generated Core WAVs Ready on Disk:** `77 / 77` targeted core assets (`75` newly synthesized this run + `2` existing skipped, `0` failed)
- **Corrupt WAVs Detected:** `0`
- **Duplicate Audio Hashes Detected:** `0`
- **Core Library Footprint:** `12,508,588` bytes (`11.93 MiB`), total audio duration `260.5 s`
- **Coverage Verified:**
  - All `15` voice profiles (`3` Tower, `1` Approach, `1` Ground, `10` Pilot) have ready WAV files on disk plus dedicated `/public/voice-samples/*.wav` audition files (`4,393,860` bytes total).
  - All `24` ATC library categories have ready WAV assets on disk (all digits `0–9`, full NATO alphabet `Alpha–Zulu`, standard clearances, advisories, readbacks, emergencies, and communication templates).

---

## 4. Automated Test Suite Results (`npm test -- --run`)

Executed `vitest run --run` — **11 / 11 test files passed, 129 / 129 tests passed** (`7.58 s` total):

| Test Suite | Tests | Status | Duration |
| :--- | :---: | :---: | :---: |
| `tests/audio_studio_and_diagnostics.test.ts` | 8 | PASS | 606 ms |
| `tests/audio_library.test.ts` | 6 | PASS | 1,509 ms |
| `tests/comms_integration.test.ts` | 7 | PASS | 377 ms |
| `tests/radio_voices.test.ts` | 9 | PASS | 111 ms |
| `tests/vhf_radio_dsp.test.ts` | 6 | PASS | 94 ms |
| `tests/radar_tracking_and_ui.test.ts` | 13 | PASS | 87 ms |
| `tests/phase5_integration_audit.test.ts` | 18 | PASS | 80 ms |
| `tests/local_tts_engine.test.ts` | 6 | PASS | 69 ms |
| `tests/physics_and_conflict.test.ts` | 22 | PASS | 55 ms |
| `tests/ils_and_takeoff.test.ts` | 21 | PASS | 43 ms |
| `tests/multi_airport_and_missions.test.ts` | 13 | PASS | 25 ms |
| **Total** | **129** | **100% PASS** | **7.58 s** |

### Highlights Covered in `tests/audio_studio_and_diagnostics.test.ts`
- **Database Schema Migrations & Persistence:** Verified `LocalAudioDatabase` applies migrations `001_init_voice_profiles`, `002_upgrade_audio_library_manifest`, and `003_init_global_audio_settings` idempotently (`schemaVersion === 3`), safely upgrades legacy v1 manifests without dropping entries, and persists settings across simulated restarts.
- **Asset Cleanup & Background Gen Gate:** Verified `cleanupUnusedAssets()` deletes orphaned WAV files while preserving manifest-tracked assets, and verified `backgroundGenerationEnabled = false` prevents background pre-generation queue enqueues.
- **Error Recovery & Telemetry:** Verified empty/missing-model synthesis errors increment error counters and preserve engine stability without crashing, and verified real OS CPU/RAM/GPU telemetry collection via `collectHardwareTelemetry()`.
- **Voice Overrides & Long-Running Sim Stability:** Verified per-aircraft pilot voice override (`setPilotAssignmentOverride`) and station controller reassignment (`setStationDefaultProfile`), plus `1,200` ticks of continuous multi-aircraft simulation without flight-physics drift or registry leaks.

---

## 5. Live Server & HTTP API Endpoint Verification (`http://localhost:3000`)

Verified after clean server restart (`restart_dev_server`):

| Endpoint | HTTP Status | Content-Type | Observed Size / Key Verification |
| :--- | :---: | :--- | :--- |
| `GET /` | `200` | `text/html` | `1,005 B` — Application shell served |
| `GET /api/tts/status` | `200` | `application/json` | `1,011 B` — `offlineOnly: true`, `workerAlive: true`, `model.state: "ready"`, `15/15` voices |
| `GET /api/tts/voices` | `200` | `application/json` | `11,179 B` — `15` profiles returned with `sampleAvailable: true` |
| `GET /api/library/summary` | `200` | `application/json` | `2,547 B` — `totalAssets: 1545`, `readyCount: 77`, `corrupt: 0`, `duplicates: 0` |
| `GET /api/audio/settings` | `200` | `application/json` | `358 B` — `audioEnabled: true`, `defaultRadioPreset: "normal_aviation"`, `maxCacheSizeMb: 250` |
| `GET /api/audio/diagnostics` | `200` | `application/json` | `984 B` — `totalStorageBytes: 109,267,218`, real host telemetry (`cpuCores: 2`, `executionProvider: "cpu"`) |
| `GET /api/audio/migrations` | `200` | `application/json` | `666 B` — `schemaVersion: 3` (`001`, `002`, `003` applied) |
| `GET /audio-library/tower_charon/atc_takeoff_cleared.wav` | `200` | `audio/wav` | `314,444 B` — PCM-16 WAV served statically |
| `GET /voice-samples/tower_charon.wav` | `200` | `audio/wav` | `414,044 B` — Pre-generated sample WAV served statically |
