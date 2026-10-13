import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ConsoleTextService } from '../../services/console-text.service';
import { RuntimeEnvironmentService } from '../../services/runtime-environment.service';
import { SeismicPipelineService } from '../../services/seismic-pipeline.service';
import { StatusSnapshotService } from '../../services/status-snapshot.service';

@Component({
  selector: 'app-console-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './console-header.component.html',
})
export class ConsoleHeaderComponent {
  private readonly status = inject(StatusSnapshotService);
  private readonly text = inject(ConsoleTextService);
  private readonly pipeline = inject(SeismicPipelineService);
  protected readonly environment = inject(RuntimeEnvironmentService);

  protected readonly clocks = computed(() => {
    const clock = this.status.clock();
    if (clock === null) {
      return null;
    }
    return {
      wall: this.text.formatPreciseClock(clock.wallUs),
      data: this.text.formatPreciseClock(clock.processedUs),
      lag: this.text.formatNumber(clock.pipelineLagMs, 0),
      lagLevel: clock.pipelineLagMs > 2000 ? 'critical' : clock.pipelineLagMs > 1000 ? 'warning' : 'ok',
    };
  });

  protected readonly topology = computed(() => {
    this.pipeline.started();
    const handles = this.pipeline.pipeline;
    return handles === null
      ? null
      : {
          workers: handles.topology.processorCount,
          cores: handles.topology.hardwareConcurrency,
          megabytes: this.text.formatNumber(handles.memoryBytes / (1024 * 1024), 1),
        };
  });
}
