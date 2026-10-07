import { describe, it, expect } from 'vitest';
import { Quaternion, Euler } from 'three';
import { sampleClip, eulerToQuat, type Clip } from './clip';

const clip: Clip = {
  name: 'test',
  duration: 1,
  loop: false,
  keyframes: [
    { t: 0, joints: { elbowL: [0, 0, 0] } },
    { t: 1, joints: { elbowL: [-1, 0, 0], kneeR: [0.5, 0, 0] } },
  ],
};

describe('sampleClip', () => {
  it('returns the first keyframe value at t=0', () => {
    const r = sampleClip(clip, 0);
    expect(r.elbowL!.angleTo(new Quaternion())).toBeCloseTo(0, 5);
  });

  it('slerps halfway between two keyframes', () => {
    const r = sampleClip(clip, 0.5);
    expect(r.elbowL!.angleTo(new Quaternion())).toBeCloseTo(0.5, 4);
  });

  it('a joint defined in only one keyframe holds that value', () => {
    const r = sampleClip(clip, 0.2);
    expect(r.kneeR!.angleTo(eulerToQuat([0.5, 0, 0]))).toBeCloseTo(0, 5);
  });

  it('clamps past the end when not looping', () => {
    const r = sampleClip(clip, 5);
    expect(r.elbowL!.angleTo(eulerToQuat([-1, 0, 0]))).toBeCloseTo(0, 5);
  });

  it('wraps time when looping', () => {
    const r = sampleClip({ ...clip, loop: true }, 1.5);
    expect(r.elbowL!.angleTo(new Quaternion())).toBeCloseTo(0.5, 4);
  });

  it('omits joints the clip never mentions', () => {
    expect(sampleClip(clip, 0.3).shoulderL).toBeUndefined();
  });

  it('eulerToQuat uses XYZ order in radians', () => {
    const q = eulerToQuat([0.3, -0.2, 0.1]);
    expect(q.angleTo(new Quaternion().setFromEuler(new Euler(0.3, -0.2, 0.1, 'XYZ')))).toBeCloseTo(0, 6);
  });
});
