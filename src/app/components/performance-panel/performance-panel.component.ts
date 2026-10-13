import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { InteractionBreakdown } from '../../core/metrics/interaction-monitor';
import { ConsoleTextService } from '../../services/console-text.service';
import { PerformanceTelemetryService } from '../../services/performance-telemetry.service';
import { StatusSnapshotService } from '../../services/status-snapshot.service';

interface BreakdownView {
  readonly name: string;
  readonly total: string;
  readonly level: 'good' | 'warning' | 'poor';
  readonly parts: readonly { readonly key: string; readonly value: string; readonly share: number; readonly tone: string }[];
}

@Component({
  selector: 'app-performance-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './performance-panel.component.html',
})
export class PerformancePanelComponent {
  private readonly telemetry = inject(PerformanceTelemetryService);
  private readonly status = inject(StatusSnapshotService);
  private readonly text = inject(ConsoleTextService);

  protected readonly view = computed(() => {
    const snapshot = this.telemetry.snapshot();
    if (snapshot === null) {
      return null;
    }
    const numeric = this.status.numericHealth();
    return {
      interactionsSupported: snapshot.interactions.supported,
      interactionCount: snapshot.interactions.count,
      inp: this.breakdown(snapshot.interactions.inp),
      latest: this.breakdown(snapshot.interactions.latest),
      longTasksSupported: snapshot.longTasks.supported,
      longTaskCount: snapshot.longTasks.count,
      longTaskWorst: this.text.formatNumber(snapshot.longTasks.worstMs, 0),
      longTaskRecent: snapshot.longTasks.lastSecondCount,
      fps: this.text.formatNumber(snapshot.frames.fps, 0),
      fpsLevel: snapshot.frames.fps >= 55 ? 'good' : snapshot.frames.fps >= 40 ? 'warning' : 'poor',
      drawMs: this.text.formatNumber(snapshot.frames.drawMs, 2),
      worstFrame: this.text.formatNumber(snapshot.frames.worstFrameMs, 0),
      backlogCurrent: snapshot.backlog.current,
      backlogPeak: snapshot.backlog.peak,
      backlogSlices: snapshot.backlog.slices,
      strategy: snapshot.backlog.strategy,
      drift: numeric.maxRelativeDrift.toExponential(2),
      negatives: numeric.negativeCorrections,
      recomputations: this.text.formatNumber(numeric.recomputations, 0),
    };
  });

  protected reset(): void {
    this.telemetry.resetLongTasks();
  }

  private breakdown(entry: InteractionBreakdown | null): BreakdownView | null {
    if (entry === null) {
      return null;
    }
    const total = Math.max(1, entry.duration);
    return {
      name: entry.name,
      total: this.text.formatNumber(entry.duration, 0),
      level: entry.duration <= 200 ? 'good' : entry.duration <= 500 ? 'warning' : 'poor',
      parts: [
        { key: 'performance.inputDelay', value: this.text.formatNumber(entry.inputDelay, 0), share: (entry.inputDelay / total) * 100, tone: 'input' },
        { key: 'performance.processing', value: this.text.formatNumber(entry.processing, 0), share: (entry.processing / total) * 100, tone: 'processing' },
        { key: 'performance.presentation', value: this.text.formatNumber(entry.presentationDelay, 0), share: (entry.presentationDelay / total) * 100, tone: 'presentation' },
      ],
    };
  }
}
