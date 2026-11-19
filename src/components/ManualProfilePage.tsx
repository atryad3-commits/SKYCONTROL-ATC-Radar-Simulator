/**
 * SKYCONTROL - Operational Manual, Career Records & Personal Controller Logbook
 * Displays strictly isolated controller credentials, cumulative telemetry records,
 * chronological flight operations activity logbook, and ATC operational documentation.
 */

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Award,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Compass,
  Crosshair,
  Edit3,
  KeyRound,
  LogOut,
  MousePointer,
  Save,
  Shield,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { ActivityEntry, UserProfileData } from '../types';
import { useSimulationStore } from '../store/simulationStore';
import {
  deleteUserActivity,
  sendAccountPasswordReset,
  updateControllerCallsign,
} from '../services/persistenceService';

interface ManualProfilePageProps {
  userProfile: UserProfileData | null;
  activities: ActivityEntry[];
  onProfileReady: (profile: UserProfileData) => void;
  onActivitiesChanged: (next: ActivityEntry[]) => void;
  onSignedOut: () => Promise<void> | void;
  onLogCurrentSession: () => Promise<void> | void;
  onOpenCertificate: () => void;
  onRequireAuth: () => void;
  onReturnToRadar: () => void;
}

function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const rem = sec % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
  }
  return `${mins}m ${rem.toString().padStart(2, '0')}s`;
}

function formatActivityDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'UTC';
    const day = d.toISOString().slice(5, 10);
    const time = d.toISOString().slice(11, 16);
    return `${day} ${time}Z`;
  } catch {
    return 'UTC';
  }
}

function formatKindLabel(kind: ActivityEntry['kind']): { text: string; colorClass: string } {
  switch (kind) {
    case 'mission_pass':
      return { text: 'PASS', colorClass: 'text-[#00ff66]' };
    case 'mission_fail':
      return { text: 'FAIL', colorClass: 'text-[#ff4d4d]' };
    case 'custom_ops':
      return { text: 'CUSTOM', colorClass: 'text-[#ffd166]' };
    case 'free_ops':
    default:
      return { text: 'FREE OPS', colorClass: 'text-[#00e5ff]' };
  }
}

