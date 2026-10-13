export const SeismicConstants = {
  stationCount: 9,
  channelsPerStation: 3,
  channelCount: 27,
  sampleRateHz: 200,
  samplePeriodUs: 5000,
  samplesPerFrame: 50,
  frameDurationUs: 250_000,
  frameByteLength: 216,
  historySeconds: 600,
  historyCapacity: 120_000,
  staWindowSamples: 200,
  ltaWindowSamples: 6000,
  envelopeWindowSamples: 1000,
  defaultTriggerOnRatio: 4.0,
  defaultTriggerOffRatio: 1.5,
  minimumValidFraction: 0.5,
  maxTriggerSamples: 24_000,
  reorderWindowMs: 750,
  maxDisorderPositions: 3,
  reorderHeapCapacity: 64,
  duplicateMemoryFrames: 512,
  coincidenceStations: 4,
  coincidenceWindowUs: 6_000_000,
  exportHalfWindowUs: 90_000_000,
  dcBlockerPole: 0.995,
  burstRateMultiplier: 4,
} as const;

export class ChannelIndex {
  static of(stationId: number, channel: number): number {
    return (stationId - 1) * SeismicConstants.channelsPerStation + channel;
  }

  static stationOf(channelIndex: number): number {
    return Math.floor(channelIndex / SeismicConstants.channelsPerStation) + 1;
  }

  static componentOf(channelIndex: number): number {
    return channelIndex % SeismicConstants.channelsPerStation;
  }
}
