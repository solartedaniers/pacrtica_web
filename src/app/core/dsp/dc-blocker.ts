export class DcBlocker {
  private previousInput = 0;
  private previousOutput = 0;
  private needsResync = true;

  constructor(private readonly pole: number) {}

  process(sample: number): number {
    if (sample !== sample) {
      this.needsResync = true;
      return Number.NaN;
    }
    if (this.needsResync) {
      this.previousInput = sample;
      this.needsResync = false;
    }
    const output = sample - this.previousInput + this.pole * this.previousOutput;
    this.previousInput = sample;
    this.previousOutput = output;
    return output;
  }
}
