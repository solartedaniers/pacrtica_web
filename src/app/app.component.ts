import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AlertBannerComponent } from './components/alert-banner/alert-banner.component';
import { BenchmarkPanelComponent } from './components/benchmark-panel/benchmark-panel.component';
import { ConsoleHeaderComponent } from './components/console-header/console-header.component';
import { DetectorSettingsComponent } from './components/detector-settings/detector-settings.component';
import { EventPanelComponent } from './components/event-panel/event-panel.component';
import { IngestPanelComponent } from './components/ingest-panel/ingest-panel.component';
import { IsolationErrorComponent } from './components/isolation-error/isolation-error.component';
import { PerformancePanelComponent } from './components/performance-panel/performance-panel.component';
import { SeismogramPanelComponent } from './components/seismogram-panel/seismogram-panel.component';
import { SimulatorPanelComponent } from './components/simulator-panel/simulator-panel.component';
import { StationGridComponent } from './components/station-grid/station-grid.component';
import { ThreadPanelComponent } from './components/thread-panel/thread-panel.component';
import { TriggerLogComponent } from './components/trigger-log/trigger-log.component';
import { PerformanceTelemetryService } from './services/performance-telemetry.service';
import { RuntimeEnvironmentService } from './services/runtime-environment.service';
import { SeismicPipelineService } from './services/seismic-pipeline.service';
import { StatusSnapshotService } from './services/status-snapshot.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    AlertBannerComponent,
    BenchmarkPanelComponent,
    ConsoleHeaderComponent,
    DetectorSettingsComponent,
    EventPanelComponent,
    IngestPanelComponent,
    IsolationErrorComponent,
    PerformancePanelComponent,
    SeismogramPanelComponent,
    SimulatorPanelComponent,
    StationGridComponent,
    ThreadPanelComponent,
    TriggerLogComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  private readonly environment = inject(RuntimeEnvironmentService);
  private readonly pipeline = inject(SeismicPipelineService);
  private readonly status = inject(StatusSnapshotService);
  private readonly telemetry = inject(PerformanceTelemetryService);
  protected readonly ready = signal(this.environment.ready);

  ngOnInit(): void {
    this.telemetry.start();
    if (this.pipeline.start() !== null) {
      this.status.start();
    }
  }
}
