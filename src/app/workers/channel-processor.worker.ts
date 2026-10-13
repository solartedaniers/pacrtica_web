import { SharedMemoryViews } from '../core/memory/shared-memory-layout';
import { ProcessorCommand } from '../core/protocol/control-messages';
import { StationProcessor } from '../core/processing/station-processor';

class ChannelProcessorWorker {
  private processor: StationProcessor | null = null;

  handle(command: ProcessorCommand): void {
    if (command.type === 'init') {
      this.processor = new StationProcessor({
        views: new SharedMemoryViews(command.memory),
        workerIndex: command.workerIndex,
        stationIds: command.stationIds,
        thresholds: command.thresholds,
        ingestPort: command.ingestPort,
        coincidencePort: command.coincidencePort,
      });
      this.processor.start();
      return;
    }
    this.processor?.updateThresholds(command.thresholds);
  }
}

const worker = new ChannelProcessorWorker();
addEventListener('message', (event: MessageEvent<ProcessorCommand>) => worker.handle(event.data));
