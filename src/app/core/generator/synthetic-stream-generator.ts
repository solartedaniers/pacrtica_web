import { SeismicConstants } from '../config/seismic-constants';
import { StationNetwork } from '../config/station-network';
import { GeneratorCommand } from '../protocol/control-messages';
import { SeismicFrame } from '../protocol/frame-codec';
import { LinkFaultInjector } from './link-fault-injector';
import { SeededRandom } from './seeded-random';
import { LocalDisturbance, SeismicSource, VolcanicQuake } from './seismic-sources';

export const ActivityRates = {
  quakesPerSecondCalm: 1 / 100,
  quakesPerSecondBurst: 1 / 9,
  localDisturbancesPerSecond: 1 / 140,
} as const;

export class GeneratorStatistics {
  quakes = 0;
  localDisturbances = 0;
  framesGenerated = 0;
}

export class SyntheticStreamGenerator {
  readonly statistics = new GeneratorStatistics();
  readonly faults: LinkFaultInjector;
  private readonly random: SeededRandom;
  private readonly startUs: number;
  private readonly noiseState: Float64Array;
  private readonly noiseScale: Float64Array;
  private readonly dcOffset: Float64Array;
  private readonly microseismPhase: Float64Array;
  private readonly sources: SeismicSource[] = [];
  private readonly urbanStations: number[];
  private simulatedUs: number;
  private nextFrameIndex = 0;
  private burstRemainingUs = 0;

  constructor(seed: number, wallClockMs: number) {
    const channels = SeismicConstants.channelCount;
    this.random = new SeededRandom(seed);
    this.faults = new LinkFaultInjector(new SeededRandom(seed ^ 0x5bd1e995));
    this.startUs = Math.floor((wallClockMs * 1000) / SeismicConstants.frameDurationUs) * SeismicConstants.frameDurationUs;
    this.simulatedUs = this.startUs;
    this.noiseState = new Float64Array(channels);
    this.noiseScale = new Float64Array(channels).map(() => this.random.between(48, 72));
    this.dcOffset = new Float64Array(channels).map(() => this.random.between(-3000, 3000));
    this.microseismPhase = new Float64Array(channels).map(() => this.random.between(0, Math.PI * 2));
    this.urbanStations = StationNetwork.filter((s) => s.zone === 'urban').map((s) => s.id);
  }

  get simulatedTimeUs(): number {
    return this.simulatedUs;
  }

  get rateMultiplier(): number {
    return this.burstRemainingUs > 0 ? SeismicConstants.burstRateMultiplier : 1;
  }

  get burstRemainingSeconds(): number {
    return this.burstRemainingUs / 1_000_000;
  }

  execute(command: GeneratorCommand): void {
    switch (command.type) {
      case 'faults':
        this.faults.configure(command.faults);
        break;
      case 'burst':
        this.burstRemainingUs = Math.max(0, command.durationSeconds) * 1_000_000;
        break;
      case 'inject-quake':
        this.addQuake(command.magnitude, this.simulatedUs + 500_000);
        break;
      case 'inject-local-noise':
        this.addLocalDisturbance(this.simulatedUs + 300_000);
        break;
    }
  }

  advance(elapsedWallMs: number, emit: (frame: SeismicFrame) => void): void {
    const wallUs = Math.min(elapsedWallMs, 1000) * 1000;
    const multiplier = this.rateMultiplier;
    this.simulatedUs += wallUs * multiplier;
    if (this.burstRemainingUs > 0) {
      this.burstRemainingUs = Math.max(0, this.burstRemainingUs - wallUs);
    }
    for (;;) {
      const frameStartUs = this.startUs + this.nextFrameIndex * SeismicConstants.frameDurationUs;
      if (frameStartUs + SeismicConstants.frameDurationUs > this.simulatedUs) {
        return;
      }
      this.scheduleSpontaneousActivity(frameStartUs, multiplier > 1);
      this.faults.beginStep();
      for (let channel = 0; channel < SeismicConstants.channelCount; channel++) {
        const frame = this.synthesizeFrame(channel, frameStartUs, this.nextFrameIndex);
        this.statistics.framesGenerated++;
        this.faults.transmit(channel, frame, emit);
      }
      for (let i = this.sources.length - 1; i >= 0; i--) {
        this.sources[i].retire(frameStartUs);
        if (this.sources[i].finished) {
          this.sources.splice(i, 1);
        }
      }
      this.nextFrameIndex++;
    }
  }

  private scheduleSpontaneousActivity(frameStartUs: number, burst: boolean): void {
    const frameSeconds = SeismicConstants.frameDurationUs / 1_000_000;
    const quakeRate = burst ? ActivityRates.quakesPerSecondBurst : ActivityRates.quakesPerSecondCalm;
    if (this.random.chance(quakeRate * frameSeconds)) {
      this.addQuake(this.random.between(1.6, burst ? 3.2 : 2.6), frameStartUs + this.random.between(0, 250_000));
    }
    if (this.random.chance(ActivityRates.localDisturbancesPerSecond * frameSeconds)) {
      this.addLocalDisturbance(frameStartUs);
    }
  }

  private addQuake(magnitude: number, originUs: number): void {
    const kind = this.random.chance(0.3) ? 'long-period' : 'volcano-tectonic';
    this.sources.push(new VolcanicQuake(originUs, magnitude, kind, this.random));
    this.statistics.quakes++;
  }

  private addLocalDisturbance(startUs: number): void {
    const stationId = this.urbanStations[this.random.integerBetween(0, this.urbanStations.length - 1)];
    this.sources.push(new LocalDisturbance(startUs, stationId, this.random));
    this.statistics.localDisturbances++;
  }

  private synthesizeFrame(channel: number, frameStartUs: number, seq: number): SeismicFrame {
    const stationId = Math.floor(channel / SeismicConstants.channelsPerStation) + 1;
    const component = channel % SeismicConstants.channelsPerStation;
    const samples = new Int32Array(SeismicConstants.samplesPerFrame);
    const period = SeismicConstants.samplePeriodUs;
    const scale = this.noiseScale[channel];
    const offset = this.dcOffset[channel];
    const phase = this.microseismPhase[channel];
    let noise = this.noiseState[channel];
    for (let i = 0; i < samples.length; i++) {
      const timeUs = frameStartUs + i * period;
      noise = 0.85 * noise + scale * this.random.gaussian();
      const microseism = 35 * Math.sin(2 * Math.PI * 0.18 * ((timeUs - this.startUs) / 1_000_000) + phase);
      let value = offset + noise + microseism;
      for (let s = 0; s < this.sources.length; s++) {
        value += this.sources[s].contribution(channel, timeUs);
      }
      samples[i] = Math.round(value);
    }
    this.noiseState[channel] = noise;
    return {
      stationId,
      channel: component,
      flags: 0,
      seq,
      t0Us: frameStartUs + this.faults.clockOffsetUs(stationId),
      samples,
    };
  }
}
