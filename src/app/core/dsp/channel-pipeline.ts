import { SeismicConstants } from '../config/seismic-constants';
import { DetectorThresholds } from '../protocol/control-messages';
import { FrameFlags, SeismicFrame } from '../protocol/frame-codec';
import { ChannelStatusField, SharedMemoryViews } from '../memory/shared-memory-layout';
import { RingHistoryWriter } from '../memory/ring-history';
import { DcBlocker } from './dc-blocker';
import { FrameReorderBuffer, ReorderSink } from './frame-reorder-buffer';
import { SlidingMaxEnvelope } from './sliding-max-envelope';
import { StaLtaDetector } from './sta-lta-detector';

export interface ChannelTransition {
  readonly channelIndex: number;
  readonly state: 'on' | 'off';
  readonly timeUs: number;
  readonly peak: number;
  readonly ratio: number;
}

export interface ChannelTransitionListener {
  onChannelTransition(transition: ChannelTransition): void;
}

export class ChannelPipeline implements ReorderSink {
  readonly reorder: FrameReorderBuffer;
  private readonly dcBlocker = new DcBlocker(SeismicConstants.dcBlockerPole);
  private readonly detector: StaLtaDetector;
  private readonly envelope = new SlidingMaxEnvelope(SeismicConstants.envelopeWindowSamples);
  private readonly writer: RingHistoryWriter;
  private nextTimeUs: number | null = null;
  private lastTimeUs = Number.NaN;
  private lastProgressWallMs = 0;
  private intervalPeak = 0;
  private wasTriggered = false;

  constructor(
    readonly channelIndex: number,
    private readonly views: SharedMemoryViews,
    thresholds: DetectorThresholds,
    private readonly listener: ChannelTransitionListener,
  ) {
    this.writer = new RingHistoryWriter(views, channelIndex);
    this.detector = new StaLtaDetector(
      {
        staWindow: SeismicConstants.staWindowSamples,
        ltaWindow: SeismicConstants.ltaWindowSamples,
        minimumValidFraction: SeismicConstants.minimumValidFraction,
        maxTriggerSamples: SeismicConstants.maxTriggerSamples,
      },
      thresholds,
    );
    this.reorder = new FrameReorderBuffer(
      {
        windowMs: SeismicConstants.reorderWindowMs,
        maxDisorderPositions: SeismicConstants.maxDisorderPositions,
        heapCapacity: SeismicConstants.reorderHeapCapacity,
        duplicateMemoryFrames: SeismicConstants.duplicateMemoryFrames,
      },
      this,
    );
  }

  updateThresholds(thresholds: DetectorThresholds): void {
    this.detector.updateThresholds(thresholds);
  }

  get processedTimeUs(): number {
    return this.lastTimeUs;
  }

  get lastProgressMs(): number {
    return this.lastProgressWallMs;
  }

  deliver(frame: SeismicFrame): void {
    if (!this.writer.hasBase) {
      this.writer.publishBase(frame.t0Us);
    }
    const excludeFromDetection = (frame.flags & FrameFlags.calibration) !== 0;
    const count = SeismicConstants.samplesPerFrame;
    const period = SeismicConstants.samplePeriodUs;
    this.writer.beginBlock(count);
    for (let i = 0; i < count; i++) {
      const filtered = this.dcBlocker.process(frame.samples[i]);
      const detectorInput = excludeFromDetection ? Number.NaN : filtered;
      this.step(i, filtered, detectorInput, frame.t0Us + i * period);
    }
    this.writer.commitBlock(count);
    this.nextTimeUs = frame.t0Us + SeismicConstants.frameDurationUs;
    this.markProgress(frame.t0Us + (count - 1) * period);
  }

  skip(lostFrames: number): void {
    if (this.nextTimeUs === null) {
      return;
    }
    const count = SeismicConstants.samplesPerFrame;
    const period = SeismicConstants.samplePeriodUs;
    for (let f = 0; f < lostFrames; f++) {
      const t0: number = this.nextTimeUs;
      this.writer.beginBlock(count);
      for (let i = 0; i < count; i++) {
        this.dcBlocker.process(Number.NaN);
        this.step(i, Number.NaN, Number.NaN, t0 + i * period);
      }
      this.writer.commitBlock(count);
      this.nextTimeUs = t0 + SeismicConstants.frameDurationUs;
      this.markProgress(t0 + (count - 1) * period);
    }
  }

  publishStatus(): void {
    const c = this.channelIndex;
    const v = this.views;
    const counters = this.reorder.counters;
    v.setChannelStatus(c, ChannelStatusField.ratio, this.detector.ratio);
    v.setChannelStatus(c, ChannelStatusField.sta, this.detector.staMean);
    v.setChannelStatus(c, ChannelStatusField.lta, this.detector.ltaMean);
    v.setChannelStatus(c, ChannelStatusField.envelope, this.envelope.current);
    v.setChannelStatus(c, ChannelStatusField.triggered, this.detector.isTriggered ? 1 : 0);
    v.setChannelStatus(c, ChannelStatusField.ltaFrozen, this.detector.isTriggered ? 1 : 0);
    v.setChannelStatus(c, ChannelStatusField.lastTimeUs, this.lastTimeUs);
    v.setChannelStatus(c, ChannelStatusField.maxRelativeDrift, this.detector.maxRelativeDrift);
    v.setChannelStatus(c, ChannelStatusField.negativeCorrections, this.detector.negativeCorrections);
    v.setChannelStatus(c, ChannelStatusField.recomputations, this.detector.recomputations);
    v.setChannelStatus(c, ChannelStatusField.framesDelivered, counters.delivered);
    v.setChannelStatus(c, ChannelStatusField.duplicates, counters.duplicates);
    v.setChannelStatus(c, ChannelStatusField.lateDiscarded, counters.lateDiscarded);
    v.setChannelStatus(c, ChannelStatusField.lostFrames, counters.lostFrames);
    v.setChannelStatus(c, ChannelStatusField.pendingFrames, this.reorder.pendingFrames);
    v.setChannelStatus(c, ChannelStatusField.outOfOrder, counters.outOfOrder);
  }

  private step(offset: number, filtered: number, detectorInput: number, timeUs: number): void {
    const triggered = this.detector.process(detectorInput);
    const envelopeValue = this.envelope.push(filtered);
    this.writer.write(offset, filtered, envelopeValue);
    if (triggered) {
      if (!this.wasTriggered) {
        this.intervalPeak = envelopeValue;
        this.listener.onChannelTransition({
          channelIndex: this.channelIndex,
          state: 'on',
          timeUs,
          peak: envelopeValue,
          ratio: this.detector.ratio,
        });
      } else if (envelopeValue > this.intervalPeak) {
        this.intervalPeak = envelopeValue;
      }
    } else if (this.wasTriggered) {
      this.listener.onChannelTransition({
        channelIndex: this.channelIndex,
        state: 'off',
        timeUs,
        peak: this.intervalPeak,
        ratio: this.detector.ratio,
      });
    }
    this.wasTriggered = triggered;
  }

  private markProgress(timeUs: number): void {
    this.lastTimeUs = timeUs;
    this.lastProgressWallMs = performance.now();
  }
}
