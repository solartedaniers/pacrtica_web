import { Injectable, signal } from '@angular/core';
import { TimeRange, TraceViewport } from '../core/render/trace-viewport';

@Injectable({ providedIn: 'root' })
export class TraceViewportService {
  readonly viewport = new TraceViewport();
  readonly live = signal(true);
  readonly windowSeconds = signal(this.viewport.windowSeconds);
  readonly selection = signal<TimeRange | null>(null);
  readonly selectionMode = signal(false);

  sync(): void {
    if (this.live() !== this.viewport.live) {
      this.live.set(this.viewport.live);
    }
    if (this.windowSeconds() !== this.viewport.windowSeconds) {
      this.windowSeconds.set(Math.round(this.viewport.windowSeconds));
    }
  }

  setWindow(seconds: number): void {
    this.viewport.setWindowSeconds(seconds);
    this.sync();
  }

  zoom(factor: number): void {
    this.viewport.zoom(factor, 1);
    this.sync();
  }

  goLive(): void {
    this.viewport.goLive();
    this.sync();
  }

  pause(): void {
    this.viewport.pause();
    this.sync();
  }

  focusOn(timeUs: number): void {
    this.viewport.focusOn(timeUs);
    this.sync();
  }

  commitSelection(range: TimeRange | null): void {
    this.viewport.selection = range;
    this.selection.set(range);
  }

  toggleSelectionMode(): void {
    this.selectionMode.update((value) => !value);
  }
}
