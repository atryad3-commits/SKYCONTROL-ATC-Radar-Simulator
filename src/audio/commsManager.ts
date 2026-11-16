/**
 * SKYCONTROL - Frequency-Serialized Priority Communication Manager
 *
 * Manages VHF aviation radio scheduling with:
 * 1. Frequency channel awareness & strict same-frequency overlap prevention
 * 2. Explicit priority queue ordering (EMERGENCY > CONFLICT_ALERT > CRITICAL_ATC > ATC_CLEARANCE > PILOT_READBACK > PILOT_CALLIN > ADVISORY)
 * 3. Emergency preemption (immediately interrupts non-emergency chatter & jumps to queue head)
 * 4. Granular cancellation (by txId, by callsign/aircraftId, by frequency, or full clear)
 * 5. Bi-directional controller-to-pilot & pilot-to-controller exchange support
 * 6. Configurable PTT timing (key-up pre-roll, inter-turn break gap, unkey squelch tail, channel gap)
 */

import { AtcStationRole } from './aviationSpeechGrammar';

export type CommsPriority =
  | 'EMERGENCY'
  | 'CONFLICT_ALERT'
  | 'CRITICAL_ATC'
  | 'ATC_CLEARANCE'
  | 'PILOT_READBACK'
  | 'PILOT_CALLIN'
  | 'ADVISORY';

export const COMMS_PRIORITY_WEIGHTS: Record<CommsPriority, number> = {
  EMERGENCY: 100,
  CONFLICT_ALERT: 85,
  CRITICAL_ATC: 75,
  ATC_CLEARANCE: 60,
  PILOT_READBACK: 50,
  PILOT_CALLIN: 40,
  ADVISORY: 20,
};

export type CommsDirection =
  | 'controller_to_pilot'
  | 'pilot_to_controller'
  | 'atc_only'
  | 'pilot_only';

export interface PttTimingConfig {
  /** Lead delay (ms) between PTT press click + carrier open and speech onset */
  keyUpLeadMs: number;
  /** Gap (ms) between first turn unkey and responding turn PTT press */
  interTurnGapMs: number;
  /** Squelch tail hold duration (ms) after speech stops before channel releases */
  unkeyTailMs: number;
  /** Minimum silent clear-frequency interval (ms) before next queued transmission */
  betweenTransmissionsMs: number;
}

export const DEFAULT_PTT_TIMING: PttTimingConfig = {
  keyUpLeadMs: 45,
  interTurnGapMs: 210,
  unkeyTailMs: 55,
  betweenTransmissionsMs: 130,
};

export interface CommsQueuePayload<TOptions = unknown> {
  id: string;
  seq: number;
  direction: CommsDirection;
  priority: CommsPriority;
  priorityWeight: number;
  frequency: string;
  normalizedFrequency: string;
  callsign: string;
  aircraftId?: string;
  atcRole: AtcStationRole;
  atcText?: string;
  atcSpokenText?: string;
  pilotText: string;
  pilotSpokenText?: string;
  onAtcStart?: () => void;
  onPilotStart?: () => void;
  onCancelled?: (reason: string) => void;
  options?: TOptions;
  enqueuedAt: number;
}

export interface CommsManagerSnapshot {
  activeTx: {
    id: string;
    callsign: string;
    frequency: string;
    priority: CommsPriority;
    direction: CommsDirection;
  } | null;
  queueLength: number;
  queuedItems: Array<{
    id: string;
    callsign: string;
    frequency: string;
    priority: CommsPriority;
    direction: CommsDirection;
  }>;
  activeFrequencies: string[];
  pttTiming: PttTimingConfig;
}

export function normalizeRadioFrequency(freq?: string): string {
  if (!freq) return 'PRIMARY';
  return freq.replace(/\s*MHz/gi, '').trim().toUpperCase() || 'PRIMARY';
}

export class RadioCommsManager<TOptions = unknown> {
  private queue: CommsQueuePayload<TOptions>[] = [];
  private activeTx: CommsQueuePayload<TOptions> | null = null;
  private activeAbortController: { aborted: boolean; reason?: string } | null = null;
  private activeFrequencies = new Set<string>();
  private generation = 0;
  private seqCounter = 0;
  private maxQueueSize = 10;
  private pttTiming: PttTimingConfig = { ...DEFAULT_PTT_TIMING };
  private isProcessing = false;
  private executor:
    | ((
        item: CommsQueuePayload<TOptions>,
        ctx: { isAborted: () => boolean; generation: number; pttTiming: PttTimingConfig }
      ) => Promise<void>)
    | null = null;
  private listeners: Array<(snapshot: CommsManagerSnapshot) => void> = [];

  public setExecutor(
    fn: (
      item: CommsQueuePayload<TOptions>,
      ctx: { isAborted: () => boolean; generation: number; pttTiming: PttTimingConfig }
    ) => Promise<void>
  ): void {
    this.executor = fn;
  }

