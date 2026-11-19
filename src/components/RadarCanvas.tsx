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
import { computeDefaultAirportVisibility } from '../airports/procedures';
import { calculateBearing, calculateDistance, normalizeHeading } from '../engine/physics';
import { TrackStatus, RadarTrack } from '../engine/radarTracker';
import { getAltitudeColor, getAltitudeRgba } from '../utils/altitudeColor';
import { drawRadarAircraftSilhouette } from '../utils/aircraftSilhouettes';
import { getRadarTheme, RADAR_THEME_LIST } from '../utils/radarThemes';
import {
  MousePointer,
  Compass,
  Navigation,
  Ruler,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  ArrowUpRight,
  Palette,
  Check,
} from 'lucide-react';
import type { RadarLayers } from '../store/simulationStore';

// Active holding pattern geometry computed dynamically from airport waypoints
interface HoldingStackDef {
  name: string;
  x: number; // NM
  y: number; // NM
  inboundCourse: number; // Magnetic heading
  turnDirection: 'Right' | 'Left';
}

export type RadarTool = 'SELECT' | 'HEADING_VECTOR' | 'DIRECT_TO' | 'MEASURE';

interface RadarCanvasProps {
  onOpenSetupRoutes?: () => void;
}

export const RadarCanvas: React.FC<RadarCanvasProps> = ({ onOpenSetupRoutes }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });

  // Store bindings
  const aircraft = useSimulationStore(state => state.aircraft);
  const selectedAircraftId = useSimulationStore(state => state.selectedAircraftId);
  const airport = useSimulationStore(state => state.airport);
  const activeLandingRunwayId = useSimulationStore(state => state.activeLandingRunwayId);
  const activeDepartureRunwayId = useSimulationStore(state => state.activeDepartureRunwayId);
  const radarLayers = useSimulationStore(state => state.radarLayers);
  const radarTheme = useSimulationStore(state => state.radarTheme);
  const perAirportVisibility = useSimulationStore(state => state.perAirportVisibility);
  const conflicts = useSimulationStore(state => state.conflicts);
  const radarTracks = useSimulationStore(state => state.radarTracks);
  const antennaAzimuth = useSimulationStore(state => state.antennaAzimuth);
  const activeTransmission = useSimulationStore(state => state.activeTransmission);

  const theme = useMemo(() => getRadarTheme(radarTheme), [radarTheme]);

  const airportVisibility = useMemo(
    () => perAirportVisibility[airport.icao] || computeDefaultAirportVisibility(airport),
    [perAirportVisibility, airport]
  );

  const visibleWaypointSet = useMemo(
    () => new Set(airportVisibility.visibleWaypoints),
    [airportVisibility]
  );

  const visibleStarSet = useMemo(
    () => new Set(airportVisibility.visibleStarIds),
    [airportVisibility]
  );

  const visibleSidSet = useMemo(
    () => new Set(airportVisibility.visibleSidIds),
    [airportVisibility]
  );

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
  const appendWaypointRoute = useSimulationStore(state => state.appendWaypointRoute);
  const vectorToIntercept = useSimulationStore(state => state.vectorToIntercept);
  const repositionTag = useSimulationStore(state => state.repositionTag);
  const toggleLayer = useSimulationStore(state => state.toggleLayer);
  const setAllRadarLayers = useSimulationStore(state => state.setAllRadarLayers);
  const applyRadarDeclutter = useSimulationStore(state => state.applyRadarDeclutter);
  const setRadarTheme = useSimulationStore(state => state.setRadarTheme);

  // Radar Viewport Transformation State (wide zoom: 2.5 NM approach close-up to 140 NM enroute)
  const MIN_RANGE_NM = 2.5;
  const MAX_RANGE_NM = 140;
  const [rangeNM, setRangeNM] = useState<number>(35);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showScopeControls, setShowScopeControls] = useState<boolean>(false);
  const [showThemeMenu, setShowThemeMenu] = useState<boolean>(false);
  const [showRangeMenu, setShowRangeMenu] = useState<boolean>(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setCanvasSize({ w: Math.round(width), h: Math.round(height) });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoomInStep = useCallback((prev: number) => {
    const step = prev <= 6 ? 0.5 : prev <= 15 ? 2.5 : prev <= 45 ? 5 : 15;
    return Math.max(MIN_RANGE_NM, Number((prev - step).toFixed(1)));
  }, []);

  const zoomOutStep = useCallback((prev: number) => {
    const step = prev < 6 ? 0.5 : prev < 15 ? 2.5 : prev < 45 ? 5 : 15;
    return Math.min(MAX_RANGE_NM, Number((prev + step).toFixed(1)));
  }, []);

  // Active radar tool & route chain mode
  const [activeTool, setActiveTool] = useState<RadarTool>('SELECT');
  const [chainRouteMode, setChainRouteMode] = useState<boolean>(false);

  // Interactive mouse control state
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggingTagId, setDraggingTagId] = useState<string | null>(null);

  // Interactive Heading Vector Drag state
  const [isDraggingHeading, setIsDraggingHeading] = useState<boolean>(false);
  const [hasDraggedHeading, setHasDraggedHeading] = useState<boolean>(false);
  const [previewHeading, setPreviewHeading] = useState<number | null>(null);

  // Hover waypoint / ILS gate preview in DIRECT_TO mode
  const [hoveredWaypointName, setHoveredWaypointName] = useState<string | null>(null);
  const [hoveredIlsGate, setHoveredIlsGate] = useState<boolean>(false);

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
    const width = canvas.clientWidth || canvasSize.w || 800;
    const height = canvas.clientHeight || canvasSize.h || 600;
    const centerX = width / 2 + panOffset.x;
    const centerY = height / 2 + panOffset.y;
    const minDim = Math.min(width, height);
    const pxPerNM = (minDim * 0.44) / rangeNM;
    return { width, height, centerX, centerY, pxPerNM };
  }, [panOffset, rangeNM, canvasSize]);

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
          setHasDraggedHeading(false);
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
          setRangeNM(zoomInStep);
          break;
        case '-':
        case '_':
          setRangeNM(zoomOutStep);
          break;
        case 'c':
        case 'C':
          setPanOffset({ x: 0, y: 0 });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomInStep, zoomOutStep]);

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

    // 1. Theme-Driven Radar Scope Background
    ctx.fillStyle = theme.canvas.background;
    ctx.fillRect(0, 0, width, height);

    // 1b. Topographical Terrain, Elevation Contours, Rivers/Water & Peaks Backdrop
    if (radarLayers.terrain && airport.terrainFeatures && airport.terrainFeatures.length > 0) {
      ctx.save();
      for (const feat of airport.terrainFeatures) {
        if (feat.kind === 'water' && feat.points.length >= 3) {
          ctx.beginPath();
          const p0 = worldToScreen(feat.points[0].x, feat.points[0].y);
          ctx.moveTo(p0.sx, p0.sy);
          let sumX = p0.sx;
          let sumY = p0.sy;
          let minX = p0.sx;
          let maxX = p0.sx;
          for (let i = 1; i < feat.points.length; i++) {
            const p = worldToScreen(feat.points[i].x, feat.points[i].y);
            ctx.lineTo(p.sx, p.sy);
            sumX += p.sx;
            sumY += p.sy;
            if (p.sx < minX) minX = p.sx;
            if (p.sx > maxX) maxX = p.sx;
          }
          ctx.closePath();
          ctx.fillStyle = theme.canvas.waterFill;
          ctx.fill();
          ctx.strokeStyle = theme.canvas.waterStroke;
          ctx.lineWidth = 1.2;
          ctx.stroke();

          if (feat.label && maxX - minX > 36) {
            ctx.fillStyle = theme.canvas.waterLabel;
            ctx.font = 'italic 9px "IBM Plex Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(feat.label, sumX / feat.points.length, sumY / feat.points.length);
            ctx.textAlign = 'start';
          }
        } else if ((feat.kind === 'river' || feat.kind === 'coastline') && feat.points.length >= 2) {
          ctx.beginPath();
          const p0 = worldToScreen(feat.points[0].x, feat.points[0].y);
          ctx.moveTo(p0.sx, p0.sy);
          const screenPts = [p0];
          for (let i = 1; i < feat.points.length; i++) {
            const p = worldToScreen(feat.points[i].x, feat.points[i].y);
            ctx.lineTo(p.sx, p.sy);
            screenPts.push(p);
          }
          if (feat.kind === 'coastline') {
            ctx.setLineDash([7, 3]);
            ctx.strokeStyle = theme.canvas.coastlineStroke;
            ctx.lineWidth = 2.0;
          } else {
            ctx.setLineDash([]);
            ctx.strokeStyle = theme.canvas.riverStroke;
            ctx.lineWidth = 1.8;
          }
          ctx.stroke();
          ctx.setLineDash([]);

          if (feat.label && screenPts.length >= 2) {
            const midPt = screenPts[Math.floor(screenPts.length / 2)];
            ctx.fillStyle = theme.canvas.waterLabel;
            ctx.font = 'italic 8px "IBM Plex Mono", monospace';
            ctx.fillText(feat.label, midPt.sx + 6, midPt.sy - 4);
          }
        } else if (feat.kind === 'contour' && feat.points.length >= 3) {
          const elev = feat.elevationFt ?? 1500;
          let fillCol = theme.canvas.contourLowFill;
          let strokeCol = theme.canvas.contourLowStroke;
          let textCol = theme.canvas.contourLowText;
          if (elev >= 10000) {
            fillCol = theme.canvas.contourHighFill;
            strokeCol = theme.canvas.contourHighStroke;
            textCol = theme.canvas.contourHighText;
          } else if (elev >= 6000) {
            fillCol = theme.canvas.contourMidFill;
            strokeCol = theme.canvas.contourMidStroke;
            textCol = theme.canvas.contourMidText;
          } else if (elev >= 2000) {
            fillCol = theme.canvas.contourLowFill;
            strokeCol = theme.canvas.contourLowStroke;
            textCol = theme.canvas.contourLowText;
          }

          ctx.beginPath();
          const p0 = worldToScreen(feat.points[0].x, feat.points[0].y);
          ctx.moveTo(p0.sx, p0.sy);
          let sumX = p0.sx;
          let sumY = p0.sy;
          let minX = p0.sx;
          let maxX = p0.sx;
          for (let i = 1; i < feat.points.length; i++) {
            const p = worldToScreen(feat.points[i].x, feat.points[i].y);
            ctx.lineTo(p.sx, p.sy);
            sumX += p.sx;
            sumY += p.sy;
            if (p.sx < minX) minX = p.sx;
            if (p.sx > maxX) maxX = p.sx;
          }
          ctx.closePath();
          ctx.fillStyle = fillCol;
          ctx.fill();
          ctx.strokeStyle = strokeCol;
          ctx.lineWidth = 1.0;
          ctx.stroke();

          if (maxX - minX > 32) {
            const cx = sumX / feat.points.length;
            const cy = sumY / feat.points.length;
            const elevTag = feat.label || `${elev.toLocaleString()}'`;
            ctx.fillStyle = textCol;
            ctx.font = '8px "IBM Plex Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(elevTag, cx, cy);
            ctx.textAlign = 'start';
          }
        } else if (feat.kind === 'peak' && feat.points.length >= 1) {
          const p = worldToScreen(feat.points[0].x, feat.points[0].y);
          ctx.strokeStyle = theme.canvas.peakStroke;
          ctx.fillStyle = theme.canvas.peakFill;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(p.sx, p.sy - 5);
          ctx.lineTo(p.sx + 5, p.sy + 4);
          ctx.lineTo(p.sx - 5, p.sy + 4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          const tag = feat.label
            ? `${feat.label}${feat.elevationFt ? ` ${feat.elevationFt.toLocaleString()}'` : ''}`
            : `${feat.elevationFt?.toLocaleString() || ''}'`;
          ctx.fillStyle = theme.canvas.peakLabel;
          ctx.font = 'bold 8px "IBM Plex Mono", monospace';
          ctx.fillText(tag, p.sx + 7, p.sy + 3);
        } else if (feat.kind === 'obstacle' && feat.points.length >= 1) {
          const p = worldToScreen(feat.points[0].x, feat.points[0].y);
          ctx.strokeStyle = theme.canvas.obstacleStroke;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(p.sx, p.sy - 6);
          ctx.lineTo(p.sx - 4, p.sy + 3);
          ctx.moveTo(p.sx, p.sy - 6);
          ctx.lineTo(p.sx + 4, p.sy + 3);
          ctx.moveTo(p.sx - 4, p.sy + 3);
          ctx.lineTo(p.sx + 4, p.sy + 3);
          ctx.stroke();

          ctx.fillStyle = theme.canvas.obstacleFill;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy - 7, 1.8, 0, Math.PI * 2);
          ctx.fill();

          const tag = feat.label
            ? `${feat.label}${feat.elevationFt ? ` ${feat.elevationFt.toLocaleString()}'` : ''}`
            : `OBST ${feat.elevationFt?.toLocaleString() || ''}'`;
          ctx.font = '8px "IBM Plex Mono", monospace';
          ctx.fillText(tag, p.sx + 7, p.sy + 2);
        }
      }
      ctx.restore();
    }

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
      sweepGradient.addColorStop(0, `rgba(${theme.canvas.sweepGlowRgb}, ${theme.isLight ? 0.14 : 0.22})`);
      sweepGradient.addColorStop(0.5, `rgba(${theme.canvas.sweepGlowRgb}, ${theme.isLight ? 0.05 : 0.08})`);
      sweepGradient.addColorStop(1, `rgba(${theme.canvas.sweepGlowRgb}, 0.00)`);
      ctx.fillStyle = sweepGradient;
      ctx.fill();

      // Sharp primary sweep line aligned exactly at the leading edge of the beam
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + sweepLength * Math.sin(azimuthRad),
        centerY - sweepLength * Math.cos(azimuthRad)
      );
      ctx.strokeStyle = theme.canvas.sweepLineColor;
      ctx.lineWidth = 2.0;
      ctx.stroke();
      ctx.restore();
    }

    // 3. Adaptive Multi-Tier Concentric Range Rings, 30° Radials & Scaling Compass Rose
    if (radarLayers.rangeRings) {
      let minorStep = 5;
      let majorStep = 10;
      if (rangeNM <= 6) {
        minorStep = 0.5;
        majorStep = 1;
      } else if (rangeNM <= 14) {
        minorStep = 1;
        majorStep = 2;
      } else if (rangeNM <= 30) {
        minorStep = 2.5;
        majorStep = 5;
      } else if (rangeNM <= 65) {
        minorStep = 5;
        majorStep = 10;
      } else {
        minorStep = 10;
        majorStep = 20;
      }

      const maxVisibleNM = Math.min(
        220,
        Math.ceil((Math.hypot(width, height) + Math.hypot(panOffset.x, panOffset.y)) / Math.max(0.1, pxPerNM)) + majorStep
      );

      // Subtle 30-degree radial azimuth spokes
      for (let deg = 0; deg < 360; deg += 30) {
        const rad = (deg * Math.PI) / 180;
        const isCardinal = deg % 90 === 0;
        const spokeLenPx = maxVisibleNM * pxPerNM;
        ctx.strokeStyle = isCardinal ? theme.canvas.radialCardinal : theme.canvas.radialMinor;
        ctx.lineWidth = isCardinal ? 1.0 : 0.7;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + spokeLenPx * Math.sin(rad), centerY - spokeLenPx * Math.cos(rad));
        ctx.stroke();
      }

      // Concentric Minor & Major Range Rings
      const totalSteps = Math.floor(maxVisibleNM / minorStep);
      for (let idx = 1; idx <= totalSteps; idx++) {
        const r = Number((idx * minorStep).toFixed(2));
        const radiusPx = r * pxPerNM;
        if (radiusPx < 14 || radiusPx > Math.max(width, height) * 1.5) continue;

        const isMajor = Math.abs(r / majorStep - Math.round(r / majorStep)) < 0.001;
        ctx.strokeStyle = isMajor ? theme.canvas.ringMajor : theme.canvas.ringMinor;
        ctx.lineWidth = isMajor ? 1.05 : 0.7;
        ctx.setLineDash(isMajor ? [5, 5] : [2, 6]);
        ctx.beginPath();
        ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
        ctx.stroke();

        if (isMajor) {
          const rLabel = Number.isInteger(r) ? `${r} NM` : `${r.toFixed(1)} NM`;
          ctx.fillStyle = theme.canvas.ringLabel;
          ctx.font = '10px "IBM Plex Mono", monospace';
          ctx.fillText(rLabel, centerX + 7, centerY - radiusPx + 11);
          if (radiusPx > 140) {
            ctx.fillText(rLabel, centerX + 7, centerY + radiusPx - 4);
          }
        }
      }
      ctx.setLineDash([]);

      // Adaptive Outer 360-degree Compass Rose Azimuth Dial (scales cleanly to active zoom)
      const roseCandidates = [2.5, 5, 10, 15, 25, 35, 50, 75, 100, 130];
      const targetRoseNM = rangeNM * 0.88;
      const compassNM = roseCandidates.reduce((best, cand) =>
        Math.abs(cand - targetRoseNM) < Math.abs(best - targetRoseNM) ? cand : best
      );
      const compassRadius = compassNM * pxPerNM;
      if (compassRadius > 90 && compassRadius < Math.max(width, height) * 1.15) {
        ctx.strokeStyle = theme.canvas.compassCircle;
        ctx.lineWidth = 1.1;
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

          ctx.strokeStyle = isMajor ? theme.canvas.compassTickMajor : theme.canvas.compassTickMinor;
          ctx.beginPath();
          ctx.moveTo(innerX, innerY);
          ctx.lineTo(outerX, outerY);
          ctx.stroke();

          if (isMajor) {
            ctx.fillStyle = theme.canvas.compassLabel;
            ctx.font = 'bold 9px "IBM Plex Mono", monospace';
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

      if (radarLayers.runways) {
        // Runway surface concrete bar (draw once per physical pair unless highlighted)
        const pairKey = [
          `${rwy.threshold.x.toFixed(1)},${rwy.threshold.y.toFixed(1)}`,
          `${rwy.endPosition.x.toFixed(1)},${rwy.endPosition.y.toFixed(1)}`,
        ]
          .sort()
          .join('|');
        if (!drawnPhysicalRunways.has(pairKey) || isArr || isDep) {
          drawnPhysicalRunways.add(pairKey);
          ctx.strokeStyle = isArr
            ? theme.canvas.runwayArrival
            : isDep
            ? theme.canvas.runwayDeparture
            : theme.canvas.runwayInactive;
          ctx.lineWidth = isArr || isDep ? 4 : 2.5;
          ctx.beginPath();
          ctx.moveTo(thPos.sx, thPos.sy);
          ctx.lineTo(endPos.sx, endPos.sy);
          ctx.stroke();
        }
      }

      // Extended ILS Centerline Localizer Feather (15 NM) for active or primary runways
      if (radarLayers.extendedCenterlines) {
        const rad = (rwy.heading * Math.PI) / 180;
        const featherDistNM = isArr ? 16 : 11;
        const approachX = rwy.threshold.x - featherDistNM * Math.sin(rad);
        const approachY = rwy.threshold.y - featherDistNM * Math.cos(rad);
        const appPos = worldToScreen(approachX, approachY);

        ctx.strokeStyle = isArr ? theme.canvas.centerlineArrival : theme.canvas.centerlineInactive;
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

            ctx.strokeStyle = theme.canvas.centerlineTick;
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
      }

      if (radarLayers.runways || radarLayers.extendedCenterlines) {
        // Runway Designator Label
        ctx.fillStyle = isArr
          ? theme.canvas.runwayLabelArrival
          : isDep
          ? theme.canvas.runwayLabelDeparture
          : theme.canvas.runwayLabelInactive;
        ctx.font = isArr || isDep ? 'bold 10px "IBM Plex Mono", monospace' : '9px "IBM Plex Mono", monospace';
        ctx.fillText(rwy.id, thPos.sx + 6, thPos.sy - 6);
      }
    }

    // 4b. TMA Sector Airspace Boundary & Altitude Envelope
    if (radarLayers.tmaBoundary && airport.tmaBoundary && airport.tmaBoundary.polygon.length >= 3) {
      const poly = airport.tmaBoundary.polygon;
      ctx.save();
      ctx.strokeStyle = theme.canvas.tmaStroke;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      const firstPt = worldToScreen(poly[0].x, poly[0].y);
      ctx.moveTo(firstPt.sx, firstPt.sy);
      for (let i = 1; i < poly.length; i++) {
        const pt = worldToScreen(poly[i].x, poly[i].y);
        ctx.lineTo(pt.sx, pt.sy);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      // TMA Sector Top Label
      const topPt = poly.reduce((best, p) => (p.y > best.y ? p : best), poly[0]);
      const topScr = worldToScreen(topPt.x, topPt.y);
      const tmaTag = `${airport.tmaBoundary.sectorLabel} · ${airport.tmaBoundary.floorLabel}–${airport.tmaBoundary.ceilingLabel} · TA ${airport.tmaBoundary.transitionAltitudeFt}ft`;
      ctx.font = 'bold 9px "IBM Plex Mono", monospace';
      const tw = ctx.measureText(tmaTag).width + 10;
      ctx.fillStyle = theme.canvas.tmaTagBg;
      ctx.fillRect(topScr.sx - tw / 2, topScr.sy - 18, tw, 14);
      ctx.fillStyle = theme.canvas.tmaTagText;
      ctx.textAlign = 'center';
      ctx.fillText(tmaTag, topScr.sx, topScr.sy - 8);
      ctx.textAlign = 'start';
      ctx.restore();
    }

    // Helper for drawing a small directional arrowhead at leg midpoint
    const drawLegArrow = (x1: number, y1: number, x2: number, y2: number, color: string) => {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const size = 6;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(ang);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.7, -size * 0.55);
      ctx.lineTo(-size * 0.7, size * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const wpMap = new Map(airport.waypoints.map(w => [w.name, w]));

    // 4c. Published STAR Arrival Corridors (per-airport toggleable)
    if (radarLayers.starCorridors && airport.approachRoutes) {
      for (const star of airport.approachRoutes) {
        if (!visibleStarSet.has(star.id)) continue;
        const servesActiveArr = star.runwayIds.includes(activeLandingRunwayId);
        const lineColor = servesActiveArr
          ? theme.canvas.starActive
          : theme.canvas.starInactive;
        const labelColor = servesActiveArr
          ? theme.canvas.starLabelActive
          : theme.canvas.starLabelInactive;

        ctx.save();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = servesActiveArr ? 1.6 : 1.0;

        for (let lIdx = 0; lIdx < star.legs.length; lIdx++) {
          const leg = star.legs[lIdx];
          const fromWp = wpMap.get(leg.fromFix);
          const toWp = wpMap.get(leg.toFix);
          if (!fromWp || !toWp) continue;

          const p1 = worldToScreen(fromWp.position.x, fromWp.position.y);
          const p2 = worldToScreen(toWp.position.x, toWp.position.y);

          ctx.beginPath();
          ctx.moveTo(p1.sx, p1.sy);
          ctx.lineTo(p2.sx, p2.sy);
          ctx.stroke();

          drawLegArrow(p1.sx, p1.sy, p2.sx, p2.sy, lineColor);

          if (radarLayers.procedureRestrictions && Math.hypot(p2.sx - p1.sx, p2.sy - p1.sy) > 36) {
            const mx = (p1.sx + p2.sx) / 2;
            const my = (p1.sy + p2.sy) / 2;
            const parts = [
              lIdx === 0 ? star.name : null,
              `${leg.courseDeg.toString().padStart(3, '0')}°`,
              `${leg.distanceNM.toFixed(1)}NM`,
              leg.altitudeConstraint || null,
              leg.speedLimitKt ? `${leg.speedLimitKt}KT` : null,
            ].filter(Boolean);
            const tag = parts.join(' · ');
            ctx.font = '9px "IBM Plex Mono", monospace';
            const tw = ctx.measureText(tag).width + 8;
            ctx.fillStyle = theme.canvas.starTagBg;
            ctx.fillRect(mx - tw / 2, my - 16, tw, 13);
            ctx.fillStyle = labelColor;
            ctx.textAlign = 'center';
            ctx.fillText(tag, mx, my - 6);
            ctx.textAlign = 'start';
          }
        }
        ctx.restore();
      }
    }

    // 4d. Published SID Departure Corridors (per-airport toggleable)
    if (radarLayers.sidCorridors && airport.departureRoutes) {
      for (const sid of airport.departureRoutes) {
        if (!visibleSidSet.has(sid.id)) continue;
        const servesActiveDep = sid.runwayIds.includes(activeDepartureRunwayId);
        const lineColor = servesActiveDep
          ? theme.canvas.sidActive
          : theme.canvas.sidInactive;
        const labelColor = servesActiveDep
          ? theme.canvas.sidLabelActive
          : theme.canvas.sidLabelInactive;

        ctx.save();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = servesActiveDep ? 1.5 : 1.0;
        ctx.setLineDash([7, 4]);

        for (let lIdx = 0; lIdx < sid.legs.length; lIdx++) {
          const leg = sid.legs[lIdx];
          const fromWp = wpMap.get(leg.fromFix);
          const toWp = wpMap.get(leg.toFix);
          if (!fromWp || !toWp) continue;

          const p1 = worldToScreen(fromWp.position.x, fromWp.position.y);
          const p2 = worldToScreen(toWp.position.x, toWp.position.y);

          ctx.beginPath();
          ctx.moveTo(p1.sx, p1.sy);
          ctx.lineTo(p2.sx, p2.sy);
          ctx.stroke();

          drawLegArrow(p1.sx, p1.sy, p2.sx, p2.sy, lineColor);

          if (radarLayers.procedureRestrictions && Math.hypot(p2.sx - p1.sx, p2.sy - p1.sy) > 36) {
            const mx = (p1.sx + p2.sx) / 2;
            const my = (p1.sy + p2.sy) / 2;
            const parts = [
              lIdx === 0 ? sid.name : null,
              `${leg.courseDeg.toString().padStart(3, '0')}°`,
              `${leg.distanceNM.toFixed(1)}NM`,
              leg.altitudeConstraint || null,
              leg.speedLimitKt ? `${leg.speedLimitKt}KT` : null,
            ].filter(Boolean);
            const tag = parts.join(' · ');
            ctx.font = '9px "IBM Plex Mono", monospace';
            const tw = ctx.measureText(tag).width + 8;
            ctx.fillStyle = theme.canvas.sidTagBg;
            ctx.fillRect(mx - tw / 2, my + 4, tw, 13);
            ctx.fillStyle = labelColor;
            ctx.textAlign = 'center';
            ctx.fillText(tag, mx, my + 14);
            ctx.textAlign = 'start';
          }
        }
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // 5. Dynamic Holding Patterns for visible holding fixes
    if (radarLayers.holdingStacks) {
      for (const stack of holdingStacks) {
        if (!visibleWaypointSet.has(stack.name)) continue;
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

        ctx.strokeStyle = theme.canvas.holdStroke;
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
    }

    // 6. Navigation Fixes & TMA Waypoints (Role-specific IAF/FAF/EXIT/HOLD symbology)
    if (radarLayers.waypointLabels) {
      for (const wp of airport.waypoints) {
        if (!visibleWaypointSet.has(wp.name)) continue;
        const pos = worldToScreen(wp.position.x, wp.position.y);
        const role =
          wp.role ||
          (wp.isFinalApproachFix
            ? 'FAF'
            : wp.isInitialApproachFix
            ? 'IAF'
            : wp.isDepartureExit
            ? 'EXIT'
            : wp.isHoldingFix
            ? 'HOLD'
            : 'FIX');

        if (role === 'EXIT') {
          // Radar Exit Gate: Square/Diamond
          ctx.strokeStyle = theme.canvas.wpExit;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(pos.sx, pos.sy - 6);
          ctx.lineTo(pos.sx + 6, pos.sy);
          ctx.lineTo(pos.sx, pos.sy + 6);
          ctx.lineTo(pos.sx - 6, pos.sy);
          ctx.closePath();
          ctx.stroke();
        } else if (role === 'FAF') {
          // Final Approach Fix: Cross Marker
          ctx.strokeStyle = theme.canvas.wpFaf;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(pos.sx - 5, pos.sy - 5);
          ctx.lineTo(pos.sx + 5, pos.sy + 5);
          ctx.moveTo(pos.sx + 5, pos.sy - 5);
          ctx.lineTo(pos.sx - 5, pos.sy + 5);
          ctx.stroke();
        } else {
          // IAF / HOLD / VOR Triangle
          ctx.strokeStyle = wp.isHoldingFix
            ? theme.canvas.wpHold
            : role === 'IAF'
            ? theme.canvas.wpIaf
            : theme.canvas.wpFix;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          const triSize = wp.isHoldingFix || role === 'IAF' ? 6 : 4.5;
          ctx.moveTo(pos.sx, pos.sy - triSize);
          ctx.lineTo(pos.sx + triSize, pos.sy + triSize);
          ctx.lineTo(pos.sx - triSize, pos.sy + triSize);
          ctx.closePath();
          ctx.stroke();
        }

        const nameColor =
          role === 'EXIT'
            ? theme.canvas.wpExit
            : role === 'FAF'
            ? theme.canvas.wpFaf
            : wp.isHoldingFix
            ? theme.canvas.wpHold
            : role === 'IAF'
            ? theme.canvas.wpIaf
            : theme.canvas.wpFix;
        ctx.fillStyle = nameColor;
        ctx.font =
          wp.isHoldingFix || role === 'IAF' || role === 'FAF' || role === 'EXIT'
            ? 'bold 10px "IBM Plex Mono", monospace'
            : '10px "IBM Plex Mono", monospace';
        const roleTag = role === 'IAF' || role === 'FAF' || role === 'EXIT' ? ` [${role}]` : '';
        ctx.fillText(`${wp.name}${roleTag}`, pos.sx + 8, pos.sy + 3);

        if (radarLayers.procedureRestrictions && (wp.altitudeConstraint || wp.speedConstraintKt)) {
          const cText = [wp.altitudeConstraint, wp.speedConstraintKt ? `${wp.speedConstraintKt}KT` : null]
            .filter(Boolean)
            .join(' · ');
          ctx.font = '8px "IBM Plex Mono", monospace';
          ctx.fillStyle = theme.canvas.wpConstraintText;
          ctx.fillText(cText, pos.sx + 8, pos.sy + 13);
        }
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

      // Color coding driven by active Radar Theme
      const isEmergency = Boolean(ac.isEmergency) || ac.transponder === '7700';
      let primaryColor = theme.canvas.targetPrimary;
      if (isEmergency || isCritical) {
        primaryColor = theme.canvas.targetCritical;
      } else if (isWarning) {
        primaryColor = theme.canvas.targetWarning;
      } else if (isLost) {
        primaryColor = theme.canvas.targetCritical;
      } else if (isStale) {
        primaryColor = theme.canvas.targetStale;
      } else if (isSelected) {
        primaryColor = theme.canvas.targetSelected;
      } else if (isFreshHit) {
        primaryColor = theme.canvas.targetFresh;
      }

      // 7a. Phosphor Excitation Bloom on antenna pass
      if (isFreshHit && radarLayers.radarSweep && !isStale && !isLost) {
        ctx.save();
        const bloomRadius = 18;
        const bloomGrad = ctx.createRadialGradient(pos.sx, pos.sy, 1, pos.sx, pos.sy, bloomRadius);
        bloomGrad.addColorStop(0, `rgba(${theme.canvas.bloomInnerRgb}, ${0.80 * flashRatio})`);
        bloomGrad.addColorStop(0.4, `rgba(${theme.canvas.bloomOuterRgb}, ${0.45 * flashRatio})`);
        bloomGrad.addColorStop(1, `rgba(${theme.canvas.bloomOuterRgb}, 0)`);
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
          glowGrad.addColorStop(0, getAltitudeRgba(altPrev, 0.30, theme.isLight));
          glowGrad.addColorStop(1, getAltitudeRgba(altCurr, 0.30, theme.isLight));

          ctx.strokeStyle = glowGrad;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(pPrev.sx, pPrev.sy);
          ctx.lineTo(pCurr.sx, pCurr.sy);
          ctx.stroke();

          // Core crisp trajectory line gradient
          const coreGrad = ctx.createLinearGradient(pPrev.sx, pPrev.sy, pCurr.sx, pCurr.sy);
          coreGrad.addColorStop(0, getAltitudeColor(altPrev, theme.isLight));
          coreGrad.addColorStop(1, getAltitudeColor(altCurr, theme.isLight));

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
        lastGlowGrad.addColorStop(0, getAltitudeRgba(lastH.altitude, 0.30, theme.isLight));
        lastGlowGrad.addColorStop(1, getAltitudeRgba(ac.altitude, 0.30, theme.isLight));

        ctx.strokeStyle = lastGlowGrad;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(lastHPos.sx, lastHPos.sy);
        ctx.lineTo(pos.sx, pos.sy);
        ctx.stroke();

        const lastCoreGrad = ctx.createLinearGradient(lastHPos.sx, lastHPos.sy, pos.sx, pos.sy);
        lastCoreGrad.addColorStop(0, getAltitudeColor(lastH.altitude, theme.isLight));
        lastCoreGrad.addColorStop(1, getAltitudeColor(ac.altitude, theme.isLight));

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
          const dotColor = getAltitudeColor(hp.altitude, theme.isLight);

          ctx.fillStyle = dotColor;
          ctx.beginPath();
          ctx.arc(hPos.sx, hPos.sy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // 7b-3. Entry Point Marker (Origin badge)
        const entryPoint = ac.history[0];
        const entryPos = worldToScreen(entryPoint.x, entryPoint.y);
        const originLabel = `FROM: ${ac.origin} (${ac.airline})`;
        ctx.font = 'bold 9px "IBM Plex Mono", monospace';
        const labelWidth = ctx.measureText(originLabel).width + 12;

        ctx.fillStyle = theme.canvas.originBadgeBg;
        ctx.strokeStyle = getAltitudeColor(entryPoint.altitude, theme.isLight);
        ctx.lineWidth = 1.2;
        ctx.fillRect(entryPos.sx - labelWidth / 2, entryPos.sy - 22, labelWidth, 16);
        ctx.strokeRect(entryPos.sx - labelWidth / 2, entryPos.sy - 22, labelWidth, 16);

        ctx.fillStyle = theme.canvas.originBadgeText;
        ctx.textAlign = 'center';
        ctx.fillText(originLabel, entryPos.sx, entryPos.sy - 11);
        ctx.textAlign = 'start';

        ctx.restore();

        // 7b-4. Projected / Assigned Multi-Leg Route & Curved Vector Trajectory
        ctx.save();
        const currentAltColor = getAltitudeColor(ac.altitude, theme.isLight);
        const targetAltColor = getAltitudeColor(ac.targetAltitude, theme.isLight);

        // Highlight active holding racetrack if aircraft is holding
        if (ac.status === 'Holding' && ac.holdingWaypoint) {
          const stack = holdingStacks.find(s => s.name === ac.holdingWaypoint);
          if (stack) {
            const fixPos = worldToScreen(stack.x, stack.y);
            const hRad = (stack.inboundCourse * Math.PI) / 180;
            const turnSign = stack.turnDirection === 'Right' ? 1 : -1;
            const perpRad = hRad + (turnSign * Math.PI) / 2;
            const outPos = worldToScreen(stack.x - 3.5 * Math.sin(hRad), stack.y - 3.5 * Math.cos(hRad));
            const abPos = worldToScreen(stack.x + 1.6 * Math.sin(perpRad), stack.y + 1.6 * Math.cos(perpRad));
            const outAbPos = worldToScreen(
              stack.x - 3.5 * Math.sin(hRad) + 1.6 * Math.sin(perpRad),
              stack.y - 3.5 * Math.cos(hRad) + 1.6 * Math.cos(perpRad)
            );
            ctx.strokeStyle = theme.canvas.selectionRing;
            ctx.lineWidth = 2.0;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(fixPos.sx, fixPos.sy);
            ctx.lineTo(outPos.sx, outPos.sy);
            ctx.lineTo(outAbPos.sx, outAbPos.sy);
            ctx.lineTo(abPos.sx, abPos.sy);
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        // Compute ordered waypoints along cleared route: assignedWaypoint + routeQueue,
        // or filed SID exit preview / STAR arrival preview when no active route override is cleared
        const routeSteps: Array<{ x: number; y: number; label: string; isDestination?: boolean; isExitPreview?: boolean }> = [];
        const isDepartureAc = ac.status === 'Departing' || ac.status === 'Outbound';
        const queuedNames = [
          ...(ac.assignedWaypoint ? [ac.assignedWaypoint] : []),
          ...(ac.routeQueue || []),
        ];
        const useDeparturePreview =
          queuedNames.length === 0 &&
          isDepartureAc &&
          ac.flightPhase !== 'HANDOFF_READY' &&
          Boolean(ac.departureRouteWaypoints && ac.departureRouteWaypoints.length > 0);
        const useArrivalPreview =
          queuedNames.length === 0 &&
          !isDepartureAc &&
          !ac.ilsArmed &&
          !ac.ilsLocalizerCaptured &&
          ac.flightPhase !== 'BASE_VECTOR' &&
          ac.flightPhase !== 'FINAL_INTERCEPT' &&
          ac.status !== 'Landed' &&
          Boolean(ac.arrivalRouteWaypoints && ac.arrivalRouteWaypoints.length > 0);
        const isProcedurePreview = useDeparturePreview || useArrivalPreview;
        const displayWaypointNames = useDeparturePreview
          ? ac.departureRouteWaypoints || []
          : useArrivalPreview
          ? ac.arrivalRouteWaypoints || []
          : queuedNames;

        for (let qIdx = 0; qIdx < displayWaypointNames.length; qIdx++) {
          const wpName = displayWaypointNames[qIdx];
          const wp = airport.waypoints.find(w => w.name === wpName);
          if (wp) {
            const isExitEnd = isDepartureAc && wpName === ac.assignedExitWaypoint;
            const isIaf = !isDepartureAc && wpName === ac.assignedIafWaypoint;
            const isFaf = !isDepartureAc && wpName === ac.arrivalFafWaypoint;
            routeSteps.push({
              x: wp.position.x,
              y: wp.position.y,
              label: useDeparturePreview
                ? isExitEnd
                  ? `SID EXIT ${wp.name}`
                  : `SID ${wp.name}`
                : useArrivalPreview
                ? isFaf
                  ? `FAF ${wp.name}`
                  : isIaf
                  ? `IAF ${wp.name}`
                  : `STAR ${wp.name}`
                : qIdx === 0
                ? `FIX ${wp.name}`
                : `LEG ${qIdx + 1}: ${wp.name}`,
              isDestination: isExitEnd,
              isExitPreview: isProcedurePreview,
            });
          }
        }

        const rwy = airport.runways.find(r => r.id === ac.assignedRunway);
        if (
          rwy &&
          (routeSteps.length > 0 || ac.ilsArmed || ac.ilsLocalizerCaptured || ac.status === 'FinalApproach') &&
          !isDepartureAc
        ) {
          routeSteps.push({
            x: rwy.threshold.x,
            y: rwy.threshold.y,
            label: `DEST ${ac.destination} [RWY ${rwy.id}]`,
            isDestination: true,
          });
        }

        if (routeSteps.length > 0) {
          ctx.lineWidth = isProcedurePreview ? 1.4 : 2.0;
          ctx.setLineDash(isProcedurePreview ? [3, 5] : [6, 4]);

          let prevWorld = { x: displayX, y: displayY };
          let currPos = pos;
          for (let sIdx = 0; sIdx < routeSteps.length; sIdx++) {
            const step = routeSteps[sIdx];
            const nextPos = worldToScreen(step.x, step.y);
            const legDistNM = calculateDistance(prevWorld.x, prevWorld.y, step.x, step.y);

            const routeGrad = ctx.createLinearGradient(currPos.sx, currPos.sy, nextPos.sx, nextPos.sy);
            routeGrad.addColorStop(0, currentAltColor);
            routeGrad.addColorStop(1, targetAltColor);

            ctx.strokeStyle = routeGrad;
            ctx.beginPath();
            ctx.moveTo(currPos.sx, currPos.sy);
            ctx.lineTo(nextPos.sx, nextPos.sy);
            ctx.stroke();

            // Mid-leg NM distance badge for long legs
            if (legDistNM >= 3.0) {
              const midX = (currPos.sx + nextPos.sx) / 2;
              const midY = (currPos.sy + nextPos.sy) / 2;
              ctx.fillStyle = theme.canvas.legDistBg;
              ctx.font = '9px "IBM Plex Mono", monospace';
              const distTxt = `${legDistNM.toFixed(1)}NM`;
              const dw = ctx.measureText(distTxt).width + 6;
              ctx.fillRect(midX - dw / 2, midY - 7, dw, 13);
              ctx.fillStyle = theme.canvas.legDistText;
              ctx.textAlign = 'center';
              ctx.fillText(distTxt, midX, midY + 3);
              ctx.textAlign = 'start';
            }

            // Waypoint / Destination fix marker
            ctx.fillStyle = step.isDestination ? theme.canvas.selectionRing : targetAltColor;
            ctx.strokeStyle = theme.canvas.routeMarkerStroke;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(nextPos.sx, nextPos.sy, step.isDestination ? 4.5 : 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            const stepLabel = step.label;
            ctx.font = 'bold 9px "IBM Plex Mono", monospace';
            const sw = ctx.measureText(stepLabel).width + 10;
            ctx.fillStyle = theme.canvas.routeBadgeBg;
            ctx.strokeStyle = step.isDestination ? theme.canvas.selectionRing : targetAltColor;
            ctx.lineWidth = 1.2;
            ctx.fillRect(nextPos.sx + 7, nextPos.sy - 8, sw, 16);
            ctx.strokeRect(nextPos.sx + 7, nextPos.sy - 8, sw, 16);

            ctx.fillStyle = theme.canvas.routeBadgeText;
            ctx.fillText(stepLabel, nextPos.sx + 12, nextPos.sy + 4);

            currPos = nextPos;
            prevWorld = { x: step.x, y: step.y };
          }
          ctx.setLineDash([]);
        } else {
          // Curved Turn-to-Heading Arc + 15 NM projected path with 5 NM ticks
          const pts: Array<{ x: number; y: number }> = [{ x: displayX, y: displayY }];
          let simX = displayX;
          let simY = displayY;
          let simHdg = ac.heading;
          const speedNmPerSec = Math.max(120, ac.groundSpeed || ac.indicatedAirspeed) / 3600;
          const turnRate = 3.0; // deg/s

          // Trace turn arc over 1s steps until aligned with targetHeading
          for (let t = 0; t < 65; t++) {
            const diff = ((ac.targetHeading - simHdg + 540) % 360) - 180;
            if (Math.abs(diff) <= turnRate) {
              simHdg = ac.targetHeading;
              break;
            }
            simHdg = normalizeHeading(simHdg + Math.sign(diff) * turnRate);
            const r = (simHdg * Math.PI) / 180;
            simX += speedNmPerSec * Math.sin(r);
            simY += speedNmPerSec * Math.cos(r);
            if (t % 2 === 0) pts.push({ x: simX, y: simY });
          }

          const endRad = (ac.targetHeading * Math.PI) / 180;
          const projEndWx = simX + 14.0 * Math.sin(endRad);
          const projEndWy = simY + 14.0 * Math.cos(endRad);
          pts.push({ x: projEndWx, y: projEndWy });

          const startScreen = worldToScreen(pts[0].x, pts[0].y);
          const endScreen = worldToScreen(projEndWx, projEndWy);
          const headingGrad = ctx.createLinearGradient(startScreen.sx, startScreen.sy, endScreen.sx, endScreen.sy);
          headingGrad.addColorStop(0, currentAltColor);
          headingGrad.addColorStop(1, targetAltColor);

          ctx.strokeStyle = headingGrad;
          ctx.lineWidth = 2.0;
          ctx.setLineDash([7, 4]);
          ctx.beginPath();
          ctx.moveTo(startScreen.sx, startScreen.sy);
          for (let p = 1; p < pts.length; p++) {
            const sp = worldToScreen(pts[p].x, pts[p].y);
            ctx.lineTo(sp.sx, sp.sy);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          // 5 NM and 10 NM markers along final vector
          for (const d of [5, 10]) {
            const mx = simX + d * Math.sin(endRad);
            const my = simY + d * Math.cos(endRad);
            const mp = worldToScreen(mx, my);
            ctx.fillStyle = targetAltColor;
            ctx.beginPath();
            ctx.arc(mp.sx, mp.sy, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Direct-To Interactive Hover Route Preview
        if (activeTool === 'DIRECT_TO' && (hoveredWaypointName || hoveredIlsGate)) {
          const chainOriginWp =
            chainRouteMode && routeSteps.length > 0 && !routeSteps[routeSteps.length - 1].isDestination
              ? routeSteps[routeSteps.length - 1]
              : { x: displayX, y: displayY };

          let targetPoint: { x: number; y: number; name: string } | null = null;
          if (hoveredWaypointName) {
            const wp = airport.waypoints.find(w => w.name === hoveredWaypointName);
            if (wp) targetPoint = { x: wp.position.x, y: wp.position.y, name: wp.name };
          } else if (hoveredIlsGate && rwy) {
            const radRwy = (rwy.heading * Math.PI) / 180;
            targetPoint = {
              x: rwy.threshold.x - 11.0 * Math.sin(radRwy),
              y: rwy.threshold.y - 11.0 * Math.cos(radRwy),
              name: `ILS ${rwy.id} GATE`,
            };
          }

          if (targetPoint) {
            const pFrom = worldToScreen(chainOriginWp.x, chainOriginWp.y);
            const pTo = worldToScreen(targetPoint.x, targetPoint.y);
            const distNM = calculateDistance(chainOriginWp.x, chainOriginWp.y, targetPoint.x, targetPoint.y);
            const brg = Math.round(calculateBearing(chainOriginWp.x, chainOriginWp.y, targetPoint.x, targetPoint.y))
              .toString()
              .padStart(3, '0');
            const eteMin = (distNM / Math.max(120, ac.groundSpeed || 200)) * 60;

            const directHighlight = chainRouteMode
              ? theme.canvas.directChainHighlight
              : theme.canvas.directHoverHighlight;
            ctx.strokeStyle = directHighlight;
            ctx.lineWidth = 2.0;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(pFrom.sx, pFrom.sy);
            ctx.lineTo(pTo.sx, pTo.sy);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.strokeStyle = directHighlight;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(pTo.sx, pTo.sy, 11, 0, Math.PI * 2);
            ctx.stroke();

            const previewLabel = `${chainRouteMode ? '+LEG ' : 'DIR '}${targetPoint.name} · ${brg}° · ${distNM.toFixed(1)}NM (${eteMin.toFixed(1)}m)`;
            ctx.font = 'bold 9px "IBM Plex Mono", monospace';
            const pw = ctx.measureText(previewLabel).width + 10;
            ctx.fillStyle = theme.canvas.routeBadgeBg;
            ctx.strokeStyle = directHighlight;
            ctx.fillRect(pTo.sx - pw / 2, pTo.sy - 26, pw, 16);
            ctx.strokeRect(pTo.sx - pw / 2, pTo.sy - 26, pw, 16);
            ctx.fillStyle = theme.canvas.routeBadgeText;
            ctx.textAlign = 'center';
            ctx.fillText(previewLabel, pTo.sx, pTo.sy - 15);
            ctx.textAlign = 'start';
          }
        }

        // Active Arrival Runway ILS Intercept Gate Marker in DIRECT_TO mode
        if (activeTool === 'DIRECT_TO' && rwy && ac.status !== 'Departing') {
          const radRwy = (rwy.heading * Math.PI) / 180;
          const gx = rwy.threshold.x - 11.0 * Math.sin(radRwy);
          const gy = rwy.threshold.y - 11.0 * Math.cos(radRwy);
          const gp = worldToScreen(gx, gy);

          ctx.strokeStyle = hoveredIlsGate
            ? theme.canvas.directHoverHighlight
            : theme.canvas.selectionRing;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(gp.sx, gp.sy, 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = theme.canvas.selectionRing;
          ctx.font = 'bold 9px "IBM Plex Mono", monospace';
          ctx.fillText(`ILS GATE ${rwy.id}`, gp.sx + 9, gp.sy + 3);
        }

        ctx.restore();
      } else if (radarLayers.trails && trk && trk.history && trk.history.length > 0) {
        // Standard decaying phosphor trail for unselected aircraft
        for (let i = 0; i < trk.history.length; i++) {
          const hp = trk.history[i];
          const hPos = worldToScreen(hp.x, hp.y);
          const alpha = 0.12 + (i / trk.history.length) * 0.45;
          ctx.fillStyle = isCritical
            ? `rgba(${theme.canvas.trailCriticalRgb}, ${alpha})`
            : isStale
            ? `rgba(${theme.canvas.trailStaleRgb}, ${alpha})`
            : `rgba(${theme.canvas.trailNormalRgb}, ${alpha})`;
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

      // 7d. Target Silhouette Symbol (Class & Model Matched, Heading Aligned)
      if (isLost) {
        ctx.save();
        ctx.translate(pos.sx, pos.sy);
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = isFreshHit ? 2.2 : 1.8;
        ctx.strokeRect(-5, -5, 10, 10);
        ctx.restore();
      } else {
        drawRadarAircraftSilhouette(ctx, pos.sx, pos.sy, {
          aircraftType: ac.aircraftType,
          headingDeg: ac.heading,
          primaryColor,
          isSelected,
          isFreshHit,
          rangeNM,
          selectionReticleColor: theme.canvas.selectionReticle,
        });
      }

      // Active VHF Radio Transmission Animation on Target Blip
      const isTransmitting = Boolean(activeTransmission && activeTransmission.callsign === ac.callsign);
      const speakerRole = isTransmitting ? activeTransmission?.speaker : null;

      if (isTransmitting) {
        ctx.save();
        const animProgress = (now % 900) / 900;
        const isPilot = speakerRole === 'PILOT';
        const waveColor = isPilot ? theme.canvas.pilotWaveRgb : theme.canvas.atcWaveRgb;

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
        ctx.strokeStyle = theme.canvas.targetCritical;
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
        ctx.strokeStyle = theme.canvas.selectionRing;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(pos.sx, pos.sy, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 7e. Interactive Heading Vector Handle with Curved Turn Arc & Live STCA Separation Lookahead
      if (isSelected && (activeTool === 'HEADING_VECTOR' || isDraggingHeading)) {
        const handleRadiusPx = 44;
        const currentHdg = previewHeading !== null ? previewHeading : ac.targetHeading;
        const currentHdgRad = (currentHdg * Math.PI) / 180;
        const turnDelta = Math.round(((currentHdg - ac.heading + 540) % 360) - 180);

        // Simulate curved trajectory & 90s STCA separation check along proposed heading
        const turnPts: Array<{ x: number; y: number }> = [{ x: displayX, y: displayY }];
        let vx = displayX;
        let vy = displayY;
        let vHdg = ac.heading;
        const spdNmSec = Math.max(120, ac.groundSpeed || ac.indicatedAirspeed) / 3600;
        let minSepNM = Infinity;
        let conflictPeerCallsign: string | null = null;

        for (let t = 1; t <= 90; t++) {
          const d = ((currentHdg - vHdg + 540) % 360) - 180;
          if (Math.abs(d) <= 3.0) {
            vHdg = currentHdg;
          } else {
            vHdg = normalizeHeading(vHdg + Math.sign(d) * 3.0);
          }
          const r = (vHdg * Math.PI) / 180;
          vx += spdNmSec * Math.sin(r);
          vy += spdNmSec * Math.cos(r);
          if (t % 3 === 0) turnPts.push({ x: vx, y: vy });

          if (isDraggingHeading) {
            for (const other of aircraft) {
              if (other.id === ac.id || other.status === 'Landed') continue;
              if (Math.abs(other.altitude - ac.targetAltitude) > 1000 && Math.abs(other.altitude - ac.altitude) > 1000) {
                continue;
              }
              const oSpdNmSec = (other.groundSpeed || other.indicatedAirspeed) / 3600;
              const oRad = (other.heading * Math.PI) / 180;
              const ox = other.x + oSpdNmSec * t * Math.sin(oRad);
              const oy = other.y + oSpdNmSec * t * Math.cos(oRad);
              const sep = Math.hypot(vx - ox, vy - oy);
              if (sep < minSepNM) {
                minSepNM = sep;
                if (sep < 3.5) conflictPeerCallsign = other.callsign;
              }
            }
          }
        }

        const hasVectorConflict = minSepNM < 3.5;
        const vectorColor = hasVectorConflict
          ? theme.canvas.vectorConflict
          : theme.canvas.vectorNormal;

        // Outer control circle
        ctx.strokeStyle = hasVectorConflict
          ? theme.canvas.vectorRingConflict
          : theme.canvas.vectorRingNormal;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.arc(pos.sx, pos.sy, handleRadiusPx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Interactive handle pip
        const handleX = pos.sx + handleRadiusPx * Math.sin(currentHdgRad);
        const handleY = pos.sy - handleRadiusPx * Math.cos(currentHdgRad);

        ctx.fillStyle = vectorColor;
        ctx.strokeStyle = theme.canvas.routeMarkerStroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(handleX, handleY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Proposed Curved Turn Arc & 12 NM Straight Vector
        const projEndWx = vx + 10.0 * Math.sin(currentHdgRad);
        const projEndWy = vy + 10.0 * Math.cos(currentHdgRad);
        const projEnd = worldToScreen(projEndWx, projEndWy);

        ctx.strokeStyle = vectorColor;
        ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(pos.sx, pos.sy);
        for (let p = 1; p < turnPts.length; p++) {
          const sp = worldToScreen(turnPts[p].x, turnPts[p].y);
          ctx.lineTo(sp.sx, sp.sy);
        }
        ctx.lineTo(projEnd.sx, projEnd.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Proposed heading + delta + STCA conflict badge
        const deltaStr = `${turnDelta >= 0 ? 'R' : 'L'}${Math.abs(turnDelta)}°`;
        const hdgBadgeText = hasVectorConflict
          ? `HDG ${Math.round(currentHdg).toString().padStart(3, '0')}° · STCA ${minSepNM.toFixed(1)}NM (${conflictPeerCallsign})`
          : `HDG ${Math.round(currentHdg).toString().padStart(3, '0')}° (${deltaStr})`;
        ctx.font = 'bold 10px "IBM Plex Mono", monospace';
        const bw = ctx.measureText(hdgBadgeText).width + 12;

        ctx.fillStyle = hasVectorConflict
          ? theme.canvas.vectorBadgeConflictBg
          : theme.canvas.vectorBadgeBg;
        ctx.strokeStyle = vectorColor;
        ctx.lineWidth = 1.2;
        ctx.fillRect(handleX + 8, handleY - 12, bw, 20);
        ctx.strokeRect(handleX + 8, handleY - 12, bw, 20);
        ctx.fillStyle = vectorColor;
        ctx.fillText(hdgBadgeText, handleX + 14, handleY + 2);
      }

      // 7f. Structured 3/4-Line ICAO Data Block (Part 5 & Route Details)
      const tagOff = ac.tagOffset || { x: 28, y: -24 };
      const tagX = pos.sx + tagOff.x;
      const tagY = pos.sy + tagOff.y;

      // Leader line connecting aircraft target to data tag
      ctx.strokeStyle = isTransmitting
        ? speakerRole === 'PILOT'
          ? theme.canvas.txPilotColor
          : theme.canvas.txAtcColor
        : primaryColor;
      ctx.lineWidth = isTransmitting ? 1.8 : 1;
      ctx.beginPath();
      ctx.moveTo(pos.sx, pos.sy);
      ctx.lineTo(tagX, tagY);
      ctx.stroke();

      // Data Block Box Background
      const extTag = radarLayers.extendedTargetTags;
      const boxWidth = isSelected ? (extTag ? 152 : 122) : (extTag ? 124 : 98);
      const boxHeight = isSelected ? (extTag ? 58 : 49) : (extTag ? 47 : 38);
      ctx.fillStyle = isSelected ? theme.canvas.tagBgSelected : theme.canvas.tagBg;
      ctx.strokeStyle = isTransmitting
        ? speakerRole === 'PILOT'
          ? theme.canvas.txPilotColor
          : theme.canvas.txAtcColor
        : isFreshHit
        ? theme.canvas.tagBorderFresh
        : primaryColor;
      ctx.lineWidth = isTransmitting ? 2 : isSelected ? 1.5 : 0.8;
      ctx.fillRect(tagX, tagY - 10, boxWidth, boxHeight);
      ctx.strokeRect(tagX, tagY - 10, boxWidth, boxHeight);

      // Active Transmission Badge pinned above Data Block
      if (isTransmitting) {
        ctx.save();
        const isPilot = speakerRole === 'PILOT';
        const badgeColor = isPilot ? theme.canvas.txPilotColor : theme.canvas.txAtcColor;
        const badgeBg = isPilot ? theme.canvas.txPilotBg : theme.canvas.txAtcBg;
        const badgeText = isPilot ? 'PILOT TX' : 'ATC TX';

        ctx.fillStyle = badgeBg;
        ctx.strokeStyle = badgeColor;
        ctx.lineWidth = 1.4;
        ctx.shadowColor = badgeColor;
        ctx.shadowBlur = theme.isLight ? 4 : 8;
        ctx.fillRect(tagX, tagY - 25, boxWidth, 14);
        ctx.strokeRect(tagX, tagY - 25, boxWidth, 14);
        ctx.shadowBlur = 0;

        ctx.fillStyle = badgeColor;
        ctx.font = 'bold 9px "IBM Plex Mono", monospace';
        const barsAnim = Math.floor((now / 150) % 4);
        const bars = barsAnim === 0 ? ' _' : barsAnim === 1 ? ' _=' : barsAnim === 2 ? ' _=#' : ' _=';
        ctx.fillText(`${badgeText}${bars}`, tagX + 4, tagY - 15);
        ctx.restore();
      }

      // Line 1: CALLSIGN / AIRCRAFT TYPE (+Wake Category & 7700 Emergency tag)
      const wakeCode = ac.category === 'Heavy' ? 'H' : ac.category === 'Large' ? 'M' : 'L';
      ctx.fillStyle = isEmergency
        ? theme.canvas.targetCritical
        : isSelected
        ? theme.canvas.tagTextSelected
        : primaryColor;
      ctx.font = 'bold 11px "IBM Plex Mono", monospace';
      ctx.fillText(
        isEmergency
          ? `${ac.callsign} 7700`
          : extTag
          ? `${ac.callsign} ${ac.aircraftType}/${wakeCode}`
          : `${ac.callsign} ${ac.aircraftType}`,
        tagX + 4,
        tagY + 2
      );

      // Line 2: ALTITUDE / CLEARED ALTITUDE / VERTICAL SPEED RATE
      const curAlt100 = Math.round(ac.altitude / 100).toString().padStart(3, '0');
      const tgtAlt100 = Math.round(ac.targetAltitude / 100).toString().padStart(3, '0');
      const vsHundreds = Math.round(Math.abs(ac.verticalSpeed) / 100);
      const vertSymbol = ac.verticalSpeed > 200 ? `↑${vsHundreds}` : ac.verticalSpeed < -200 ? `↓${vsHundreds}` : '=';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.fillStyle = isSelected
        ? getAltitudeColor(ac.altitude, theme.isLight)
        : isEmergency || isCritical
        ? theme.canvas.targetCritical
        : isWarning
        ? theme.canvas.targetWarning
        : theme.canvas.tagAltText;
      ctx.fillText(`${curAlt100} c${tgtAlt100} ${vertSymbol}`, tagX + 4, tagY + 14);

      // Line 3: GROUND SPEED / HEADING (+TRACK WHEN EXTENDED) / FLIGHT PHASE
      const gs = Math.round(ac.groundSpeed || ac.indicatedAirspeed);
      const hdg = Math.round(ac.heading).toString().padStart(3, '0');
      const trkDeg = Math.round(ac.groundTrack ?? ac.heading).toString().padStart(3, '0');
      const isDepTag = ac.status === 'Departing' || ac.status === 'Outbound';
      const depPhaseCode =
        ac.flightPhase === 'HANDOFF_READY'
          ? 'H/O'
          : ac.flightPhase === 'EXIT_ROUTING'
          ? 'SID'
          : ac.flightPhase === 'INITIAL_CLIMB'
          ? 'CLB'
          : ac.flightPhase === 'LINEUP'
          ? 'LUP'
          : ac.flightPhase === 'HOLD_SHORT'
          ? 'HLD'
          : ac.flightPhase === 'TAKEOFF_ROLL' || ac.flightPhase === 'ROTATION' || ac.flightPhase === 'LIFTOFF'
          ? 'T/O'
          : ac.status.slice(0, 3).toUpperCase();
      const arrPhaseCode = ac.landingCleared
        ? 'CLR'
        : ac.landingClearanceRequested
        ? 'REQ'
        : ac.ilsGlideslopeCaptured
        ? 'GS'
        : ac.ilsLocalizerCaptured
        ? 'LOC'
        : ac.flightPhase === 'FINAL_INTERCEPT'
        ? 'INT'
        : ac.flightPhase === 'BASE_VECTOR'
        ? 'BAS'
        : ac.flightPhase === 'STAR_ENROUTE'
        ? 'STR'
        : ac.status.slice(0, 3).toUpperCase();
      const phaseTag = isEmergency
        ? 'EMER'
        : isDepTag
        ? depPhaseCode
        : arrPhaseCode;
      const hdgStr = extTag && trkDeg !== hdg ? `${hdg}/${trkDeg}°` : `${hdg}°`;
      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillStyle = isEmergency
        ? theme.canvas.targetCritical
        : ac.flightPhase === 'HANDOFF_READY' || (!isDepTag && ac.landingCleared)
        ? theme.canvas.tagPhaseReady
        : !isDepTag && (ac.landingClearanceRequested || ac.flightPhase === 'BASE_VECTOR')
        ? theme.canvas.tagPhaseRequest
        : ac.ilsGlideslopeCaptured ||
          ac.ilsLocalizerCaptured ||
          ac.flightPhase === 'EXIT_ROUTING' ||
          ac.flightPhase === 'STAR_ENROUTE' ||
          ac.flightPhase === 'FINAL_INTERCEPT'
        ? theme.canvas.tagPhaseActive
        : theme.canvas.tagPhaseMuted;
      ctx.fillText(`${gs}kt ${hdgStr} ${phaseTag}`, tagX + 4, tagY + 25);

      // Line 4: Tactical Route / Exit Gate / Landing Clearance / Runway / Distance Readout
      const distStr =
        typeof ac.distanceToThreshold === 'number'
          ? `${ac.distanceToThreshold.toFixed(1)}NM`
          : `${Math.hypot(ac.x, ac.y).toFixed(1)}NM`;
      const depRouteChip =
        ac.flightPhase === 'HANDOFF_READY'
          ? `HO ${ac.assignedExitWaypoint || 'CTR'}`
          : ac.assignedWaypoint
          ? `→${ac.assignedWaypoint}`
          : ac.assignedExitWaypoint
          ? `EXIT ${ac.assignedExitWaypoint}`
          : `R${ac.assignedRunway}`;
      const arrRouteChip = ac.landingCleared
        ? `CLR LND ${ac.assignedRunway}`
        : ac.landingClearanceRequested
        ? `REQ LND ${ac.assignedRunway}`
        : ac.assignedWaypoint
        ? `→${ac.assignedWaypoint}`
        : `R${ac.assignedRunway}`;
      if (isSelected) {
        ctx.font = 'bold 9px "IBM Plex Mono", monospace';
        ctx.fillStyle =
          ac.flightPhase === 'HANDOFF_READY' || (!isDepTag && ac.landingCleared)
            ? theme.canvas.tagPhaseReady
            : !isDepTag && ac.landingClearanceRequested
            ? theme.canvas.tagPhaseRequest
            : theme.canvas.tagPhaseActive;
        const routeChip = isDepTag ? depRouteChip : arrRouteChip;
        ctx.fillText(
          extTag
            ? `${ac.origin}→${ac.destination} [${routeChip} ${distStr}]`
            : `${ac.origin} ➔ ${ac.destination} [${routeChip}]`,
          tagX + 4,
          tagY + 36
        );
      } else if (extTag) {
        ctx.font = '9px "IBM Plex Mono", monospace';
        ctx.fillStyle =
          ac.flightPhase === 'HANDOFF_READY' || (!isDepTag && ac.landingCleared)
            ? theme.canvas.tagPhaseReady
            : ac.status === 'Departing' || (!isDepTag && ac.landingClearanceRequested)
            ? theme.canvas.tagPhaseRequest
            : theme.canvas.tagRouteMuted;
        const navHint = isDepTag
          ? depRouteChip
          : ac.landingCleared || ac.landingClearanceRequested
          ? arrRouteChip
          : ac.assignedWaypoint
          ? `→${ac.assignedWaypoint}`
          : `RWY ${ac.assignedRunway}`;
        ctx.fillText(`${navHint} · ${distStr}`, tagX + 4, tagY + 35);
      }
    }

    // 8. Tactical Measuring Ruler
    if (measuringRuler) {
      const p1 = worldToScreen(measuringRuler.start.x, measuringRuler.start.y);
      const p2 = worldToScreen(measuringRuler.current.x, measuringRuler.current.y);

      ctx.strokeStyle = theme.canvas.rulerColor;
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
      ctx.fillStyle = theme.canvas.rulerBg;
      ctx.strokeStyle = theme.canvas.rulerColor;
      ctx.lineWidth = 1;
      ctx.fillRect(midX + 8, midY - 14, 106, 26);
      ctx.strokeRect(midX + 8, midY - 14, 106, 26);

      ctx.fillStyle = theme.canvas.rulerColor;
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
    airportVisibility,
    visibleWaypointSet,
    visibleStarSet,
    visibleSidSet,
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
    hoveredWaypointName,
    hoveredIlsGate,
    chainRouteMode,
    canvasSize,
    theme,
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
      // 1. Direct click on aircraft blip FIRST (click-to-select without changing heading or controls)
      for (const ac of aircraft) {
        const blipPos = worldToScreen(ac.x, ac.y);
        const dist = Math.hypot(sx - blipPos.sx, sy - blipPos.sy);
        if (dist <= 20) {
          selectAircraft(ac.id);
          setIsDraggingHeading(false);
          setHasDraggedHeading(false);
          setPreviewHeading(null);
          return;
        }
      }

      // 2. Direct click on aircraft data tag (click-to-select & drag-repositioning)
      for (const ac of aircraft) {
        const blipPos = worldToScreen(ac.x, ac.y);
        const tagOff = ac.tagOffset || { x: 28, y: -24 };
        const tagX = blipPos.sx + tagOff.x;
        const tagY = blipPos.sy + tagOff.y;
        const isSel = ac.id === selectedAircraftId;
        const extTag = radarLayers.extendedTargetTags;
        const boxWidth = isSel ? (extTag ? 155 : 125) : (extTag ? 127 : 100);
        const boxHeight = isSel ? (extTag ? 60 : 50) : (extTag ? 49 : 40);

        if (sx >= tagX - 4 && sx <= tagX + boxWidth + 4 && sy >= tagY - 12 && sy <= tagY + boxHeight + 4) {
          selectAircraft(ac.id);
          setDraggingTagId(ac.id);
          setIsDraggingHeading(false);
          setHasDraggedHeading(false);
          setPreviewHeading(null);
          return;
        }
      }

      // 3. Check Direct-To Waypoint or ILS Gate click when DIRECT_TO tool is active
      if (selectedAircraftId && activeTool === 'DIRECT_TO') {
        const selAc = aircraft.find(a => a.id === selectedAircraftId);
        if (selAc) {
          for (const wp of airport.waypoints) {
            if (!radarLayers.waypointLabels || !visibleWaypointSet.has(wp.name)) continue;
            const wpPos = worldToScreen(wp.position.x, wp.position.y);
            if (Math.hypot(sx - wpPos.sx, sy - wpPos.sy) <= 18) {
              if (e.shiftKey || chainRouteMode) {
                appendWaypointRoute(selAc.id, wp.name);
              } else {
                directTo(selAc.id, wp.name);
              }
              return;
            }
          }

          // Check Active Arrival Runway ILS Intercept Gate (~11 NM back)
          const arrRwy = airport.runways.find(r => r.id === (selAc.assignedRunway || activeLandingRunwayId));
          if (arrRwy && selAc.status !== 'Departing') {
            const rRad = (arrRwy.heading * Math.PI) / 180;
            const gatePos = worldToScreen(
              arrRwy.threshold.x - 11.0 * Math.sin(rRad),
              arrRwy.threshold.y - 11.0 * Math.cos(rRad)
            );
            if (Math.hypot(sx - gatePos.sx, sy - gatePos.sy) <= 18) {
              vectorToIntercept(selAc.id, arrRwy.id);
              return;
            }
          }
        }
      }

      // 4. Heading Vector Drag ONLY when HEADING_VECTOR tool is explicitly active or Alt key is held
      if (selectedAircraftId && (activeTool === 'HEADING_VECTOR' || e.altKey)) {
        const selAc = aircraft.find(a => a.id === selectedAircraftId);
        if (selAc) {
          const blipPos = worldToScreen(selAc.x, selAc.y);
          const distToBlip = Math.hypot(sx - blipPos.sx, sy - blipPos.sy);
          if (distToBlip >= 15 && distToBlip <= 250) {
            setIsDraggingHeading(true);
            setHasDraggedHeading(false);
            const hdg = calculateBearing(blipPos.sx, blipPos.sy, sx, sy);
            setPreviewHeading(normalizeHeading(Math.round(hdg)));
            return;
          }
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

    // Update hover previews in DIRECT_TO mode
    if (activeTool === 'DIRECT_TO' && selectedAircraft) {
      let foundWp: string | null = null;
      for (const wp of airport.waypoints) {
        if (!radarLayers.waypointLabels || !visibleWaypointSet.has(wp.name)) continue;
        const wpPos = worldToScreen(wp.position.x, wp.position.y);
        if (Math.hypot(sx - wpPos.sx, sy - wpPos.sy) <= 18) {
          foundWp = wp.name;
          break;
        }
      }
      setHoveredWaypointName(foundWp);

      let foundGate = false;
      const arrRwy = airport.runways.find(
        r => r.id === (selectedAircraft.assignedRunway || activeLandingRunwayId)
      );
      if (!foundWp && arrRwy && selectedAircraft.status !== 'Departing') {
        const rRad = (arrRwy.heading * Math.PI) / 180;
        const gatePos = worldToScreen(
          arrRwy.threshold.x - 11.0 * Math.sin(rRad),
          arrRwy.threshold.y - 11.0 * Math.cos(rRad)
        );
        foundGate = Math.hypot(sx - gatePos.sx, sy - gatePos.sy) <= 18;
      }
      setHoveredIlsGate(foundGate);
    } else if (hoveredWaypointName || hoveredIlsGate) {
      setHoveredWaypointName(null);
      setHoveredIlsGate(false);
    }

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
        setHasDraggedHeading(true);
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
    // Only apply heading command if heading vector tool was dragging AND mouse was actively moved!
    if (isDraggingHeading && hasDraggedHeading && selectedAircraftId && previewHeading !== null) {
      const selAc = aircraft.find(a => a.id === selectedAircraftId);
      if (selAc) {
        setHeading(selAc.id, previewHeading);
      }
    }

    setIsDraggingHeading(false);
    setHasDraggedHeading(false);
    setPreviewHeading(null);
    setIsPanning(false);
    setDraggingTagId(null);
    if (activeTool !== 'MEASURE') {
      setMeasuringRuler(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.14 : 0.87;
    setRangeNM(prev =>
      Number(Math.max(MIN_RANGE_NM, Math.min(MAX_RANGE_NM, prev * zoomFactor)).toFixed(1))
    );
  };

  const handleResetView = () => {
    setPanOffset({ x: 0, y: 0 });
    setRangeNM(35);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: theme.ui.containerBg }}
    >
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

      {/* CRT Scanline & Phosphor Vignette Overlay (hidden in Daylight Chart mode) */}
      <div
        className="absolute inset-0 radar-crt-overlay pointer-events-none"
        style={{ opacity: theme.crtScanlineOpacity }}
      />

      {/* Minimal Top-Left Pointer, Display & Theme Popover Control */}
      <div className="absolute top-3 left-3 z-20 flex flex-col items-start gap-1.5 font-mono pointer-events-auto select-none">
        <div
          className="flex items-center gap-1 backdrop-blur-md px-1.5 py-1 border rounded-md shadow-lg whitespace-nowrap"
          style={{
            backgroundColor: theme.ui.panelBg,
            borderColor: theme.ui.border,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTool('SELECT')}
            className="px-2 py-1 rounded text-[11px] flex items-center gap-1.5 transition-colors"
            style={{
              backgroundColor: activeTool === 'SELECT' ? theme.ui.accentPrimaryBg : 'transparent',
              color: activeTool === 'SELECT' ? theme.ui.accentPrimary : theme.ui.textSecondary,
            }}
            title="Select Target & Drag Tag"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Select</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool('HEADING_VECTOR')}
            className="px-2 py-1 rounded text-[11px] flex items-center gap-1.5 transition-colors"
            style={{
              backgroundColor:
                activeTool === 'HEADING_VECTOR' ? theme.ui.accentSecondaryBg : 'transparent',
              color:
                activeTool === 'HEADING_VECTOR' ? theme.ui.accentSecondary : theme.ui.textSecondary,
            }}
            title="Drag Heading Vector [H]"
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Vector</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool('DIRECT_TO')}
            className="px-2 py-1 rounded text-[11px] flex items-center gap-1.5 transition-colors"
            style={{
              backgroundColor: activeTool === 'DIRECT_TO' ? theme.ui.accentPrimaryBg : 'transparent',
              color: activeTool === 'DIRECT_TO' ? theme.ui.accentPrimary : theme.ui.textSecondary,
            }}
            title="Direct-To Fix [D] (Shift+Click to chain)"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Direct</span>
          </button>

          {activeTool === 'DIRECT_TO' && (
            <button
              type="button"
              onClick={() => setChainRouteMode(prev => !prev)}
              className="px-1.5 py-1 rounded text-[10px] font-bold transition-colors"
              style={{
                backgroundColor: chainRouteMode ? theme.ui.accentWarnBg : theme.ui.subPanelBg,
                color: chainRouteMode ? theme.ui.accentWarn : theme.ui.textSecondary,
              }}
              title="Append waypoints into multi-leg route"
            >
              +Leg
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTool('MEASURE')}
            className="px-2 py-1 rounded text-[11px] flex items-center gap-1.5 transition-colors"
            style={{
              backgroundColor: activeTool === 'MEASURE' ? theme.ui.accentWarnBg : 'transparent',
              color: activeTool === 'MEASURE' ? theme.ui.accentWarn : theme.ui.textSecondary,
            }}
            title="Measure Distance & Bearing [M]"
          >
            <Ruler className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Measure</span>
          </button>

          <span
            className="h-4 w-px mx-0.5"
            style={{ backgroundColor: theme.ui.divider }}
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={() => {
              setShowScopeControls(prev => !prev);
              setShowThemeMenu(false);
            }}
            className="px-2 py-1 rounded text-[11px] flex items-center gap-1.5 transition-colors"
            style={{
              backgroundColor: showScopeControls ? theme.ui.accentPrimaryBg : 'transparent',
              color: showScopeControls ? theme.ui.accentPrimary : theme.ui.textPrimary,
            }}
            title="Radar Display Layers & Declutter"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Display</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowThemeMenu(prev => !prev);
              setShowScopeControls(false);
            }}
            className="px-2 py-1 rounded text-[11px] flex items-center gap-1.5 transition-colors"
            style={{
              backgroundColor: showThemeMenu ? theme.ui.accentSecondaryBg : 'transparent',
              color: showThemeMenu ? theme.ui.accentSecondary : theme.ui.textPrimary,
            }}
            title="Switch Radar Screen Color Theme"
            data-testid="radar-theme-toggle"
          >
            <Palette className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{theme.shortName}</span>
          </button>
        </div>

        {/* Radar Scope Visual Theme Selector Popover */}
        {showThemeMenu && (
          <div
            className="w-80 backdrop-blur-md border rounded-md p-3 shadow-2xl flex flex-col gap-2"
            style={{
              backgroundColor: theme.ui.panelBg,
              borderColor: theme.ui.border,
            }}
          >
            <div
              className="flex items-center justify-between pb-2 border-b"
              style={{ borderColor: theme.ui.subBorder }}
            >
              <div>
                <div className="text-[11px] font-semibold" style={{ color: theme.ui.textPrimary }}>
                  Radar Scope Theme
                </div>
                <div className="text-[10px]" style={{ color: theme.ui.textMuted }}>
                  Pre-designed color palettes · saved per user
                </div>
              </div>
              <span
                className="text-[10px] font-semibold"
                style={{ color: theme.ui.accentSecondary }}
              >
                {theme.shortName}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {RADAR_THEME_LIST.map(preset => {
                const isSelectedTheme = preset.id === theme.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setRadarTheme(preset.id);
                      setShowThemeMenu(false);
                    }}
                    className="flex items-center justify-between gap-2.5 px-2.5 py-2 rounded border text-left transition-colors"
                    style={{
                      backgroundColor: isSelectedTheme
                        ? theme.ui.accentSecondaryBg
                        : theme.ui.subPanelBg,
                      borderColor: isSelectedTheme
                        ? theme.ui.accentSecondary
                        : theme.ui.subBorder,
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Mini Circular Scope Preview Swatch */}
                      <span
                        className="relative w-7 h-7 rounded-full border shrink-0 flex items-center justify-center overflow-hidden"
                        style={{
                          backgroundColor: preset.swatch.bg,
                          borderColor: preset.swatch.ring,
                        }}
                      >
                        <span
                          className="w-4 h-4 rounded-full border flex items-center justify-center"
                          style={{ borderColor: preset.swatch.ring }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: preset.swatch.primary }}
                          />
                        </span>
                        <span
                          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: preset.swatch.secondary }}
                        />
                      </span>

                      <div className="min-w-0">
                        <div
                          className="text-[11px] font-semibold truncate"
                          style={{ color: theme.ui.textPrimary }}
                        >
                          {preset.name}
                        </div>
                        <div
                          className="text-[9px] truncate"
                          style={{ color: theme.ui.textMuted }}
                        >
                          {preset.subtitle}
                        </div>
                      </div>
                    </div>

                    {isSelectedTheme && (
                      <Check
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: theme.ui.accentSecondary }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Clean Collapsible Display Popover */}
        {showScopeControls && (
          <div
            className="w-72 backdrop-blur-md border rounded-md p-3 shadow-2xl flex flex-col gap-3"
            style={{
              backgroundColor: theme.ui.panelBg,
              borderColor: theme.ui.border,
            }}
          >
            {/* Declutter Modes */}
            <div
              className="flex items-center justify-between gap-2 pb-2 border-b"
              style={{ borderColor: theme.ui.subBorder }}
            >
              <span className="text-[11px] font-semibold" style={{ color: theme.ui.textPrimary }}>
                Scope Density
              </span>
              <div
                className="flex items-center gap-1 p-0.5 rounded border text-[10px]"
                style={{
                  backgroundColor: theme.ui.subPanelBg,
                  borderColor: theme.ui.subBorder,
                }}
              >
                <button
                  type="button"
                  onClick={() => applyRadarDeclutter('full')}
                  className="px-2 py-0.5 rounded transition-colors"
                  style={{ color: theme.ui.accentPrimary }}
                >
                  Full
                </button>
                <button
                  type="button"
                  onClick={() => applyRadarDeclutter('tactical')}
                  className="px-2 py-0.5 rounded transition-colors"
                  style={{ color: theme.ui.accentSecondary }}
                >
                  Tactical
                </button>
                <button
                  type="button"
                  onClick={() => applyRadarDeclutter('minimal')}
                  className="px-2 py-0.5 rounded transition-colors"
                  style={{ color: theme.ui.accentWarn }}
                >
                  Min
                </button>
              </div>
            </div>

            {/* Layer Toggles */}
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { key: 'terrain', label: 'Terrain Relief' },
                  { key: 'rangeRings', label: 'Range Rings' },
                  { key: 'runways', label: 'Runways' },
                  { key: 'extendedCenterlines', label: 'ILS Feathers' },
                  { key: 'tmaBoundary', label: 'TMA Sector' },
                  { key: 'starCorridors', label: 'STAR Routes' },
                  { key: 'sidCorridors', label: 'SID Routes' },
                  { key: 'waypointLabels', label: 'Fixes' },
                  { key: 'procedureRestrictions', label: 'Alt/Spd Limits' },
                  { key: 'holdingStacks', label: 'Holds' },
                  { key: 'trails', label: 'Trails' },
                  { key: 'speedVectors', label: 'Vectors' },
                  { key: 'extendedTargetTags', label: 'Ext Tags' },
                  { key: 'radarSweep', label: 'Sweep' },
                ] as Array<{ key: keyof RadarLayers; label: string }>
              ).map(item => {
                const active = radarLayers[item.key];
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => toggleLayer(item.key)}
                    className="flex items-center justify-between px-2 py-1 rounded text-[10px] border transition-colors"
                    style={{
                      backgroundColor: active ? theme.ui.accentPrimaryBg : theme.ui.subPanelBg,
                      color: active ? theme.ui.textPrimary : theme.ui.textMuted,
                      borderColor: active ? theme.ui.border : theme.ui.subBorder,
                    }}
                  >
                    <span className="truncate">{item.label}</span>
                    {active ? (
                      <Eye className="w-3 h-3 shrink-0" style={{ color: theme.ui.accentPrimary }} />
                    ) : (
                      <EyeOff className="w-3 h-3 shrink-0" style={{ color: theme.ui.textMuted }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Compact Altitude Color Reference */}
            <div className="pt-2 border-t" style={{ borderColor: theme.ui.subBorder }}>
              <div className="text-[10px] mb-1" style={{ color: theme.ui.textSecondary }}>
                Altitude Color Key
              </div>
              <div className="grid grid-cols-5 gap-1 text-center text-[9px] tabular-nums font-semibold">
                <div style={{ color: getAltitudeColor(11000, theme.isLight) }}>≥FL100</div>
                <div style={{ color: getAltitudeColor(8000, theme.isLight) }}>7–10k</div>
                <div style={{ color: getAltitudeColor(5500, theme.isLight) }}>4.5–7k</div>
                <div style={{ color: getAltitudeColor(3500, theme.isLight) }}>2.5–4.5</div>
                <div style={{ color: getAltitudeColor(1500, theme.isLight) }}>&lt;2.5k</div>
              </div>
            </div>

            {/* Footer Link to Full Routes & Layers Setup Page */}
            <div
              className="pt-2 border-t flex items-center justify-between"
              style={{ borderColor: theme.ui.subBorder }}
            >
              <button
                type="button"
                onClick={() => setAllRadarLayers(false)}
                className="text-[10px] text-[#ff5c6c] hover:underline"
              >
                Hide All
              </button>
              {onOpenSetupRoutes && (
                <button
                  type="button"
                  onClick={() => {
                    setShowScopeControls(false);
                    onOpenSetupRoutes();
                  }}
                  className="text-[10px] flex items-center gap-1 font-semibold hover:underline"
                  style={{ color: theme.ui.accentSecondary }}
                >
                  <span>Per-Airport Routes</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Subtle Cursor World Coordinate Readout (Bottom-Left) */}
      {cursorWorldPos && (
        <div
          className="absolute bottom-3 left-3 text-[10px] font-mono pointer-events-none tabular-nums"
          style={{ color: theme.ui.textMuted }}
        >
          {cursorWorldPos.x >= 0 ? '+' : ''}
          {cursorWorldPos.x.toFixed(1)}, {cursorWorldPos.y >= 0 ? '+' : ''}
          {cursorWorldPos.y.toFixed(1)} NM
        </div>
      )}

      {/* Compact Bottom-Right Range & Center Control */}
      <div className="absolute bottom-3 right-3 z-20 flex flex-col items-end gap-1.5 font-mono pointer-events-auto select-none">
        {showRangeMenu && (
          <div
            className="backdrop-blur-md border rounded-md p-1 flex items-center gap-1 shadow-xl"
            style={{
              backgroundColor: theme.ui.panelBg,
              borderColor: theme.ui.border,
            }}
          >
            {[5, 15, 35, 60, 100, 140].map(r => {
              const active = Math.abs(rangeNM - r) < 0.6;
              return (
                <button
                  type="button"
                  key={r}
                  onClick={() => {
                    setRangeNM(r);
                    setShowRangeMenu(false);
                  }}
                  className="px-2 py-1 rounded text-[10px] font-semibold tabular-nums transition-colors"
                  style={{
                    backgroundColor: active ? theme.ui.accentPrimaryBg : 'transparent',
                    color: active ? theme.ui.accentPrimary : theme.ui.textSecondary,
                  }}
                >
                  {r} NM
                </button>
              );
            })}
          </div>
        )}

        <div
          className="flex items-center gap-1 backdrop-blur-md px-1.5 py-1 border rounded-md shadow-lg"
          style={{
            backgroundColor: theme.ui.panelBg,
            borderColor: theme.ui.border,
          }}
        >
          <button
            type="button"
            onClick={() => setRangeNM(zoomOutStep)}
            className="p-1 rounded transition-colors"
            style={{ color: theme.ui.textSecondary }}
            title="Zoom Out [-]"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setShowRangeMenu(prev => !prev)}
            className="px-2 py-0.5 text-[11px] font-semibold rounded tabular-nums transition-colors"
            style={{ color: theme.ui.accentSecondary }}
            title="Select Radar Range Preset"
          >
            {rangeNM < 10 ? rangeNM.toFixed(1) : Math.round(rangeNM)} NM
          </button>

          <button
            type="button"
            onClick={() => setRangeNM(zoomInStep)}
            className="p-1 rounded transition-colors"
            style={{ color: theme.ui.textSecondary }}
            title="Zoom In [+]"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <span
            className="h-3.5 w-px mx-0.5"
            style={{ backgroundColor: theme.ui.divider }}
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={handleResetView}
            className="p-1 rounded transition-colors"
            style={{ color: theme.ui.textSecondary }}
            title="Center Scope [C]"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
