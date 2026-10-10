import { Vector3 } from 'three';
import { TUNING } from '../tuning/tuning';

export type SegmentName =
  | 'pelvis' | 'torso' | 'head'
  | 'upperArmL' | 'lowerArmL' | 'upperArmR' | 'lowerArmR'
  | 'upperLegL' | 'lowerLegL' | 'upperLegR' | 'lowerLegR';

export type JointName =
  | 'spine' | 'neck'
  | 'shoulderL' | 'elbowL' | 'shoulderR' | 'elbowR'
  | 'hipL' | 'kneeL' | 'hipR' | 'kneeR';

export type Limb = 'handL' | 'handR' | 'footL' | 'footR';

export type JointKind =
  | { kind: 'spherical'; springStiffness: number; springDamping: number }
  | { kind: 'revolute'; axis: Vector3; limits: [number, number] };

export interface SegmentDef {
  name: SegmentName;
  parent: SegmentName | null;
  joint: JointName | null;
  /** Capsule cylinder length along local Y (0 = ball). */
  length: number;
  radius: number;
  mass: number;
  /** Joint position in the parent's local frame. */
  parentAnchor: Vector3;
  /** Joint position in this segment's local frame. */
  selfAnchor: Vector3;
  jointKind: JointKind | null;
}

const X = new Vector3(1, 0, 0);
const soft = (k: number, d: number): JointKind => ({ kind: 'spherical', springStiffness: k, springDamping: d });
const hinge = (limits: [number, number]): JointKind => ({ kind: 'revolute', axis: X.clone(), limits });

/** Pelvis center height when standing. */
export const PELVIS_HEIGHT = 0.96;

/** Parent-first order: FK walks this array top to bottom. */
export const SEGMENTS: SegmentDef[] = [
  { name: 'pelvis', parent: null, joint: null, length: 0.15, radius: 0.08, mass: 10,
    parentAnchor: new Vector3(), selfAnchor: new Vector3(), jointKind: null },
  { name: 'torso', parent: 'pelvis', joint: 'spine', length: 0.5, radius: 0.1, mass: 20,
    parentAnchor: new Vector3(0, 0.075, 0), selfAnchor: new Vector3(0, -0.25, 0), jointKind: soft(40, 4) },
  { name: 'head', parent: 'torso', joint: 'neck', length: 0, radius: 0.12, mass: 4,
    parentAnchor: new Vector3(0, 0.27, 0), selfAnchor: new Vector3(0, -0.14, 0), jointKind: soft(15, 1.5) },
  { name: 'upperArmL', parent: 'torso', joint: 'shoulderL', length: 0.3, radius: 0.04, mass: 2.5,
    parentAnchor: new Vector3(0.2, 0.22, 0), selfAnchor: new Vector3(0, 0.15, 0), jointKind: soft(10, 1) },
  { name: 'lowerArmL', parent: 'upperArmL', joint: 'elbowL', length: 0.28, radius: 0.035, mass: 1.5,
    parentAnchor: new Vector3(0, -0.15, 0), selfAnchor: new Vector3(0, 0.14, 0), jointKind: hinge([-2.4, 0]) },
  { name: 'upperArmR', parent: 'torso', joint: 'shoulderR', length: 0.3, radius: 0.04, mass: 2.5,
    parentAnchor: new Vector3(-0.2, 0.22, 0), selfAnchor: new Vector3(0, 0.15, 0), jointKind: soft(10, 1) },
  { name: 'lowerArmR', parent: 'upperArmR', joint: 'elbowR', length: 0.28, radius: 0.035, mass: 1.5,
    parentAnchor: new Vector3(0, -0.15, 0), selfAnchor: new Vector3(0, 0.14, 0), jointKind: hinge([-2.4, 0]) },
  { name: 'upperLegL', parent: 'pelvis', joint: 'hipL', length: 0.42, radius: 0.05, mass: 7,
    parentAnchor: new Vector3(0.1, -0.075, 0), selfAnchor: new Vector3(0, 0.21, 0), jointKind: soft(20, 2) },
  { name: 'lowerLegL', parent: 'upperLegL', joint: 'kneeL', length: 0.42, radius: 0.045, mass: 4,
    parentAnchor: new Vector3(0, -0.21, 0), selfAnchor: new Vector3(0, 0.21, 0), jointKind: hinge([0, 2.4]) },
  { name: 'upperLegR', parent: 'pelvis', joint: 'hipR', length: 0.42, radius: 0.05, mass: 7,
    parentAnchor: new Vector3(-0.1, -0.075, 0), selfAnchor: new Vector3(0, 0.21, 0), jointKind: soft(20, 2) },
  { name: 'lowerLegR', parent: 'upperLegR', joint: 'kneeR', length: 0.42, radius: 0.045, mass: 4,
    parentAnchor: new Vector3(0, -0.21, 0), selfAnchor: new Vector3(0, 0.21, 0), jointKind: hinge([0, 2.4]) },
];

export const SEGMENT_NAMES: SegmentName[] = SEGMENTS.map((s) => s.name);
export const JOINT_NAMES: JointName[] = SEGMENTS.flatMap((s) => (s.joint ? [s.joint] : []));

export function segmentDef(name: SegmentName): SegmentDef {
  const def = SEGMENTS.find((s) => s.name === name);
  if (!def) throw new Error(`unknown segment ${name}`);
  return def;
}

/** Where hands and feet are, in the local frame of the segment that owns them. */
export const LIMB_ENDS: Record<Limb, { segment: SegmentName; local: Vector3 }> = {
  handL: { segment: 'lowerArmL', local: new Vector3(0, -0.14, 0) },
  handR: { segment: 'lowerArmR', local: new Vector3(0, -0.14, 0) },
  footL: { segment: 'lowerLegL', local: new Vector3(0, -0.21, 0) },
  footR: { segment: 'lowerLegR', local: new Vector3(0, -0.21, 0) },
};

export const BODY_TUNING = TUNING.body;
