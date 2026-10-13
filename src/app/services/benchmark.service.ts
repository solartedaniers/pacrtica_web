import { Injectable, signal } from '@angular/core';
import { BenchmarkCommand, BenchmarkReply, BenchmarkRow } from '../core/protocol/control-messages';
import { SeismicConstants } from '../core/config/seismic-constants';

@Injectable({ providedIn: 'root' })
export class BenchmarkService {
  static readonly sizes = [
    SeismicConstants.frameByteLength,
    SeismicConstants.frameByteLength * 54,
    1024 * 1024,
    SeismicConstants.historyCapacity * 4 * 27,
  ];
  private runner: Worker | null = null;
  private echo: Worker | null = null;

  readonly rows = signal<readonly BenchmarkRow[]>([]);
  readonly running = signal(false);

  run(): void {
    if (this.running()) {
      return;
    }
    this.ensureWorkers();
    this.rows.set([]);
    this.running.set(true);
    const command: BenchmarkCommand = { type: 'run', sizes: BenchmarkService.sizes, iterations: 15 };
    this.runner?.postMessage(command);
  }

  private ensureWorkers(): void {
    if (this.runner !== null) {
      return;
    }
    const channel = new MessageChannel();
    this.echo = new Worker(new URL('../workers/benchmark-echo.worker', import.meta.url), { type: 'module' });
    this.echo.postMessage({ port: channel.port2 }, [channel.port2]);
    this.runner = new Worker(new URL('../workers/benchmark-runner.worker', import.meta.url), { type: 'module' });
    this.runner.onmessage = (event: MessageEvent<BenchmarkReply>) => {
      const reply = event.data;
      if (reply.type === 'benchmark-row') {
        this.rows.update((rows) => [...rows, reply.row]);
      } else {
        this.running.set(false);
      }
    };
    const connect: BenchmarkCommand = { type: 'connect', port: channel.port1 };
    this.runner.postMessage(connect, [channel.port1]);
  }
}
