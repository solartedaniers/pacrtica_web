type TaskCallback = () => void;

interface PostTaskScheduler {
  postTask(callback: TaskCallback, options?: { priority?: 'user-blocking' | 'user-visible' | 'background' }): unknown;
}

export type MacrotaskPriority = 'user-visible' | 'background';

export class MacrotaskScheduler {
  private readonly nativeScheduler: PostTaskScheduler | null;
  private readonly channel: MessageChannel | null;
  private readonly queue: TaskCallback[] = [];
  private queueHead = 0;

  constructor(private readonly priority: MacrotaskPriority = 'user-visible') {
    const candidate = (globalThis as { scheduler?: Partial<PostTaskScheduler> }).scheduler;
    this.nativeScheduler = candidate && typeof candidate.postTask === 'function' ? (candidate as PostTaskScheduler) : null;
    if (this.nativeScheduler === null) {
      this.channel = new MessageChannel();
      this.channel.port1.onmessage = () => this.runNext();
    } else {
      this.channel = null;
    }
  }

  get strategy(): 'postTask' | 'messageChannel' {
    return this.nativeScheduler !== null ? 'postTask' : 'messageChannel';
  }

  schedule(callback: TaskCallback): void {
    if (this.nativeScheduler !== null) {
      this.nativeScheduler.postTask(callback, { priority: this.priority });
      return;
    }
    this.queue.push(callback);
    this.channel?.port2.postMessage(0);
  }

  private runNext(): void {
    const callback = this.queue[this.queueHead++];
    if (this.queueHead > 256 && this.queueHead * 2 > this.queue.length) {
      this.queue.splice(0, this.queueHead);
      this.queueHead = 0;
    }
    callback?.();
  }
}
