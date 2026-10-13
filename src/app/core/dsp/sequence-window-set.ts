export class SequenceWindowSet {
  private readonly tags: Float64Array;
  private readonly mask: number;

  constructor(capacityPowerOfTwo: number) {
    const capacity = 1 << Math.ceil(Math.log2(capacityPowerOfTwo));
    this.tags = new Float64Array(capacity).fill(-1);
    this.mask = capacity - 1;
  }

  has(seq: number): boolean {
    return this.tags[seq & this.mask] === seq;
  }

  add(seq: number): void {
    this.tags[seq & this.mask] = seq;
  }

  get byteLength(): number {
    return this.tags.byteLength;
  }
}
