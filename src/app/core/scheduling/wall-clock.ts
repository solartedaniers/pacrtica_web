export class WallClock {
  static nowMs(): number {
    return performance.timeOrigin + performance.now();
  }
}
