/**
 * SKYCONTROL - Pre-Generated Offline Audio Library Builder CLI
 * Generates local PCM-16 WAV files via Kokoro-82M into public/audio-library/<voiceId>/<phraseId>.wav
 * and populates local-data/audio-library-manifest.json with full quality & SHA-256 telemetry.
 *
 * Usage:
 *   npx tsx scripts/build_audio_library.ts --core   # Builds complete 24-category + 15-voice core pack
 *   npx tsx scripts/build_audio_library.ts --all    # Builds the entire catalog x 15-voice matrix
 *   npx tsx scripts/build_audio_library.ts --scan   # Scans disk integrity & prints manifest report
 */

import { AUDIO_LIBRARY_CATALOG, getCatalogCategories } from '../shared/audioLibraryCatalog';
import { LocalTtsService } from '../server/localTtsService';

function selectCoreAssetIds(service: LocalTtsService): string[] {
  const profiles = service.profileManager.listProfiles();
  const categories = getCatalogCategories();
  const picked = new Set<string>();

  // 1. Guarantee 100% category coverage across all 24 categories:
  //    - Generate EVERY item in B_digits (0-9 + drill), C_nato_alphabet (Alpha-Zulu + drill), D_comm_templates
  //    - Generate the primary canonical phrase of every A & B category on the fitting primary profile
  for (const cat of categories) {
    const items = AUDIO_LIBRARY_CATALOG.filter(i => i.category === cat);
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const includeAllInCat =
        cat === 'numbers_digits' ||
        cat === 'nato_alphabet' ||
        cat === 'comm_templates';
      if (!includeAllInCat && idx > 0) continue;

      const voiceId =
        item.recommendedRole === 'PILOT'
          ? 'pilot_thomas'
          : cat === 'taxi_instructions'
            ? 'ground_puck'
            : cat === 'heading_instructions' || cat === 'holding_instructions' || cat === 'traffic_information'
              ? 'approach_zephyr'
              : 'tower_charon';

      picked.add(`${voiceId}__${item.phraseId}`);
    }
  }

  // 2. Guarantee EVERY one of the 15 voice profiles has pre-generated WAV assets in the library
  for (const profile of profiles) {
    const signaturePhraseId =
      profile.voiceType === 'PILOT'
        ? 'pilot_rb_wilco_roger'
        : profile.voiceType === 'GROUND'
          ? 'atc_taxi_to_holding_point'
          : profile.voiceType === 'APPROACH'
            ? 'atc_init_radar_contact'
            : 'atc_takeoff_cleared';

    picked.add(`${profile.id}__${signaturePhraseId}`);
  }

  return Array.from(picked);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const mode = args.has('--all') ? 'all' : args.has('--scan') ? 'scan' : 'core';
  const force = args.has('--force');

  const service = new LocalTtsService();
  console.log(`[AudioLibraryBuilder] Mode: ${mode.toUpperCase()} | Force: ${force}`);

  if (mode === 'scan') {
    const report = service.libraryManager.scanIntegrity();
    console.log(JSON.stringify(report, null, 2));
    await service.queue.shutdown();
    return;
  }

  await service.queue.ensureModelLoaded();

  let targetAssetIds: string[];
  if (mode === 'all') {
    targetAssetIds = service.libraryManager
      .selectBulkTargets({ scope: 'all', force })
      .map(e => e.assetId);
  } else {
    targetAssetIds = selectCoreAssetIds(service);
  }

  console.log(`[AudioLibraryBuilder] Targeting ${targetAssetIds.length} audio assets...`);
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < targetAssetIds.length; i++) {
    const assetId = targetAssetIds[i];
    const existing = service.libraryManager.getAsset(assetId);
    if (!existing) continue;

    if (!force && existing.status === 'ready') {
      const hasBuf = service.libraryManager.getAssetAudioBuffer(assetId);
      if (hasBuf) {
        skipped += 1;
        continue;
      }
    }

    try {
      const updated = await service.libraryManager.generateAsset(assetId, force, 'normal');
      generated += 1;
      console.log(
        `  [${i + 1}/${targetAssetIds.length}] READY ${assetId} (${updated.duration.toFixed(2)}s, ${Math.round(
          updated.sizeBytes / 1024
        )} KB, SNR ${updated.quality?.snrEstimateDb ?? '-'}dB)`
      );
    } catch (err) {
      failed += 1;
      console.error(`  [${i + 1}/${targetAssetIds.length}] FAILED ${assetId}:`, err);
    }
  }

  const report = service.libraryManager.scanIntegrity();
  console.log('\n[AudioLibraryBuilder] Integrity Summary:', {
    totalAssets: report.totalAssets,
    readyCount: report.readyCount,
    missingCount: report.missingCount,
    corruptCount: report.corruptCount,
    duplicatesCount: report.duplicates.length,
    generatedThisRun: generated,
    skippedExisting: skipped,
    failedThisRun: failed,
  });

  await service.queue.shutdown();
}

void main();
