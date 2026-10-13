import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { StationNetwork } from '../../core/config/station-network';
import { ConsoleTextService } from '../../services/console-text.service';
import { SeismicPipelineService } from '../../services/seismic-pipeline.service';
import { StatusSnapshotService } from '../../services/status-snapshot.service';

@Component({
  selector: 'app-station-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './station-grid.component.html',
})
export class StationGridComponent {
  private static readonly ratioScaleMax = 8;
  private readonly status = inject(StatusSnapshotService);
  private readonly text = inject(ConsoleTextService);
  private readonly pipeline = inject(SeismicPipelineService);

  protected readonly cards = computed(() => {
    const onRatio = this.pipeline.thresholds().onRatio;
    return this.status.stations().map((station) => ({
      id: station.stationId,
      code: this.text.stationCode(station.stationId),
      name: this.text.stationName(station.stationId),
      zone: StationNetwork[station.stationId - 1].zone,
      triggered: station.triggered,
      channels: station.channels.map((channel) => ({
        key: channel.channelIndex,
        label: this.text.componentLabel(channel.component),
        ratio: this.text.formatNumber(channel.ratio, 2),
        fill: Math.min(100, (Math.max(0, channel.ratio) / StationGridComponent.ratioScaleMax) * 100),
        triggered: channel.triggered,
        frozen: channel.ltaFrozen,
      })),
      threshold: Math.min(100, (onRatio / StationGridComponent.ratioScaleMax) * 100),
    }));
  });
}
