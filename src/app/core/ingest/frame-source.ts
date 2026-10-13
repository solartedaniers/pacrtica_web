import { GeneratorCommand } from '../protocol/control-messages';

export interface FrameSource {
  start(): void;
  stop(): void;
  command(command: GeneratorCommand): void;
}
