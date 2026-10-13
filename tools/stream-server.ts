import { WebSocket, WebSocketServer } from 'ws';
import { SyntheticStreamGenerator } from '../src/app/core/generator/synthetic-stream-generator';
import { FaultSettings, GeneratorCommand } from '../src/app/core/protocol/control-messages';
import { FrameCodec, SeismicFrame } from '../src/app/core/protocol/frame-codec';

class CommandLineOptions {
  readonly port: number;
  readonly seed: number;
  readonly faults: FaultSettings;
  readonly burstSeconds: number;

  constructor(argv: readonly string[]) {
    const read = (name: string): string | null => {
      const match = argv.find((arg) => arg.startsWith(`--${name}=`));
      return match === undefined ? null : match.slice(name.length + 3);
    };
    const has = (name: string): boolean => argv.includes(`--${name}`);
    this.port = Number(read('port') ?? 8090);
    this.seed = Number(read('seed') ?? Date.now() % 0xffffffff);
    this.burstSeconds = Number(read('burst') ?? 0);
    this.faults = {
      disorder: !has('no-disorder'),
      duplicates: !has('no-duplicates'),
      losses: has('rain'),
      clockDrift: !has('no-drift'),
    };
  }
}

class FrameStreamServer {
  private static readonly tickMs = 20;
  private readonly generator: SyntheticStreamGenerator;
  private readonly server: WebSocketServer;
  private readonly clients = new Set<WebSocket>();
  private lastTick = performance.now();
  private framesSent = 0;

  constructor(private readonly options: CommandLineOptions) {
    this.generator = new SyntheticStreamGenerator(options.seed, Date.now());
    this.generator.execute({ type: 'faults', faults: options.faults });
    if (options.burstSeconds > 0) {
      this.generator.execute({ type: 'burst', durationSeconds: options.burstSeconds });
    }
    this.server = new WebSocketServer({ port: options.port });
  }

  start(): void {
    this.server.on('connection', (socket) => {
      this.clients.add(socket);
      process.stdout.write(`Cliente conectado (${this.clients.size} activos)\n`);
      socket.on('message', (data, isBinary) => {
        if (!isBinary) {
          this.applyCommand(data.toString());
        }
      });
      socket.on('close', () => this.clients.delete(socket));
    });
    setInterval(() => this.tick(), FrameStreamServer.tickMs);
    setInterval(() => this.report(), 5000);
    process.stdout.write(
      `Generador de tramas en ws://localhost:${this.options.port} · semilla ${this.options.seed} · fallas ${JSON.stringify(this.options.faults)}\n`,
    );
  }

  private applyCommand(raw: string): void {
    try {
      const command = JSON.parse(raw) as GeneratorCommand;
      this.generator.execute(command);
      process.stdout.write(`Comando recibido: ${command.type}\n`);
    } catch {
      process.stdout.write('Comando ignorado: no es JSON válido\n');
    }
  }

  private tick(): void {
    const now = performance.now();
    this.generator.advance(now - this.lastTick, (frame) => this.broadcast(frame));
    this.lastTick = now;
  }

  private broadcast(frame: SeismicFrame): void {
    const buffer = new ArrayBuffer(FrameCodec.byteLength);
    FrameCodec.encodeInto(frame, new DataView(buffer), 0);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(buffer, { binary: true });
      }
    }
    this.framesSent++;
  }

  private report(): void {
    const faults = this.generator.faults.counters;
    process.stdout.write(
      `Tramas ${this.framesSent} · desorden ${faults.disorder} · duplicadas ${faults.duplicates} · perdidas ${faults.lost} · sismos ${this.generator.statistics.quakes} · ritmo ${this.generator.rateMultiplier}x\n`,
    );
  }
}

new FrameStreamServer(new CommandLineOptions(process.argv.slice(2))).start();
