import { Quaternion, Vector3 } from 'three';
import { SEGMENTS, JOINT_NAMES, type JointName, type SegmentName, segmentDef } from './skeleton';

export type JointRots = Record<JointName, Quaternion>;

export interface RootTransform {
  position: Vector3;
  rotation: Quaternion;
}

export interface Pose {
  root: RootTransform;
  joints: JointRots;
}

export interface SegmentTransform {
  position: Vector3;
  rotation: Quaternion;
}

export type SegmentTransforms = Record<SegmentName, SegmentTransform>;

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);

export function identityJointRots(): JointRots {
  const out = {} as JointRots;
  for (const j of JOINT_NAMES) out[j] = new Quaternion();
  return out;
}

export function cloneJointRots(rots: JointRots): JointRots {
  const out = {} as JointRots;
  for (const j of JOINT_NAMES) out[j] = rots[j].clone();
  return out;
}

export function yawQuaternion(yaw: number): Quaternion {
  return new Quaternion().setFromAxisAngle(UP, yaw);
}

/** Heading of the rotated +Z axis projected on the ground; 0 if it points straight up/down. */
export function yawFromQuaternion(q: Quaternion): number {
  const f = FORWARD.clone().applyQuaternion(q);
  if (f.x * f.x + f.z * f.z < 1e-4) return 0;
  return Math.atan2(f.x, f.z);
}

export function localToWorld(t: SegmentTransform, local: Vector3): Vector3 {
  return local.clone().applyQuaternion(t.rotation).add(t.position);
}

/** Pose → world transform of every segment. `scale` sizes the whole skeleton (the boss is 4×). */
export function forwardKinematics(pose: Pose, scale = 1): SegmentTransforms {
  const out = {} as SegmentTransforms;
  for (const seg of SEGMENTS) {
    if (seg.parent === null || seg.joint === null) {
      out[seg.name] = { position: pose.root.position.clone(), rotation: pose.root.rotation.clone() };
      continue;
    }
    const parent = out[seg.parent];
    const jointWorld = seg.parentAnchor.clone().multiplyScalar(scale).applyQuaternion(parent.rotation).add(parent.position);
    const rotation = parent.rotation.clone().multiply(pose.joints[seg.joint]);
    const position = jointWorld.sub(seg.selfAnchor.clone().multiplyScalar(scale).applyQuaternion(rotation));
    out[seg.name] = { position, rotation };
  }
  return out;
}

/** Recover joint rotations from world transforms: q_joint = inverse(parentRot) * childRot. */
export function jointRotsFromTransforms(t: SegmentTransforms): JointRots {
  const out = identityJointRots();
  for (const seg of SEGMENTS) {
    if (seg.parent === null || seg.joint === null) continue;
    const parentRot = t[seg.parent].rotation;
    out[seg.joint] = parentRot.clone().invert().multiply(t[seg.name].rotation).normalize();
  }
  return out;
}

export function segmentLength(name: SegmentName): number {
  return segmentDef(name).length;
}
