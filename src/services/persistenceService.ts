/**
 * SKYCONTROL - Per-User Firebase Auth & Cloud Firestore Persistence Service
 * Enforces strict authenticated user isolation for:
 *   - Email/Password & Google Sign-In credentials
 *   - Controller Career Profile & Academy Certification (/users/{uid})
 *   - Personal Radar, Route & Audio Preferences (/users/{uid}/settings/preferences)
 *   - Immutable Activity Logbook (/users/{uid}/activities/{activityId})
 *   - User-Owned Custom Scenarios (/scenarios/{scenarioId})
 */

import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase/config';
import { ALL_AIRPORT_PROFILES, getAirportProfile } from '../airports/airportsRegistry';
import { computeDefaultAirportVisibility } from '../airports/procedures';
import { DEFAULT_RADAR_THEME_ID, normalizeRadarThemeId } from '../utils/radarThemes';
import {
  ActivityEntry,
  ActivityKind,
  AirportNavVisibility,
  CustomScenarioConfig,
  MissionId,
  RadarLayersConfig,
  RadioQualityPresetKey,
  UserAuthProvider,
  UserPreferencesData,
  UserProfileData,
} from '../types';
import {
  offlineDeleteActivity,
  offlineDeleteScenario,
  offlineLoadActivities,
  offlineLoadOrCreatePreferences,
  offlineLoadScenarios,
  offlineRecordActivityAndStats,
  offlineRegisterAccount,
  offlineSavePreferences,
  offlineSaveScenario,
  offlineSignInAccount,
  offlineSignOutAccount,
  offlineUpdateCallsign,
  restoreOfflineSessionBundle,
} from './offlineAccountService';

const ALL_MISSIONS: MissionId[] = [
  'mission_1',
  'mission_2',
  'mission_3',
  'mission_4',
  'mission_5',
];

export const ALL_VALID_AIRPORT_ICAOS = [
  'EGLL',
  'OIII',
  'KJFK',
  'OIIE',
  'OISS',
  'OMDB',
  'LFPG',
  'EHAM',
  'EDDF',
  'LSZH',
  'EGJJ',
  'KORD',
  'KSFO',
  'RJTT',
  'TRN1',
  'TRN2',
] as const;

const VALID_AIRPORTS = new Set<string>(ALL_VALID_AIRPORT_ICAOS);
const VALID_DIFFICULTIES = new Set(['Beginner', 'Intermediate', 'Advanced', 'Master']);
const VALID_PRECIP = new Set(['None', 'Light Rain', 'Rain', 'Fog']);
const VALID_RADIO_PRESETS = new Set<RadioQualityPresetKey>([
  'clear_communication',
  'normal_aviation',
  'weak_signal',
  'heavy_interference',
  'emergency_transmission',
]);

export const DEFAULT_RADAR_LAYERS_CONFIG: RadarLayersConfig = {
  terrain: true,
  rangeRings: true,
  runways: true,
  holdingStacks: true,
  waypointLabels: true,
  extendedCenterlines: true,
  trails: true,
  speedVectors: true,
  radarSweep: true,
  starCorridors: true,
  sidCorridors: true,
  procedureRestrictions: true,
  tmaBoundary: true,
  extendedTargetTags: true,
};

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

export function sanitizeCallsign(raw: string): string {
  const trimmed = raw.trim().slice(0, 32);
  return trimmed.length >= 2 ? trimmed : 'ATC-TRAINEE';
}

export function generateCertificateId(uid: string): string {
  const suffix = sanitizeId(uid).slice(-6).toUpperCase();
  const stamp = new Date().getFullYear().toString().slice(-2);
  const seq = Math.floor(1000 + Math.random() * 8999);
  return `SKY-${stamp}-${suffix}-${seq}`;
}

export function resolveAuthProvider(user: User): UserAuthProvider {
  const hasPassword = user.providerData?.some(p => p.providerId === 'password');
  const hasGoogle = user.providerData?.some(p => p.providerId === 'google.com');
  if (hasGoogle && !hasPassword) return 'google';
  if (hasPassword) return 'password';
  return 'google';
}

