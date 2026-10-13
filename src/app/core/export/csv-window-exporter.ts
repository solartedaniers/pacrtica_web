import { SeismicConstants } from '../config/seismic-constants';
import { RingHistoryReader } from '../memory/ring-history';

export interface CsvExportRequest {
  readonly fromUs: number;
  readonly toUs: number;
  readonly timeLabel: string;
  readonly columnLabels: readonly string[];
}

export type CsvExportResult =
  | { readonly kind: 'ready'; readonly bytes: Uint8Array; readonly rows: number }
  | { readonly kind: 'no-data' }
  | { readonly kind: 'expired' };

export class CsvWindowExporter {
  private static readonly rowsPerChunk = 2000;
  private readonly encoder = new TextEncoder();

  constructor(private readonly reader: RingHistoryReader) {}

  missingSamples(request: CsvExportRequest): { channel: number; required: number; committed: number } | null {
    let worst: { channel: number; required: number; committed: number } | null = null;
    for (let channel = 0; channel < SeismicConstants.channelCount; channel++) {
      const base = this.reader.baseTimeUs(channel);
      if (base === null) {
        continue;
      }
      const required = this.indexAt(base, request.toUs) + 1;
      const committed = this.reader.committed(channel);
      if (committed < required && (worst === null || required - committed > worst.required - worst.committed)) {
        worst = { channel, required, committed };
      }
    }
    return worst;
  }

  build(request: CsvExportRequest): CsvExportResult {
    const period = SeismicConstants.samplePeriodUs;
    const rows = Math.floor((request.toUs - request.fromUs) / period) + 1;
    const columns: (Float32Array | null)[] = [];
    let anyData = false;
    for (let channel = 0; channel < SeismicConstants.channelCount; channel++) {
      const base = this.reader.baseTimeUs(channel);
      if (base === null) {
        columns.push(null);
        continue;
      }
      const startIndex = this.indexAt(base, request.fromUs);
      const clampedStart = Math.max(0, startIndex);
      const end = Math.min(this.reader.committed(channel), startIndex + rows);
      const column = new Float32Array(rows).fill(Number.NaN);
      if (end > clampedStart) {
        const slice = new Float32Array(end - clampedStart);
        if (!this.reader.copyRange(channel, clampedStart, end, slice, this.reader.samples)) {
          return { kind: 'expired' };
        }
        column.set(slice, clampedStart - startIndex);
        anyData = true;
      }
      columns.push(column);
    }
    if (!anyData) {
      return { kind: 'no-data' };
    }
    const parts: Uint8Array[] = [this.encoder.encode([request.timeLabel, ...request.columnLabels].join(',') + '\n')];
    for (let first = 0; first < rows; first += CsvWindowExporter.rowsPerChunk) {
      const last = Math.min(rows, first + CsvWindowExporter.rowsPerChunk);
      const lines: string[] = [];
      for (let row = first; row < last; row++) {
        const timeMs = (request.fromUs + row * period) / 1000;
        const cells: string[] = [new Date(timeMs).toISOString()];
        for (const column of columns) {
          const value = column === null ? Number.NaN : column[row];
          cells.push(value === value ? value.toFixed(1) : '');
        }
        lines.push(cells.join(','));
      }
      parts.push(this.encoder.encode(lines.join('\n') + '\n'));
    }
    let total = 0;
    for (const part of parts) {
      total += part.byteLength;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return { kind: 'ready', bytes, rows };
  }

  private indexAt(baseUs: number, timeUs: number): number {
    return Math.round((timeUs - baseUs) / SeismicConstants.samplePeriodUs);
  }
}
