import * as THREE from 'three';
import { RAPIER, type Physics, type BodyTag } from '../physics/world';
import {
  SEGMENTS, SEGMENT_NAMES, LIMB_ENDS, BODY_TUNING, type SegmentName, type Limb,
} from './skeleton';
import {
  forwardKinematics, identityJointRots, jointRotsFromTransforms, yawQuaternion,
  type JointRots, type Pose, type RootTransform, type SegmentTransforms,
} from './fk';

export type FigureMode = 'posed' | 'ragdoll';

export interface FigureOptions {
  id: string;
  color: number;
  /** Pelvis center. */
  position: THREE.Vector3;
  yaw?: number;
}

export interface HitImpulse {
  segment: SegmentName;
  impulse: THREE.Vector3;
  point: THREE.Vector3;
}

interface RootBlend { from: RootTransform; t: number; duration: number }

/**
 * Rapier 0.21 types spherical joints as GenericImpulseJoint, which hides the motor API.
 * Configure a position motor at angle 0 on all three angular axes directly on the raw set:
 * it acts as a soft spring pulling the joint back toward the rest pose.
 */
function setSphericalSpring(joint: RAPIER.ImpulseJoint, stiffness: number, damping: number): void {
  const raw = joint as unknown as {
    handle: number;
    rawSet: { jointConfigureMotorPosition(h: number, axis: number, target: number, k: number, d: number): void };
  };
  for (const axis of [RAPIER.JointAxis.AngX, RAPIER.JointAxis.AngY, RAPIER.JointAxis.AngZ]) {
    raw.rawSet.jointConfigureMotorPosition(raw.handle, axis, 0, stiffness, damping);
  }
}

export class Figure {
  readonly id: string;
  mode: FigureMode = 'posed';
  readonly group = new THREE.Group();
  private readonly bodies = {} as Record<SegmentName, RAPIER.RigidBody>;
  private readonly meshes = {} as Record<SegmentName, THREE.Mesh>;
  private readonly joints: RAPIER.ImpulseJoint[] = [];
  private rootBlend: RootBlend | null = null;

  constructor(private readonly physics: Physics, scene: THREE.Scene, opts: FigureOptions) {
    this.id = opts.id;
    const world = physics.world;
    const rest = forwardKinematics({
      root: { position: opts.position.clone(), rotation: yawQuaternion(opts.yaw ?? 0) },
      joints: identityJointRots(),
    });
    const material = new THREE.MeshToonMaterial({ color: opts.color });

    for (const seg of SEGMENTS) {
      const t = rest[seg.name];
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(t.position.x, t.position.y, t.position.z)
          .setRotation(t.rotation)
          .setLinearDamping(BODY_TUNING.linearDamping)
          .setAngularDamping(BODY_TUNING.angularDamping)
          .setCcdEnabled(true),
      );
      body.userData = { figureId: this.id, segment: seg.name } satisfies BodyTag;
      const shape = seg.length > 0
        ? RAPIER.ColliderDesc.capsule(seg.length / 2, seg.radius)
        : RAPIER.ColliderDesc.ball(seg.radius);
      world.createCollider(
        shape.setMass(seg.mass)
          .setFriction(BODY_TUNING.friction)
          .setRestitution(BODY_TUNING.restitution)
          .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS),
        body,
      );
      this.bodies[seg.name] = body;

