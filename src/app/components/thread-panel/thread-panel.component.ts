import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SeismicConstants } from '../../core/config/seismic-constants';
import { ConsoleTextService } from '../../services/console-text.service';
import { SeismicPipelineService } from '../../services/seismic-pipeline.service';
import { StatusSnapshotService } from '../../services/status-snapshot.service';

@Component({
  selector: 'app-thread-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './thread-panel.component.html',
})
export class ThreadPanelComponent {
  private readonly status = inject(StatusSnapshotService);
  private readonly pipeline = inject(SeismicPipelineService);
  private readonly text = inject(ConsoleTextService);

  protected readonly summary = computed(() => {
    this.pipeline.started();
    const handles = this.pipeline.pipeline;
    if (handles === null) {
      return null;
    }
    const t = handles.topology;
    return {
      workers: t.processorCount,
      cores: t.hardwareConcurrency,
      reserved: t.reservedThreads,
      perWorker: Math.ceil(SeismicConstants.stationCount / t.processorCount),
      overridden: t.overridden,
    };
  });

  protected readonly workers = computed(() =>
    this.status.workers().map((worker) => ({
      index: worker.index + 1,
      stations: worker.stations.map((id) => this.text.stationCode(id)).join(' · '),
      queue: worker.queuedBatches,
      age: this.text.formatNumber(worker.oldestQueuedAgeMs, 0),
      throughput: this.text.formatNumber(worker.samplesPerSecond, 0),
      utilization: Math.min(100, worker.utilization * 100),
      utilizationText: this.text.formatNumber(worker.utilization * 100, 1),
    })),
  );
}
