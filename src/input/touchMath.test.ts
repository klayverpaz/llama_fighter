import { describe, it, expect } from 'vitest';
import { joystickVector, stickMoveDirection, STICK_DEAD_ZONE } from './touchMath';
import { moveDirection } from '../camera/thirdPerson';

describe('joystickVector', () => {
  it('pushing the thumb up is forward, clamped to the radius', () => {
    const v = joystickVector(0, -120, 60);
    expect(v.y).toBeCloseTo(1, 6);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.magnitude).toBe(1);
  });
  it('half deflection to the right', () => {
    const v = joystickVector(30, 0, 60);
    expect(v.x).toBeCloseTo(0.5, 6);
    expect(v.magnitude).toBeCloseTo(0.5, 6);
  });
  it('no offset is no input', () => {
    expect(joystickVector(0, 0, 60).magnitude).toBe(0);
  });
});

describe('stickMoveDirection', () => {
  it('matches the keyboard basis: stick up = W, stick right = D', () => {
    for (const yaw of [0, 1.1, -2.5]) {
      const none = { forward: false, back: false, left: false, right: false };
      expect(stickMoveDirection(0, 1, yaw).distanceTo(moveDirection({ ...none, forward: true }, yaw))).toBeLessThan(1e-9);
      expect(stickMoveDirection(1, 0, yaw).distanceTo(moveDirection({ ...none, right: true }, yaw))).toBeLessThan(1e-9);
    }
  });
  it('ignores the dead zone', () => {
    expect(stickMoveDirection(STICK_DEAD_ZONE * 0.5, 0, 0).length()).toBe(0);
  });
});
