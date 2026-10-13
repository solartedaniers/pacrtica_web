export interface TracePalette {
  readonly background: string;
  readonly rowAlternate: string;
  readonly trace: string;
  readonly envelope: string;
  readonly triggerBand: string;
  readonly label: string;
  readonly labelMuted: string;
  readonly grid: string;
  readonly event: string;
  readonly eventBand: string;
  readonly selection: string;
  readonly selectionBorder: string;
  readonly cursor: string;
  readonly fontFamily: string;
}

export class ThemePaletteReader {
  private static readonly variables: Record<keyof TracePalette, string> = {
    background: '--trace-background',
    rowAlternate: '--trace-row-alternate',
    trace: '--trace-line',
    envelope: '--trace-envelope',
    triggerBand: '--trace-trigger-band',
    label: '--trace-label',
    labelMuted: '--trace-label-muted',
    grid: '--trace-grid',
    event: '--trace-event',
    eventBand: '--trace-event-band',
    selection: '--trace-selection',
    selectionBorder: '--trace-selection-border',
    cursor: '--trace-cursor',
    fontFamily: '--font-mono',
  };

  read(element: Element): TracePalette {
    const style = getComputedStyle(element);
    const entries = Object.entries(ThemePaletteReader.variables).map(([key, variable]) => [
      key,
      style.getPropertyValue(variable).trim(),
    ]);
    return Object.fromEntries(entries) as unknown as TracePalette;
  }
}
