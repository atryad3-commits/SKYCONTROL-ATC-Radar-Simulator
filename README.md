# SKYCONTROL — Offline ATC Radar Simulator & Local Speech Studio

SKYCONTROL is a real-time Air Traffic Control (ATC) radar simulator built with React, TypeScript, Zustand, Web Audio DSP, and an integrated 100% offline **Kokoro-82M ONNX** neural speech engine managed through Express + Node Worker Threads.

All radar physics, ILS approaches, runway occupancy, aviation phraseology, pre-generated audio assets, and dynamic neural speech synthesis run locally with **zero runtime internet dependency or cloud speech APIs**.

---

## Key Audio & Simulator Features

- **Integrated Audio Studio (`AudioStudioModal`)** accessible directly from the Top Bar (`Audio Studio`) and VHF Comms deck (`Voices · 15`, `Library`, `VHF`, `Diagnostics`):
  1. **Voice Profiles**: Manage up to 15 neural voice profiles (10 pilots, 3 tower controllers, 1 approach director, 1 ground controller), tune speed/pitch/stability, swap Kokoro speaker embeddings, audition/regenerate WAV samples, reassign station controllers, and override active aircraft pilot voices.
  2. **Audio Library**: Searchable matrix across 15 voice profiles and 24 aviation phrase categories (ATC clearances, aviation numbers, NATO alphabet Alpha–Zulu, and common templates), with single/bulk WAV generation, missing & duplicate scanning, custom phrase creation, VHF/Dry preview, and unused file cleanup.
  3. **TTS Engine**: Local Kokoro-82M (`q8` INT8 ONNX) lifecycle control (Load / Unload / Worker Recover), disk file verification, hardware CPU/RAM/GPU telemetry, and non-blocking priority queue monitoring.
  4. **Radio Effects**: 5 aviation propagation presets (`clear_comm`, `normal_aviation`, `weak_signal`, `heavy_interference`, `emergency_transmission`), independent bandpass (300–3000 Hz), AGC compression, mild analog saturation, carrier hiss, RF dropouts, cockpit ambient noise, PTT timing controls, and Clean-vs-VHF A/B comparison preview.
  5. **Audio Diagnostics**: Generation latency (`avg`, `p95`, `min`, `max`), cache hit rate (Library + Disk + IndexedDB), generated vs missing counts, CPU/GPU telemetry, storage footprint breakdown, and unified server + client error logs.
  6. **Global Settings**: Master audio/TTS switches, background generation toggle, lookahead readback prewarm, default voices, dynamic cache size ceiling, and versioned database migration viewer (`local-data/audio-studio-db.json`).
- **Aviation Speech Grammar & Comms Queue**: Structured conversion of airline telephony, callsigns, registrations, runways, altitudes, headings, airspeeds, VHF frequencies, squawk codes, and waypoints with priority queueing (Mayday/Emergency > Critical ATC > Conflict Alert > Clearances > Readbacks).

---

## Installation Instructions

### Prerequisites

- **Node.js**: v20.11+ or v22+
- **npm**: v10+
- Hardware: Multi-core x64/ARM64 CPU (e.g., Intel Core i7-11800H / 32 GB RAM; optional CUDA GPU telemetry via `nvidia-smi`).

### 1. Install Dependencies

```bash
npm install
```

### 2. Install & Verify Local Kokoro-82M Model

During initial setup while online (or by copying `local-models/` onto an air-gapped machine):

```bash
npx tsx scripts/download_kokoro_model.ts
```

Verify all required model artifacts (`config.json`, `tokenizer.json`, `tokenizer_config.json`, `onnx/model_quantized.onnx` ~88–89 MB) are present:

```bash
npx tsx scripts/download_kokoro_model.ts --verify
```

### 3. Generate Voice Samples & Core Audio Library

Generate the 15 voice audition WAV samples:

```bash
npx tsx scripts/generate_samples.ts
```

Generate the core 24-category × 15-voice pre-generated WAV audio library:

```bash
npx tsx scripts/build_audio_library.ts --core
```

*(Optional)* Generate the full matrix across every catalog phrase and all 15 voices:

```bash
npx tsx scripts/build_audio_library.ts --all
```

*(Optional)* Scan library integrity:

```bash
npx tsx scripts/build_audio_library.ts --scan
```

### 4. Start the Simulator (Development or Production)

Development server on port `3000`:

```bash
npm run dev
```

Typecheck & Production Build:

```bash
npm run lint
npm run build
npm start
```

### 5. Run Automated Tests

```bash
npm test -- --run
```

---

## Documentation

- Offline deployment & model installation details: [`docs/OFFLINE_SETUP_AND_MODEL_GUIDE.md`](docs/OFFLINE_SETUP_AND_MODEL_GUIDE.md)
- Latest test execution & verification report: [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md)
