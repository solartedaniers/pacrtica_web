import { SharedMemoryViews } from './shared-memory-layout';

export class RingHistoryWriter {
  private committedCount = 0;
  private readonly slotBase: number;
  private readonly capacity: number;
  private blockSlot = 0;

  constructor(
    private readonly views: SharedMemoryViews,
    private readonly channel: number,
  ) {
    this.capacity = views.layout.capacity;
    this.slotBase = channel * this.capacity;
  }

  get count(): number {
    return this.committedCount;
  }

  get hasBase(): boolean {
    return Atomics.load(this.views.baseReady, this.channel) === 1;
  }

  publishBase(t0Us: number): void {
    this.views.baseTimes[this.channel] = t0Us;
    Atomics.store(this.views.baseReady, this.channel, 1);
  }

  beginBlock(length: number): void {
    Atomics.store(this.views.cursors, this.channel * 2 + 1, BigInt(this.committedCount + length));
    this.blockSlot = this.committedCount % this.capacity;
  }

  write(offset: number, sample: number, envelope: number): void {
    let slot = this.blockSlot + offset;
    if (slot >= this.capacity) {
      slot -= this.capacity;
    }
    this.views.samples[this.slotBase + slot] = sample;
    this.views.envelope[this.slotBase + slot] = envelope;
  }

  commitBlock(length: number): void {
    this.committedCount += length;
    Atomics.store(this.views.cursors, this.channel * 2, BigInt(this.committedCount));
    Atomics.notify(this.views.cursors, this.channel * 2);
  }
}

export class RingHistoryReader {
  readonly capacity: number;

  constructor(private readonly views: SharedMemoryViews) {
    this.capacity = views.layout.capacity;
  }

  committed(channel: number): number {
    return Number(Atomics.load(this.views.cursors, channel * 2));
  }

  pending(channel: number): number {
    return Number(Atomics.load(this.views.cursors, channel * 2 + 1));
  }

  baseTimeUs(channel: number): number | null {
    return Atomics.load(this.views.baseReady, channel) === 1 ? this.views.baseTimes[channel] : null;
  }

  oldestIntactIndex(channel: number): number {
    return Math.max(0, this.pending(channel) - this.capacity);
  }

  isIntactFrom(channel: number, startIndex: number): boolean {
    return startIndex >= this.pending(channel) - this.capacity;
  }

  slotOf(channel: number, index: number): number {
    return channel * this.capacity + (index % this.capacity);
  }

  get samples(): Float32Array {
    return this.views.samples;
  }

  get envelope(): Float32Array {
    return this.views.envelope;
  }

  copyRange(channel: number, start: number, end: number, target: Float32Array, source: Float32Array): boolean {
    if (start < 0 || end > this.committed(channel) || !this.isIntactFrom(channel, start)) {
      return false;
    }
    for (let i = start; i < end; i++) {
      target[i - start] = source[this.slotOf(channel, i)];
    }
    return this.isIntactFrom(channel, start);
  }

  waitForCommit(channel: number, expected: number, timeoutMs: number): void {
    Atomics.wait(this.views.cursors, channel * 2, BigInt(expected), timeoutMs);
  }
}
