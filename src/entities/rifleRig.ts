import { Matrix4, Quaternion, Vector3 } from 'three';
import type { SegmentTransform } from '../figure/fk';
import { solveArmIK } from '../figure/ik';
import { AK_POINTS } from '../weapons/akModel';
import type { GunPoints } from '../weapons/guns';
import { SHOTGUN } from '../weapons/shotgun';

/** Shoulder joints in the torso frame (left is +X). */
const SHOULDER_L = new Vector3(0.2, 0.22, 0);
const SHOULDER_R = new Vector3(-0.2, 0.22, 0);
/** Elbow pole directions in the torso frame: right elbow out and down, left elbow under the handguard. */
const POLE_R = new Vector3(-1, -0.8, -0.2);
const POLE_L = new Vector3(0.5, -1, 0.2);

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

export interface RigInput {
  /** Torso world transform for this tick (from FK). */
  torso: SegmentTransform;
  /** World point the rifle should point at. */
  aimPoint: Vector3;
  /** 0 = low ready, 1 = shouldered and aiming. */
  aimBlend: number;
  /** Reload progress 0..1, or null when not reloading. */
  reloadPhase: number | null;
  /** 0 = slung on the back, 1 = in the hands. */
  swap: number;
}

export interface GunRigInput {
  torso: SegmentTransform;
  aimPoint: Vector3;
  aimBlend: number;
  swap: number;
  points: GunPoints;
  /** Reload in progress: animation style, progress 0..1 (whole mag, or the current shell) and pose weight 0..1. */
  reload: { style: 'mag' | 'shell'; phase: number; weight: number } | null;
  /** Pump stroke 0..1 (shotgun forend travel); 0 for guns without one. */
  pump: number;
  /** Which shoulder the gun comes from when drawn (see holsterPose). */
  holsterSide?: 1 | -1;
}

export interface RigOutput {
  gunPosition: Vector3;
  gunRotation: Quaternion;
  /** Forend slide in the gun frame (metres). */
  pumpOffset: number;
  /** Gun-local offset of the magazine (reload animation) and whether it is visible. */
  magOffset: Vector3;
  magVisible: boolean;
  /** Arm joint overrides; arms not listed keep the animator pose. */
  joints: Partial<Record<'shoulderR' | 'elbowR' | 'shoulderL' | 'elbowL', Quaternion>>;
  handR: Vector3 | null;
  handL: Vector3 | null;
}

interface GunPose { position: Vector3; rotation: Quaternion }

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const axisAngle = (axis: Vector3, angle: number) => new Quaternion().setFromAxisAngle(axis, angle);

/** Rotation that turns local +Z toward `dir` with no roll (yaw about Y, then pitch about X; positive pitch = down). */
export function quatFromDir(dir: Vector3): Quaternion {
  const d = dir.clone().normalize();
  const yaw = Math.atan2(d.x, d.z);
  const pitch = Math.asin(Math.min(1, Math.max(-1, -d.y)));
  return axisAngle(Y, yaw).multiply(axisAngle(X, pitch));
}

function toWorld(torso: SegmentTransform, local: Vector3): Vector3 {
  return local.clone().applyQuaternion(torso.rotation).add(torso.position);
}

function gunPoint(pose: GunPose, local: Vector3): Vector3 {
  return local.clone().applyQuaternion(pose.rotation).add(pose.position);
}

function aimPose(torso: SegmentTransform, aimPoint: Vector3, points: GunPoints): GunPose {
  // Butt in the shoulder pocket: just inboard, above and in front of the right shoulder joint, in the aim's own frame.
  const shoulder = toWorld(torso, SHOULDER_R);
  const heading = quatFromDir(aimPoint.clone().sub(shoulder).setY(0));
  const butt = shoulder.add(new Vector3(0.06, 0.02, 0.06).applyQuaternion(heading));
  const rotation = quatFromDir(aimPoint.clone().sub(butt));
  const position = butt.clone().sub(points.butt.clone().applyQuaternion(rotation));
  return { position, rotation };
}

function lowReadyPose(torso: SegmentTransform): GunPose {
  const rotation = torso.rotation.clone().multiply(axisAngle(Y, 0.75)).multiply(axisAngle(X, 0.5));
  return { position: toWorld(torso, new Vector3(-0.12, -0.02, 0.2)), rotation };
}

function reloadPose(torso: SegmentTransform): GunPose {
  const rotation = torso.rotation.clone()
    .multiply(axisAngle(Y, 0.35)).multiply(axisAngle(X, 0.2)).multiply(axisAngle(Z, -0.5));
  return { position: toWorld(torso, new Vector3(-0.06, 0.04, 0.22)), rotation };
}

/**
 * Slung across the back: side +1 = barrel up over the left shoulder, −1 = over the right shoulder
 * (two guns on the back cross in an X).
 */
export function holsterPose(torso: SegmentTransform, points: GunPoints, side: 1 | -1 = 1): GunPose {
  const zAxis = new Vector3(0.55 * side, 0.83, 0).normalize();
  const xAxis = new Vector3(0, 0, -side);
  const yAxis = new Vector3().crossVectors(zAxis, xAxis);
  const local = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(xAxis, yAxis, zAxis));
  const rotation = torso.rotation.clone().multiply(local);
  const centre = toWorld(torso, new Vector3(0, 0.02, side === 1 ? -0.14 : -0.18));
  return { position: centre.sub(points.centre.clone().applyQuaternion(rotation)), rotation };
}

