import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SeismicConstants } from '../../core/config/seismic-constants';
import { SeismicPipelineService } from '../../services/seismic-pipeline.service';

@Component({
  selector: 'app-detector-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './detector-settings.component.html',
})
export class DetectorSettingsComponent {
  private readonly pipeline = inject(SeismicPipelineService);
  protected readonly onRatio = signal(this.pipeline.thresholds().onRatio);
  protected readonly offRatio = signal(this.pipeline.thresholds().offRatio);
  protected readonly constants = {
    sta: SeismicConstants.staWindowSamples,
    staSeconds: SeismicConstants.staWindowSamples / SeismicConstants.sampleRateHz,
    lta: SeismicConstants.ltaWindowSamples,
    ltaSeconds: SeismicConstants.ltaWindowSamples / SeismicConstants.sampleRateHz,
    stations: SeismicConstants.coincidenceStations,
    window: SeismicConstants.coincidenceWindowUs / 1_000_000,
    envelope: SeismicConstants.envelopeWindowSamples / SeismicConstants.sampleRateHz,
  };
  protected readonly valid = computed(() => this.offRatio() > 0 && this.offRatio() < this.onRatio());
  protected readonly dirty = computed(() => {
    const current = this.pipeline.thresholds();
    return current.onRatio !== this.onRatio() || current.offRatio !== this.offRatio();
  });

  protected setOn(event: Event): void {
    this.onRatio.set(Number((event.target as HTMLInputElement).value));
  }

  protected setOff(event: Event): void {
    this.offRatio.set(Number((event.target as HTMLInputElement).value));
  }

  protected apply(): void {
    if (this.valid()) {
      this.pipeline.updateThresholds({ onRatio: this.onRatio(), offRatio: this.offRatio() });
    }
  }

  protected restore(): void {
    this.onRatio.set(SeismicConstants.defaultTriggerOnRatio);
    this.offRatio.set(SeismicConstants.defaultTriggerOffRatio);
    this.apply();
  }
}
