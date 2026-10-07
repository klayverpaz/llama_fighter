import { describe, it, expect } from 'vitest';
import { createFixedStepper } from './loop';

describe('createFixedStepper', () => {
  it('runs one step for exactly one dt', () => {
    const s = createFixedStepper(1 / 60);
    let n = 0;
    expect(s.advance(1 / 60, () => n++)).toBe(1);
    expect(n).toBe(1);
  });

  it('accumulates small frames until a full dt is available', () => {
    const s = createFixedStepper(1 / 60);
    let n = 0;
    expect(s.advance(0.01, () => n++)).toBe(0);
    expect(s.advance(0.01, () => n++)).toBe(1);
    expect(n).toBe(1);
  });

  it('runs two steps for a 30fps frame', () => {
    const s = createFixedStepper(1 / 60);
    expect(s.advance(1 / 30, () => {})).toBe(2);
  });

  it('clamps a huge elapsed time to maxSteps and drops the remainder', () => {
    const s = createFixedStepper(1 / 60, 5);
    expect(s.advance(60, () => {})).toBe(5);
    expect(s.advance(0.001, () => {})).toBe(0);
  });
});
