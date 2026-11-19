/**
 * SKYCONTROL - Client Offline Account & Isolated Per-User Storage Service
 * Enables full registration, sign-in, career tracking, preferences, activity logbook,
 * and custom scenarios with ZERO internet connectivity.
 * Primary store: local Express server (/api/local-auth/* -> local-data/local-accounts.json).
 * Fallback store: browser localStorage (when running as static frontend without Express).
 */

import {
  ActivityEntry,
  CustomScenarioConfig,
  MissionId,
  UserPreferencesData,
  UserProfileData,
} from '../types';

const SESSION_KEY = 'skycontrol_offline_session_v1';
const BROWSER_DB_KEY = 'skycontrol_offline_accounts_v1';

interface OfflineSessionHandle {
  backend: 'server' | 'browser';
  token: string;
  uid: string;
}

interface BrowserStoredAccount {
  uid: string;
  identifier: string;
  salt: string;
  passwordHash: string;
  profile: UserProfileData;
  preferences: UserPreferencesData | null;
  activities: ActivityEntry[];
  scenarios: CustomScenarioConfig[];
  createdAt: string;
  updatedAt: string;
}

interface BrowserOfflineDb {
  version: number;
  accounts: Record<string, BrowserStoredAccount>;
}

export interface OfflineSessionBundle {
  profile: UserProfileData;
  preferences: UserPreferencesData | null;
  activities: ActivityEntry[];
  scenarios: CustomScenarioConfig[];
}

const ALL_MISSIONS: MissionId[] = [
  'mission_1',
  'mission_2',
  'mission_3',
  'mission_4',
  'mission_5',
];

function getStorageSafe(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as { localStorage?: Storage }).localStorage) {
      return (globalThis as { localStorage?: Storage }).localStorage!;
    }
  } catch {
    return null;
  }
  return null;
}

// In-memory fallback map when running in headless Node without localStorage (e.g. Vitest)
const memoryFallbackStorage = new Map<string, string>();

function readStorageItem(key: string): string | null {
  const ls = getStorageSafe();
  if (ls) return ls.getItem(key);
  return memoryFallbackStorage.get(key) ?? null;
}

function writeStorageItem(key: string, value: string): void {
  const ls = getStorageSafe();
  if (ls) {
    ls.setItem(key, value);
  } else {
    memoryFallbackStorage.set(key, value);
  }
}

function removeStorageItem(key: string): void {
  const ls = getStorageSafe();
  if (ls) {
    ls.removeItem(key);
  } else {
    memoryFallbackStorage.delete(key);
  }
}

export function clearMemoryOfflineStoreForTests(): void {
  memoryFallbackStorage.clear();
  const ls = getStorageSafe();
  if (ls) {
    ls.removeItem(SESSION_KEY);
    ls.removeItem(BROWSER_DB_KEY);
  }
}

function normalizeIdentifier(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 100);
}

function sanitizeCallsign(raw: string): string {
  const trimmed = raw.trim().slice(0, 32);
  return trimmed.length >= 2 ? trimmed : 'ATC-LOCAL';
}

