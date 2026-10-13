import { Injectable, inject, signal } from '@angular/core';
import { ChannelIndex, SeismicConstants } from '../core/config/seismic-constants';
import { ChannelStatusField, GlobalStatusField, SharedMemoryViews, WorkerStatusField } from '../core/memory/shared-memory-layout';
import { WallClock } from '../core/scheduling/wall-clock';
import { AnimationLoopService } from './animation-loop.service';
import { SeismicPipelineService } from './seismic-pipeline.service';

export interface ChannelStatusView {
  readonly channelIndex: number;
  readonly stationId: number;
  readonly component: number;
  readonly ratio: number;
  readonly envelope: number;
  readonly triggered: boolean;
  readonly ltaFrozen: boolean;
}

export interface StationStatusView {
  readonly stationId: number;
  readonly triggered: boolean;
  readonly channels: readonly ChannelStatusView[];
  readonly maxRatio: number;
  readonly envelope: number;
}

export interface WorkerStatusView {
  readonly index: number;
  readonly stations: readonly number[];
  readonly queuedBatches: number;
  readonly oldestQueuedAgeMs: number;
  readonly samplesPerSecond: number;
  readonly utilization: number;
}

export interface IngestStatusView {
  readonly framesPerSecond: number;
  readonly kilobytesPerSecond: number;
  readonly framesReceived: number;
  readonly delivered: number;
  readonly duplicates: number;
  readonly lateDiscarded: number;
  readonly lostFrames: number;
  readonly pendingFrames: number;
  readonly outOfOrder: number;
  readonly injectedDisorder: number;
  readonly injectedDuplicates: number;
  readonly injectedLost: number;
  readonly sourceMode: number;
  readonly sourceConnected: boolean;
  readonly sourceErrors: number;
  readonly burstRemainingSeconds: number;
  readonly rateMultiplier: number;
  readonly quakes: number;
}

export interface ClockStatusView {
  readonly wallUs: number;
  readonly generatedUs: number;
  readonly processedUs: number;
  readonly pipelineLagMs: number;
}

export interface NumericHealthView {
  readonly maxRelativeDrift: number;
  readonly negativeCorrections: number;
  readonly recomputations: number;
}

@Injectable({ providedIn: 'root' })
export class StatusSnapshotService {
  private static readonly refreshMs = 250;
  private readonly pipeline = inject(SeismicPipelineService);
  private readonly loop = inject(AnimationLoopService);
  private lastRefresh = 0;
  private previousFrames = 0;
  private previousBytes = 0;
  private previousSamples = new Float64Array(SeismicConstants.stationCount);
  private previousBusy = new Float64Array(SeismicConstants.stationCount);
  private previousAt = 0;
  private smoothedFrameRate = 0;
  private smoothedByteRate = 0;
  private unregister: (() => void) | null = null;

  readonly stations = signal<readonly StationStatusView[]>([]);
  readonly workers = signal<readonly WorkerStatusView[]>([]);
  readonly ingest = signal<IngestStatusView | null>(null);
  readonly clock = signal<ClockStatusView | null>(null);
  readonly numericHealth = signal<NumericHealthView>({ maxRelativeDrift: 0, negativeCorrections: 0, recomputations: 0 });

  start(): void {
    if (this.unregister === null) {
      this.unregister = this.loop.register((timestamp) => this.tick(timestamp));
    }
  }

  triggered(channel: number): boolean {
    const handles = this.pipeline.pipeline;
    return handles !== null && handles.views.channelStatusValue(channel, ChannelStatusField.triggered) === 1;
  }

  private tick(timestamp: number): void {
    if (timestamp - this.lastRefresh < StatusSnapshotService.refreshMs) {
      return;
    }
    const handles = this.pipeline.pipeline;
    if (handles === null) {
      return;
    }
    const elapsedSeconds = this.lastRefresh === 0 ? 0 : (timestamp - this.previousAt) / 1000;
    this.lastRefresh = timestamp;
    this.previousAt = timestamp;
    this.refreshChannels(handles.views);
    this.refreshWorkers(handles.views, handles.topology.partitions, elapsedSeconds);
    this.refreshIngest(handles.views, elapsedSeconds);
  }