function blendPose(a: GunPose, b: GunPose, t: number): GunPose {
  return { position: a.position.clone().lerp(b.position, t), rotation: a.rotation.clone().slerp(b.rotation, t) };
}

/** Left hand target (gun-local) and magazine offset along the reload timeline. */
function reloadHand(phase: number, points: GunPoints = AK_POINTS): { hand: Vector3; magOffset: Vector3; magVisible: boolean } {
  const guard = points.handguard;
  const well = points.magWell.clone().add(new Vector3(0, -0.06, 0.03));
  const out = new Vector3(0, -0.15, -0.09);
  const zero = new Vector3();
  if (phase < 0.15) return { hand: guard.clone().lerp(well, smooth(phase / 0.15)), magOffset: zero, magVisible: true };
  if (phase < 0.35) {
    const s = smooth((phase - 0.15) / 0.2);
    const off = out.clone().multiplyScalar(s);
    return { hand: well.clone().add(off), magOffset: off, magVisible: true };
  }
  if (phase < 0.45) return { hand: well.clone().add(out), magOffset: out.clone(), magVisible: false };
  if (phase < 0.65) {
    const s = smooth((phase - 0.45) / 0.2);
    const off = out.clone().multiplyScalar(1 - s);
    return { hand: well.clone().add(off), magOffset: off, magVisible: true };
  }
  const handle = points.chargingHandle.clone().add(new Vector3(-0.02, 0, 0));
  if (phase < 0.75) return { hand: well.clone().lerp(handle, smooth((phase - 0.65) / 0.1)), magOffset: zero, magVisible: true };
  if (phase < 0.85) {
    const pull = Math.sin(clamp01((phase - 0.75) / 0.1) * Math.PI) * 0.09;
    return { hand: handle.clone().add(new Vector3(0, 0, -pull)), magOffset: zero, magVisible: true };
  }
  return { hand: handle.clone().lerp(guard, smooth((phase - 0.85) / 0.15)), magOffset: zero, magVisible: true };
}

/** Shell-by-shell: the left hand goes from the forend to the loading port under the receiver and back. */
function shellHand(phase: number, points: GunPoints): Vector3 {
  const port = points.magWell.clone().add(new Vector3(0, -0.05, 0));
  const t = phase < 0.5 ? smooth(phase / 0.5) : smooth((1 - phase) / 0.5);
  return points.handguard.clone().lerp(port, t);
}

export function reloadWeight(phase: number): number {
  return smooth(clamp01(Math.min(phase / 0.12, (1 - phase) / 0.12)));
}

/** The AK-47 rig (whole-magazine reload), kept as the simple entry point. */
export function solveRifleRig(input: RigInput): RigOutput {
  const phase = input.reloadPhase === null ? null : clamp01(input.reloadPhase);
  return solveGunRig({
    torso: input.torso,
    aimPoint: input.aimPoint,
    aimBlend: input.aimBlend,
    swap: input.swap,
    points: AK_POINTS,
    reload: phase === null ? null : { style: 'mag', phase, weight: reloadWeight(phase) },
    pump: 0,
  });
}

export function solveGunRig(input: GunRigInput): RigOutput {
  const { torso, points } = input;
  let hands = blendPose(lowReadyPose(torso), aimPose(torso, input.aimPoint, points), smooth(clamp01(input.aimBlend)));
  const pumpOffset = clamp01(input.pump) * SHOTGUN.pumpTravel;
  let leftLocal = points.handguard.clone().add(new Vector3(0, 0, -pumpOffset));
  let magOffset = new Vector3();
  let magVisible = true;
  if (input.reload) {
    const p = clamp01(input.reload.phase);
    hands = blendPose(hands, reloadPose(torso), clamp01(input.reload.weight));
    if (input.reload.style === 'mag') {
      const r = reloadHand(p, points);
      leftLocal = r.hand;
      magOffset = r.magOffset;
      magVisible = r.magVisible;
    } else {
      leftLocal = shellHand(p, points);
    }
  }
  const swap = smooth(clamp01(input.swap));
  const gun = swap >= 1 ? hands : blendPose(holsterPose(torso, points, input.holsterSide ?? 1), hands, swap);

  const inv = torso.rotation.clone().invert();
  const toTorso = (p: Vector3) => p.clone().sub(torso.position).applyQuaternion(inv);

  const handR = gunPoint(gun, points.grip);
  const right = solveArmIK(SHOULDER_R, toTorso(handR), POLE_R);
  const joints: RigOutput['joints'] = { shoulderR: right.shoulder, elbowR: right.elbow };

  let handL: Vector3 | null = null;
  if (input.swap >= 0.6) {
    handL = gunPoint(gun, leftLocal);
    const left = solveArmIK(SHOULDER_L, toTorso(handL), POLE_L);
    joints.shoulderL = left.shoulder;
    joints.elbowL = left.elbow;
  }

  return { gunPosition: gun.position, gunRotation: gun.rotation, pumpOffset, magOffset, magVisible, joints, handR, handL };
}

export function muzzleOf(out: Pick<RigOutput, 'gunPosition' | 'gunRotation'>, points: GunPoints = AK_POINTS): Vector3 {
  return points.muzzle.clone().applyQuaternion(out.gunRotation).add(out.gunPosition);
}
