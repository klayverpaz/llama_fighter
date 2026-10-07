import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createPhysics, RAPIER, type Physics } from '../physics/world';
import { Figure } from './figure';
import { PELVIS_HEIGHT, SEGMENT_NAMES, JOINT_NAMES } from './skeleton';
import { identityJointRots, yawQuaternion, type Pose } from './fk';
import { eulerToQuat } from '../anim/clip';

function pose(x = 0, z = 0, yaw = 0): Pose {
  return { root: { position: new THREE.Vector3(x, PELVIS_HEIGHT, z), rotation: yawQuaternion(yaw) }, joints: identityJointRots() };
}

function finite(f: Figure): boolean {
  const t = f.readTransforms();
  return SEGMENT_NAMES.every((s) =>
    Number.isFinite(t[s].position.x) && Number.isFinite(t[s].position.y) && Number.isFinite(t[s].position.z) && Number.isFinite(t[s].rotation.w));
}

describe('Figure', () => {
  let physics: Physics;
  beforeAll(async () => {
    physics = await createPhysics();
  });

  it('creates 11 bodies and 10 joints with tagged userData', () => {
    const before = physics.world.bodies.len();
    const f = new Figure(physics, new THREE.Scene(), { id: 'a', color: 0xff0000, position: new THREE.Vector3(0, PELVIS_HEIGHT, 0) });
    expect(physics.world.bodies.len() - before).toBe(11);
    expect(physics.world.impulseJoints.len()).toBe(10);
    expect(f.group.children).toHaveLength(11);
    f.dispose();
    expect(physics.world.bodies.len()).toBe(before);
  });

  it('kinematic bodies follow the applied pose exactly after a step', () => {
    const f = new Figure(physics, new THREE.Scene(), { id: 'b', color: 0, position: new THREE.Vector3(5, PELVIS_HEIGHT, 5) });
    const p = pose(5, 5, 0.4);
    p.joints.elbowL = eulerToQuat([-1.5, 0, 0]);
    f.applyPose(p, 1 / 60);
    physics.step();
    const back = f.readJointRots();
    for (const j of JOINT_NAMES) expect(Math.abs(back[j].dot(p.joints[j]))).toBeCloseTo(1, 4);
    expect(f.readRoot().position.distanceTo(p.root.position)).toBeCloseTo(0, 4);
    expect(f.mode).toBe('posed');
    f.dispose();
  });

  it('ragdolls, falls, stays finite and settles on the ground', () => {
    const f = new Figure(physics, new THREE.Scene(), { id: 'c', color: 0, position: new THREE.Vector3(-5, PELVIS_HEIGHT, -5) });
    f.applyPose(pose(-5, -5), 1 / 60);
    physics.step();
    f.toRagdoll({ segment: 'torso', impulse: new THREE.Vector3(0, 30, 120), point: new THREE.Vector3(-5, 1.3, -5) });
    expect(f.mode).toBe('ragdoll');
    for (let i = 0; i < 60; i++) physics.step();
    expect(finite(f)).toBe(true);
    for (let i = 0; i < 300; i++) physics.step();
    expect(finite(f)).toBe(true);
    expect(f.pelvisPosition().y).toBeLessThan(0.6);
    expect(f.pelvisPosition().y).toBeGreaterThan(-0.2);
    expect(f.maxSpeed()).toBeLessThan(0.6);
    f.dispose();
  });

  it('returns to posed and tracks the pose again', () => {
    const f = new Figure(physics, new THREE.Scene(), { id: 'd', color: 0, position: new THREE.Vector3(8, PELVIS_HEIGHT, -8) });
    f.applyPose(pose(8, -8), 1 / 60);
    physics.step();
    f.toRagdoll();
    for (let i = 0; i < 120; i++) physics.step();
    f.toPosed();
    for (let i = 0; i < 10; i++) { f.applyPose(pose(8, -8), 1 / 60); physics.step(); }
    expect(f.pelvisPosition().y).toBeCloseTo(PELVIS_HEIGHT, 3);
    f.dispose();
  });

  it('limbPoint puts the left hand 0.2 m to +X at rest', () => {
    const f = new Figure(physics, new THREE.Scene(), { id: 'e', color: 0, position: new THREE.Vector3(12, PELVIS_HEIGHT, 12) });
    f.applyPose(pose(12, 12), 1 / 60);
    physics.step();
    const hand = f.limbPoint('handL');
    expect(hand.x).toBeCloseTo(12.2, 3);
    expect(hand.y).toBeCloseTo(PELVIS_HEIGHT + 0.075 + 0.25 + 0.22 - 0.3 - 0.28, 3);
    f.dispose();
  });
});

describe('revolute limit sign convention', () => {
  it('a knee with limits [0, 2.4] about +X cannot bend forward (+Z)', async () => {
    const physics = await createPhysics();
    const w = physics.world;
    const thigh = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 2, 0));
    w.createCollider(RAPIER.ColliderDesc.capsule(0.21, 0.05), thigh);
    const shin = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.58, 0).setAngularDamping(0.5));
    w.createCollider(RAPIER.ColliderDesc.capsule(0.21, 0.045).setMass(4), shin);
    const jd = RAPIER.JointData.revolute({ x: 0, y: -0.21, z: 0 }, { x: 0, y: 0.21, z: 0 }, { x: 1, y: 0, z: 0 });
    const joint = w.getImpulseJoint(w.createImpulseJoint(jd, thigh, shin, true).handle) as RAPIER.RevoluteImpulseJoint;
    joint.setLimits(0, 2.4);
    // Push the foot forward (+Z): the limit must stop it near zero.
    shin.applyImpulseAtPoint({ x: 0, y: 0, z: 6 }, { x: 0, y: 1.37, z: 0 }, true);
    let maxForward = 0;
    for (let i = 0; i < 90; i++) {
      physics.step();
      const foot = new THREE.Vector3(0, -0.21, 0).applyQuaternion(new THREE.Quaternion().copy(shin.rotation() as THREE.Quaternion)).add(shin.translation() as THREE.Vector3);
      maxForward = Math.max(maxForward, foot.z);
    }
    expect(maxForward).toBeLessThan(0.08);
    // And backward (-Z) is free.
    shin.applyImpulseAtPoint({ x: 0, y: 0, z: -6 }, { x: 0, y: 1.37, z: 0 }, true);
    let maxBack = 0;
    for (let i = 0; i < 60; i++) {
      physics.step();
      const foot = new THREE.Vector3(0, -0.21, 0).applyQuaternion(new THREE.Quaternion().copy(shin.rotation() as THREE.Quaternion)).add(shin.translation() as THREE.Vector3);
      maxBack = Math.max(maxBack, -foot.z);
    }
    expect(maxBack).toBeGreaterThan(0.15);
    physics.dispose();
  });
});
