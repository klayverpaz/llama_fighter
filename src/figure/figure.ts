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
  /** Size multiplier for the whole body (the boss is 4×). */
  scale?: number;
}

/** Segments hanging below each segment (detaching a segment takes its children with it). */
const CHILDREN: Record<SegmentName, SegmentName[]> = Object.fromEntries(
  SEGMENT_NAMES.map((n) => [n, SEGMENTS.filter((s) => s.parent === n).map((s) => s.name)]),
) as Record<SegmentName, SegmentName[]>;

/** A segment and everything below it. */
export function subtree(segment: SegmentName): SegmentName[] {
  return [segment, ...CHILDREN[segment].flatMap(subtree)];
}

const STUMP = new THREE.MeshToonMaterial({ color: 0x7a0c0c });

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
  private bodies = {} as Record<SegmentName, RAPIER.RigidBody>;
  /** Removed from the world: bodies are replaced by frozen stand-ins (see ghostBody). */
  private disposed = false;
  private readonly meshes = {} as Record<SegmentName, THREE.Mesh>;
  /** The joint that holds each segment to its parent (removed while that segment is detached). */
  private readonly joints = new Map<SegmentName, RAPIER.ImpulseJoint>();
  private rootBlend: RootBlend | null = null;
  /** Roots of limbs that have been cut off (each takes its subtree). */
  private readonly detached = new Set<SegmentName>();
  private readonly stumps: THREE.Object3D[] = [];

  private readonly baseColor: number;
  readonly scale: number;

  constructor(private readonly physics: Physics, scene: THREE.Scene, opts: FigureOptions) {
    this.id = opts.id;
    this.baseColor = opts.color;
    const k = (this.scale = opts.scale ?? 1);
    const world = physics.world;
    const rest = forwardKinematics({
      root: { position: opts.position.clone(), rotation: yawQuaternion(opts.yaw ?? 0) },
      joints: identityJointRots(),
    }, k);
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
        ? RAPIER.ColliderDesc.capsule((seg.length / 2) * k, seg.radius * k)
        : RAPIER.ColliderDesc.ball(seg.radius * k);
      world.createCollider(
        shape.setMass(seg.mass * k * k * k)
          .setFriction(BODY_TUNING.friction)
          .setRestitution(BODY_TUNING.restitution)
          .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS),
        body,
      );
      this.bodies[seg.name] = body;

      const geometry = seg.length > 0
        ? new THREE.CapsuleGeometry(seg.radius * k, seg.length * k, 4, 12)
        : new THREE.SphereGeometry(seg.radius * k, 16, 12);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.copy(t.position);
      mesh.quaternion.copy(t.rotation);
      this.meshes[seg.name] = mesh;
      this.group.add(mesh);
    }

    for (const seg of SEGMENTS) this.connect(seg.name);

    scene.add(this.group);
  }

  /** (Re)create the joint holding `name` to its parent. */
  private connect(name: SegmentName): void {
    if (this.disposed) return;
    const seg = SEGMENTS.find((s) => s.name === name)!;
    if (!seg.parent || !seg.jointKind) return;
    const world = this.physics.world;
    const a1 = seg.parentAnchor.clone().multiplyScalar(this.scale);
    const a2 = seg.selfAnchor.clone().multiplyScalar(this.scale);
    const data = seg.jointKind.kind === 'revolute'
      ? RAPIER.JointData.revolute(a1, a2, seg.jointKind.axis)
      : RAPIER.JointData.spherical(a1, a2);
    const created = world.createImpulseJoint(data, this.bodies[seg.parent], this.bodies[name], true);
    const joint = world.getImpulseJoint(created.handle);
    joint.setContactsEnabled(false);
    if (seg.jointKind.kind === 'revolute') {
      (joint as RAPIER.RevoluteImpulseJoint).setLimits(seg.jointKind.limits[0], seg.jointKind.limits[1]);
    } else {
      const m = this.scale ** 3;
      setSphericalSpring(joint, seg.jointKind.springStiffness * m, seg.jointKind.springDamping * m);
    }
    this.joints.set(name, joint);
  }

  /** Is this segment cut off (directly, or because something above it was)? */
  isDetached(name: SegmentName): boolean {
    for (const root of this.detached) if (subtree(root).includes(name)) return true;
    return false;
  }

  /** How many limbs have been cut off. */
  get detachedCount(): number {
    return this.detached.size;
  }

  /**
   * Cut a limb off at its joint (head, arm, forearm, thigh, shin). The piece becomes a free physics body
   * thrown by `impulse`; the rest of the figure keeps going (even while standing). Returns false if it
   * was already gone or can't be cut (pelvis, torso).
   */
  detach(segment: SegmentName, impulse?: THREE.Vector3): boolean {
    if (segment === 'pelvis' || segment === 'torso' || this.isDetached(segment)) return false;
    const joint = this.joints.get(segment);
    if (!joint) return false;
    this.physics.world.removeImpulseJoint(joint, true);
    this.joints.delete(segment);
    this.detached.add(segment);
    for (const name of subtree(segment)) {
      const b = this.bodies[name];
      if (b.bodyType() !== RAPIER.RigidBodyType.Dynamic) {
        const lv = b.linvel();
        const av = b.angvel();
        b.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        b.setLinvel(lv, true);
        b.setAngvel(av, true);
      }
    }
    if (impulse) this.bodies[segment].applyImpulse(impulse, true);
    // Red caps on both sides of the cut.
    const seg = SEGMENTS.find((s) => s.name === segment)!;
    const r = seg.radius * this.scale * 1.05;
    const capOnParent = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), STUMP);
    capOnParent.position.copy(seg.parentAnchor).multiplyScalar(this.scale);
    const capOnLimb = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), STUMP);
    capOnLimb.position.copy(seg.selfAnchor).multiplyScalar(this.scale);
    // Undo the parent's visual bulk so the cap stays round.
    const parentMesh = this.meshes[seg.parent!];
    capOnParent.scale.set(1 / parentMesh.scale.x, 1 / parentMesh.scale.y, 1 / parentMesh.scale.z);
    parentMesh.add(capOnParent);
    this.meshes[segment].add(capOnLimb);
    this.stumps.push(capOnParent, capOnLimb);
    return true;
  }

  /** World position of the cut on the body side (where the blood comes out) for a detached limb. */
  stumpPosition(segment: SegmentName): THREE.Vector3 {
    const seg = SEGMENTS.find((s) => s.name === segment)!;
    const parent = this.bodies[seg.parent!];
    const r = parent.rotation();
    const t = parent.translation();
    return seg.parentAnchor.clone().multiplyScalar(this.scale)
      .applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z));
  }

  /** Put every cut-off limb back (training dummies "heal" when they stand up). */
  private reattachAll(): void {
    if (this.detached.size === 0) return;
    for (const root of this.detached) this.connect(root);
    this.detached.clear();
    for (const s of this.stumps) {
      s.removeFromParent();
      (s as THREE.Mesh).geometry.dispose();
    }
    this.stumps.length = 0;
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
    const transforms = forwardKinematics({ root, joints: pose.joints }, this.scale);
    const free = this.detached.size > 0 ? new Set([...this.detached].flatMap(subtree)) : null;
    for (const name of SEGMENT_NAMES) {
      if (free?.has(name)) continue;
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

  /**
   * Bulk up (or slim down) the drawn body: limbs and torso get thicker by `bulk`, the head scales by `head`.
   * Purely visual — the physics capsules stay the same.
   */
  setBulk(bulk: number, head = 1): void {
    for (const name of SEGMENT_NAMES) {
      const m = this.meshes[name];
      if (name === 'head') m.scale.setScalar(head);
      else if (name === 'torso' || name === 'pelvis') m.scale.set(bulk * 1.05, 1 + (bulk - 1) * 0.12, bulk);
      else m.scale.set(bulk, 1, bulk);
    }
  }

  /** Attach a decoration to a segment's mesh (it moves with that body part, also as a ragdoll). */
  attach(segment: SegmentName, object: THREE.Object3D): void {
    object.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    object.position.multiplyScalar(this.scale);
    object.scale.multiplyScalar(this.scale);
    this.meshes[segment].add(object);
  }

  /** Glowing eyes on the face (zombies). */
  addEyes(color: number): void {
    const mat = new THREE.MeshBasicMaterial({ color });
    const geo = new THREE.SphereGeometry(0.022, 8, 6);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(geo, mat);
      eye.position.set(side * 0.045, 0.025, 0.102);
      this.attach('head', eye);
    }
  }

  /** A little golden crown on the head (the boss). */
  addCrown(): void {
    const gold = new THREE.MeshToonMaterial({ color: 0xffd23a });
    const crown = new THREE.Group();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.045, 14, 1, true), gold);
    crown.add(band);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 6), gold);
      spike.position.set(Math.sin(a) * 0.07, 0.05, Math.cos(a) * 0.07);
      crown.add(spike);
    }
    crown.position.y = 0.11;
    this.attach('head', crown);
  }

  /** Recolour the whole figure (ice, electric flash, anti-gravity glow); null restores its own colour. */
  setTint(color: number | null): void {
    const mat = this.meshes.pelvis.material as THREE.MeshToonMaterial;
    mat.color.setHex(color ?? this.baseColor);
  }

  /** Gravity multiplier for every segment (negative floats upward). */
  setGravityScale(scale: number): void {
    for (const name of SEGMENT_NAMES) this.bodies[name].setGravityScale(scale, true);
  }

  /**
   * Ragdoll mode only: throw every segment away from `center` (plus lift). `speed` is the velocity change at the
   * centre, fading to zero at `radius`; impulses scale with each segment's mass so the body flies as one piece.
   */
  blast(center: THREE.Vector3, radius: number, speed: number): void {
    if (this.mode !== 'ragdoll') return;
    for (const name of SEGMENT_NAMES) {
      const b = this.bodies[name];
      const t = b.translation();
      const away = new THREE.Vector3(t.x - center.x, t.y - center.y, t.z - center.z);
      const d = away.length();
      if (d >= radius) continue;
      const k = 1 - d / radius;
      away.normalize().add(new THREE.Vector3(0, 0.9, 0)).normalize().multiplyScalar(speed * k * b.mass());
      b.applyImpulse(away, true);
    }
  }

  /** Distance from `point` to the nearest segment centre. */
  distanceTo(point: THREE.Vector3): number {
    let best = Infinity;
    for (const name of SEGMENT_NAMES) {
      const t = this.bodies[name].translation();
      best = Math.min(best, Math.hypot(t.x - point.x, t.y - point.y, t.z - point.z));
    }
    return best;
  }

  /** World position of one segment's body. */
  segmentPosition(name: SegmentName): THREE.Vector3 {
    const t = this.bodies[name].translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  /** Ragdoll mode only: push one segment (e.g. a bullet hitting a body already on the ground). */
  applyImpulse(segment: SegmentName, impulse: THREE.Vector3, point: THREE.Vector3): void {
    if (this.mode !== 'ragdoll') return;
    this.bodies[segment].applyImpulseAtPoint(impulse, point, true);
  }

  toPosed(): void {
    if (this.mode === 'posed') return;
    this.mode = 'posed';
    this.reattachAll();
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
    return local.clone().multiplyScalar(this.scale).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z));
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

  /**
   * Remove from the world. Anything that still holds on to this figure afterwards (a blood fountain on a stump,
   * a late event) reads the last known positions: touching a removed Rapier body panics the whole WASM module,
   * which freezes the game for good.
   */
  dispose(): void {
    if (this.disposed) return;
    const world = this.physics.world;
    for (const j of this.joints.values()) world.removeImpulseJoint(j, true);
    this.joints.clear();
    const ghosts = {} as Record<SegmentName, RAPIER.RigidBody>;
    for (const name of SEGMENT_NAMES) {
      const b = this.bodies[name];
      ghosts[name] = ghostBody(b.translation(), b.rotation(), b.mass());
      world.removeRigidBody(b);
    }
    this.bodies = ghosts;
    this.disposed = true;
    this.group.removeFromParent();
    for (const name of SEGMENT_NAMES) this.meshes[name].geometry.dispose();
    (this.meshes.pelvis.material as THREE.Material).dispose();
  }
}

/**
 * A stand-in for a removed rigid body: reports where the body was and ignores every command.
 * Only the members the Figure uses are implemented.
 */
function ghostBody(t: { x: number; y: number; z: number }, r: { x: number; y: number; z: number; w: number }, mass: number): RAPIER.RigidBody {
  const position = { x: t.x, y: t.y, z: t.z };
  const rotation = { x: r.x, y: r.y, z: r.z, w: r.w };
  const zero = () => ({ x: 0, y: 0, z: 0 });
  const noop = () => {};
  return {
    translation: () => ({ ...position }),
    rotation: () => ({ ...rotation }),
    linvel: zero,
    angvel: zero,
    mass: () => mass,
    bodyType: () => RAPIER.RigidBodyType.Fixed,
    setNextKinematicTranslation: noop,
    setNextKinematicRotation: noop,
    setBodyType: noop,
    setLinvel: noop,
    setAngvel: noop,
    applyImpulse: noop,
    applyImpulseAtPoint: noop,
    setGravityScale: noop,
  } as unknown as RAPIER.RigidBody;
}
