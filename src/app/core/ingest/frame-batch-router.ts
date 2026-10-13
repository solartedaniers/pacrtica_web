import { SeismicConstants } from '../config/seismic-constants';
import { FrameBatchMessage } from '../protocol/control-messages';
import { FrameCodec, SeismicFrame } from '../protocol/frame-codec';
import { WallClock } from '../scheduling/wall-clock';

class GrowableBatch {
  private bytes: Uint8Array;
  private view: DataView;
  count = 0;

  constructor(private readonly initialFrames: number) {
    this.bytes = new Uint8Array(initialFrames * FrameCodec.byteLength);
    this.view = new DataView(this.bytes.buffer);
  }

  appendFrame(frame: SeismicFrame): void {
    this.ensureCapacity();
    FrameCodec.encodeInto(frame, this.view, this.count * FrameCodec.byteLength);
    this.count++;
  }

  appendBytes(source: Uint8Array, offset: number): void {
    this.ensureCapacity();
    this.bytes.set(source.subarray(offset, offset + FrameCodec.byteLength), this.count * FrameCodec.byteLength);
    this.count++;
  }

  detach(): { buffer: ArrayBuffer; count: number } {
    const result = { buffer: this.bytes.buffer as ArrayBuffer, count: this.count };
    this.bytes = new Uint8Array(this.initialFrames * FrameCodec.byteLength);
    this.view = new DataView(this.bytes.buffer);
    this.count = 0;
    return result;
  }

  private ensureCapacity(): void {
    if ((this.count + 1) * FrameCodec.byteLength <= this.bytes.byteLength) {
      return;
    }
    const grown = new Uint8Array(this.bytes.byteLength * 2);
    grown.set(this.bytes);
    this.bytes = grown;
    this.view = new DataView(grown.buffer);
  }
}

export class FrameBatchRouter {
  private readonly batches: GrowableBatch[];
  framesRouted = 0;
  bytesRouted = 0;
  framesRejected = 0;
  latestT0Us = 0;

  constructor(
    private readonly routes: readonly MessagePort[],
    private readonly stationRoute: readonly number[],
  ) {
    this.batches = routes.map(() => new GrowableBatch(SeismicConstants.channelsPerStation * 8));
  }

  routeFrame(frame: SeismicFrame): void {
    this.batches[this.stationRoute[frame.stationId]].appendFrame(frame);
    if (frame.t0Us > this.latestT0Us) {
      this.latestT0Us = frame.t0Us;
    }
    this.framesRouted++;
    this.bytesRouted += FrameCodec.byteLength;
  }

  routeBytes(payload: ArrayBuffer): void {
    const bytes = new Uint8Array(payload);
    const view = new DataView(payload);
    for (let offset = 0; offset + FrameCodec.byteLength <= bytes.byteLength; offset += FrameCodec.byteLength) {
      if (!FrameCodec.isValidHeader(view, offset)) {
        this.framesRejected++;
        continue;
      }
      const stationId = FrameCodec.peekStationId(view, offset);
      this.batches[this.stationRoute[stationId]].appendBytes(bytes, offset);
      const t0Us = FrameCodec.peekT0Us(view, offset);
      if (t0Us > this.latestT0Us) {
        this.latestT0Us = t0Us;
      }
      this.framesRouted++;
      this.bytesRouted += FrameCodec.byteLength;
    }
    if (bytes.byteLength % FrameCodec.byteLength !== 0) {
      this.framesRejected++;
    }
  }

  flush(): void {
    const sentAtMs = WallClock.nowMs();
    for (let i = 0; i < this.batches.length; i++) {
      if (this.batches[i].count === 0) {
        continue;
      }
      const { buffer, count } = this.batches[i].detach();
      const message: FrameBatchMessage = { type: 'frames', buffer, count, sentAtMs };
      this.routes[i].postMessage(message, [buffer]);
    }
  }
}
