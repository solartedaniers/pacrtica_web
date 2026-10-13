import { DetectorThresholds } from '../protocol/control-messages';
import { CompensatedMovingEnergy } from './compensated-moving-energy';

export interface StaLtaConfig {
  readonly staWindow: number;
  readonly ltaWindow: number;
  readonly minimumValidFraction: number;
  readonly maxTriggerSamples: number;
}

export class StaLtaDetector {
  private readonly sta: CompensatedMovingEnergy;
  private readonly lta: CompensatedMovingEnergy;
  private triggered = false;
  private lastRatio = 0;
  private triggeredSamples = 0;

  constructor(
    private readonly config: StaLtaConfig,
    private thresholds: DetectorThresholds,
  ) {
    this.sta = new CompensatedMovingEnergy(config.staWindow);
    this.lta = new CompensatedMovingEnergy(config.ltaWindow);
  }

  updateThresholds(thresholds: DetectorThresholds): void {
    this.thresholds = thresholds;
  }

  process(sample: number): boolean {
    const energy = sample * sample;
    this.sta.push(energy);
    if (!this.triggered) {
      this.lta.push(energy);
    }
    if (
      this.sta.validFraction < this.config.minimumValidFraction ||
      this.lta.validFraction < this.config.minimumValidFraction
    ) {
      return this.triggered;
    }
    const ltaMean = this.lta.mean;
    if (!(ltaMean > 0)) {
      return this.triggered;
    }
    const ratio = this.sta.mean / ltaMean;
    this.lastRatio = ratio;
    if (!this.triggered && ratio >= this.thresholds.onRatio) {
      this.triggered = true;
      this.triggeredSamples = 0;
    } else if (this.triggered) {
      this.triggeredSamples++;
      if (ratio <= this.thresholds.offRatio || this.triggeredSamples >= this.config.maxTriggerSamples) {
        this.triggered = false;
      }
    }
    return this.triggered;
  }

  get isTriggered(): boolean {
    return this.triggered;
  }

  get ratio(): number {
    return this.lastRatio;
  }

  get staMean(): number {
    return this.sta.mean;
  }

  get ltaMean(): number {
    return this.lta.mean;
  }

  get maxRelativeDrift(): number {
    return Math.max(this.sta.maxRelativeDrift, this.lta.maxRelativeDrift);
  }

  get negativeCorrections(): number {
    return this.sta.negativeCorrections + this.lta.negativeCorrections;
  }

  get recomputations(): number {
    return this.sta.recomputations + this.lta.recomputations;
  }
}
