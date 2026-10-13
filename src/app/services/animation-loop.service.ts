import { DestroyRef, Injectable, inject } from '@angular/core';

export type FrameCallback = (timestamp: number) => void;

@Injectable({ providedIn: 'root' })
export class AnimationLoopService {
  private readonly callbacks = new Set<FrameCallback>();
  private handle = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.handle));
  }

  register(callback: FrameCallback): () => void {
    this.callbacks.add(callback);
    if (this.handle === 0) {
      this.handle = requestAnimationFrame(this.frame);
    }
    return () => this.callbacks.delete(callback);
  }

  private readonly frame = (timestamp: number): void => {
    for (const callback of this.callbacks) {
      callback(timestamp);
    }
    this.handle = this.callbacks.size > 0 ? requestAnimationFrame(this.frame) : 0;
  };
}
