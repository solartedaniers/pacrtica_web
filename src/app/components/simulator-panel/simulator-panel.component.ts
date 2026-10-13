import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { FaultSettings, SourceMode } from '../../core/protocol/control-messages';
import { ConsoleTextService } from '../../services/console-text.service';
import { SeismicPipelineService } from '../../services/seismic-pipeline.service';
import { StatusSnapshotService } from '../../services/status-snapshot.service';

@Component({
  selector: 'app-simulator-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './simulator-panel.component.html',
})
export class SimulatorPanelComponent {
  private readonly status = inject(StatusSnapshotService);
  private readonly text = inject(ConsoleTextService);
  protected readonly pipeline = inject(SeismicPipelineService);
  protected readonly magnitude = signal(2.4);
  protected readonly burstSeconds = signal(120);
  protected readonly urlDraft = signal(this.pipeline.sourceUrl());
  protected readonly burstOptions = [30, 120, 180, 300];
  protected readonly faultKeys: readonly (keyof FaultSettings)[] = ['disorder', 'duplicates', 'losses', 'clockDrift'];

  protected readonly source = computed(() => {
    const ingest = this.status.ingest();
    return {
      mode: this.pipeline.sourceMode(),
      connected: ingest?.sourceConnected ?? false,
      errors: ingest?.sourceErrors ?? 0,
      burstRemaining: ingest !== null && ingest.burstRemainingSeconds > 0 ? this.text.formatNumber(ingest.burstRemainingSeconds, 0) : null,
      quakes: ingest?.quakes ?? 0,
    };
  });

  protected toggleFault(key: keyof FaultSettings): void {
    const current = this.pipeline.faults();
    this.pipeline.updateFaults({ ...current, [key]: !current[key] });
  }

  protected injectQuake(): void {
    this.pipeline.sendGenerator({ type: 'inject-quake', magnitude: this.magnitude() });
  }

  protected injectLocalNoise(): void {
    this.pipeline.sendGenerator({ type: 'inject-local-noise' });
  }

  protected startBurst(): void {
    this.pipeline.sendGenerator({ type: 'burst', durationSeconds: this.burstSeconds() });
  }

  protected stopBurst(): void {
    this.pipeline.sendGenerator({ type: 'burst', durationSeconds: 0 });
  }

  protected setMagnitude(event: Event): void {
    this.magnitude.set(Number((event.target as HTMLInputElement).value));
  }

  protected setBurst(event: Event): void {
    this.burstSeconds.set(Number((event.target as HTMLSelectElement).value));
  }

  protected setUrl(event: Event): void {
    this.urlDraft.set((event.target as HTMLInputElement).value);
  }

  protected selectSource(mode: SourceMode): void {
    this.pipeline.switchSource(mode, this.urlDraft());
  }
}
