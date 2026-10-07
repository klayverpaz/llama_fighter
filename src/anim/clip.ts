import { Euler, Quaternion } from 'three';
import { JOINT_NAMES, type JointName } from '../figure/skeleton';

/** Radians, applied in XYZ order. */
export type EulerXYZ = [number, number, number];
export type JointEulers = Partial<Record<JointName, EulerXYZ>>;

export interface Keyframe {
  t: number;
  joints: JointEulers;
}

export interface Clip {
  name: string;
  duration: number;
  loop: boolean;
  /** Sorted by t ascending. */
  keyframes: Keyframe[];
}

export type PartialJointRots = Partial<Record<JointName, Quaternion>>;

export function eulerToQuat(e: EulerXYZ): Quaternion {
  return new Quaternion().setFromEuler(new Euler(e[0], e[1], e[2], 'XYZ'));
}

function clipTime(clip: Clip, time: number): number {
  if (clip.duration <= 0) return 0;
  if (clip.loop) {
    const t = time % clip.duration;
    return t < 0 ? t + clip.duration : t;
  }
  return Math.min(Math.max(time, 0), clip.duration);
}

/** Per joint, interpolate between the nearest keyframes that define that joint. */
export function sampleClip(clip: Clip, time: number): PartialJointRots {
  const t = clipTime(clip, time);
  const out: PartialJointRots = {};
  for (const joint of JOINT_NAMES) {
    let before: Keyframe | null = null;
    let after: Keyframe | null = null;
    for (const kf of clip.keyframes) {
      if (kf.joints[joint] === undefined) continue;
      if (kf.t <= t) before = kf;
      if (kf.t >= t && after === null) after = kf;
    }
    if (!before && !after) continue;
    if (!before) { out[joint] = eulerToQuat(after!.joints[joint]!); continue; }
    if (!after || after === before || after.t === before.t) { out[joint] = eulerToQuat(before.joints[joint]!); continue; }
    const k = (t - before.t) / (after.t - before.t);
    out[joint] = eulerToQuat(before.joints[joint]!).slerp(eulerToQuat(after.joints[joint]!), k);
  }
  return out;
}
