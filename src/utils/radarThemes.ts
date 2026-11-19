/**
 * SKYCONTROL - Pre-Designed ATC Radar Scope Visual Themes
 * Six authentic aviation/operations scope models covering classic P31 green CRT,
 * P39 amber terminal, FAA ERAM night blue, stealth monochrome slate, tactical red,
 * and high-legibility daylight tower chart mode.
 */

import type { RadarThemeId } from '../types';

export type { RadarThemeId } from '../types';

export interface RadarThemeDefinition {
  id: RadarThemeId;
  name: string;
  shortName: string;
  subtitle: string;
  isLight: boolean;
  crtScanlineOpacity: number;
  swatch: {
    bg: string;
    primary: string;
    secondary: string;
    ring: string;
  };
  canvas: {
    background: string;
    // Sweep & phosphor excitation
    sweepGlowRgb: string;
    sweepLineColor: string;
    bloomInnerRgb: string;
    bloomOuterRgb: string;
    // Grid & compass
    radialCardinal: string;
    radialMinor: string;
    ringMajor: string;
    ringMinor: string;
    ringLabel: string;
    compassCircle: string;
    compassTickMajor: string;
    compassTickMinor: string;
    compassLabel: string;
    // Terrain
    waterFill: string;
    waterStroke: string;
    waterLabel: string;
    riverStroke: string;
    coastlineStroke: string;
    contourLowFill: string;
    contourLowStroke: string;
    contourLowText: string;
    contourMidFill: string;
    contourMidStroke: string;
    contourMidText: string;
    contourHighFill: string;
    contourHighStroke: string;
    contourHighText: string;
    peakStroke: string;
    peakFill: string;
    peakLabel: string;
    obstacleStroke: string;
    obstacleFill: string;
    // Runways & Centerlines
    runwayArrival: string;
    runwayDeparture: string;
    runwayInactive: string;
    centerlineArrival: string;
    centerlineInactive: string;
    centerlineTick: string;
    runwayLabelArrival: string;
    runwayLabelDeparture: string;
    runwayLabelInactive: string;
    // Airspace & Corridors
    tmaStroke: string;
    tmaTagBg: string;
    tmaTagText: string;
    starActive: string;
    starInactive: string;
    starLabelActive: string;
    starLabelInactive: string;
    starTagBg: string;
    sidActive: string;
    sidInactive: string;
    sidLabelActive: string;
    sidLabelInactive: string;
    sidTagBg: string;
    holdStroke: string;
    // Fixes & Waypoints
    wpExit: string;
    wpFaf: string;
    wpHold: string;
    wpIaf: string;
    wpFix: string;
    wpConstraintText: string;
    // Targets & Tracks
    targetPrimary: string;
    targetSelected: string;
    targetFresh: string;
    targetStale: string;
    targetWarning: string;
    targetCritical: string;
    trailNormalRgb: string;
    trailStaleRgb: string;
    trailCriticalRgb: string;
    selectionRing: string;
    selectionReticle: string;
    directHoverHighlight: string;
    directChainHighlight: string;
    // Data Tags & Route Badges
    tagBg: string;
    tagBgSelected: string;
    tagBorderFresh: string;
    tagTextSelected: string;
    tagAltText: string;
    tagPhaseReady: string;
    tagPhaseRequest: string;
    tagPhaseActive: string;
    tagPhaseMuted: string;
    tagRouteMuted: string;
    txPilotColor: string;
    txAtcColor: string;
    txPilotBg: string;
    txAtcBg: string;
    pilotWaveRgb: string;
    atcWaveRgb: string;
    originBadgeBg: string;
    originBadgeText: string;
    legDistBg: string;
    legDistText: string;
    routeBadgeBg: string;
    routeBadgeText: string;
    routeMarkerStroke: string;
    // Vector handle & ruler
    vectorNormal: string;
    vectorRingNormal: string;
    vectorBadgeBg: string;
    vectorConflict: string;
    vectorRingConflict: string;
    vectorBadgeConflictBg: string;
    rulerColor: string;
    rulerBg: string;
  };
  ui: {
    containerBg: string;
    panelBg: string;
    subPanelBg: string;
    border: string;
    subBorder: string;
    divider: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accentPrimary: string;
    accentPrimaryBg: string;
    accentSecondary: string;
    accentSecondaryBg: string;
    accentWarn: string;
    accentWarnBg: string;
    hoverBg: string;
  };
}

export const DEFAULT_RADAR_THEME_ID: RadarThemeId = 'phosphor_crt';

