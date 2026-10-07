import { describe, it, expect } from 'vitest';
import { Quaternion } from 'three';
import { Animator } from './animator';
import { STANCE, GUARD } from './clips';
import { eulerToQuat, type Clip } from './clip';
import { identityJointRots } from '../figure/fk';

const punch: Clip = {
  name: 'punch',
  duration: 0.4,
  loop: false,
  keyframes: [
    { t: 0, joints: { shoulderL: GUARD.shoulderL! } },
    { t: 0.2, joints: { shoulderL: [-1.57, 0, 0] } },
    { t: 0.4, joints: { shoulderL: GUARD.shoulderL! } },
  ],
};

describe('Animator', () => {
  it('outputs the stance when idle', () => {
    const a = new Animator(STANCE);
    const r = a.update(0);
    expect(r.elbowL.angleTo(eulerToQuat(GUARD.elbowL!))).toBeCloseTo(0, 5);
    expect(r.kneeL.angleTo(eulerToQuat(GUARD.kneeL!))).toBeCloseTo(0, 5);
  });

  it('plays an action over the stance and reports its name until it ends', () => {
    const a = new Animator(STANCE);
    a.update(0);
    a.play(punch, 0);
    expect(a.actionName).toBe('punch');
    a.update(0.2);
    const r = a.update(0);
    expect(r.shoulderL.angleTo(eulerToQuat([-1.57, 0, 0]))).toBeCloseTo(0, 3);
    expect(r.elbowR.angleTo(eulerToQuat(GUARD.elbowR!))).toBeCloseTo(0, 5);
    a.update(0.25);
    expect(a.actionName).toBeNull();
  });

  it('blends from captured rotations toward the target over the given time', () => {
    const a = new Animator(STANCE);
    a.update(0);
    a.blendFromRots(identityJointRots(), 1);
    const start = a.update(0);
    expect(start.elbowL.angleTo(new Quaternion())).toBeCloseTo(0, 4);
    const half = a.update(0.5);
    expect(half.elbowL.angleTo(new Quaternion())).toBeCloseTo(1.0, 2);
    const end = a.update(0.6);
    expect(end.elbowL.angleTo(eulerToQuat(GUARD.elbowL!))).toBeCloseTo(0, 4);
  });

  it('moves the hips when walking and not when standing', () => {
    const a = new Animator(STANCE);
    a.update(0);
    const standing = a.update(0.1, 0).hipL.clone();
    for (let i = 0; i < 20; i++) a.update(0.05, 3);
    const walking = a.update(0.05, 3).hipL;
    expect(walking.angleTo(standing)).toBeGreaterThan(0.05);
  });
});