export const ManualProfilePage: React.FC<ManualProfilePageProps> = ({
  userProfile,
  activities,
  onProfileReady,
  onActivitiesChanged,
  onSignedOut,
  onLogCurrentSession,
  onOpenCertificate,
  onRequireAuth,
  onReturnToRadar,
}) => {
  const airport = useSimulationStore(state => state.airport);
  const airportProfile = useSimulationStore(state => state.airportProfile);
  const activeLandingRunwayId = useSimulationStore(state => state.activeLandingRunwayId);
  const activeDepartureRunwayId = useSimulationStore(state => state.activeDepartureRunwayId);
  const stats = useSimulationStore(state => state.stats);
  const hasCompletedStartupSetup = useSimulationStore(state => state.hasCompletedStartupSetup);

  const [callsignInput, setCallsignInput] = useState(userProfile?.callsign || 'CTR-ALPHA1');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile?.callsign) {
      setCallsignInput(userProfile.callsign);
    }
  }, [userProfile?.callsign]);

  const activeArrRwy = airport.runways.find(r => r.id === activeLandingRunwayId);
  const arrHeading = activeArrRwy ? activeArrRwy.heading.toString().padStart(3, '0') : '270';
  const completedCount = userProfile?.completedMissions.length || 0;
  const hasLoggableSession =
    hasCompletedStartupSetup &&
    (stats.elapsedSeconds >= 10 || stats.landings > 0 || stats.departures > 0);

  const handleSaveCallsign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const updated = await updateControllerCallsign(userProfile, callsignInput);
      onProfileReady(updated);
      setStatusMsg('Controller callsign updated successfully.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update controller callsign');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (!userProfile?.email) return;
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await sendAccountPasswordReset(userProfile.email);
      setStatusMsg(`Password reset email sent to ${userProfile.email}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send password reset email');
    } finally {
      setBusy(false);
    }
  };

  const handleLogSessionNow = async () => {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await onLogCurrentSession();
      setStatusMsg('Active radar session saved to your personal Activity Logbook.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to record radar session');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteActivityEntry = async (activityId: string) => {
    if (!userProfile) return;
    setErrorMsg(null);
    try {
      await deleteUserActivity(userProfile.uid, activityId);
      onActivitiesChanged(activities.filter(a => a.id !== activityId));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete logbook entry');
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onSignedOut();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to sign out');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#060f0a] text-[#d1e7dd] p-5 text-xs select-none">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Controller Profile, Career Records & Personal Activity Logbook */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          <section className="bg-[#08130d] border border-[#163826] rounded p-5 flex flex-col gap-4">
            <div className="pb-3 border-b border-[#163826] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#00ff66]" />
                <div>
                  <h2 className="text-sm font-bold text-white">Controller Profile &amp; Records</h2>
                  <p className="text-[11px] text-[#7ec29a] font-mono">
                    {userProfile
                      ? `${
                          userProfile.authProvider === 'offline'
                            ? 'Offline Local Account'
                            : userProfile.authProvider === 'google'
                            ? 'Google Account'
                            : 'Email Account'
                        } · ${userProfile.email || userProfile.uid}`
                      : 'Authentication required'}
                  </p>
                </div>
              </div>

              {userProfile?.certified && (
                <button
                  type="button"
                  onClick={onOpenCertificate}
                  className="px-3 py-1.5 bg-[#2b240e] hover:bg-[#3d3313] border border-[#ffd166]/60 text-[#ffd166] rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Certificate</span>
                </button>
              )}
            </div>

            {errorMsg && (
              <div className="p-3 bg-[#361114] border border-[#ff3344]/60 rounded flex items-start gap-2 text-[#ffb3b8]">
                <AlertCircle className="w-4 h-4 text-[#ff4d4d] shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {statusMsg && (
              <div className="p-3 bg-[#0c2619] border border-[#00ff66]/50 rounded flex items-center gap-2 text-[#a2f5bf]">
                <CheckCircle2 className="w-4 h-4 text-[#00ff66] shrink-0" />
                <span>{statusMsg}</span>
              </div>
            )}

            {userProfile ? (
              <>
                {/* Primary Career Telemetry Row */}
                <div className="grid grid-cols-4 divide-x divide-[#143020] bg-[#060f0a] border border-[#163826] rounded py-3 font-mono tabular-nums text-center">
                  <div>
                    <div className="text-[10px] text-[#5da87d]">ACADEMY</div>
                    <div className="text-sm font-bold text-[#00ff66] mt-0.5">{completedCount}/5</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#5da87d]">LANDINGS</div>
                    <div className="text-sm font-bold text-[#00e5ff] mt-0.5">
                      {userProfile.totalLandings}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#5da87d]">DEPARTURES</div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {userProfile.totalDepartures}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#5da87d]">BEST SCR</div>
                    <div className="text-sm font-bold text-[#ffd166] mt-0.5">
                      {userProfile.bestScore}%
                    </div>
                  </div>
                </div>

                {/* Secondary Cumulative Records Row */}
                <div className="grid grid-cols-4 divide-x divide-[#143020] bg-[#060f0a] border border-[#163826] rounded py-2.5 font-mono tabular-nums text-center">
                  <div>
                    <div className="text-[10px] text-[#5da87d]">SESSIONS</div>
                    <div className="text-xs font-bold text-white mt-0.5">
                      {userProfile.sessionsCompleted}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#5da87d]">GO-AROUNDS</div>
                    <div className="text-xs font-bold text-[#a2f5bf] mt-0.5">
                      {userProfile.totalGoArounds}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#5da87d]">STCA</div>
                    <div
                      className={`text-xs font-bold mt-0.5 ${
                        userProfile.totalViolations > 0 ? 'text-[#ff6b6b]' : 'text-[#85cca1]'
                      }`}
                    >
                      {userProfile.totalViolations}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#5da87d]">DUTY TIME</div>
                    <div className="text-xs font-bold text-[#00e5ff] mt-0.5">
                      {formatDuration(userProfile.totalFlightSeconds)}
                    </div>
                  </div>
                </div>

                {/* Callsign Editor */}
                <form onSubmit={handleSaveCallsign} className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold text-[#a2f5bf] flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-[#00ff66]" />
                    <span>Controller Callsign (Printed on ATC Certificate)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={32}
                      required
                      value={callsignInput}
                      onChange={e => setCallsignInput(e.target.value)}
                      className="flex-1 bg-[#050d09] border border-[#1a422d] focus:border-[#00ff66] rounded px-3 py-2 text-white font-mono outline-none"
                      placeholder="Controller Callsign"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-2 bg-[#143b26] hover:bg-[#1c5235] text-[#00ff66] border border-[#246340] rounded font-semibold transition-colors whitespace-nowrap shrink-0"
                    >
                      Save
                    </button>
                  </div>
                </form>

                {/* Account Actions */}
                <div className="pt-3 border-t border-[#163826] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {hasLoggableSession && (
                      <button
                        type="button"
                        onClick={handleLogSessionNow}
                        disabled={busy}
                        className="px-3 py-2 bg-[#0c291b] hover:bg-[#133d28] text-[#00ff66] border border-[#246340] rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Shift to Logbook</span>
                      </button>
                    )}

                    {userProfile.authProvider === 'password' && userProfile.email && (
                      <button
                        type="button"
                        onClick={handleResetPassword}
                        disabled={busy}
                        className="px-3 py-2 bg-[#0b1f16] hover:bg-[#133322] text-[#00e5ff] border border-[#1d4d33] rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Reset Password</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={busy}
                    className="px-3.5 py-2 bg-[#2a1214] hover:bg-[#3d191c] text-[#ff858d] border border-[#5e2226] rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out / Switch Account</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-[#85cca1]">
                  Sign in with your personal Email &amp; Password or Google account to access your records and preferences.
                </p>
                <button
                  type="button"
                  onClick={onRequireAuth}
                  className="w-full py-2.5 px-4 bg-[#00ff66] hover:bg-[#39ff14] text-black font-bold rounded transition-colors"
                >
                  Open Sign-In Gate
                </button>
              </div>
            )}
          </section>

          {/* Personal Activity Logbook */}
          <section className="bg-[#08130d] border border-[#163826] rounded p-5 flex flex-col gap-3">
            <div className="pb-2.5 border-b border-[#163826] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-[#00e5ff]" />
                <h3 className="text-sm font-bold text-white">Personal Activity Logbook</h3>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-[#70b88d]">
                {activities.length} {activities.length === 1 ? 'ENTRY' : 'ENTRIES'}
              </span>
            </div>

            {activities.length === 0 ? (
              <div className="p-4 bg-[#060f0a] border border-[#143020] rounded text-[11px] text-[#7ec29a] leading-relaxed">
                No flight operations recorded for this account yet. Complete an Academy mission or control traffic for at least 15 seconds to log your first shift.
              </div>
            ) : (
              <div className="divide-y divide-[#143020] border border-[#163826] rounded bg-[#060f0a] max-h-96 overflow-y-auto">
                {activities.map(entry => {
                  const badge = formatKindLabel(entry.kind);
                  return (
                    <div
                      key={entry.id}
                      className="p-3 flex items-start justify-between gap-3 hover:bg-[#0a1911] transition-colors"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                          <span className={`font-bold ${badge.colorClass}`}>{badge.text}</span>
                          <span className="text-[#34694a]">·</span>
                          <span className="text-white font-semibold truncate">{entry.title}</span>
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-[#85cca1] flex flex-wrap items-center gap-2">
                          <span className="text-[#00e5ff]">{entry.airportIcao}</span>
                          <span className="text-[#34694a]">·</span>
                          <span>
                            RWY {entry.landingRunwayId}/{entry.departureRunwayId}
                          </span>
                          <span className="text-[#34694a]">·</span>
                          <span>
                            LND {entry.landings} / DEP {entry.departures} / GA {entry.goArounds}
                          </span>
                          <span className="text-[#34694a]">·</span>
                          <span className="text-[#ffd166]">{entry.score}%</span>
                          <span className="text-[#34694a]">·</span>
                          <span>{formatDuration(entry.durationSeconds)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 font-mono text-[10px] text-[#5da87d]">
                        <span>{formatActivityDate(entry.createdAt)}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteActivityEntry(entry.id)}
                          className="p-1 rounded hover:bg-[#2a1214] text-[#5da87d] hover:text-[#ff6b6b] transition-colors"
                          title="Delete Log Entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: ATC Operational Manual & Shortcuts */}
        <section className="lg:col-span-7 bg-[#08130d] border border-[#163826] rounded p-5 flex flex-col gap-5 h-fit">
          <div className="pb-3 border-b border-[#163826] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#00ff66]" />
              <h2 className="text-sm font-bold text-white">
                Controller Operational Manual · {airport.icao} TMA
              </h2>
            </div>

            <button
              type="button"
              onClick={onReturnToRadar}
              className="px-3.5 py-1.5 bg-[#123321] hover:bg-[#19472e] border border-[#246340] text-[#00ff66] rounded font-semibold transition-colors whitespace-nowrap"
            >
              Open Radar Scope
            </button>
          </div>

          <div className="space-y-4 leading-relaxed text-[#a2f5bf]">
            <div>
              <h3 className="font-bold text-white mb-1 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-[#00ff66]" />
                <span>
                  Active Airspace: {airport.name} ({airport.icao})
                </span>
              </h3>
              <p className="text-[11px] font-mono tabular-nums text-[#85cca1]">
                Elevation: <b className="text-white">{airport.elevationFeet} ft</b> · VHF:{' '}
                <b className="text-white">{airportProfile.vhfFrequency}</b> · Arrival RWY{' '}
                <b className="text-[#00ff66]">{activeLandingRunwayId}</b> (HDG {arrHeading}°) ·
                Departure RWY <b className="text-[#00e5ff]">{activeDepartureRunwayId}</b>
              </p>
              <p className="text-[11px] text-[#85cca1] mt-1">{airportProfile.summary}</p>
            </div>

            <div className="pt-3 border-t border-[#143020]">
              <h3 className="font-bold text-[#ffb703] mb-1.5 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-[#ffb703]" />
                <span>Separation Standards (STCA) &amp; Squawk 7700</span>
              </h3>
              <ul className="text-[11px] text-[#b4e0c4] space-y-1 list-disc list-inside tabular-nums">
                <li>
                  <b>Horizontal Separation:</b> Maintain at least <b className="text-white">3.0 NM</b>{' '}
                  between airborne targets.
                </li>
                <li>
                  <b>Vertical Separation:</b> Maintain at least <b className="text-white">1,000 ft</b>{' '}
                  until established on ILS final.
                </li>
                <li>
                  <b>Terrain Clearance:</b> Observe sector elevation contours in the radar background before descending below MSA.
                </li>
                <li>
                  <b>Squawk 7700 (Mayday):</b> Emergency flights display a red diamond. Clear surrounding traffic and vector straight to ILS{' '}
                  <b className="text-[#00e5ff]">{activeLandingRunwayId}</b>.
                </li>
              </ul>
            </div>

            <div className="pt-3 border-t border-[#143020]">
              <h3 className="font-bold text-white mb-1.5 flex items-center gap-1.5">
                <Crosshair className="w-4 h-4 text-[#00e5ff]" />
                <span>ILS Intercept &amp; Tower Landing Clearance</span>
              </h3>
              <ol className="text-[11px] text-[#b4e0c4] space-y-1 list-decimal list-inside tabular-nums">
                <li>
                  Assign arrival STAR/IAF transition or vector via Base Leg and Final Intercept (~30° intercept angle to RWY {activeLandingRunwayId}, HDG {arrHeading}°).
                </li>
                <li>
                  Descend to intercept altitude (~{Math.ceil(airport.elevationFeet / 1000) * 1000 + 3000} ft at 10–14 NM) and issue <b className="text-[#00e5ff]">Cleared ILS</b>.
                </li>
                <li>
                  Once established on final, issue explicit <b className="text-[#00ff66]">Cleared to Land</b> before the 1.2 NM touchdown gate.
                </li>
              </ol>
            </div>

            <div className="pt-3 border-t border-[#143020]">
              <h3 className="font-bold text-white mb-2 flex items-center gap-1.5">
                <MousePointer className="w-4 h-4 text-[#00ff66]" />
                <span>Radar Scope Mouse &amp; Keyboard Shortcuts</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                <div className="p-2.5 bg-[#060f0a] border border-[#143020] rounded">
                  <div className="font-bold text-[#00ff66] font-mono">Left-Click / Drag</div>
                  <p className="text-[#85cca1] mt-0.5">
                    Select aircraft, drag data tags, pan scope, or drag heading vector handle.
                  </p>
                </div>
                <div className="p-2.5 bg-[#060f0a] border border-[#143020] rounded">
                  <div className="font-bold text-[#00ff66] font-mono">Wheel / [+] / [-]</div>
                  <p className="text-[#85cca1] mt-0.5">
                    Continuous radar zoom from 2.5 NM runway close-up to 140 NM enroute sector.
                  </p>
                </div>
                <div className="p-2.5 bg-[#060f0a] border border-[#143020] rounded">
                  <div className="font-bold text-[#00ff66] font-mono">Right-Drag / [M]</div>
                  <p className="text-[#85cca1] mt-0.5">
                    Measure tactical distance (NM) and magnetic bearing (°) anywhere on scope.
                  </p>
                </div>
                <div className="p-2.5 bg-[#060f0a] border border-[#143020] rounded">
                  <div className="font-bold text-[#00ff66] font-mono">[H] / [D] / [C]</div>
                  <p className="text-[#85cca1] mt-0.5">
                    Heading Vector tool, Direct-To fix tool, and Center scope reset.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
