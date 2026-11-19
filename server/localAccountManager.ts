/**
 * SKYCONTROL - Offline Local Controller Account Manager (Zero Internet Required)
 * Persists salted scrypt credentials, active session tokens, career profiles,
 * radar/audio preferences, activity logbooks, and custom scenarios per user
 * atomically inside local-data/local-accounts.json.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  ActivityEntry,
  CustomScenarioConfig,
  MissionId,
  UserPreferencesData,
  UserProfileData,
} from '../src/types';

interface StoredLocalAccount {
  uid: string;
  identifier: string; // normalized lowercase email or username
  passwordSalt: string;
  passwordHash: string;
  profile: UserProfileData;
  preferences: UserPreferencesData | null;
  activities: ActivityEntry[];
  scenarios: CustomScenarioConfig[];
  createdAt: string;
  updatedAt: string;
}

interface StoredLocalSession {
  token: string;
  uid: string;
  createdAt: string;
}

interface LocalAccountsDbFile {
  version: number;
  accounts: Record<string, StoredLocalAccount>; // keyed by uid
  sessions: Record<string, StoredLocalSession>; // keyed by token
}

const ALL_MISSIONS: MissionId[] = [
  'mission_1',
  'mission_2',
  'mission_3',
  'mission_4',
  'mission_5',
];

function sanitizeCallsign(raw: string): string {
  const trimmed = raw.trim().slice(0, 32);
  return trimmed.length >= 2 ? trimmed : 'ATC-LOCAL';
}

function normalizeIdentifier(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 100);
}

function hashPasswordScrypt(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPasswordScrypt(password: string, salt: string, expectedHex: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function generateCertificateId(uid: string): string {
  const suffix = uid.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'LOCAL1';
  const stamp = new Date().getFullYear().toString().slice(-2);
  const seq = Math.floor(1000 + Math.random() * 8999);
  return `SKY-${stamp}-${suffix}-${seq}`;
}

export class LocalAccountManager {
  private readonly dbPath: string;
  private state: LocalAccountsDbFile = {
    version: 1,
    accounts: {},
    sessions: {},
  };

  constructor(dataDir: string = path.resolve(process.cwd(), 'local-data')) {
    this.dbPath = path.join(dataDir, 'local-accounts.json');
    fs.mkdirSync(dataDir, { recursive: true });
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.dbPath)) {
      this.save();
      return;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.dbPath, 'utf8')) as Partial<LocalAccountsDbFile>;
      this.state = {
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        accounts: parsed.accounts && typeof parsed.accounts === 'object' ? parsed.accounts : {},
        sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
      };
    } catch {
      this.state = { version: 1, accounts: {}, sessions: {} };
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const tmp = `${this.dbPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, this.dbPath);
  }

  private findAccountByIdentifier(identifier: string): StoredLocalAccount | undefined {
    const norm = normalizeIdentifier(identifier);
    return Object.values(this.state.accounts).find(acc => acc.identifier === norm);
  }

  public resolveSessionUid(token?: string | null): string | null {
    if (!token) return null;
    const sess = this.state.sessions[token.trim()];
    if (!sess) return null;
    if (!this.state.accounts[sess.uid]) {
      delete this.state.sessions[token.trim()];
      this.save();
      return null;
    }
    return sess.uid;
  }

  public registerAccount(params: {
    identifier: string;
    password: string;
    callsign: string;
  }): { token: string; profile: UserProfileData } {
    const identifier = normalizeIdentifier(params.identifier || '');
    if (identifier.length < 3 || /\s/.test(identifier)) {
      throw new Error('Username or email must be at least 3 characters with no spaces.');
    }
    if (!params.password || params.password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }
    if (this.findAccountByIdentifier(identifier)) {
      throw new Error('An offline account already exists for this email/username. Sign in instead.');
    }

    const callsign = sanitizeCallsign(params.callsign || identifier.split('@')[0] || 'ATC-LOCAL');
    const uid = `local_${crypto.createHash('sha256').update(`${identifier}:${Date.now()}`).digest('hex').slice(0, 16)}`;
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPasswordScrypt(params.password, salt);
    const now = new Date().toISOString();

    const profile: UserProfileData = {
      uid,
      callsign,
      authProvider: 'offline',
      email: identifier,
      emailVerified: true,
      certified: false,
      completedMissions: [],
      totalLandings: 0,
      totalDepartures: 0,
      totalGoArounds: 0,
      totalViolations: 0,
      totalFlightSeconds: 0,
      sessionsCompleted: 0,
      bestScore: 0,
    };

    this.state.accounts[uid] = {
      uid,
      identifier,
      passwordSalt: salt,
      passwordHash,
      profile,
      preferences: null,
      activities: [],
      scenarios: [],
      createdAt: now,
      updatedAt: now,
    };

    const token = crypto.randomBytes(24).toString('hex');
    this.state.sessions[token] = { token, uid, createdAt: now };
    this.save();

    return { token, profile };
  }

  public loginAccount(params: {
    identifier: string;
    password: string;
  }): { token: string; profile: UserProfileData } {
    const identifier = normalizeIdentifier(params.identifier || '');
    if (!identifier || !params.password) {
      throw new Error('Please enter both your offline email/username and password.');
    }

    const acc = this.findAccountByIdentifier(identifier);
    if (!acc || !verifyPasswordScrypt(params.password, acc.passwordSalt, acc.passwordHash)) {
      throw new Error('Invalid offline email/username or password.');
    }

    const token = crypto.randomBytes(24).toString('hex');
    this.state.sessions[token] = {
      token,
      uid: acc.uid,
      createdAt: new Date().toISOString(),
    };
    this.save();

    return { token, profile: acc.profile };
  }

  public logoutSession(token?: string | null): void {
    if (!token) return;
    if (this.state.sessions[token.trim()]) {
      delete this.state.sessions[token.trim()];
      this.save();
    }
  }

  public getSessionBundle(token?: string | null): {
    profile: UserProfileData;
    preferences: UserPreferencesData | null;
    activities: ActivityEntry[];
    scenarios: CustomScenarioConfig[];
  } | null {
    const uid = this.resolveSessionUid(token);
    if (!uid) return null;
    const acc = this.state.accounts[uid];
    if (!acc) return null;
    return {
      profile: acc.profile,
      preferences: acc.preferences,
      activities: [...acc.activities].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      scenarios: [...acc.scenarios].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
    };
  }

  public updateCallsign(uid: string, rawCallsign: string): UserProfileData {
    const acc = this.state.accounts[uid];
    if (!acc) throw new Error('Offline account not found.');
    acc.profile = {
      ...acc.profile,
      callsign: sanitizeCallsign(rawCallsign),
    };
    acc.updatedAt = new Date().toISOString();
    this.save();
    return acc.profile;
  }

  public getPreferences(uid: string): UserPreferencesData | null {
    const acc = this.state.accounts[uid];
    if (!acc) throw new Error('Offline account not found.');
    return acc.preferences;
  }

  public savePreferences(uid: string, prefs: UserPreferencesData): UserPreferencesData {
    const acc = this.state.accounts[uid];
    if (!acc) throw new Error('Offline account not found.');
    acc.preferences = { ...prefs, uid };
    acc.updatedAt = new Date().toISOString();
    this.save();
    return acc.preferences;
  }

  public listActivities(uid: string, maxItems: number = 50): ActivityEntry[] {
    const acc = this.state.accounts[uid];
    if (!acc) throw new Error('Offline account not found.');
    return [...acc.activities]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, Math.min(100, maxItems)));
  }

  public recordActivityAndStats(
    uid: string,
    entryInput: Omit<ActivityEntry, 'id' | 'uid' | 'createdAt'>
  ): { updatedProfile: UserProfileData; entry: ActivityEntry; newlyCertified: boolean } {
    const acc = this.state.accounts[uid];
    if (!acc) throw new Error('Offline account not found.');

    const now = new Date().toISOString();
    const actId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const entry: ActivityEntry = {
      ...entryInput,
      id: actId,
      uid,
      createdAt: now,
    };

    acc.activities = [entry, ...acc.activities].slice(0, 100);

    const isMissionPass = entryInput.kind === 'mission_pass' && entryInput.missionId;
    const nextMissions = isMissionPass
      ? Array.from(new Set([...acc.profile.completedMissions, entryInput.missionId!]))
          .filter(m => ALL_MISSIONS.includes(m))
          .slice(0, 5)
      : acc.profile.completedMissions;

    const wasCertified = acc.profile.certified;
    const allComplete = ALL_MISSIONS.every(m => nextMissions.includes(m)) || wasCertified;
    const newlyCertified = !wasCertified && allComplete;

    const certId = allComplete
      ? acc.profile.certificateId || generateCertificateId(uid)
      : acc.profile.certificateId;
    const issuedAt = allComplete ? acc.profile.issuedAt || now : acc.profile.issuedAt;

    const updatedProfile: UserProfileData = {
      ...acc.profile,
      completedMissions: nextMissions,
      certified: allComplete,
      certificateId: certId,
      issuedAt,
      totalLandings: Math.min(100000, acc.profile.totalLandings + (entryInput.landings || 0)),
      totalDepartures: Math.min(100000, acc.profile.totalDepartures + (entryInput.departures || 0)),
      totalGoArounds: Math.min(100000, acc.profile.totalGoArounds + (entryInput.goArounds || 0)),
      totalViolations: Math.min(100000, acc.profile.totalViolations + (entryInput.violations || 0)),
      totalFlightSeconds: Math.min(
        10000000,
        acc.profile.totalFlightSeconds + (entryInput.durationSeconds || 0)
      ),
      sessionsCompleted: Math.min(100000, acc.profile.sessionsCompleted + 1),
      bestScore: Math.max(acc.profile.bestScore, entryInput.score || 0),
    };

    acc.profile = updatedProfile;
    acc.updatedAt = now;
    this.save();

    return { updatedProfile, entry, newlyCertified };
  }

  public deleteActivity(uid: string, activityId: string): void {
    const acc = this.state.accounts[uid];
    if (!acc) throw new Error('Offline account not found.');
    acc.activities = acc.activities.filter(a => a.id !== activityId);
    acc.updatedAt = new Date().toISOString();
    this.save();
  }

  public listScenarios(uid: string): CustomScenarioConfig[] {
    const acc = this.state.accounts[uid];
    if (!acc) throw new Error('Offline account not found.');
    return [...acc.scenarios].sort((a, b) =>
      (b.updatedAt || '').localeCompare(a.updatedAt || '')
    );
  }

  public saveScenario(
    uid: string,
    scenario: CustomScenarioConfig,
    isEdit: boolean
  ): CustomScenarioConfig {
    const acc = this.state.accounts[uid];
    if (!acc) throw new Error('Offline account not found.');

    const now = new Date().toISOString();
    const normalized: CustomScenarioConfig = {
      ...scenario,
      ownerId: uid,
      updatedAt: now,
      createdAt: scenario.createdAt || now,
    };

    if (isEdit && acc.scenarios.some(s => s.id === normalized.id)) {
      acc.scenarios = acc.scenarios.map(s => (s.id === normalized.id ? normalized : s));
    } else {
      acc.scenarios = [
        normalized,
        ...acc.scenarios.filter(s => s.id !== normalized.id),
      ];
    }

    acc.updatedAt = now;
    this.save();
    return normalized;
  }

  public deleteScenario(uid: string, scenarioId: string): void {
    const acc = this.state.accounts[uid];
    if (!acc) throw new Error('Offline account not found.');
    acc.scenarios = acc.scenarios.filter(s => s.id !== scenarioId);
    acc.updatedAt = new Date().toISOString();
    this.save();
  }
}
