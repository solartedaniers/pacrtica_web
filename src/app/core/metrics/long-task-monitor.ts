export interface LongTaskSummary {
  readonly supported: boolean;
  readonly count: number;
  readonly totalMs: number;
  readonly worstMs: number;
  readonly recent: readonly number[];
  readonly lastSecondCount: number;
}

export class LongTaskMonitor {
  private observer: PerformanceObserver | null = null;
  private count = 0;
  private totalMs = 0;
  private worstMs = 0;
  private readonly recent: { at: number; duration: number }[] = [];
  readonly supported: boolean;

  constructor() {
    const types = typeof PerformanceObserver !== 'undefined' ? PerformanceObserver.supportedEntryTypes ?? [] : [];
    this.supported = types.includes('longtask');
  }

  start(): void {
    if (!this.supported || this.observer !== null) {
      return;
    }
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.count++;
        this.totalMs += entry.duration;
        this.worstMs = Math.max(this.worstMs, entry.duration);
        this.recent.push({ at: entry.startTime, duration: entry.duration });
        if (this.recent.length > 20) {
          this.recent.shift();
        }
      }
    });
    this.observer.observe({ type: 'longtask', buffered: true });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  reset(): void {
    this.count = 0;
    this.totalMs = 0;
    this.worstMs = 0;
    this.recent.length = 0;
  }

  summary(nowMs: number): LongTaskSummary {
    let lastSecondCount = 0;
    for (const item of this.recent) {
      if (nowMs - item.at <= 1000) {
        lastSecondCount++;
      }
    }
    return {
      supported: this.supported,
      count: this.count,
      totalMs: this.totalMs,
      worstMs: this.worstMs,
      recent: this.recent.slice(-6).map((item) => item.duration),
      lastSecondCount,
    };
  }
}
