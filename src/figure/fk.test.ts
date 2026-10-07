import { describe, it, expect } from 'vitest';
import { Quaternion, Vector3, Euler } from 'three';
import {
  forwardKinematics, identityJointRots, yawQuaternion, yawFromQuaternion,
  jointRotsFromTransforms, localToWorld, type Pose,
} from './fk';
import { PELVIS_HEIGHT, LIMB_ENDS, JOINT_NAMES } from './skeleton';

function restPose(yaw = 0): Pose {
  return {
    root: { position: new Vector3(0, PELVIS_HEIGHT, 0), rotation: yawQuaternion(yaw) },
    joints: identityJointRots(),
  };
}

describe('forwardKinematics', () => {
  it('stacks torso and head above the pelvis in the rest pose', () => {
    const t = forwardKinematics(restPose());
    expect(t.torso.position.y).toBeCloseTo(PELVIS_HEIGHT + 0.075 + 0.25, 5);
    expect(t.head.position.y).toBeCloseTo(PELVIS_HEIGHT + 0.075 + 0.25 + 0.27 + 0.14, 5);
    expect(t.torso.position.x).toBeCloseTo(0, 5);
  });

  it('puts the left foot near the ground on the +X side', () => {
    const t = forwardKinematics(restPose());
    const foot = localToWorld(t.lowerLegL, LIMB_ENDS.footL.local);
    expect(foot.y).toBeCloseTo(PELVIS_HEIGHT - 0.075 - 0.42 - 0.42, 5);
    expect(foot.x).toBeCloseTo(0.1, 5);
  });

  it('bending the left elbow moves only the left forearm, forward (+Z)', () => {
    const pose = restPose();
    pose.joints.elbowL = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
    const t = forwardKinematics(pose);
    const rest = forwardKinematics(restPose());
    const hand = localToWorld(t.lowerArmL, LIMB_ENDS.handL.local);
    expect(hand.z).toBeCloseTo(0.28, 4);
    expect(t.upperArmL.position.distanceTo(rest.upperArmL.position)).toBeCloseTo(0, 6);
    expect(t.lowerArmR.position.distanceTo(rest.lowerArmR.position)).toBeCloseTo(0, 6);
  });

  it('yaw of +90deg turns the left shoulder from +X to -Z', () => {
    const t = forwardKinematics(restPose(Math.PI / 2));
    expect(t.upperArmL.position.x).toBeCloseTo(0, 5);
    expect(t.upperArmL.position.z).toBeCloseTo(-0.2, 5);
  });

  it('jointRotsFromTransforms inverts forwardKinematics', () => {
    const pose = restPose(0.7);
    pose.joints.kneeR = new Quaternion().setFromEuler(new Euler(1.1, 0, 0));
    pose.joints.shoulderL = new Quaternion().setFromEuler(new Euler(-1.3, 0.2, -0.25));
    const back = jointRotsFromTransforms(forwardKinematics(pose));
    for (const j of JOINT_NAMES) {
      expect(Math.abs(back[j].dot(pose.joints[j]))).toBeCloseTo(1, 5);
    }
  });
});

describe('yaw helpers', () => {
  it('yawFromQuaternion round-trips yawQuaternion', () => {
    for (const yaw of [0, 0.5, -2.0, 3.0]) {
      const back = yawFromQuaternion(yawQuaternion(yaw));
      expect(Math.atan2(Math.sin(back - yaw), Math.cos(back - yaw))).toBeCloseTo(0, 5);
    }
  });
});
