import { CoincidenceToMain, ProcessorToCoincidence } from '../protocol/control-messages';
import { CoincidenceEngine, CoincidenceRules } from './coincidence-engine';
import { EventTimeOrderer } from './event-time-orderer';
import { StationStateMerger } from './station-state-merger';

export class CoincidenceCoordinator {
  private readonly orderer: EventTimeOrderer;
  private readonly merger = new StationStateMerger();
  private readonly engine: CoincidenceEngine;

  constructor(
    private readonly ports: readonly MessagePort[],
    rules: CoincidenceRules,
    private readonly emit: (message: CoincidenceToMain) => void,
  ) {
    this.orderer = new EventTimeOrderer(ports.length);
    this.engine = new CoincidenceEngine(rules, (event) => this.emit({ type: 'event', event }));
  }

  start(): void {
    for (const port of this.ports) {
      port.onmessage = (event: MessageEvent<ProcessorToCoincidence>) => this.handle(event.data);
    }
  }

  private handle(message: ProcessorToCoincidence): void {
    if (message.type === 'channel-transition') {
      this.orderer.enqueue(message);
    } else {
      this.orderer.advance(message.workerIndex, message.watermarkUs);
    }
    this.orderer.release((transition) => {
      const stationTransition = this.merger.merge(transition);
      if (stationTransition !== null) {
        this.engine.apply(stationTransition);
        this.emit(stationTransition);
      }
    });
    this.engine.advanceTo(this.orderer.globalWatermarkUs);
  }
}
