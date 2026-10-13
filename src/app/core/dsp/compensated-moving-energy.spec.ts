import { CompensatedMovingEnergy } from './compensated-moving-energy';

describe('CompensatedMovingEnergy', () => {
  it('matches the exact moving mean and ignores gaps', () => {
    const energy = new CompensatedMovingEnergy(4);
    [1, 2, 3, 4, 5, Number.NaN, 7].forEach((value) => energy.push(value));
    expect(energy.validCount).toBe(3);
    expect(energy.mean).toBeCloseTo((4 + 5 + 7) / 3, 12);
  });

  it('keeps the running sum non-negative under heavy cancellation', () => {
    const energy = new CompensatedMovingEnergy(6000);
    for (let i = 0; i < 200_000; i++) {
      energy.push(i % 997 === 0 ? 6.4e13 : Math.random() * 1e4);
    }
    expect(energy.mean).toBeGreaterThan(0);
    expect(energy.maxRelativeDrift).toBeLessThan(1e-9);
  });

  it('shows why naive float32 accumulation is unsafe', () => {
    const naive = new Float32Array(1);
    const ring: number[] = [];
    for (let i = 0; i < 100_000; i++) {
      const value = i % 500 === 0 ? 1e9 : 1.37;
      ring.push(value);
      naive[0] = naive[0] + value;
      if (ring.length > 200) {
        naive[0] = naive[0] - (ring.shift() as number);
      }
    }
    const exact = ring.reduce((a, b) => a + b, 0);
    expect(Math.abs(naive[0] - exact) / exact).toBeGreaterThan(1e-3);
  });
});
