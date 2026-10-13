import { SeismicConstants } from '../config/seismic-constants';
import { FaultSettings } from '../protocol/control-messages';
import { SeismicFrame } from '../protocol/frame-codec';
import { SeededRandom } from './seeded-random';

export const FieldFaultRates = {
  disorderProbability: 0.04,
  duplicateProbability: 0.008,
  lossBurstStartProbability: 0.004,
  lossBurstMin: 1,
  lossBurstMax: 12,
  maxClockDriftMs: 40,
} as const;

interface HeldFrame {
  readonly frame: SeismicFrame;
  readonly releaseAtPosition: number;
}

export class FaultCounters {
  disorder = 0;
  duplicates = 0;
  lost = 0;
}

export class LinkFaultInjector {
  readonly counters = new FaultCounters();
  private readonly held: HeldFrame[][];
  private readonly lossRemaining: Int32Array;
  private readonly driftUs: Float64Array;
  private settings: FaultSettings = { disorder: true, duplicates: true, losses: false, clockDrift: true };

  constructor(private readonly random: SeededRandom) {
    this.held = Array.from({ length: SeismicConstants.channelCount }, () => []);
    this.lossRemaining = new Int32Array(SeismicConstants.stationCount + 1);
    this.driftUs = new Float64Array(SeismicConstants.stationCount + 1);
    const halfSpreadUs = (FieldFaultRates.maxClockDriftMs / 2) * 1000;
    for (let s = 1; s <= SeismicConstants.stationCount; s++) {
      this.driftUs[s] = random.between(-halfSpreadUs, halfSpreadUs);
    }
  }

  configure(settings: FaultSettings): void {
    this.settings = settings;
  }

  get currentSettings(): FaultSettings {
    return this.settings;
  }

  clockOffsetUs(stationId: number): number {
    return this.settings.clockDrift ? this.driftUs[stationId] : 0;
  }

  beginStep(): void {
    if (!this.settings.losses) {
      this.lossRemaining.fill(0);
      return;
    }
    for (let s = 1; s <= SeismicConstants.stationCount; s++) {
      if (this.lossRemaining[s] > 0) {
        this.lossRemaining[s]--;
      } else if (this.random.chance(FieldFaultRates.lossBurstStartProbability)) {
        this.lossRemaining[s] = this.random.integerBetween(FieldFaultRates.lossBurstMin, FieldFaultRates.lossBurstMax);
      }
    }
  }

  transmit(channelIndex: number, frame: SeismicFrame, emit: (frame: SeismicFrame) => void): void {
    const position = frame.seq;
    const queue = this.held[channelIndex];
    const lost = this.lossRemaining[frame.stationId] > 0;
    if (lost) {
      this.counters.lost++;
    } else if (this.settings.disorder && this.random.chance(FieldFaultRates.disorderProbability)) {
      this.counters.disorder++;
      queue.push({ frame, releaseAtPosition: position + this.random.integerBetween(1, SeismicConstants.maxDisorderPositions) });
    } else {
      emit(frame);
    }
    if (!lost && this.settings.duplicates && this.random.chance(FieldFaultRates.duplicateProbability)) {
      this.counters.duplicates++;
      queue.push({ frame, releaseAtPosition: position + this.random.integerBetween(0, 1) });
    }
    for (let i = 0; i < queue.length; ) {
      if (queue[i].releaseAtPosition <= position) {
        emit(queue[i].frame);
        queue.splice(i, 1);
      } else {
        i++;
      }
    }
  }
}