export const RADAR_THEMES: Record<RadarThemeId, RadarThemeDefinition> = {
  phosphor_crt: {
    id: 'phosphor_crt',
    name: 'P31 Green CRT',
    shortName: 'P31 Green',
    subtitle: 'Classic phosphor radar scope',
    isLight: false,
    crtScanlineOpacity: 1,
    swatch: {
      bg: '#030805',
      primary: '#00ff66',
      secondary: '#00e5ff',
      ring: '#16452b',
    },
    canvas: {
      background: '#030805',
      sweepGlowRgb: '0, 255, 102',
      sweepLineColor: 'rgba(57, 255, 20, 0.85)',
      bloomInnerRgb: '215, 255, 235',
      bloomOuterRgb: '0, 255, 102',
      radialCardinal: '#0e2d1d',
      radialMinor: '#081e12',
      ringMajor: '#123a24',
      ringMinor: '#092214',
      ringLabel: '#257347',
      compassCircle: '#16452b',
      compassTickMajor: '#2b8252',
      compassTickMinor: '#143d26',
      compassLabel: '#339860',
      waterFill: 'rgba(8, 44, 66, 0.52)',
      waterStroke: 'rgba(42, 146, 185, 0.44)',
      waterLabel: 'rgba(84, 186, 224, 0.58)',
      riverStroke: 'rgba(38, 138, 178, 0.48)',
      coastlineStroke: 'rgba(56, 174, 206, 0.50)',
      contourLowFill: 'rgba(20, 68, 42, 0.17)',
      contourLowStroke: 'rgba(56, 142, 88, 0.28)',
      contourLowText: 'rgba(92, 176, 122, 0.58)',
      contourMidFill: 'rgba(108, 96, 30, 0.14)',
      contourMidStroke: 'rgba(182, 162, 58, 0.32)',
      contourMidText: 'rgba(198, 182, 90, 0.65)',
      contourHighFill: 'rgba(138, 86, 26, 0.17)',
      contourHighStroke: 'rgba(222, 152, 58, 0.36)',
      contourHighText: 'rgba(232, 178, 88, 0.68)',
      peakStroke: 'rgba(232, 180, 74, 0.72)',
      peakFill: 'rgba(232, 180, 74, 0.28)',
      peakLabel: 'rgba(238, 190, 92, 0.76)',
      obstacleStroke: 'rgba(240, 138, 72, 0.78)',
      obstacleFill: 'rgba(245, 162, 96, 0.85)',
      runwayArrival: '#00ff66',
      runwayDeparture: '#00e5ff',
      runwayInactive: '#1b5e38',
      centerlineArrival: '#009955',
      centerlineInactive: 'rgba(0, 119, 68, 0.45)',
      centerlineTick: '#00bb66',
      runwayLabelArrival: '#00ff88',
      runwayLabelDeparture: '#00e5ff',
      runwayLabelInactive: '#3a8458',
      tmaStroke: 'rgba(0, 229, 255, 0.28)',
      tmaTagBg: 'rgba(3, 16, 20, 0.84)',
      tmaTagText: 'rgba(0, 229, 255, 0.85)',
      starActive: 'rgba(0, 229, 255, 0.50)',
      starInactive: 'rgba(0, 229, 255, 0.20)',
      starLabelActive: 'rgba(0, 229, 255, 0.92)',
      starLabelInactive: 'rgba(0, 229, 255, 0.52)',
      starTagBg: 'rgba(3, 16, 20, 0.82)',
      sidActive: 'rgba(255, 209, 102, 0.52)',
      sidInactive: 'rgba(255, 209, 102, 0.20)',
      sidLabelActive: 'rgba(255, 209, 102, 0.92)',
      sidLabelInactive: 'rgba(255, 209, 102, 0.50)',
      sidTagBg: 'rgba(20, 17, 5, 0.82)',
      holdStroke: 'rgba(0, 160, 200, 0.35)',
      wpExit: '#ffd166',
      wpFaf: '#00ff66',
      wpHold: '#00e5ff',
      wpIaf: '#38bdf8',
      wpFix: '#55aa77',
      wpConstraintText: 'rgba(162, 245, 191, 0.72)',
      targetPrimary: '#00ff66',
      targetSelected: '#ffffff',
      targetFresh: '#caffea',
      targetStale: '#8a9a90',
      targetWarning: '#ffb703',
      targetCritical: '#ff3344',
      trailNormalRgb: '0, 255, 102',
      trailStaleRgb: '138, 154, 144',
      trailCriticalRgb: '255, 51, 68',
      selectionRing: '#00e5ff',
      selectionReticle: 'rgba(0, 255, 102, 0.55)',
      directHoverHighlight: '#00ff66',
      directChainHighlight: '#ffd166',
      tagBg: 'rgba(7, 16, 12, 0.90)',
      tagBgSelected: 'rgba(5, 28, 18, 0.95)',
      tagBorderFresh: '#00ffaa',
      tagTextSelected: '#ffffff',
      tagAltText: '#a2f5bf',
      tagPhaseReady: '#00ff66',
      tagPhaseRequest: '#ffd166',
      tagPhaseActive: '#00e5ff',
      tagPhaseMuted: '#73b890',
      tagRouteMuted: '#58b384',
      txPilotColor: '#00ff66',
      txAtcColor: '#00e5ff',
      txPilotBg: 'rgba(0, 32, 14, 0.96)',
      txAtcBg: 'rgba(0, 24, 34, 0.96)',
      pilotWaveRgb: '0, 255, 102',
      atcWaveRgb: '0, 229, 255',
      originBadgeBg: 'rgba(2, 20, 14, 0.95)',
      originBadgeText: '#ffffff',
      legDistBg: 'rgba(3, 18, 12, 0.85)',
      legDistText: '#9ce8be',
      routeBadgeBg: 'rgba(3, 20, 14, 0.92)',
      routeBadgeText: '#ffffff',
      routeMarkerStroke: '#05140b',
      vectorNormal: '#00e5ff',
      vectorRingNormal: 'rgba(0, 229, 255, 0.45)',
      vectorBadgeBg: 'rgba(0, 26, 18, 0.92)',
      vectorConflict: '#ff4d4d',
      vectorRingConflict: 'rgba(255, 77, 77, 0.5)',
      vectorBadgeConflictBg: 'rgba(42, 10, 12, 0.94)',
      rulerColor: '#ffd166',
      rulerBg: 'rgba(20, 20, 10, 0.92)',
    },
    ui: {
      containerBg: '#030805',
      panelBg: 'rgba(7, 19, 13, 0.94)',
      subPanelBg: '#050c08',
      border: '#1b462e',
      subBorder: '#143724',
      divider: '#19402b',
      textPrimary: '#ffffff',
      textSecondary: '#7cc29a',
      textMuted: '#528f6c',
      accentPrimary: '#00ff66',
      accentPrimaryBg: '#173d28',
      accentSecondary: '#00e5ff',
      accentSecondaryBg: '#113542',
      accentWarn: '#ffd166',
      accentWarnBg: '#362c0b',
      hoverBg: '#10261a',
    },
  },

  amber_atc: {
    id: 'amber_atc',
    name: 'P39 Amber Terminal',
    shortName: 'Amber CRT',
    subtitle: 'Warm monochrome ATC console',
    isLight: false,
    crtScanlineOpacity: 0.95,
    swatch: {
      bg: '#0b0702',
      primary: '#ffb703',
      secondary: '#ffe082',
      ring: '#52380c',
    },
    canvas: {
      background: '#0b0702',
      sweepGlowRgb: '255, 183, 3',
      sweepLineColor: 'rgba(255, 200, 48, 0.85)',
      bloomInnerRgb: '255, 243, 196',
      bloomOuterRgb: '255, 179, 0',
      radialCardinal: '#362407',
      radialMinor: '#211504',
      ringMajor: '#472f09',
      ringMinor: '#291a05',
      ringLabel: '#996814',
      compassCircle: '#52380c',
      compassTickMajor: '#ad7818',
      compassTickMinor: '#422c09',
      compassLabel: '#cf9221',
      waterFill: 'rgba(28, 36, 46, 0.45)',
      waterStroke: 'rgba(130, 145, 160, 0.35)',
      waterLabel: 'rgba(170, 185, 200, 0.55)',
      riverStroke: 'rgba(120, 138, 155, 0.40)',
      coastlineStroke: 'rgba(155, 172, 188, 0.45)',
      contourLowFill: 'rgba(82, 54, 14, 0.18)',
      contourLowStroke: 'rgba(156, 108, 32, 0.30)',
      contourLowText: 'rgba(196, 142, 54, 0.62)',
      contourMidFill: 'rgba(128, 76, 18, 0.16)',
      contourMidStroke: 'rgba(206, 134, 42, 0.34)',
      contourMidText: 'rgba(224, 162, 68, 0.66)',
      contourHighFill: 'rgba(165, 82, 24, 0.20)',
      contourHighStroke: 'rgba(242, 146, 58, 0.40)',
      contourHighText: 'rgba(255, 184, 96, 0.72)',
      peakStroke: 'rgba(255, 204, 102, 0.78)',
      peakFill: 'rgba(255, 183, 3, 0.28)',
      peakLabel: 'rgba(255, 214, 128, 0.80)',
      obstacleStroke: 'rgba(255, 120, 60, 0.82)',
      obstacleFill: 'rgba(255, 148, 82, 0.88)',
      runwayArrival: '#ffb703',
      runwayDeparture: '#ffe082',
      runwayInactive: '#66450d',
      centerlineArrival: '#d99000',
      centerlineInactive: 'rgba(166, 112, 16, 0.45)',
      centerlineTick: '#f5aa14',
      runwayLabelArrival: '#ffd166',
      runwayLabelDeparture: '#fff3bf',
      runwayLabelInactive: '#8f651d',
      tmaStroke: 'rgba(255, 216, 102, 0.30)',
      tmaTagBg: 'rgba(22, 14, 4, 0.86)',
      tmaTagText: 'rgba(255, 216, 102, 0.90)',
      starActive: 'rgba(255, 195, 56, 0.55)',
      starInactive: 'rgba(255, 195, 56, 0.22)',
      starLabelActive: 'rgba(255, 216, 102, 0.94)',
      starLabelInactive: 'rgba(255, 195, 56, 0.54)',
      starTagBg: 'rgba(22, 14, 4, 0.84)',
      sidActive: 'rgba(255, 138, 76, 0.56)',
      sidInactive: 'rgba(255, 138, 76, 0.22)',
      sidLabelActive: 'rgba(255, 168, 112, 0.94)',
      sidLabelInactive: 'rgba(255, 148, 88, 0.52)',
      sidTagBg: 'rgba(24, 11, 4, 0.84)',
      holdStroke: 'rgba(235, 168, 42, 0.38)',
      wpExit: '#ff9248',
      wpFaf: '#ffb703',
      wpHold: '#ffe082',
      wpIaf: '#ffd166',
      wpFix: '#b3812e',
      wpConstraintText: 'rgba(245, 212, 148, 0.74)',
      targetPrimary: '#ffb703',
      targetSelected: '#fff9e6',
      targetFresh: '#ffecb3',
      targetStale: '#96876b',
      targetWarning: '#ff8800',
      targetCritical: '#ff3344',
      trailNormalRgb: '255, 183, 3',
      trailStaleRgb: '150, 135, 107',
      trailCriticalRgb: '255, 51, 68',
      selectionRing: '#ffe082',
      selectionReticle: 'rgba(255, 183, 3, 0.62)',
      directHoverHighlight: '#ffb703',
      directChainHighlight: '#ffe082',
      tagBg: 'rgba(20, 13, 4, 0.91)',
      tagBgSelected: 'rgba(38, 25, 6, 0.96)',
      tagBorderFresh: '#ffe082',
      tagTextSelected: '#fffbeb',
      tagAltText: '#f5d48e',
      tagPhaseReady: '#ffb703',
      tagPhaseRequest: '#fff3b0',
      tagPhaseActive: '#ffe082',
      tagPhaseMuted: '#b89046',
      tagRouteMuted: '#a6823c',
      txPilotColor: '#ffb703',
      txAtcColor: '#fff0a6',
      txPilotBg: 'rgba(34, 21, 2, 0.96)',
      txAtcBg: 'rgba(38, 28, 6, 0.96)',
      pilotWaveRgb: '255, 183, 3',
      atcWaveRgb: '255, 224, 130',
      originBadgeBg: 'rgba(24, 16, 4, 0.95)',
      originBadgeText: '#fffbeb',
      legDistBg: 'rgba(22, 15, 4, 0.88)',
      legDistText: '#f7d58b',
      routeBadgeBg: 'rgba(26, 17, 4, 0.94)',
      routeBadgeText: '#fffbeb',
      routeMarkerStroke: '#140c02',
      vectorNormal: '#ffe082',
      vectorRingNormal: 'rgba(255, 224, 130, 0.45)',
      vectorBadgeBg: 'rgba(28, 19, 4, 0.94)',
      vectorConflict: '#ff4d4d',
      vectorRingConflict: 'rgba(255, 77, 77, 0.5)',
      vectorBadgeConflictBg: 'rgba(42, 10, 12, 0.94)',
      rulerColor: '#fff0a6',
      rulerBg: 'rgba(26, 18, 5, 0.94)',
    },
    ui: {
      containerBg: '#0b0702',
      panelBg: 'rgba(20, 13, 4, 0.94)',
      subPanelBg: '#0d0802',
      border: '#52380c',
      subBorder: '#3b2808',
      divider: '#4a320b',
      textPrimary: '#fffbeb',
      textSecondary: '#e5b865',
      textMuted: '#a17b36',
      accentPrimary: '#ffb703',
      accentPrimaryBg: '#3d2905',
      accentSecondary: '#ffe082',
      accentSecondaryBg: '#332609',
      accentWarn: '#ff9248',
      accentWarnBg: '#3b1c08',
      hoverBg: '#291b05',
    },
  },

  obsidian_blue: {
    id: 'obsidian_blue',
    name: 'ERAM En-Route Blue',
    shortName: 'ERAM Blue',
    subtitle: 'Modern midnight glass console',
    isLight: false,
    crtScanlineOpacity: 0.35,
    swatch: {
      bg: '#040914',
      primary: '#38bdf8',
      secondary: '#34d399',
      ring: '#153459',
    },
    canvas: {
      background: '#040914',
      sweepGlowRgb: '56, 189, 248',
      sweepLineColor: 'rgba(56, 189, 248, 0.78)',
      bloomInnerRgb: '224, 242, 254',
      bloomOuterRgb: '56, 189, 248',
      radialCardinal: '#102947',
      radialMinor: '#09192e',
      ringMajor: '#153459',
      ringMinor: '#0c1f38',
      ringLabel: '#4380b8',
      compassCircle: '#1b406e',
      compassTickMajor: '#4d92cf',
      compassTickMinor: '#193b63',
      compassLabel: '#60a5e6',
      waterFill: 'rgba(12, 54, 98, 0.45)',
      waterStroke: 'rgba(56, 146, 212, 0.42)',
      waterLabel: 'rgba(125, 198, 248, 0.62)',
      riverStroke: 'rgba(56, 148, 216, 0.48)',
      coastlineStroke: 'rgba(84, 182, 240, 0.52)',
      contourLowFill: 'rgba(20, 56, 94, 0.18)',
      contourLowStroke: 'rgba(64, 134, 196, 0.30)',
      contourLowText: 'rgba(116, 178, 232, 0.62)',
      contourMidFill: 'rgba(48, 72, 112, 0.18)',
      contourMidStroke: 'rgba(112, 148, 206, 0.32)',
      contourMidText: 'rgba(154, 184, 235, 0.66)',
      contourHighFill: 'rgba(112, 78, 52, 0.18)',
      contourHighStroke: 'rgba(202, 142, 92, 0.36)',
      contourHighText: 'rgba(232, 178, 128, 0.70)',
      peakStroke: 'rgba(248, 192, 102, 0.76)',
      peakFill: 'rgba(248, 192, 102, 0.28)',
      peakLabel: 'rgba(252, 208, 132, 0.80)',
      obstacleStroke: 'rgba(251, 146, 60, 0.80)',
      obstacleFill: 'rgba(253, 168, 96, 0.88)',
      runwayArrival: '#38bdf8',
      runwayDeparture: '#34d399',
      runwayInactive: '#1e4b73',
      centerlineArrival: '#0ea5e9',
      centerlineInactive: 'rgba(14, 165, 233, 0.40)',
      centerlineTick: '#38bdf8',
      runwayLabelArrival: '#7dd3fc',
      runwayLabelDeparture: '#6ee7b7',
      runwayLabelInactive: '#4c7ba6',
      tmaStroke: 'rgba(125, 211, 252, 0.30)',
      tmaTagBg: 'rgba(6, 16, 32, 0.88)',
      tmaTagText: 'rgba(125, 211, 252, 0.90)',
      starActive: 'rgba(56, 189, 248, 0.54)',
      starInactive: 'rgba(56, 189, 248, 0.22)',
      starLabelActive: 'rgba(125, 211, 252, 0.94)',
      starLabelInactive: 'rgba(56, 189, 248, 0.54)',
      starTagBg: 'rgba(6, 16, 32, 0.86)',
      sidActive: 'rgba(167, 139, 250, 0.55)',
      sidInactive: 'rgba(167, 139, 250, 0.22)',
      sidLabelActive: 'rgba(196, 181, 253, 0.94)',
      sidLabelInactive: 'rgba(167, 139, 250, 0.52)',
      sidTagBg: 'rgba(18, 12, 34, 0.86)',
      holdStroke: 'rgba(94, 234, 212, 0.38)',
      wpExit: '#a78bfa',
      wpFaf: '#34d399',
      wpHold: '#38bdf8',
      wpIaf: '#7dd3fc',
      wpFix: '#5b8bbd',
      wpConstraintText: 'rgba(186, 230, 253, 0.74)',
      targetPrimary: '#38bdf8',
      targetSelected: '#ffffff',
      targetFresh: '#bae6fd',
      targetStale: '#8295ab',
      targetWarning: '#fbbf24',
      targetCritical: '#f43f5e',
      trailNormalRgb: '56, 189, 248',
      trailStaleRgb: '130, 149, 171',
      trailCriticalRgb: '244, 63, 94',
      selectionRing: '#34d399',
      selectionReticle: 'rgba(56, 189, 248, 0.62)',
      directHoverHighlight: '#34d399',
      directChainHighlight: '#fbbf24',
      tagBg: 'rgba(6, 14, 28, 0.92)',
      tagBgSelected: 'rgba(10, 27, 52, 0.96)',
      tagBorderFresh: '#7dd3fc',
      tagTextSelected: '#ffffff',
      tagAltText: '#bae6fd',
      tagPhaseReady: '#34d399',
      tagPhaseRequest: '#fbbf24',
      tagPhaseActive: '#38bdf8',
      tagPhaseMuted: '#7aa7cc',
      tagRouteMuted: '#6893b8',
      txPilotColor: '#34d399',
      txAtcColor: '#38bdf8',
      txPilotBg: 'rgba(6, 30, 26, 0.96)',
      txAtcBg: 'rgba(7, 24, 46, 0.96)',
      pilotWaveRgb: '52, 211, 153',
      atcWaveRgb: '56, 189, 248',
      originBadgeBg: 'rgba(6, 16, 34, 0.95)',
      originBadgeText: '#ffffff',
      legDistBg: 'rgba(6, 16, 34, 0.88)',
      legDistText: '#bae6fd',
      routeBadgeBg: 'rgba(7, 19, 38, 0.94)',
      routeBadgeText: '#ffffff',
      routeMarkerStroke: '#040914',
      vectorNormal: '#34d399',
      vectorRingNormal: 'rgba(52, 211, 153, 0.45)',
      vectorBadgeBg: 'rgba(6, 22, 34, 0.94)',
      vectorConflict: '#fb7185',
      vectorRingConflict: 'rgba(251, 113, 133, 0.5)',
      vectorBadgeConflictBg: 'rgba(42, 10, 18, 0.94)',
      rulerColor: '#fbbf24',
      rulerBg: 'rgba(14, 18, 30, 0.94)',
    },
    ui: {
      containerBg: '#040914',
      panelBg: 'rgba(7, 16, 32, 0.94)',
      subPanelBg: '#040b18',
      border: '#1a3f66',
      subBorder: '#132e4a',
      divider: '#18385c',
      textPrimary: '#f0f9ff',
      textSecondary: '#89c4eb',
      textMuted: '#5889b5',
      accentPrimary: '#38bdf8',
      accentPrimaryBg: '#0e3252',
      accentSecondary: '#34d399',
      accentSecondaryBg: '#0c332b',
      accentWarn: '#fbbf24',
      accentWarnBg: '#362908',
      hoverBg: '#0e223d',
    },
  },

  tactical_stealth: {
    id: 'tactical_stealth',
    name: 'Night Vision Slate',
    shortName: 'Slate Ops',
    subtitle: 'Low-fatigue neutral darkroom',
    isLight: false,
    crtScanlineOpacity: 0.25,
    swatch: {
      bg: '#090b0f',
      primary: '#e2e8f0',
      secondary: '#22d3ee',
      ring: '#27303f',
    },
    canvas: {
      background: '#090b0f',
      sweepGlowRgb: '203, 213, 225',
      sweepLineColor: 'rgba(226, 232, 240, 0.58)',
      bloomInnerRgb: '255, 255, 255',
      bloomOuterRgb: '148, 163, 184',
      radialCardinal: '#242b38',
      radialMinor: '#151922',
      ringMajor: '#2d3646',
      ringMinor: '#1a202b',
      ringLabel: '#64748b',
      compassCircle: '#334155',
      compassTickMajor: '#64748b',
      compassTickMinor: '#293242',
      compassLabel: '#94a3b8',
      waterFill: 'rgba(30, 41, 59, 0.45)',
      waterStroke: 'rgba(100, 116, 139, 0.40)',
      waterLabel: 'rgba(148, 163, 184, 0.60)',
      riverStroke: 'rgba(100, 116, 139, 0.45)',
      coastlineStroke: 'rgba(148, 163, 184, 0.48)',
      contourLowFill: 'rgba(51, 65, 85, 0.16)',
      contourLowStroke: 'rgba(100, 116, 139, 0.26)',
      contourLowText: 'rgba(148, 163, 184, 0.58)',
      contourMidFill: 'rgba(71, 85, 105, 0.16)',
      contourMidStroke: 'rgba(148, 163, 184, 0.30)',
      contourMidText: 'rgba(182, 194, 209, 0.62)',
      contourHighFill: 'rgba(100, 116, 139, 0.18)',
      contourHighStroke: 'rgba(203, 213, 225, 0.34)',
      contourHighText: 'rgba(226, 232, 240, 0.66)',
      peakStroke: 'rgba(226, 232, 240, 0.72)',
      peakFill: 'rgba(148, 163, 184, 0.25)',
      peakLabel: 'rgba(241, 245, 249, 0.78)',
      obstacleStroke: 'rgba(245, 158, 11, 0.80)',
      obstacleFill: 'rgba(251, 191, 36, 0.88)',
      runwayArrival: '#34d399',
      runwayDeparture: '#22d3ee',
      runwayInactive: '#3b4659',
      centerlineArrival: '#10b981',
      centerlineInactive: 'rgba(100, 116, 139, 0.45)',
      centerlineTick: '#34d399',
      runwayLabelArrival: '#6ee7b7',
      runwayLabelDeparture: '#67e8f9',
      runwayLabelInactive: '#64748b',
      tmaStroke: 'rgba(148, 163, 184, 0.32)',
      tmaTagBg: 'rgba(15, 19, 26, 0.88)',
      tmaTagText: 'rgba(203, 213, 225, 0.90)',
      starActive: 'rgba(34, 211, 238, 0.52)',
      starInactive: 'rgba(34, 211, 238, 0.20)',
      starLabelActive: 'rgba(103, 232, 249, 0.92)',
      starLabelInactive: 'rgba(34, 211, 238, 0.50)',
      starTagBg: 'rgba(15, 19, 26, 0.84)',
      sidActive: 'rgba(251, 191, 36, 0.52)',
      sidInactive: 'rgba(251, 191, 36, 0.20)',
      sidLabelActive: 'rgba(253, 224, 71, 0.92)',
      sidLabelInactive: 'rgba(251, 191, 36, 0.50)',
      sidTagBg: 'rgba(20, 19, 14, 0.84)',
      holdStroke: 'rgba(148, 163, 184, 0.38)',
      wpExit: '#fbbf24',
      wpFaf: '#34d399',
      wpHold: '#22d3ee',
      wpIaf: '#67e8f9',
      wpFix: '#94a3b8',
      wpConstraintText: 'rgba(203, 213, 225, 0.72)',
      targetPrimary: '#e2e8f0',
      targetSelected: '#ffffff',
      targetFresh: '#67e8f9',
      targetStale: '#64748b',
      targetWarning: '#fbbf24',
      targetCritical: '#ff4d4d',
      trailNormalRgb: '203, 213, 225',
      trailStaleRgb: '100, 116, 139',
      trailCriticalRgb: '255, 77, 77',
      selectionRing: '#22d3ee',
      selectionReticle: 'rgba(34, 211, 238, 0.62)',
      directHoverHighlight: '#34d399',
      directChainHighlight: '#fbbf24',
      tagBg: 'rgba(15, 18, 24, 0.92)',
      tagBgSelected: 'rgba(23, 29, 39, 0.96)',
      tagBorderFresh: '#67e8f9',
      tagTextSelected: '#ffffff',
      tagAltText: '#cbd5e1',
      tagPhaseReady: '#34d399',
      tagPhaseRequest: '#fbbf24',
      tagPhaseActive: '#22d3ee',
      tagPhaseMuted: '#94a3b8',
      tagRouteMuted: '#7e8fa6',
      txPilotColor: '#34d399',
      txAtcColor: '#22d3ee',
      txPilotBg: 'rgba(10, 28, 24, 0.96)',
      txAtcBg: 'rgba(10, 26, 34, 0.96)',
      pilotWaveRgb: '52, 211, 153',
      atcWaveRgb: '34, 211, 238',
      originBadgeBg: 'rgba(15, 19, 26, 0.95)',
      originBadgeText: '#ffffff',
      legDistBg: 'rgba(15, 19, 26, 0.88)',
      legDistText: '#cbd5e1',
      routeBadgeBg: 'rgba(17, 22, 30, 0.94)',
      routeBadgeText: '#ffffff',
      routeMarkerStroke: '#090b0f',
      vectorNormal: '#22d3ee',
      vectorRingNormal: 'rgba(34, 211, 238, 0.45)',
      vectorBadgeBg: 'rgba(15, 21, 28, 0.94)',
      vectorConflict: '#ff4d4d',
      vectorRingConflict: 'rgba(255, 77, 77, 0.5)',
      vectorBadgeConflictBg: 'rgba(42, 10, 12, 0.94)',
      rulerColor: '#fbbf24',
      rulerBg: 'rgba(20, 22, 26, 0.94)',
    },
    ui: {
      containerBg: '#090b0f',
      panelBg: 'rgba(17, 21, 28, 0.94)',
      subPanelBg: '#0c0f14',
      border: '#334155',
      subBorder: '#242d3d',
      divider: '#2b3648',
      textPrimary: '#f8fafc',
      textSecondary: '#cbd5e1',
      textMuted: '#7b8aa1',
      accentPrimary: '#34d399',
      accentPrimaryBg: '#113329',
      accentSecondary: '#22d3ee',
      accentSecondaryBg: '#0f2f38',
      accentWarn: '#fbbf24',
      accentWarnBg: '#332709',
      hoverBg: '#1c2330',
    },
  },

  crimson_tactical: {
    id: 'crimson_tactical',
    name: 'Command Red Ops',
    shortName: 'Command Red',
    subtitle: 'Night-vision darkroom crimson',
    isLight: false,
    crtScanlineOpacity: 0.75,
    swatch: {
      bg: '#0c0406',
      primary: '#ff5c6c',
      secondary: '#fbbf24',
      ring: '#4a1820',
    },
    canvas: {
      background: '#0c0406',
      sweepGlowRgb: '255, 92, 108',
      sweepLineColor: 'rgba(255, 107, 122, 0.80)',
      bloomInnerRgb: '255, 224, 228',
      bloomOuterRgb: '255, 92, 108',
      radialCardinal: '#361117',
      radialMinor: '#210a0e',
      ringMajor: '#4a1820',
      ringMinor: '#2b0d12',
      ringLabel: '#a8424f',
      compassCircle: '#591e27',
      compassTickMajor: '#ba4a59',
      compassTickMinor: '#42151c',
      compassLabel: '#d96473',
      waterFill: 'rgba(42, 16, 28, 0.45)',
      waterStroke: 'rgba(156, 72, 92, 0.38)',
      waterLabel: 'rgba(212, 128, 146, 0.56)',
      riverStroke: 'rgba(148, 68, 88, 0.44)',
      coastlineStroke: 'rgba(182, 86, 108, 0.48)',
      contourLowFill: 'rgba(72, 22, 30, 0.18)',
      contourLowStroke: 'rgba(148, 52, 66, 0.30)',
      contourLowText: 'rgba(196, 98, 112, 0.62)',
      contourMidFill: 'rgba(104, 34, 30, 0.18)',
      contourMidStroke: 'rgba(192, 82, 62, 0.34)',
      contourMidText: 'rgba(224, 126, 98, 0.66)',
      contourHighFill: 'rgba(138, 62, 26, 0.20)',
      contourHighStroke: 'rgba(232, 128, 68, 0.38)',
      contourHighText: 'rgba(248, 168, 102, 0.72)',
      peakStroke: 'rgba(251, 191, 36, 0.76)',
      peakFill: 'rgba(251, 191, 36, 0.28)',
      peakLabel: 'rgba(253, 212, 102, 0.80)',
      obstacleStroke: 'rgba(251, 146, 60, 0.85)',
      obstacleFill: 'rgba(253, 186, 116, 0.90)',
      runwayArrival: '#ff5c6c',
      runwayDeparture: '#fbbf24',
      runwayInactive: '#5e222b',
      centerlineArrival: '#d93848',
      centerlineInactive: 'rgba(168, 50, 62, 0.45)',
      centerlineTick: '#ff5c6c',
      runwayLabelArrival: '#ff8a96',
      runwayLabelDeparture: '#fcd34d',
      runwayLabelInactive: '#8f444f',
      tmaStroke: 'rgba(251, 191, 36, 0.30)',
      tmaTagBg: 'rgba(24, 9, 12, 0.88)',
      tmaTagText: 'rgba(253, 212, 102, 0.90)',
      starActive: 'rgba(255, 117, 132, 0.54)',
      starInactive: 'rgba(255, 117, 132, 0.20)',
      starLabelActive: 'rgba(255, 163, 173, 0.94)',
      starLabelInactive: 'rgba(255, 117, 132, 0.52)',
      starTagBg: 'rgba(24, 9, 12, 0.86)',
      sidActive: 'rgba(251, 191, 36, 0.54)',
      sidInactive: 'rgba(251, 191, 36, 0.20)',
      sidLabelActive: 'rgba(253, 224, 112, 0.94)',
      sidLabelInactive: 'rgba(251, 191, 36, 0.52)',
      sidTagBg: 'rgba(26, 15, 6, 0.86)',
      holdStroke: 'rgba(248, 113, 113, 0.36)',
      wpExit: '#fbbf24',
      wpFaf: '#ff5c6c',
      wpHold: '#fca5a5',
      wpIaf: '#fda4af',
      wpFix: '#b55b67',
      wpConstraintText: 'rgba(254, 205, 211, 0.74)',
      targetPrimary: '#ff6b7a',
      targetSelected: '#fff1f2',
      targetFresh: '#ffe4e6',
      targetStale: '#8c696d',
      targetWarning: '#fbbf24',
      targetCritical: '#ffffff',
      trailNormalRgb: '255, 107, 122',
      trailStaleRgb: '140, 105, 109',
      trailCriticalRgb: '255, 255, 255',
      selectionRing: '#fbbf24',
      selectionReticle: 'rgba(255, 92, 108, 0.62)',
      directHoverHighlight: '#34d399',
      directChainHighlight: '#fbbf24',
      tagBg: 'rgba(22, 8, 11, 0.92)',
      tagBgSelected: 'rgba(42, 13, 19, 0.96)',
      tagBorderFresh: '#fda4af',
      tagTextSelected: '#fff1f2',
      tagAltText: '#fecdd3',
      tagPhaseReady: '#34d399',
      tagPhaseRequest: '#fbbf24',
      tagPhaseActive: '#fda4af',
      tagPhaseMuted: '#b87680',
      tagRouteMuted: '#9e626b',
      txPilotColor: '#ff7585',
      txAtcColor: '#fbbf24',
      txPilotBg: 'rgba(38, 10, 16, 0.96)',
      txAtcBg: 'rgba(36, 24, 6, 0.96)',
      pilotWaveRgb: '255, 117, 133',
      atcWaveRgb: '251, 191, 36',
      originBadgeBg: 'rgba(24, 8, 12, 0.95)',
      originBadgeText: '#fff1f2',
      legDistBg: 'rgba(24, 8, 12, 0.88)',
      legDistText: '#fecdd3',
      routeBadgeBg: 'rgba(28, 10, 14, 0.94)',
      routeBadgeText: '#fff1f2',
      routeMarkerStroke: '#0c0406',
      vectorNormal: '#fbbf24',
      vectorRingNormal: 'rgba(251, 191, 36, 0.45)',
      vectorBadgeBg: 'rgba(28, 10, 14, 0.94)',
      vectorConflict: '#ffffff',
      vectorRingConflict: 'rgba(255, 255, 255, 0.55)',
      vectorBadgeConflictBg: 'rgba(64, 12, 18, 0.96)',
      rulerColor: '#fbbf24',
      rulerBg: 'rgba(28, 14, 8, 0.94)',
    },
    ui: {
      containerBg: '#0c0406',
      panelBg: 'rgba(24, 8, 12, 0.94)',
      subPanelBg: '#120609',
      border: '#5c1f29',
      subBorder: '#40141c',
      divider: '#4f1b24',
      textPrimary: '#fff1f2',
      textSecondary: '#e89aa4',
      textMuted: '#a65c67',
      accentPrimary: '#ff5c6c',
      accentPrimaryBg: '#42121a',
      accentSecondary: '#fbbf24',
      accentSecondaryBg: '#3b2806',
      accentWarn: '#fbbf24',
      accentWarnBg: '#3b2806',
      hoverBg: '#2e0e14',
    },
  },

  daylight_paper: {
    id: 'daylight_paper',
    name: 'Daylight IFR Chart',
    shortName: 'Daylight',
    subtitle: 'Bright tower light-table mode',
    isLight: true,
    crtScanlineOpacity: 0,
    swatch: {
      bg: '#eef3ef',
      primary: '#0f172a',
      secondary: '#0284c7',
      ring: '#b6c7bc',
    },
    canvas: {
      background: '#eef3ef',
      sweepGlowRgb: '2, 132, 199',
      sweepLineColor: 'rgba(2, 132, 199, 0.42)',
      bloomInnerRgb: '2, 132, 199',
      bloomOuterRgb: '14, 165, 233',
      radialCardinal: '#c2d1c7',
      radialMinor: '#dae4dd',
      ringMajor: '#a7bab0',
      ringMinor: '#cddad2',
      ringLabel: '#475569',
      compassCircle: '#94a89d',
      compassTickMajor: '#334155',
      compassTickMinor: '#94a3b8',
      compassLabel: '#1e293b',
      waterFill: 'rgba(14, 165, 233, 0.14)',
      waterStroke: 'rgba(2, 132, 199, 0.40)',
      waterLabel: 'rgba(3, 105, 161, 0.72)',
      riverStroke: 'rgba(2, 132, 199, 0.42)',
      coastlineStroke: 'rgba(3, 105, 161, 0.48)',
      contourLowFill: 'rgba(34, 197, 94, 0.08)',
      contourLowStroke: 'rgba(22, 163, 74, 0.24)',
      contourLowText: 'rgba(21, 128, 61, 0.72)',
      contourMidFill: 'rgba(234, 179, 8, 0.10)',
      contourMidStroke: 'rgba(161, 98, 7, 0.28)',
      contourMidText: 'rgba(133, 77, 14, 0.75)',
      contourHighFill: 'rgba(217, 119, 6, 0.13)',
      contourHighStroke: 'rgba(180, 83, 9, 0.34)',
      contourHighText: 'rgba(154, 52, 18, 0.80)',
      peakStroke: 'rgba(146, 64, 14, 0.82)',
      peakFill: 'rgba(217, 119, 6, 0.28)',
      peakLabel: 'rgba(120, 53, 15, 0.86)',
      obstacleStroke: 'rgba(194, 65, 12, 0.85)',
      obstacleFill: 'rgba(234, 88, 12, 0.85)',
      runwayArrival: '#047857',
      runwayDeparture: '#0369a1',
      runwayInactive: '#64748b',
      centerlineArrival: '#059669',
      centerlineInactive: 'rgba(71, 85, 105, 0.45)',
      centerlineTick: '#047857',
      runwayLabelArrival: '#065f46',
      runwayLabelDeparture: '#075985',
      runwayLabelInactive: '#475569',
      tmaStroke: 'rgba(2, 132, 199, 0.36)',
      tmaTagBg: 'rgba(241, 245, 249, 0.92)',
      tmaTagText: '#0369a1',
      starActive: 'rgba(2, 132, 199, 0.62)',
      starInactive: 'rgba(2, 132, 199, 0.24)',
      starLabelActive: '#0369a1',
      starLabelInactive: 'rgba(3, 105, 161, 0.60)',
      starTagBg: 'rgba(248, 250, 252, 0.90)',
      sidActive: 'rgba(180, 83, 9, 0.60)',
      sidInactive: 'rgba(180, 83, 9, 0.24)',
      sidLabelActive: '#9a3412',
      sidLabelInactive: 'rgba(154, 52, 18, 0.58)',
      sidTagBg: 'rgba(255, 251, 235, 0.90)',
      holdStroke: 'rgba(2, 132, 199, 0.45)',
      wpExit: '#b45309',
      wpFaf: '#047857',
      wpHold: '#0284c7',
      wpIaf: '#0369a1',
      wpFix: '#475569',
      wpConstraintText: 'rgba(30, 41, 59, 0.78)',
      targetPrimary: '#0f172a',
      targetSelected: '#0284c7',
      targetFresh: '#0369a1',
      targetStale: '#64748b',
      targetWarning: '#d97706',
      targetCritical: '#dc2626',
      trailNormalRgb: '15, 23, 42',
      trailStaleRgb: '100, 116, 139',
      trailCriticalRgb: '220, 38, 38',
      selectionRing: '#0284c7',
      selectionReticle: 'rgba(2, 132, 199, 0.58)',
      directHoverHighlight: '#047857',
      directChainHighlight: '#b45309',
      tagBg: 'rgba(255, 255, 255, 0.92)',
      tagBgSelected: 'rgba(224, 242, 254, 0.96)',
      tagBorderFresh: '#0284c7',
      tagTextSelected: '#0c4a6e',
      tagAltText: '#1e293b',
      tagPhaseReady: '#047857',
      tagPhaseRequest: '#b45309',
      tagPhaseActive: '#0369a1',
      tagPhaseMuted: '#475569',
      tagRouteMuted: '#475569',
      txPilotColor: '#047857',
      txAtcColor: '#0369a1',
      txPilotBg: 'rgba(236, 253, 245, 0.96)',
      txAtcBg: 'rgba(224, 242, 254, 0.96)',
      pilotWaveRgb: '4, 120, 87',
      atcWaveRgb: '3, 105, 161',
      originBadgeBg: 'rgba(255, 255, 255, 0.95)',
      originBadgeText: '#0f172a',
      legDistBg: 'rgba(255, 255, 255, 0.90)',
      legDistText: '#334155',
      routeBadgeBg: 'rgba(255, 255, 255, 0.94)',
      routeBadgeText: '#0f172a',
      routeMarkerStroke: '#ffffff',
      vectorNormal: '#0284c7',
      vectorRingNormal: 'rgba(2, 132, 199, 0.42)',
      vectorBadgeBg: 'rgba(240, 249, 255, 0.96)',
      vectorConflict: '#dc2626',
      vectorRingConflict: 'rgba(220, 38, 38, 0.48)',
      vectorBadgeConflictBg: 'rgba(254, 242, 242, 0.96)',
      rulerColor: '#b45309',
      rulerBg: 'rgba(255, 251, 235, 0.95)',
    },
    ui: {
      containerBg: '#eef3ef',
      panelBg: 'rgba(255, 255, 255, 0.94)',
      subPanelBg: '#f1f5f9',
      border: '#cbd5e1',
      subBorder: '#e2e8f0',
      divider: '#cbd5e1',
      textPrimary: '#0f172a',
      textSecondary: '#334155',
      textMuted: '#64748b',
      accentPrimary: '#047857',
      accentPrimaryBg: '#d1fae5',
      accentSecondary: '#0369a1',
      accentSecondaryBg: '#e0f2fe',
      accentWarn: '#b45309',
      accentWarnBg: '#fef3c7',
      hoverBg: '#e2e8f0',
    },
  },
};

export const RADAR_THEME_LIST: RadarThemeDefinition[] = [
  RADAR_THEMES.phosphor_crt,
  RADAR_THEMES.amber_atc,
  RADAR_THEMES.obsidian_blue,
  RADAR_THEMES.tactical_stealth,
  RADAR_THEMES.crimson_tactical,
  RADAR_THEMES.daylight_paper,
];

export const ALL_VALID_RADAR_THEME_IDS: RadarThemeId[] = RADAR_THEME_LIST.map(t => t.id);

export function normalizeRadarThemeId(raw?: string | null): RadarThemeId {
  if (raw && raw in RADAR_THEMES) {
    return raw as RadarThemeId;
  }
  return DEFAULT_RADAR_THEME_ID;
}

export function getRadarTheme(id?: string | null): RadarThemeDefinition {
  return RADAR_THEMES[normalizeRadarThemeId(id)];
}
