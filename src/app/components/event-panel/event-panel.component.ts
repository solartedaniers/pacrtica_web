import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SeismicConstants } from '../../core/config/seismic-constants';
import { SeismicEventSnapshot } from '../../core/protocol/control-messages';
import { ConsoleEventStore } from '../../services/console-event-store.service';
import { ConsoleTextService } from '../../services/console-text.service';
import { ExportService } from '../../services/export.service';
import { TraceViewportService } from '../../services/trace-viewport.service';

@Component({
  selector: 'app-event-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './event-panel.component.html',
})
export class EventPanelComponent {
  private readonly store = inject(ConsoleEventStore);
  private readonly text = inject(ConsoleTextService);
  private readonly exporter = inject(ExportService);
  private readonly view = inject(TraceViewportService);

  protected readonly rows = computed(() => {
    const jobs = this.exporter.jobs();
    return this.store.events().map((event) => ({
      event,
      firstTrigger: this.text.formatPreciseClock(event.firstTriggerUs),
      confirmed: this.text.formatPreciseClock(event.confirmedAtUs),
      duration: event.endUs === null ? null : this.text.formatNumber((event.endUs - event.firstTriggerUs) / 1_000_000, 1),
      stations: event.stations.map((id) => this.text.stationCode(id)).join(' · '),
      peak: this.text.formatNumber(event.peak, 0),
      job: jobs.get(this.exportKey(event.id)) ?? null,
    }));
  });

  protected export(event: SeismicEventSnapshot): void {
    const half = SeismicConstants.exportHalfWindowUs;
    const fileName = this.text.instant('export.eventFileName', {
      id: event.id,
      time: new Date(event.confirmedAtUs / 1000).toISOString().replace(/[:.]/g, '-'),
    });
    this.exporter.requestWindow(this.exportKey(event.id), event.confirmedAtUs - half, event.confirmedAtUs + half, fileName);
  }

  protected focus(event: SeismicEventSnapshot): void {
    this.view.focusOn(event.confirmedAtUs);
  }

  private exportKey(id: number): string {
    return `event-${id}`;
  }
}
