import { GeneratorCommand } from '../protocol/control-messages';
import { SyntheticStreamGenerator } from '../generator/synthetic-stream-generator';
import { FrameBatchRouter } from './frame-batch-router';
import { FrameSource } from './frame-source';
import { IngestStatusWriter } from './ingest-status-writer';

export class SyntheticFrameSource implements FrameSource {
  private static readonly tickMs = 20;
  private readonly generator: SyntheticStreamGenerator;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastTickMs = 0;

  constructor(
    seed: number,
    private readonly router: FrameBatchRouter,
    private readonly status: IngestStatusWriter,
  ) {
    this.generator = new SyntheticStreamGenerator(seed, performance.timeOrigin + performance.now());
  }

  start(): void {
    this.lastTickMs = performance.now();
    this.schedule();
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  command(command: GeneratorCommand): void {
    this.generator.execute(command);
  }

  private schedule(): void {
    this.timer = setTimeout(this.tick, SyntheticFrameSource.tickMs);
  }

  private readonly tick = (): void => {
    const now = performance.now();
    this.generator.advance(now - this.lastTickMs, (frame) => this.router.routeFrame(frame));
    this.lastTickMs = now;
    this.router.flush();
    const faults = this.generator.faults.counters;
    this.status.write({
      mode: 0,
      connected: true,
      generatedTimeUs: this.generator.simulatedTimeUs,
      injectedDisorder: faults.disorder,
      injectedDuplicates: faults.duplicates,
      injectedLost: faults.lost,
      burstRemainingSeconds: this.generator.burstRemainingSeconds,
      quakes: this.generator.statistics.quakes,
      errors: 0,
      rateMultiplier: this.generator.rateMultiplier,
    });
    this.schedule();
  };
}
