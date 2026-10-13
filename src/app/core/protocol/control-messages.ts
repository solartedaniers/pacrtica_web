export interface DetectorThresholds {
  readonly onRatio: number;
  readonly offRatio: number;
}

export interface FaultSettings {
  readonly disorder: boolean;
  readonly duplicates: boolean;
  readonly losses: boolean;
  readonly clockDrift: boolean;
}

export type SourceMode = 'synthetic' | 'websocket';

export type GeneratorCommand =
  | { readonly type: 'faults'; readonly faults: FaultSettings }
  | { readonly type: 'burst'; readonly durationSeconds: number }
  | { readonly type: 'inject-quake'; readonly magnitude: number }
  | { readonly type: 'inject-local-noise' };

export type IngestCommand =
  | {
      readonly type: 'init';
      readonly memory: SharedArrayBuffer;
      readonly routes: readonly MessagePort[];
      readonly stationRoute: readonly number[];
      readonly seed: number;
    }
  | { readonly type: 'source'; readonly mode: SourceMode; readonly url: string }
  | { readonly type: 'generator'; readonly command: GeneratorCommand };

export type ProcessorCommand =
  | {
      readonly type: 'init';
      readonly memory: SharedArrayBuffer;
      readonly workerIndex: number;
      readonly stationIds: readonly number[];
      readonly ingestPort: MessagePort;
      readonly coincidencePort: MessagePort;
      readonly thresholds: DetectorThresholds;
    }
  | { readonly type: 'thresholds'; readonly thresholds: DetectorThresholds };

export type StationTransition = {
  readonly type: 'station-transition';
  readonly stationId: number;
  readonly state: 'on' | 'off';
  readonly timeUs: number;
  readonly peak: number;
  readonly ratio: number;
};

export type ChannelTransitionMessage = {
  readonly type: 'channel-transition';
  readonly channelIndex: number;
  readonly state: 'on' | 'off';
  readonly timeUs: number;
  readonly peak: number;
  readonly ratio: number;
};

export type ProcessorToCoincidence =
  | ChannelTransitionMessage
  | { readonly type: 'progress'; readonly workerIndex: number; readonly watermarkUs: number };

export type CoincidenceCommand = {
  readonly type: 'init';
  readonly ports: readonly MessagePort[];
  readonly requiredStations: number;
  readonly windowUs: number;
};

export interface SeismicEventSnapshot {
  readonly id: number;
  readonly firstTriggerUs: number;
  readonly confirmedAtUs: number;
  readonly endUs: number | null;
  readonly stations: readonly number[];
  readonly peak: number;
  readonly closed: boolean;
}

export type CoincidenceToMain =
  | StationTransition
  | { readonly type: 'event'; readonly event: SeismicEventSnapshot };

export type ExportCommand = {
  readonly type: 'export';
  readonly requestId: number;
  readonly fromUs: number;
  readonly toUs: number;
  readonly timeLabel: string;
  readonly columnLabels: readonly string[];
};

export type ExportReply =
  | { readonly type: 'export-progress'; readonly requestId: number; readonly pendingSeconds: number }
  | {
      readonly type: 'export-ready';
      readonly requestId: number;
      readonly buffer: ArrayBuffer;
      readonly rows: number;
      readonly elapsedMs: number;
    }
  | { readonly type: 'export-failed'; readonly requestId: number; readonly reason: 'no-data' | 'expired' };

export type BenchmarkCommand =
  | { readonly type: 'connect'; readonly port: MessagePort }
  | { readonly type: 'run'; readonly sizes: readonly number[]; readonly iterations: number };

export interface BenchmarkRow {
  readonly sizeBytes: number;
  readonly cloneMs: number;
  readonly transferMs: number;
}

export type BenchmarkReply =
  | { readonly type: 'benchmark-row'; readonly row: BenchmarkRow }
  | { readonly type: 'benchmark-done' };

export type FrameBatchMessage = {
  readonly type: 'frames';
  readonly buffer: ArrayBuffer;
  readonly count: number;
  readonly sentAtMs: number;
};
