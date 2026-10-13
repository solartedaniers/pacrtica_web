import { Injectable, inject, signal } from '@angular/core';
import { FrameRateMeter, FrameRateSummary } from '../core/metrics/frame-rate-meter';
import { InteractionMonitor, InteractionSummary } from '../core/metrics/interaction-monitor';
import { LongTaskMonitor, LongTaskSummary } from '../core/metrics/long-task-monitor';
import { AnimationLoopService } from './animation-loop.service';
import { MainThreadBacklogService } from './main-thread-backlog.service';

export interface BacklogSummary {
  readonly current: number;
  readonly peak: number;
  readonly slices: number;
  readonly strategy: string;
}

export interface TelemetrySnapshot {
  readonly interactions: InteractionSummary;
  readonly longTasks: LongTaskSummary;
  readonly frames: FrameRateSummary;
  readonly backlog: BacklogSummary;
}

@Injectable({ providedIn: 'root' })
export class PerformanceTelemetryService {
  private static readonly refreshMs = 250;
  private readonly loop = inject(AnimationLoopService);
  private readonly backlog = inject(MainThreadBacklogService);
  private readonly interactions = new InteractionMonitor();
  private readonly longTasks = new LongTaskMonitor();
  readonly frameMeter = new FrameRateMeter();
  private lastRefresh = 0;
  private started = false;

  readonly snapshot = signal<TelemetrySnapshot | null>(null);

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.interactions.start();
    this.longTasks.start();
    this.loop.register((timestamp) => {
      this.frameMeter.tick(timestamp);
      if (timestamp - this.lastRefresh >= PerformanceTelemetryService.refreshMs) {
        this.lastRefresh = timestamp;
        this.publish(timestamp);
      }
    });
  }

  resetLongTasks(): void {
    this.longTasks.reset();
    this.backlog.resetPeak();
  }

  private publish(now: number): void {
    this.snapshot.set({
      interactions: this.interactions.summary(),
      longTasks: this.longTasks.summary(now),
      frames: this.frameMeter.summary(),
      backlog: {
        current: this.backlog.backlog,
        peak: this.backlog.maxBacklog,
        slices: this.backlog.slices,
        strategy: this.backlog.strategy,
      },
    });
  }
}
