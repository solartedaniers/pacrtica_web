import { SeismicConstants } from '../config/seismic-constants';

export interface TimeRange {
  readonly startUs: number;
  readonly endUs: number;
}

export class TraceViewport {
  static readonly minWindowSeconds = 5;
  static readonly maxWindowSeconds = SeismicConstants.historySeconds;
  live = true;
  windowSeconds = 60;
  private pausedEndUs = 0;
  selection: TimeRange | null = null;
  hoverRatio: number | null = null;
  private latestUs = 0;
  private oldestUs = 0;

  updateBounds(latestUs: number, oldestUs: number): void {
    this.latestUs = latestUs;
    this.oldestUs = oldestUs;
    if (!this.live) {
      this.pausedEndUs = this.clampEnd(this.pausedEndUs);
    }
  }

  get windowUs(): number {
    return this.windowSeconds * 1_000_000;
  }

  visibleRange(): TimeRange {
    const endUs = this.live ? this.latestUs : this.pausedEndUs;
    return { startUs: endUs - this.windowUs, endUs };
  }

  timeAtRatio(ratio: number): number {
    const range = this.visibleRange();
    return range.startUs + (range.endUs - range.startUs) * ratio;
  }

  zoom(factor: number, anchorRatio: number): void {
    const anchorUs = this.timeAtRatio(anchorRatio);
    const next = Math.min(TraceViewport.maxWindowSeconds, Math.max(TraceViewport.minWindowSeconds, this.windowSeconds * factor));
    if (next === this.windowSeconds) {
      return;
    }
    this.windowSeconds = next;
    if (!this.live) {
      this.pausedEndUs = this.clampEnd(anchorUs + (1 - anchorRatio) * this.windowUs);
    }
  }

  setWindowSeconds(seconds: number): void {
    this.windowSeconds = Math.min(TraceViewport.maxWindowSeconds, Math.max(TraceViewport.minWindowSeconds, seconds));
    if (!this.live) {
      this.pausedEndUs = this.clampEnd(this.pausedEndUs);
    }
  }

  panByRatio(deltaRatio: number): void {
    const current = this.visibleRange().endUs;
    this.live = false;
    this.pausedEndUs = this.clampEnd(current - deltaRatio * this.windowUs);
  }

  goLive(): void {
    this.live = true;
  }

  pause(): void {
    if (this.live) {
      this.pausedEndUs = this.latestUs;
      this.live = false;
    }
  }

  focusOn(centerUs: number): void {
    this.live = false;
    this.pausedEndUs = this.clampEnd(centerUs + this.windowUs / 2);
  }

  private clampEnd(endUs: number): number {
    const minimumEnd = this.oldestUs + this.windowUs;
    return Math.max(Math.min(endUs, this.latestUs), Math.min(minimumEnd, this.latestUs));
  }
}
