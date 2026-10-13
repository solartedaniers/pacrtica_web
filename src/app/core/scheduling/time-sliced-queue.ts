import { MacrotaskScheduler } from './macrotask-scheduler';

export class TimeSlicedQueue<T> {
  private items: T[] = [];
  private head = 0;
  private scheduled = false;
  private peakBacklog = 0;
  private sliceCount = 0;
  private readonly enqueuedAt: number[] = [];

  constructor(
    private readonly budgetMs: number,
    private readonly handler: (item: T) => void,
    private readonly scheduler: MacrotaskScheduler,
    private readonly afterSlice: () => void = () => undefined,
  ) {}

  get backlog(): number {
    return this.items.length - this.head;
  }

  get maxBacklog(): number {
    return this.peakBacklog;
  }

  get slices(): number {
    return this.sliceCount;
  }

  get oldestAgeMs(): number {
    return this.backlog > 0 ? performance.now() - this.enqueuedAt[this.head] : 0;
  }

  enqueue(item: T): void {
    this.items.push(item);
    this.enqueuedAt.push(performance.now());
    const backlog = this.backlog;
    if (backlog > this.peakBacklog) {
      this.peakBacklog = backlog;
    }
    if (!this.scheduled) {
      this.scheduled = true;
      this.scheduler.schedule(this.drain);
    }
  }

  resetPeak(): void {
    this.peakBacklog = this.backlog;
  }

  private readonly drain = (): void => {
    this.scheduled = false;
    this.sliceCount++;
    const start = performance.now();
    while (this.head < this.items.length) {
      this.handler(this.items[this.head]);
      this.head++;
      if (performance.now() - start >= this.budgetMs) {
        break;
      }
    }
    if (this.head === this.items.length) {
      this.items = [];
      this.enqueuedAt.length = 0;
      this.head = 0;
    } else if (this.head > 512) {
      this.items = this.items.slice(this.head);
      this.enqueuedAt.splice(0, this.head);
      this.head = 0;
    }
    this.afterSlice();
    if (this.head < this.items.length) {
      this.scheduled = true;
      this.scheduler.schedule(this.drain);
    }
  };
}
