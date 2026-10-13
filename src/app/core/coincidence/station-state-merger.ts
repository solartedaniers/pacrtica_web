import { ChannelIndex, SeismicConstants } from '../config/seismic-constants';
import { ChannelTransitionMessage, StationTransition } from '../protocol/control-messages';

export class StationStateMerger {
  private readonly activeChannels = new Int8Array(SeismicConstants.stationCount + 1);
  private readonly channelActive = new Uint8Array(SeismicConstants.channelCount);
  private readonly intervalPeak = new Float64Array(SeismicConstants.stationCount + 1);

  merge(transition: ChannelTransitionMessage): StationTransition | null {
    const stationId = ChannelIndex.stationOf(transition.channelIndex);
    const wasActive = this.channelActive[transition.channelIndex] === 1;
    if (transition.state === 'on') {
      if (wasActive) {
        return null;
      }
      this.channelActive[transition.channelIndex] = 1;
      this.activeChannels[stationId]++;
      if (this.activeChannels[stationId] === 1) {
        this.intervalPeak[stationId] = transition.peak;
        return this.stationTransition(stationId, 'on', transition);
      }
      return null;
    }
    if (!wasActive) {
      return null;
    }
    this.channelActive[transition.channelIndex] = 0;
    this.activeChannels[stationId]--;
    if (transition.peak > this.intervalPeak[stationId]) {
      this.intervalPeak[stationId] = transition.peak;
    }
    if (this.activeChannels[stationId] === 0) {
      return this.stationTransition(stationId, 'off', transition);
    }
    return null;
  }

  private stationTransition(
    stationId: number,
    state: 'on' | 'off',
    source: ChannelTransitionMessage,
  ): StationTransition {
    return {
      type: 'station-transition',
      stationId,
      state,
      timeUs: source.timeUs,
      peak: this.intervalPeak[stationId],
      ratio: source.ratio,
    };
  }
}
