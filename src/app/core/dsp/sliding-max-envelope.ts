export class SlidingMaxEnvelope {
  private readonly values: Float64Array;
  private readonly indices: Float64Array;
  private readonly capacity: number;
  private front = 0;
  private size = 0;
  private index = 0;

  constructor(readonly window: number) {
    this.capacity = window + 1;
    this.values = new Float64Array(this.capacity);
    this.indices = new Float64Array(this.capacity);
  }

  push(sample: number): number {
    const current = this.index++;
    const oldestAllowed = current - this.window + 1;
    while (this.size > 0 && this.indices[this.front] < oldestAllowed) {
      this.front = this.front + 1 === this.capacity ? 0 : this.front + 1;
      this.size--;
    }
    if (sample === sample) {
      const magnitude = Math.abs(sample);
      while (this.size > 0) {
        const backSlot = this.slotAt(this.size - 1);
        if (this.values[backSlot] > magnitude) {
          break;
        }
        this.size--;
      }
      const slot = this.slotAt(this.size);
      this.values[slot] = magnitude;
      this.indices[slot] = current;
      this.size++;
    }
    return this.size > 0 ? this.values[this.front] : 0;
  }

  get current(): number {
    return this.size > 0 ? this.values[this.front] : 0;
  }

  private slotAt(offset: number): number {
    const slot = this.front + offset;
    return slot >= this.capacity ? slot - this.capacity : slot;
  }
}
