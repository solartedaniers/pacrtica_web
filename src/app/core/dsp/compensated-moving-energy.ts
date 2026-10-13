export class NeumaierAccumulator {
  private sum = 0;
  private compensation = 0;

  add(value: number): void {
    const total = this.sum + value;
    if (Math.abs(this.sum) >= Math.abs(value)) {
      this.compensation += this.sum - total + value;
    } else {
      this.compensation += value - total + this.sum;
    }
    this.sum = total;
  }

  get value(): number {
    return this.sum + this.compensation;
  }

  reset(value = 0): void {
    this.sum = value;
    this.compensation = 0;
  }
}

export class CompensatedMovingEnergy {
  private readonly ring: Float64Array;
  private readonly accumulator = new NeumaierAccumulator();
  private head = 0;
  private filled = 0;
  private valid = 0;
  private sinceRecompute = 0;
  private maxDrift = 0;
  private negativeCorrectionCount = 0;
  private recomputeCount = 0;

  constructor(
    readonly window: number,
    private readonly recomputeInterval: number = window,
  ) {
    this.ring = new Float64Array(window);
  }

  push(energy: number): void {
    if (this.filled === this.window) {
      const outgoing = this.ring[this.head];
      if (outgoing === outgoing) {
        this.accumulator.add(-outgoing);
        this.valid--;
      }
    } else {
      this.filled++;
    }
    this.ring[this.head] = energy;
    this.head = this.head + 1 === this.window ? 0 : this.head + 1;
    if (energy === energy) {
      this.accumulator.add(energy);
      this.valid++;
    }
    this.sinceRecompute++;
    if (this.accumulator.value < 0) {
      this.negativeCorrectionCount++;
      this.recompute();
    } else if (this.sinceRecompute >= this.recomputeInterval) {
      this.recompute();
    }
  }

  get validCount(): number {
    return this.valid;
  }

  get validFraction(): number {
    return this.valid / this.window;
  }

  get mean(): number {
    return this.valid > 0 ? Math.max(0, this.accumulator.value) / this.valid : Number.NaN;
  }

  get maxRelativeDrift(): number {
    return this.maxDrift;
  }

  get negativeCorrections(): number {
    return this.negativeCorrectionCount;
  }

  get recomputations(): number {
    return this.recomputeCount;
  }

  recompute(): void {
    const exact = new NeumaierAccumulator();
    let count = 0;
    for (let i = 0; i < this.filled; i++) {
      const value = this.ring[i];
      if (value === value) {
        exact.add(value);
        count++;
      }
    }
    const reference = exact.value;
    const running = this.accumulator.value;
    if (reference > 0) {
      const drift = Math.abs(running - reference) / reference;
      if (drift > this.maxDrift) {
        this.maxDrift = drift;
      }
    }
    this.accumulator.reset(reference);
    this.valid = count;
    this.sinceRecompute = 0;
    this.recomputeCount++;
  }
}