  private refreshChannels(views: SharedMemoryViews): void {
    const stations: StationStatusView[] = [];
    let drift = 0;
    let negatives = 0;
    let recomputations = 0;
    for (let stationId = 1; stationId <= SeismicConstants.stationCount; stationId++) {
      const channels: ChannelStatusView[] = [];
      for (let component = 0; component < SeismicConstants.channelsPerStation; component++) {
        const c = ChannelIndex.of(stationId, component);
        channels.push({
          channelIndex: c,
          stationId,
          component,
          ratio: views.channelStatusValue(c, ChannelStatusField.ratio),
          envelope: views.channelStatusValue(c, ChannelStatusField.envelope),
          triggered: views.channelStatusValue(c, ChannelStatusField.triggered) === 1,
          ltaFrozen: views.channelStatusValue(c, ChannelStatusField.ltaFrozen) === 1,
        });
        drift = Math.max(drift, views.channelStatusValue(c, ChannelStatusField.maxRelativeDrift));
        negatives += views.channelStatusValue(c, ChannelStatusField.negativeCorrections);
        recomputations += views.channelStatusValue(c, ChannelStatusField.recomputations);
      }
      stations.push({
        stationId,
        channels,
        triggered: channels.some((channel) => channel.triggered),
        maxRatio: Math.max(...channels.map((channel) => channel.ratio || 0)),
        envelope: Math.max(...channels.map((channel) => channel.envelope || 0)),
      });
    }
    this.stations.set(stations);
    this.numericHealth.set({ maxRelativeDrift: drift, negativeCorrections: negatives, recomputations });
  }

  private refreshWorkers(views: SharedMemoryViews, partitions: readonly (readonly number[])[], elapsedSeconds: number): void {
    const workers: WorkerStatusView[] = partitions.map((stations, index) => {
      const samples = views.workerStatusValue(index, WorkerStatusField.processedSamples);
      const busy = views.workerStatusValue(index, WorkerStatusField.busyMs);
      const samplesPerSecond = elapsedSeconds > 0 ? (samples - this.previousSamples[index]) / elapsedSeconds : 0;
      const utilization = elapsedSeconds > 0 ? (busy - this.previousBusy[index]) / (elapsedSeconds * 1000) : 0;
      this.previousSamples[index] = samples;
      this.previousBusy[index] = busy;
      return {
        index,
        stations,
        queuedBatches: views.workerStatusValue(index, WorkerStatusField.queuedBatches),
        oldestQueuedAgeMs: views.workerStatusValue(index, WorkerStatusField.oldestQueuedAgeMs),
        samplesPerSecond,
        utilization,
      };
    });
    this.workers.set(workers);
  }

  private refreshIngest(views: SharedMemoryViews, elapsedSeconds: number): void {
    const g = views.globalStatus;
    const frames = g[GlobalStatusField.framesReceived];
    const bytes = g[GlobalStatusField.bytesReceived];
    if (elapsedSeconds > 0) {
      this.smoothedFrameRate = this.smoothedFrameRate * 0.8 + ((frames - this.previousFrames) / elapsedSeconds) * 0.2;
      this.smoothedByteRate = this.smoothedByteRate * 0.8 + ((bytes - this.previousBytes) / elapsedSeconds) * 0.2;
    }
    const framesPerSecond = this.smoothedFrameRate;
    const kilobytesPerSecond = this.smoothedByteRate / 1024;
    this.previousFrames = frames;
    this.previousBytes = bytes;
    let delivered = 0;
    let duplicates = 0;
    let late = 0;
    let lost = 0;
    let pending = 0;
    let outOfOrder = 0;
    let processedUs = 0;
    for (let c = 0; c < SeismicConstants.channelCount; c++) {
      delivered += views.channelStatusValue(c, ChannelStatusField.framesDelivered);
      duplicates += views.channelStatusValue(c, ChannelStatusField.duplicates);
      late += views.channelStatusValue(c, ChannelStatusField.lateDiscarded);
      lost += views.channelStatusValue(c, ChannelStatusField.lostFrames);
      pending += views.channelStatusValue(c, ChannelStatusField.pendingFrames);
      outOfOrder += views.channelStatusValue(c, ChannelStatusField.outOfOrder);
      const last = views.channelStatusValue(c, ChannelStatusField.lastTimeUs);
      if (last > processedUs) {
        processedUs = last;
      }
    }
    const generatedUs = g[GlobalStatusField.generatedTimeUs];
    this.ingest.set({
      framesPerSecond,
      kilobytesPerSecond,
      framesReceived: frames,
      delivered,
      duplicates,
      lateDiscarded: late,
      lostFrames: lost,
      pendingFrames: pending,
      outOfOrder,
      injectedDisorder: g[GlobalStatusField.injectedDisorder],
      injectedDuplicates: g[GlobalStatusField.injectedDuplicates],
      injectedLost: g[GlobalStatusField.injectedLost],
      sourceMode: g[GlobalStatusField.sourceMode],
      sourceConnected: g[GlobalStatusField.sourceConnected] === 1,
      sourceErrors: g[GlobalStatusField.sourceErrors],
      burstRemainingSeconds: g[GlobalStatusField.burstRemainingSeconds],
      rateMultiplier: g[GlobalStatusField.rateMultiplier],
      quakes: g[GlobalStatusField.quakesInjected],
    });
    this.clock.set({
      wallUs: WallClock.nowMs() * 1000,
      generatedUs,
      processedUs,
      pipelineLagMs: generatedUs > 0 && processedUs > 0 ? Math.max(0, (generatedUs - processedUs) / 1000) : 0,
    });
  }
}
