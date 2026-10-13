import { SharedMemoryViews } from '../core/memory/shared-memory-layout';
import { IngestCommand, SourceMode } from '../core/protocol/control-messages';
import { FrameBatchRouter } from '../core/ingest/frame-batch-router';
import { FrameSource } from '../core/ingest/frame-source';
import { IngestStatusWriter } from '../core/ingest/ingest-status-writer';
import { SyntheticFrameSource } from '../core/ingest/synthetic-frame-source';
import { WebSocketFrameSource } from '../core/ingest/websocket-frame-source';

class IngestRouterWorker {
  private router: FrameBatchRouter | null = null;
  private status: IngestStatusWriter | null = null;
  private source: FrameSource | null = null;
  private seed = 1;

  handle(command: IngestCommand): void {
    switch (command.type) {
      case 'init': {
        const views = new SharedMemoryViews(command.memory);
        this.router = new FrameBatchRouter(command.routes, command.stationRoute);
        this.status = new IngestStatusWriter(views, this.router);
        this.seed = command.seed;
        this.switchSource('synthetic', '');
        break;
      }
      case 'source':
        this.switchSource(command.mode, command.url);
        break;
      case 'generator':
        this.source?.command(command.command);
        break;
    }
  }

  private switchSource(mode: SourceMode, url: string): void {
    if (this.router === null || this.status === null) {
      return;
    }
    this.source?.stop();
    this.source =
      mode === 'websocket'
        ? new WebSocketFrameSource(url, this.router, this.status)
        : new SyntheticFrameSource(this.seed, this.router, this.status);
    this.source.start();
  }
}

const worker = new IngestRouterWorker();
addEventListener('message', (event: MessageEvent<IngestCommand>) => worker.handle(event.data));
