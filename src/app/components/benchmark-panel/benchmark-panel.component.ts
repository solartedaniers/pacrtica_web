import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { BenchmarkService } from '../../services/benchmark.service';
import { ConsoleTextService } from '../../services/console-text.service';

@Component({
  selector: 'app-benchmark-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './benchmark-panel.component.html',
})
export class BenchmarkPanelComponent {
  private readonly text = inject(ConsoleTextService);
  protected readonly benchmark = inject(BenchmarkService);

  protected readonly rows = computed(() =>
    this.benchmark.rows().map((row) => ({
      size: this.formatSize(row.sizeBytes),
      clone: this.text.formatNumber(row.cloneMs, 3),
      transfer: this.text.formatNumber(row.transferMs, 3),
      speedup: this.text.formatNumber(row.cloneMs / Math.max(0.001, row.transferMs), 1),
    })),
  );

  private formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) {
      return this.text.instant('benchmark.megabytes', { value: this.text.formatNumber(bytes / (1024 * 1024), 2) });
    }
    if (bytes >= 1024) {
      return this.text.instant('benchmark.kilobytes', { value: this.text.formatNumber(bytes / 1024, 1) });
    }
    return this.text.instant('benchmark.bytes', { value: bytes });
  }
}