function randomHex(byteCount: number = 16): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(byteCount);
    crypto.getRandomValues(buf);
    return Array.from(buf)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let out = '';
  for (let i = 0; i < byteCount * 2; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

async function hashPasswordBrowser(password: string, salt: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      const bits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: enc.encode(salt),
          iterations: 50000,
          hash: 'SHA-256',
        },
        keyMaterial,
        256
      );
      return Array.from(new Uint8Array(bits))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fall through to deterministic iterated hash for non-HTTPS LAN / test contexts
  }

  // Deterministic multi-round FNV/SHA-mix fallback when WebCrypto Subtle is unavailable
  const input = `${salt}:${password}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let round = 0; round < 1024; round++) {
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i);
      h1 ^= ch ^ round;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= (ch << 5) ^ (h1 >>> 3);
      h2 = Math.imul(h2, 0x85ebca6b);
    }
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function generateCertificateId(uid: string): string {
  const suffix = uid.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'LOCAL1';
  const stamp = new Date().getFullYear().toString().slice(-2);
  const seq = Math.floor(1000 + Math.random() * 8999);
  return `SKY-${stamp}-${suffix}-${seq}`;
}

function getStoredSession(): OfflineSessionHandle | null {
  const raw = readStorageItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OfflineSessionHandle>;
    if (
      (parsed.backend === 'server' || parsed.backend === 'browser') &&
      typeof parsed.token === 'string' &&
      typeof parsed.uid === 'string'
    ) {
      return parsed as OfflineSessionHandle;
    }
  } catch {
    // ignore corrupt handle
  }
  return null;
}

function saveStoredSession(handle: OfflineSessionHandle | null): void {
  if (!handle) {
    removeStorageItem(SESSION_KEY);
    return;
  }
  writeStorageItem(SESSION_KEY, JSON.stringify(handle));
}

function readBrowserDb(): BrowserOfflineDb {
  const raw = readStorageItem(BROWSER_DB_KEY);
  if (!raw) return { version: 1, accounts: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<BrowserOfflineDb>;
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      accounts: parsed.accounts && typeof parsed.accounts === 'object' ? parsed.accounts : {},
    };
  } catch {
    return { version: 1, accounts: {} };
  }
}

function writeBrowserDb(db: BrowserOfflineDb): void {
  writeStorageItem(BROWSER_DB_KEY, JSON.stringify(db));
}

function isApiAvailableEnv(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof fetch === 'function' &&
    typeof window.location?.protocol === 'string' &&
    window.location.protocol.startsWith('http')
  );
}

class BackendUnavailableError extends Error {
  constructor() {
    super('Local server API unavailable');
  }
}

async function callLocalAuthApi<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
  } = {}
): Promise<T> {
  if (!isApiAvailableEnv()) {
    throw new BackendUnavailableError();
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { 'x-local-session': options.token } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new BackendUnavailableError();
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new BackendUnavailableError();
  }

  const payload = (await res.json()) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(payload.error || `Offline request failed (${res.status})`);
  }
  return payload;
}

export async function offlineRegisterAccount(
  callsign: string,
  identifier: string,
  password: string
): Promise<UserProfileData> {
  const normId = normalizeIdentifier(identifier);
  if (normId.length < 3 || /\s/.test(normId)) {
    throw new Error('Username or email must be at least 3 characters with no spaces.');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  try {
    const out = await callLocalAuthApi<{ token: string; profile: UserProfileData }>(
      '/api/local-auth/register',
      {
        method: 'POST',
        body: { identifier: normId, password, callsign },
      }
    );
    saveStoredSession({ backend: 'server', token: out.token, uid: out.profile.uid });
    return out.profile;
  } catch (err) {
    if (!(err instanceof BackendUnavailableError)) {
      throw err;
    }
  }

  // Browser localStorage fallback
  const db = readBrowserDb();
  const duplicate = Object.values(db.accounts).find(a => a.identifier === normId);
  if (duplicate) {
    throw new Error('An offline account already exists for this email/username. Sign in instead.');
  }

  const uid = `local_${randomHex(8)}`;
  const salt = randomHex(16);
  const passwordHash = await hashPasswordBrowser(password, salt);
  const now = new Date().toISOString();
  const cleanCallsign = sanitizeCallsign(callsign || normId.split('@')[0] || 'ATC-LOCAL');

  const profile: UserProfileData = {
    uid,
    callsign: cleanCallsign,
    authProvider: 'offline',
    email: normId,
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

  db.accounts[uid] = {
    uid,
    identifier: normId,
    salt,
    passwordHash,
    profile,
    preferences: null,
    activities: [],
    scenarios: [],
    createdAt: now,
    updatedAt: now,
  };
  writeBrowserDb(db);
  saveStoredSession({ backend: 'browser', token: uid, uid });
  return profile;
}

export async function offlineSignInAccount(
  identifier: string,
  password: string
): Promise<UserProfileData> {
  const normId = normalizeIdentifier(identifier);
  if (!normId || !password) {
    throw new Error('Please enter both your offline email/username and password.');
  }

  try {
    const out = await callLocalAuthApi<{ token: string; profile: UserProfileData }>(
      '/api/local-auth/login',
      {
        method: 'POST',
        body: { identifier: normId, password },
      }
    );
    saveStoredSession({ backend: 'server', token: out.token, uid: out.profile.uid });
    return out.profile;
  } catch (err) {
    if (!(err instanceof BackendUnavailableError)) {
      throw err;
    }
  }

  // Browser localStorage fallback
  const db = readBrowserDb();
  const acc = Object.values(db.accounts).find(a => a.identifier === normId);
  if (!acc) {
    throw new Error('Invalid offline email/username or password.');
  }
  const candidateHash = await hashPasswordBrowser(password, acc.salt);
  if (candidateHash !== acc.passwordHash) {
    throw new Error('Invalid offline email/username or password.');
  }
  saveStoredSession({ backend: 'browser', token: acc.uid, uid: acc.uid });
  return acc.profile;
}

export async function offlineSignOutAccount(): Promise<void> {
  const session = getStoredSession();
  saveStoredSession(null);
  if (session?.backend === 'server') {
    try {
      await callLocalAuthApi('/api/local-auth/logout', {
        method: 'POST',
        token: session.token,
      });
    } catch {
      // Ignore network/server errors during sign-out cleanup
    }
  }
}

export async function restoreOfflineSessionBundle(): Promise<OfflineSessionBundle | null> {
  const session = getStoredSession();
  if (!session) return null;

  if (session.backend === 'server') {
    try {
      return await callLocalAuthApi<OfflineSessionBundle>('/api/local-auth/session', {
        method: 'GET',
        token: session.token,
      });
    } catch (err) {
      if (!(err instanceof BackendUnavailableError)) {
        saveStoredSession(null);
        return null;
      }
    }
  }

  const db = readBrowserDb();
  const acc = db.accounts[session.uid];
  if (!acc) {
    saveStoredSession(null);
    return null;
  }
  return {
    profile: acc.profile,
    preferences: acc.preferences,
    activities: [...acc.activities].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    scenarios: [...acc.scenarios].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
  };
}

export async function offlineUpdateCallsign(
  profile: UserProfileData,
  newCallsign: string
): Promise<UserProfileData> {
  const cleanCallsign = sanitizeCallsign(newCallsign);
  const session = getStoredSession();

  if (session?.backend === 'server') {
    try {
      const out = await callLocalAuthApi<{ profile: UserProfileData }>(
        '/api/local-auth/profile/callsign',
        {
          method: 'PATCH',
          token: session.token,
          body: { callsign: cleanCallsign },
        }
      );
      return out.profile;
    } catch (err) {
      if (!(err instanceof BackendUnavailableError)) throw err;
    }
  }

  const db = readBrowserDb();
  const acc = db.accounts[profile.uid];
  if (!acc) throw new Error('Offline account not found.');
  acc.profile = { ...acc.profile, callsign: cleanCallsign };
  acc.updatedAt = new Date().toISOString();
  writeBrowserDb(db);
  return acc.profile;
}

export async function offlineLoadOrCreatePreferences(
  uid: string,
  defaultPrefs: UserPreferencesData
): Promise<UserPreferencesData> {
  const session = getStoredSession();
  if (session?.backend === 'server') {
    try {
      const out = await callLocalAuthApi<{ preferences: UserPreferencesData | null }>(
        '/api/local-auth/preferences',
        { method: 'GET', token: session.token }
      );
      if (out.preferences) return out.preferences;
      const saved = await callLocalAuthApi<{ preferences: UserPreferencesData }>(
        '/api/local-auth/preferences',
        { method: 'PUT', token: session.token, body: defaultPrefs }
      );
      return saved.preferences;
    } catch (err) {
      if (!(err instanceof BackendUnavailableError)) throw err;
    }
  }

  const db = readBrowserDb();
  const acc = db.accounts[uid];
  if (!acc) return defaultPrefs;
  if (acc.preferences) return acc.preferences;
  acc.preferences = defaultPrefs;
  acc.updatedAt = new Date().toISOString();
  writeBrowserDb(db);
  return defaultPrefs;
}

export async function offlineSavePreferences(
  uid: string,
  prefs: UserPreferencesData
): Promise<UserPreferencesData> {
  const session = getStoredSession();
  if (session?.backend === 'server') {
    try {
      const out = await callLocalAuthApi<{ preferences: UserPreferencesData }>(
        '/api/local-auth/preferences',
        { method: 'PUT', token: session.token, body: prefs }
      );
      return out.preferences;
    } catch (err) {
      if (!(err instanceof BackendUnavailableError)) throw err;
    }
  }

  const db = readBrowserDb();
  const acc = db.accounts[uid];
  if (acc) {
    acc.preferences = prefs;
    acc.updatedAt = new Date().toISOString();
    writeBrowserDb(db);
  }
  return prefs;
}

export async function offlineLoadActivities(
  uid: string,
  maxItems: number = 50
): Promise<ActivityEntry[]> {
  const session = getStoredSession();
  if (session?.backend === 'server') {
    try {
      const out = await callLocalAuthApi<{ activities: ActivityEntry[] }>(
        `/api/local-auth/activities?limit=${maxItems}`,
        { method: 'GET', token: session.token }
      );
      return out.activities;
    } catch (err) {
      if (!(err instanceof BackendUnavailableError)) throw err;
    }
  }

  const db = readBrowserDb();
  const acc = db.accounts[uid];
  if (!acc) return [];
  return [...acc.activities]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, maxItems);
}

export async function offlineRecordActivityAndStats(
  profile: UserProfileData,
  entryInput: Omit<ActivityEntry, 'id' | 'uid' | 'createdAt'>
): Promise<{ updatedProfile: UserProfileData; entry: ActivityEntry; newlyCertified: boolean }> {
  const session = getStoredSession();
  if (session?.backend === 'server') {
    try {
      return await callLocalAuthApi<{
        updatedProfile: UserProfileData;
        entry: ActivityEntry;
        newlyCertified: boolean;
      }>('/api/local-auth/activities', {
        method: 'POST',
        token: session.token,
        body: entryInput,
      });
    } catch (err) {
      if (!(err instanceof BackendUnavailableError)) throw err;
    }
  }

  const db = readBrowserDb();
  const acc = db.accounts[profile.uid];
  if (!acc) throw new Error('Offline account not found.');

  const now = new Date().toISOString();
  const actId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const entry: ActivityEntry = {
    ...entryInput,
    id: actId,
    uid: profile.uid,
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
    ? acc.profile.certificateId || generateCertificateId(profile.uid)
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
  writeBrowserDb(db);

  return { updatedProfile, entry, newlyCertified };
}

export async function offlineDeleteActivity(uid: string, activityId: string): Promise<void> {
  const session = getStoredSession();
  if (session?.backend === 'server') {
    try {
      await callLocalAuthApi(`/api/local-auth/activities/${encodeURIComponent(activityId)}`, {
        method: 'DELETE',
        token: session.token,
      });
      return;
    } catch (err) {
      if (!(err instanceof BackendUnavailableError)) throw err;
    }
  }

  const db = readBrowserDb();
  const acc = db.accounts[uid];
  if (acc) {
    acc.activities = acc.activities.filter(a => a.id !== activityId);
    acc.updatedAt = new Date().toISOString();
    writeBrowserDb(db);
  }
}

export async function offlineLoadScenarios(uid: string): Promise<CustomScenarioConfig[]> {
  const session = getStoredSession();
  if (session?.backend === 'server') {
    try {
      const out = await callLocalAuthApi<{ scenarios: CustomScenarioConfig[] }>(
        '/api/local-auth/scenarios',
        { method: 'GET', token: session.token }
      );
      return out.scenarios;
    } catch (err) {
      if (!(err instanceof BackendUnavailableError)) throw err;
    }
  }

  const db = readBrowserDb();
  const acc = db.accounts[uid];
  if (!acc) return [];
  return [...acc.scenarios].sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || '')
  );
}

export async function offlineSaveScenario(
  uid: string,
  scenario: CustomScenarioConfig,
  isEdit: boolean
): Promise<CustomScenarioConfig> {
  const session = getStoredSession();
  if (session?.backend === 'server') {
    try {
      const path = isEdit
        ? `/api/local-auth/scenarios/${encodeURIComponent(scenario.id)}`
        : '/api/local-auth/scenarios';
      const out = await callLocalAuthApi<{ scenario: CustomScenarioConfig }>(path, {
        method: isEdit ? 'PUT' : 'POST',
        token: session.token,
        body: scenario,
      });
      return out.scenario;
    } catch (err) {
      if (!(err instanceof BackendUnavailableError)) throw err;
    }
  }

  const db = readBrowserDb();
  const acc = db.accounts[uid];
  if (!acc) throw new Error('Offline account not found.');

  const now = new Date().toISOString();
  const saved: CustomScenarioConfig = {
    ...scenario,
    ownerId: uid,
    createdAt: scenario.createdAt || now,
    updatedAt: now,
  };
  if (isEdit && acc.scenarios.some(s => s.id === saved.id)) {
    acc.scenarios = acc.scenarios.map(s => (s.id === saved.id ? saved : s));
  } else {
    acc.scenarios = [saved, ...acc.scenarios.filter(s => s.id !== saved.id)];
  }
  acc.updatedAt = now;
  writeBrowserDb(db);
  return saved;
}

export async function offlineDeleteScenario(uid: string, scenarioId: string): Promise<void> {
  const session = getStoredSession();
  if (session?.backend === 'server') {
    try {
      await callLocalAuthApi(`/api/local-auth/scenarios/${encodeURIComponent(scenarioId)}`, {
        method: 'DELETE',
        token: session.token,
      });
      return;
    } catch (err) {
      if (!(err instanceof BackendUnavailableError)) throw err;
    }
  }

  const db = readBrowserDb();
  const acc = db.accounts[uid];
  if (acc) {
    acc.scenarios = acc.scenarios.filter(s => s.id !== scenarioId);
    acc.updatedAt = new Date().toISOString();
    writeBrowserDb(db);
  }
}
