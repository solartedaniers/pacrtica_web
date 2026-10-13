import { SeismicConstants } from '../config/seismic-constants';
import { RingHistoryReader } from '../memory/ring-history';
import { DecimatedColumn, MinMaxDecimator } from './min-max-decimator';
import { TracePalette } from './theme-palette';
import { TimeRange } from './trace-viewport';

export interface EventMarker {
  readonly id: number;
  readonly firstTriggerUs: number;
  readonly confirmedAtUs: number;
  readonly endUs: number | null;
}

export interface RenderFrame {
  readonly context: CanvasRenderingContext2D;
  readonly widthCss: number;
  readonly heightCss: number;
  readonly pixelRatio: number;
  readonly palette: TracePalette;
  readonly range: TimeRange;
  readonly rowLabels: readonly string[];
  readonly triggered: (channel: number) => boolean;
  readonly events: readonly EventMarker[];
  readonly selection: TimeRange | null;
  readonly hoverRatio: number | null;
  readonly formatTime: (timeUs: number) => string;
  readonly formatEventLabel: (id: number) => string;
}

export interface PlotGeometry {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly rowHeight: number;
  readonly bottom: number;
}

export class SeismogramRenderer {
  static readonly labelWidth = 76;
  static readonly axisHeight = 26;
  static readonly rightPadding = 10;
  static readonly topPadding = 4;
  private static readonly tickStepsSeconds = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  private readonly column = new DecimatedColumn();
  private readonly scales = new Float64Array(SeismicConstants.channelCount).fill(600);
  private readonly xs = new Float32Array(4096);
  private readonly mins = new Float32Array(4096);
  private readonly maxs = new Float32Array(4096);
  private readonly envelopes = new Float32Array(4096);
  private readonly valid = new Uint8Array(4096);

  constructor(
    private readonly reader: RingHistoryReader,
    private readonly decimator: MinMaxDecimator,
  ) {}

  geometry(widthCss: number, heightCss: number): PlotGeometry {
    const left = SeismogramRenderer.labelWidth;
    const top = SeismogramRenderer.topPadding;
    const width = Math.max(50, widthCss - left - SeismogramRenderer.rightPadding);
    const bottom = heightCss - SeismogramRenderer.axisHeight;
    return { left, top, width, rowHeight: (bottom - top) / SeismicConstants.channelCount, bottom };
  }

  render(frame: RenderFrame): void {
    const ctx = frame.context;
    const geometry = this.geometry(frame.widthCss, frame.heightCss);
    ctx.setTransform(frame.pixelRatio, 0, 0, frame.pixelRatio, 0, 0);
    ctx.fillStyle = frame.palette.background;
    ctx.fillRect(0, 0, frame.widthCss, frame.heightCss);
    const usPerPixel = (frame.range.endUs - frame.range.startUs) / geometry.width;
    const windowSamples = (frame.range.endUs - frame.range.startUs) / SeismicConstants.samplePeriodUs;
    this.decimator.configure(Math.max(1, Math.ceil(windowSamples / geometry.width)));
    this.drawRowBackgrounds(frame, geometry);
    this.drawEvents(frame, geometry, usPerPixel);
    this.drawGrid(frame, geometry, usPerPixel);
    for (let channel = 0; channel < SeismicConstants.channelCount; channel++) {
      this.drawChannel(frame, geometry, channel, usPerPixel);
    }
    this.drawSelection(frame, geometry, usPerPixel);
    this.drawLabels(frame, geometry);
    this.drawCursor(frame, geometry);
  }

  private drawRowBackgrounds(frame: RenderFrame, g: PlotGeometry): void {
    const ctx = frame.context;
    for (let channel = 0; channel < SeismicConstants.channelCount; channel++) {
      const y = g.top + channel * g.rowHeight;
      const stationBlock = Math.floor(channel / SeismicConstants.channelsPerStation);
      if (stationBlock % 2 === 1) {
        ctx.fillStyle = frame.palette.rowAlternate;
        ctx.fillRect(0, y, frame.widthCss, g.rowHeight);
      }
      if (frame.triggered(channel)) {
        ctx.fillStyle = frame.palette.triggerBand;
        ctx.fillRect(g.left, y, g.width, g.rowHeight);
      }
    }
  }

