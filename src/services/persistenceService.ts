/**
 * SKYCONTROL - Hybrid Auth & Persistence Service
 * Supports both Cloud Accounts (Google Sign-In + Firestore) and Guest Mode (localStorage).
 */

import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase/config';
import { CustomScenarioConfig, MissionId, UserProfileData } from '../types';

const GUEST_PROFILE_KEY = 'skycontrol_guest_profile_v1';
const GUEST_SCENARIOS_KEY = 'skycontrol_guest_scenarios_v1';

const ALL_MISSIONS: MissionId[] = [
  'mission_1',
  'mission_2',
  'mission_3',
  'mission_4',
  'mission_5',
];

const VALID_AIRPORTS = new Set(['EGLL', 'OIII', 'KJFK', 'TRN1', 'TRN2']);
const VALID_DIFFICULTIES = new Set(['Beginner', 'Intermediate', 'Advanced', 'Master']);
const VALID_PRECIP = new Set(['None', 'Light Rain', 'Rain', 'Fog']);

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

// ---------------------------------------------------------------------------
// Guest LocalStorage Persistence
// ---------------------------------------------------------------------------
export function loadGuestProfile(fallbackCallsign: string = 'GUEST-ATC'): UserProfileData | null {
  try {
    const raw = localStorage.getItem(GUEST_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfileData;
    return {
      uid: parsed.uid || 'guest_local',
      callsign: sanitizeCallsign(parsed.callsign || fallbackCallsign),
      mode: 'guest',
      certified: Boolean(parsed.certified),
      certificateId: parsed.certificateId,
      issuedAt: parsed.issuedAt,
      completedMissions: Array.isArray(parsed.completedMissions)
        ? parsed.completedMissions.filter(m => ALL_MISSIONS.includes(m)).slice(0, 5)
        : [],
      totalLandings: Math.max(0, Math.round(parsed.totalLandings || 0)),
      totalDepartures: Math.max(0, Math.round(parsed.totalDepartures || 0)),
      bestScore: Math.max(0, Math.min(100, Number(parsed.bestScore || 0))),
    };
  } catch {
    return null;
  }
}

export function createOrSaveGuestProfile(callsign: string, existing?: Partial<UserProfileData>): UserProfileData {
  const prior = loadGuestProfile(callsign);
  const completedMissions = Array.from(
    new Set([...(prior?.completedMissions || []), ...(existing?.completedMissions || [])])
  ).filter(m => ALL_MISSIONS.includes(m)).slice(0, 5);

  const isCertified = ALL_MISSIONS.every(m => completedMissions.includes(m)) || Boolean(prior?.certified || existing?.certified);
  const profile: UserProfileData = {
    uid: prior?.uid || 'guest_local',
    callsign: sanitizeCallsign(callsign || prior?.callsign || 'GUEST-ATC'),
    mode: 'guest',
    certified: isCertified,
    certificateId: isCertified
      ? existing?.certificateId || prior?.certificateId || generateCertificateId('GUEST')
      : undefined,
    issuedAt: isCertified
      ? existing?.issuedAt || prior?.issuedAt || new Date().toISOString()
      : undefined,
    completedMissions,
    totalLandings: Math.max(prior?.totalLandings || 0, existing?.totalLandings || 0),
    totalDepartures: Math.max(prior?.totalDepartures || 0, existing?.totalDepartures || 0),
    bestScore: Math.max(prior?.bestScore || 0, existing?.bestScore || 0),
  };

  try {
    localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore quota failures in private browsing
  }
  return profile;
}

export function loadGuestScenarios(): CustomScenarioConfig[] {
  try {
    const raw = localStorage.getItem(GUEST_SCENARIOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomScenarioConfig[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGuestScenarios(list: CustomScenarioConfig[]): void {
  try {
    localStorage.setItem(GUEST_SCENARIOS_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage error
  }
}

// ---------------------------------------------------------------------------
// Cloud Firebase Auth & Firestore Operations
// ---------------------------------------------------------------------------
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
}

export function subscribeAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function loadOrCreateCloudProfile(
  user: User,
  guestToMerge?: UserProfileData | null
): Promise<UserProfileData> {
  const uid = sanitizeId(user.uid);
  const path = `users/${uid}`;
  const docRef = doc(db, 'users', uid);

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

    return {
      uid,
      callsign: typeof data.callsign === 'string' ? data.callsign : sanitizeCallsign(user.displayName || 'CONTROLLER'),
      mode: 'google',
      email: user.email,
      certified: Boolean(data.certified),
      certificateId: typeof data.certificateId === 'string' ? data.certificateId : undefined,
      issuedAt: typeof data.issuedAt === 'string' ? data.issuedAt : undefined,
      completedMissions: completed,
      totalLandings: typeof data.totalLandings === 'number' ? data.totalLandings : 0,
      totalDepartures: typeof data.totalDepartures === 'number' ? data.totalDepartures : 0,
      bestScore: typeof data.bestScore === 'number' ? data.bestScore : 0,
    };
  }

  const mergedMissions: MissionId[] = Array.from(
    new Set((guestToMerge?.completedMissions || []).filter(m => ALL_MISSIONS.includes(m)))
  ).slice(0, 5);
  const allDone = ALL_MISSIONS.every(m => mergedMissions.includes(m));
  const defaultCallsign = sanitizeCallsign(
    guestToMerge?.callsign && guestToMerge.callsign !== 'GUEST-ATC'
      ? guestToMerge.callsign
      : user.displayName || user.email?.split('@')[0] || 'CONTROLLER'
  );

  const payload: Record<string, unknown> = {
    uid,
    callsign: defaultCallsign,
    certified: allDone,
    completedMissions: mergedMissions,
    totalLandings: Math.max(0, Math.round(guestToMerge?.totalLandings || 0)),
    totalDepartures: Math.max(0, Math.round(guestToMerge?.totalDepartures || 0)),
    bestScore: Math.max(0, Math.min(100, Number(guestToMerge?.bestScore || 0))),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (allDone) {
    payload.certificateId = guestToMerge?.certificateId || generateCertificateId(uid);
    payload.issuedAt = guestToMerge?.issuedAt || new Date().toISOString();
  }

  try {
    await setDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return {
    uid,
    callsign: defaultCallsign,
    mode: 'google',
    email: user.email,
    certified: allDone,
    certificateId: payload.certificateId as string | undefined,
    issuedAt: payload.issuedAt as string | undefined,
    completedMissions: mergedMissions,
    totalLandings: payload.totalLandings as number,
    totalDepartures: payload.totalDepartures as number,
    bestScore: payload.bestScore as number,
  };
}

export async function updateControllerCallsign(
  profile: UserProfileData,
  newCallsign: string
): Promise<UserProfileData> {
  const callsign = sanitizeCallsign(newCallsign);
  if (profile.mode === 'guest') {
    return createOrSaveGuestProfile(callsign, profile);
  }

  const path = `users/${profile.uid}`;
  const docRef = doc(db, 'users', profile.uid);
  try {
    await updateDoc(docRef, {
      callsign,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  return { ...profile, callsign };
}

export async function persistMissionCompletion(
  profile: UserProfileData,
  missionId: MissionId,
  sessionLandings: number,
  sessionDepartures: number,
  sessionScore: number
): Promise<{ updatedProfile: UserProfileData; newlyCertified: boolean }> {
  const nextMissions = Array.from(
    new Set([...profile.completedMissions, missionId])
  ).filter(m => ALL_MISSIONS.includes(m)).slice(0, 5);

  const wasCertified = profile.certified;
  const allComplete = ALL_MISSIONS.every(m => nextMissions.includes(m));
  const newlyCertified = !wasCertified && allComplete;

  const certId = allComplete
    ? profile.certificateId || generateCertificateId(profile.uid)
    : profile.certificateId;
  const issuedAt = allComplete
    ? profile.issuedAt || new Date().toISOString()
    : profile.issuedAt;

  const totalLandings = Math.min(100000, profile.totalLandings + Math.max(0, Math.round(sessionLandings)));
  const totalDepartures = Math.min(100000, profile.totalDepartures + Math.max(0, Math.round(sessionDepartures)));
  const bestScore = Math.max(profile.bestScore, Math.min(100, Math.max(0, Math.round(sessionScore))));

  if (profile.mode === 'guest') {
    const updatedProfile = createOrSaveGuestProfile(profile.callsign, {
      ...profile,
      completedMissions: nextMissions,
      certified: allComplete,
      certificateId: certId,
      issuedAt,
      totalLandings,
      totalDepartures,
      bestScore,
    });
    return { updatedProfile, newlyCertified };
  }

  const path = `users/${profile.uid}`;
  const docRef = doc(db, 'users', profile.uid);

  const updatePayload: Record<string, unknown> = {
    completedMissions: nextMissions,
    certified: allComplete,
    totalLandings,
    totalDepartures,
    bestScore,
    updatedAt: serverTimestamp(),
  };

  if (allComplete && certId && issuedAt) {
    updatePayload.certificateId = certId;
    updatePayload.issuedAt = issuedAt;
  }

  try {
    await updateDoc(docRef, updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  return {
    updatedProfile: {
      ...profile,
      completedMissions: nextMissions,
      certified: allComplete,
      certificateId: certId,
      issuedAt,
      totalLandings,
      totalDepartures,
      bestScore,
    },
    newlyCertified,
  };
}

// ---------------------------------------------------------------------------
// Custom Scenarios CRUD (Firestore or Guest LocalStorage)
// ---------------------------------------------------------------------------
function sanitizeScenarioInput(input: CustomScenarioConfig, ownerId: string): CustomScenarioConfig {
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
  if (profile.mode === 'guest') {
    return loadGuestScenarios();
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
  const nowIso = new Date().toISOString();

  if (profile.mode === 'guest') {
    const existing = loadGuestScenarios();
    const record: CustomScenarioConfig = {
      ...sanitized,
      createdAt: isEdit ? scenarioInput.createdAt || nowIso : nowIso,
      updatedAt: nowIso,
    };
    const nextList = isEdit
      ? existing.map(s => (s.id === record.id ? record : s))
      : [record, ...existing];
    saveGuestScenarios(nextList);
    return record;
  }

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
  } else {
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
}

export async function deleteUserScenario(profile: UserProfileData, scenarioId: string): Promise<void> {
  const safeId = sanitizeId(scenarioId);
  if (profile.mode === 'guest') {
    const remaining = loadGuestScenarios().filter(s => s.id !== safeId);
    saveGuestScenarios(remaining);
    return;
  }

  const path = `scenarios/${safeId}`;
  try {
    await deleteDoc(doc(db, 'scenarios', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function migrateGuestScenariosToCloud(profile: UserProfileData): Promise<number> {
  if (profile.mode !== 'google') return 0;
  const guestScenarios = loadGuestScenarios();
  if (guestScenarios.length === 0) return 0;

  let migrated = 0;
  for (const sc of guestScenarios) {
    await saveUserScenario(
      profile,
      { ...sc, id: `mig_${sanitizeId(sc.id)}`, ownerId: profile.uid },
      false
    );
    migrated++;
  }
  saveGuestScenarios([]);
  return migrated;
}
