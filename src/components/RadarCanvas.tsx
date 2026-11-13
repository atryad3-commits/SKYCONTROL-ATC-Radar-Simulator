/**
 * SKYCONTROL - Professional ATC Radar Scope (atcradarsimulator.com style)
 * Fully redesigned to specification:
 * - Precision scan-driven radar tracking with RadarTrackingEngine:
 *   CONFIRMED, PREDICTED, STALE, LOST track states with authentic phosphor bloom & trails.
 * - Mouse-based interactive heading vector handle with turn arc preview,
 *   projected trajectory, conflict lookahead, and explicit confirmation dialog.
 * - Interactive Direct-To waypoint clicking with flight path preview & confirmation.
 * - Tactical distance and bearing measurement ruler.
 * - Structured 3-line ICAO data blocks with leader line persistence and collision avoidance.
 * - Professional floating toolbar: Select, Heading Vector, Direct-To, Measure, Zoom, Center.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { calculateBearing, calculateDistance, normalizeHeading } from '../engine/physics';
import { TrackStatus, RadarTrack } from '../engine/radarTracker';
import { getAltitudeColor, getAltitudeRgba, ALTITUDE_BANDS } from '../utils/altitudeColor';
import { 
  MousePointer, 
  Compass, 
  Navigation, 
  Ruler, 
  ZoomIn, 
  ZoomOut, 
  Crosshair, 
  RotateCcw,
  Plane,
  Radio
} from 'lucide-react';

// Active holding pattern geometry computed dynamically from airport waypoints
interface HoldingStackDef {
  name: string;
  x: number; // NM
  y: number; // NM
  inboundCourse: number; // Magnetic heading
  turnDirection: 'Right' | 'Left';
}

export type RadarTool = 'SELECT' | 'HEADING_VECTOR' | 'DIRECT_TO' | 'MEASURE';

export const RadarCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Store bindings
  const aircraft = useSimulationStore(state => state.aircraft);
  const selectedAircraftId = useSimulationStore(state => state.selectedAircraftId);
  const airport = useSimulationStore(state => state.airport);
  const activeLandingRunwayId = useSimulationStore(state => state.activeLandingRunwayId);
  const activeDepartureRunwayId = useSimulationStore(state => state.activeDepartureRunwayId);
  const radarLayers = useSimulationStore(state => state.radarLayers);
  const conflicts = useSimulationStore(state => state.conflicts);
  const radarTracks = useSimulationStore(state => state.radarTracks);
  const antennaAzimuth = useSimulationStore(state => state.antennaAzimuth);
  const activeTransmission = useSimulationStore(state => state.activeTransmission);

  const selectedAircraft = useMemo(
    () => aircraft.find(a => a.id === selectedAircraftId) || null,
    [aircraft, selectedAircraftId]
  );

  const holdingStacks = useMemo<HoldingStackDef[]>(() => {
    return airport.waypoints
      .filter(wp => wp.isHoldingFix)
      .map(wp => ({
        name: wp.name,
        x: wp.position.x,
        y: wp.position.y,
        inboundCourse: wp.defaultHoldingHeading ?? 270,
        turnDirection: wp.holdingTurnDirection ?? 'Right',
      }));
  }, [airport]);

  const selectAircraft = useSimulationStore(state => state.selectAircraft);
  const setHeading = useSimulationStore(state => state.setHeading);
  const directTo = useSimulationStore(state => state.directTo);
  const repositionTag = useSimulationStore(state => state.repositionTag);

  // Radar Viewport Transformation State
  const [rangeNM, setRangeNM] = useState<number>(35);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Active radar tool
  const [activeTool, setActiveTool] = useState<RadarTool>('SELECT');

  // Interactive mouse control state
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggingTagId, setDraggingTagId] = useState<string | null>(null);

  // Interactive Heading Vector Drag state
  const [isDraggingHeading, setIsDraggingHeading] = useState<boolean>(false);
  const [previewHeading, setPreviewHeading] = useState<number | null>(null);

  // Measuring ruler state
  const [measuringRuler, setMeasuringRuler] = useState<{
    start: { x: number; y: number };
    current: { x: number; y: number };
  } | null>(null);

  // Hover coordinate readout
  const [cursorWorldPos, setCursorWorldPos] = useState<{ x: number; y: number } | null>(null);

  // Coordinate Conversion Helpers
  const getScreenMetrics = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { width: 800, height: 600, centerX: 400, centerY: 300, pxPerNM: 10 };
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2 + panOffset.x;
    const centerY = height / 2 + panOffset.y;
    const minDim = Math.min(width, height);
    const pxPerNM = (minDim * 0.44) / rangeNM;
    return { width, height, centerX, centerY, pxPerNM };
  }, [panOffset, rangeNM]);

  const worldToScreen = useCallback((wx: number, wy: number) => {
    const { centerX, centerY, pxPerNM } = getScreenMetrics();
    return {
      sx: centerX + wx * pxPerNM,
      sy: centerY - wy * pxPerNM, // North is up (negative screen Y)
    };
  }, [getScreenMetrics]);

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const { centerX, centerY, pxPerNM } = getScreenMetrics();
    return {
      wx: (sx - centerX) / pxPerNM,
      wy: (centerY - sy) / pxPerNM,
    };
  }, [getScreenMetrics]);

  // Map of radar track by aircraft ID for fast lookup
  const trackMap = useMemo(() => {
    const map = new Map<string, RadarTrack>();
    for (const trk of radarTracks) {
      map.set(trk.aircraftId, trk);
    }
    return map;
  }, [radarTracks]);

  // Keyboard Shortcuts (Part 3.2)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          setIsDraggingHeading(false);
          setPreviewHeading(null);
          setMeasuringRuler(null);
          setActiveTool('SELECT');
          break;
        case 'h':
        case 'H':
          setActiveTool('HEADING_VECTOR');
          break;
        case 'd':
        case 'D':
          setActiveTool('DIRECT_TO');
          break;
        case 'm':
        case 'M':
          setActiveTool('MEASURE');
          break;
        case '+':
        case '=':
          setRangeNM(prev => Math.max(12, prev - 5));
          break;
        case '-':
        case '_':
          setRangeNM(prev => Math.min(65, prev + 5));
          break;
        case 'c':
        case 'C':
          setPanOffset({ x: 0, y: 0 });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const { centerX, centerY, pxPerNM } = {
      centerX: width / 2 + panOffset.x,
      centerY: height / 2 + panOffset.y,
      pxPerNM: (Math.min(width, height) * 0.44) / rangeNM,
    };

    // 1. Dark CRT Phosphor Scope Background
    ctx.fillStyle = '#030805';
    ctx.fillRect(0, 0, width, height);

    // 2. Rotating Plan Position Indicator (PPI) Sweep Beam & Phosphor Tail
    if (radarLayers.radarSweep) {
      const azimuthRad = (antennaAzimuth * Math.PI) / 180;
      const sweepLength = Math.max(width, height) * 1.3;

      // Convert navigation azimuth (0 = North, clockwise) to Canvas 2D arc angle (0 = East, clockwise)
      const canvasSweepAngle = azimuthRad - Math.PI / 2;
      const tailAngleRad = 0.52; // ~30 degree trailing phosphor glow

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      // Sweep pie wedge (fading phosphor tail trailing behind leading sweep line)
      ctx.arc(centerX, centerY, sweepLength, canvasSweepAngle - tailAngleRad, canvasSweepAngle, false);
      ctx.closePath();

      const sweepGradient = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, sweepLength);
      sweepGradient.addColorStop(0, 'rgba(0, 255, 102, 0.22)');
      sweepGradient.addColorStop(0.5, 'rgba(0, 255, 102, 0.08)');
      sweepGradient.addColorStop(1, 'rgba(0, 255, 102, 0.00)');
      ctx.fillStyle = sweepGradient;
      ctx.fill();

      // Sharp primary sweep line aligned exactly at the leading edge of the beam
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + sweepLength * Math.sin(azimuthRad),
        centerY - sweepLength * Math.cos(azimuthRad)
      );
      ctx.strokeStyle = 'rgba(57, 255, 20, 0.85)';
      ctx.lineWidth = 2.0;
      ctx.stroke();
      ctx.restore();
    }

    // 3. Calibrated Range Rings (5, 10, 15, 20, 30, 40 NM)
    if (radarLayers.rangeRings) {
      const rings = [5, 10, 15, 20, 30, 40];
      ctx.strokeStyle = '#0e2b1b';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);

      for (const r of rings) {
        const radiusPx = r * pxPerNM;
        if (radiusPx > 0 && radiusPx < Math.max(width, height)) {
          ctx.beginPath();
          ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
          ctx.stroke();

          // Range ring text tag
          ctx.fillStyle = '#1c5e3a';
          ctx.font = '10px "IBM Plex Mono", monospace';
          ctx.fillText(`${r} NM`, centerX + 8, centerY - radiusPx + 12);
        }
      }
      ctx.setLineDash([]);

      // Cardinal axis crosshairs through airport center
      ctx.strokeStyle = '#0c2618';
      ctx.beginPath();
      ctx.moveTo(centerX - 45 * pxPerNM, centerY);
      ctx.lineTo(centerX + 45 * pxPerNM, centerY);
      ctx.moveTo(centerX, centerY - 45 * pxPerNM);
      ctx.lineTo(centerX, centerY + 45 * pxPerNM);
      ctx.stroke();

      // Outer 360-degree Compass Rose Azimuth Dial
      const compassRadius = 32 * pxPerNM;
      if (compassRadius > 80 && compassRadius < Math.max(width, height)) {
        ctx.strokeStyle = '#143d26';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, compassRadius, 0, Math.PI * 2);
        ctx.stroke();

        for (let deg = 0; deg < 360; deg += 5) {
          const rad = (deg * Math.PI) / 180;
          const isMajor = deg % 30 === 0;
          const isTen = deg % 10 === 0;
          const tickLen = isMajor ? 8 : isTen ? 5 : 3;

          const outerX = centerX + compassRadius * Math.sin(rad);
          const outerY = centerY - compassRadius * Math.cos(rad);
          const innerX = centerX + (compassRadius - tickLen) * Math.sin(rad);
          const innerY = centerY - (compassRadius - tickLen) * Math.cos(rad);

          ctx.strokeStyle = isMajor ? '#246b43' : '#143d26';
          ctx.beginPath();
          ctx.moveTo(innerX, innerY);
          ctx.lineTo(outerX, outerY);
          ctx.stroke();

          if (isMajor) {
            ctx.fillStyle = '#2d8553';
            ctx.font = '9px "IBM Plex Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const labelRadius = compassRadius - 16;
            ctx.fillText(
              deg.toString().padStart(3, '0'),
              centerX + labelRadius * Math.sin(rad),
              centerY - labelRadius * Math.cos(rad)
            );
          }
        }
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }
    }

    // 4. Airport Runways & Extended Centerlines
    const drawnPhysicalRunways = new Set<string>();
    for (const rwy of airport.runways) {
      const thPos = worldToScreen(rwy.threshold.x, rwy.threshold.y);
      const endPos = worldToScreen(rwy.endPosition.x, rwy.endPosition.y);
      const isArr = rwy.id === activeLandingRunwayId;
      const isDep = rwy.id === activeDepartureRunwayId;

      // Runway surface concrete bar (draw once per physical pair unless highlighted)
      const pairKey = [
        `${rwy.threshold.x.toFixed(1)},${rwy.threshold.y.toFixed(1)}`,
        `${rwy.endPosition.x.toFixed(1)},${rwy.endPosition.y.toFixed(1)}`,
      ]
        .sort()
        .join('|');
      if (!drawnPhysicalRunways.has(pairKey) || isArr || isDep) {
        drawnPhysicalRunways.add(pairKey);
        ctx.strokeStyle = isArr ? '#00ff66' : isDep ? '#00e5ff' : '#1b5e38';
        ctx.lineWidth = isArr || isDep ? 4 : 2.5;
        ctx.beginPath();
        ctx.moveTo(thPos.sx, thPos.sy);
        ctx.lineTo(endPos.sx, endPos.sy);
        ctx.stroke();
      }

      // Extended ILS Centerline Localizer Feather (15 NM) for active or primary runways
      if (radarLayers.extendedCenterlines) {
        const rad = (rwy.heading * Math.PI) / 180;
        const featherDistNM = isArr ? 16 : 11;
        const approachX = rwy.threshold.x - featherDistNM * Math.sin(rad);
        const approachY = rwy.threshold.y - featherDistNM * Math.cos(rad);
        const appPos = worldToScreen(approachX, approachY);

        ctx.strokeStyle = isArr ? '#009955' : 'rgba(0, 119, 68, 0.45)';
        ctx.lineWidth = isArr ? 1.3 : 0.8;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(thPos.sx, thPos.sy);
        ctx.lineTo(appPos.sx, appPos.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        if (isArr) {
          // Localizer feather angle tics at 5, 10, 15 NM on active landing runway
          for (const dist of [5, 10, 15]) {
            const ticX = rwy.threshold.x - dist * Math.sin(rad);
            const ticY = rwy.threshold.y - dist * Math.cos(rad);
            const ticPos = worldToScreen(ticX, ticY);
            const perpRad = rad + Math.PI / 2;

            ctx.strokeStyle = '#00bb66';
            ctx.beginPath();
            ctx.moveTo(
              ticPos.sx - 6 * Math.sin(perpRad),
              ticPos.sy + 6 * Math.cos(perpRad)
            );
            ctx.lineTo(
              ticPos.sx + 6 * Math.sin(perpRad),
              ticPos.sy - 6 * Math.cos(perpRad)
            );
            ctx.stroke();
          }
        }

        // Runway Designator Label
        ctx.fillStyle = isArr ? '#00ff88' : isDep ? '#00e5ff' : '#3a8458';
        ctx.font = isArr || isDep ? 'bold 10px "IBM Plex Mono", monospace' : '9px "IBM Plex Mono", monospace';
        ctx.fillText(rwy.id, thPos.sx + 6, thPos.sy - 6);
      }
    }

    // 5. Dynamic Holding Patterns for active airport
    for (const stack of holdingStacks) {
      const fixPos = worldToScreen(stack.x, stack.y);
      const rad = (stack.inboundCourse * Math.PI) / 180;
      const turnSign = stack.turnDirection === 'Right' ? 1 : -1;
      const perpRad = rad + (turnSign * Math.PI) / 2;
      const legNM = 3.5;
      const offsetNM = 1.6;

      const outX = stack.x - legNM * Math.sin(rad);
      const outY = stack.y - legNM * Math.cos(rad);
      const abX = stack.x + offsetNM * Math.sin(perpRad);
      const abY = stack.y + offsetNM * Math.cos(perpRad);
      const outAbX = outX + offsetNM * Math.sin(perpRad);
      const outAbY = outY + offsetNM * Math.cos(perpRad);

      const outPos = worldToScreen(outX, outY);
      const abPos = worldToScreen(abX, abY);
      const outAbPos = worldToScreen(outAbX, outAbY);

      ctx.strokeStyle = 'rgba(0, 160, 200, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(fixPos.sx, fixPos.sy);
      ctx.lineTo(outPos.sx, outPos.sy);
      ctx.lineTo(outAbPos.sx, outAbPos.sy);
      ctx.lineTo(abPos.sx, abPos.sy);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 6. Navigation Fixes & TMA Waypoints
    if (radarLayers.waypointLabels) {
      for (const wp of airport.waypoints) {
        const pos = worldToScreen(wp.position.x, wp.position.y);

        ctx.strokeStyle = wp.isHoldingFix ? '#00e5ff' : '#338855';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const triSize = wp.isHoldingFix ? 6 : 4.5;
        ctx.moveTo(pos.sx, pos.sy - triSize);
        ctx.lineTo(pos.sx + triSize, pos.sy + triSize);
        ctx.lineTo(pos.sx - triSize, pos.sy + triSize);
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = wp.isHoldingFix ? '#00e5ff' : '#55aa77';
        ctx.font = wp.isHoldingFix ? 'bold 11px "IBM Plex Mono", monospace' : '10px "IBM Plex Mono", monospace';
        ctx.fillText(wp.name, pos.sx + 7, pos.sy + 4);
      }
    }

    // 7. PRECISION SCAN-DRIVEN RADAR TRACKS
    const now = performance.now();

    for (const ac of aircraft) {
      const isSelected = ac.id === selectedAircraftId;
      const trk = trackMap.get(ac.id);

      // Position from tracking engine (predicted position between antenna sweeps)
      const displayX = trk ? trk.predictedX : ac.x;
      const displayY = trk ? trk.predictedY : ac.y;
      const pos = worldToScreen(displayX, displayY);

      // Track freshness state
      const trackStatus: TrackStatus = trk?.status || 'CONFIRMED';
      const isStale = trackStatus === 'STALE';
      const isLost = trackStatus === 'LOST';

      // Conflict state (STCA)
      const activeConflict = conflicts.find(
        c => c.aircraft1Id === ac.id || c.aircraft2Id === ac.id
      );
      const isCritical = activeConflict?.severity === 'Critical';
      const isWarning = activeConflict?.severity === 'Warning';

      // Sweep Beam Hit & Phosphor Excitation Bloom Calculation (angle-synchronous)
      const targetAzimuth = calculateBearing(0, 0, displayX, displayY);
      const angleBehindSweep = ((antennaAzimuth - targetAzimuth) % 360 + 360) % 360;
      const bloomAngleWindow = 40.0; // ~40° arc window (0.44s at 15 RPM)
      const isFreshHit = angleBehindSweep <= bloomAngleWindow && radarLayers.radarSweep;
      const flashRatio = isFreshHit ? Math.max(0, 1 - angleBehindSweep / bloomAngleWindow) : 0;

      // Color coding per specification (Part 6)
      const isEmergency = Boolean(ac.isEmergency) || ac.transponder === '7700';
      let primaryColor = '#00ff66';
      if (isEmergency || isCritical) {
        primaryColor = '#ff3344';
      } else if (isWarning) {
        primaryColor = '#ffb703';
      } else if (isLost) {
        primaryColor = '#ff3344';
      } else if (isStale) {
        primaryColor = '#8a9a90';
      } else if (isSelected) {
        primaryColor = '#ffffff';
      } else if (isFreshHit) {
        primaryColor = '#caffea';
      }

      // 7a. Phosphor Excitation Bloom on antenna pass
      if (isFreshHit && radarLayers.radarSweep && !isStale && !isLost) {
        ctx.save();
        const bloomRadius = 18;
        const bloomGrad = ctx.createRadialGradient(pos.sx, pos.sy, 1, pos.sx, pos.sy, bloomRadius);
        bloomGrad.addColorStop(0, `rgba(215, 255, 235, ${0.80 * flashRatio})`);
        bloomGrad.addColorStop(0.4, `rgba(0, 255, 102, ${0.45 * flashRatio})`);
        bloomGrad.addColorStop(1, 'rgba(0, 255, 102, 0)');
        ctx.fillStyle = bloomGrad;
        ctx.beginPath();
        ctx.arc(pos.sx, pos.sy, bloomRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 7b. Altitude-Coded Past History Trajectory (for Selected Aircraft) with Smooth Linear Gradients
      if (isSelected && ac.history && ac.history.length > 0) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 7b-1. Draw past track segments with continuous linear gradients
        for (let i = 1; i < ac.history.length; i++) {
          const pPrev = worldToScreen(ac.history[i - 1].x, ac.history[i - 1].y);
          const pCurr = worldToScreen(ac.history[i].x, ac.history[i].y);
          
          const altPrev = ac.history[i - 1].altitude;
          const altCurr = ac.history[i].altitude;

          // Outer glowing shadow gradient
          const glowGrad = ctx.createLinearGradient(pPrev.sx, pPrev.sy, pCurr.sx, pCurr.sy);
          glowGrad.addColorStop(0, getAltitudeRgba(altPrev, 0.30));
          glowGrad.addColorStop(1, getAltitudeRgba(altCurr, 0.30));

          ctx.strokeStyle = glowGrad;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(pPrev.sx, pPrev.sy);
          ctx.lineTo(pCurr.sx, pCurr.sy);
          ctx.stroke();

          // Core crisp trajectory line gradient
          const coreGrad = ctx.createLinearGradient(pPrev.sx, pPrev.sy, pCurr.sx, pCurr.sy);
          coreGrad.addColorStop(0, getAltitudeColor(altPrev));
          coreGrad.addColorStop(1, getAltitudeColor(altCurr));

          ctx.strokeStyle = coreGrad;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(pPrev.sx, pPrev.sy);
          ctx.lineTo(pCurr.sx, pCurr.sy);
          ctx.stroke();
        }

        // Connect the latest history point to the current aircraft position with smooth gradient
        const lastH = ac.history[ac.history.length - 1];
        const lastHPos = worldToScreen(lastH.x, lastH.y);

        const lastGlowGrad = ctx.createLinearGradient(lastHPos.sx, lastHPos.sy, pos.sx, pos.sy);
        lastGlowGrad.addColorStop(0, getAltitudeRgba(lastH.altitude, 0.30));
        lastGlowGrad.addColorStop(1, getAltitudeRgba(ac.altitude, 0.30));

        ctx.strokeStyle = lastGlowGrad;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(lastHPos.sx, lastHPos.sy);
        ctx.lineTo(pos.sx, pos.sy);
        ctx.stroke();

        const lastCoreGrad = ctx.createLinearGradient(lastHPos.sx, lastHPos.sy, pos.sx, pos.sy);
        lastCoreGrad.addColorStop(0, getAltitudeColor(lastH.altitude));
        lastCoreGrad.addColorStop(1, getAltitudeColor(ac.altitude));

        ctx.strokeStyle = lastCoreGrad;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(lastHPos.sx, lastHPos.sy);
        ctx.lineTo(pos.sx, pos.sy);
        ctx.stroke();

        // 7b-2. Subtle breadcrumb dots along past path (No text or speed written on path)
        for (let i = 0; i < ac.history.length; i++) {
          const hp = ac.history[i];
          const hPos = worldToScreen(hp.x, hp.y);
          const dotColor = getAltitudeColor(hp.altitude);

          ctx.fillStyle = dotColor;
          ctx.beginPath();
          ctx.arc(hPos.sx, hPos.sy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // 7b-3. Entry Point Marker - "از کجا آمده" (Origin badge)
        const entryPoint = ac.history[0];
        const entryPos = worldToScreen(entryPoint.x, entryPoint.y);
        const originLabel = `FROM: ${ac.origin} (${ac.airline})`;
        ctx.font = 'bold 9px "IBM Plex Mono", monospace';
        const labelWidth = ctx.measureText(originLabel).width + 12;

        ctx.fillStyle = 'rgba(2, 20, 14, 0.95)';
        ctx.strokeStyle = getAltitudeColor(entryPoint.altitude);
        ctx.lineWidth = 1.2;
        ctx.fillRect(entryPos.sx - labelWidth / 2, entryPos.sy - 22, labelWidth, 16);
        ctx.strokeRect(entryPos.sx - labelWidth / 2, entryPos.sy - 22, labelWidth, 16);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(originLabel, entryPos.sx, entryPos.sy - 11);
        ctx.textAlign = 'start';

        ctx.restore();

        // 7b-4. Projected / Assigned Future Route Ahead - "مسیر مشخص شده" with Smooth Gradient
        ctx.save();
        const currentAltColor = getAltitudeColor(ac.altitude);
        const targetAltColor = getAltitudeColor(ac.targetAltitude);

        // Compute waypoints along cleared route
        const routeSteps: Array<{ x: number; y: number; label: string }> = [];

        if (ac.assignedWaypoint) {
          const wp = airport.waypoints.find(w => w.name === ac.assignedWaypoint);
          if (wp) {
            routeSteps.push({ x: wp.position.x, y: wp.position.y, label: `FIX: ${wp.name}` });
          }
        }

        const rwy = airport.runways.find(r => r.id === ac.assignedRunway);
        if (rwy && (ac.status === 'Inbound' || ac.status === 'FinalApproach' || ac.ilsArmed || ac.ilsLocalizerCaptured)) {
          // If arrival, trace through final approach corridor to runway threshold
          routeSteps.push({
            x: rwy.threshold.x,
            y: rwy.threshold.y,
            label: `DEST: ${ac.destination} [RWY ${rwy.id}]`,
          });
        }

        if (routeSteps.length > 0) {
          ctx.lineWidth = 2.0;
          ctx.setLineDash([6, 4]);

          let currPos = pos;
          for (let sIdx = 0; sIdx < routeSteps.length; sIdx++) {
            const step = routeSteps[sIdx];
            const nextPos = worldToScreen(step.x, step.y);

            // Smooth linear gradient from current altitude color to target altitude color
            const routeGrad = ctx.createLinearGradient(currPos.sx, currPos.sy, nextPos.sx, nextPos.sy);
            routeGrad.addColorStop(0, currentAltColor);
            routeGrad.addColorStop(1, targetAltColor);

            ctx.strokeStyle = routeGrad;
            ctx.beginPath();
            ctx.moveTo(currPos.sx, currPos.sy);
            ctx.lineTo(nextPos.sx, nextPos.sy);
            ctx.stroke();

            // Waypoint / Destination fix diamond
            ctx.fillStyle = targetAltColor;
            ctx.strokeStyle = '#05140b';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(nextPos.sx, nextPos.sy, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Destination / Fix badge
            const stepLabel = step.label;
            ctx.font = 'bold 9px "IBM Plex Mono", monospace';
            const sw = ctx.measureText(stepLabel).width + 10;
            ctx.fillStyle = 'rgba(3, 20, 14, 0.92)';
            ctx.strokeStyle = targetAltColor;
            ctx.lineWidth = 1.2;
            ctx.fillRect(nextPos.sx + 7, nextPos.sy - 8, sw, 16);
            ctx.strokeRect(nextPos.sx + 7, nextPos.sy - 8, sw, 16);

            ctx.fillStyle = '#ffffff';
            ctx.fillText(stepLabel, nextPos.sx + 12, nextPos.sy + 4);

            currPos = nextPos;
          }
          ctx.setLineDash([]);
        } else {
          // Heading vector projection for 15 NM with smooth gradient
          const projDistNM = 15.0;
          const rad = (ac.targetHeading * Math.PI) / 180;
          const projWx = displayX + projDistNM * Math.sin(rad);
          const projWy = displayY + projDistNM * Math.cos(rad);
          const projPos = worldToScreen(projWx, projWy);

          const headingGrad = ctx.createLinearGradient(pos.sx, pos.sy, projPos.sx, projPos.sy);
          headingGrad.addColorStop(0, currentAltColor);
          headingGrad.addColorStop(1, targetAltColor);

          ctx.strokeStyle = headingGrad;
          ctx.lineWidth = 2.0;
          ctx.setLineDash([7, 4]);
          ctx.beginPath();
          ctx.moveTo(pos.sx, pos.sy);
          ctx.lineTo(projPos.sx, projPos.sy);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.restore();
      } else if (radarLayers.trails && trk && trk.history && trk.history.length > 0) {
        // Standard decaying phosphor trail for unselected aircraft
        for (let i = 0; i < trk.history.length; i++) {
          const hp = trk.history[i];
          const hPos = worldToScreen(hp.x, hp.y);
          const alpha = 0.12 + (i / trk.history.length) * 0.45;
          ctx.fillStyle = isCritical ? `rgba(255, 51, 68, ${alpha})` : isStale ? `rgba(138, 154, 144, ${alpha})` : `rgba(0, 255, 102, ${alpha})`;
          ctx.beginPath();
          ctx.arc(hPos.sx, hPos.sy, Math.max(1.5, 2.5 - (trk.history.length - i) * 0.3), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 7c. Speed Prediction Vector Line (1-minute velocity projection)
      if (radarLayers.speedVectors && ac.groundSpeed > 10 && !isLost) {
        const vectorDistNM = (ac.groundSpeed / 60) * 1.0;
        const rad = (ac.heading * Math.PI) / 180;
        const endWx = displayX + vectorDistNM * Math.sin(rad);
        const endWy = displayY + vectorDistNM * Math.cos(rad);
        const endPos = worldToScreen(endWx, endWy);

        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = isSelected ? 2 : 1.2;
        if (trackStatus === 'PREDICTED') {
          ctx.setLineDash([3, 3]);
        }
        ctx.beginPath();
        ctx.moveTo(pos.sx, pos.sy);
        ctx.lineTo(endPos.sx, endPos.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Vector tip pip
        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.arc(endPos.sx, endPos.sy, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 7d. Target Symbol & Direction Needle
      ctx.save();
      ctx.translate(pos.sx, pos.sy);
      ctx.rotate((ac.heading * Math.PI) / 180);

      ctx.strokeStyle = primaryColor;
      ctx.fillStyle = primaryColor;
      ctx.lineWidth = isFreshHit ? 2.5 : 2;

      if (isLost) {
        // Flashing interrogation square for lost tracks
        ctx.strokeRect(-5, -5, 10, 10);
      } else {
        // Standard ATC target blip
        ctx.beginPath();
        ctx.arc(0, 0, isSelected ? 5.5 : isFreshHit ? 5.0 : 4, 0, Math.PI * 2);
        ctx.stroke();

        // Heading direction needle
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(0, isFreshHit ? -12 : -10);
        ctx.stroke();
      }
      ctx.restore();

      // Active VHF Radio Transmission Animation on Target Blip ("صحبت کردن هر پرواز روی راهدار")
      const isTransmitting = Boolean(activeTransmission && activeTransmission.callsign === ac.callsign);
      const speakerRole = isTransmitting ? activeTransmission?.speaker : null;

      if (isTransmitting) {
        ctx.save();
        const animProgress = (now % 900) / 900;
        const isPilot = speakerRole === 'PILOT';
        const waveColor = isPilot ? '0, 255, 102' : '0, 229, 255';

        // 3 concentric expanding radio waves radiating outward from blip
        for (let w = 0; w < 3; w++) {
          const prog = (animProgress + w * 0.33) % 1;
          const r = 12 + prog * 28;
          const alpha = (1 - prog) * 0.85;

          ctx.strokeStyle = `rgba(${waveColor}, ${alpha})`;
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.arc(pos.sx, pos.sy, r, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Concentric glowing halo around blip
        const radGlow = ctx.createRadialGradient(pos.sx, pos.sy, 2, pos.sx, pos.sy, 24);
        radGlow.addColorStop(0, `rgba(${waveColor}, 0.75)`);
        radGlow.addColorStop(0.5, `rgba(${waveColor}, 0.25)`);
        radGlow.addColorStop(1, `rgba(${waveColor}, 0)`);
        ctx.fillStyle = radGlow;
        ctx.beginPath();
        ctx.arc(pos.sx, pos.sy, 24, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // Emergency 7700 diamond ring marker
      if (isEmergency) {
        ctx.save();
        ctx.strokeStyle = '#ff3344';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(pos.sx, pos.sy - 13);
        ctx.lineTo(pos.sx + 13, pos.sy);
        ctx.lineTo(pos.sx, pos.sy + 13);
        ctx.lineTo(pos.sx - 13, pos.sy);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      // Selected aircraft highlighting ring
      if (isSelected) {
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(pos.sx, pos.sy, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 7e. Interactive Heading Vector Handle (Part 4.1)
      if (isSelected && (activeTool === 'HEADING_VECTOR' || isDraggingHeading)) {
        const handleRadiusPx = 42;
        const currentHdg = previewHeading !== null ? previewHeading : ac.targetHeading;
        const currentHdgRad = (currentHdg * Math.PI) / 180;

        // Outer control circle
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.arc(pos.sx, pos.sy, handleRadiusPx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Interactive handle pip
        const handleX = pos.sx + handleRadiusPx * Math.sin(currentHdgRad);
        const handleY = pos.sy - handleRadiusPx * Math.cos(currentHdgRad);

        ctx.fillStyle = '#00e5ff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(handleX, handleY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Proposed Turn Arc & Future Trajectory
        const turnRad = (ac.heading * Math.PI) / 180;
        const projLengthNM = 12.0;
        const projEndWx = displayX + projLengthNM * Math.sin(currentHdgRad);
        const projEndWy = displayY + projLengthNM * Math.cos(currentHdgRad);
        const projEnd = worldToScreen(projEndWx, projEndWy);

        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(pos.sx, pos.sy);
        ctx.lineTo(projEnd.sx, projEnd.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Proposed heading badge
        ctx.fillStyle = 'rgba(0, 30, 20, 0.9)';
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1;
        ctx.fillRect(handleX + 8, handleY - 12, 60, 20);
        ctx.strokeRect(handleX + 8, handleY - 12, 60, 20);
        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 10px "IBM Plex Mono", monospace';
        ctx.fillText(`HDG ${Math.round(currentHdg).toString().padStart(3, '0')}°`, handleX + 12, handleY + 2);
      }

      // 7f. Structured 3/4-Line ICAO Data Block (Part 5 & Route Details)
      const tagOff = ac.tagOffset || { x: 28, y: -24 };
      const tagX = pos.sx + tagOff.x;
      const tagY = pos.sy + tagOff.y;

      // Leader line connecting aircraft target to data tag
      ctx.strokeStyle = isTransmitting ? (speakerRole === 'PILOT' ? '#00ff66' : '#00e5ff') : primaryColor;
      ctx.lineWidth = isTransmitting ? 1.8 : 1;
      ctx.beginPath();
      ctx.moveTo(pos.sx, pos.sy);
      ctx.lineTo(tagX, tagY);
      ctx.stroke();

      // Data Block Box Background
      const boxWidth = isSelected ? 122 : 98;
      const boxHeight = isSelected ? 49 : 38;
      ctx.fillStyle = isSelected ? 'rgba(5, 28, 18, 0.95)' : 'rgba(7, 16, 12, 0.90)';
      ctx.strokeStyle = isTransmitting 
        ? (speakerRole === 'PILOT' ? '#00ff66' : '#00e5ff') 
        : isFreshHit ? '#00ffaa' : primaryColor;
      ctx.lineWidth = isTransmitting ? 2 : isSelected ? 1.5 : 0.8;
      ctx.fillRect(tagX, tagY - 10, boxWidth, boxHeight);
      ctx.strokeRect(tagX, tagY - 10, boxWidth, boxHeight);

      // Active Transmission Badge pinned above Data Block
      if (isTransmitting) {
        ctx.save();
        const isPilot = speakerRole === 'PILOT';
        const badgeColor = isPilot ? '#00ff66' : '#00e5ff';
        const badgeBg = isPilot ? 'rgba(0, 32, 14, 0.96)' : 'rgba(0, 24, 34, 0.96)';
        const badgeText = isPilot ? '🎙️ PILOT TX' : '🎙️ ATC TX';

        ctx.fillStyle = badgeBg;
        ctx.strokeStyle = badgeColor;
        ctx.lineWidth = 1.4;
        ctx.shadowColor = badgeColor;
        ctx.shadowBlur = 8;
        ctx.fillRect(tagX, tagY - 25, boxWidth, 14);
        ctx.strokeRect(tagX, tagY - 25, boxWidth, 14);
        ctx.shadowBlur = 0;

        ctx.fillStyle = badgeColor;
        ctx.font = 'bold 9px "IBM Plex Mono", monospace';
        const barsAnim = Math.floor((now / 150) % 4);
        const bars = barsAnim === 0 ? ' ▂' : barsAnim === 1 ? ' ▂▃' : barsAnim === 2 ? ' ▂▃▅' : ' ▂▃';
        ctx.fillText(`${badgeText} ${bars}`, tagX + 4, tagY - 15);
        ctx.restore();
      }

      // Line 1: CALLSIGN / AIRCRAFT TYPE (+7700 Emergency tag)
      ctx.fillStyle = isEmergency ? '#ff4d4d' : isSelected ? '#ffffff' : primaryColor;
      ctx.font = 'bold 11px "IBM Plex Mono", monospace';
      ctx.fillText(
        isEmergency ? `${ac.callsign} 7700` : `${ac.callsign} ${ac.aircraftType}`,
        tagX + 4,
        tagY + 2
      );

      // Line 2: ALTITUDE / CLEARED ALTITUDE (colored by altitude band for selected aircraft)
      const curAlt100 = Math.round(ac.altitude / 100).toString().padStart(3, '0');
      const tgtAlt100 = Math.round(ac.targetAltitude / 100).toString().padStart(3, '0');
      const vertSymbol = ac.verticalSpeed > 200 ? '↑' : ac.verticalSpeed < -200 ? '↓' : '=';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.fillStyle = isSelected ? getAltitudeColor(ac.altitude) : isEmergency || isCritical ? '#ff3344' : isWarning ? '#ffb703' : '#a2f5bf';
      ctx.fillText(`${curAlt100} c${tgtAlt100} ${vertSymbol}`, tagX + 4, tagY + 14);

      // Line 3: GROUND SPEED / HEADING / FLIGHT PHASE
      const gs = Math.round(ac.groundSpeed || ac.indicatedAirspeed);
      const hdg = Math.round(ac.heading).toString().padStart(3, '0');
      const phaseTag = isEmergency ? 'EMER' : ac.ilsGlideslopeCaptured ? 'GS' : ac.ilsLocalizerCaptured ? 'LOC' : ac.status.slice(0, 3).toUpperCase();
      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillStyle = isEmergency ? '#ff6b6b' : ac.ilsGlideslopeCaptured ? '#00e5ff' : '#73b890';
      ctx.fillText(`${gs}kt ${hdg}° ${phaseTag}`, tagX + 4, tagY + 25);

      // Line 4: ORIGIN -> DESTINATION ("از کجا آمده و به سمت کجا میرود")
      if (isSelected) {
        ctx.font = 'bold 9px "IBM Plex Mono", monospace';
        ctx.fillStyle = '#00e5ff';
        ctx.fillText(`FROM ${ac.origin} ➔ ${ac.destination} [${ac.assignedRunway}]`, tagX + 4, tagY + 36);
      }
    }

    // 8. Tactical Measuring Ruler
    if (measuringRuler) {
      const p1 = worldToScreen(measuringRuler.start.x, measuringRuler.start.y);
      const p2 = worldToScreen(measuringRuler.current.x, measuringRuler.current.y);

      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
      ctx.setLineDash([]);

      const distNM = calculateDistance(
        measuringRuler.start.x,
        measuringRuler.start.y,
        measuringRuler.current.x,
        measuringRuler.current.y
      );
      const bearing = calculateBearing(
        measuringRuler.start.x,
        measuringRuler.start.y,
        measuringRuler.current.x,
        measuringRuler.current.y
      );

      const midX = (p1.sx + p2.sx) / 2;
      const midY = (p1.sy + p2.sy) / 2;
      ctx.fillStyle = 'rgba(20, 20, 10, 0.9)';
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1;
      ctx.fillRect(midX + 8, midY - 14, 106, 26);
      ctx.strokeRect(midX + 8, midY - 14, 106, 26);

      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 10px "IBM Plex Mono", monospace';
      ctx.fillText(`${distNM.toFixed(1)} NM  ${Math.round(bearing).toString().padStart(3, '0')}°`, midX + 12, midY + 2);
    }

    ctx.restore();
  }, [
    aircraft,
    selectedAircraftId,
    airport,
    activeLandingRunwayId,
    activeDepartureRunwayId,
    holdingStacks,
    radarLayers,
    conflicts,
    antennaAzimuth,
    panOffset,
    rangeNM,
    measuringRuler,
    activeTool,
    isDraggingHeading,
    previewHeading,
    worldToScreen,
    trackMap,
    activeTransmission,
  ]);

  // Mouse Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { wx, wy } = screenToWorld(sx, sy);

    // Right Click or Measure tool active: Start Tactical Measuring Ruler
    if (e.button === 2 || activeTool === 'MEASURE' || e.shiftKey) {
      e.preventDefault();
      setMeasuringRuler({
        start: { x: wx, y: wy },
        current: { x: wx, y: wy },
      });
      return;
    }

    if (e.button === 0) {
      // 1. Check if clicking on the heading control handle around the selected aircraft
      if (selectedAircraftId) {
        const selAc = aircraft.find(a => a.id === selectedAircraftId);
        if (selAc) {
          const blipPos = worldToScreen(selAc.x, selAc.y);
          const distToBlip = Math.hypot(sx - blipPos.sx, sy - blipPos.sy);

          // If clicking near the heading handle ring (~30px - 55px radius) or tool is HEADING_VECTOR
          if ((activeTool === 'HEADING_VECTOR' && distToBlip <= 60) || (distToBlip >= 28 && distToBlip <= 55)) {
            setIsDraggingHeading(true);
            const hdg = calculateBearing(blipPos.sx, blipPos.sy, sx, sy);
            setPreviewHeading(normalizeHeading(Math.round(hdg)));
            return;
          }
        }
      }

      // 2. Check if clicking a waypoint in DIRECT_TO mode
      if (selectedAircraftId && activeTool === 'DIRECT_TO') {
        for (const wp of airport.waypoints) {
          const wpPos = worldToScreen(wp.position.x, wp.position.y);
          if (Math.hypot(sx - wpPos.sx, sy - wpPos.sy) <= 16) {
            const selAc = aircraft.find(a => a.id === selectedAircraftId);
            if (selAc) {
              directTo(selAc.id, wp.name);
            }
            return;
          }
        }
      }

      // 3. Check data tags for drag-and-drop repositioning
      for (const ac of aircraft) {
        const blipPos = worldToScreen(ac.x, ac.y);
        const tagOff = ac.tagOffset || { x: 28, y: -24 };
        const tagX = blipPos.sx + tagOff.x;
        const tagY = blipPos.sy + tagOff.y;

        if (sx >= tagX && sx <= tagX + 96 && sy >= tagY - 10 && sy <= tagY + 28) {
          selectAircraft(ac.id);
          setDraggingTagId(ac.id);
          return;
        }
      }

      // 4. Check aircraft blips for click-to-select
      for (const ac of aircraft) {
        const blipPos = worldToScreen(ac.x, ac.y);
        const dist = Math.hypot(sx - blipPos.sx, sy - blipPos.sy);
        if (dist <= 18) {
          selectAircraft(ac.id);
          return;
        }
      }

      // 5. Empty space: start canvas panning
      setIsPanning(true);
      setPanStart({ x: sx - panOffset.x, y: sy - panOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { wx, wy } = screenToWorld(sx, sy);

    setCursorWorldPos({ x: wx, y: wy });

    // Update measuring ruler
    if (measuringRuler) {
      setMeasuringRuler(prev => prev ? { ...prev, current: { x: wx, y: wy } } : null);
      return;
    }

    // Update heading vector drag
    if (isDraggingHeading && selectedAircraftId) {
      const selAc = aircraft.find(a => a.id === selectedAircraftId);
      if (selAc) {
        const blipPos = worldToScreen(selAc.x, selAc.y);
        const hdg = calculateBearing(blipPos.sx, blipPos.sy, sx, sy);
        setPreviewHeading(normalizeHeading(Math.round(hdg)));
      }
      return;
    }

    // Update tag repositioning
    if (draggingTagId) {
      const ac = aircraft.find(a => a.id === draggingTagId);
      if (ac) {
        const blipPos = worldToScreen(ac.x, ac.y);
        const newOffsetX = sx - blipPos.sx;
        const newOffsetY = sy - blipPos.sy;
        repositionTag(draggingTagId, Math.round(newOffsetX), Math.round(newOffsetY));
      }
      return;
    }

    // Update canvas pan
    if (isPanning) {
      setPanOffset({
        x: sx - panStart.x,
        y: sy - panStart.y,
      });
    }
  };

  const handleMouseUp = (_e: React.MouseEvent<HTMLCanvasElement>) => {
    // If we were dragging heading vector, apply heading command directly!
    if (isDraggingHeading && selectedAircraftId && previewHeading !== null) {
      const selAc = aircraft.find(a => a.id === selectedAircraftId);
      if (selAc) {
        setHeading(selAc.id, previewHeading);
      }
    }

    setIsDraggingHeading(false);
    setPreviewHeading(null);
    setIsPanning(false);
    setDraggingTagId(null);
    if (activeTool !== 'MEASURE') {
      setMeasuringRuler(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
    setRangeNM(prev => Math.max(12, Math.min(65, prev * zoomFactor)));
  };

  const handleResetView = () => {
    setPanOffset({ x: 0, y: 0 });
    setRangeNM(35);
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-[#030805] overflow-hidden">
      {/* 2D High-Precision Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair block"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={e => e.preventDefault()}
      />

      {/* CRT Scanline & Phosphor Vignette Overlay */}
      <div className="absolute inset-0 radar-crt-overlay pointer-events-none" />

      {/* Professional Floating Radar Toolbar */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-[#08150f]/95 backdrop-blur-md px-2.5 py-1.5 border border-[#163826] rounded-md text-xs font-mono text-[#a2f5bf] shadow-xl pointer-events-auto whitespace-nowrap">
        <span className="font-bold text-[#00ff66] pr-1">{airport.icao} RADAR</span>
        <span className="text-[#204a32]">|</span>

        {/* Pointer / Select tool */}
        <button
          onClick={() => setActiveTool('SELECT')}
          className={`p-1.5 rounded transition-colors ${
            activeTool === 'SELECT'
              ? 'bg-[#1b442d] text-[#00ff66] border border-[#00ff66]/50'
              : 'hover:bg-[#12281b] text-[#5da87d]'
          }`}
          title="Select Aircraft [Pointer]"
        >
          <MousePointer className="w-3.5 h-3.5" />
        </button>

        {/* Heading Vector tool */}
        <button
          onClick={() => setActiveTool('HEADING_VECTOR')}
          className={`p-1.5 rounded transition-colors ${
            activeTool === 'HEADING_VECTOR'
              ? 'bg-[#1b442d] text-[#00e5ff] border border-[#00e5ff]/50'
              : 'hover:bg-[#12281b] text-[#5da87d]'
          }`}
          title="Heading Vector Tool [H]"
        >
          <Compass className="w-3.5 h-3.5" />
        </button>

        {/* Direct-To tool */}
        <button
          onClick={() => setActiveTool('DIRECT_TO')}
          className={`p-1.5 rounded transition-colors ${
            activeTool === 'DIRECT_TO'
              ? 'bg-[#1b442d] text-[#00ff66] border border-[#00ff66]/50'
              : 'hover:bg-[#12281b] text-[#5da87d]'
          }`}
          title="Direct-To Fix [D]"
        >
          <Navigation className="w-3.5 h-3.5" />
        </button>

        {/* Measure tool */}
        <button
          onClick={() => setActiveTool('MEASURE')}
          className={`p-1.5 rounded transition-colors ${
            activeTool === 'MEASURE'
              ? 'bg-[#1b442d] text-[#ffd166] border border-[#ffd166]/50'
              : 'hover:bg-[#12281b] text-[#5da87d]'
          }`}
          title="Measure NM and Bearing [M]"
        >
          <Ruler className="w-3.5 h-3.5" />
        </button>

        <span className="text-[#204a32]">|</span>

        {/* Range preset buttons */}
        <div className="flex items-center gap-1">
          {[15, 25, 35, 50].map(r => (
            <button
              key={r}
              onClick={() => setRangeNM(r)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                Math.round(rangeNM) === r
                  ? 'bg-[#1b442d] text-[#00ff66]'
                  : 'hover:bg-[#12281b] text-[#5da87d]'
              }`}
            >
              {r}NM
            </button>
          ))}
        </div>

        <span className="text-[#204a32]">|</span>

        {/* Zoom controls */}
        <button
          onClick={() => setRangeNM(prev => Math.max(12, prev - 5))}
          className="p-1 hover:bg-[#12281b] text-[#00ff66] rounded transition-colors"
          title="Zoom In [+]"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setRangeNM(prev => Math.min(65, prev + 5))}
          className="p-1 hover:bg-[#12281b] text-[#00ff66] rounded transition-colors"
          title="Zoom Out [-]"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        {/* Center Radar */}
        <button
          onClick={handleResetView}
          className="p-1 hover:bg-[#12281b] text-[#a2f5bf] rounded transition-colors"
          title="Center Radar View [C]"
        >
          <Crosshair className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Selected Aircraft Tactical Route HUD Banner */}
      {selectedAircraft && (
        <div className="hidden xl:flex absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-[#06140d]/92 backdrop-blur border border-[#163826] hover:border-[#00ff66]/50 rounded-md px-3.5 py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.65)] font-mono text-xs items-center gap-3 text-white pointer-events-auto transition-all select-none whitespace-nowrap">
          <div className="flex items-center gap-1.5 font-bold text-[#00ff66]">
            <Plane className="w-3.5 h-3.5 text-[#00e5ff]" />
            <span>{selectedAircraft.callsign}</span>
            <span className="text-[10px] text-[#4e8b69] font-normal">· {selectedAircraft.aircraftType}</span>
          </div>

          <div className="h-3 w-px bg-[#1e4832]" />

          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-[#a2f5bf] font-semibold">{selectedAircraft.origin}</span>
            <span className="text-[#00e5ff] text-[10px]">──▶</span>
            <span className="text-[#00ff66] font-semibold">{selectedAircraft.destination}</span>
            <span className="text-[#4e8b69]">·</span>
            <span className="text-[10px] text-[#74d89b] font-semibold">
              RWY {selectedAircraft.assignedRunway}
            </span>
          </div>

          <div className="h-3 w-px bg-[#1e4832]" />

          <div className="flex items-center gap-2.5 text-[10px] text-[#a2f5bf] tabular-nums">
            <span>ALT: <b style={{ color: getAltitudeColor(selectedAircraft.altitude) }}>{Math.round(selectedAircraft.altitude).toLocaleString()}ft</b></span>
            <span>CLRD: <b style={{ color: getAltitudeColor(selectedAircraft.targetAltitude) }}>{selectedAircraft.targetAltitude.toLocaleString()}ft</b></span>
            {selectedAircraft.assignedWaypoint && (
              <span>DIRECT: <b className="text-[#ffd166]">{selectedAircraft.assignedWaypoint}</b></span>
            )}
          </div>
        </div>
      )}

      {/* Active Radio Transmission Live Indicator */}
      {activeTransmission && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 bg-[#031d12]/95 border border-[#00ff66] shadow-[0_0_16px_rgba(0,255,102,0.35)] rounded px-3 py-1 font-mono text-[11px] flex items-center gap-2 text-white pointer-events-none select-none whitespace-nowrap">
          <Radio className="w-3.5 h-3.5 text-[#00ff66]" />
          <span className="font-bold text-[#00ff66]">
            {activeTransmission.speaker === 'PILOT' ? 'PILOT TX:' : 'ATC TX:'}
          </span>
          <span className="text-white font-bold">
            {activeTransmission.callsign}
          </span>
        </div>
      )}

      {/* Operational Information & Position Overlay */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 text-[11px] font-mono text-[#4e8b69] pointer-events-none tabular-nums">
        {cursorWorldPos && (
          <div className="bg-[#08150f]/85 px-2 py-1 border border-[#163826] rounded">
            REL: {cursorWorldPos.x >= 0 ? '+' : ''}{cursorWorldPos.x.toFixed(1)} NM, {cursorWorldPos.y >= 0 ? '+' : ''}{cursorWorldPos.y.toFixed(1)} NM
          </div>
        )}
        <div className="hidden md:flex items-center gap-2 text-[#3f7055]">
          <span>[L-Click] Select / Tag Drag</span>
          <span>·</span>
          <span>[H-Drag] Heading Vector</span>
          <span>·</span>
          <span>[R-Drag] Measure</span>
        </div>
      </div>

      {/* Altitude Spectrum Legend */}
      <div className="absolute bottom-3 right-3 z-10 bg-[#05140d]/90 backdrop-blur border border-[#163826] rounded px-3 py-1.5 font-mono text-[9px] pointer-events-none select-none shadow-lg">
        <div className="text-[10px] font-bold text-[#4e8b69] mb-1">
          ALTITUDE COLOR PROFILE
        </div>
        <div className="grid grid-cols-5 gap-2 text-center">
          <div className="flex flex-col items-center">
            <span className="w-4 h-1.5 rounded-sm bg-[#00e5ff] mb-0.5 shadow-[0_0_4px_#00e5ff]" />
            <span className="text-[#00e5ff] font-semibold">≥FL100</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="w-4 h-1.5 rounded-sm bg-[#00ff66] mb-0.5 shadow-[0_0_4px_#00ff66]" />
            <span className="text-[#00ff66] font-semibold">7k-10k</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="w-4 h-1.5 rounded-sm bg-[#ffd166] mb-0.5 shadow-[0_0_4px_#ffd166]" />
            <span className="text-[#ffd166] font-semibold">4.5-7k</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="w-4 h-1.5 rounded-sm bg-[#ff9233] mb-0.5 shadow-[0_0_4px_#ff9233]" />
            <span className="text-[#ff9233] font-semibold">2.5-4.5k</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="w-4 h-1.5 rounded-sm bg-[#ff4d6d] mb-0.5 shadow-[0_0_4px_#ff4d6d]" />
            <span className="text-[#ff4d6d] font-semibold">&lt;2.5k</span>
          </div>
        </div>
      </div>
    </div>
  );
};
