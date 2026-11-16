/**
 * SKYCONTROL - Official ATC Approach Director Certificate Modal
 * Issued upon completing all 5 Flight Academy missions.
 * Supports high-resolution PNG export via offscreen canvas and printing.
 */

import React from 'react';
import { Award, CheckCircle2, Download, Printer, X } from 'lucide-react';
import { UserProfileData } from '../types';
import { ACADEMY_MISSIONS } from '../engine/missions';

interface CertificateModalProps {
  isOpen: boolean;
  userProfile: UserProfileData | null;
  onClose: () => void;
}

export const CertificateModal: React.FC<CertificateModalProps> = ({
  isOpen,
  userProfile,
  onClose,
}) => {
  if (!isOpen || !userProfile) return null;

  const certId = userProfile.certificateId || 'SKY-ATC-QUALIFIED';
  const issueDate = userProfile.issuedAt
    ? new Date(userProfile.issuedAt).toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      })
    : new Date().toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });

  const handleDownloadPng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 960;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background & double hairline frame
    ctx.fillStyle = '#06110c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 4;
    ctx.strokeRect(44, 44, canvas.width - 88, canvas.height - 88);

    ctx.strokeStyle = '#1d4d33';
    ctx.lineWidth = 2;
    ctx.strokeRect(62, 62, canvas.width - 124, canvas.height - 124);

    // Header
    ctx.textAlign = 'center';
    ctx.fillStyle = '#00ff66';
    ctx.font = 'bold 28px "IBM Plex Mono", monospace';
    ctx.fillText('SKYCONTROL FLIGHT ACADEMY', canvas.width / 2, 150);

    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 46px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('OFFICIAL ATC APPROACH DIRECTOR CERTIFICATE', canvas.width / 2, 225);

    ctx.fillStyle = '#85cca1';
    ctx.font = '24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(
      'This certifies that the controller below has completed all five radar qualification checkrides:',
      canvas.width / 2,
      305
    );

    // Recipient Callsign
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px "IBM Plex Mono", monospace';
    ctx.fillText(userProfile.callsign, canvas.width / 2, 415);

    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 260, 445);
    ctx.lineTo(canvas.width / 2 + 260, 445);
    ctx.stroke();

    // Endorsed Ratings
    ctx.fillStyle = '#a2f5bf';
    ctx.font = '22px "IBM Plex Mono", monospace';
    ctx.fillText(
      'RATINGS: EGLL PARALLEL · OIII HIGH-ELEV · TRN1 CROSSWIND · SQUAWK 7700 · KJFK INTERSECTING',
      canvas.width / 2,
      515
    );

    // Stats Row
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 26px "IBM Plex Mono", monospace';
    ctx.fillText(
      `BEST EFFICIENCY: ${userProfile.bestScore}%   |   LANDINGS: ${userProfile.totalLandings}   |   DEPARTURES: ${userProfile.totalDepartures}`,
      canvas.width / 2,
      620
    );

    // Footer Serial & Date
    ctx.fillStyle = '#70b88d';
    ctx.font = '22px "IBM Plex Mono", monospace';
    ctx.fillText(`CERTIFICATE NO: ${certId}   ·   ISSUED: ${issueDate}`, canvas.width / 2, 790);

    const link = document.createElement('a');
    link.download = `SKYCONTROL_ATC_${userProfile.callsign.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#07140e] border-2 border-[#ffd166]/70 rounded-lg shadow-2xl overflow-hidden select-none">
        {/* Top Action Bar */}
        <div className="px-5 py-3 bg-[#0c1d14] border-b border-[#1b422d] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#ffd166]">
            <Award className="w-5 h-5" />
            <span className="font-bold text-sm">Official Air Traffic Control (ATC) Certificate</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#163826] text-[#5da87d] hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Certificate Document Surface */}
        <div className="p-7 flex flex-col items-center text-center gap-4 border-b border-[#163826]">
          <div className="text-xs font-mono tracking-widest text-[#00ff66]">
            SKYCONTROL FLIGHT ACADEMY · TERMINAL APPROACH RATING
          </div>

          <h2 className="text-xl md:text-2xl font-bold text-[#ffd166] tracking-wide" style={{ textWrap: 'balance' }}>
            OFFICIAL ATC APPROACH DIRECTOR CERTIFICATE
          </h2>

          <p className="text-xs text-[#a2f5bf] max-w-lg leading-relaxed">
            This certifies that the controller below has passed all five terminal radar qualification stages, parallel and intersecting runway operations, severe crosswind approaches, and Squawk 7700 emergency management.
          </p>

          <div className="py-3 px-8 border-y border-[#1f5437] my-1">
            <div className="text-[11px] font-mono text-[#5da87d]">CONTROLLER CALLSIGN</div>
            <div className="text-2xl font-bold font-mono text-white tracking-wider mt-1">
              {userProfile.callsign}
            </div>
          </div>

          {/* Completed Missions Verification */}
          <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-left text-[11px]">
            {ACADEMY_MISSIONS.map(m => (
              <div key={m.id} className="flex items-center gap-1.5 text-[#a2f5bf]">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00ff66] shrink-0" />
                <span className="truncate">{m.number}. {m.title}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] font-mono text-[#70b88d] pt-2 tabular-nums">
            <span>SERIAL: <b className="text-white">{certId}</b></span>
            <span>·</span>
            <span>ISSUED: <b className="text-white">{issueDate}</b></span>
            <span>·</span>
            <span>BEST SCR: <b className="text-[#00ff66]">{userProfile.bestScore}%</b></span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-[#0a1811] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPng}
              className="px-4 py-2 bg-[#ffd166] hover:bg-[#ffe08a] text-black font-bold rounded flex items-center gap-1.5 transition-colors text-xs whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Download Certificate (PNG)</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-[#123321] hover:bg-[#19472f] text-[#00ff66] border border-[#246340] rounded font-semibold flex items-center gap-1.5 transition-colors text-xs whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#0f281a] hover:bg-[#183d29] text-[#d1e7dd] border border-[#1e4a31] rounded font-semibold text-xs transition-colors whitespace-nowrap"
          >
            Return to Radar
          </button>
        </div>
      </div>
    </div>
  );
};
