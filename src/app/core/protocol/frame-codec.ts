import { SeismicConstants } from '../config/seismic-constants';

export interface SeismicFrame {
  readonly stationId: number;
  readonly channel: number;
  readonly flags: number;
  readonly seq: number;
  readonly t0Us: number;
  readonly samples: Int32Array;
}

export const FrameFlags = {
  calibration: 0b01,
  lowBattery: 0b10,
} as const;

export class FrameCodec {
  static readonly byteLength = SeismicConstants.frameByteLength;
  private static readonly littleEndian = false;
  private static readonly samplesOffset = 16;

  static encodeInto(frame: SeismicFrame, view: DataView, offset: number): void {
    const le = FrameCodec.littleEndian;
    view.setUint16(offset, frame.stationId, le);
    view.setUint8(offset + 2, frame.channel);
    view.setUint8(offset + 3, frame.flags);
    view.setUint32(offset + 4, frame.seq >>> 0, le);
    view.setFloat64(offset + 8, frame.t0Us, le);
    const base = offset + FrameCodec.samplesOffset;
    for (let i = 0; i < SeismicConstants.samplesPerFrame; i++) {
      view.setInt32(base + i * 4, frame.samples[i], le);
    }
  }

  static decodeFrom(view: DataView, offset: number): SeismicFrame {
    const le = FrameCodec.littleEndian;
    const samples = new Int32Array(SeismicConstants.samplesPerFrame);
    const base = offset + FrameCodec.samplesOffset;
    for (let i = 0; i < SeismicConstants.samplesPerFrame; i++) {
      samples[i] = view.getInt32(base + i * 4, le);
    }
    return {
      stationId: view.getUint16(offset, le),
      channel: view.getUint8(offset + 2),
      flags: view.getUint8(offset + 3),
      seq: view.getUint32(offset + 4, le),
      t0Us: view.getFloat64(offset + 8, le),
      samples,
    };
  }

  static peekStationId(view: DataView, offset: number): number {
    return view.getUint16(offset, FrameCodec.littleEndian);
  }

  static peekT0Us(view: DataView, offset: number): number {
    return view.getFloat64(offset + 8, FrameCodec.littleEndian);
  }

  static isValidHeader(view: DataView, offset: number): boolean {
    const stationId = view.getUint16(offset, FrameCodec.littleEndian);
    const channel = view.getUint8(offset + 2);
    return (
      stationId >= 1 &&
      stationId <= SeismicConstants.stationCount &&
      channel < SeismicConstants.channelsPerStation
    );
  }
}
