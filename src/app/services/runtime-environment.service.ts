import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RuntimeEnvironmentService {
  readonly crossOriginIsolated = globalThis.crossOriginIsolated === true;
  readonly sharedMemoryAvailable = typeof SharedArrayBuffer !== 'undefined';
  readonly hardwareConcurrency = navigator.hardwareConcurrency || 4;
  readonly workerOverride = this.readWorkerOverride();
  readonly ready = this.crossOriginIsolated && this.sharedMemoryAvailable;

  private readWorkerOverride(): number | null {
    const raw = new URLSearchParams(location.search).get('workers');
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) && value >= 1 ? value : null;
  }
}