  public getPttTiming(): PttTimingConfig {
    return { ...this.pttTiming };
  }

  public setPttTiming(patch: Partial<PttTimingConfig>): PttTimingConfig {
    const clamp = (val: unknown, min: number, max: number, fallback: number) =>
      typeof val === 'number' && Number.isFinite(val) ? Math.max(min, Math.min(max, Math.round(val))) : fallback;

    this.pttTiming = {
      keyUpLeadMs: clamp(patch.keyUpLeadMs, 15, 250, this.pttTiming.keyUpLeadMs),
      interTurnGapMs: clamp(patch.interTurnGapMs, 60, 800, this.pttTiming.interTurnGapMs),
      unkeyTailMs: clamp(patch.unkeyTailMs, 20, 260, this.pttTiming.unkeyTailMs),
      betweenTransmissionsMs: clamp(
        patch.betweenTransmissionsMs,
        40,
        600,
        this.pttTiming.betweenTransmissionsMs
      ),
    };
    this.notify();
    return this.getPttTiming();
  }

  public onSnapshotChange(cb: (snapshot: CommsManagerSnapshot) => void): () => void {
    this.listeners.push(cb);
    cb(this.getSnapshot());
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  private notify(): void {
    const snap = this.getSnapshot();
    for (const cb of this.listeners) {
      try {
        cb(snap);
      } catch (e) {
        console.error(e);
      }
    }
  }

  public getSnapshot(): CommsManagerSnapshot {
    return {
      activeTx: this.activeTx
        ? {
            id: this.activeTx.id,
            callsign: this.activeTx.callsign,
            frequency: this.activeTx.frequency,
            priority: this.activeTx.priority,
            direction: this.activeTx.direction,
          }
        : null,
      queueLength: this.queue.length,
      queuedItems: this.queue.map(item => ({
        id: item.id,
        callsign: item.callsign,
        frequency: item.frequency,
        priority: item.priority,
        direction: item.direction,
      })),
      activeFrequencies: Array.from(this.activeFrequencies),
      pttTiming: { ...this.pttTiming },
    };
  }

  public isFrequencyBusy(frequency: string): boolean {
    return this.activeFrequencies.has(normalizeRadioFrequency(frequency));
  }

  /**
   * Enqueues a radio transmission or bi-directional exchange with priority sorting,
   * duplicate/stale queue trimming, and immediate emergency preemption.
   */
  public enqueue(input: {
    direction: CommsDirection;
    priority: CommsPriority;
    frequency?: string;
    callsign: string;
    aircraftId?: string;
    atcRole?: AtcStationRole;
    atcText?: string;
    atcSpokenText?: string;
    pilotText: string;
    pilotSpokenText?: string;
    onAtcStart?: () => void;
    onPilotStart?: () => void;
    onCancelled?: (reason: string) => void;
    options?: TOptions;
  }): string {
    const seq = ++this.seqCounter;
    const freq = input.frequency?.trim() || '119.725 MHz';
    const item: CommsQueuePayload<TOptions> = {
      id: `tx_${Date.now()}_${seq}`,
      seq,
      direction: input.direction,
      priority: input.priority,
      priorityWeight: COMMS_PRIORITY_WEIGHTS[input.priority],
      frequency: freq,
      normalizedFrequency: normalizeRadioFrequency(freq),
      callsign: input.callsign.trim().toUpperCase(),
      aircraftId: input.aircraftId,
      atcRole: input.atcRole || 'TOWER',
      atcText: input.atcText,
      atcSpokenText: input.atcSpokenText,
      pilotText: input.pilotText,
      pilotSpokenText: input.pilotSpokenText,
      onAtcStart: input.onAtcStart,
      onPilotStart: input.onPilotStart,
      onCancelled: input.onCancelled,
      options: input.options,
      enqueuedAt: Date.now(),
    };

    // If an EMERGENCY arrives while low-priority traffic/ATIS/call-in is on frequency,
    // immediately preempt the active non-critical transmission so Mayday breaks through cleanly.
    if (
      item.priority === 'EMERGENCY' &&
      this.activeTx &&
      this.activeTx.priorityWeight < COMMS_PRIORITY_WEIGHTS.CRITICAL_ATC &&
      this.activeAbortController
    ) {
      this.activeAbortController.aborted = true;
      this.activeAbortController.reason = 'PREEMPTED_BY_EMERGENCY';
    }

    // Insert into queue sorted by priorityWeight descending, then FIFO seq ascending
    let insertIdx = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].priorityWeight < item.priorityWeight) {
        insertIdx = i;
        break;
      }
    }
    this.queue.splice(insertIdx, 0, item);

    // Bounded backlog: trim lowest-priority stale items first (never drop Emergency/Conflict/Critical!)
    while (this.queue.length > this.maxQueueSize) {
      let lowestIdx = this.queue.length - 1;
      for (let i = this.queue.length - 1; i >= 0; i--) {
        if (this.queue[i].priorityWeight < this.queue[lowestIdx].priorityWeight) {
          lowestIdx = i;
        }
      }
      if (this.queue[lowestIdx].priorityWeight >= COMMS_PRIORITY_WEIGHTS.CRITICAL_ATC) {
        break;
      }
      const [evicted] = this.queue.splice(lowestIdx, 1);
      evicted?.onCancelled?.('EVICTED_BY_QUEUE_LIMIT');
    }

    this.notify();
    void this.pump();
    return item.id;
  }

  public cancelById(txId: string, reason: string = 'CANCELLED_BY_ID'): boolean {
    const idx = this.queue.findIndex(q => q.id === txId);
    if (idx >= 0) {
      const [removed] = this.queue.splice(idx, 1);
      removed?.onCancelled?.(reason);
      this.notify();
      return true;
    }
    if (this.activeTx?.id === txId && this.activeAbortController) {
      this.activeAbortController.aborted = true;
      this.activeAbortController.reason = reason;
      this.notify();
      return true;
    }
    return false;
  }

  public cancelForCallsign(
    callsignOrAircraftId: string,
    reason: string = 'CANCELLED_FOR_AIRCRAFT'
  ): number {
    const needle = callsignOrAircraftId.trim().toUpperCase();
    let count = 0;

    const kept: CommsQueuePayload<TOptions>[] = [];
    for (const item of this.queue) {
      const matches =
        item.callsign === needle ||
        (item.aircraftId && item.aircraftId.trim().toUpperCase() === needle);
      if (matches) {
        count += 1;
        item.onCancelled?.(reason);
      } else {
        kept.push(item);
      }
    }
    this.queue = kept;

    if (
      this.activeTx &&
      (this.activeTx.callsign === needle ||
        (this.activeTx.aircraftId &&
          this.activeTx.aircraftId.trim().toUpperCase() === needle)) &&
      this.activeAbortController
    ) {
      this.activeAbortController.aborted = true;
      this.activeAbortController.reason = reason;
      count += 1;
    }

    if (count > 0) this.notify();
    return count;
  }

  public cancelFrequency(frequency: string, reason: string = 'CANCELLED_FREQUENCY'): number {
    const norm = normalizeRadioFrequency(frequency);
    let count = 0;
    const kept: CommsQueuePayload<TOptions>[] = [];
    for (const item of this.queue) {
      if (item.normalizedFrequency === norm) {
        count += 1;
        item.onCancelled?.(reason);
      } else {
        kept.push(item);
      }
    }
    this.queue = kept;

    if (
      this.activeTx?.normalizedFrequency === norm &&
      this.activeAbortController
    ) {
      this.activeAbortController.aborted = true;
      this.activeAbortController.reason = reason;
      count += 1;
    }

    if (count > 0) this.notify();
    return count;
  }

  public clearAll(reason: string = 'QUEUE_CLEARED'): void {
    this.generation += 1;
    const dropped = this.queue;
    this.queue = [];
    for (const item of dropped) {
      item.onCancelled?.(reason);
    }
    if (this.activeAbortController) {
      this.activeAbortController.aborted = true;
      this.activeAbortController.reason = reason;
    }
    this.activeTx = null;
    this.activeFrequencies.clear();
    this.isProcessing = false;
    this.notify();
  }

  public getGeneration(): number {
    return this.generation;
  }

  private async pump(): Promise<void> {
    if (this.isProcessing || !this.executor || this.queue.length === 0) return;

    // Pick highest-priority queued item whose frequency is NOT currently locked
    const nextIdx = this.queue.findIndex(
      item => !this.activeFrequencies.has(item.normalizedFrequency)
    );
    if (nextIdx < 0) return;

    const [item] = this.queue.splice(nextIdx, 1);
    if (!item) return;

    const runGeneration = this.generation;
    const abortHandle = { aborted: false, reason: undefined as string | undefined };

    this.isProcessing = true;
    this.activeTx = item;
    this.activeAbortController = abortHandle;
    this.activeFrequencies.add(item.normalizedFrequency);
    this.notify();

    try {
      await this.executor(item, {
        isAborted: () => abortHandle.aborted || runGeneration !== this.generation,
        generation: runGeneration,
        pttTiming: { ...this.pttTiming },
      });
    } catch (err) {
      console.error('[RadioCommsManager] Execution error:', err);
    } finally {
      this.activeFrequencies.delete(item.normalizedFrequency);
      if (this.activeTx?.id === item.id) {
        this.activeTx = null;
        this.activeAbortController = null;
      }

      if (runGeneration === this.generation) {
        const gapMs = this.pttTiming.betweenTransmissionsMs;
        this.notify();
        setTimeout(() => {
          this.isProcessing = false;
          void this.pump();
        }, gapMs);
      } else {
        this.isProcessing = false;
        this.notify();
      }
    }
  }
}
