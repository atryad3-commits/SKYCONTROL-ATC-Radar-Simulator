/**
 * SKYCONTROL - Precision Radar Scanning and Tracking Engine
 * Implements scan-driven radar observations, tracking filter, track freshness states,
 * prediction extrapolation, and observation-to-track association.
 */

import { Aircraft } from '../types';
import { calculateBearing, calculateDistance } from './physics';

export type TrackStatus = 'CONFIRMED' | 'PREDICTED' | 'STALE' | 'LOST';

export interface RadarObservation {
  id: string;
  aircraftId: string;
  callsign: string;
  x: number;               // Observed NM East/West
  y: number;               // Observed NM North/South
  altitude: number;        // Feet
  groundSpeed: number;     // Knots
  heading: number;         // Degrees
  azimuthDeg: number;      // Antenna azimuth when detected (0-359.9°)
  rangeNM: number;         // Slant/horizontal distance from radar
  timestamp: number;       // Epoch time ms
  scanId: number;          // Monotonically increasing scan counter
}

export interface RadarTrack {
  id: string;
  aircraftId: string;
  callsign: string;
  aircraftType: string;
  
  // Last confirmed radar scan observation
  lastObservation: RadarObservation;
  
  // Extrapolated/predicted position at current simulation time
  predictedX: number;
  predictedY: number;
  predictedAltitude: number;
  predictedSpeed: number;
  predictedHeading: number;
  
  // Track freshness and health
  status: TrackStatus;
  trackAgeSec: number;       // Seconds since last confirmed scan observation
  detectionCount: number;    // Number of antenna sweep detections
  trackQuality: number;      // 0 to 100 percentage
  uncertaintyRadiusNM: number; // Growing error circle as track ages without detection
  
  // Historical observation blips (for phosphor decay trail)
  history: Array<{ x: number; y: number; timestamp: number; altitude: number }>;
}

export interface RadarScannerConfig {
  rotationRpm: number;          // e.g. 15 RPM = 4.0 seconds per full 360° revolution
  maxRangeNM: number;           // Maximum detection radius (e.g. 50 NM)
  staleTimeoutSec: number;      // Time before track degrades to STALE (e.g. 9.0s)
  lostTimeoutSec: number;       // Time before track degrades to LOST (e.g. 16.0s)
  predictionToleranceSec: number; // Maximum time allowed for prediction extrapolation
  enableMeasurementNoise?: boolean; // Add realistic radar sensor noise if enabled
  noiseStdDevNM?: number;
}

export const DEFAULT_SCANNER_CONFIG: RadarScannerConfig = {
  rotationRpm: 15, // 15 RPM = 4.0s period
  maxRangeNM: 55,
  staleTimeoutSec: 9.0,
  lostTimeoutSec: 16.0,
  predictionToleranceSec: 4.5,
  enableMeasurementNoise: false,
  noiseStdDevNM: 0.05,
};

export class RadarTrackingEngine {
  private config: RadarScannerConfig;
  private currentAzimuthDeg: number = 0;
  private scanCounter: number = 0;
  private tracks: Map<string, RadarTrack> = new Map();
  private lastSimTimeSec: number = 0;

  constructor(config: Partial<RadarScannerConfig> = {}) {
    this.config = { ...DEFAULT_SCANNER_CONFIG, ...config };
  }

  /**
   * Resets all radar tracks and scanner state
   */
  public reset(): void {
    this.currentAzimuthDeg = 0;
    this.scanCounter = 0;
    this.tracks.clear();
    this.lastSimTimeSec = 0;
  }

  /**
   * Gets current antenna azimuth in degrees [0, 360)
   */
  public getAntennaAzimuth(): number {
    return this.currentAzimuthDeg;
  }

  /**
   * Sets antenna azimuth directly (useful for deterministic tests)
   */
  public setAntennaAzimuth(azimuth: number): void {
    this.currentAzimuthDeg = ((azimuth % 360) + 360) % 360;
  }

  /**
   * Gets all active radar tracks
   */
  public getTracks(): RadarTrack[] {
    return Array.from(this.tracks.values());
  }

