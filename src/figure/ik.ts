import { Matrix4, Quaternion, Vector3 } from 'three';

/** Lengths of the two arm bones, from the shoulder joint to the elbow and from the elbow to the hand. */
export const UPPER_ARM = 0.3;
export const FOREARM = 0.28;
/** Elbow hinge range expressed as a bend amount (the joint stores −bend about +X). */
const MAX_BEND = 2.4;

export interface ArmIK {
  /** Upper arm rotation relative to the torso. */
  shoulder: Quaternion;
  /** Forearm rotation relative to the upper arm (pure X hinge). */
  elbow: Quaternion;
  /** False when the target was out of reach and the arm was stretched toward it instead. */
  reached: boolean;
}

function basis(primary: Vector3, secondary: Vector3): Matrix4 {
  const x = primary.clone().normalize();
  const y = secondary.clone().addScaledVector(x, -secondary.dot(x));
  if (y.lengthSq() < 1e-10) y.set(0, 0, 1).addScaledVector(x, -x.z);
  y.normalize();
  const z = new Vector3().crossVectors(x, y);
  return new Matrix4().makeBasis(x, y, z);
}

/**
 * Analytic two-bone IK in the torso frame.
 * `shoulder` is the shoulder joint, `target` where the hand must go, `pole` the direction the elbow should point.
 * Rest pose convention: the arm hangs along −Y and a negative X rotation of the elbow bends the forearm toward +Z.
 */
export function solveArmIK(shoulder: Vector3, target: Vector3, pole: Vector3): ArmIK {
  const toTarget = target.clone().sub(shoulder);
  const raw = toTarget.length();
  const minD = Math.abs(UPPER_ARM - FOREARM) + 1e-4;
  const maxD = UPPER_ARM + FOREARM - 1e-4;
  const d = Math.min(Math.max(raw, minD), maxD);
  const cosElbow = (UPPER_ARM ** 2 + FOREARM ** 2 - d * d) / (2 * UPPER_ARM * FOREARM);
  const bend = Math.min(MAX_BEND, Math.PI - Math.acos(Math.min(1, Math.max(-1, cosElbow))));

  const elbow = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -bend);

  // Hand and elbow positions in the upper-arm frame with the shoulder unrotated.
  const elbowLocal = new Vector3(0, -UPPER_ARM, 0);
  const handLocal = elbowLocal.clone().add(new Vector3(0, -FOREARM, 0).applyQuaternion(elbow));
  if (toTarget.lengthSq() < 1e-10) toTarget.set(0, -1, 0);

  const from = basis(handLocal, elbowLocal);
  const to = basis(toTarget, pole);
  const rot = to.multiply(from.transpose());
  const shoulderQ = new Quaternion().setFromRotationMatrix(rot).normalize();
  return { shoulder: shoulderQ, elbow, reached: raw >= minD && raw <= maxD };
}
