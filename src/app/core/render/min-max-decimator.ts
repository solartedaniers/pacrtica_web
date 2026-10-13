import { SeismicConstants } from '../config/seismic-constants';
import { RingHistoryReader } from '../memory/ring-history';

export class DecimatedColumn {
  min = 0;
  max = 0;
  envelope = 0;
  valid = false;
}

export class MinMaxDecimator {
  private static readonly cacheSize = 4096;
  private readonly tags: Float64Array;
  private readonly mins: Float32Array;
  private readonly maxs: Float32Array;
  private readonly envelopes: Float32Array;
  private readonly flags: Uint8Array;
  private binSamples = 0;
  private computedBins = 0;
  private cachedHits = 0;

  constructor(private readonly reader: RingHistoryReader) {
    const total = SeismicConstants.channelCount * MinMaxDecimator.cacheSize;
    this.tags = new Float64Array(total).fill(-1);
    this.mins = new Float32Array(total);
    this.maxs = new Float32Array(total);
    this.envelopes = new Float32Array(total);
    this.flags = new Uint8Array(total);
  }

  configure(binSamples: number): void {
    if (binSamples !== this.binSamples) {
      this.binSamples = binSamples;
      this.tags.fill(-1);
    }
  }

  get samplesPerBin(): number {
    return this.binSamples;
  }

  takeStatistics(): { computed: number; cached: number } {
    const result = { computed: this.computedBins, cached: this.cachedHits };
    this.computedBins = 0;
    this.cachedHits = 0;
    return result;
  }

  column(channel: number, bin: number, committed: number, oldest: number, out: DecimatedColumn): void {
    const bs = this.binSamples;
    const start = bin * bs;
    const end = start + bs;
    out.valid = false;
    if (bin < 0 || start >= committed || end <= oldest) {
      return;
    }
    const complete = end <= committed;
    const slot = channel * MinMaxDecimator.cacheSize + (bin % MinMaxDecimator.cacheSize);
    if (complete && this.tags[slot] === bin) {
      this.cachedHits++;
      out.valid = this.flags[slot] === 1;
      out.min = this.mins[slot];
      out.max = this.maxs[slot];
      out.envelope = this.envelopes[slot];
      return;
    }
    const from = Math.max(start, oldest);
    const to = Math.min(end, committed);
    const samples = this.reader.samples;
    const envelope = this.reader.envelope;
    const capacity = this.reader.capacity;
    const channelBase = channel * capacity;
    let position = from % capacity;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let env = 0;
    for (let i = from; i < to; i++) {
      const value = samples[channelBase + position];
      if (value === value) {
        if (value < min) {
          min = value;
        }
        if (value > max) {
          max = value;
        }
        const e = envelope[channelBase + position];
        if (e > env) {
          env = e;
        }
      }
      position++;
      if (position === capacity) {
        position = 0;
      }
    }
    this.computedBins++;
    if (!this.reader.isIntactFrom(channel, from)) {
      return;
    }
    const hasData = min <= max;
    out.valid = hasData;
    out.min = min;
    out.max = max;
    out.envelope = env;
    if (complete && from === start) {
      this.tags[slot] = bin;
      this.flags[slot] = hasData ? 1 : 0;
      this.mins[slot] = hasData ? min : 0;
      this.maxs[slot] = hasData ? max : 0;
      this.envelopes[slot] = env;
    }
  }
}
