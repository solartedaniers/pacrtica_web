import { SeismicConstants } from '../config/seismic-constants';

export const ChannelStatusField = {
  ratio: 0,
  sta: 1,
  lta: 2,
  envelope: 3,
  triggered: 4,
  lastTimeUs: 5,
  maxRelativeDrift: 6,
  negativeCorrections: 7,
  framesDelivered: 8,
  duplicates: 9,
  lateDiscarded: 10,
  lostFrames: 11,
  pendingFrames: 12,
  recomputations: 13,
  ltaFrozen: 14,
  outOfOrder: 15,
  stride: 16,
} as const;

export const WorkerStatusField = {
  queuedBatches: 0,
  oldestQueuedAgeMs: 1,
  processedSamples: 2,
  busyMs: 3,
  stationsMask: 4,
  active: 5,
  stride: 8,
} as const;

export const GlobalStatusField = {
  framesReceived: 0,
  bytesReceived: 1,
  generatedTimeUs: 2,
  injectedDisorder: 3,
  injectedDuplicates: 4,
  injectedLost: 5,
  burstRemainingSeconds: 6,
  sourceMode: 7,
  sourceConnected: 8,
  quakesInjected: 9,
  sourceErrors: 10,
  rateMultiplier: 11,
  stride: 32,
} as const;

interface Region {
  readonly offset: number;
  readonly bytes: number;
}

export class SharedMemoryLayout {
  static readonly maxWorkers = SeismicConstants.stationCount;
  readonly channels = SeismicConstants.channelCount;
  readonly capacity = SeismicConstants.historyCapacity;

  readonly cursors: Region;
  readonly baseTimes: Region;
  readonly baseReady: Region;
  readonly samples: Region;
  readonly envelope: Region;
  readonly channelStatus: Region;
  readonly workerStatus: Region;
  readonly globalStatus: Region;
  readonly totalBytes: number;

  constructor() {
    let cursor = 0;
    const take = (bytes: number): Region => {
      const region = { offset: cursor, bytes };
      cursor = SharedMemoryLayout.align(cursor + bytes, 8);
      return region;
    };
    this.cursors = take(this.channels * 2 * BigInt64Array.BYTES_PER_ELEMENT);
    this.baseTimes = take(this.channels * Float64Array.BYTES_PER_ELEMENT);
    this.baseReady = take(this.channels * Int32Array.BYTES_PER_ELEMENT);
    this.samples = take(this.channels * this.capacity * Float32Array.BYTES_PER_ELEMENT);
    this.envelope = take(this.channels * this.capacity * Float32Array.BYTES_PER_ELEMENT);
    this.channelStatus = take(this.channels * ChannelStatusField.stride * Float64Array.BYTES_PER_ELEMENT);
    this.workerStatus = take(SharedMemoryLayout.maxWorkers * WorkerStatusField.stride * Float64Array.BYTES_PER_ELEMENT);
    this.globalStatus = take(GlobalStatusField.stride * Float64Array.BYTES_PER_ELEMENT);
    this.totalBytes = cursor;
  }

  static align(value: number, boundary: number): number {
    return Math.ceil(value / boundary) * boundary;
  }

  allocate(): SharedArrayBuffer {
    return new SharedArrayBuffer(this.totalBytes);
  }
}

export class SharedMemoryViews {
  readonly layout = new SharedMemoryLayout();
  readonly cursors: BigInt64Array;
  readonly baseTimes: Float64Array;
  readonly baseReady: Int32Array;
  readonly samples: Float32Array;
  readonly envelope: Float32Array;
  readonly channelStatus: Float64Array;
  readonly workerStatus: Float64Array;
  readonly globalStatus: Float64Array;

  constructor(readonly buffer: SharedArrayBuffer) {
    const l = this.layout;
    this.cursors = new BigInt64Array(buffer, l.cursors.offset, l.channels * 2);
    this.baseTimes = new Float64Array(buffer, l.baseTimes.offset, l.channels);
    this.baseReady = new Int32Array(buffer, l.baseReady.offset, l.channels);
    this.samples = new Float32Array(buffer, l.samples.offset, l.channels * l.capacity);
    this.envelope = new Float32Array(buffer, l.envelope.offset, l.channels * l.capacity);
    this.channelStatus = new Float64Array(buffer, l.channelStatus.offset, l.channels * ChannelStatusField.stride);
    this.workerStatus = new Float64Array(buffer, l.workerStatus.offset, SharedMemoryLayout.maxWorkers * WorkerStatusField.stride);
    this.globalStatus = new Float64Array(buffer, l.globalStatus.offset, GlobalStatusField.stride);
  }

  channelStatusValue(channel: number, field: number): number {
    return this.channelStatus[channel * ChannelStatusField.stride + field];
  }

  setChannelStatus(channel: number, field: number, value: number): void {
    this.channelStatus[channel * ChannelStatusField.stride + field] = value;
  }

  workerStatusValue(worker: number, field: number): number {
    return this.workerStatus[worker * WorkerStatusField.stride + field];
  }

  setWorkerStatus(worker: number, field: number, value: number): void {
    this.workerStatus[worker * WorkerStatusField.stride + field] = value;
  }
}
