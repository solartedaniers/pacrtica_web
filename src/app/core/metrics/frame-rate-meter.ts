export interface FrameRateSummary {
  readonly fps: number;
  readonly worstFrameMs: number;
  readonly drawMs: number;
}

export class FrameRateMeter {
  private lastTimestamp = Number.NaN;
  private smoothedInterval = 16.7;
  private smoothedDraw = 0;
  private windowWorst = 0;
  private reportedWorst = 0;
  private windowStart = 0;

  tick(timestamp: number): void {
    if (this.lastTimestamp === this.lastTimestamp) {
      const interval = timestamp - this.lastTimestamp;
      this.smoothedInterval = this.smoothedInterval * 0.92 + interval * 0.08;
      this.windowWorst = Math.max(this.windowWorst, interval);
    }
    this.lastTimestamp = timestamp;
    if (timestamp - this.windowStart >= 1000) {
      this.reportedWorst = this.windowWorst;
      this.windowWorst = 0;
      this.windowStart = timestamp;
    }
  }

  recordDraw(durationMs: number): void {
    this.smoothedDraw = this.smoothedDraw * 0.9 + durationMs * 0.1;
  }

  summary(): FrameRateSummary {
    return {
      fps: 1000 / Math.max(1, this.smoothedInterval),
      worstFrameMs: this.reportedWorst,
      drawMs: this.smoothedDraw,
    };
  }
}
