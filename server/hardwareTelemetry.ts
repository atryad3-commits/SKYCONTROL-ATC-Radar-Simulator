/**
 * SKYCONTROL - Real Hardware, CPU, RAM & Optional NVIDIA GPU Telemetry Probe
 * Uses Node `os` / `process` metrics and non-blocking optional `nvidia-smi` probing
 * when available — never fabricates GPU metrics if no GPU device is exposed.
 */

import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { HardwareAccelerationTelemetry } from '../shared/audioStudioTypes';

const execFileAsync = promisify(execFile);

let prevCpuInfo: os.CpuInfo[] | null = null;
let lastCpuUsagePercent = 0;

interface GpuProbeResult {
  gpuAvailable: boolean;
  gpuName: string | null;
  gpuUtilizationPercent: number | null;
  gpuMemoryUsedMb: number | null;
  gpuMemoryTotalMb: number | null;
}

let cachedGpuProbe: GpuProbeResult | null = null;
let lastGpuProbeAt = 0;

function sampleCpuUsagePercent(): number {
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) return 0;

  if (!prevCpuInfo || prevCpuInfo.length !== cpus.length) {
    prevCpuInfo = cpus;
    const load1m = os.loadavg()[0] || 0;
    lastCpuUsagePercent = Math.min(100, Math.round((load1m / Math.max(1, cpus.length)) * 100));
    return lastCpuUsagePercent;
  }

  let idleDelta = 0;
  let totalDelta = 0;
  for (let i = 0; i < cpus.length; i++) {
    const prev = prevCpuInfo[i].times;
    const curr = cpus[i].times;
    const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
    const currTotal = curr.user + curr.nice + curr.sys + curr.idle + curr.irq;
    totalDelta += currTotal - prevTotal;
    idleDelta += curr.idle - prev.idle;
  }
  prevCpuInfo = cpus;

  if (totalDelta > 0) {
    lastCpuUsagePercent = Math.max(
      0,
      Math.min(100, Math.round(((totalDelta - idleDelta) / totalDelta) * 100))
    );
  }
  return lastCpuUsagePercent;
}

async function probeNvidiaGpu(): Promise<GpuProbeResult> {
  const now = Date.now();
  if (cachedGpuProbe && now - lastGpuProbeAt < 4000) {
    return cachedGpuProbe;
  }

  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      ['--query-gpu=name,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
      { timeout: 1200 }
    );
    const firstLine = stdout
      .split('\n')
      .map(l => l.trim())
      .find(Boolean);
    if (firstLine) {
      const [name, utilStr, usedStr, totalStr] = firstLine.split(',').map(s => s.trim());
      const result: GpuProbeResult = {
        gpuAvailable: true,
        gpuName: name || 'NVIDIA GPU',
        gpuUtilizationPercent: Number.isFinite(Number(utilStr)) ? Number(utilStr) : null,
        gpuMemoryUsedMb: Number.isFinite(Number(usedStr)) ? Number(usedStr) : null,
        gpuMemoryTotalMb: Number.isFinite(Number(totalStr)) ? Number(totalStr) : null,
      };
      cachedGpuProbe = result;
      lastGpuProbeAt = now;
      return result;
    }
  } catch {
    // nvidia-smi unavailable on CPU-only environments
  }

  const fallback: GpuProbeResult = {
    gpuAvailable: false,
    gpuName: null,
    gpuUtilizationPercent: null,
    gpuMemoryUsedMb: null,
    gpuMemoryTotalMb: null,
  };
  cachedGpuProbe = fallback;
  lastGpuProbeAt = now;
  return fallback;
}

export async function collectHardwareTelemetry(): Promise<HardwareAccelerationTelemetry> {
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model?.trim() || `${os.arch()} CPU`;
  const cpuCores = cpus.length || 1;
  const cpuUsagePercent = sampleCpuUsagePercent();

  const ramTotalBytes = os.totalmem();
  const ramFreeBytes = os.freemem();
  const ramUsedBytes = Math.max(0, ramTotalBytes - ramFreeBytes);
  const procMem = process.memoryUsage();

  const gpu = await probeNvidiaGpu();
  const executionProvider: HardwareAccelerationTelemetry['executionProvider'] = 'cpu';

  const note = gpu.gpuAvailable
    ? `NVIDIA GPU (${gpu.gpuName}) detected; Kokoro-82M INT8 ONNX uses CPU execution to keep GPU VRAM unallocated unless CUDA EP is configured.`
    : 'No GPU accelerator exposed in this runtime; running Kokoro-82M INT8 (q8) via ONNX Runtime CPU threads cleanly without GPU VRAM overhead.';

  return {
    cpuModel,
    cpuCores,
    cpuUsagePercent,
    ramTotalBytes,
    ramUsedBytes,
    processRssBytes: procMem.rss,
    processHeapUsedBytes: procMem.heapUsed,
    executionProvider,
    supportedProviders: gpu.gpuAvailable ? ['cpu', 'cuda (host)'] : ['cpu'],
    gpuAvailable: gpu.gpuAvailable,
    gpuName: gpu.gpuName,
    gpuUtilizationPercent: gpu.gpuUtilizationPercent,
    gpuMemoryUsedMb: gpu.gpuMemoryUsedMb,
    gpuMemoryTotalMb: gpu.gpuMemoryTotalMb,
    note,
  };
}
