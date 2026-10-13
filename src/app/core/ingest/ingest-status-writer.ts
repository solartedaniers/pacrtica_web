import { GlobalStatusField, SharedMemoryViews } from '../memory/shared-memory-layout';
import { FrameBatchRouter } from './frame-batch-router';

export interface SourceSnapshot {
  readonly mode: number;
  readonly connected: boolean;
  readonly generatedTimeUs: number;
  readonly injectedDisorder: number;
  readonly injectedDuplicates: number;
  readonly injectedLost: number;
  readonly burstRemainingSeconds: number;
  readonly quakes: number;
  readonly errors: number;
  readonly rateMultiplier: number;
}

export class IngestStatusWriter {
  constructor(
    private readonly views: SharedMemoryViews,
    private readonly router: FrameBatchRouter,
  ) {}

  write(snapshot: SourceSnapshot): void {
    const g = this.views.globalStatus;
    g[GlobalStatusField.framesReceived] = this.router.framesRouted;
    g[GlobalStatusField.bytesReceived] = this.router.bytesRouted;
    g[GlobalStatusField.generatedTimeUs] = snapshot.generatedTimeUs;
    g[GlobalStatusField.injectedDisorder] = snapshot.injectedDisorder;
    g[GlobalStatusField.injectedDuplicates] = snapshot.injectedDuplicates;
    g[GlobalStatusField.injectedLost] = snapshot.injectedLost;
    g[GlobalStatusField.burstRemainingSeconds] = snapshot.burstRemainingSeconds;
    g[GlobalStatusField.sourceMode] = snapshot.mode;
    g[GlobalStatusField.sourceConnected] = snapshot.connected ? 1 : 0;
    g[GlobalStatusField.quakesInjected] = snapshot.quakes;
    g[GlobalStatusField.sourceErrors] = snapshot.errors + this.router.framesRejected;
    g[GlobalStatusField.rateMultiplier] = snapshot.rateMultiplier;
  }
}
