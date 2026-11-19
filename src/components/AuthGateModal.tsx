/**
 * SKYCONTROL - Strict Controller Authentication Gate & Account Console
 * Supports:
 *   1. Offline Local Account (Register & Sign In with zero internet connectivity)
 *   2. Online Cloud Account (Firebase Email/Password + Google Sign-In)
 * Enforces personal credentials before entering SKYCONTROL, with isolated user data.
 */

import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Cloud,
  Edit3,
  HardDrive,
  KeyRound,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  WifiOff,
  X,
} from 'lucide-react';
import { UserProfileData } from '../types';
import {
  isNetworkAuthError,
  mapAuthErrorMessage,
  registerOfflineAccount,
  registerWithEmailPassword,
  reloadCurrentUser,
  resendVerificationEmail,
  sendAccountPasswordReset,
  signInOfflineAccount,
  signInWithEmailPassword,
  signInWithGoogle,
  updateControllerCallsign,
} from '../services/persistenceService';

interface AuthGateModalProps {
  isOpen: boolean;
  canDismiss: boolean;
  userProfile: UserProfileData | null;
  pendingVerificationUser: User | null;
  onClose: () => void;
  onProfileReady: (profile: UserProfileData) => void;
  onOfflineAuthenticated: (profile: UserProfileData) => Promise<void> | void;
  onVerificationComplete: (user: User) => Promise<void>;
  onRegisterCallsignHint: (callsign: string) => void;
  onSignedOut: () => Promise<void> | void;
  onOpenCertificate: () => void;
}

type AuthTab = 'signin' | 'register';
type AuthScope = 'offline' | 'cloud';

