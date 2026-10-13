import { RingHistoryReader } from '../memory/ring-history';
import { ExportCommand, ExportReply } from '../protocol/control-messages';
import { SeismicConstants } from '../config/seismic-constants';
import { CsvWindowExporter } from './csv-window-exporter';

export class ExportJobRunner {
  private static readonly waitSliceMs = 500;
  private static readonly stallLimitMs = 10_000;
  private readonly exporter: CsvWindowExporter;

  constructor(
    private readonly reader: RingHistoryReader,
    private readonly reply: (message: ExportReply, transfer?: Transferable[]) => void,
  ) {
    this.exporter = new CsvWindowExporter(reader);
  }

  run(command: ExportCommand): void {
    const started = performance.now();
    this.waitForData(command);
    const result = this.exporter.build(command);
    if (result.kind === 'ready') {
      const buffer = result.bytes.buffer as ArrayBuffer;
      this.reply(
        {
          type: 'export-ready',
          requestId: command.requestId,
          buffer,
          rows: result.rows,
          elapsedMs: performance.now() - started,
        },
        [buffer],
      );
      return;
    }
    this.reply({ type: 'export-failed', requestId: command.requestId, reason: result.kind });
  }

  private waitForData(command: ExportCommand): void {
    let lastCommitted = -1;
    let lastProgressMs = performance.now();
    for (;;) {
      const missing = this.exporter.missingSamples(command);
      if (missing === null) {
        return;
      }
      if (missing.committed !== lastCommitted) {
        lastCommitted = missing.committed;
        lastProgressMs = performance.now();
      } else if (performance.now() - lastProgressMs > ExportJobRunner.stallLimitMs) {
        return;
      }
      const pendingSeconds = ((missing.required - missing.committed) * SeismicConstants.samplePeriodUs) / 1_000_000;
      this.reply({ type: 'export-progress', requestId: command.requestId, pendingSeconds });
      this.reader.waitForCommit(missing.channel, missing.committed, ExportJobRunner.waitSliceMs);
    }
  }
}
