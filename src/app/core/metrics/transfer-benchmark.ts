import { BenchmarkReply } from '../protocol/control-messages';

type EchoMessage = { readonly payload: ArrayBuffer; readonly transfer: boolean };

export class TransferBenchmark {
  private pending: ((payload: ArrayBuffer) => void) | null = null;

  constructor(private readonly port: MessagePort) {
    port.onmessage = (event: MessageEvent<EchoMessage>) => {
      const resolve = this.pending;
      this.pending = null;
      resolve?.(event.data.payload);
    };
  }

  async run(sizes: readonly number[], iterations: number, reply: (message: BenchmarkReply) => void): Promise<void> {
    for (const size of sizes) {
      const cloneMs = await this.measure(size, iterations, false);
      const transferMs = await this.measure(size, iterations, true);
      reply({ type: 'benchmark-row', row: { sizeBytes: size, cloneMs, transferMs } });
    }
    reply({ type: 'benchmark-done' });
  }

  private async measure(size: number, iterations: number, transfer: boolean): Promise<number> {
    let payload = new ArrayBuffer(size);
    new Uint8Array(payload).fill(7);
    const samples: number[] = [];
    await this.roundTrip(payload.slice(0), transfer);
    for (let i = 0; i < iterations; i++) {
      const started = performance.now();
      const returned = await this.roundTrip(payload, transfer);
      samples.push(performance.now() - started);
      if (transfer) {
        payload = returned;
      }
    }
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)] / 2;
  }

  private roundTrip(payload: ArrayBuffer, transfer: boolean): Promise<ArrayBuffer> {
    return new Promise((resolve) => {
      this.pending = resolve;
      const message: EchoMessage = { payload, transfer };
      this.port.postMessage(message, transfer ? [payload] : []);
    });
  }
}