export const AuthGateModal: React.FC<AuthGateModalProps> = ({
  isOpen,
  canDismiss,
  userProfile,
  pendingVerificationUser,
  onClose,
  onProfileReady,
  onOfflineAuthenticated,
  onVerificationComplete,
  onRegisterCallsignHint,
  onSignedOut,
  onOpenCertificate,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [authScope, setAuthScope] = useState<AuthScope>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'cloud'
  );
  const [authTab, setAuthTab] = useState<AuthTab>('signin');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [callsignInput, setCallsignInput] = useState(
    userProfile?.callsign || 'CTR-ALPHA1'
  );
  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [suggestOfflineSwitch, setSuggestOfflineSwitch] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setAuthScope('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (userProfile?.callsign) {
      setCallsignInput(userProfile.callsign);
    }
  }, [userProfile?.callsign]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    if (!isOnline) {
      setErrorMsg('No internet connection. Use Offline Local Mode above to sign in or register.');
      setSuggestOfflineSwitch(true);
      return;
    }
    setIsBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    setSuggestOfflineSwitch(false);
    try {
      await signInWithGoogle();
    } catch (err) {
      setErrorMsg(mapAuthErrorMessage(err));
      if (isNetworkAuthError(err)) setSuggestOfflineSwitch(true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    setSuggestOfflineSwitch(false);

    if (!emailInput.trim() || !passwordInput) {
      setErrorMsg(
        authScope === 'offline'
          ? 'Please enter your offline username/email and password.'
          : 'Please enter both your email address and password.'
      );
      return;
    }

    setIsBusy(true);
    try {
      if (authScope === 'offline') {
        const profile = await signInOfflineAccount(emailInput, passwordInput);
        await onOfflineAuthenticated(profile);
      } else {
        await signInWithEmailPassword(emailInput, passwordInput);
      }
    } catch (err) {
      setErrorMsg(authScope === 'offline' && err instanceof Error ? err.message : mapAuthErrorMessage(err));
      if (authScope === 'cloud' && isNetworkAuthError(err)) {
        setSuggestOfflineSwitch(true);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    setSuggestOfflineSwitch(false);

    const trimmedCallsign = callsignInput.trim();
    if (trimmedCallsign.length < 2) {
      setErrorMsg('Controller callsign must be at least 2 characters.');
      return;
    }
    if (!emailInput.trim() || emailInput.trim().length < 3) {
      setErrorMsg(
        authScope === 'offline'
          ? 'Please enter an offline username or email (at least 3 characters).'
          : 'Please enter a valid email address.'
      );
      return;
    }
    if (passwordInput.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      setErrorMsg('Password and confirmation do not match.');
      return;
    }

    setIsBusy(true);
    try {
      if (authScope === 'offline') {
        const profile = await registerOfflineAccount(trimmedCallsign, emailInput, passwordInput);
        await onOfflineAuthenticated(profile);
      } else {
        onRegisterCallsignHint(trimmedCallsign);
        await registerWithEmailPassword(trimmedCallsign, emailInput, passwordInput);
        setStatusMsg(
          'Account created. Check your inbox for the verification email to unlock your controller logbook.'
        );
      }
    } catch (err) {
      setErrorMsg(authScope === 'offline' && err instanceof Error ? err.message : mapAuthErrorMessage(err));
      if (authScope === 'cloud' && isNetworkAuthError(err)) {
        setSuggestOfflineSwitch(true);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handlePasswordReset = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setSuggestOfflineSwitch(false);
    const targetEmail = emailInput.trim() || userProfile?.email || '';
    if (!targetEmail) {
      setErrorMsg('Enter your email address first to receive a password reset link.');
      return;
    }
    setIsBusy(true);
    try {
      await sendAccountPasswordReset(targetEmail);
      setStatusMsg(`Password reset instructions sent to ${targetEmail}.`);
    } catch (err) {
      setErrorMsg(mapAuthErrorMessage(err));
      if (isNetworkAuthError(err)) setSuggestOfflineSwitch(true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCheckVerification = async () => {
    setIsBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const refreshed = await reloadCurrentUser();
      if (refreshed && refreshed.emailVerified) {
        await onVerificationComplete(refreshed);
      } else {
        setErrorMsg(
          'Email is not verified yet. Open the verification link in your inbox, then click Continue again.'
        );
      }
    } catch (err) {
      setErrorMsg(mapAuthErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!pendingVerificationUser) return;
    setIsBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await resendVerificationEmail(pendingVerificationUser);
      setStatusMsg(
        `Verification email re-sent to ${pendingVerificationUser.email || 'your address'}.`
      );
    } catch (err) {
      setErrorMsg(mapAuthErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
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
    setStatusMsg(null);
    try {
      await onSignedOut();
      setPasswordInput('');
      setConfirmPasswordInput('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to sign out');
    } finally {
      setIsBusy(false);
    }
  };

  const completedCount = userProfile?.completedMissions.length || 0;

  return (
    <div className="fixed inset-0 z-50 bg-[#040906]/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-[#08130e] border border-[#1b422d] rounded-lg shadow-2xl flex flex-col overflow-hidden select-none my-auto">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#0c1d14] border-b border-[#163826] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#00ff66]" />
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                {userProfile
                  ? 'Controller Account & Rating'
                  : pendingVerificationUser
                  ? 'Verify Controller Email'
                  : 'SKYCONTROL · Controller Sign-In'}
              </h2>
              {!userProfile && !pendingVerificationUser && (
                <p className="text-[11px] font-mono text-[#70b88d]">
                  Personal account required · Works offline (local) &amp; online (cloud)
                </p>
              )}
            </div>
          </div>

          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[#163826] text-[#5da87d] hover:text-white transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-[#361114] border border-[#ff3344]/60 rounded flex flex-col gap-2 text-[#ffb3b8]">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#ff4d4d] shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
              {suggestOfflineSwitch && authScope === 'cloud' && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthScope('offline');
                    setErrorMsg(null);
                    setSuggestOfflineSwitch(false);
                  }}
                  className="self-start px-3 py-1.5 bg-[#123823] hover:bg-[#194d30] text-[#00ff66] border border-[#246340] rounded font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Switch to Offline Local Mode</span>
                </button>
              )}
            </div>
          )}

          {statusMsg && (
            <div className="p-3 bg-[#0c2619] border border-[#00ff66]/50 rounded flex items-start gap-2 text-[#a2f5bf]">
              <CheckCircle2 className="w-4 h-4 text-[#00ff66] shrink-0 mt-0.5" />
              <span className="leading-relaxed">{statusMsg}</span>
            </div>
          )}

          {/* State 1: Signed-in Profile Console */}
          {userProfile ? (
            <>
              <div className="pb-4 border-b border-[#163826] flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-bold text-white font-mono">
                      {userProfile.callsign}
                    </div>
                    <div className="text-[11px] text-[#70b88d] mt-0.5 flex flex-wrap items-center gap-2">
                      <span>
                        {userProfile.authProvider === 'offline'
                          ? `Offline Local Account (${userProfile.email || userProfile.uid})`
                          : userProfile.authProvider === 'google'
                          ? `Google Account (${userProfile.email || 'Verified'})`
                          : `Cloud Email Account (${userProfile.email || 'Verified'})`}
                      </span>
                      <span>·</span>
                      <span
                        className={
                          userProfile.certified ? 'text-[#ffd166] font-semibold' : 'text-[#85cca1]'
                        }
                      >
                        {userProfile.certified ? 'Certified ATC Director' : 'In Training'}
                      </span>
                    </div>
                  </div>

                  {userProfile.certified && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenCertificate();
                      }}
                      className="px-3 py-2 bg-[#2b240e] hover:bg-[#3d3313] border border-[#ffd166]/60 text-[#ffd166] rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Award className="w-4 h-4" />
                      <span>Certificate</span>
                    </button>
                  )}
                </div>

                {/* Telemetry Summary Row */}
                <div className="grid grid-cols-4 gap-2 pt-1 font-mono tabular-nums text-center">
                  <div className="p-2 bg-[#0b1a12] border border-[#163826] rounded">
                    <div className="text-[10px] text-[#5da87d]">ACADEMY</div>
                    <div className="text-sm font-bold text-[#00ff66]">{completedCount}/5</div>
                  </div>
                  <div className="p-2 bg-[#0b1a12] border border-[#163826] rounded">
                    <div className="text-[10px] text-[#5da87d]">LANDINGS</div>
                    <div className="text-sm font-bold text-[#00e5ff]">
                      {userProfile.totalLandings}
                    </div>
                  </div>
                  <div className="p-2 bg-[#0b1a12] border border-[#163826] rounded">
                    <div className="text-[10px] text-[#5da87d]">DEPARTURES</div>
                    <div className="text-sm font-bold text-white">
                      {userProfile.totalDepartures}
                    </div>
                  </div>
                  <div className="p-2 bg-[#0b1a12] border border-[#163826] rounded">
                    <div className="text-[10px] text-[#5da87d]">BEST SCR</div>
                    <div className="text-sm font-bold text-[#ffd166]">
                      {userProfile.bestScore}%
                    </div>
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

              <div className="pt-3 border-t border-[#163826] flex items-center justify-between gap-3">
                <span className="text-[11px] text-[#5da87d]">
                  {userProfile.authProvider === 'offline'
                    ? 'Records, logbook, radar layers & audio saved locally offline.'
                    : 'Records, logbook, radar layers & audio synced to Cloud Firestore.'}
                </span>

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isBusy}
                  className="px-3.5 py-2 bg-[#2a1214] hover:bg-[#3d191c] text-[#ff858d] border border-[#5e2226] rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out / Switch</span>
                </button>
              </div>
            </>
          ) : pendingVerificationUser ? (
            /* State 2: Email Verification Checkpoint */
            <div className="flex flex-col gap-4">
              <div className="p-4 bg-[#0a1811] border border-[#1d4d33] rounded space-y-2">
                <div className="flex items-center gap-2 text-[#00e5ff] font-semibold">
                  <Mail className="w-4 h-4" />
                  <span>Email Verification Required</span>
                </div>
                <p className="text-[#a2f5bf] leading-relaxed text-[11px]">
                  A verification link was sent to{' '}
                  <b className="text-white font-mono">
                    {pendingVerificationUser.email || 'your email'}
                  </b>
                  . Click the link in your inbox (check spam if missing), then press{' '}
                  <b className="text-[#00ff66]">I&apos;ve Verified — Continue</b>.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleCheckVerification}
                  disabled={isBusy}
                  className="w-full py-2.5 px-4 bg-[#00ff66] hover:bg-[#39ff14] disabled:opacity-60 text-black font-bold rounded flex items-center justify-center gap-2 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
                  <span>I&apos;ve Verified — Continue</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={isBusy}
                    className="py-2 px-3 bg-[#0d2217] hover:bg-[#163826] text-[#a2f5bf] border border-[#1d4d33] rounded font-semibold transition-colors"
                  >
                    Resend Email
                  </button>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isBusy}
                    className="py-2 px-3 bg-[#2a1214] hover:bg-[#3d191c] text-[#ff858d] border border-[#5e2226] rounded font-semibold transition-colors"
                  >
                    Use Another Account
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* State 3: Strict Login / Create Account Gate (Offline Local + Online Cloud) */
            <>
              {/* Account Scope Selector: Offline Local vs Online Cloud */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#050d09] border border-[#163826] rounded">
                <button
                  type="button"
                  onClick={() => {
                    setAuthScope('offline');
                    setErrorMsg(null);
                    setStatusMsg(null);
                    setSuggestOfflineSwitch(false);
                  }}
                  className={`py-2 px-3 rounded text-left transition-colors flex items-center gap-2 ${
                    authScope === 'offline'
                      ? 'bg-[#123823] text-[#00ff66] border border-[#246340] font-semibold'
                      : 'text-[#6ba885] hover:text-white border border-transparent'
                  }`}
                >
                  <HardDrive className="w-3.5 h-3.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] leading-tight">Offline Local</div>
                    <div className="text-[10px] text-[#7ec29a] font-normal truncate">
                      No internet needed
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthScope('cloud');
                    setErrorMsg(null);
                    setStatusMsg(null);
                    setSuggestOfflineSwitch(false);
                  }}
                  className={`py-2 px-3 rounded text-left transition-colors flex items-center gap-2 ${
                    authScope === 'cloud'
                      ? 'bg-[#0e2d3b] text-[#00e5ff] border border-[#1f627d] font-semibold'
                      : 'text-[#6ba885] hover:text-white border border-transparent'
                  }`}
                >
                  {isOnline ? (
                    <Cloud className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 shrink-0 text-[#ffd166]" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[11px] leading-tight">Online Cloud</div>
                    <div className="text-[10px] text-[#7ec29a] font-normal truncate">
                      {isOnline ? 'Firebase + Google' : 'Currently offline'}
                    </div>
                  </div>
                </button>
              </div>

              {/* Sign In / Create Account Tabs */}
              <div className="flex border-b border-[#163826]">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('signin');
                    setErrorMsg(null);
                    setStatusMsg(null);
                  }}
                  className={`flex-1 py-2.5 text-center font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                    authTab === 'signin'
                      ? 'border-[#00ff66] text-[#00ff66]'
                      : 'border-transparent text-[#6ba885] hover:text-white'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('register');
                    setErrorMsg(null);
                    setStatusMsg(null);
                  }}
                  className={`flex-1 py-2.5 text-center font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                    authTab === 'register'
                      ? 'border-[#00e5ff] text-[#00e5ff]'
                      : 'border-transparent text-[#6ba885] hover:text-white'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Create Account</span>
                </button>
              </div>

              {authTab === 'signin' ? (
                <form onSubmit={handleSignInSubmit} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-[#a2f5bf]">
                      {authScope === 'offline' ? 'Offline Username or Email' : 'Controller Email'}
                    </label>
                    <input
                      type={authScope === 'offline' ? 'text' : 'email'}
                      required
                      autoComplete="username"
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                      placeholder={
                        authScope === 'offline' ? 'pilot1 or pilot@local' : 'controller@sector.aero'
                      }
                      className="bg-[#050d09] border border-[#1a422d] focus:border-[#00ff66] rounded px-3 py-2 text-white font-mono outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-[#a2f5bf]">Password</label>
                      {authScope === 'cloud' && (
                        <button
                          type="button"
                          onClick={handlePasswordReset}
                          disabled={isBusy}
                          className="text-[11px] text-[#00e5ff] hover:underline"
                        >
                          Forgot Password?
                        </button>
                      )}
                    </div>
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={passwordInput}
                      onChange={e => setPasswordInput(e.target.value)}
                      placeholder="Enter password"
                      className="bg-[#050d09] border border-[#1a422d] focus:border-[#00ff66] rounded px-3 py-2 text-white font-mono outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isBusy}
                    className="w-full py-2.5 px-4 bg-[#00ff66] hover:bg-[#39ff14] disabled:opacity-60 text-black font-bold rounded flex items-center justify-center gap-2 transition-colors mt-1"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>
                      {isBusy
                        ? 'Authenticating...'
                        : authScope === 'offline'
                        ? 'Sign In Offline'
                        : 'Sign In with Email'}
                    </span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-[#a2f5bf]">
                      Controller Callsign (2–32 chars)
                    </label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={32}
                      value={callsignInput}
                      onChange={e => setCallsignInput(e.target.value)}
                      placeholder="e.g. CTR-FALCON1"
                      className="bg-[#050d09] border border-[#1a422d] focus:border-[#00e5ff] rounded px-3 py-2 text-white font-mono outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-[#a2f5bf]">
                      {authScope === 'offline' ? 'Offline Username or Email' : 'Email Address'}
                    </label>
                    <input
                      type={authScope === 'offline' ? 'text' : 'email'}
                      required
                      minLength={3}
                      autoComplete="username"
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                      placeholder={
                        authScope === 'offline' ? 'pilot1 or pilot@local' : 'controller@sector.aero'
                      }
                      className="bg-[#050d09] border border-[#1a422d] focus:border-[#00e5ff] rounded px-3 py-2 text-white font-mono outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-[#a2f5bf]">
                        Password (6+ chars)
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={passwordInput}
                        onChange={e => setPasswordInput(e.target.value)}
                        placeholder="Create password"
                        className="bg-[#050d09] border border-[#1a422d] focus:border-[#00e5ff] rounded px-3 py-2 text-white font-mono outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-[#a2f5bf]">
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={confirmPasswordInput}
                        onChange={e => setConfirmPasswordInput(e.target.value)}
                        placeholder="Repeat password"
                        className="bg-[#050d09] border border-[#1a422d] focus:border-[#00e5ff] rounded px-3 py-2 text-white font-mono outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isBusy}
                    className="w-full py-2.5 px-4 bg-[#00e5ff] hover:bg-[#4ff0ff] disabled:opacity-60 text-black font-bold rounded flex items-center justify-center gap-2 transition-colors mt-1"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>
                      {isBusy
                        ? 'Creating Account...'
                        : authScope === 'offline'
                        ? 'Create Offline Account (No Internet)'
                        : 'Create Cloud Account'}
                    </span>
                  </button>
                </form>
              )}

              {authScope === 'offline' ? (
                <div className="pt-2 border-t border-[#163826] text-[11px] text-[#70b88d] leading-relaxed">
                  Offline accounts store your records, activity logbook, radar layers &amp; audio settings privately on this device without internet or email verification.
                </div>
              ) : (
                <>
                  {/* Divider */}
                  <div className="flex items-center gap-3 py-0.5 text-[10px] font-mono text-[#4f8b69]">
                    <div className="flex-1 h-px bg-[#163826]" />
                    <span>OR</span>
                    <div className="flex-1 h-px bg-[#163826]" />
                  </div>

                  {/* Google Sign-In */}
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isBusy}
                    className="w-full py-2.5 px-4 bg-[#0c2116] hover:bg-[#133322] disabled:opacity-60 text-white border border-[#246340] font-semibold rounded flex items-center justify-center gap-2 transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#00ff66]" />
                    <span>{isBusy ? 'Connecting...' : 'Continue with Google'}</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
