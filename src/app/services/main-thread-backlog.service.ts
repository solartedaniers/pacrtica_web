import { Injectable, inject } from '@angular/core';
import { CoincidenceToMain } from '../core/protocol/control-messages';
import { MacrotaskScheduler } from '../core/scheduling/macrotask-scheduler';
import { TimeSlicedQueue } from '../core/scheduling/time-sliced-queue';
import { ConsoleEventStore } from './console-event-store.service';

@Injectable({ providedIn: 'root' })
export class MainThreadBacklogService {
  private static readonly sliceBudgetMs = 4;
  private readonly store = inject(ConsoleEventStore);
  private readonly scheduler = new MacrotaskScheduler('user-visible');
  private readonly queue = new TimeSlicedQueue<CoincidenceToMain>(
    MainThreadBacklogService.sliceBudgetMs,
    (message) => this.store.accept(message),
    this.scheduler,
    () => this.store.flush(),
  );

  get backlog(): number {
    return this.queue.backlog;
  }

  get maxBacklog(): number {
    return this.queue.maxBacklog;
  }

  get slices(): number {
    return this.queue.slices;
  }

  get strategy(): string {
    return this.scheduler.strategy;
  }

  enqueue(message: CoincidenceToMain): void {
    this.queue.enqueue(message);
  }

  resetPeak(): void {
    this.queue.resetPeak();
  }
}
