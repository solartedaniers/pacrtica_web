export type Comparator<T> = (a: T, b: T) => number;

export class MinHeap<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: Comparator<T>) {}

  get size(): number {
    return this.items.length;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  push(item: T): void {
    this.items.push(item);
    this.siftUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const items = this.items;
    if (items.length === 0) {
      return undefined;
    }
    const top = items[0];
    const last = items.pop() as T;
    if (items.length > 0) {
      items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(index: number): void {
    const items = this.items;
    let child = index;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (this.compare(items[child], items[parent]) >= 0) {
        return;
      }
      [items[child], items[parent]] = [items[parent], items[child]];
      child = parent;
    }
  }

  private siftDown(index: number): void {
    const items = this.items;
    const length = items.length;
    let parent = index;
    for (;;) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let smallest = parent;
      if (left < length && this.compare(items[left], items[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(items[right], items[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === parent) {
        return;
      }
      [items[parent], items[smallest]] = [items[smallest], items[parent]];
      parent = smallest;
    }
  }
}
