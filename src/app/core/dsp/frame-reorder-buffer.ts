import { SeismicFrame } from '../protocol/frame-codec';
import { MinHeap } from './min-heap';
import { SequenceWindowSet } from './sequence-window-set';

export interface ReorderSink {
  deliver(frame: SeismicFrame): void;
  skip(lostFrames: number): void;
}

export interface ReorderPolicy {
  readonly windowMs: number;
  readonly maxDisorderPositions: number;
  readonly heapCapacity: number;
  readonly duplicateMemoryFrames: number;
}

export class ReorderCounters {
  delivered = 0;
  duplicates = 0;
  lateDiscarded = 0;
  lostFrames = 0;
  outOfOrder = 0;
}

interface PendingFrame {
  readonly frame: SeismicFrame;
  readonly arrivalMs: number;
}

export class FrameReorderBuffer {
  readonly counters = new ReorderCounters();
  private readonly heap = new MinHeap<PendingFrame>(
    (a, b) => a.frame.t0Us - b.frame.t0Us || a.frame.seq - b.frame.seq,
  );
  private readonly seen: SequenceWindowSet;
  private expectedSeq: number | null = null;
  private highestSeq = -1;
  private waitingSinceMs: number | null = null;

  constructor(
    private readonly policy: ReorderPolicy,
    private readonly sink: ReorderSink,
  ) {
    this.seen = new SequenceWindowSet(policy.duplicateMemoryFrames);
  }

  get pendingFrames(): number {
    return this.heap.size;
  }

  accept(frame: SeismicFrame, nowMs: number): void {
    const seq = frame.seq;
    if (this.seen.has(seq)) {
      this.counters.duplicates++;
      return;
    }
    if (this.expectedSeq !== null && seq < this.expectedSeq) {
      this.counters.lateDiscarded++;
      return;
    }
    this.seen.add(seq);
    if (seq < this.highestSeq) {
      this.counters.outOfOrder++;
    }
    if (seq > this.highestSeq) {
      this.highestSeq = seq;
    }
    this.heap.push({ frame, arrivalMs: nowMs });
    this.drain(nowMs);
  }

  drain(nowMs: number): void {
    for (;;) {
      const top = this.heap.peek();
      if (top === undefined) {
        this.waitingSinceMs = null;
        return;
      }
      if (this.expectedSeq === null) {
        const boundExceeded = this.highestSeq - top.frame.seq > this.policy.maxDisorderPositions;
        if (!boundExceeded && this.heap.size <= this.policy.maxDisorderPositions && nowMs - top.arrivalMs < this.policy.windowMs) {
          return;
        }
        this.expectedSeq = top.frame.seq;
      }
      const expected = this.expectedSeq;
      if (top.frame.seq === expected) {
        this.heap.pop();
        this.expectedSeq = expected + 1;
        this.waitingSinceMs = null;
        this.counters.delivered++;
        this.sink.deliver(top.frame);
        continue;
      }
      if (this.waitingSinceMs === null) {
        this.waitingSinceMs = top.arrivalMs;
      }
      const surelyLostUntil = Math.min(top.frame.seq, this.highestSeq - this.policy.maxDisorderPositions);
      const windowClosed = nowMs - this.waitingSinceMs >= this.policy.windowMs;
      const overflow = this.heap.size > this.policy.heapCapacity;
      const closeUntil = windowClosed || overflow ? top.frame.seq : surelyLostUntil;
      if (closeUntil <= expected) {
        return;
      }
      const lost = closeUntil - expected;
      this.counters.lostFrames += lost;
      this.expectedSeq = closeUntil;
      this.sink.skip(lost);
    }
  }
}
