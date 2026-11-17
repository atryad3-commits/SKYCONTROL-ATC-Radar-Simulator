/**
 * SKYCONTROL - Operational Manual & Controller Profile Page
 * Clean two-pane reference & profile workspace uniting controller credentials,
 * Academy statistics, certificate launcher, and radar/ILS/STCA documentation.
 */

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Award,
  BookOpen,
  CheckCircle2,
  Compass,
  Crosshair,
  Edit3,
  LogOut,
  MousePointer,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { UserProfileData } from '../types';
import { useSimulationStore } from '../store/simulationStore';
import {
  signInWithGoogle,
  signOutAccount,
  updateControllerCallsign,
} from '../services/persistenceService';

interface ManualProfilePageProps {
  userProfile: UserProfileData | null;
  onProfileReady: (profile: UserProfileData) => void;
  onSignedOut: () => void;
  onOpenCertificate: () => void;
  onRequireAuth: () => void;
  onReturnToRadar: () => void;
}

export const ManualProfilePage: React.FC<ManualProfilePageProps> = ({
  userProfile,
  onProfileReady,
  onSignedOut,
  onOpenCertificate,
  onRequireAuth,
  onReturnToRadar,
}) => {
  const airport = useSimulationStore(state => state.airport);
  const airportProfile = useSimulationStore(state => state.airportProfile);
  const activeLandingRunwayId = useSimulationStore(state => state.activeLandingRunwayId);
  const activeDepartureRunwayId = useSimulationStore(state => state.activeDepartureRunwayId);

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

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(
        msg.includes('popup-closed-by-user')
          ? 'Google sign-in popup was closed before completion.'
          : `Google sign-in failed: ${msg}`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      if (userProfile?.mode === 'google') {
        await signOutAccount();
      }
      onSignedOut();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to sign out');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#060f0a] text-[#d1e7dd] p-5 text-xs select-none">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Controller Profile & Academy Progress */}
        <section className="lg:col-span-5 bg-[#08130d] border border-[#163826] rounded p-5 flex flex-col gap-5 h-fit">
          <div className="pb-3 border-b border-[#163826] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-[#00ff66]" />
              <div>
                <h2 className="text-sm font-bold text-white">Controller Profile &amp; Rating</h2>
                <p className="text-[11px] text-[#7ec29a]">
                  {userProfile
                    ? userProfile.mode === 'google'
                      ? `Cloud Account (${userProfile.email || 'Connected'})`
                      : 'Guest Session · Local Storage'
                    : 'Not signed in'}
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

              <div className="pt-3 border-t border-[#163826] flex flex-wrap items-center justify-between gap-3">
                {userProfile.mode === 'guest' ? (
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={busy}
                    className="flex-1 px-4 py-2 bg-[#00ff66] hover:bg-[#39ff14] text-black font-bold rounded flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>Link Google Account</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-[#5da87d]">
                    Synced to Cloud Firestore.
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={busy}
                  className="px-3.5 py-2 bg-[#2a1214] hover:bg-[#3d191c] text-[#ff858d] border border-[#5e2226] rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{userProfile.mode === 'google' ? 'Sign Out' : 'Switch Mode'}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-[#85cca1]">
                Sign in with Google or enter as a Guest Controller to save missions and custom scenarios.
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

        {/* Right Column: ATC Operational Manual & Shortcuts */}
        <section className="lg:col-span-7 bg-[#08130d] border border-[#163826] rounded p-5 flex flex-col gap-5">
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
                <span>ILS Intercept Procedure</span>
              </h3>
              <ol className="text-[11px] text-[#b4e0c4] space-y-1 list-decimal list-inside tabular-nums">
                <li>
                  Vector inbound flights onto a ~30° intercept angle to the RWY {activeLandingRunwayId} extended centerline (HDG {arrHeading}°).
                </li>
                <li>
                  Descend to intercept altitude (~{Math.ceil(airport.elevationFeet / 1000) * 1000 + 3000} ft at 10–14 NM).
                </li>
                <li>
                  Click <b className="text-[#00e5ff]">ILS {activeLandingRunwayId}</b> or{' '}
                  <b className="text-[#00e5ff]">Vector to Final</b> in the Right Vectoring Panel.
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
