import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SeismicConstants } from '../../core/config/seismic-constants';
import { MinMaxDecimator } from '../../core/render/min-max-decimator';
import { EventMarker, SeismogramRenderer } from '../../core/render/seismogram-renderer';
import { ThemePaletteReader, TracePalette } from '../../core/render/theme-palette';
import { TimeRange } from '../../core/render/trace-viewport';
import { AnimationLoopService } from '../../services/animation-loop.service';
import { ConsoleEventStore } from '../../services/console-event-store.service';
import { ConsoleTextService } from '../../services/console-text.service';
import { ExportService } from '../../services/export.service';
import { PerformanceTelemetryService } from '../../services/performance-telemetry.service';
import { SeismicPipelineService } from '../../services/seismic-pipeline.service';
import { StatusSnapshotService } from '../../services/status-snapshot.service';
import { TraceViewportService } from '../../services/trace-viewport.service';

interface DragState {
  readonly pointerId: number;
  readonly mode: 'pan' | 'select';
  readonly anchorUs: number;
  lastX: number;
}

@Component({
  selector: 'app-seismogram-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './seismogram-panel.component.html',
})
export class SeismogramPanelComponent implements AfterViewInit {
  private static readonly selectionExportKey = 'selection';
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly pipeline = inject(SeismicPipelineService);
  private readonly loop = inject(AnimationLoopService);
  private readonly status = inject(StatusSnapshotService);
  private readonly events = inject(ConsoleEventStore);
  private readonly text = inject(ConsoleTextService);
  private readonly telemetry = inject(PerformanceTelemetryService);
  private readonly exporter = inject(ExportService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly view = inject(TraceViewportService);
  protected readonly windowOptions = [10, 30, 60, 120, 300, 600];
  protected readonly selectionSummary = computed(() => {
    const selection = this.view.selection();
    if (selection === null) {
      return null;
    }
    const from = Math.min(selection.startUs, selection.endUs);
    const to = Math.max(selection.startUs, selection.endUs);
    return {
      from: this.text.formatPreciseClock(from),
      to: this.text.formatPreciseClock(to),
      seconds: this.text.formatNumber((to - from) / 1_000_000, 1),
      range: { startUs: from, endUs: to },
    };
  });
  protected readonly selectionExport = computed(() => this.exporter.jobs().get(SeismogramPanelComponent.selectionExportKey) ?? null);

  private renderer: SeismogramRenderer | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private palette: TracePalette | null = null;
  private rowLabels: string[] = [];
  private widthCss = 0;
  private heightCss = 0;
  private pixelRatio = 1;
  private drag: DragState | null = null;
  private plotLeft = SeismogramRenderer.labelWidth;
  private plotWidth = 1;

  ngAfterViewInit(): void {
    const handles = this.pipeline.pipeline;
    const canvas = this.canvasRef().nativeElement;
    if (handles === null) {
      return;
    }
    this.context = canvas.getContext('2d', { alpha: false });
    this.renderer = new SeismogramRenderer(handles.reader, new MinMaxDecimator(handles.reader));
    this.palette = new ThemePaletteReader().read(canvas);
    this.rowLabels = this.text.rowLabels();
    const resizeObserver = new ResizeObserver(() => this.resize(canvas));
    resizeObserver.observe(canvas);
    this.resize(canvas);
    const onWheel = (event: WheelEvent) => this.onWheel(event);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const unregister = this.loop.register(() => this.draw());
    this.destroyRef.onDestroy(() => {
      resizeObserver.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      unregister();
    });
  }

  protected setWindow(seconds: number): void {
    this.view.setWindow(seconds);
  }

  protected toggleLive(): void {
    if (this.view.live()) {
      this.view.pause();
    } else {
      this.view.goLive();
    }
  }

  protected zoom(factor: number): void {
    this.view.zoom(factor);
  }

  protected clearSelection(): void {
    this.view.commitSelection(null);
  }

  protected exportSelection(range: TimeRange): void {
    const fileName = this.text.instant('export.selectionFileName', {
      time: new Date(range.startUs / 1000).toISOString().replace(/[:.]/g, '-'),
    });
    this.exporter.requestWindow(SeismogramPanelComponent.selectionExportKey, range.startUs, range.endUs, fileName);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    const canvas = this.canvasRef().nativeElement;
    canvas.setPointerCapture(event.pointerId);
    const ratio = this.ratioAt(event);
    const mode = event.shiftKey || this.view.selectionMode() ? 'select' : 'pan';
    this.drag = { pointerId: event.pointerId, mode, anchorUs: this.view.viewport.timeAtRatio(ratio), lastX: event.offsetX };
    if (mode === 'select') {
      this.view.viewport.selection = { startUs: this.drag.anchorUs, endUs: this.drag.anchorUs };
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    const ratio = this.ratioAt(event);
    this.view.viewport.hoverRatio = ratio >= 0 && ratio <= 1 ? ratio : null;
    const drag = this.drag;
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }
    if (drag.mode === 'pan') {
      const delta = (event.offsetX - drag.lastX) / this.plotWidth;
      drag.lastX = event.offsetX;
      if (delta !== 0) {
        this.view.viewport.panByRatio(delta);
        this.view.sync();
      }
      return;
    }
    this.view.viewport.selection = { startUs: drag.anchorUs, endUs: this.view.viewport.timeAtRatio(Math.min(1, Math.max(0, ratio))) };
  }

  protected onPointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }
    this.drag = null;
    if (drag.mode === 'select') {
      const selection = this.view.viewport.selection;
      const minimumUs = SeismicConstants.samplePeriodUs * 20;
      this.view.commitSelection(selection !== null && Math.abs(selection.endUs - selection.startUs) >= minimumUs ? selection : null);
    }
  }

  protected onPointerLeave(): void {
    this.view.viewport.hoverRatio = null;
  }

  protected onDoubleClick(): void {
    this.view.goLive();
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => this.view.viewport.panByRatio(0.1),
      ArrowRight: () => this.view.viewport.panByRatio(-0.1),
      '+': () => this.view.viewport.zoom(1 / 1.25, 0.5),
      '-': () => this.view.viewport.zoom(1.25, 0.5),
      l: () => this.view.viewport.goLive(),
    };
    const action = actions[event.key];
    if (action !== undefined) {
      event.preventDefault();
      action();
      this.view.sync();
    }
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const ratio = Math.min(1, Math.max(0, this.ratioAt(event)));
    this.view.viewport.zoom(event.deltaY > 0 ? 1.2 : 1 / 1.2, ratio);
    this.view.sync();
  }

  private ratioAt(event: MouseEvent): number {
    return (event.offsetX - this.plotLeft) / this.plotWidth;
  }

  private resize(canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    this.widthCss = Math.max(1, rect.width);
    this.heightCss = Math.max(1, rect.height);
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(this.widthCss * this.pixelRatio);
    canvas.height = Math.round(this.heightCss * this.pixelRatio);
    if (this.renderer !== null) {
      const geometry = this.renderer.geometry(this.widthCss, this.heightCss);
      this.plotLeft = geometry.left;
      this.plotWidth = geometry.width;
    }
  }

  private draw(): void {
    const handles = this.pipeline.pipeline;
    if (handles === null || this.renderer === null || this.context === null || this.palette === null) {
      return;
    }
    const started = performance.now();
    const reader = handles.reader;
    let latestUs = 0;
    let oldestUs = 0;
    for (let channel = 0; channel < SeismicConstants.channelCount; channel++) {
      const base = reader.baseTimeUs(channel);
      if (base === null) {
        continue;
      }
      const latest = base + reader.committed(channel) * SeismicConstants.samplePeriodUs;
      const oldest = base + reader.oldestIntactIndex(channel) * SeismicConstants.samplePeriodUs;
      latestUs = Math.max(latestUs, latest);
      oldestUs = Math.max(oldestUs, oldest);
    }
    if (latestUs === 0) {
      return;
    }
    const viewport = this.view.viewport;
    viewport.updateBounds(latestUs, oldestUs);
    const events: readonly EventMarker[] = this.events.events();
    this.renderer.render({
      context: this.context,
      widthCss: this.widthCss,
      heightCss: this.heightCss,
      pixelRatio: this.pixelRatio,
      palette: this.palette,
      range: viewport.visibleRange(),
      rowLabels: this.rowLabels,
      triggered: (channel) => this.status.triggered(channel),
      events,
      selection: viewport.selection,
      hoverRatio: viewport.hoverRatio,
      formatTime: (timeUs) => this.text.formatClock(timeUs),
      formatEventLabel: (id) => this.text.instant('seismogram.eventLabel', { id }),
    });
    this.telemetry.frameMeter.recordDraw(performance.now() - started);
  }
}
