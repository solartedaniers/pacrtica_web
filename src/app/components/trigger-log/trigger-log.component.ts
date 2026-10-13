import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ConsoleEventStore } from '../../services/console-event-store.service';
import { ConsoleTextService } from '../../services/console-text.service';

@Component({
  selector: 'app-trigger-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './trigger-log.component.html',
})
export class TriggerLogComponent {
  private readonly store = inject(ConsoleEventStore);
  private readonly text = inject(ConsoleTextService);
  protected readonly total = this.store.totalTransitions;

  protected readonly entries = computed(() =>
    this.store.transitions().map((entry) => ({
      key: entry.key,
      state: entry.state,
      time: this.text.formatPreciseClock(entry.timeUs),
      station: this.text.stationCode(entry.stationId),
      name: this.text.stationName(entry.stationId),
      ratio: this.text.formatNumber(entry.ratio, 2),
      peak: this.text.formatNumber(entry.peak, 0),
    })),
  );
}