export function mapAuthErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code || '';
  const combined = `${code} ${raw}`.toLowerCase();

  if (combined.includes('auth/operation-not-allowed')) {
    return 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication -> Sign-in method -> Email/Password). Enable it there or use Google Sign-In.';
  }
  if (combined.includes('auth/popup-closed-by-user')) {
    return 'Google sign-in popup was closed before completion. Please try again.';
  }
  if (combined.includes('auth/popup-blocked')) {
    return 'Popup was blocked by your browser. Allow popups for this site and try again.';
  }
  if (combined.includes('auth/email-already-in-use')) {
    return 'An account already exists for this email address. Switch to Sign In instead.';
  }
  if (combined.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (
    combined.includes('auth/invalid-credential') ||
    combined.includes('auth/wrong-password') ||
    combined.includes('auth/user-not-found')
  ) {
    return 'Invalid email or password. Verify your credentials or reset your password.';
  }
  if (combined.includes('auth/weak-password')) {
    return 'Password must be at least 6 characters long.';
  }
  if (combined.includes('auth/too-many-requests')) {
    return 'Too many attempts. Please wait a moment before trying again.';
  }
  if (combined.includes('auth/network-request-failed')) {
    return 'Network unreachable for Cloud Sign-In. Switch to Offline Local Mode below to sign in or register without internet.';
  }
  return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
}

export function isNetworkAuthError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code || '';
  const combined = `${code} ${raw}`.toLowerCase();
  return (
    combined.includes('auth/network-request-failed') ||
    combined.includes('the client is offline') ||
    combined.includes('failed to fetch')
  );
}

export function isOfflineUid(uid?: string | null): boolean {
  return Boolean(uid && uid.startsWith('local_'));
}

export function isOfflineProfile(profile?: UserProfileData | null): boolean {
  return Boolean(profile && (profile.authProvider === 'offline' || isOfflineUid(profile.uid)));
}

// ---------------------------------------------------------------------------
// Offline Local Account Operations (Zero Internet Required)
// ---------------------------------------------------------------------------
export async function registerOfflineAccount(
  callsign: string,
  identifier: string,
  password: string
): Promise<UserProfileData> {
  return offlineRegisterAccount(callsign, identifier, password);
}

export async function signInOfflineAccount(
  identifier: string,
  password: string
): Promise<UserProfileData> {
  return offlineSignInAccount(identifier, password);
}

export async function restoreOfflineAccountBundle(): Promise<{
  profile: UserProfileData;
  preferences: UserPreferencesData;
  activities: ActivityEntry[];
  scenarios: CustomScenarioConfig[];
} | null> {
  const bundle = await restoreOfflineSessionBundle();
  if (!bundle) return null;
  const prefs = bundle.preferences
    ? sanitizeUserPreferences(bundle.profile.uid, bundle.preferences)
    : buildDefaultUserPreferences(bundle.profile.uid);
  return {
    profile: bundle.profile,
    preferences: prefs,
    activities: bundle.activities,
    scenarios: bundle.scenarios,
  };
}

// ---------------------------------------------------------------------------
// Firebase Auth Credentials Operations
// ---------------------------------------------------------------------------
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithEmailPassword(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
}

export async function registerWithEmailPassword(
  callsign: string,
  email: string,
  password: string
): Promise<User> {
  const cleanCallsign = sanitizeCallsign(callsign);
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(result.user, { displayName: cleanCallsign }).catch(() => undefined);
  await sendEmailVerification(result.user).catch(() => undefined);
  return result.user;
}

export async function resendVerificationEmail(user: User): Promise<void> {
  await sendEmailVerification(user);
}

export async function reloadCurrentUser(): Promise<User | null> {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  return auth.currentUser;
}

export async function sendAccountPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutAccount(): Promise<void> {
  await offlineSignOutAccount();
  if (auth.currentUser) {
    await signOut(auth);
  }
}

export function subscribeAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

