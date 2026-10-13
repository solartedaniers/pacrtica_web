import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ChannelIndex, SeismicConstants } from '../core/config/seismic-constants';
import { ChannelComponentCodes, StationNetwork } from '../core/config/station-network';

@Injectable({ providedIn: 'root' })
export class ConsoleTextService {
  private readonly translate = inject(TranslateService);
  private clockFormatter: Intl.DateTimeFormat | null = null;
  private preciseFormatter: Intl.DateTimeFormat | null = null;

  get locale(): string {
    return this.translate.instant('app.locale');
  }

  stationCode(stationId: number): string {
    const station = StationNetwork[stationId - 1];
    return station === undefined ? '' : this.translate.instant(`stations.${station.code}.code`);
  }

  stationName(stationId: number): string {
    const station = StationNetwork[stationId - 1];
    return station === undefined ? '' : this.translate.instant(`stations.${station.code}.name`);
  }

  componentLabel(component: number): string {
    return this.translate.instant(`channels.${ChannelComponentCodes[component]}`);
  }

  rowLabels(): string[] {
    const labels: string[] = [];
    for (let channel = 0; channel < SeismicConstants.channelCount; channel++) {
      const stationId = ChannelIndex.stationOf(channel);
      labels.push(
        this.translate.instant('seismogram.rowLabel', {
          code: this.stationCode(stationId),
          component: this.componentLabel(ChannelIndex.componentOf(channel)),
        }),
      );
    }
    return labels;
  }

  columnLabels(): string[] {
    const labels: string[] = [];
    for (let channel = 0; channel < SeismicConstants.channelCount; channel++) {
      const stationId = ChannelIndex.stationOf(channel);
      labels.push(
        this.translate.instant('export.columnLabel', {
          code: this.stationCode(stationId),
          component: this.componentLabel(ChannelIndex.componentOf(channel)),
        }),
      );
    }
    return labels;
  }

  formatClock(timeUs: number): string {
    this.clockFormatter ??= new Intl.DateTimeFormat(this.locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return Number.isFinite(timeUs) && timeUs > 0 ? this.clockFormatter.format(timeUs / 1000) : this.instant('common.noValue');
  }

  formatPreciseClock(timeUs: number): string {
    this.preciseFormatter ??= new Intl.DateTimeFormat(this.locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hour12: false,
    });
    return Number.isFinite(timeUs) && timeUs > 0 ? this.preciseFormatter.format(timeUs / 1000) : this.instant('common.noValue');
  }

  formatNumber(value: number, digits = 0): string {
    if (!Number.isFinite(value)) {
      return this.instant('common.noValue');
    }
    return value.toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  instant(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }
}
