import { describe, it, expect } from 'vitest';
import { cameraOffset, moveDirection } from './thirdPerson';

describe('cameraOffset', () => {
  it('sits behind (-Z) and above the focus at yaw 0 with positive pitch', () => {
    const o = cameraOffset(0, 0.3, 4);
    expect(o.z).toBeLessThan(0);
    expect(o.y).toBeGreaterThan(0);
    expect(o.length()).toBeCloseTo(4, 6);
  });

  it('rotates with yaw: at yaw +90deg it sits at -X', () => {
    const o = cameraOffset(Math.PI / 2, 0, 4);
    expect(o.x).toBeCloseTo(-4, 6);
    expect(o.z).toBeCloseTo(0, 6);
  });
});

describe('moveDirection', () => {
  const none = { forward: false, back: false, left: false, right: false };

  it('W moves along the camera forward (+Z at yaw 0)', () => {
    const d = moveDirection({ ...none, forward: true }, 0);
    expect(d.x).toBeCloseTo(0, 6);
    expect(d.z).toBeCloseTo(1, 6);
  });

  it('D moves screen-right, which is -X when looking along +Z', () => {
    const d = moveDirection({ ...none, right: true }, 0);
    expect(d.x).toBeCloseTo(-1, 6);
  });

  it('diagonals are unit length and no keys give zero', () => {
    expect(moveDirection({ ...none, forward: true, left: true }, 0.4).length()).toBeCloseTo(1, 6);
    expect(moveDirection(none, 1).length()).toBe(0);
    expect(moveDirection({ ...none, forward: true, back: true }, 1).length()).toBe(0);
  });
});
