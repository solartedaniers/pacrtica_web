import { GeneratorCommand } from '../protocol/control-messages';
import { FrameBatchRouter } from './frame-batch-router';
import { FrameSource } from './frame-source';
import { IngestStatusWriter } from './ingest-status-writer';

export class WebSocketFrameSource implements FrameSource {
  private static readonly flushMs = 20;
  private static readonly reconnectMs = 2000;
  private socket: WebSocket | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private errors = 0;
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly router: FrameBatchRouter,
    private readonly status: IngestStatusWriter,
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
    this.scheduleFlush();
  }

  stop(): void {
    this.stopped = true;
    this.socket?.close();
    this.socket = null;
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
    }
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }
  }

  command(command: GeneratorCommand): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(command));
    }
  }

  private connect(): void {
    try {
      const socket = new WebSocket(this.url);
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        this.connected = true;
      };
      socket.onmessage = (event: MessageEvent) => {
        if (event.data instanceof ArrayBuffer) {
          this.router.routeBytes(event.data);
        }
      };
      socket.onerror = () => {
        this.errors++;
      };
      socket.onclose = () => {
        this.connected = false;
        if (!this.stopped) {
          this.reconnectTimer = setTimeout(() => this.connect(), WebSocketFrameSource.reconnectMs);
        }
      };
      this.socket = socket;
    } catch {
      this.errors++;
      this.reconnectTimer = setTimeout(() => this.connect(), WebSocketFrameSource.reconnectMs);
    }
  }

  private scheduleFlush(): void {
    this.flushTimer = setTimeout(this.flush, WebSocketFrameSource.flushMs);
  }

  private readonly flush = (): void => {
    this.router.flush();
    this.status.write({
      mode: 1,
      connected: this.connected,
      generatedTimeUs: this.router.latestT0Us,
      injectedDisorder: Number.NaN,
      injectedDuplicates: Number.NaN,
      injectedLost: Number.NaN,
      burstRemainingSeconds: Number.NaN,
      quakes: Number.NaN,
      errors: this.errors,
      rateMultiplier: Number.NaN,
    });
    if (!this.stopped) {
      this.scheduleFlush();
    }
  };
}