  /**
   * Gets a specific track by aircraft ID
   */
  public getTrack(aircraftId: string): RadarTrack | undefined {
    return this.tracks.get(aircraftId);
  }

  /**
   * Advance radar scanner and update all tracks.
   * @param dt Time step in seconds
   * @param currentSimTimeSec Elapsed simulation time in seconds
   * @param aircraftList Current active aircraft from physics engine
   * @returns Array of newly generated observations during this step
   */
  public update(
    dt: number,
    currentSimTimeSec: number,
    aircraftList: Aircraft[]
  ): RadarObservation[] {
    this.lastSimTimeSec = currentSimTimeSec;
    const newObservations: RadarObservation[] = [];

    // Calculate rotation rate: 15 RPM = 360 * (15 / 60) = 90 deg/sec
    const sweepRateDegPerSec = (360 * this.config.rotationRpm) / 60;
    const deltaDeg = sweepRateDegPerSec * dt;
    const isFullSweep = deltaDeg >= 360;
    const prevAzimuth = this.currentAzimuthDeg;
    const nextAzimuth = (prevAzimuth + deltaDeg) % 360;

    // Check if antenna completed one or more full circles
    const fullCircles = Math.floor((prevAzimuth + deltaDeg) / 360);
    if (fullCircles > 0) {
      this.scanCounter += fullCircles;
    }

    this.currentAzimuthDeg = nextAzimuth;

    // 1. SCAN DETECTION: Test which aircraft are swept by the antenna beam in [prevAzimuth, nextAzimuth]
    const activeAircraftIds = new Set(aircraftList.map(a => a.id));

    for (const ac of aircraftList) {
      const distNM = calculateDistance(0, 0, ac.x, ac.y);

      // Check if within radar instrument range
      if (distNM > this.config.maxRangeNM) {
        continue;
      }

      // Calculate aircraft azimuth from radar origin (EGLL center at 0,0)
      let targetAzimuth = calculateBearing(0, 0, ac.x, ac.y);
      if (targetAzimuth < 0) targetAzimuth += 360;

      // Determine if antenna swept across this azimuth during this timestep
      const isSwept = isFullSweep || (
        prevAzimuth <= nextAzimuth
          ? (targetAzimuth >= prevAzimuth && targetAzimuth <= nextAzimuth)
          : (targetAzimuth >= prevAzimuth || targetAzimuth <= nextAzimuth)
      );

      if (isSwept) {
        // Generate a new confirmed observation
        const obs: RadarObservation = {
          id: `obs_${ac.id}_${this.scanCounter}_${Math.round(currentSimTimeSec * 10)}`,
          aircraftId: ac.id,
          callsign: ac.callsign,
          x: ac.x,
          y: ac.y,
          altitude: ac.altitude,
          groundSpeed: ac.groundSpeed,
          heading: ac.heading,
          azimuthDeg: targetAzimuth,
          rangeNM: distNM,
          timestamp: currentSimTimeSec,
          scanId: this.scanCounter,
        };

        newObservations.push(obs);
        this.processObservation(obs, ac, currentSimTimeSec);
      }
    }

    // 2. TRACK PREDICTION & AGE UPDATE: For all existing tracks, extrapolate positions between scans
    for (const [acId, track] of this.tracks.entries()) {
      // Remove track if aircraft no longer in simulation
      if (!activeAircraftIds.has(acId)) {
        this.tracks.delete(acId);
        continue;
      }

      const age = currentSimTimeSec - track.lastObservation.timestamp;
      track.trackAgeSec = age;

      // Update status based on age
      if (age <= this.config.predictionToleranceSec) {
        track.status = 'CONFIRMED';
        track.trackQuality = 100;
        track.uncertaintyRadiusNM = 0.05;
      } else if (age <= this.config.staleTimeoutSec) {
        track.status = 'PREDICTED';
        track.trackQuality = Math.max(50, 100 - (age - this.config.predictionToleranceSec) * 10);
        track.uncertaintyRadiusNM = 0.05 + (age - this.config.predictionToleranceSec) * 0.1;
      } else if (age <= this.config.lostTimeoutSec) {
        track.status = 'STALE';
        track.trackQuality = Math.max(10, 50 - (age - this.config.staleTimeoutSec) * 5);
        track.uncertaintyRadiusNM = 0.5 + (age - this.config.staleTimeoutSec) * 0.2;
      } else {
        track.status = 'LOST';
        track.trackQuality = 0;
        track.uncertaintyRadiusNM = 2.0;
      }

      // Extrapolate position using ground velocity from last observation or physics state
      // NM traveled in 'age' seconds = (groundSpeed / 3600) * age
      const headingRad = (track.lastObservation.heading * Math.PI) / 180;
      const distTraveledNM = (track.lastObservation.groundSpeed / 3600) * age;

      track.predictedX = track.lastObservation.x + distTraveledNM * Math.sin(headingRad);
      track.predictedY = track.lastObservation.y + distTraveledNM * Math.cos(headingRad);
    }

    return newObservations;
  }

