import { SeismicConstants } from '../config/seismic-constants';
import { StationDescriptor, StationNetwork } from '../config/station-network';
import { SeededRandom } from './seeded-random';

export interface SeismicSource {
  readonly finished: boolean;
  contribution(channelIndex: number, timeUs: number): number;
  retire(nowUs: number): void;
}

const componentWeights = {
  p: [0.45, 0.45, 1.0],
  s: [1.0, 0.9, 0.55],
} as const;

export type QuakeKind = 'volcano-tectonic' | 'long-period';

export class VolcanicQuake implements SeismicSource {
  private readonly pArrival: Float64Array;
  private readonly sArrival: Float64Array;
  private readonly amplitude: Float64Array;
  private readonly carrier: Float64Array;
  private readonly phase: Float64Array;
  private readonly decayUs: number;
  private readonly endUs: number;
  private readonly frequencyHz: number;
  private done = false;

  constructor(
    originUs: number,
    readonly magnitude: number,
    readonly kind: QuakeKind,
    private readonly random: SeededRandom,
  ) {
    const channels = SeismicConstants.channelCount;
    this.pArrival = new Float64Array(SeismicConstants.stationCount + 1);
    this.sArrival = new Float64Array(SeismicConstants.stationCount + 1);
    this.amplitude = new Float64Array(SeismicConstants.stationCount + 1);
    this.carrier = new Float64Array(channels);
    this.phase = new Float64Array(channels).map(() => random.between(0, Math.PI * 2));
    const epicenterEast = random.between(-1.8, 1.8);
    const epicenterNorth = random.between(-1.8, 1.8);
    const depthKm = kind === 'long-period' ? random.between(0.5, 2) : random.between(1.5, 6);
    const vp = 3.5;
    const vs = 2.0;
    this.decayUs = (1.4 + magnitude * (kind === 'long-period' ? 2.2 : 1.2)) * 1_000_000;
    this.frequencyHz = kind === 'long-period' ? random.between(1.2, 2.8) : 0;
    let latestS = originUs;
    for (const station of StationNetwork) {
      const distance = VolcanicQuake.hypocentralDistance(station, epicenterEast, epicenterNorth, depthKm);
      this.pArrival[station.id] = originUs + (distance / vp) * 1_000_000;
      this.sArrival[station.id] = originUs + (distance / vs) * 1_000_000;
      this.amplitude[station.id] = (220 * Math.pow(10, magnitude - 1)) / Math.pow(Math.max(0.8, distance / 1.5), 1.3);
      latestS = Math.max(latestS, this.sArrival[station.id]);
    }
    this.endUs = latestS + this.decayUs * 7;
  }

  private static hypocentralDistance(station: StationDescriptor, east: number, north: number, depth: number): number {
    const de = station.eastKm - east;
    const dn = station.northKm - north;
    return Math.sqrt(de * de + dn * dn + depth * depth);
  }

  get finished(): boolean {
    return this.done;
  }

  retire(nowUs: number): void {
    if (nowUs > this.endUs) {
      this.done = true;
    }
  }

  contribution(channelIndex: number, timeUs: number): number {
    const stationId = Math.floor(channelIndex / SeismicConstants.channelsPerStation) + 1;
    const component = channelIndex % SeismicConstants.channelsPerStation;
    const tp = this.pArrival[stationId];
    if (timeUs < tp) {
      return 0;
    }
    const amplitude = this.amplitude[stationId];
    const ts = this.sArrival[stationId];
    const sincePUs = timeUs - tp;
    let envelope = 0.35 * componentWeights.p[component] * VolcanicQuake.shape(sincePUs, this.decayUs * 0.6);
    if (timeUs >= ts) {
      envelope += componentWeights.s[component] * VolcanicQuake.shape(timeUs - ts, this.decayUs);
    }
    this.carrier[channelIndex] = 0.72 * this.carrier[channelIndex] + this.random.gaussian();
    let wave = this.carrier[channelIndex] * 0.55;
    if (this.kind === 'long-period') {
      const seconds = sincePUs / 1_000_000;
      wave = Math.sin(2 * Math.PI * this.frequencyHz * seconds + this.phase[channelIndex]) * (0.8 + 0.2 * this.carrier[channelIndex]);
    }
    return amplitude * envelope * wave;
  }

  private static shape(elapsedUs: number, decayUs: number): number {
    const rise = Math.min(1, elapsedUs / 250_000);
    return rise * Math.exp(-elapsedUs / decayUs);
  }
}

export class LocalDisturbance implements SeismicSource {
  private readonly startUs: number;
  private readonly durationUs: number;
  private readonly amplitude: number;
  private readonly carrier = new Float64Array(SeismicConstants.channelsPerStation);
  private done = false;

  constructor(
    startUs: number,
    readonly stationId: number,
    private readonly random: SeededRandom,
  ) {
    this.startUs = startUs;
    this.durationUs = random.between(4, 7) * 1_000_000;
    this.amplitude = random.between(1600, 2600);
  }

  get finished(): boolean {
    return this.done;
  }

  retire(nowUs: number): void {
    if (nowUs > this.startUs + this.durationUs) {
      this.done = true;
    }
  }

  contribution(channelIndex: number, timeUs: number): number {
    const stationId = Math.floor(channelIndex / SeismicConstants.channelsPerStation) + 1;
    if (stationId !== this.stationId || timeUs < this.startUs || timeUs > this.startUs + this.durationUs) {
      return 0;
    }
    const component = channelIndex % SeismicConstants.channelsPerStation;
    const progress = (timeUs - this.startUs) / this.durationUs;
    const envelope = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
    this.carrier[component] = 0.5 * this.carrier[component] + this.random.gaussian();
    return this.amplitude * envelope * this.carrier[component] * 0.6;
  }
}
