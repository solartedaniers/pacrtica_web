import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ConsoleEventStore } from '../../services/console-event-store.service';
import { ConsoleTextService } from '../../services/console-text.service';
import { TraceViewportService } from '../../services/trace-viewport.service';

@Component({
  selector: 'app-alert-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './alert-banner.component.html',
})
export class AlertBannerComponent {
  private readonly store = inject(ConsoleEventStore);
  private readonly text = inject(ConsoleTextService);
  private readonly view = inject(TraceViewportService);

  protected readonly state = computed(() => {
    const active = this.store.activeEvent();
    const latest = active ?? this.store.latestEvent();
    if (latest === null) {
      return { kind: 'calm' as const, triggered: this.store.triggeredStations().length };
    }
    return {
      kind: active !== null ? ('active' as const) : ('recent' as const),
      id: latest.id,
      confirmedUs: latest.confirmedAtUs,
      time: this.text.formatPreciseClock(latest.confirmedAtUs),
      count: latest.stations.length,
      list: latest.stations.map((id) => this.text.stationCode(id)).join(', '),
      peak: this.text.formatNumber(latest.peak, 0),
      triggered: this.store.triggeredStations().length,
    };
  });

  protected focus(timeUs: number): void {
    this.view.focusOn(timeUs);
  }
}
