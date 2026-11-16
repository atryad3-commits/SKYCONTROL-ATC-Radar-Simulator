/**
 * SKYCONTROL - Controller Authentication & Profile Modal
 * Supports permanent Google Cloud accounts (Firebase Auth + Firestore)
 * and instant Guest Mode (localStorage) with one-click upgrade/migration.
 */

import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  ShieldCheck,
  Award,
  LogOut,
  X,
  ArrowUpRight,
  AlertCircle,
  CheckCircle2,
  Edit3,
} from 'lucide-react';
import { UserProfileData } from '../types';
import {
  createOrSaveGuestProfile,
  signInWithGoogle,
  signOutAccount,
  updateControllerCallsign,
} from '../services/persistenceService';

interface AuthGateModalProps {
  isOpen: boolean;
  canDismiss: boolean;
  userProfile: UserProfileData | null;
  onClose: () => void;
  onProfileReady: (profile: UserProfileData) => void;
  onSignedOut: () => void;
  onOpenCertificate: () => void;
}

export const AuthGateModal: React.FC<AuthGateModalProps> = ({
  isOpen,
  canDismiss,
  userProfile,
  onClose,
  onProfileReady,
  onSignedOut,
  onOpenCertificate,
}) => {
  const [callsignInput, setCallsignInput] = useState(
    userProfile?.callsign || 'CTR-ALPHA1'
  );
  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile?.callsign) {
      setCallsignInput(userProfile.callsign);
    }
  }, [userProfile?.callsign]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setIsBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await signInWithGoogle();
      // onAuthStateChanged in App.tsx handles loading/migrating profile & scenarios
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('popup-closed-by-user')) {
        setErrorMsg('Google sign-in popup was closed. Please try again or continue as a Guest Controller.');
      } else {
        setErrorMsg(`Google sign-in failed: ${msg}`);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleGuestEnter = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const saved = createOrSaveGuestProfile(callsignInput, userProfile || undefined);
    onProfileReady(saved);
    onClose();
  };

  const handleSaveCallsign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setIsBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const updated = await updateControllerCallsign(userProfile, callsignInput);
      onProfileReady(updated);
      setStatusMsg('Controller callsign updated successfully.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update controller callsign');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSignOut = async () => {
    setIsBusy(true);
    setErrorMsg(null);
    try {
      if (userProfile?.mode === 'google') {
        await signOutAccount();
      }
      onSignedOut();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to sign out');
    } finally {
      setIsBusy(false);
    }
  };

  const completedCount = userProfile?.completedMissions.length || 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#08130e] border border-[#1b422d] rounded-lg shadow-2xl flex flex-col overflow-hidden select-none">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#0c1d14] border-b border-[#163826] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#00ff66]" />
            <div>
              <h2 className="text-sm font-bold text-white">
                {userProfile ? 'Controller Profile & Certification' : 'Sign In to SKYCONTROL ATC'}
              </h2>
            </div>
          </div>

          {canDismiss && (
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[#163826] text-[#5da87d] hover:text-white transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-5 text-xs">
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

          {/* Signed-in or Guest Profile Summary */}
          {userProfile ? (
            <>
              <div className="pb-4 border-b border-[#163826] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-base font-bold text-white font-mono">
                      {userProfile.callsign}
                    </div>
                    <div className="text-[11px] text-[#70b88d] mt-0.5 flex items-center gap-2">
                      <span>
                        {userProfile.mode === 'google'
                          ? `Google Cloud Account (${userProfile.email || 'Connected'})`
                          : 'Guest Mode · Local Browser Storage'}
                      </span>
                      <span>·</span>
                      <span className={userProfile.certified ? 'text-[#ffd166] font-semibold' : 'text-[#85cca1]'}>
                        {userProfile.certified ? 'Certified ATC Director' : 'In Training'}
                      </span>
                    </div>
                  </div>

                  {userProfile.certified && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenCertificate();
                      }}
                      className="px-3 py-2 bg-[#2b240e] hover:bg-[#3d3313] border border-[#ffd166]/60 text-[#ffd166] rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Award className="w-4 h-4" />
                      <span>View Certificate</span>
                    </button>
                  )}
                </div>

                {/* Telemetry Summary Row */}
                <div className="grid grid-cols-4 gap-2 pt-2 font-mono tabular-nums text-center">
                  <div className="p-2 bg-[#0b1a12] border border-[#163826] rounded">
                    <div className="text-[10px] text-[#5da87d]">ACADEMY</div>
                    <div className="text-sm font-bold text-[#00ff66]">{completedCount}/5</div>
                  </div>
                  <div className="p-2 bg-[#0b1a12] border border-[#163826] rounded">
                    <div className="text-[10px] text-[#5da87d]">LANDINGS</div>
                    <div className="text-sm font-bold text-[#00e5ff]">{userProfile.totalLandings}</div>
                  </div>
                  <div className="p-2 bg-[#0b1a12] border border-[#163826] rounded">
                    <div className="text-[10px] text-[#5da87d]">DEPARTURES</div>
                    <div className="text-sm font-bold text-white">{userProfile.totalDepartures}</div>
                  </div>
                  <div className="p-2 bg-[#0b1a12] border border-[#163826] rounded">
                    <div className="text-[10px] text-[#5da87d]">BEST SCR</div>
                    <div className="text-sm font-bold text-[#ffd166]">{userProfile.bestScore}%</div>
                  </div>
                </div>
              </div>

              {/* Edit Callsign */}
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
                    disabled={isBusy}
                    className="px-4 py-2 bg-[#143b26] hover:bg-[#1c5235] text-[#00ff66] border border-[#246340] rounded font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    Save Callsign
                  </button>
                </div>
              </form>

              {/* Guest Upgrade CTA or Switch/Sign-out */}
              <div className="pt-3 border-t border-[#163826] flex items-center justify-between gap-3">
                {userProfile.mode === 'guest' ? (
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isBusy}
                    className="flex-1 px-4 py-2.5 bg-[#00ff66] hover:bg-[#39ff14] text-black font-bold rounded flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>Link Google Account &amp; Sync Cloud</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-[#5da87d]">
                    All missions and custom scenarios are synced to Cloud Firestore.
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isBusy}
                  className="px-3.5 py-2 bg-[#2a1214] hover:bg-[#3d191c] text-[#ff858d] border border-[#5e2226] rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{userProfile.mode === 'google' ? 'Sign Out' : 'Switch Mode'}</span>
                </button>
              </div>
            </>
          ) : (
            /* Initial Login Gate */
            <>
              <p className="text-[#a2f5bf] leading-relaxed text-[12px]">
                Select how to store your Flight Academy mission progress, official ATC certification, and custom scenarios:
              </p>

              {/* Option 1: Google Cloud Account */}
              <div className="p-4 bg-[#0b1b13] border border-[#1d4d33] rounded-md flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">Permanent Account (Google Cloud)</h3>
                  <p className="text-[11px] text-[#7ec29a] mt-1">
                    Save your certification record and custom scenarios permanently in the cloud across any device.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isBusy}
                  className="w-full py-2.5 px-4 bg-[#00ff66] hover:bg-[#39ff14] disabled:opacity-60 text-black font-bold rounded flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isBusy ? 'Connecting to Google...' : 'Sign In with Google'}</span>
                </button>
              </div>

              {/* Option 2: Guest Mode */}
              <form
                onSubmit={handleGuestEnter}
                className="p-4 bg-[#0a1610] border border-[#163826] rounded-md flex flex-col gap-3"
              >
                <div>
                  <h3 className="text-sm font-bold text-[#00e5ff]">Quick Guest Access (Local Storage)</h3>
                  <p className="text-[11px] text-[#7ec29a] mt-1">
                    Start immediately without an email address. Progress saves locally in your browser and can be upgraded to Google anytime.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={32}
                    required
                    value={callsignInput}
                    onChange={e => setCallsignInput(e.target.value)}
                    className="flex-1 bg-[#050d09] border border-[#1a422d] focus:border-[#00e5ff] rounded px-3 py-2 text-white font-mono outline-none"
                    placeholder="Callsign (e.g. CTR-ALPHA1)"
                  />
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="px-4 py-2 bg-[#0f2e3b] hover:bg-[#154254] text-[#00e5ff] border border-[#1f627d] rounded font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Enter as Guest</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
