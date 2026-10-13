import { Injectable, computed, signal } from '@angular/core';
import { CoincidenceToMain, SeismicEventSnapshot, StationTransition } from '../core/protocol/control-messages';

export interface TransitionLogEntry {
  readonly key: number;
  readonly stationId: number;
  readonly state: 'on' | 'off';
  readonly timeUs: number;
  readonly peak: number;
  readonly ratio: number;
}

@Injectable({ providedIn: 'root' })
export class ConsoleEventStore {
  private static readonly maxTransitions = 80;
  private static readonly maxEvents = 40;
  private readonly pendingEvents = new Map<number, SeismicEventSnapshot>();
  private readonly pendingTransitions: TransitionLogEntry[] = [];
  private readonly activeStations = new Set<number>();
  private transitionKey = 0;

  readonly events = signal<readonly SeismicEventSnapshot[]>([]);
  readonly transitions = signal<readonly TransitionLogEntry[]>([]);
  readonly triggeredStations = signal<readonly number[]>([]);
  readonly totalTransitions = signal(0);
  readonly activeEvent = computed(() => this.events().find((event) => !event.closed) ?? null);
  readonly latestEvent = computed(() => this.events()[0] ?? null);

  accept(message: CoincidenceToMain): void {
    if (message.type === 'event') {
      this.pendingEvents.set(message.event.id, message.event);
      return;
    }
    this.recordTransition(message);
  }

  flush(): void {
    if (this.pendingEvents.size > 0) {
      const merged = new Map(this.events().map((event) => [event.id, event]));
      for (const [id, event] of this.pendingEvents) {
        merged.set(id, event);
      }
      this.pendingEvents.clear();
      this.events.set(
        [...merged.values()].sort((a, b) => b.id - a.id).slice(0, ConsoleEventStore.maxEvents),
      );
    }
    if (this.pendingTransitions.length > 0) {
      const combined = [...this.pendingTransitions.reverse(), ...this.transitions()];
      this.pendingTransitions.length = 0;
      this.transitions.set(combined.slice(0, ConsoleEventStore.maxTransitions));
      this.totalTransitions.set(this.transitionKey);
      this.triggeredStations.set([...this.activeStations].sort((a, b) => a - b));
    }
  }

  private recordTransition(transition: StationTransition): void {
    if (transition.state === 'on') {
      this.activeStations.add(transition.stationId);
    } else {
      this.activeStations.delete(transition.stationId);
    }
    this.pendingTransitions.push({
      key: ++this.transitionKey,
      stationId: transition.stationId,
      state: transition.state,
      timeUs: transition.timeUs,
      peak: transition.peak,
      ratio: transition.ratio,
    });
    if (this.pendingTransitions.length > ConsoleEventStore.maxTransitions) {
      this.pendingTransitions.shift();
    }
  }
}