  private drawEvents(frame: RenderFrame, g: PlotGeometry, usPerPixel: number): void {
    const ctx = frame.context;
    for (const event of frame.events) {
      const endUs = event.endUs ?? frame.range.endUs;
      if (endUs < frame.range.startUs || event.firstTriggerUs > frame.range.endUs) {
        continue;
      }
      const x0 = Math.max(g.left, g.left + (event.firstTriggerUs - frame.range.startUs) / usPerPixel);
      const x1 = Math.min(g.left + g.width, g.left + (endUs - frame.range.startUs) / usPerPixel);
      ctx.fillStyle = frame.palette.eventBand;
      ctx.fillRect(x0, g.top, Math.max(1, x1 - x0), g.bottom - g.top);
      const xc = g.left + (event.confirmedAtUs - frame.range.startUs) / usPerPixel;
      if (xc >= g.left && xc <= g.left + g.width) {
        ctx.strokeStyle = frame.palette.event;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xc, g.top);
        ctx.lineTo(xc, g.bottom);
        ctx.stroke();
        ctx.fillStyle = frame.palette.event;
        ctx.font = `600 11px ${frame.palette.fontFamily}`;
        ctx.textBaseline = 'top';
        ctx.fillText(frame.formatEventLabel(event.id), xc + 4, g.top + 2);
      }
    }
  }

  private drawGrid(frame: RenderFrame, g: PlotGeometry, usPerPixel: number): void {
    const ctx = frame.context;
    const windowSeconds = (frame.range.endUs - frame.range.startUs) / 1_000_000;
    const step = SeismogramRenderer.tickStepsSeconds.find((s) => windowSeconds / s <= 10) ?? 300;
    const stepUs = step * 1_000_000;
    const firstTick = Math.ceil(frame.range.startUs / stepUs) * stepUs;
    ctx.strokeStyle = frame.palette.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = frame.palette.labelMuted;
    ctx.font = `11px ${frame.palette.fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.beginPath();
    for (let tick = firstTick; tick <= frame.range.endUs; tick += stepUs) {
      const x = Math.round(g.left + (tick - frame.range.startUs) / usPerPixel) + 0.5;
      ctx.moveTo(x, g.top);
      ctx.lineTo(x, g.bottom + 4);
      ctx.fillText(frame.formatTime(tick), x, g.bottom + SeismogramRenderer.axisHeight / 2 + 2);
    }
    ctx.stroke();
    ctx.textAlign = 'start';
  }

  private drawChannel(frame: RenderFrame, g: PlotGeometry, channel: number, usPerPixel: number): void {
    const base = this.reader.baseTimeUs(channel);
    if (base === null) {
      return;
    }
    const bs = this.decimator.samplesPerBin;
    const period = SeismicConstants.samplePeriodUs;
    const committed = this.reader.committed(channel);
    const oldest = this.reader.oldestIntactIndex(channel);
    const firstBin = Math.floor((frame.range.startUs - base) / period / bs);
    const lastBin = Math.ceil((frame.range.endUs - base) / period / bs);
    const count = Math.min(this.xs.length, lastBin - firstBin + 1);
    let peak = 0;
    for (let i = 0; i < count; i++) {
      const bin = firstBin + i;
      this.decimator.column(channel, bin, committed, oldest, this.column);
      this.valid[i] = this.column.valid ? 1 : 0;
      if (!this.column.valid) {
        continue;
      }
      this.xs[i] = g.left + (base + (bin + 0.5) * bs * period - frame.range.startUs) / usPerPixel;
      this.mins[i] = this.column.min;
      this.maxs[i] = this.column.max;
      this.envelopes[i] = this.column.envelope;
      peak = Math.max(peak, Math.abs(this.column.min), Math.abs(this.column.max));
    }
    const target = Math.max(250, peak * 1.1);
    const current = this.scales[channel];
    this.scales[channel] = target > current ? target : current * 0.97 + target * 0.03;
    const half = g.rowHeight / 2 - 1;
    const center = g.top + channel * g.rowHeight + g.rowHeight / 2;
    const k = half / this.scales[channel];
    const ctx = frame.context;
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.left, g.top + channel * g.rowHeight, g.width, g.rowHeight);
    ctx.clip();
    ctx.strokeStyle = frame.palette.envelope;
    ctx.lineWidth = 1;
    ctx.beginPath();
    this.tracePolyline(ctx, count, (i) => center - this.envelopes[i] * k);
    this.tracePolyline(ctx, count, (i) => center + this.envelopes[i] * k);
    ctx.stroke();
    ctx.strokeStyle = frame.palette.trace;
    ctx.beginPath();
    let open = false;
    for (let i = 0; i < count; i++) {
      if (this.valid[i] === 0) {
        open = false;
        continue;
      }
      const x = this.xs[i];
      let yTop = center - this.maxs[i] * k;
      let yBottom = center - this.mins[i] * k;
      if (yBottom - yTop < 1) {
        yTop -= 0.5;
        yBottom += 0.5;
      }
      if (open) {
        ctx.lineTo(x, yTop);
      } else {
        ctx.moveTo(x, yTop);
        open = true;
      }
      ctx.lineTo(x, yBottom);
    }
    ctx.stroke();
    ctx.restore();
  }

  private tracePolyline(ctx: CanvasRenderingContext2D, count: number, y: (i: number) => number): void {
    let open = false;
    for (let i = 0; i < count; i++) {
      if (this.valid[i] === 0) {
        open = false;
        continue;
      }
      if (open) {
        ctx.lineTo(this.xs[i], y(i));
      } else {
        ctx.moveTo(this.xs[i], y(i));
        open = true;
      }
    }
  }

  private drawSelection(frame: RenderFrame, g: PlotGeometry, usPerPixel: number): void {
    if (frame.selection === null) {
      return;
    }
    const ctx = frame.context;
    const a = g.left + (frame.selection.startUs - frame.range.startUs) / usPerPixel;
    const b = g.left + (frame.selection.endUs - frame.range.startUs) / usPerPixel;
    const x0 = Math.max(g.left, Math.min(a, b));
    const x1 = Math.min(g.left + g.width, Math.max(a, b));
    if (x1 <= x0) {
      return;
    }
    ctx.fillStyle = frame.palette.selection;
    ctx.fillRect(x0, g.top, x1 - x0, g.bottom - g.top);
    ctx.strokeStyle = frame.palette.selectionBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, g.top + 0.5, x1 - x0 - 1, g.bottom - g.top - 1);
  }

  private drawLabels(frame: RenderFrame, g: PlotGeometry): void {
    const ctx = frame.context;
    ctx.fillStyle = frame.palette.background;
    ctx.fillRect(0, 0, g.left - 4, g.bottom);
    ctx.textBaseline = 'middle';
    for (let channel = 0; channel < SeismicConstants.channelCount; channel++) {
      const y = g.top + channel * g.rowHeight + g.rowHeight / 2;
      const stationBlock = Math.floor(channel / SeismicConstants.channelsPerStation);
      if (stationBlock % 2 === 1) {
        ctx.fillStyle = frame.palette.rowAlternate;
        ctx.fillRect(0, g.top + channel * g.rowHeight, g.left - 4, g.rowHeight);
      }
      ctx.fillStyle = frame.triggered(channel) ? frame.palette.event : frame.palette.label;
      ctx.font = `${channel % SeismicConstants.channelsPerStation === 0 ? 600 : 400} 11px ${frame.palette.fontFamily}`;
      ctx.fillText(frame.rowLabels[channel] ?? '', 8, y);
    }
  }

  private drawCursor(frame: RenderFrame, g: PlotGeometry): void {
    if (frame.hoverRatio === null) {
      return;
    }
    const ctx = frame.context;
    const x = Math.round(g.left + frame.hoverRatio * g.width) + 0.5;
    ctx.strokeStyle = frame.palette.cursor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, g.top);
    ctx.lineTo(x, g.bottom);
    ctx.stroke();
    const label = frame.formatTime(frame.range.startUs + frame.hoverRatio * (frame.range.endUs - frame.range.startUs));
    ctx.font = `600 11px ${frame.palette.fontFamily}`;
    const width = ctx.measureText(label).width + 10;
    const left = Math.min(Math.max(g.left, x - width / 2), g.left + g.width - width);
    ctx.fillStyle = frame.palette.cursor;
    ctx.fillRect(left, g.bottom + 3, width, SeismogramRenderer.axisHeight - 6);
    ctx.fillStyle = frame.palette.background;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, left + 5, g.bottom + SeismogramRenderer.axisHeight / 2);
  }
}