      const geometry = seg.length > 0
        ? new THREE.CapsuleGeometry(seg.radius, seg.length, 4, 12)
        : new THREE.SphereGeometry(seg.radius, 16, 12);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.copy(t.position);
      mesh.quaternion.copy(t.rotation);
      this.meshes[seg.name] = mesh;
      this.group.add(mesh);
    }

    for (const seg of SEGMENTS) {
      if (!seg.parent || !seg.jointKind) continue;
      const parent = this.bodies[seg.parent];
      const child = this.bodies[seg.name];
      const data = seg.jointKind.kind === 'revolute'
        ? RAPIER.JointData.revolute(seg.parentAnchor, seg.selfAnchor, seg.jointKind.axis)
        : RAPIER.JointData.spherical(seg.parentAnchor, seg.selfAnchor);
      const created = world.createImpulseJoint(data, parent, child, true);
      const joint = world.getImpulseJoint(created.handle);
      joint.setContactsEnabled(false);
      if (seg.jointKind.kind === 'revolute') {
        (joint as RAPIER.RevoluteImpulseJoint).setLimits(seg.jointKind.limits[0], seg.jointKind.limits[1]);
      } else {
        setSphericalSpring(joint, seg.jointKind.springStiffness, seg.jointKind.springDamping);
      }
      this.joints.push(joint);
    }

    scene.add(this.group);
  }

  /** Posed mode only: drive every kinematic body to the FK result of `pose`. */
  applyPose(pose: Pose, dt: number): void {
    if (this.mode !== 'posed') return;
    let root = pose.root;
    if (this.rootBlend) {
      this.rootBlend.t += dt;
      const k = Math.min(1, this.rootBlend.t / this.rootBlend.duration);
      root = {
        position: this.rootBlend.from.position.clone().lerp(pose.root.position, k),
        rotation: this.rootBlend.from.rotation.clone().slerp(pose.root.rotation, k),
      };
      if (k >= 1) this.rootBlend = null;
    }
    const transforms = forwardKinematics({ root, joints: pose.joints });
    for (const name of SEGMENT_NAMES) {
      const t = transforms[name];
      this.bodies[name].setNextKinematicTranslation(t.position);
      this.bodies[name].setNextKinematicRotation(t.rotation);
    }
  }

  /** Switch to dynamic bodies, keeping the current kinematic velocity, then apply the hit. */
  toRagdoll(hit?: HitImpulse): void {
    if (this.mode === 'ragdoll') return;
    this.mode = 'ragdoll';
    this.rootBlend = null;
    for (const name of SEGMENT_NAMES) {
      const b = this.bodies[name];
      const lv = b.linvel();
      const av = b.angvel();
      b.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      b.setLinvel(lv, true);
      b.setAngvel(av, true);
    }
    if (hit) this.bodies[hit.segment].applyImpulseAtPoint(hit.impulse, hit.point, true);
  }

  toPosed(): void {
    if (this.mode === 'posed') return;
    this.mode = 'posed';
    for (const name of SEGMENT_NAMES) {
      const b = this.bodies[name];
      b.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /** Next applyPose calls interpolate the root from where the pelvis is now. */
  beginRootBlend(seconds: number): void {
    this.rootBlend = { from: this.readRoot(), t: 0, duration: Math.max(seconds, 1e-3) };
  }

  readTransforms(): SegmentTransforms {
    const out = {} as SegmentTransforms;
    for (const name of SEGMENT_NAMES) {
      const b = this.bodies[name];
      const t = b.translation();
      const r = b.rotation();
      out[name] = { position: new THREE.Vector3(t.x, t.y, t.z), rotation: new THREE.Quaternion(r.x, r.y, r.z, r.w) };
    }
    return out;
  }

  readJointRots(): JointRots {
    return jointRotsFromTransforms(this.readTransforms());
  }

  readRoot(): RootTransform {
    const t = this.readTransforms().pelvis;
    return { position: t.position, rotation: t.rotation };
  }

  pelvisPosition(): THREE.Vector3 {
    const t = this.bodies.pelvis.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  maxSpeed(): number {
    let max = 0;
    for (const name of SEGMENT_NAMES) {
      const v = this.bodies[name].linvel();
      max = Math.max(max, Math.hypot(v.x, v.y, v.z));
    }
    return max;
  }

  limbPoint(limb: Limb): THREE.Vector3 {
    const { segment, local } = LIMB_ENDS[limb];
    const b = this.bodies[segment];
    const r = b.rotation();
    const t = b.translation();
    return local.clone().applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z));
  }

  syncMeshes(): void {
    for (const name of SEGMENT_NAMES) {
      const b = this.bodies[name];
      const t = b.translation();
      const r = b.rotation();
      this.meshes[name].position.set(t.x, t.y, t.z);
      this.meshes[name].quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  dispose(): void {
    const world = this.physics.world;
    for (const j of this.joints) world.removeImpulseJoint(j, true);
    this.joints.length = 0;
    for (const name of SEGMENT_NAMES) world.removeRigidBody(this.bodies[name]);
    this.group.removeFromParent();
    for (const name of SEGMENT_NAMES) this.meshes[name].geometry.dispose();
    (this.meshes.pelvis.material as THREE.Material).dispose();
  }
}
