import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SeismicConstants } from '../../core/config/seismic-constants';
import { ConsoleTextService } from '../../services/console-text.service';
import { StatusSnapshotService } from '../../services/status-snapshot.service';

@Component({
  selector: 'app-ingest-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './ingest-panel.component.html',
})
export class IngestPanelComponent {
  private readonly status = inject(StatusSnapshotService);
  private readonly text = inject(ConsoleTextService);
  protected readonly policy = {
    ms: SeismicConstants.reorderWindowMs,
    positions: SeismicConstants.maxDisorderPositions,
  };

  protected readonly view = computed(() => {
    const ingest = this.status.ingest();
    if (ingest === null) {
      return null;
    }
    const f = (value: number, digits = 0) => this.text.formatNumber(value, digits);
    return {
      rate: f(ingest.framesPerSecond, 0),
      kbps: f(ingest.kilobytesPerSecond, 1),
      samplesPerSecond: f(ingest.framesPerSecond * SeismicConstants.samplesPerFrame, 0),
      rows: [
        { key: 'ingest.received', detected: f(ingest.framesReceived), injected: null },
        { key: 'ingest.delivered', detected: f(ingest.delivered), injected: null },
        { key: 'ingest.duplicates', detected: f(ingest.duplicates), injected: f(ingest.injectedDuplicates) },
        { key: 'ingest.reordered', detected: f(ingest.outOfOrder), injected: f(ingest.injectedDisorder) },
        { key: 'ingest.pending', detected: f(ingest.pendingFrames), injected: null },
        { key: 'ingest.lost', detected: f(ingest.lostFrames), injected: f(ingest.injectedLost) },
        { key: 'ingest.late', detected: f(ingest.lateDiscarded), injected: null },
      ],
    };
  });
}
