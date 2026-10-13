import { Injectable, inject, signal } from '@angular/core';
import { SeismicConstants } from '../core/config/seismic-constants';
import { RingHistoryReader } from '../core/memory/ring-history';
import { SharedMemoryLayout, SharedMemoryViews } from '../core/memory/shared-memory-layout';
import {
  CoincidenceCommand,
  CoincidenceToMain,
  DetectorThresholds,
  FaultSettings,
  GeneratorCommand,
  IngestCommand,
  ProcessorCommand,
  SourceMode,
} from '../core/protocol/control-messages';
import { WorkerTopology, WorkerTopologyPlanner } from '../core/topology/worker-topology-planner';
import { MainThreadBacklogService } from './main-thread-backlog.service';
import { RuntimeEnvironmentService } from './runtime-environment.service';

export interface PipelineHandles {
  readonly views: SharedMemoryViews;
  readonly reader: RingHistoryReader;
  readonly topology: WorkerTopology;
  readonly memoryBytes: number;
}

@Injectable({ providedIn: 'root' })
export class SeismicPipelineService {
  private readonly environment = inject(RuntimeEnvironmentService);
  private readonly backlog = inject(MainThreadBacklogService);
  private ingestWorker: Worker | null = null;
  private readonly processorWorkers: Worker[] = [];
  private coincidenceWorker: Worker | null = null;
  private handles: PipelineHandles | null = null;

  readonly thresholds = signal<DetectorThresholds>({
    onRatio: SeismicConstants.defaultTriggerOnRatio,
    offRatio: SeismicConstants.defaultTriggerOffRatio,
  });
  readonly faults = signal<FaultSettings>({ disorder: true, duplicates: true, losses: false, clockDrift: true });
  readonly sourceMode = signal<SourceMode>('synthetic');
  readonly sourceUrl = signal('ws://localhost:8090');
  readonly started = signal(false);

  get pipeline(): PipelineHandles | null {
    return this.handles;
  }

  start(): PipelineHandles | null {
    if (this.handles !== null) {
      return this.handles;
    }
    if (!this.environment.ready) {
      return null;
    }
    const layout = new SharedMemoryLayout();
    const memory = layout.allocate();
    const views = new SharedMemoryViews(memory);
    const topology = new WorkerTopologyPlanner().plan(this.environment.hardwareConcurrency, this.environment.workerOverride);
    const ingestChannels = topology.partitions.map(() => new MessageChannel());
    const coincidenceChannels = topology.partitions.map(() => new MessageChannel());

    this.coincidenceWorker = new Worker(new URL('../workers/coincidence.worker', import.meta.url), { type: 'module' });
    this.coincidenceWorker.onmessage = (event: MessageEvent<CoincidenceToMain>) => this.backlog.enqueue(event.data);
    const coincidenceInit: CoincidenceCommand = {
      type: 'init',
      ports: coincidenceChannels.map((channel) => channel.port2),
      requiredStations: SeismicConstants.coincidenceStations,
      windowUs: SeismicConstants.coincidenceWindowUs,
    };
    this.coincidenceWorker.postMessage(coincidenceInit, coincidenceChannels.map((channel) => channel.port2));

    topology.partitions.forEach((stationIds, workerIndex) => {
      const worker = new Worker(new URL('../workers/channel-processor.worker', import.meta.url), { type: 'module' });
      const init: ProcessorCommand = {
        type: 'init',
        memory,
        workerIndex,
        stationIds,
        ingestPort: ingestChannels[workerIndex].port2,
        coincidencePort: coincidenceChannels[workerIndex].port1,
        thresholds: this.thresholds(),
      };
      worker.postMessage(init, [ingestChannels[workerIndex].port2, coincidenceChannels[workerIndex].port1]);
      this.processorWorkers.push(worker);
    });

    this.ingestWorker = new Worker(new URL('../workers/ingest-router.worker', import.meta.url), { type: 'module' });
    const ingestInit: IngestCommand = {
      type: 'init',
      memory,
      routes: ingestChannels.map((channel) => channel.port1),
      stationRoute: topology.stationRoute,
      seed: Math.floor(Math.random() * 0xffffffff),
    };
    this.ingestWorker.postMessage(ingestInit, ingestChannels.map((channel) => channel.port1));
    this.sendGenerator({ type: 'faults', faults: this.faults() });

    this.handles = { views, reader: new RingHistoryReader(views), topology, memoryBytes: layout.totalBytes };
    this.started.set(true);
    return this.handles;
  }

  updateThresholds(thresholds: DetectorThresholds): void {
    this.thresholds.set(thresholds);
    const command: ProcessorCommand = { type: 'thresholds', thresholds };
    for (const worker of this.processorWorkers) {
      worker.postMessage(command);
    }
  }

  updateFaults(faults: FaultSettings): void {
    this.faults.set(faults);
    this.sendGenerator({ type: 'faults', faults });
  }

  sendGenerator(command: GeneratorCommand): void {
    const message: IngestCommand = { type: 'generator', command };
    this.ingestWorker?.postMessage(message);
  }

  switchSource(mode: SourceMode, url: string): void {
    this.sourceMode.set(mode);
    this.sourceUrl.set(url);
    const message: IngestCommand = { type: 'source', mode, url };
    this.ingestWorker?.postMessage(message);
    if (mode === 'synthetic') {
      this.sendGenerator({ type: 'faults', faults: this.faults() });
    }
  }
}