// ---------------------------------------------------------------------------
// Controller Career Profile (/users/{uid})
// ---------------------------------------------------------------------------
export async function loadOrCreateCloudProfile(
  user: User,
  preferredCallsign?: string
): Promise<UserProfileData> {
  const uid = sanitizeId(user.uid);
  const path = `users/${uid}`;
  const docRef = doc(db, 'users', uid);
  const resolvedProvider = resolveAuthProvider(user);

  let snap;
  try {
    snap = await getDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (snap && snap.exists()) {
    const data = snap.data();
    const completed = Array.isArray(data.completedMissions)
      ? (data.completedMissions as MissionId[]).filter(m => ALL_MISSIONS.includes(m))
      : [];

    const legacyNeedsUpgrade =
      !data.authProvider ||
      typeof data.totalGoArounds !== 'number' ||
      typeof data.totalViolations !== 'number' ||
      typeof data.totalFlightSeconds !== 'number' ||
      typeof data.sessionsCompleted !== 'number';

    const profile: UserProfileData = {
      uid,
      callsign:
        typeof data.callsign === 'string'
          ? sanitizeCallsign(data.callsign)
          : sanitizeCallsign(user.displayName || user.email?.split('@')[0] || 'CONTROLLER'),
      authProvider:
        data.authProvider === 'password' || data.authProvider === 'google'
          ? data.authProvider
          : resolvedProvider,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      certified: Boolean(data.certified),
      certificateId: typeof data.certificateId === 'string' ? data.certificateId : undefined,
      issuedAt: typeof data.issuedAt === 'string' ? data.issuedAt : undefined,
      completedMissions: completed,
      totalLandings: typeof data.totalLandings === 'number' ? data.totalLandings : 0,
      totalDepartures: typeof data.totalDepartures === 'number' ? data.totalDepartures : 0,
      totalGoArounds: typeof data.totalGoArounds === 'number' ? data.totalGoArounds : 0,
      totalViolations: typeof data.totalViolations === 'number' ? data.totalViolations : 0,
      totalFlightSeconds: typeof data.totalFlightSeconds === 'number' ? data.totalFlightSeconds : 0,
      sessionsCompleted: typeof data.sessionsCompleted === 'number' ? data.sessionsCompleted : 0,
      bestScore: typeof data.bestScore === 'number' ? data.bestScore : 0,
    };

    if (legacyNeedsUpgrade) {
      try {
        await updateDoc(docRef, {
          authProvider: profile.authProvider,
          totalGoArounds: profile.totalGoArounds,
          totalViolations: profile.totalViolations,
          totalFlightSeconds: profile.totalFlightSeconds,
          sessionsCompleted: profile.sessionsCompleted,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }

    return profile;
  }

  const defaultCallsign = sanitizeCallsign(
    preferredCallsign || user.displayName || user.email?.split('@')[0] || 'CONTROLLER'
  );

  const payload: Record<string, unknown> = {
    uid,
    callsign: defaultCallsign,
    authProvider: resolvedProvider,
    certified: false,
    completedMissions: [],
    totalLandings: 0,
    totalDepartures: 0,
    totalGoArounds: 0,
    totalViolations: 0,
    totalFlightSeconds: 0,
    sessionsCompleted: 0,
    bestScore: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return {
    uid,
    callsign: defaultCallsign,
    authProvider: resolvedProvider,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
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
}

export async function updateControllerCallsign(
  profile: UserProfileData,
  newCallsign: string
): Promise<UserProfileData> {
  if (isOfflineProfile(profile)) {
    return offlineUpdateCallsign(profile, newCallsign);
  }

  const callsign = sanitizeCallsign(newCallsign);
  const path = `users/${profile.uid}`;
  const docRef = doc(db, 'users', profile.uid);
  try {
    await updateDoc(docRef, {
      callsign,
      updatedAt: serverTimestamp(),
    });
    if (auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName: callsign }).catch(() => undefined);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  return { ...profile, callsign };
}

// ---------------------------------------------------------------------------
// Per-User Preferences (/users/{uid}/settings/preferences)
// ---------------------------------------------------------------------------
export function buildDefaultPerAirportVisibilityMap(): Record<string, AirportNavVisibility> {
  const map: Record<string, AirportNavVisibility> = {};
  for (const prof of ALL_AIRPORT_PROFILES) {
    map[prof.airport.icao] = computeDefaultAirportVisibility(prof.airport);
  }
  return map;
}

export function sanitizePerAirportVisibilityMap(
  raw?: Record<string, Partial<AirportNavVisibility>> | null
): Record<string, AirportNavVisibility> {
  const defaults = buildDefaultPerAirportVisibilityMap();
  if (!raw || typeof raw !== 'object') return defaults;

  const result: Record<string, AirportNavVisibility> = { ...defaults };
  for (const prof of ALL_AIRPORT_PROFILES) {
    const icao = prof.airport.icao;
    const saved = raw[icao];
    if (!saved || typeof saved !== 'object') continue;
    const validStars = new Set((prof.airport.approachRoutes || []).map(r => r.id));
    const validSids = new Set((prof.airport.departureRoutes || []).map(r => r.id));
    const validWps = new Set(prof.airport.waypoints.map(w => w.name));

    result[icao] = {
      visibleStarIds: Array.isArray(saved.visibleStarIds)
        ? saved.visibleStarIds.filter(id => typeof id === 'string' && validStars.has(id)).slice(0, 64)
        : defaults[icao].visibleStarIds,
      visibleSidIds: Array.isArray(saved.visibleSidIds)
        ? saved.visibleSidIds.filter(id => typeof id === 'string' && validSids.has(id)).slice(0, 64)
        : defaults[icao].visibleSidIds,
      visibleWaypoints: Array.isArray(saved.visibleWaypoints)
        ? saved.visibleWaypoints.filter(n => typeof n === 'string' && validWps.has(n)).slice(0, 64)
        : defaults[icao].visibleWaypoints,
    };
  }
  return result;
}

export function sanitizeRadarLayers(raw?: Partial<RadarLayersConfig> | null): RadarLayersConfig {
  const base = { ...DEFAULT_RADAR_LAYERS_CONFIG };
  if (!raw || typeof raw !== 'object') return base;
  return {
    terrain: typeof raw.terrain === 'boolean' ? raw.terrain : base.terrain,
    rangeRings: typeof raw.rangeRings === 'boolean' ? raw.rangeRings : base.rangeRings,
    runways: typeof raw.runways === 'boolean' ? raw.runways : base.runways,
    holdingStacks: typeof raw.holdingStacks === 'boolean' ? raw.holdingStacks : base.holdingStacks,
    waypointLabels: typeof raw.waypointLabels === 'boolean' ? raw.waypointLabels : base.waypointLabels,
    extendedCenterlines:
      typeof raw.extendedCenterlines === 'boolean'
        ? raw.extendedCenterlines
        : base.extendedCenterlines,
    trails: typeof raw.trails === 'boolean' ? raw.trails : base.trails,
    speedVectors: typeof raw.speedVectors === 'boolean' ? raw.speedVectors : base.speedVectors,
    radarSweep: typeof raw.radarSweep === 'boolean' ? raw.radarSweep : base.radarSweep,
    starCorridors: typeof raw.starCorridors === 'boolean' ? raw.starCorridors : base.starCorridors,
    sidCorridors: typeof raw.sidCorridors === 'boolean' ? raw.sidCorridors : base.sidCorridors,
    procedureRestrictions:
      typeof raw.procedureRestrictions === 'boolean'
        ? raw.procedureRestrictions
        : base.procedureRestrictions,
    tmaBoundary: typeof raw.tmaBoundary === 'boolean' ? raw.tmaBoundary : base.tmaBoundary,
    extendedTargetTags:
      typeof raw.extendedTargetTags === 'boolean'
        ? raw.extendedTargetTags
        : base.extendedTargetTags,
  };
}

export function buildDefaultUserPreferences(uid: string): UserPreferencesData {
  const egll = getAirportProfile('EGLL');
  return {
    uid: sanitizeId(uid),
    preferredAirportIcao: 'EGLL',
    preferredLandingRunwayId: egll.airport.defaultArrivalRunway,
    preferredDepartureRunwayId: egll.airport.defaultDepartureRunway,
    simSpeed: 1,
    audioMuted: false,
    audioVolume: 0.8,
    towerVoiceId: 'charon',
    radioPreset: 'normal_aviation',
    radarTheme: DEFAULT_RADAR_THEME_ID,
    radarLayers: { ...DEFAULT_RADAR_LAYERS_CONFIG },
    perAirportVisibility: buildDefaultPerAirportVisibilityMap(),
  };
}

function sanitizeUserPreferences(uid: string, raw: Partial<UserPreferencesData>): UserPreferencesData {
  const airportIcao =
    typeof raw.preferredAirportIcao === 'string' && VALID_AIRPORTS.has(raw.preferredAirportIcao)
      ? raw.preferredAirportIcao
      : 'EGLL';
  const prof = getAirportProfile(airportIcao);
  const validRunways = new Set(prof.airport.runways.map(r => r.id));

  const preferredLandingRunwayId =
    typeof raw.preferredLandingRunwayId === 'string' &&
    validRunways.has(raw.preferredLandingRunwayId)
      ? raw.preferredLandingRunwayId
      : prof.airport.defaultArrivalRunway;
  const preferredDepartureRunwayId =
    typeof raw.preferredDepartureRunwayId === 'string' &&
    validRunways.has(raw.preferredDepartureRunwayId)
      ? raw.preferredDepartureRunwayId
      : prof.airport.defaultDepartureRunway;

  const radioPreset: RadioQualityPresetKey =
    raw.radioPreset && VALID_RADIO_PRESETS.has(raw.radioPreset)
      ? raw.radioPreset
      : 'normal_aviation';

  const voice =
    typeof raw.towerVoiceId === 'string' && raw.towerVoiceId.trim().length >= 2
      ? raw.towerVoiceId.trim().slice(0, 64)
      : 'charon';

  return {
    uid: sanitizeId(uid),
    preferredAirportIcao: airportIcao,
    preferredLandingRunwayId,
    preferredDepartureRunwayId,
    simSpeed: Math.max(1, Math.min(5, Math.round(Number(raw.simSpeed) || 1))),
    audioMuted: Boolean(raw.audioMuted),
    audioVolume: Math.max(0, Math.min(1, Number(raw.audioVolume ?? 0.8))),
    towerVoiceId: voice,
    radioPreset,
    radarTheme: normalizeRadarThemeId(raw.radarTheme),
    radarLayers: sanitizeRadarLayers(raw.radarLayers),
    perAirportVisibility: sanitizePerAirportVisibilityMap(raw.perAirportVisibility),
  };
}

export async function loadOrCreateUserPreferences(
  userOrUid: User | string
): Promise<UserPreferencesData> {
  const rawUid = typeof userOrUid === 'string' ? userOrUid : userOrUid.uid;
  const uid = sanitizeId(rawUid);

  if (isOfflineUid(uid)) {
    const prefs = await offlineLoadOrCreatePreferences(uid, buildDefaultUserPreferences(uid));
    return sanitizeUserPreferences(uid, prefs);
  }

  const path = `users/${uid}/settings/preferences`;
  const docRef = doc(db, 'users', uid, 'settings', 'preferences');

  let snap;
  try {
    snap = await getDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (snap && snap.exists()) {
    return sanitizeUserPreferences(uid, snap.data() as Partial<UserPreferencesData>);
  }

  const defaults = buildDefaultUserPreferences(uid);
  try {
    await setDoc(docRef, {
      ...defaults,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
  return defaults;
}

export async function saveUserPreferences(
  uid: string,
  prefsInput: Omit<UserPreferencesData, 'uid'>
): Promise<UserPreferencesData> {
  const safeUid = sanitizeId(uid);
  const sanitized = sanitizeUserPreferences(safeUid, { ...prefsInput, uid: safeUid });

  if (isOfflineUid(safeUid)) {
    return offlineSavePreferences(safeUid, sanitized);
  }

  const path = `users/${safeUid}/settings/preferences`;
  const docRef = doc(db, 'users', safeUid, 'settings', 'preferences');

  try {
    await updateDoc(docRef, {
      preferredAirportIcao: sanitized.preferredAirportIcao,
      preferredLandingRunwayId: sanitized.preferredLandingRunwayId,
      preferredDepartureRunwayId: sanitized.preferredDepartureRunwayId,
      simSpeed: sanitized.simSpeed,
      audioMuted: sanitized.audioMuted,
      audioVolume: sanitized.audioVolume,
      towerVoiceId: sanitized.towerVoiceId,
      radioPreset: sanitized.radioPreset,
      radarTheme: sanitized.radarTheme,
      radarLayers: sanitized.radarLayers,
      perAirportVisibility: sanitized.perAirportVisibility,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Fallback to create if preferences document didn't exist yet
    try {
      await setDoc(docRef, {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  return sanitized;
}

// ---------------------------------------------------------------------------
// Per-User Activity Logbook (/users/{uid}/activities/{activityId})
// ---------------------------------------------------------------------------
export async function loadUserActivities(
  uid: string,
  maxItems: number = 50
): Promise<ActivityEntry[]> {
  const safeUid = sanitizeId(uid);
  if (isOfflineUid(safeUid)) {
    return offlineLoadActivities(safeUid, maxItems);
  }
  const path = `users/${safeUid}/activities`;
  try {
    // Filter explicitly by uid to match security rule list constraint without requiring composite index
    const q = query(
      collection(db, 'users', safeUid, 'activities'),
      where('uid', '==', safeUid),
      limit(Math.max(1, Math.min(100, maxItems)))
    );
    const snap = await getDocs(q);
    const items: ActivityEntry[] = [];
    snap.forEach(docSnap => {
      const d = docSnap.data();
      const createdIso = d.createdAt?.toDate
        ? d.createdAt.toDate().toISOString()
        : typeof d.createdAt === 'string'
        ? d.createdAt
        : new Date(0).toISOString();
      items.push({
        id: d.id || docSnap.id,
        uid: d.uid,
        kind: d.kind,
        title: d.title,
        missionId: d.missionId,
        airportIcao: d.airportIcao,
        landingRunwayId: d.landingRunwayId,
        departureRunwayId: d.departureRunwayId,
        landings: typeof d.landings === 'number' ? d.landings : 0,
        departures: typeof d.departures === 'number' ? d.departures : 0,
        goArounds: typeof d.goArounds === 'number' ? d.goArounds : 0,
        violations: typeof d.violations === 'number' ? d.violations : 0,
        score: typeof d.score === 'number' ? d.score : 0,
        durationSeconds: typeof d.durationSeconds === 'number' ? d.durationSeconds : 0,
        createdAt: createdIso,
      });
    });
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export interface RecordActivityInput {
  kind: ActivityKind;
  title: string;
  missionId?: MissionId;
  airportIcao: string;
  landingRunwayId: string;
  departureRunwayId: string;
  landings: number;
  departures: number;
  goArounds: number;
  violations: number;
  score: number;
  durationSeconds: number;
}

export async function recordControllerActivityAndStats(
  profile: UserProfileData,
  input: RecordActivityInput
): Promise<{ updatedProfile: UserProfileData; entry: ActivityEntry; newlyCertified: boolean }> {
  const safeUid = sanitizeId(profile.uid);
  const actId = sanitizeId(`act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const airportIcao = VALID_AIRPORTS.has(input.airportIcao) ? input.airportIcao : 'EGLL';
  const prof = getAirportProfile(airportIcao);
  const landingRunwayId =
    (input.landingRunwayId || prof.airport.defaultArrivalRunway).trim().slice(0, 4) || '27R';
  const departureRunwayId =
    (input.departureRunwayId || prof.airport.defaultDepartureRunway).trim().slice(0, 4) || '27L';

  const landings = Math.max(0, Math.min(1000, Math.round(input.landings || 0)));
  const departures = Math.max(0, Math.min(1000, Math.round(input.departures || 0)));
  const goArounds = Math.max(0, Math.min(1000, Math.round(input.goArounds || 0)));
  const violations = Math.max(0, Math.min(1000, Math.round(input.violations || 0)));
  const score = Math.max(0, Math.min(100, Math.round(input.score || 0)));
  const durationSeconds = Math.max(0, Math.min(86400, Math.round(input.durationSeconds || 0)));
  const title = (input.title || 'Radar Operations').trim().slice(0, 100);
  const safeTitle = title.length >= 2 ? title : 'Radar Operations';

  if (isOfflineProfile(profile)) {
    return offlineRecordActivityAndStats(profile, {
      kind: input.kind,
      title: safeTitle,
      missionId: input.missionId && ALL_MISSIONS.includes(input.missionId) ? input.missionId : undefined,
      airportIcao,
      landingRunwayId,
      departureRunwayId,
      landings,
      departures,
      goArounds,
      violations,
      score,
      durationSeconds,
    });
  }

  const actPayload: Record<string, unknown> = {
    id: actId,
    uid: safeUid,
    kind: input.kind,
    title: safeTitle,
    airportIcao,
    landingRunwayId,
    departureRunwayId,
    landings,
    departures,
    goArounds,
    violations,
    score,
    durationSeconds,
    createdAt: serverTimestamp(),
  };

  if (input.missionId && ALL_MISSIONS.includes(input.missionId)) {
    actPayload.missionId = input.missionId;
  }

  const actPath = `users/${safeUid}/activities/${actId}`;
  try {
    await setDoc(doc(db, 'users', safeUid, 'activities', actId), actPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, actPath);
  }

  const isMissionPass = input.kind === 'mission_pass' && input.missionId;
  const nextMissions = isMissionPass
    ? Array.from(new Set([...profile.completedMissions, input.missionId!]))
        .filter(m => ALL_MISSIONS.includes(m))
        .slice(0, 5)
    : profile.completedMissions;

  const wasCertified = profile.certified;
  const allComplete = ALL_MISSIONS.every(m => nextMissions.includes(m)) || wasCertified;
  const newlyCertified = !wasCertified && allComplete;

  const certId = allComplete
    ? profile.certificateId || generateCertificateId(safeUid)
    : profile.certificateId;
  const issuedAt = allComplete
    ? profile.issuedAt || new Date().toISOString()
    : profile.issuedAt;

  const totalLandings = Math.min(100000, profile.totalLandings + landings);
  const totalDepartures = Math.min(100000, profile.totalDepartures + departures);
  const totalGoArounds = Math.min(100000, profile.totalGoArounds + goArounds);
  const totalViolations = Math.min(100000, profile.totalViolations + violations);
  const totalFlightSeconds = Math.min(10000000, profile.totalFlightSeconds + durationSeconds);
  const sessionsCompleted = Math.min(100000, profile.sessionsCompleted + 1);
  const bestScore = Math.max(profile.bestScore, score);

  const userPath = `users/${safeUid}`;
  const updatePayload: Record<string, unknown> = {
    totalLandings,
    totalDepartures,
    totalGoArounds,
    totalViolations,
    totalFlightSeconds,
    sessionsCompleted,
    bestScore,
    updatedAt: serverTimestamp(),
  };

  if (isMissionPass) {
    updatePayload.completedMissions = nextMissions;
    updatePayload.certified = allComplete;
    if (allComplete && certId && issuedAt) {
      updatePayload.certificateId = certId;
      updatePayload.issuedAt = issuedAt;
    }
  }

  try {
    await updateDoc(doc(db, 'users', safeUid), updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }

  const entry: ActivityEntry = {
    id: actId,
    uid: safeUid,
    kind: input.kind,
    title: safeTitle,
    missionId: input.missionId,
    airportIcao,
    landingRunwayId,
    departureRunwayId,
    landings,
    departures,
    goArounds,
    violations,
    score,
    durationSeconds,
    createdAt: new Date().toISOString(),
  };

  const updatedProfile: UserProfileData = {
    ...profile,
    completedMissions: nextMissions,
    certified: allComplete,
    certificateId: certId,
    issuedAt,
    totalLandings,
    totalDepartures,
    totalGoArounds,
    totalViolations,
    totalFlightSeconds,
    sessionsCompleted,
    bestScore,
  };

  return { updatedProfile, entry, newlyCertified };
}

export async function deleteUserActivity(uid: string, activityId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeActId = sanitizeId(activityId);
  if (isOfflineUid(safeUid)) {
    await offlineDeleteActivity(safeUid, safeActId);
    return;
  }
  const path = `users/${safeUid}/activities/${safeActId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'activities', safeActId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ---------------------------------------------------------------------------
// Custom Scenarios CRUD (/scenarios/{scenarioId}) — Strictly User-Owned
// ---------------------------------------------------------------------------
export function sanitizeScenarioInput(
  input: CustomScenarioConfig,
  ownerId: string
): CustomScenarioConfig {
  const airportIcao = VALID_AIRPORTS.has(input.airportIcao) ? input.airportIcao : 'EGLL';
  const difficulty = VALID_DIFFICULTIES.has(input.difficulty) ? input.difficulty : 'Intermediate';
  const precipitation = VALID_PRECIP.has(input.precipitation) ? input.precipitation : 'None';

  const windSpeed = Math.max(0, Math.min(60, Math.round(Number(input.windSpeed) || 0)));
  const gusts = Math.max(windSpeed, Math.min(80, Math.round(Number(input.gusts) || windSpeed)));

  return {
    id: sanitizeId(input.id || `scn_${Date.now()}`),
    ownerId: sanitizeId(ownerId),
    name: (input.name || 'Custom Sector').trim().slice(0, 80) || 'Custom Sector',
    description: (input.description || '').trim().slice(0, 300),
    difficulty,
    airportIcao,
    landingRunwayId: (input.landingRunwayId || '27R').trim().slice(0, 4),
    departureRunwayId: (input.departureRunwayId || '27L').trim().slice(0, 4),
    windDirection: ((Math.round(Number(input.windDirection) || 0) % 360) + 360) % 360,
    windSpeed,
    gusts,
    qnh: Math.max(940, Math.min(1050, Math.round(Number(input.qnh) || 1013))),
    visibilityNM: Math.max(0.5, Math.min(20, Number(input.visibilityNM) || 10)),
    ceilingFeet: Math.max(100, Math.min(20000, Math.round(Number(input.ceilingFeet) || 5000))),
    precipitation,
    initialInbounds: Math.max(0, Math.min(12, Math.round(Number(input.initialInbounds) || 4))),
    initialDepartures: Math.max(0, Math.min(6, Math.round(Number(input.initialDepartures) || 1))),
    spawnIntervalSec: Math.max(10, Math.min(180, Math.round(Number(input.spawnIntervalSec) || 40))),
    heavyRatio: Math.max(0, Math.min(1, Number(input.heavyRatio) || 0.3)),
    allowEmergencies: Boolean(input.allowEmergencies),
    emergencyDelaySec: Math.max(5, Math.min(300, Math.round(Number(input.emergencyDelaySec) || 45))),
  };
}

export async function loadUserScenarios(profile: UserProfileData): Promise<CustomScenarioConfig[]> {
  if (isOfflineProfile(profile)) {
    return offlineLoadScenarios(profile.uid);
  }
  const path = 'scenarios';
  try {
    const q = query(collection(db, path), where('ownerId', '==', profile.uid));
    const snap = await getDocs(q);
    const items: CustomScenarioConfig[] = [];
    snap.forEach(docSnap => {
      const d = docSnap.data();
      const updatedMs = d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : undefined;
      const createdMs = d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : undefined;
      items.push({
        id: d.id || docSnap.id,
        ownerId: d.ownerId,
        name: d.name,
        description: d.description || '',
        difficulty: d.difficulty,
        airportIcao: d.airportIcao,
        landingRunwayId: d.landingRunwayId,
        departureRunwayId: d.departureRunwayId,
        windDirection: d.windDirection,
        windSpeed: d.windSpeed,
        gusts: d.gusts,
        qnh: d.qnh,
        visibilityNM: d.visibilityNM,
        ceilingFeet: d.ceilingFeet,
        precipitation: d.precipitation,
        initialInbounds: d.initialInbounds,
        initialDepartures: d.initialDepartures,
        spawnIntervalSec: d.spawnIntervalSec,
        heavyRatio: d.heavyRatio,
        allowEmergencies: d.allowEmergencies,
        emergencyDelaySec: d.emergencyDelaySec,
        createdAt: createdMs,
        updatedAt: updatedMs,
      });
    });

    return items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveUserScenario(
  profile: UserProfileData,
  scenarioInput: CustomScenarioConfig,
  isEdit: boolean = false
): Promise<CustomScenarioConfig> {
  const sanitized = sanitizeScenarioInput(scenarioInput, profile.uid);
  if (isOfflineProfile(profile)) {
    return offlineSaveScenario(profile.uid, sanitized, isEdit);
  }
  const nowIso = new Date().toISOString();
  const path = `scenarios/${sanitized.id}`;
  const docRef = doc(db, 'scenarios', sanitized.id);

  if (isEdit) {
    const updatePayload = {
      name: sanitized.name,
      description: sanitized.description,
      difficulty: sanitized.difficulty,
      airportIcao: sanitized.airportIcao,
      landingRunwayId: sanitized.landingRunwayId,
      departureRunwayId: sanitized.departureRunwayId,
      windDirection: sanitized.windDirection,
      windSpeed: sanitized.windSpeed,
      gusts: sanitized.gusts,
      qnh: sanitized.qnh,
      visibilityNM: sanitized.visibilityNM,
      ceilingFeet: sanitized.ceilingFeet,
      precipitation: sanitized.precipitation,
      initialInbounds: sanitized.initialInbounds,
      initialDepartures: sanitized.initialDepartures,
      spawnIntervalSec: sanitized.spawnIntervalSec,
      heavyRatio: sanitized.heavyRatio,
      allowEmergencies: sanitized.allowEmergencies,
      emergencyDelaySec: sanitized.emergencyDelaySec,
      updatedAt: serverTimestamp(),
    };
    try {
      await updateDoc(docRef, updatePayload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    return { ...sanitized, createdAt: scenarioInput.createdAt, updatedAt: nowIso };
  }

  const createPayload = {
    ...sanitized,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(docRef, createPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
  return { ...sanitized, createdAt: nowIso, updatedAt: nowIso };
}

export async function deleteUserScenario(profile: UserProfileData, scenarioId: string): Promise<void> {
  const safeId = sanitizeId(scenarioId);
  if (isOfflineProfile(profile)) {
    await offlineDeleteScenario(profile.uid, safeId);
    return;
  }
  const path = `scenarios/${safeId}`;
  const docRef = doc(db, 'scenarios', safeId);
  try {
    // Ensure ownership matches before deleting
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists() && existingSnap.data().ownerId !== profile.uid) {
      throw new Error('Cannot delete a scenario owned by another controller.');
    }
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
