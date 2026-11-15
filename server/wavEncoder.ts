/**
 * SKYCONTROL - Pure TypeScript RIFF/WAVE PCM-16 Audio Encoder & Inspector
 * Encodes Float32Array TTS waveforms into standard 16-bit signed mono PCM WAV buffers.
 */

import type { AudioQualityInfo } from '../shared/audioLibraryTypes';

export interface WavHeaderInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataBytes: number;
  durationSec: number;
}

/**
 * Encodes mono Float32 PCM waveform samples into a standard RIFF PCM-16 WAV Buffer.
 * Applies soft ceiling normalization if peak exceeds 0.96 to prevent clipping distortion.
 */
export function encodeWavPcm16(
  samples: Float32Array,
  sampleRate: number = 24000
): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const headerSize = 44;

  // Measure peak amplitude to guard against clipping
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  const scale = peak > 0.96 ? 0.96 / peak : 1.0;

  const buffer = Buffer.allocUnsafe(headerSize + dataSize);

  // RIFF chunk descriptor
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');

  // fmt sub-chunk
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // Subchunk1Size = 16 for PCM
  buffer.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  let offset = headerSize;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] * scale));
    const int16 = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    buffer.writeInt16LE(int16, offset);
    offset += 2;
  }

  return buffer;
}

/**
 * Inspects a RIFF/WAVE Buffer and extracts core audio metadata.
 */
export function readWavMetadata(wavBuffer: Buffer): WavHeaderInfo {
  if (
    wavBuffer.length < 44 ||
    wavBuffer.toString('ascii', 0, 4) !== 'RIFF' ||
    wavBuffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('Invalid RIFF/WAVE buffer header');
  }

  const channels = wavBuffer.readUInt16LE(22);
  const sampleRate = wavBuffer.readUInt32LE(24);
  const bitsPerSample = wavBuffer.readUInt16LE(34);
  const dataBytes = wavBuffer.readUInt32LE(40);
  const bytesPerSec = Math.max(1, sampleRate * channels * (bitsPerSample / 8));
  const durationSec = dataBytes / bytesPerSec;

  return {
    sampleRate,
    channels,
    bitsPerSample,
    dataBytes,
    durationSec,
  };
}

/**
 * Computes acoustic quality metrics directly from a 16-bit PCM WAV buffer.
 */
export function analyzeWavQuality(wavBuffer: Buffer): AudioQualityInfo {
  const info = readWavMetadata(wavBuffer);
  const dataStart = 44;
  const totalSamples = Math.min(
    Math.floor((wavBuffer.length - dataStart) / 2),
    Math.floor(info.dataBytes / 2)
  );

  let sumSq = 0;
  let peak = 0;
  let clippingCount = 0;
  let noiseFloorSumSq = 0;
  let noiseCount = 0;

  for (let i = 0; i < totalSamples; i++) {
    const sample = wavBuffer.readInt16LE(dataStart + i * 2) / 32768;
    const abs = Math.abs(sample);
    sumSq += sample * sample;
    if (abs > peak) peak = abs;
    if (abs >= 0.995) clippingCount += 1;
    if (abs < 0.015) {
      noiseFloorSumSq += sample * sample;
      noiseCount += 1;
    }
  }

  const rms = totalSamples > 0 ? Math.sqrt(sumSq / totalSamples) : 0;
  const rmsDb = rms > 1e-6 ? Number((20 * Math.log10(rms)).toFixed(1)) : -96;
  const peakDb = peak > 1e-6 ? Number((20 * Math.log10(peak)).toFixed(1)) : -96;

  const noiseRms = noiseCount > 0 ? Math.sqrt(noiseFloorSumSq / noiseCount) : 1e-4;
  const snrEstimateDb = Number(
    Math.max(12, Math.min(90, 20 * Math.log10(Math.max(rms, 1e-5) / Math.max(noiseRms, 1e-5)))).toFixed(1)
  );

  return {
    sampleRate: info.sampleRate,
    channels: info.channels,
    bitsPerSample: info.bitsPerSample,
    bitrateKbps: Math.round((info.sampleRate * info.channels * info.bitsPerSample) / 1000),
    rmsDb,
    peakDb,
    clippingDetected: clippingCount > 4,
    snrEstimateDb,
  };
}
