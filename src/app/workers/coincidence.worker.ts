import { CoincidenceCoordinator } from '../core/coincidence/coincidence-coordinator';
import { CoincidenceCommand, CoincidenceToMain } from '../core/protocol/control-messages';

let coordinator: CoincidenceCoordinator | null = null;

addEventListener('message', (event: MessageEvent<CoincidenceCommand>) => {
  const command = event.data;
  coordinator = new CoincidenceCoordinator(
    command.ports,
    { requiredStations: command.requiredStations, windowUs: command.windowUs },
    (message: CoincidenceToMain) => postMessage(message),
  );
  coordinator.start();
});
