# SKYCONTROL ATC SIMULATOR — COMPREHENSIVE MULTIDISCIPLINARY TECHNICAL AUDIT

**Audit Date:** 2026-11-16  
**Workspace Root:** `/app/applet` (`skycontrol` v0.0.0)  
**Audit Mode:** Strict Read-Only Forensic Engineering Inspection & Empirical Headless Verification  
**Authoring Scope:** Software Architecture · ATC Operations · Flight Physics · Radar & STCA Systems · Offline VHF DSP & Kokoro-82M TTS · Mission-Critical UI/UX · Database & Security · Performance & QA Engineering

---

## TABLE OF CONTENTS

1. [REPORT A — Executive Summary](#report-a--executive-summary)
2. [Architectural Analysis & End-to-End Data Flow](#architectural-analysis--end-to-end-data-flow)
3. [Functional Module Classification Matrix](#functional-module-classification-matrix)
4. [Deep Technical Audits by Engineering Discipline](#deep-technical-audits-by-engineering-discipline)
   - [4.1 Flight Simulation Physics & Performance Modeling](#41-flight-simulation-physics--performance-modeling)
   - [4.2 ILS Approach, Takeoff Sequencing & Procedural Navigation](#42-ils-approach-takeoff-sequencing--procedural-navigation)
   - [4.3 Radar Scanning, Tracking & STCA Conflict Detection](#43-radar-scanning-tracking--stca-conflict-detection)
   - [4.4 Aviation Speech Grammar, Comms Coordinator, VHF DSP & Kokoro-82M TTS](#44-aviation-speech-grammar-comms-coordinator-vhf-dsp--kokoro-82m-tts)
   - [4.5 Mission-Critical UI/UX & Human Factors](#45-mission-critical-uiux--human-factors)
   - [4.6 Code Quality, Dead Code & Dependency Hygiene](#46-code-quality-dead-code--dependency-hygiene)
   - [4.7 Security & Data Persistence Consistency](#47-security--data-persistence-consistency)
   - [4.8 Performance Benchmarks & Resource Profile (10 / 30 / 50 / 100 Aircraft)](#48-performance-benchmarks--resource-profile-10--30--50--100-aircraft)
   - [4.9 Mathematical Formulas & Operational Logic Validation](#49-mathematical-formulas--operational-logic-validation)
5. [REPORT B — Complete Defect Register](#report-b--complete-defect-register)
6. [REPORT C — Missing & Incomplete Features Matrix](#report-c--missing--incomplete-features-matrix)
7. [REPORT D — Recommended Target Architecture](#report-d--recommended-target-architecture)
8. [REPORT E — 4-Phase Development Roadmap](#report-e--4-phase-development-roadmap)
9. [REPORT F — Testing & Verification Strategy](#report-f--testing-and-verification-strategy)
10. [REPORT G — Project Quality Score (0–100) & Top 20 Prioritized Actions](#report-g--project-quality-score-0-100--top-20-prioritized-actions)

---

## REPORT A — EXECUTIVE SUMMARY

### Overall Condition Assessment
**SKYCONTROL** is an ambitious, feature-rich browser + Node.js Terminal Radar Approach Control (TRACON) / Tower ATC simulator combining a 20 Hz pure-TypeScript kinematics engine, scan-driven radar tracker, Short-Term Conflict Alert (STCA) 3D Closest Point of Approach (CPA) solver, 5-airport procedure database (`EGLL`, `OIII`, `KJFK`, `TRN1`, `TRN2`) with topographic elevation contours, Firebase Cloud/Guest persistence, and a multi-tier offline VHF radio communication suite (`Kokoro-82M-v1.0-ONNX` Express/worker service + bundled pre-rendered `.wav`/`.mp3` audio sprite/phrase libraries + Web Audio API 7-stage VHF radio DSP chain).

TypeScript compilation is clean (`npx tsc --noEmit` exits `0`), and `136 / 137` unit tests pass (`11 / 12` Vitest suites). However, deep code-level forensics and empirical simulation probing reveal **serious physical, operational, architectural, security, and runtime gaps** preventing SKYCONTROL from operating as a faithful, production-grade ATC training platform:

1. **Critical Simulation & Safety Defects:**
   - **Stationary Ground Aircraft Wind Drift (`DEF-001`):** Departing aircraft in `HOLD_SHORT` or `LINEUP` (`indicatedAirspeed === 0`) fall through `tickSimulation` into airborne wind-drift integration, sliding backward across the aerodrome at wind speed (**measured `0.776 NM` displacement in 60s** at `15 kt` wind).
   - **High-Elevation Airport STCA False Alarms (`DEF-002`):** `detectConflicts()` filters airborne aircraft via `ac.altitude > 150` MSL instead of field-relative AGL or phase gating. At **Tehran Mehrabad (`OIII`, 3,962 ft MSL)** or `TRN1` (`450 ft`), stationary departures on the ground immediately trigger **Critical Separation Infringement** alerts (**empirically verified `0.0 NM / 0 ft` false critical alert**).
   - **20% Altitude Quantization & Low-V/S Stall (`DEF-003`):** `stepAircraftPhysics()` rounds `altitude` to an integer every `0.05s` tick. At `2,000 fpm` (`+1.667 ft/tick`), rounding yields `+2 ft/tick` (`2,400 fpm`, **measured `400 ft` vs expected `333.3 ft` over 10s**), while any commanded vertical speed `< 600 fpm` (`< 0.5 ft/tick`) produces **zero vertical movement**.
   - **ILS Glideslope Bang-Bang Oscillation & Spurious Go-Arounds (`DEF-004`):** Updating `targetAltitude` to nominal 3° glideslope elevation invokes fixed `-1500 fpm` bang-bang steps vs `~750 fpm` required sink rate, oscillating into touchdown and tripping `-600 fpm` sink-rate rejection (`ils.ts:418`), despite an unimplemented `FLARE` label (`ils.ts:453`).
2. **Offline Kokoro-82M Neural TTS Deployment Gap (`DEF-005`):**
   - `local-models/Kokoro-82M-v1.0-ONNX/` totals only `4.5 KB` (`config.json`, `tokenizer.json`, `tokenizer_config.json`) — **`onnx/model_quantized.onnx` is missing from disk**, causing live neural synthesis to fail on runtime and failing `tests/local_tts_engine.test.ts:70` (`verifiedOnDisk === false`). Stale documentation (`docs/TEST_REPORT.md`) erroneously claims `129/129` passed and an `88.09 MiB` ONNX model verified on disk.
3. **Audio Concurrency, Sync I/O & Cache Invalidation Bugs (`DEF-006`–`DEF-010`):**
   - `CommsManager` exposes multi-frequency APIs (`activeFrequencies: Set<string>`), yet enforces a **single global `isProcessing` lock**, blocking simultaneous Tower and Approach frequencies. `EMERGENCY` preemption fails to cancel an active `AudioBufferSourceNode` immediately.
   - Server Express endpoints run **synchronous `writeFileSync`/`readFileSync`/`renameSync`** on the hot path per cache/library hit (`audioCacheManager.ts`, `audioLibraryManager.ts`), and both client IndexedDB keys and server library lookups omit voice speaker/speed revisions, causing stale audio playback after voice editing.
4. **Unauthenticated Admin APIs & Path Traversal Risk (`DEF-011`, `DEF-012`):**
   - All `/api/tts/*`, `/api/library/*`, `/api/audio/*` endpoints lack authentication/CSRF/rate-limiting. `VoiceProfileManager.createProfile()` spreads unvalidated `input.id` directly into filesystem paths (`path.join(samplesDir, `${profile.id}.wav`)`), allowing `.wav` file overwrite/read traversal.
5. **Performance & Structural Scaling Debt:**
   - Core Zustand store mixes simulation state updates, UI selection, STCA scoring, and communication scheduling inside a single `2,340`-line monolithic store (`simulationStore.ts`), while `RadarCanvas.tsx` (`2,350` lines) redraws topographic terrain contours and range rings inline with dynamic tracks, and `2,066` lines of superseded legacy UI modals remain unreferenced in `src/components/`.

### Measured Verification Baseline (2026-11-16)
| Verification Check | Command / Scope | Observed Result |
|---|---|---|
| TypeScript Type Check | `npx tsc --noEmit` | **PASS** (`EXIT: 0`) |
| Vitest Unit & Integration Suite | `npx vitest run` | **11 / 12 files PASS** · **136 / 137 tests PASS** · **1 FAIL** (`tests/local_tts_engine.test.ts:70`) |
| Physics & Store Benchmark (Headless Node) | `npx tsx -e` (`N=10,30,50,100`, 200 ticks @ `dt=0.05s`) | `N=100` full tick avg `1.3185 ms` (`max 8.42 ms`); STCA scales quadratically `0.084 → 1.151 ms` |
| Stationary Ground Drift Check | `HOLD_SHORT`, 15 kt wind, 60s (`dt=0.05s`) | **Confirmed Bug:** `0.776 NM` unintended displacement |
| Altitude Quantization Check | 2,000 fpm climb over 10s (`dt=0.05s`) | **Confirmed Bug:** Actual `+400 ft` vs expected `+333.3 ft` (`+20.0%` error) |
| High-Elevation STCA Check (`OIII`) | Two `HOLD_SHORT` departures at `OIII` (`3,962 ft`) | **Confirmed Bug:** Immediate `Critical` alert (`0.0 NM / 0 ft`) |
| Browser DOM / WebAudio / CUDA GPU | Live Chromium session & GPU inference | **Not Verified** in this read-only audit environment |

---

## ARCHITECTURAL ANALYSIS & END-TO-END DATA FLOW

### High-Level System Architecture & Data Flow Diagram

```text
+--------------------------------------------------------------------------------------+
|                          CLIENT APPLICATION (React 19 + Vite)                        |
|                                                                                      |
|  [AuthGateModal] ---> [persistenceService.ts] <---> (Firebase Auth + Firestore)      |
|         |                      | (or Guest localStorage)                             |
|         v                                                                            |
|  [PreFlightSetupModal] -> Configures Airport / Runways / Active SID-STAR / Weather /  |
|                           VHF DSP Preset / Offline TTS Settings                      |
|         |                                                                            |
|         v                                                                            |
|  [simulationStore.ts (Zustand Monolith - 2,340 LOC)] <--- 20Hz setInterval Engine    |
|     |-- stepTakeoffSequence()  (src/engine/takeoff.ts)                               |
|     |-- stepAircraftPhysics()  (src/engine/physics.ts)                               |
|     |-- processIlsApproach()   (src/engine/ils.ts)                                   |
|     |-- detectConflicts()      (src/engine/conflict.ts)                              |
|     |-- RadarTrackingEngine    (src/engine/radarTracker.ts)                          |
|     |-- Traffic Spawner        (src/engine/trafficGenerator.ts)                      |
|     `-- Telemetry/Comms Events ---> [commsManager.ts] (Priority Queue + Grammar)     |
|                                           |                                          |
|      +------------------------------------+------------------------------------+     |
|      v (Tier 1A/1B: HTTP/Static WAV)      v (Tier 2: MP3 Sprite)               v     |
|  [localTtsClient.ts + IndexedDB]   [AudioEngine + voicePackPlayer]      (Tier 3 OS)  |
|      |                                    |                        speechSynthesis   |
|      +------------------+-----------------+                        (DRY: bypasses    |
|                         v                                           WebAudio DSP!)   |
|              [vhfRadioDsp.ts] (300-3000Hz BPF, Waveshaper, Compressor,               |
|                                Hum, Static, Crackles, Dropouts, PTT Clicks)          |
|                         |                                                            |
|                         v                                                            |
|                   [AudioContext.destination]                                         |
|                                                                                      |
|  UI Views: [RadarCanvas.tsx (2,350 LOC)] [TopBar] [CommandPanel] [AudioStudioModal]  |
+--------------------------------------------------------------------------------------+
                                         | HTTP JSON + Binary WAV (/api/*)
                                         v
+--------------------------------------------------------------------------------------+
|                        LOCAL SERVER (Express 4 + tsx - server.ts)                    |
|  Routes: /api/health | /api/tts/* | /api/voices* | /api/library/* | /api/audio/*     |
|                                                                                      |
|  [LocalTtsService] ---> [AudioCacheManager] ---> Disk: local-data/audio-cache/*.wav  |
|         |               (Sync writeFileSync on every hit!)                           |
|         v                                                                            |
|  [AudioGenerationQueue] (Sequential FIFO + Pre-warm Background Queue)                |
|         |                                                                            |
|         v (worker_threads message channel)                                           |
|  [ttsWorker.ts] ---> @huggingface/transformers + kokoro-js (device: 'cpu' ONLY)      |
|         |            local-models/Kokoro-82M-v1.0-ONNX (NOTE: onnx weights missing!) |
|         v                                                                            |
|  [AudioLibraryManager] <---> public/audio-library/ + local-data/audio-library-manifest|
|  [VoiceProfileManager] <---> local-data/voice-profiles.json (15 profiles)            |
|  [hardwareTelemetry.ts] <--- os.cpus() + execFile('nvidia-smi') (Telemetry only)     |
+--------------------------------------------------------------------------------------+
```

### Architectural Observations
1. **Pure Engine Core (`src/engine/*`):** Physics, ILS, Takeoff, Conflict, and Tracker modules are cleanly written pure-TypeScript functions with zero DOM dependencies, enabling deterministic Node.js unit testing and headless benchmarking.
2. **State Orchestration Coupling (`src/store/simulationStore.ts`):** Unlike the clean engine layer, `simulationStore.ts` (`2,340` lines) mixes simulation stepping, command issuance, voice synthesis dispatch, flight strip management, radar visibility rules, mission evaluation, and scoring into one Zustand store. There is no command/event bus decoupling simulation physics from UI/audio side effects.
3. **Dual-Sided Audio Topology (`src/audio/*` + `server/*`):** Audio generation/caching architecture uses an intelligent multi-tier degradation strategy (`pre-generated static library -> server cache -> worker Kokoro synthesis -> MP3 sprite voice-pack -> Web Speech API`). However, duplicate speaker registries (`radioAudio.ts` vs `voiceAssignmentRegistry.ts`) and uncoordinated caches (client IndexedDB vs server file index vs pre-generated manifest) introduce state drift.
4. **Main-Thread UI Rendering (`src/components/RadarCanvas.tsx`):** `RadarCanvas` spans `2,350` lines handling coordinate projection, terrain isolines, SID/STAR geometry, radar sweep phosphor trails, conflict glyphs, interactive vector dragging, measurement rulers, and 3-line data-block tags inside monolithic imperative canvas redraw callbacks.

---

## FUNCTIONAL MODULE CLASSIFICATION MATRIX

| Module / Feature | Primary File(s) | Status Classification | Engineering Summary |
|---|---|---|---|
| **Authentication & Account Gate** | `src/components/AuthGateModal.tsx`, `src/firebase/config.ts` | `Partially implemented` | Google OAuth + Guest mode work; `App.tsx:80` fires a rule-denied `/test/connection` probe; guest-to-cloud merge trusts client progress without server verification. |
| **Pre-Flight Configuration Gate** | `src/components/PreFlightSetupModal.tsx`, `src/store/simulationStore.ts` | `Fully implemented` | Airport, active runways, individual SID/STAR/waypoint visibility, traffic density, weather, offline audio quality, and sim speed all configure cleanly pre-session. |
| **Airports, Topographic Terrain & SID/STAR Procedures** | `src/airports/*.ts`, `src/airports/procedures.ts`, `src/airports/terrain.ts` | `Partially implemented` | 5 rich airports with runway geometry, isolines, SIDs, STARs, and IAF/FAF fixes; **however**, lateral route chains are followed without vertical/speed altitude-constraint enforcement, and arrivals do not spawn along STAR entry gates. |
| **Aircraft Kinematics & Weather Drift** | `src/engine/physics.ts` | `Implemented but defective` | Wind vector & TAS scaling implemented; **defects**: stationary `HOLD_SHORT`/`LINEUP` ground wind drift (`0.776 NM/min`), integer altitude rounding (+20% climb overshoot / `<600 fpm` stall), and hardcoded rates ignoring `AIRCRAFT_PERFORMANCE_DATABASE`. |
| **Aircraft Performance Profiles** | `src/engine/aircraftPerformance.ts` | `Partially implemented` | Rich FCOM/Doc 8643 dataset for 7 types, but only `takeoff.ts` & `ils.ts` consume it cleanly; `physics.ts` ignores it, and 6 fleet types from `trafficGenerator.ts` (`A388, A339, A220, E190, A333, B788`) fall back silently to `A320`. |
| **Takeoff Roll & Climbout Engine** | `src/engine/takeoff.ts` | `Implemented but defective` | `V1/Vr/V2` roll & aborted-takeoff logic work well; **defects**: uses IAS as GS (ignoring wind/TAS), omits radar trail recording until >1500 ft AGL, locks heading until >1500 ft AGL, and `simulationStore.ts:1215` increments departure score before takeoff rolls. |
| **ILS Approach & Autoland Engine** | `src/engine/ils.ts` | `Implemented but defective` | Localizer capture, course alignment, and go-around triggers exist; **defects**: bang-bang glideslope control triggers `-1500 fpm` steps causing false `-600 fpm` touchdown go-arounds, and `FLARE` phase sets label without reducing vertical sink rate. |
| **Scan-Driven Radar Tracker** | `src/engine/radarTracker.ts` | `Partially implemented` | Realistic 15 RPM sweep gating and `CONFIRMED/PREDICTED/STALE/LOST` lifecycle; **defect**: inter-scan dead reckoning uses magnetic `heading` instead of `groundTrack`, introducing crosswind positional error; max radar range capped at `55 NM` vs `140 NM` UI zoom. |
| **STCA & 3D CPA Conflict Detection** | `src/engine/conflict.ts` | `Implemented but defective` | Exact quadratic horizontal/vertical overlap + `ConflictEventTracker` single-penalty deduplication; **defects**: `altitude > 150` MSL check triggers false `Critical` ground conflicts at high-elevation `OIII` (`3,962 ft`); lacks wake-turbulence minima (`Super/Heavy`) and Terrain/MVA alerting. |
| **Radar Scope UI & Vectoring Tools** | `src/components/RadarCanvas.tsx` | `Partially implemented` | Smooth `2.5–140 NM` zoom, pan, heading drag arc, direct-to chaining, measurement ruler, terrain & declutter presets; lacks offscreen static-layer caching and automated label collision solver. |
| **VHF Radio 7-Stage DSP Pipeline** | `src/audio/vhfRadioDsp.ts` | `Fully implemented` | Authentic 300–3000 Hz cascaded bandpass, waveshaper saturation, dynamics compressor, continuous noise/hiss/crackles, signal fading/dropouts, cockpit hum, PTT open/close clicks, and 5 presets. |
| **Aviation Speech Grammar (ICAO Annex 10)** | `src/audio/aviationSpeechGrammar.ts` | `Fully implemented` | Converts callsigns, airlines, numbers, runways, altitudes/FLs, speeds, headings, frequencies, squawks, and nav instructions cleanly across pure TypeScript. |
| **Radio Comms Queue & Coordination** | `src/audio/commsManager.ts` | `Implemented but defective` | Priority ordering, emergency tagging, and readback scheduling exist; **defects**: single global `isProcessing` boolean defeats per-frequency concurrency; `EMERGENCY` preemption fails to halt active Web Audio nodes immediately. |
| **Offline Neural TTS Engine (Kokoro-82M)** | `server/localTtsService.ts`, `server/ttsWorker.ts` | `Implemented but defective` | Background worker queue & model manager architecture exist cleanly; **critical blocker**: `onnx/model_quantized.onnx` is missing on disk (failing Vitest suite #12), and worker forces CPU-only inference despite `nvidia-smi` telemetry probe. |
| **Offline Pre-Generated Audio Library** | `server/audioLibraryManager.ts`, `shared/audioLibraryCatalog.ts` | `Implemented but defective` | Catalog & 12 MB pre-generated WAV assets (`public/audio-library/`) work offline; **defects**: synchronous disk reads/writes on main Express thread, incomplete cache-key invalidation when speaker/speed changes, and full 1.5 MB manifest rewrite twice per synthesis. |
| **Voice Profile Assignment Registry** | `src/audio/voiceAssignmentRegistry.ts`, `server/voiceProfileManager.ts` | `Partially implemented` | Flight-lifetime pilot stability & station separation work well; **security defect**: unvalidated `createProfile` ID permits path traversal into `samplesDir`; legacy duplicate mapping remains in `radioAudio.ts`. |
| **Audio Studio Workbench Modal** | `src/components/AudioStudioModal.tsx` | `Fully implemented` | 3,087-LOC integrated UI covering all 6 required sections (15 voice profiles, library manager, TTS engine telemetry, VHF DSP sliders/presets, diagnostics, global storage). |
| **Academy Certification & Scenario Studio** | `src/components/MissionHudOverlay.tsx`, `CertificateModal.tsx`, `OperationsHubModal.tsx` | `Partially implemented` | 5 progressive missions, custom scenario builder, and printable certificate; progression/scores are client-asserted into Firestore without server-side validation. |
| **Legacy Audio & Traffic Modals** | `TrafficList.tsx`, `VhfRadioSettingsModal.tsx`, `VoiceEngineModal.tsx`, `VoiceLibraryModal.tsx` | `UI only` (Dead Code) | Superseded 2,066 lines of unreferenced React components remaining in `src/components/`. |
| **Automated Conflict Resolution / Runway Surface Radar (ASMGCS) / ATIS Audio Loop / Replay** | N/A | `Missing` | Absent from codebase (detailed in Report C). |

---

## DEEP TECHNICAL AUDITS BY ENGINEERING DISCIPLINE

### 4.1 Flight Simulation Physics & Performance Modeling

Inspection of `/src/engine/physics.ts`, `/src/engine/aircraftPerformance.ts`, and `/src/engine/trafficGenerator.ts` exposes five concrete realism and numerical-integrity defects:

1. **Unprotected Ground Kinematics (`src/store/simulationStore.ts:2185`, `src/engine/physics.ts:384-391`):**
   - `tickSimulation` only routes departures to `stepTakeoffSequence()` when `isGroundDeparture && currentAc.indicatedAirspeed > 0`. Newly spawned departures in `HOLD_SHORT` or `LINEUP` have `indicatedAirspeed === 0` (`trafficGenerator.ts:495`), so every simulation tick passes them to `stepAircraftPhysics()`.
   - Inside `stepAircraftPhysics()`, `calculateTASFromIAS(0, alt)` returns `0`, and `calculateGroundVector(0, heading, windX, windY)` adds the wind vector directly to zero airspeed: `gvx = -windX`, `gvy = -windY`.
   - **Empirical Verification:** Running a `HOLD_SHORT` departure at `EGLL` under `15 kt` wind (`270°`) for 60 simulation seconds (`1,200` ticks @ `dt=0.05s`) displaced the parked aircraft by **`0.7760 NM`** off the runway threshold. Furthermore, `issueTakeoffClearance()` (`takeoff.ts:88-113`) only assigns target runway heading and target speed without resetting position back to the threshold.
2. **Every-Tick Integer Altitude Quantization (`src/engine/physics.ts:417`, `src/engine/takeoff.ts:290`):**
   - Because simulation runs at `20 Hz` (`dt = 0.05s`) and `physics.ts:417` assigns `altitude: Math.round(newAltitude)`, fractional feet are discarded on *every single tick*.
   - Normal climb (`2,000 fpm`) advances `33.333 ft/s * 0.05s = +1.6667 ft/tick`. Rounding converts `+1.6667` to `+2 ft/tick` (`2,400 fpm`, **+20.0% error**).
   - Normal descent (`-1,500 fpm`) advances `-25 ft/s * 0.05s = -1.25 ft/tick`. Rounding converts `-1.25` to `-1 ft/tick` (`-1,200 fpm`, **-20.0% error**).
   - Any climb/descent slower than `600 fpm` (`< 0.5 ft/tick`, e.g., final approach glideslope adjustment or gentle pitch flare) rounds to **`+0 ft/tick` (complete vertical stall)** when climbing/descending monotonically from an integer altitude.
3. **Hardcoded Rates Bypass Performance Database (`src/engine/physics.ts:210,323-324,337-338`):**
   - `stepAircraftPhysics()` hardcodes `accelRate = 2.0 kt/s`, `decelRate = 2.5 kt/s`, `climbRate = 2000/3200 fpm`, `descentRate = 1500/2800 fpm`, and `Landed` rollout `decelRate = 18.0 kt/s` for all aircraft regardless of type—ignoring `getAircraftPerformance(ac.aircraftType)` fields (`maxClimbRateFpm`, `normalDescentRateFpm`, `landingRollDecelRateKts_s`, `maxBankAngleDeg`).
4. **6 Fleet Aircraft Types Missing from Performance Database (`src/engine/trafficGenerator.ts` vs `src/engine/aircraftPerformance.ts`):**
   - `trafficGenerator.ts` spawns `A388` (line 50), `A339` (line 62), `A220` (lines 83, 125), `E190` (line 94), `A333` (lines 105, 127), and `B788` (line 149).
   - `AIRCRAFT_PERFORMANCE_DATABASE` (`aircraftPerformance.ts:36-184`) defines only 7 keys: `A320`, `A321`, `A350`, `B77W`, `B789`, `A380` (note `A380` vs spawned `A388` ICAO code mismatch!), and `B738`. All 6 missing codes silently fall back via `DEFAULT_PERFORMANCE` to an **A320-200** (`78 t` instead of `575 t` A380-800 `A388`!).
5. **Unmodeled Physics Nuances:** Bank angle changes instantaneously from `0°` to `25°` (`calculateTurnRateAndBankAngle()` has zero roll-rate inertia), IAS-to-TAS conversion (`tas = ias * (1 + 0.000018 * alt)` at `physics.ts:94`) ignores atmospheric pressure (`QNH`) / non-ISA temperature deviation, and `stepTakeoffSequence()` (`takeoff.ts:255-261`) drives ground roll and initial climb using `indicatedAirspeed` directly as ground speed while also dropping trail history below `1,500 ft AGL` and blocking headings below `1,500 ft AGL`.

### 4.2 ILS Approach, Takeoff Sequencing & Procedural Navigation

Inspection of `/src/engine/ils.ts`, `/src/engine/takeoff.ts`, and `/src/store/simulationStore.ts`:

1. **ILS Glideslope Control Loop Instability (`src/engine/ils.ts:360`, `src/engine/physics.ts:343-354`):**
   - During final approach, `processIlsApproach()` sets `targetAltitude = Math.max(fieldElev, Math.round(gs.nominalGlideslopeAltFt))`. Because `physics.ts` applies binary vertical speed (`-1500 fpm` whenever `|altDiff| > 5 ft`, otherwise `0`), while a 3° glideslope at `142 kt` (`~755 fpm`) requires roughly half that sink rate, the aircraft repeatedly dives at `-1,500 fpm` until within `5 ft` of the glideslope, levels off (`0 fpm`), then dives at `-1,500 fpm` again.
   - At touchdown (`ils.ts:418`), `if ((ac.verticalSpeed || 0) < perf.touchdownMaxSinkRateFpm)` (`-600 fpm`) checks instantaneous tick vertical speed: any landing occurring on a `-1,500 fpm` dive tick triggers a **spurious "UNSTABLE APPROACH: High sink rate" Go-Around** even on a stabilized final!
   - Simultaneously, `ils.ts:453` sets `flightPhase: 'FLARE'` within `50 ft AGL` / `0.25 NM`, yet applies zero vertical-speed flare law toward `perf.touchdownNominalSinkRateFpm` (`-180 fpm`).
2. **Premature Departure Scoring (`src/store/simulationStore.ts:1215`):**
   - `clearTakeoff` increments `stats.departures += 1` and awards `+2` score immediately when takeoff clearance is issued, before the aircraft rotates, climbs out, or even if the takeoff is subsequently aborted/cancelled (`cancelTakeoff`) or suffers a separation conflict on climbout.
3. **STAR/SID Procedure Constraints Non-Enforced (`src/airports/procedures.ts`, `src/engine/physics.ts:246-274`):**
   - While STARs, SIDs, IAFs, and FAFs define `minAltitudeFt`, `maxAltitudeFt`, and `speedLimitKt`, `stepAircraftPhysics()` only extracts horizontal waypoint coordinates (`wp.position.x/y`) to steer heading; altitude and speed restrictions are **visual annotations only** on the radar canvas and are never enforced automatically along active STAR/SID chains. Furthermore, `trafficGenerator.ts` spawns arrivals on a generic 360° perimeter ring (`27–36 NM`) pointing inward with a 22% chance of picking a single front waypoint (`line 383`) rather than entering via configured STAR entry gates.

### 4.3 Radar Scanning, Tracking & STCA Conflict Detection

Inspection of `/src/engine/radarTracker.ts` and `/src/engine/conflict.ts`:

1. **False Critical Separation Infringements at High-Elevation Airports (`src/engine/conflict.ts:309-311`):**
   - Line 310 filters: `ac => ac.status !== 'Landed' && ac.altitude > 150`. The comment states *"above field elevation"*, yet `150` is a hardcoded MSL constant calibrated only for sea-level airports like `EGLL` (`83 ft`) or `KJFK` (`13 ft`).
   - At **Tehran Mehrabad `OIII` (`3,962 ft` MSL)** or **`TRN1` (`450 ft` MSL)**, stationary `HOLD_SHORT`/`LINEUP` aircraft sitting at threshold altitude (`3,962 ft > 150 ft`) are treated as airborne! Two waiting departures at `OIII` immediately raise `Critical: SEPARATION INFRINGEMENT (0.0 NM / 0 ft)` (verified empirically), sounding the cockpit conflict siren and deducting `-20` points via `ConflictEventTracker`.
2. **Missing Wake Turbulence & MVA/Terrain Conflict Minima (`conflict.ts:15-20`, `src/airports/terrain.ts`):**
   - `DEFAULT_SEPARATION_MINIMA` applies a flat `3.0 NM` horizontal / `1,000 ft` vertical rule for all pairs, failing to enforce ICAO RECAT / Wake Turbulence separation (`4 NM` Heavy-behind-Heavy, `5 NM` Large-behind-Heavy, `6–8 NM` behind Super `A380/A388`).
   - Despite detailed topographic elevation rings defined in `src/airports/terrain.ts`, there is zero Minimum Vectoring Altitude (MVA) or Controlled Flight Into Terrain (CFIT) alert check when vectoring arrivals below terrain elevation + `1,000 ft` buffer.
3. **Tracker Crosswind Dead-Reckoning Error & Range Mismatch (`src/engine/radarTracker.ts:66,229-233`, `src/store/simulationStore.ts:2267`):**
   - Between 4-second radar sweeps, `RadarTrackingEngine` extrapolates predicted position using `track.lastObservation.heading` rather than true `groundTrack`. Under strong crosswinds (up to `60–80 kt` gusts), track prediction symbols drift lateral to actual aircraft flight paths until re-swept.
   - Additionally, `radarTracker` caps detection range at `55 NM` (`DEFAULT_SCANNER_CONFIG.maxRangeNM: 55`), and `simulationStore.ts:2267` despawns flights outside `55 NM`, whereas `RadarCanvas.tsx:113` permits zooming out to `MAX_RANGE_NM = 140 NM`, leaving the `55–140 NM` outer annulus completely empty.

### 4.4 Aviation Speech Grammar, Comms Coordinator, VHF DSP & Kokoro-82M TTS

Inspection of `src/audio/*`, `shared/*`, and `server/*`:

1. **Missing Local Kokoro-82M ONNX Weights (`local-models/Kokoro-82M-v1.0-ONNX`):**
   - Disk inspection confirms `local-models/Kokoro-82M-v1.0-ONNX` is **`4.5 KB`** total containing only `config.json`, `tokenizer.json`, and `tokenizer_config.json`. The required quantized model file `onnx/model_quantized.onnx` (~88 MiB) is absent.
   - `npx vitest run` fails on **`tests/local_tts_engine.test.ts:70`** (`AssertionError: expected false to be true` on `expect(info.verifiedOnDisk).toBe(true)`).
   - Consequence: Every live neural synthesis job in `ttsWorker.ts` (`env.allowRemoteModels = false`) throws a load failure and degrades immediately to the bundled sprite voice-pack or browser OS `speechSynthesis`. `docs/TEST_REPORT.md` contains stale claims (`129/129 passed`, `88.09 MiB model_quantized.onnx present`) that do not match the current workspace state.
2. **Worker Forces CPU Execution Regardless of GPU (`server/ttsWorker.ts:62-65`, `server/hardwareTelemetry.ts:117-121`):**
   - `KokoroTTS.from_pretrained(modelId, { dtype, device: 'cpu' })` hardcodes CPU execution. `hardwareTelemetry.ts` runs `nvidia-smi` only for UI reporting (`AudioStudioModal`) while returning `executionProvider: 'cpu'`.
3. **False Multi-Frequency Concurrency & Broken Emergency Preemption (`src/audio/commsManager.ts:114,248-256,390-438`):**
   - Although `commsManager.ts` tracks `activeFrequencies: Set<string>` and documents *"Simultaneous transmissions on DIFFERENT frequencies are allowed cleanly"*, line 114 declares a single global `private isProcessing = false` checked in `processQueue()` (`line 391`). Two controllers or aircraft on different VHF frequencies (e.g., `119.725` Tower and `134.975` Approach) are still serialized through one global lock.
   - In `enqueue()`, `EMERGENCY` priority (`lines 248-256`) flips `abortHandle.aborted = true`, but `processQueue()` does **not** immediately call `audioEngine.stopActive()` or `stopActiveRadioPlayback()` when preempting a queued item—meaning the active transmission continues playing until its internal `shouldAbort` checkpoint or natural buffer end.
4. **Synchronous Filesystem I/O Blocking the Express Main Thread (`server/audioCacheManager.ts:130,186`, `server/audioLibraryManager.ts:262,289,319,572,606`):**
   - `AudioCacheManager.get()` executes `this.persistIndex()` (`fs.writeFileSync` + `fs.renameSync` + `JSON.stringify`) **synchronously on every single cache read hit** solely to increment `hitCount` and `lastAccessedAt`.
   - `AudioLibraryManager.matchReadyAsset()` calls synchronous `fs.readFileSync(diskPath)` per hit. `generateAsset()` writes the entire ~1.5 MB `audio-library-manifest.json` synchronously **twice per synthesized phrase** (once when transitioning to `GENERATING`, again on `READY`/`FAILED`). Under batch pre-generation or concurrent playback requests, this blocks Node's event loop.
5. **Client & Server Cache Key Mismatches (`src/services/localTtsClient.ts:34`, `server/audioLibraryManager.ts:269-275`):**
   - Client IndexedDB key `${voiceId}::${speed.toFixed(2)}::${normalizedText}` omits the underlying `kokoroVoiceId` and `stability`, and `audioLibraryManager.matchReadyAsset()` matches only `(voiceId, spokenText)` while ignoring edits to `profile.kokoroVoiceId` or `profile.speed`. Changing a voice's speaker or speed in Audio Studio serves stale cached WAVs until manually deleted.
6. **VHF DSP Chain Bypass & Legacy Code Duplication (`src/audio/commsManager.ts`, `src/audio/radioAudio.ts`):**
   - Tier 3 OS `window.speechSynthesis` fallback cannot be captured as an `AudioNode` into `vhfRadioDsp.ts` (`Web Audio API` security model). Consequently, Tier 3 produces un-filtered clear robotic browser voice overlaid against background hiss/PTT clicks, breaking immersion whenever Tier 1/2 misses an arbitrary callsign/waypoint.
   - `src/audio/radioAudio.ts:466` (`resolveOfflinePilotProfile`) is obsolete in runtime paths, still imported only by legacy tests (`tests/radio_voices.test.ts`, `tests/local_tts_engine.test.ts`).

### 4.5 Mission-Critical UI/UX & Human Factors

Inspection of `RadarCanvas.tsx`, `TopBar.tsx`, `CommandPanel.tsx`, `AuthGateModal.tsx`, `PreFlightSetupModal.tsx`, `AudioStudioModal.tsx`:

1. **No Offscreen Static Canvas Layering (`src/components/RadarCanvas.tsx`):** Static topographic contour polygons (`terrain.ts`), concentric range rings (`5/10/15/20... NM`), coastline/river vectors, and airport runway surfaces are redrawn inside the main rendering pass on every aircraft/sweep state update rather than blitted from a zoom/pan-invalidated offscreen bitmap buffer.
2. **Manual Data-Block Deconfliction Only (`RadarCanvas.tsx`):** Aircraft 3-line ICAO tags (`callsign`, `alt/vs`, `speed/type/rwy`) support manual pointer drag (`repositionTag`), but lack an automatic spring/radial label de-confliction solver during converging merges at IAF/FAF fixes, causing stacked callsigns to obscure each other in busy sectors (`N >= 25`).
3. **Real Wall-Clock Instead of Simulation Clock (`src/components/TopBar.tsx:66-74`):** The prominent top-bar `UTC` clock ticks `new Date().toTimeString()` (host system clock) via `setInterval(..., 1000)` instead of deriving from `simTimeSec` (e.g., failing to advance at `2x`/`5x` simSpeed or freeze when paused).
4. **Heavy Monolithic Components (`AudioStudioModal.tsx` 3,087 LOC, `RadarCanvas.tsx` 2,350 LOC, `PreFlightSetupModal.tsx` 1,370 LOC):** Large monolithic React files increase cognitive load, re-render coupling, and maintenance risk.

### 4.6 Code Quality, Dead Code & Dependency Hygiene

Static inspection and repository-wide `grep` verification confirm:

1. **2,066 Lines of Unreferenced Dead UI Components in `src/components/`:**
   - `src/components/TrafficList.tsx` (`147` lines) — zero imports anywhere.
   - `src/components/VhfRadioSettingsModal.tsx` (`476` lines) — superseded by `AudioStudioModal.tsx`; zero imports.
   - `src/components/VoiceEngineModal.tsx` (`556` lines) — superseded by `AudioStudioModal.tsx`; zero imports.
   - `src/components/VoiceLibraryModal.tsx` (`887` lines) — superseded by `AudioStudioModal.tsx`; zero imports.
2. **Unused Packages & Misplaced Dev Dependency (`package.json`):**
   - `@google/genai` (`^1.29.0`) and `motion` (`^12.23.24`) have **zero imports** in `src/`, `server/`, `shared/`, or `tests/`. Despite this, `metadata.json` still lists `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` and `.env.example` retains `GEMINI_API_KEY`.
   - `@firebase/eslint-plugin-security-rules` is installed in runtime `dependencies` instead of `devDependencies`, and `autoprefixer` is unused alongside Tailwind CSS v4 (`@tailwindcss/vite`).
3. **Production Catch-All Swallows Unknown `/api/*` (`server.ts:387`):** In production mode, `app.get('*', ...)` intercepts typos or invalid `/api/...` routes and serves `dist/index.html` (`200 OK` HTML) instead of JSON `404 Not Found`.

### 4.7 Security & Data Persistence Consistency

Inspection of `server.ts`, `server/voiceProfileManager.ts`, `server/localTtsService.ts`, `firestore.rules`, `src/firebase/config.ts`, and `src/services/persistenceService.ts`:

1. **Path Traversal Risk in Voice Profile Creation & Sample Serving (`server/voiceProfileManager.ts:172-186`, `server/localTtsService.ts:341`, `server.ts:169-215`):**
   - `VoiceProfileManager.createProfile(input)` spreads arbitrary user-supplied fields (`...input`) and accepts an unsanitized `input.id` without regex/path validation (`^[a-zA-Z0-9_-]+$`).
   - `ensureProfileSample()` subsequently constructs `const sampleFile = path.join(this.samplesDir, `${profile.id}.wav`)`. A crafted `POST /api/voices` payload with `id: "../../../local-data/target"` followed by `GET/POST /api/voices/:id/sample` can write or read `.wav` files outside `public/voice-samples/`.
2. **Unauthenticated Administrative Endpoints (`server.ts:49-372`):**
   - Destructive and resource-intensive routes (`DELETE /api/library/unused`, `POST /api/library/prewarm`, `DELETE /api/voices/:id`, `POST /api/tts/load-model`, `DELETE /api/audio/cache`) have zero authentication token verification, CSRF headers, origin checks, or rate limiting. If bound on a non-loopback LAN interface (`0.0.0.0:3000` in `server.ts:392`), any LAN peer can delete library assets, mutate voice settings, or spike CPU via synthesis floods.
3. **Client-Trusted Game Progression in Firestore (`firestore.rules:108-137`, `src/services/persistenceService.ts:260-336`):**
   - `firestore.rules` thoroughly validates field types, key allowlists, owner `uid == request.auth.uid`, email verification, and bounds (`bestScore <= 100`, `totalLandings <= 100000`, `certified => 5 missions`). However, because missions execute client-side without Cloud Functions attestation, authenticated users can submit self-asserted `certified: true` and `bestScore: 100` directly to Firestore.
4. **Startup Rule-Denied Connection Probe (`src/App.tsx:80`, `src/firebase/config.ts:82`):**
   - `testConnection()` runs `getDocFromServer(doc(db, 'test', 'connection'))` on mount. `firestore.rules:6-8` explicitly denies `/test/connection` (`allow read, write: if false`), generating noisy permission-denied errors in Firebase diagnostics and treating rule denials identically to offline readiness.

### 4.8 Performance Benchmarks & Resource Profile (10 / 30 / 50 / 100 Aircraft)

**Measured Headless Node.js Benchmark (`npx tsx -e`)**  
Environment: Linux x86_64 · 200 continuous ticks at `dt = 0.05s` (10s simulated time per tier) at `EGLL`:

| Active Aircraft (`N`) | `stepAircraftPhysics` avg / p95 / max (ms) | `detectConflicts` STCA avg / p95 / max (ms) | `RadarTrackingEngine` avg / p95 / max (ms) | Full `tickSimulation` Store avg / p95 / max (ms) | Heap Delta / 200 Ticks |
|---|---|---|---|---|---|
| **10** | `0.0788` / `0.1378` / `2.4464` | `0.0840` / `0.3388` / `1.1032` | `0.0237` / `0.0615` / `0.2802` | `0.1736` / `0.3536` / `1.2394` | `-2,807 KB` (GC) |
| **30** | `0.0419` / `0.0762` / `1.0661` | `0.2074` / `0.6179` / `2.0488` | `0.0172` / `0.0409` / `0.1842` | `0.4186` / `0.6807` / `35.2911` | `+1,509 KB` |
| **50** | `0.0494` / `0.0774` / `0.2978` | `0.3819` / `1.2142` / `10.0868` | `0.0218` / `0.0433` / `0.1345` | `0.4683` / `0.8239` / `5.4984` | `-1,593 KB` (GC) |
| **100** | `0.1420` / `0.2978` / `3.3285` | `1.1505` / `3.5700` / `5.7675` | `0.0575` / `0.1135` / `0.5042` | `1.3185` / `2.1554` / `8.4193` | `-3,645 KB` (GC) |

**Benchmark Analysis & Scaling Conclusions:**
- **Pure Simulation Engine Headroom:** Even at `N = 100` aircraft, pure backend simulation arithmetic uses **`1.32 ms` avg** (`p95: 2.16 ms`), safely within a `50 ms` (20 Hz) budget.
- **Quadratic STCA Growth:** `detectConflicts` uses all-pairs $O(N^2)$ comparison (`0.084 ms` at `N=10` → `1.151 ms` at `N=100`, a **13.7x jump** matching $\approx \frac{100 \times 99}{10 \times 9} \sim 110\times$ pair scaling minus caching effects). Above ~250–350 aircraft or `5x` simSpeed sub-stepping without spatial hashing / altitude binning, STCA dominates tick latency.
- **Immutable History Slicing Churn:** Every `2.5s` sim-time (`stepAircraftPhysics:398`), each aircraft spreads `...ac.history.slice(-120)` causing periodic V8 GC pauses (e.g., `35.29 ms` max tick spike observed at `N=30`).
- **Disk Footprint Audit:** `local-models/` = `4.5 KB` (weights missing); `local-data/` = `1.5 MB` (1.5 MB manifest rewritten synchronously per synthesis); `public/audio-library/` = `12 MB`; `public/voice-samples/` = `4.2 MB`; `public/voice-pack/` = `8.2 MB`.

**Not Verified (Requires Live Browser / GPU Execution Environment):**
- Client DOM 60 FPS Canvas frame pacing in Chromium during `N = 50/100` simultaneous aircraft + full terrain contours + phosphor trails.
- Real-time `AudioWorklet` / `Web Audio API` buffer underrun metrics under simultaneous speech & DSP load.
- Neural ONNX INT8 inference latency and GPU VRAM usage (blocked in current state by missing `onnx/model_quantized.onnx`).

### 4.9 Mathematical Formulas & Operational Logic Validation

1. **Wind-Corrected Ground Vector (`src/engine/physics.ts:174-194`):**
   - Heading uses aviation clockwise-from-North convention: $\vec{v}_{TAS} = (V_{TAS}\sin\psi,\; V_{TAS}\cos\psi)$.
   - `calculateWindVector()` converts meteorological *"wind FROM $\theta_w$"* into airmass movement direction by adding `180°`: $\vec{w} = (W\sin(\theta_w + 180^\circ),\; W\cos(\theta_w + 180^\circ))$ (`lines 159-160`).
   - Vector addition $\vec{g} = \vec{v}_{TAS} + \vec{w}$ is **mathematically sound for airborne flight**.
   - **Defect Proof (`TAS = 0`):** When stationary on ground (`HOLD_SHORT`/`LINEUP`), $\vec{g} = \vec{0} + \vec{w} = \vec{w}$, producing physical ground drift of $|\vec{w}|\cdot t$ (verified empirically: `0.776 NM` in `60s` @ `15 kt`).
2. **Standard Banked Coordinated Turn Rate (`src/engine/physics.ts:103-138`):**
   - Uses $\omega = \frac{g \tan\phi}{V_{TAS}} \cdot \frac{180}{\pi}$ with $g = 9.80665\,\text{m/s}^2$, `1 kt = 0.514444 m/s`, `maxBank = 25°`, capped at `3.0°/s` (`line 125`).
   - **Validation:** Sound steady-state aeronautical formula; at `220 kt` (`113.18 m/s`), `25°` bank gives $2.315^\circ/\text{s}$ (clamped `< 3.0°/s`); at `140 kt` (`72.02 m/s`), gives $3.638^\circ/\text{s} \to$ capped cleanly at standard `3.0°/s`. Only missing parameter is roll-in/roll-out angular acceleration smoothing.
3. **3D CPA & Quadratic Conflict Window (`src/engine/conflict.ts:46-210`):**
   - $t_{CPA} = -\frac{\vec{r}\cdot\vec{v}}{\|\vec{v}\|^2}$ correctly finds minimum slant range time in 2D planar nautical miles.
   - Quadratic solver $a t^2 + b t + c \le R^2$ with $a = \|\vec{v}\|^2$, $b = 2(\vec{r}\cdot\vec{v})$, $c = \|\vec{r}\|^2 - H_{min}^2$ yields exact continuous entry/exit interval $[t_1, t_2]$, then intersects with linear vertical slab $[t_{v1}, t_{v2}]$ (`|Δh0 + Δvs·t| < V_min`).
   - **Validation:** Exact closed-form analytical solution for constant-velocity trajectories. **Limitation:** Does not project curved turning trajectories (high turn-rate doglegs are approximated linearly along instantaneous velocity vector).
4. **3° ILS Glideslope Geometry (`src/engine/ils.ts`):**
   - $\Delta h = d_{NM} \cdot 6076.115 \cdot \tan(3^\circ) \approx 318.4\;\text{ft/NM}$. Geometry matches standard ICAO/FAA $3^\circ$ glidepath (`~318 ft/NM` vs aviation rule-of-thumb `300–318 ft/NM`).
   - **Defect Proof (Discrete Altitude Quantization):** Required descent rate at `142 kt` is $142 \times \frac{318.4}{60} = 753.5\;\text{fpm}$ (`0.628 ft` per `0.05s` tick). However, `physics.ts:338,417` forces discrete `-1,500 fpm` (`-1.25 ft/tick`) quantized to `-1 ft/tick` (`-1,200 fpm`) interleaved with `0 fpm` ticks, breaking smooth glidepath tracking and failing the `-600 fpm` landing gate.

---

## REPORT B — COMPLETE DEFECT REGISTER

| ID | Severity | Domain | Location (File : Line) | Verified Evidence / Symptom | Root Cause | Impact | Recommended Fix |
|---|---|---|---|---|---|---|---|
| **DEF-001** | **CRITICAL** | Flight Physics | `src/store/simulationStore.ts:2185`; `src/engine/physics.ts:384-391` | Parked `HOLD_SHORT` aircraft under 15 kt wind drifted **0.7760 NM in 60s** (`task-637`) | `tickSimulation` only routes `IAS > 0` departures to takeoff; `IAS === 0` enters wind-vector physics | Stationary planes slide across runways/aprons; takeoff starts off-runway | Guard ground phases (`HOLD_SHORT`, `LINEUP`, `VACATED`) against wind drift; reset to runway threshold on `LINEUP` |
| **DEF-002** | **CRITICAL** | STCA / Radar | `src/engine/conflict.ts:309-311` | Two `HOLD_SHORT` flights at `OIII` (`3,962 ft`) emit **Critical Infringement (`0.0 NM / 0 ft`)** immediately | Airborne filter uses hardcoded MSL `ac.altitude > 150` instead of AGL / ground-phase exclusion | High-elevation airports (`OIII`, `TRN1`) suffer perpetual false sirens & `-20` score loss | Exclude ground flight phases (`HOLD_SHORT`, `LINEUP`, `LANDED`, `VACATED`) and compare `(ac.altitude - airport.elevationFeet) > 150` |
| **DEF-003** | **CRITICAL** | Offline TTS | `local-models/Kokoro-82M-v1.0-ONNX/`; `tests/local_tts_engine.test.ts:70` | `npx vitest run` FAILS: `expected false to be true` (`verifiedOnDisk`) | `onnx/model_quantized.onnx` is missing from `local-models/` (`4.5 KB` total dir) | Real offline Kokoro-82M synthesis unusable; docs report stale green test state | Ship verified `onnx/model_quantized.onnx` offline artifact or provide automated integrity bootstrap + update `TEST_REPORT.md` |
| **DEF-004** | **HIGH** | Flight Physics | `src/engine/physics.ts:417`; `src/engine/takeoff.ts:290` | Measured `+400 ft` vs expected `+333.3 ft` over 10s climb at `2,000 fpm` (**+20% overshoot**) | Every-tick `Math.round(newAltitude)` at `dt=0.05s`; values `< 0.5 ft/tick` (`< 600 fpm`) stall at `0` | Distorted climb/descent timing; low V/S trim stalls completely | Preserve floating-point `altitude` internally in physics state; round only in radar telemetry/UI formatters |
| **DEF-005** | **HIGH** | ILS / Landing | `src/engine/ils.ts:360,418,450-456`; `src/engine/physics.ts:337-354` | Spurious `"UNSTABLE APPROACH"` go-arounds on nominal 3° finals; `FLARE` doesn't flare | Fixed `-1500 fpm` bang-bang descent triggers `< -600 fpm` touchdown rejection | Frustrating unfair landing rejections in bad weather or normal ILS ops | Implement proportional glideslope vertical-speed controller ($\approx \text{GS} \cdot 5.3 + k_p \Delta h$) and flare pitch-out law |
| **DEF-006** | **HIGH** | Security | `server/voiceProfileManager.ts:172-186`; `server/localTtsService.ts:341` | `createProfile` spreads unvalidated `input.id` directly into `path.join(samplesDir, `${id}.wav`)` | Missing strict ID allowlist regex + path containment verification | Arbitrary `.wav` file read/write path traversal outside `voice-samples/` | Enforce `^[a-zA-Z0-9_-]{2,48}$`, whitelist DTO fields (no raw spread), and verify `path.resolve(...)` starts with root |
| **DEF-007** | **HIGH** | Security | `server.ts:49-372` | Destructive `/api/library/unused`, `/api/voices/:id`, `/api/audio/cache` require zero auth | Open Express routes bound to `0.0.0.0:3000` without session/token/rate limit | LAN/external clients can wipe audio assets or DoS CPU via synthesis floods | Add localhost origin check or bearer session secret for mutating `/api/*` admin routes + `express-rate-limit` |
| **DEF-008** | **HIGH** | Audio Concurrency | `src/audio/commsManager.ts:114,390-438` | Multi-frequency `CommsManager` enforces single global `isProcessing` lock | Shared `isProcessing` boolean instead of per-frequency queue state map | Simultaneous Tower & Approach transmissions stall each other sequentially | Replace `isProcessing` with `Map<string, boolean>` keyed by normalized frequency (`119.725`, `134.975`) |
| **DEF-009** | **HIGH** | Performance / I/O | `server/audioCacheManager.ts:130,186`; `server/audioLibraryManager.ts:262,572,606` | Sync `writeFileSync`/`renameSync` on *every* cache hit + full 1.5 MB manifest rewrite 2x per asset | Synchronous file metadata updates on Express main thread | Event loop stalls (`5–40+ ms`) under simultaneous audio requests or batch prewarm | Convert to `fs/promises`, debounce index flush (5s/shutdown), stream WAVs async (`createReadStream`/async buffer) |
| **DEF-010** | **HIGH** | Audio Cache Sync | `src/services/localTtsClient.ts:34`; `server/audioLibraryManager.ts:269-275` | Cache/library keys omit `kokoroVoiceId`, `stability`, and `speed` edits | Keys keyed by `voiceId` + text only; edits in Audio Studio do not invalidate cache | Playing stale speaker voice/speed after editing a voice profile | Include `${kokoroVoiceId}:${speed}:${stability}:${presetVersion}` hash in both client IDB & server keys |
| **DEF-011** | **HIGH** | Performance DB | `src/engine/physics.ts:323-338`; `src/engine/aircraftPerformance.ts` | `physics.ts` hardcodes climb/descent/accel/brake rates; 6 spawned types (`A388,A339,A220,E190,A333,B788`) missing | Physics bypasses `getAircraftPerformance()`, DB missing 6 types | Super `A388` behaves identically to narrowbody `A320` on climb & rollout | Wire `getAircraftPerformance(ac.aircraftType)` into `physics.ts` and add all 6 fleet ICAO types |
| **DEF-012** | **MEDIUM** | Audio Preemption | `src/audio/commsManager.ts:248-256` | `EMERGENCY` priority sets `abortHandle.aborted = true` without stopping active Web Audio node | `enqueue()` does not invoke immediate `audioEngine.stopActive()` on preemption | Mayday readback waits for ongoing clip to complete | Immediately call active playback cancellation hook on `EMERGENCY` preemption when channel busy |
| **DEF-013** | **MEDIUM** | Radar / STCA | `src/engine/conflict.ts:15-20` | Flat `3.0 NM / 1,000 ft` separation ignores wake turbulence (`Heavy` / `Super`) | `DEFAULT_SEPARATION_MINIMA` does not inspect pair `AircraftCategory` or `A380/A388` | Under-separates Heavy/Super in-trail sequences below ICAO safety standards | Compute dynamic pair minima (`4/5/6/8 NM` behind Heavy/Super on final or same track) |
| **DEF-014** | **MEDIUM** | Radar / Terrain | `src/airports/terrain.ts`; `src/engine/conflict.ts` | No Minimum Vectoring Altitude (MVA) / terrain-clearance alert | `terrain.ts` elevation rings are visual-only on `RadarCanvas` | Controllers can vector arrivals into mountain ridges at `OIII`/`TRN1` unwarned | Add terrain grid lookup in STCA issuing Terrain Proximity Warning (`MSAW`) below `elev + 1000 ft` |
| **DEF-015** | **MEDIUM** | Radar Tracker | `src/engine/radarTracker.ts:229-233` | Extrapolates target using magnetic `heading` instead of `groundTrack` | Ignores wind crab angle between 4s antenna sweeps | Predicted phosphor tracks diverge sideways from flight trajectory in crosswinds | Extrapolate using `track` (`groundTrack`) and store `groundTrack` in `RadarObservation` |
| **DEF-016** | **MEDIUM** | Radar / Scope | `src/engine/radarTracker.ts:66`; `src/store/simulationStore.ts:2267` | Traffic despawns / stops tracking at `55 NM` while Radar UI zooms to `140 NM` | Hardcoded `maxRangeNM: 55` limit across store and tracker | Outer `55–140 NM` enroute zoom range appears empty | Align tracker max range & despawn boundary dynamically with `MAX_RANGE_NM` (`~140–150 NM`) |
| **DEF-017** | **MEDIUM** | Takeoff & Scoring | `src/engine/takeoff.ts:255-261`; `src/store/simulationStore.ts:1215` | `clearTakeoff` awards `+2` score immediately; takeoff uses IAS as GS & skips history < 1500 ft | Premature counter update in action handler; takeoff branch skips wind/history | Aborted takeoffs leave inflated score/departure count; jumpy post-1500ft trails | Award departure score upon crossing `1,500 ft AGL` or radar handoff; apply wind vector & history during climb |
| **DEF-018** | **MEDIUM** | SID/STAR Ops | `src/airports/procedures.ts`; `src/engine/physics.ts:246-274`; `trafficGenerator.ts:383` | STAR/SID speed & altitude restrictions ignored; arrivals spawn randomly off-STAR | Procedure metadata unused in autopilot guidance & spawner | Procedural corridors behave like flat 2D lines; unrealistic perimeter arrivals | Enforce waypoint `maxAltitudeFt`/`minAltitudeFt`/`speedLimitKt` vertically & spawn configurable % on STAR IAFs |
| **DEF-019** | **MEDIUM** | Audio / WebAudio | `src/audio/commsManager.ts` (Tier 3) | Tier 3 `window.speechSynthesis` bypasses `vhfRadioDsp.ts` bandpass/compression | Browser security prohibits routing SpeechSynthesis into Web Audio nodes | Sudden jump from authentic scratchy radio to dry crystal-clear OS voice | Prioritize local Kokoro/VoicePack tokenization for all grammar tokens; add warning indicator when OS fallback triggers |
| **DEF-020** | **MEDIUM** | UI / Human Factors | `src/components/TopBar.tsx:66-74` | `UTC` clock displays real wall time rather than simulation time (`simTimeSec`) | `useEffect` reads `new Date()` every 1000ms | Clock never pauses or accelerates at `2x`/`5x` simSpeed | Format clock from store `simTimeSec` relative to scenario UTC start epoch |
| **DEF-021** | **MEDIUM** | UI / Performance | `src/components/RadarCanvas.tsx` | Full vector redraws of terrain polygons/rings/runways on tick; no auto tag deconfliction | Single 2D canvas without static background bitmap cache or label repulsion | Excessive per-frame canvas path tessellation; overlapping tags at FAF/IAF merges | Render static terrain/rings/runways to cached offscreen `<canvas>` invalidated on zoom/pan/layer change; add simple radial label solver |
| **DEF-022** | **MEDIUM** | Backend HTTP | `server.ts:387` | Production `app.get('*')` returns HTML `200 OK` on unknown `/api/*` paths | Missing `/api` 404 guard before SPA history fallback | Client `fetch('/api/...')` JSON parsers throw confusing `SyntaxError: Unexpected token '<'` | Add `app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))` before SPA fallback |
| **DEF-023** | **LOW** | GPU Execution | `server/ttsWorker.ts:64` | Kokoro worker hardcodes `device: 'cpu'` even when NVIDIA GPU exists | CUDA execution provider not wired; only `nvidia-smi` metrics polled | Slow synthesis on GPU-equipped workstations | Detect `cuda`/`dml` ORT support dynamically or document strictly as CPU ONNX runtime |
| **DEF-024** | **LOW** | Dead Code | `src/components/TrafficList.tsx`, `VhfRadioSettingsModal.tsx`, `VoiceEngineModal.tsx`, `VoiceLibraryModal.tsx`; `package.json` | 2,066 lines dead UI modals; unused `@google/genai`, `motion`, `autoprefixer`; `metadata.json` Gemini flag | Leftover legacy components & template metadata after AudioStudio refactor | Bloated maintenance surface, misleading project capabilities, unnecessary npm audit surface | Remove dead UI modals, delete unused deps (`@google/genai`, `motion`, `autoprefixer`), move eslint plugin to `devDependencies`, clean `metadata.json` |
| **DEF-025** | **LOW** | Firebase Telemetry | `src/App.tsx:80`; `src/firebase/config.ts:82` | Mount triggers denied Firestore read to `/test/connection` | Template connection probe violates deny-all `/test` rule | Console/telemetry permission-denied noise on every boot | Remove `/test/connection` probe or rely purely on SDK connectivity/Auth state |
| **DEF-026** | **LOW** | Persistence / Audit | `src/services/persistenceService.ts:260-336`; `firestore.rules` | Client directly computes & persists `certified`, `bestScore`, `completedMissions` | No server-side mission log verification (Cloud Function / signed session digest) | Educated client could fabricate certification score in Firestore | Accept as client-game trust boundary or validate via Cloud Function session event log |

---

## REPORT C — MISSING & INCOMPLETE FEATURES MATRIX

| Feature / Operational Capability | Current State | Operational ATC Significance | Recommended Implementation Scope |
|---|---|---|---|
| **Pre-Generated Offline Kokoro-82M Model Artifact** | Missing `onnx/model_quantized.onnx` on disk (`DEF-003`) | Core promise of live arbitrary callsign/runway offline neural TTS | Bundle or checksum-verified installer for `onnx/model_quantized.onnx` (~88 MB) |
| **Minimum Safe Altitude Warning (MSAW) & MVA Sectors** | Visual terrain contours exist, zero alert logic | Critical safety net preventing CFIT vectors into mountains (`OIII`/`TRN1`) | Sector MVA polygons + height-above-terrain lookahead (30–60s) with audible MSAW alert |
| **Wake Turbulence Separation (RECAT / ICAO)** | Flat `3.0 NM` minima regardless of weight class | Heavy/Super wake encounters cause roll upset on final | Matrix minima (`4/5/6/8 NM`) applied by leading/trailing category & on-final sequencing |
| **Vertical/Speed SID-STAR Constraints** | Stored in schema (`procedures.ts`), skipped by physics | Standard arrivals descend via step-down altitude windows (`AT OR ABOVE`, `AT`) | Autopilot VNAV profile calculating top-of-descent & speed reduction per active leg |
| **Continuous ATIS Broadcast Loop** | Weather state exists, no automated VHF ATIS | Pilots expect Information Alpha/Bravo/Charlie on arrival | Synthesize ATIS bulletin per airport/weather change via dedicated `ATIS` frequency channel |
| **Multi-Frequency Split Audio (`TOWER` / `APPROACH` / `GROUND`)** | Registry tracks roles, `CommsManager` global lock blocks concurrency | Controllers monitor separate active frequencies realistically | Per-frequency queue channels with independent squelch + stereo/channel panning option |
| **Runway Occupancy / Surface Movement Conflict Alert (RIMCAS)** | Ground traffic stops; no runway-incursion logic beyond ILS touchdown check | Prevents clearing takeoff while crossing/vacating traffic occupies active strip | Explicit runway bounding-box occupancy tracker blocking clearances & raising incursion alarm |
| **Simulation Time-Lapse / Black-Box Replay & Debrief** | History trails kept (last 120 pts) only while live; wiped on exit | Essential for ATC training debriefing of STCA errors | Circular event/state snapshot log + timeline scrubber & audio transcript replay |
| **Flight Strip Bay Drag-Ordering & Scratchpad** | Text list exists (`FlightStrips`), lacks tactile bay workflow | Core ATC tool for sequencing arrival/departure order | Interactive draggable electronic flight strips (Pending / Active / Cleared / Handed-Off bays) |
| **GPU Execution Provider Support (`CUDA` / `WebGPU`)** | Telemetry only (`nvidia-smi`), inference forced to `'cpu'` | Speeds batch audio-library synthesis 4–10x on supported hosts | Optional EP selection in worker (`cuda`/`webgpu`/`cpu`) with graceful CPU fallback |

---

## REPORT D — RECOMMENDED TARGET ARCHITECTURE

To eliminate coupling bottlenecks, race conditions, and scaling ceilings (`N >= 100` aircraft), adopt a **4-Layer Decoupled Simulation & Audio Architecture**:

```text
+-------------------------------------------------------------------------+
| 1. PRESENTATION & WORKSTATION LAYER (React 19 UI - Thin Subscribers)    |
|    - Offscreen Canvas Background Buffer (Terrain, Rings, Runways, Grids) |
|    - Foreground Canvas Sweep Layer (Tracks, History Dots, CPA Vectors)  |
|    - Automated Data-Block Repulsion Solver + Drag Override              |
|    - Modular Studio Panels (Split AudioStudio into 6 focused modules)   |
+-------------------------------------------------------------------------+
                                   ^ (Throttled 20Hz Snapshot + UI Intents)
+-------------------------------------------------------------------------+
| 2. SIMULATION WORKER / PURE ENGINE CORE (Web Worker or Headless Loop)   |
|    - Command Dispatcher (Clearances, Headings, Speeds, Hand-offs)       |
|    - Unified Ground/Air Kinematics (Single FCOM PerfDB + Float Alt)     |
|    - Proportional ILS G/S + Flare Controller                            |
|    - VNAV STAR/SID Restriction Solver                                   |
|    - Spatial-Grid STCA + Wake Turbulence + MSAW Terrain Conflict Solver |
|    - Event Bus Emitter ---> Emits Structured Domain Events ONLY:        |
|        { FLIGHT_HANDOFF, STCA_ESCALATED, READBACK_DUE, TOUCHDOWN }      |
+-------------------------------------------------------------------------+
                                   |
                                   v (Subscribes to Domain Events)
+-------------------------------------------------------------------------+
| 3. AUDIO & VHF COMMS LAYER (Independent Per-Frequency Audio Channels)   |
|    - Per-Frequency Priority Queues (Map<freq, ChannelQueue>)            |
|    - Immediate Preemption Controller (AudioEngine.stopChannel(freq))    |
|    - Deterministic Cache Keying (speakerId + speed + stability + text)  |
|    - 7-Stage Web Audio VHF Radio DSP (Stereo/Mono Per-Channel Routing)  |
+-------------------------------------------------------------------------+
                                   | HTTP + Range/Binary Streams (/api/v1/*)
                                   v
+-------------------------------------------------------------------------+
| 4. HARDENED LOCAL AUDIO MICROSERVER (Express + Async Storage + Worker)  |
|    - Bearer Token / Localhost Origin Guard + Path Sanitizer Middleware  |
|    - Async fs/promises + Debounced JSON/SQLite Manifest Store           |
|    - Dynamic ORT Worker (onnx/model_quantized.onnx verified at boot)    |
+-------------------------------------------------------------------------+
```

---

## REPORT E — 4-PHASE DEVELOPMENT ROADMAP

### Phase 1: Safety, Accuracy & Stability Hotfixes (Priority: Immediate)
* **Deliverables:**
  1. Fix `DEF-001` (protect `HOLD_SHORT`/`LINEUP`/`VACATED` from airborne wind drift; threshold alignment on lineup).
  2. Fix `DEF-002` (ground-phase exclusion & AGL field-elevation subtraction in STCA `detectConflicts`).
  3. Fix `DEF-004` & `DEF-005` (remove per-tick `Math.round(altitude)`, build proportional ILS glideslope + flare controller).
  4. Fix `DEF-006`, `DEF-007`, `DEF-022` (sanitize `voiceProfileManager` IDs/paths, secure Express mutating routes, return JSON `404` for unknown `/api/*`).
  5. Fix `DEF-003` (supply verified `onnx/model_quantized.onnx` or explicit offline installer check; reconcile stale `TEST_REPORT.md`).
* **Exit Criteria:** `100%` Vitest green including `tests/local_tts_engine.test.ts`; zero ground drift under 30 kt wind; zero false ground STCA at `OIII`; zero spurious go-arounds on stabilized 3° ILS trials.

### Phase 2: Audio Pipeline & Concurrency Hardening
* **Deliverables:**
  1. Replace `CommsManager` global lock with `Map<frequency, ChannelQueue>` + immediate `AudioBufferSourceNode.stop()` on `EMERGENCY` preemption (`DEF-008`, `DEF-012`).
  2. Eliminate sync file I/O on Express thread (`fs/promises`, debounced cache-index persistence) (`DEF-009`).
  3. Include `kokoroVoiceId + speed + stability` fingerprint in client IndexedDB & server library match keys (`DEF-010`).
  4. Wire `AIRCRAFT_PERFORMANCE_DATABASE` directly into `physics.ts` and add `A388, A339, A220, E190, A333, B788` (`DEF-011`).
* **Exit Criteria:** Concurrent Tower (`119.725`) and Approach (`134.975`) playback without blocking; zero Express event-loop stalls `> 10 ms` during cache bursts.

### Phase 3: Radar Operations, Procedural VNAV & Mission-Critical UI Refactor
* **Deliverables:**
  1. Implement offscreen static terrain/ring canvas buffer (`RadarCanvas`) + automatic tag collision repulsion solver (`DEF-021`), plus true simulation UTC clock (`DEF-020`).
  2. Align tracker range (`140 NM`), switch inter-scan dead reckoning to `groundTrack` (`DEF-015`, `DEF-016`), add ICAO Wake Turbulence separation (`DEF-013`) and MSAW terrain clearance alerts (`DEF-014`).
  3. Enforce STAR/SID altitude & speed limits in autopilot VNAV and align initial departure scoring to lift-off (`>1500 ft AGL`) (`DEF-017`, `DEF-018`).
  4. Prune `2,066` lines of dead UI modals and unused `@google/genai` / `motion` deps; remove `/test/connection` probe (`DEF-024`, `DEF-025`).
* **Exit Criteria:** Smooth 60 FPS radar pan/zoom in Chromium at `N=50` aircraft; automated `eslint`, `tsc`, and Vitest checks green.

### Phase 4: Extensibility, Training Debrief & Fidelity Expansion
* **Deliverables:**
  1. Offload 20 Hz simulation tick & $O(N^2)$ spatial-grid STCA into a Web Worker, decoupling React state churn.
  2. Split `AudioStudioModal.tsx` (`3,087` lines) and `RadarCanvas.tsx` (`2,350` lines) into focused sub-modules.
  3. Add continuous synthesized ATIS broadcast, runway incursion monitoring (RIMCAS), draggable electronic flight strips, and black-box scenario replay/debrief.
  4. Add optional CUDA/WebGPU execution provider detection for Kokoro worker.

---

## REPORT F — TESTING AND VERIFICATION STRATEGY

1. **Deterministic Simulation Property Tests (Vitest / Node):**
   - **Invariant Assertions:** Every PR must validate zero `HOLD_SHORT` displacement over 120s under 40 kt crosswind; 2,000 fpm climb deviation `< ±1.5%` over 60s; stabilized 3° ILS glideslope sink rate within `[-900, -650] fpm` tapering smoothly to `[-220, -140] fpm` at touchdown (`AGL < 50 ft`); zero ground STCA conflicts across all 5 airports (`EGLL`, `OIII`, `KJFK`, `TRN1`, `TRN2`).
2. **Backend Security & Filesystem Fuzz Tests:**
   - Automated supertest/Vitest suite firing path-traversal strings (`../`, `%2e%2e`, null bytes) into `/api/voices` & `/api/library`, verifying HTTP `400/403` rejection, unauthenticated mutating access rejection, and non-blocking async cache throughput under 50 concurrent hits.
3. **Offline TTS & Audio DSP Regression Tests:**
   - Checksum verification for `onnx/model_quantized.onnx` on disk (`local-models/`), cache invalidation test verifying voice edit triggers regeneration rather than stale hit, and multi-frequency non-blocking queue tests (`119.725` + `134.975` concurrently + immediate `EMERGENCY` interrupt latency `< 20 ms`).
4. **End-to-End Browser & Rendering Benchmarks (Playwright + Chromium):**
   - Measure actual canvas FPS, p95 frame time, and React commit duration at `N = 10, 30, 50, 100` aircraft, verify zero `pageerror`/Firestore permission-denied logs at boot, and smoke-test Web Audio `AudioContext` state transitions offline (`network: offline` mode in Playwright).

---

## REPORT G — PROJECT QUALITY SCORE (0–100) & TOP 20 PRIORITIZED ACTIONS

### Weighted Quality Score Breakdown: **64 / 100**

| Engineering Dimension | Weight | Score | Weighted Contribution | Rationale Based on Verified Code & Runtime Evidence |
|---|---|---|---|---|
| **Architecture & Modularity** | 15% | 68 | 10.20 | Pure `src/engine/*` & `src/audio/*` separation is strong, offset by 2,340-LOC Zustand monolith, 3,087-LOC UI modal, and 2,066 LOC dead UI components. |
| **ATC & Flight Simulation Accuracy** | 20% | 52 | 10.40 | Sound wind/turn/CPA math undermined by `HOLD_SHORT` wind drift (`0.776 NM`), integer altitude `+20%` error, bang-bang ILS go-arounds, `OIII` ground STCA bugs, and bypassed performance DB. |
| **Audio, VHF DSP & Local TTS** | 15% | 62 | 9.30 | Exceptional 7-stage Web Audio VHF DSP and ICAO grammar, penalized by missing `model_quantized.onnx` on disk, global freq lock, sync server disk I/O, and cache invalidation bugs. |
| **UI/UX & Mission-Critical Ergonomics** | 15% | 74 | 11.10 | Strong radar scope tooling, pre-flight workflow, and rich Audio Studio; needs offscreen static caching, auto label deconfliction, and sim-coupled UTC clock. |
| **Security & Persistence** | 15% | 55 | 8.25 | Strict `firestore.rules` schema validation & owner scoping, severely offset by open `/api/*` admin endpoints and `voiceProfileManager` `.wav` path traversal risk. |
| **Performance & Scalability** | 10% | 72 | 7.20 | Pure engine runs `N=100` ticks in `1.32 ms` avg; degraded by quadratic $O(N^2)$ STCA, history slicing GC spikes, and sync Express `writeFileSync` hits. |
| **Code Quality & Test Hygiene** | 10% | 75 | 7.50 | Zero TypeScript errors, 136/137 passing tests, real telemetry; dragged down by 1 failing model-verification test, stale `TEST_REPORT.md`, unused deps, and dead modals. |
| **TOTAL SCORE** | **100%** | — | **64 / 100** | *Solid functional prototype & impressive UI/DSP foundation requiring targeted safety, physics, security, and offline-asset remediation.* |

---

### Top 20 Prioritized Recommended Actions

1. **[P0 - Safety/Physics]** Freeze ground phases (`HOLD_SHORT`, `LINEUP`, `VACATED`) in `simulationStore.ts`/`physics.ts` so stationary aircraft never drift with wind (`DEF-001`).
2. **[P0 - Safety/STCA]** Update `detectConflicts()` (`conflict.ts:309`) to exclude ground phases and compute AGL height relative to `airport.elevationFeet` to eliminate `OIII` false alerts (`DEF-002`).
3. **[P0 - Offline Core]** Restore or verify `local-models/Kokoro-82M-v1.0-ONNX/onnx/model_quantized.onnx` so `tests/local_tts_engine.test.ts` passes (`137/137`) and real neural TTS works offline (`DEF-003`).
4. **[P0 - Security]** Lock down `VoiceProfileManager.createProfile()` ID validation (`^[a-zA-Z0-9_-]{2,48}$`) + containment checks against path traversal (`DEF-006`).
5. **[P0 - Security]** Protect mutating `/api/*` routes with localhost/session auth + rate limiting (`DEF-007`) and add JSON 404 middleware before SPA fallback (`DEF-022`).
6. **[P1 - Physics]** Remove per-tick `Math.round(newAltitude)` inside `physics.ts`/`takeoff.ts`; round only on display formatting (`DEF-004`).
7. **[P1 - ILS]** Replace ILS glideslope bang-bang descent with proportional V/S glideslope capture + smooth flare law `< 50 ft AGL` (`DEF-005`).
8. **[P1 - Performance]** Convert synchronous `fs.*Sync` disk calls in `audioCacheManager.ts` and `audioLibraryManager.ts` to async `fs/promises` + debounced index persistence (`DEF-009`).
9. **[P1 - Audio Bugs]** Fix `CommsManager` global lock (`isProcessing` → per-frequency `Map`) and immediately halt active `AudioBufferSourceNode` on `EMERGENCY` preemption (`DEF-008`, `DEF-012`).
10. **[P1 - Audio Cache]** Add `kokoroVoiceId`, `speed`, and `stability` to client IndexedDB and server library match keys (`DEF-010`).
11. **[P1 - Physics/Perf]** Wire `getAircraftPerformance(ac.aircraftType)` into `stepAircraftPhysics()` and populate missing `A388, A339, A220, E190, A333, B788` specs (`DEF-011`).
12. **[P2 - ATC Ops]** Implement ICAO Wake Turbulence separation (`4/5/6/8 NM`) behind `Heavy`/`Super` aircraft in `conflict.ts` (`DEF-013`).
13. **[P2 - Safety/Terrain]** Integrate `terrain.ts` elevations into STCA to emit Minimum Safe Altitude Warnings (MSAW) (`DEF-014`).
14. **[P2 - Radar Accuracy]** Extrapolate `RadarTrackingEngine` using `groundTrack` instead of `heading` (`DEF-015`) and align `55 NM` tracker/despawn cutoff with `140 NM` UI range (`DEF-016`).
15. **[P2 - Ops/Procedures]** Enforce STAR/SID `minAltitudeFt`/`maxAltitudeFt`/`speedLimitKt` restrictions in VNAV and award departure score after `1,500 ft AGL` climbout (`DEF-017`, `DEF-018`).
16. **[P2 - UI/UX Performance]** Cache static radar terrain, rings, and runways into an offscreen `<canvas>` layer and add automatic 3-line tag de-confliction (`DEF-021`).
17. **[P2 - UI/UX Accuracy]** Drive `TopBar` UTC clock from `simTimeSec` so it respects pause and `2x/5x` simulation speeds (`DEF-020`).
18. **[P3 - Code Hygiene]** Delete 2,066 lines of dead UI modals (`TrafficList`, `VhfRadioSettingsModal`, `VoiceEngineModal`, `VoiceLibraryModal`), uninstall `@google/genai`, `motion`, `autoprefixer`, and clean `metadata.json` (`DEF-024`).
19. **[P3 - Firebase Hygiene]** Remove denied `/test/connection` probe from `App.tsx:80` / `firebase/config.ts` (`DEF-025`) and document client-trust boundary or add Cloud Functions attestation (`DEF-026`).
20. **[P3 - Architecture]** Move 20 Hz simulation loop + spatial-grid STCA to a dedicated Web Worker and refresh `docs/TEST_REPORT.md` to match verified test/model status.
