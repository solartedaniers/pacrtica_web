import { Injectable, inject, signal } from '@angular/core';
import { ExportCommand, ExportReply } from '../core/protocol/control-messages';
import { ConsoleTextService } from './console-text.service';
import { SeismicPipelineService } from './seismic-pipeline.service';

export type ExportPhase = 'waiting' | 'building' | 'ready' | 'failed';

export interface ExportJobView {
  readonly requestId: number;
  readonly key: string;
  readonly phase: ExportPhase;
  readonly pendingSeconds: number;
  readonly rows: number;
  readonly elapsedMs: number;
  readonly reason: string | null;
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly pipeline = inject(SeismicPipelineService);
  private readonly text = inject(ConsoleTextService);
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private readonly fileNames = new Map<number, string>();

  readonly jobs = signal<ReadonlyMap<string, ExportJobView>>(new Map());

  requestWindow(key: string, fromUs: number, toUs: number, fileName: string): void {
    const worker = this.ensureWorker();
    if (worker === null) {
      return;
    }
    const requestId = this.nextRequestId++;
    this.fileNames.set(requestId, fileName);
    this.update(key, { requestId, key, phase: 'building', pendingSeconds: 0, rows: 0, elapsedMs: 0, reason: null });
    const command: ExportCommand = {
      type: 'export',
      requestId,
      fromUs,
      toUs,
      timeLabel: this.text.instant('export.timeColumn'),
      columnLabels: this.text.columnLabels(),
    };
    worker.postMessage(command);
  }

  private ensureWorker(): Worker | null {
    if (this.worker !== null) {
      return this.worker;
    }
    const handles = this.pipeline.pipeline;
    if (handles === null) {
      return null;
    }
    this.worker = new Worker(new URL('../workers/export.worker', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<ExportReply>) => this.handle(event.data);
    this.worker.postMessage({ type: 'init', memory: handles.views.buffer });
    return this.worker;
  }

  private handle(reply: ExportReply): void {
    const current = [...this.jobs().values()].find((job) => job.requestId === reply.requestId);
    if (current === undefined) {
      return;
    }
    switch (reply.type) {
      case 'export-progress':
        this.update(current.key, { ...current, phase: 'waiting', pendingSeconds: reply.pendingSeconds });
        break;
      case 'export-ready':
        this.download(reply.buffer, this.fileNames.get(reply.requestId) ?? this.text.instant('export.defaultFileName'));
        this.fileNames.delete(reply.requestId);
        this.update(current.key, { ...current, phase: 'ready', rows: reply.rows, elapsedMs: reply.elapsedMs });
        break;
      case 'export-failed':
        this.fileNames.delete(reply.requestId);
        this.update(current.key, { ...current, phase: 'failed', reason: reply.reason });
        break;
    }
  }

  private download(buffer: ArrayBuffer, fileName: string): void {
    const url = URL.createObjectURL(new Blob([buffer], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  private update(key: string, job: ExportJobView): void {
    const next = new Map(this.jobs());
    next.set(key, job);
    this.jobs.set(next);
  }
}
