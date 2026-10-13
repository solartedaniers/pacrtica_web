import { BenchmarkCommand, BenchmarkReply } from '../core/protocol/control-messages';
import { TransferBenchmark } from '../core/metrics/transfer-benchmark';

let benchmark: TransferBenchmark | null = null;

addEventListener('message', (event: MessageEvent<BenchmarkCommand>) => {
  const command = event.data;
  if (command.type === 'connect') {
    benchmark = new TransferBenchmark(command.port);
    return;
  }
  benchmark?.run(command.sizes, command.iterations, (reply: BenchmarkReply) => postMessage(reply));
});
