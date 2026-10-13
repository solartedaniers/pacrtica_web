import { SeismicFrame } from '../protocol/frame-codec';
import { FrameReorderBuffer, ReorderSink } from './frame-reorder-buffer';

class RecordingSink implements ReorderSink {
  readonly delivered: number[] = [];
  readonly skipped: number[] = [];

  deliver(frame: SeismicFrame): void {
    this.delivered.push(frame.seq);
  }

  skip(lostFrames: number): void {
    this.skipped.push(lostFrames);
  }
}

const frame = (seq: number): SeismicFrame => ({
  stationId: 1,
  channel: 0,
  flags: 0,
  seq,
  t0Us: seq * 250_000,
  samples: new Int32Array(50),
});

const policy = { windowMs: 750, maxDisorderPositions: 3, heapCapacity: 64, duplicateMemoryFrames: 512 };

describe('FrameReorderBuffer', () => {
  it('delivers out-of-order frames in strict sequence and drops duplicates', () => {
    const sink = new RecordingSink();
    const buffer = new FrameReorderBuffer(policy, sink);
    [0, 1, 3, 2, 2, 4, 6, 5, 7].forEach((seq, i) => buffer.accept(frame(seq), i * 10));
    expect(sink.delivered).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(buffer.counters.duplicates).toBe(1);
    expect(buffer.counters.outOfOrder).toBe(2);
  });

  it('closes the window on a lost frame and discards it when it arrives late', () => {
    const sink = new RecordingSink();
    const buffer = new FrameReorderBuffer(policy, sink);
    buffer.accept(frame(0), 0);
    buffer.accept(frame(2), 10);
    buffer.drain(800);
    expect(sink.delivered).toEqual([0, 2]);
    expect(sink.skipped).toEqual([1]);
    buffer.accept(frame(1), 900);
    expect(buffer.counters.lateDiscarded).toBe(1);
  });

  it('declares frames lost immediately when the disorder bound is exceeded', () => {
    const sink = new RecordingSink();
    const buffer = new FrameReorderBuffer(policy, sink);
    buffer.accept(frame(0), 0);
    buffer.accept(frame(5), 10);
    buffer.accept(frame(6), 20);
    expect(sink.delivered).toEqual([0]);
    expect(buffer.counters.lostFrames).toBe(2);
    expect(buffer.pendingFrames).toBe(2);
  });
});
