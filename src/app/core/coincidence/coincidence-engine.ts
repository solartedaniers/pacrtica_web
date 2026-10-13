import { SeismicConstants } from '../config/seismic-constants';
import { SeismicEventSnapshot, StationTransition } from '../protocol/control-messages';

export interface CoincidenceRules {
  readonly requiredStations: number;
  readonly windowUs: number;
}

interface ClosedInterval {
  readonly stationId: number;
  readonly endUs: number;
}

class MutableSeismicEvent {
  readonly stations = new Set<number>();
  peak = 0;
  endUs: number | null = null;
  closed = false;

  constructor(
    readonly id: number,
    readonly firstTriggerUs: number,
    readonly confirmedAtUs: number,
  ) {}

  snapshot(): SeismicEventSnapshot {
    return {
      id: this.id,
      firstTriggerUs: this.firstTriggerUs,
      confirmedAtUs: this.confirmedAtUs,
      endUs: this.endUs,
      stations: [...this.stations].sort((a, b) => a - b),
      peak: this.peak,
      closed: this.closed,
    };
  }
}

export class CoincidenceEngine {
  private readonly slots = SeismicConstants.stationCount + 1;
  private readonly openSince = new Float64Array(this.slots).fill(Number.NaN);
  private readonly intervalStart = new Float64Array(this.slots).fill(Number.NaN);
  private readonly lastEnd = new Float64Array(this.slots).fill(Number.NEGATIVE_INFINITY);
  private readonly latestPeak = new Float64Array(this.slots);
  private readonly member = new Uint8Array(this.slots);
  private readonly closedQueue: ClosedInterval[] = [];
  private queueHead = 0;
  private memberCount = 0;
  private activeEvent: MutableSeismicEvent | null = null;
  private nextEventId = 1;

  constructor(
    private readonly rules: CoincidenceRules,
    private readonly publish: (event: SeismicEventSnapshot) => void,
  ) {}

  get stationsInWindow(): number {
    return this.memberCount;
  }

  apply(transition: StationTransition): void {
    const s = transition.stationId;
    this.expire(transition.timeUs);
    if (transition.state === 'on') {
      this.openSince[s] = transition.timeUs;
      this.intervalStart[s] = transition.timeUs;
      this.latestPeak[s] = transition.peak;
      if (this.member[s] === 0) {
        this.member[s] = 1;
        this.memberCount++;
      }
      this.onStationEntered(s, transition.timeUs);
    } else {
      this.openSince[s] = Number.NaN;
      this.lastEnd[s] = transition.timeUs;
      this.latestPeak[s] = transition.peak;
      this.closedQueue.push({ stationId: s, endUs: transition.timeUs });
      this.onStationPeak(s, transition.peak);
    }
    this.closeIfFinished();
  }

  advanceTo(watermarkUs: number): void {
    if (!Number.isFinite(watermarkUs)) {
      return;
    }
    this.expire(watermarkUs);
    this.closeIfFinished();
  }

  private expire(nowUs: number): void {
    const limit = nowUs - this.rules.windowUs;
    while (this.queueHead < this.closedQueue.length) {
      const front = this.closedQueue[this.queueHead];
      if (front.endUs >= limit) {
        break;
      }
      this.queueHead++;
      const s = front.stationId;
      if (this.member[s] === 1 && Number.isNaN(this.openSince[s]) && this.lastEnd[s] === front.endUs) {
        this.member[s] = 0;
        this.memberCount--;
      }
    }
    if (this.queueHead > 1024 && this.queueHead * 2 > this.closedQueue.length) {
      this.closedQueue.splice(0, this.queueHead);
      this.queueHead = 0;
    }
  }

  private onStationEntered(stationId: number, timeUs: number): void {
    const event = this.activeEvent;
    if (event !== null) {
      if (!event.stations.has(stationId)) {
        event.stations.add(stationId);
        event.peak = Math.max(event.peak, this.latestPeak[stationId]);
        this.publish(event.snapshot());
      }
      return;
    }
    if (this.memberCount < this.rules.requiredStations) {
      return;
    }
    let firstTrigger = timeUs;
    for (let s = 1; s < this.slots; s++) {
      if (this.member[s] === 1 && this.intervalStart[s] < firstTrigger) {
        firstTrigger = this.intervalStart[s];
      }
    }
    const created = new MutableSeismicEvent(this.nextEventId++, firstTrigger, timeUs);
    for (let s = 1; s < this.slots; s++) {
      if (this.member[s] === 1) {
        created.stations.add(s);
        created.peak = Math.max(created.peak, this.latestPeak[s]);
      }
    }
    this.activeEvent = created;
    this.publish(created.snapshot());
  }

  private onStationPeak(stationId: number, peak: number): void {
    const event = this.activeEvent;
    if (event !== null && event.stations.has(stationId) && peak > event.peak) {
      event.peak = peak;
      this.publish(event.snapshot());
    }
  }

  private closeIfFinished(): void {
    const event = this.activeEvent;
    if (event === null || this.memberCount >= this.rules.requiredStations) {
      return;
    }
    let endUs = event.confirmedAtUs;
    for (const s of event.stations) {
      if (!Number.isNaN(this.openSince[s])) {
        return;
      }
      if (this.lastEnd[s] > endUs) {
        endUs = this.lastEnd[s];
      }
    }
    event.endUs = endUs;
    event.closed = true;
    this.activeEvent = null;
    this.publish(event.snapshot());
  }
}