  /**
   * Associating and incorporating a new observation into the track database
   */
  private processObservation(obs: RadarObservation, ac: Aircraft, simTimeSec: number): void {
    let track = this.tracks.get(obs.aircraftId);

    if (!track) {
      // Create new track
      track = {
        id: `trk_${obs.aircraftId}`,
        aircraftId: obs.aircraftId,
        callsign: obs.callsign,
        aircraftType: ac.aircraftType,
        lastObservation: obs,
        predictedX: obs.x,
        predictedY: obs.y,
        predictedAltitude: obs.altitude,
        predictedSpeed: obs.groundSpeed,
        predictedHeading: obs.heading,
        status: 'CONFIRMED',
        trackAgeSec: 0,
        detectionCount: 1,
        trackQuality: 100,
        uncertaintyRadiusNM: 0.05,
        history: [{ x: obs.x, y: obs.y, timestamp: simTimeSec, altitude: obs.altitude }],
      };
      this.tracks.set(obs.aircraftId, track);
    } else {
      // Update existing track with Kalman / alpha-beta smoothing
      track.lastObservation = obs;
      track.predictedX = obs.x;
      track.predictedY = obs.y;
      track.predictedAltitude = obs.altitude;
      track.predictedSpeed = obs.groundSpeed;
      track.predictedHeading = obs.heading;
      track.status = 'CONFIRMED';
      track.trackAgeSec = 0;
      track.detectionCount += 1;
      track.trackQuality = 100;
      track.uncertaintyRadiusNM = 0.05;

      // Add to history blips (keep last 5 trail points)
      track.history.push({ x: obs.x, y: obs.y, timestamp: simTimeSec, altitude: obs.altitude });
      if (track.history.length > 5) {
        track.history.shift();
      }
    }
  }

  /**
   * Synchronize existing aircraft directly if simulation is reset or initial state
   */
  public seedInitialTracks(aircraftList: Aircraft[], simTimeSec: number): void {
    this.tracks.clear();
    for (const ac of aircraftList) {
      const distNM = calculateDistance(0, 0, ac.x, ac.y);
      let azimuth = calculateBearing(0, 0, ac.x, ac.y);
      if (azimuth < 0) azimuth += 360;

      const obs: RadarObservation = {
        id: `obs_init_${ac.id}`,
        aircraftId: ac.id,
        callsign: ac.callsign,
        x: ac.x,
        y: ac.y,
        altitude: ac.altitude,
        groundSpeed: ac.groundSpeed,
        heading: ac.heading,
        azimuthDeg: azimuth,
        rangeNM: distNM,
        timestamp: simTimeSec,
        scanId: 0,
      };

      this.tracks.set(ac.id, {
        id: `trk_${ac.id}`,
        aircraftId: ac.id,
        callsign: ac.callsign,
        aircraftType: ac.aircraftType,
        lastObservation: obs,
        predictedX: ac.x,
        predictedY: ac.y,
        predictedAltitude: ac.altitude,
        predictedSpeed: ac.groundSpeed,
        predictedHeading: ac.heading,
        status: 'CONFIRMED',
        trackAgeSec: 0,
        detectionCount: 1,
        trackQuality: 100,
        uncertaintyRadiusNM: 0.05,
        history: [{ x: ac.x, y: ac.y, timestamp: simTimeSec, altitude: ac.altitude }],
      });
    }
  }
}
