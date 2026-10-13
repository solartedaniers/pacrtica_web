export interface InteractionBreakdown {
  readonly name: string;
  readonly duration: number;
  readonly inputDelay: number;
  readonly processing: number;
  readonly presentationDelay: number;
}

export interface InteractionSummary {
  readonly supported: boolean;
  readonly count: number;
  readonly inp: InteractionBreakdown | null;
  readonly latest: InteractionBreakdown | null;
}

export class InteractionMonitor {
  private static readonly retained = 400;
  private readonly worstPerInteraction = new Map<number, InteractionBreakdown>();
  private readonly order: number[] = [];
  private latest: InteractionBreakdown | null = null;
  private observer: PerformanceObserver | null = null;
  readonly supported: boolean;

  constructor() {
    const types = typeof PerformanceObserver !== 'undefined' ? PerformanceObserver.supportedEntryTypes ?? [] : [];
    this.supported = types.includes('event');
  }

  start(): void {
    if (!this.supported || this.observer !== null) {
      return;
    }
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) {
        this.record(entry);
      }
    });
    this.observer.observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  summary(): InteractionSummary {
    return {
      supported: this.supported,
      count: this.worstPerInteraction.size,
      inp: this.computeInp(),
      latest: this.latest,
    };
  }

  private record(entry: PerformanceEventTiming): void {
    const id = entry.interactionId;
    if (!id) {
      return;
    }
    const breakdown: InteractionBreakdown = {
      name: entry.name,
      duration: entry.duration,
      inputDelay: Math.max(0, entry.processingStart - entry.startTime),
      processing: Math.max(0, entry.processingEnd - entry.processingStart),
      presentationDelay: Math.max(0, entry.startTime + entry.duration - entry.processingEnd),
    };
    this.latest = breakdown;
    const previous = this.worstPerInteraction.get(id);
    if (previous === undefined) {
      this.order.push(id);
      if (this.order.length > InteractionMonitor.retained) {
        const evicted = this.order.shift();
        if (evicted !== undefined) {
          this.worstPerInteraction.delete(evicted);
        }
      }
    }
    if (previous === undefined || breakdown.duration > previous.duration) {
      this.worstPerInteraction.set(id, breakdown);
    }
  }

  private computeInp(): InteractionBreakdown | null {
    if (this.worstPerInteraction.size === 0) {
      return null;
    }
    const sorted = [...this.worstPerInteraction.values()].sort((a, b) => b.duration - a.duration);
    const skip = Math.min(sorted.length - 1, Math.floor(sorted.length / 50));
    return sorted[skip];
  }
}
