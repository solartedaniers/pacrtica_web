import { ChannelIndex, SeismicConstants } from '../config/seismic-constants';
import { ChannelPipeline, ChannelTransition, ChannelTransitionListener } from '../dsp/channel-pipeline';
import { SharedMemoryViews, WorkerStatusField } from '../memory/shared-memory-layout';
import { DetectorThresholds, FrameBatchMessage, ProcessorToCoincidence } from '../protocol/control-messages';
import { FrameCodec } from '../protocol/frame-codec';
import { MacrotaskScheduler } from '../scheduling/macrotask-scheduler';
import { TimeSlicedQueue } from '../scheduling/time-sliced-queue';

export interface StationProcessorOptions {
  readonly views: SharedMemoryViews;
  readonly workerIndex: number;
  readonly stationIds: readonly number[];
  readonly thresholds: DetectorThresholds;
  readonly ingestPort: MessagePort;
  readonly coincidencePort: MessagePort;
}

interface ReceivedBatch {
  readonly batch: FrameBatchMessage;
  readonly receivedMs: number;
}

export class StationProcessor implements ChannelTransitionListener {
  private static readonly sliceBudgetMs = 8;
  private static readonly housekeepingMs = 100;
  private static readonly stallThresholdMs = 3000;
  private readonly pipelines = new Map<number, ChannelPipeline>();
  private readonly queue: TimeSlicedQueue<ReceivedBatch>;
  private processedSamples = 0;
  private busyMs = 0;

  constructor(private readonly options: StationProcessorOptions) {
    for (const stationId of options.stationIds) {
      for (let component = 0; component < SeismicConstants.channelsPerStation; component++) {
        const channelIndex = ChannelIndex.of(stationId, component);
        this.pipelines.set(channelIndex, new ChannelPipeline(channelIndex, options.views, options.thresholds, this));
      }
    }
    this.queue = new TimeSlicedQueue<ReceivedBatch>(
      StationProcessor.sliceBudgetMs,
      (item) => this.processBatch(item),
      new MacrotaskScheduler('user-visible'),
      () => this.afterSlice(),
    );
    let mask = 0;
    for (const stationId of options.stationIds) {
      mask |= 1 << stationId;
    }
    options.views.setWorkerStatus(options.workerIndex, WorkerStatusField.stationsMask, mask);
    options.views.setWorkerStatus(options.workerIndex, WorkerStatusField.active, 1);
  }

  start(): void {
    this.options.ingestPort.onmessage = (event: MessageEvent<FrameBatchMessage>) =>
      this.queue.enqueue({ batch: event.data, receivedMs: performance.now() });
    setInterval(() => this.afterSlice(), StationProcessor.housekeepingMs);
  }

  updateThresholds(thresholds: DetectorThresholds): void {
    for (const pipeline of this.pipelines.values()) {
      pipeline.updateThresholds(thresholds);
    }
  }

  onChannelTransition(transition: ChannelTransition): void {
    this.post({ type: 'channel-transition', ...transition });
  }

  private processBatch(item: ReceivedBatch): void {
    const started = performance.now();
    const batch = item.batch;
    const view = new DataView(batch.buffer);
    for (let i = 0; i < batch.count; i++) {
      const frame = FrameCodec.decodeFrom(view, i * FrameCodec.byteLength);
      const pipeline = this.pipelines.get(ChannelIndex.of(frame.stationId, frame.channel));
      if (pipeline === undefined) {
        continue;
      }
      pipeline.reorder.accept(frame, item.receivedMs);
    }
    this.processedSamples += batch.count * SeismicConstants.samplesPerFrame;
    this.busyMs += performance.now() - started;
  }

  private afterSlice(): void {
    const now = performance.now();
    let watermark = Number.POSITIVE_INFINITY;
    for (const pipeline of this.pipelines.values()) {
      pipeline.reorder.drain(now);
      pipeline.publishStatus();
      const processed = pipeline.processedTimeUs;
      if (processed === processed && now - pipeline.lastProgressMs < StationProcessor.stallThresholdMs) {
        watermark = Math.min(watermark, processed);
      }
    }
    const v = this.options.views;
    const w = this.options.workerIndex;
    v.setWorkerStatus(w, WorkerStatusField.queuedBatches, this.queue.backlog);
    v.setWorkerStatus(w, WorkerStatusField.oldestQueuedAgeMs, this.queue.oldestAgeMs);
    v.setWorkerStatus(w, WorkerStatusField.processedSamples, this.processedSamples);
    v.setWorkerStatus(w, WorkerStatusField.busyMs, this.busyMs);
    this.post({ type: 'progress', workerIndex: w, watermarkUs: watermark });
  }

  private post(message: ProcessorToCoincidence): void {
    this.options.coincidencePort.postMessage(message);
  }
}
