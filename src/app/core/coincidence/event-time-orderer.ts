import { ChannelTransitionMessage } from '../protocol/control-messages';
import { MinHeap } from '../dsp/min-heap';

export class EventTimeOrderer {
  private readonly heap = new MinHeap<ChannelTransitionMessage>(
    (a, b) => a.timeUs - b.timeUs || (a.state === b.state ? 0 : a.state === 'off' ? -1 : 1) || a.channelIndex - b.channelIndex,
  );
  private readonly watermarks: Float64Array;

  constructor(workerCount: number) {
    this.watermarks = new Float64Array(workerCount).fill(Number.NEGATIVE_INFINITY);
  }

  enqueue(transition: ChannelTransitionMessage): void {
    this.heap.push(transition);
  }

  advance(workerIndex: number, watermarkUs: number): void {
    if (watermarkUs > this.watermarks[workerIndex]) {
      this.watermarks[workerIndex] = watermarkUs;
    }
  }

  get globalWatermarkUs(): number {
    let minimum = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.watermarks.length; i++) {
      if (this.watermarks[i] < minimum) {
        minimum = this.watermarks[i];
      }
    }
    return minimum;
  }

  get pending(): number {
    return this.heap.size;
  }

  release(consumer: (transition: ChannelTransitionMessage) => void): number {
    const limit = this.globalWatermarkUs;
    let released = 0;
    for (;;) {
      const top = this.heap.peek();
      if (top === undefined || top.timeUs > limit) {
        return released;
      }
      this.heap.pop();
      consumer(top);
      released++;
    }
  }
}
