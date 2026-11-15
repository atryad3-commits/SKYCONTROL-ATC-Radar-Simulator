/**
 * SKYCONTROL - Local Voice Profile Manager
 * Manages up to 15 genuinely distinct neural speaker profiles (10 Pilot, 3 Tower, 1 Approach, 1 Ground)
 * with local JSON persistence, parameter validation, and role/callsign routing.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_VOICE_PROFILES,
  MAX_VOICE_PROFILES,
  VoiceProfile,
  VoiceProfileUpdatePatch,
  VoiceType,
} from '../shared/ttsTypes';

const VALID_KOKORO_VOICES = new Set([
  'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore',
  'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam',
  'am_michael', 'am_onyx', 'am_puck', 'am_santa',
  'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily',
  'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
]);

const AIRLINE_PREFERRED_PILOTS: Record<string, readonly string[]> = {
  BAW: ['pilot_thomas', 'pilot_libby', 'pilot_alice', 'pilot_daniel', 'pilot_clara', 'pilot_brian'],
  VIR: ['pilot_libby', 'pilot_alice', 'pilot_thomas', 'pilot_clara', 'pilot_nova', 'pilot_daniel'],
  EZY: ['pilot_libby', 'pilot_thomas', 'pilot_connor', 'pilot_alice', 'pilot_nova', 'pilot_daniel'],
  AAL: ['pilot_brian', 'pilot_clara', 'pilot_liam', 'pilot_nova', 'pilot_thomas', 'pilot_prabhat'],
  DAL: ['pilot_clara', 'pilot_brian', 'pilot_nova', 'pilot_liam', 'pilot_libby', 'pilot_thomas'],
  UAL: ['pilot_liam', 'pilot_brian', 'pilot_clara', 'pilot_nova', 'pilot_connor', 'pilot_thomas'],
  IRA: ['pilot_prabhat', 'pilot_daniel', 'pilot_connor', 'pilot_clara', 'pilot_thomas', 'pilot_alice'],
  UAE: ['pilot_prabhat', 'pilot_alice', 'pilot_clara', 'pilot_brian', 'pilot_connor', 'pilot_thomas'],
  QTR: ['pilot_prabhat', 'pilot_daniel', 'pilot_libby', 'pilot_brian', 'pilot_nova', 'pilot_thomas'],
  THY: ['pilot_connor', 'pilot_prabhat', 'pilot_clara', 'pilot_thomas', 'pilot_liam', 'pilot_libby'],
  AFR: ['pilot_nova', 'pilot_clara', 'pilot_connor', 'pilot_libby', 'pilot_alice', 'pilot_brian'],
  DLH: ['pilot_connor', 'pilot_brian', 'pilot_thomas', 'pilot_daniel', 'pilot_clara', 'pilot_libby'],
  SWR: ['pilot_clara', 'pilot_alice', 'pilot_connor', 'pilot_thomas', 'pilot_brian', 'pilot_daniel'],
  KLM: ['pilot_daniel', 'pilot_libby', 'pilot_connor', 'pilot_thomas', 'pilot_brian', 'pilot_nova'],
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export class VoiceProfileManager {
  private readonly storePath: string;
  private profiles: VoiceProfile[] = [];

  constructor(dataDir: string = path.resolve(process.cwd(), 'local-data')) {
    this.storePath = path.join(dataDir, 'voice-profiles.json');
    this.loadOrInit();
  }

  private loadOrInit() {
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
      if (fs.existsSync(this.storePath)) {
        const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
        if (Array.isArray(raw) && raw.length > 0 && raw.length <= MAX_VOICE_PROFILES) {
          this.profiles = raw.slice(0, MAX_VOICE_PROFILES);
          return;
        }
      }
    } catch (err) {
      console.warn('[VoiceProfileManager] Failed to load saved profiles, resetting to defaults:', err);
    }
    this.profiles = DEFAULT_VOICE_PROFILES.map(p => ({
      ...p,
      voiceConfig: { ...p.voiceConfig },
    }));
    this.save();
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
      fs.writeFileSync(this.storePath, JSON.stringify(this.profiles, null, 2), 'utf8');
    } catch (err) {
      console.error('[VoiceProfileManager] Failed to persist profiles:', err);
    }
  }

  public listProfiles(): VoiceProfile[] {
    return this.profiles.map(p => ({ ...p, voiceConfig: { ...p.voiceConfig } }));
  }

  public getProfile(id: string): VoiceProfile | undefined {
    const found = this.profiles.find(p => p.id === id);
    return found ? { ...found, voiceConfig: { ...found.voiceConfig } } : undefined;
  }

  public getAvailableKokoroVoices(): string[] {
    return Array.from(VALID_KOKORO_VOICES);
  }

  public updateProfile(id: string, patch: VoiceProfileUpdatePatch): VoiceProfile {
    const idx = this.profiles.findIndex(p => p.id === id);
    if (idx === -1) {
      throw new Error(`Voice profile "${id}" not found`);
    }

    const current = this.profiles[idx];

    if (patch.enabled === false) {
      const sameRoleEnabled = this.profiles.filter(
        p => p.id !== id && p.enabled && p.voiceType === current.voiceType
      );
      const anyAtcEnabled = this.profiles.filter(
        p => p.id !== id && p.enabled && p.voiceType !== 'PILOT'
      );
      if (current.voiceType === 'PILOT' && sameRoleEnabled.length === 0) {
        throw new Error('At least one PILOT voice profile must remain enabled.');
      }
      if (current.voiceType !== 'PILOT' && anyAtcEnabled.length === 0) {
        throw new Error('At least one ATC controller voice profile must remain enabled.');
      }
    }

    if (
      patch.voiceConfig?.kokoroVoiceId &&
      !VALID_KOKORO_VOICES.has(patch.voiceConfig.kokoroVoiceId)
    ) {
      throw new Error(`Unsupported Kokoro neural speaker: ${patch.voiceConfig.kokoroVoiceId}`);
    }

    const updated: VoiceProfile = {
      ...current,
      displayName: patch.displayName?.trim() || current.displayName,
      shortLabel: patch.shortLabel?.trim() || current.shortLabel,
      speed:
        typeof patch.speed === 'number' && !Number.isNaN(patch.speed)
          ? Number(clamp(patch.speed, 0.7, 1.4).toFixed(2))
          : current.speed,
      pitch:
        typeof patch.pitch === 'number' && !Number.isNaN(patch.pitch)
          ? Number(clamp(patch.pitch, 0.8, 1.2).toFixed(2))
          : current.pitch,
      stability:
        typeof patch.stability === 'number' && !Number.isNaN(patch.stability)
          ? Number(clamp(patch.stability, 0.0, 1.0).toFixed(2))
          : current.stability,
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
      voiceConfig: {
        ...current.voiceConfig,
        ...(patch.voiceConfig || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    this.profiles[idx] = updated;
    this.save();
    return { ...updated, voiceConfig: { ...updated.voiceConfig } };
  }

  public createProfile(
    input: Omit<VoiceProfile, 'updatedAt' | 'sampleAudioUrl'> & { sampleAudioUrl?: string }
  ): VoiceProfile {
    if (this.profiles.length >= MAX_VOICE_PROFILES) {
      throw new Error(`Maximum limit of ${MAX_VOICE_PROFILES} voice profiles reached.`);
    }
    if (!input.id || this.profiles.some(p => p.id === input.id)) {
      throw new Error(`Voice profile ID "${input.id}" is invalid or already exists.`);
    }
    if (!VALID_KOKORO_VOICES.has(input.voiceConfig.kokoroVoiceId)) {
      throw new Error(`Unsupported Kokoro voice ID: ${input.voiceConfig.kokoroVoiceId}`);
    }

    const created: VoiceProfile = {
      ...input,
      speed: clamp(input.speed ?? 1.14, 0.7, 1.4),
      pitch: clamp(input.pitch ?? 1.0, 0.8, 1.2),
      stability: clamp(input.stability ?? 0.85, 0.0, 1.0),
      sampleAudioUrl: input.sampleAudioUrl || `/voice-samples/${input.id}.wav`,
      updatedAt: new Date().toISOString(),
    };

    this.profiles.push(created);
    this.save();
    return { ...created, voiceConfig: { ...created.voiceConfig } };
  }

  public deleteProfile(id: string): void {
    const target = this.profiles.find(p => p.id === id);
    if (!target) {
      throw new Error(`Voice profile "${id}" not found`);
    }
    if (this.profiles.length <= 2) {
      throw new Error('Cannot delete remaining voice profiles.');
    }
    const next = this.profiles.filter(p => p.id !== id);
    if (!next.some(p => p.enabled && p.voiceType === 'PILOT')) {
      throw new Error('At least one enabled PILOT voice profile must remain.');
    }
    if (!next.some(p => p.enabled && p.voiceType !== 'PILOT')) {
      throw new Error('At least one enabled ATC voice profile must remain.');
    }
    this.profiles = next;
    this.save();
  }

  public resetToDefaults(): VoiceProfile[] {
    this.profiles = DEFAULT_VOICE_PROFILES.map(p => ({
      ...p,
      voiceConfig: { ...p.voiceConfig },
      updatedAt: new Date().toISOString(),
    }));
    this.save();
    return this.listProfiles();
  }

  /**
   * Resolves an enabled controller voice for TOWER / APPROACH / GROUND roles.
   */
  public resolveControllerProfile(
    voiceType: Exclude<VoiceType, 'PILOT'> = 'TOWER',
    preferredId?: string
  ): VoiceProfile {
    if (preferredId) {
      const exact = this.profiles.find(p => p.id === preferredId && p.enabled && p.voiceType !== 'PILOT');
      if (exact) return exact;
      // Support legacy short IDs ('charon', 'fenrir', 'kore', 'zephyr', 'puck')
      const legacyMatch = this.profiles.find(
        p =>
          p.enabled &&
          p.voiceType !== 'PILOT' &&
          (p.id.endsWith(`_${preferredId}`) || p.voiceConfig.legacyPackId === `tower_${preferredId}`)
      );
      if (legacyMatch) return legacyMatch;
    }

    const byRole = this.profiles.find(p => p.voiceType === voiceType && p.enabled);
    if (byRole) return byRole;

    const anyAtc = this.profiles.find(p => p.voiceType !== 'PILOT' && p.enabled);
    return anyAtc || this.profiles[0];
  }

  /**
   * Resolves a genuinely distinct enabled pilot voice profile for a flight callsign,
   * spreading active traffic across all enabled Pilot voices (up to 10 distinct speakers).
   */
  public resolvePilotProfile(
    callsign: string,
    activeCallsigns?: string[],
    airlinePrefix?: string
  ): VoiceProfile {
    const enabledPilots = this.profiles.filter(p => p.voiceType === 'PILOT' && p.enabled);
    const pool = enabledPilots.length > 0 ? enabledPilots : this.profiles;
    const poolIds = pool.map(p => p.id);

    const cleanCs = callsign.trim().toUpperCase();
    const prefix = (airlinePrefix || cleanCs.slice(0, 3)).toUpperCase();
    const preferred = (AIRLINE_PREFERRED_PILOTS[prefix] || []).filter(id => poolIds.includes(id));
    const order = preferred.length > 0 ? [...preferred, ...poolIds.filter(id => !preferred.includes(id))] : poolIds;

    if (activeCallsigns && activeCallsigns.length > 0) {
      const used = new Set<string>();
      for (const acCs of activeCallsigns) {
        const norm = acCs.trim().toUpperCase();
        const acPref = norm.slice(0, 3);
        const acOrder =
          (AIRLINE_PREFERRED_PILOTS[acPref] || []).filter(id => poolIds.includes(id)).length > 0
            ? [
                ...(AIRLINE_PREFERRED_PILOTS[acPref] || []).filter(id => poolIds.includes(id)),
                ...poolIds,
              ]
            : poolIds;

        let picked = acOrder[hashString(norm) % acOrder.length];
        if (used.has(picked)) {
          const unused = acOrder.find(id => !used.has(id));
          if (unused) picked = unused;
        }
        used.add(picked);
        if (norm === cleanCs) {
          return pool.find(p => p.id === picked) || pool[0];
        }
      }
    }

    const pickedId = order[hashString(cleanCs) % order.length];
    return pool.find(p => p.id === pickedId) || pool[0];
  }
}
