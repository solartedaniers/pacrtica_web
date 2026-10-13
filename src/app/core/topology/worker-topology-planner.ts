import { SeismicConstants } from '../config/seismic-constants';

export interface WorkerTopology {
  readonly hardwareConcurrency: number;
  readonly reservedThreads: number;
  readonly processorCount: number;
  readonly partitions: readonly (readonly number[])[];
  readonly stationRoute: readonly number[];
  readonly overridden: boolean;
}

export class WorkerTopologyPlanner {
  static readonly reservedThreads = 2;
  private static readonly balancedCounts = [9, 3, 1];

  plan(hardwareConcurrency: number, override: number | null): WorkerTopology {
    const stations = SeismicConstants.stationCount;
    const available = Math.max(1, hardwareConcurrency - WorkerTopologyPlanner.reservedThreads);
    const processorCount =
      override !== null
        ? Math.min(stations, Math.max(1, Math.floor(override)))
        : (WorkerTopologyPlanner.balancedCounts.find((count) => count <= available) ?? 1);
    const partitions: number[][] = Array.from({ length: processorCount }, () => []);
    const stationRoute: number[] = new Array(stations + 1).fill(0);
    for (let stationId = 1; stationId <= stations; stationId++) {
      const worker = (stationId - 1) % processorCount;
      partitions[worker].push(stationId);
      stationRoute[stationId] = worker;
    }
    return {
      hardwareConcurrency,
      reservedThreads: WorkerTopologyPlanner.reservedThreads,
      processorCount,
      partitions,
      stationRoute,
      overridden: override !== null,
    };
  }
}
