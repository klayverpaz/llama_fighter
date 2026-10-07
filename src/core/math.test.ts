import { describe, it, expect } from 'vitest';
import { clamp, lerpAngle, wrapAngle } from './math';

describe('math', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('wrapAngle keeps angles in (-pi, pi]', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('lerpAngle takes the short way around', () => {
    expect(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI, 5);
    expect(lerpAngle(0, 1, 0.25)).toBeCloseTo(0.25, 6);
  });
});
