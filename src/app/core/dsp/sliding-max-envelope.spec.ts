import { SlidingMaxEnvelope } from './sliding-max-envelope';

describe('SlidingMaxEnvelope', () => {
  it('returns the absolute maximum of the last window samples', () => {
    const envelope = new SlidingMaxEnvelope(3);
    const outputs = [1, -5, 2, 0, 1, -1, Number.NaN, 0].map((value) => envelope.push(value));
    expect(outputs).toEqual([1, 5, 5, 5, 2, 1, 1, 1]);
  });

  it('agrees with a brute-force scan on random data', () => {
    const window = 50;
    const envelope = new SlidingMaxEnvelope(window);
    const values: number[] = [];
    for (let i = 0; i < 5000; i++) {
      const value = (Math.random() - 0.5) * 1000;
      values.push(value);
      const expected = Math.max(...values.slice(-window).map(Math.abs));
      expect(envelope.push(value)).toBeCloseTo(expected, 9);
    }
  });
});
