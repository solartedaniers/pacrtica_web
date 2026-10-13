export class SeededRandom {
  private state: number;
  private spareGaussian: number | null = null;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  between(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  integerBetween(min: number, max: number): number {
    return Math.floor(this.between(min, max + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  gaussian(): number {
    if (this.spareGaussian !== null) {
      const spare = this.spareGaussian;
      this.spareGaussian = null;
      return spare;
    }
    let u = 0;
    while (u === 0) {
      u = this.next();
    }
    const v = this.next();
    const magnitude = Math.sqrt(-2 * Math.log(u));
    this.spareGaussian = magnitude * Math.sin(2 * Math.PI * v);
    return magnitude * Math.cos(2 * Math.PI * v);
  }
}
