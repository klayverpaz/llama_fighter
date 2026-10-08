import * as THREE from 'three';
import { RAPIER, type Physics, type BodyTag } from '../physics/world';

/** Llama proportions (metres) and gait. The model's origin is on the ground under the body; +Z is forward. */
export const LLAMA = {
  bodyY: 0.9,
  bodyRadius: 0.26,
  bodyLength: 0.62,
  legLength: 0.86,
  /** Rider pelvis height when seated on the saddle. */
  saddlePelvisY: 1.34,
  walkSpeed: 4,
  runSpeed: 7.5,
  aimSpeed: 3,
  turnRate: 7,
  /** One full stride per this many metres. */
  strideLength: 1.5,
  /** NPCs keep this much extra distance from a mounted player so they don't stand inside the llama. */
  npcMargin: 0.75,
};

interface Leg { hip: THREE.Group; knee: THREE.Group; phase: number }

/** A stick-style llama with a 4-leg walk cycle and a kinematic collider (tagged as part of the player). */
export class Llama {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly legs: Leg[] = [];
  private readonly tail: THREE.Mesh;
  private gait = 0;
  private readonly rigidBody: RAPIER.RigidBody;

  constructor(private readonly physics: Physics, scene: THREE.Scene, ownerId: string) {
    const wool = new THREE.MeshToonMaterial({ color: 0xeee2c8 });
    const woolDark = new THREE.MeshToonMaterial({ color: 0xd6c4a2 });
    const face = new THREE.MeshToonMaterial({ color: 0x3a2a1f });
    const blanket = new THREE.MeshToonMaterial({ color: 0xc8372d });
    const stripe = new THREE.MeshToonMaterial({ color: 0xf2b134 });
    const tassel = new THREE.MeshToonMaterial({ color: 0x2a6fdb });

    const capsule = (r: number, len: number, mat: THREE.Material) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), mat);

    // Barrel-shaped woolly body along Z.
    const torso = capsule(LLAMA.bodyRadius, LLAMA.bodyLength, wool);
    torso.rotation.x = Math.PI / 2;
    torso.scale.set(1, 1, 0.92);
    this.body.add(torso);

    // Saddle blanket with a stripe and tassels.
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.5), blanket);
    saddle.position.set(0, LLAMA.bodyRadius - 0.01, -0.02);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.052, 0.07), stripe);
    band.position.copy(saddle.position);
    this.body.add(saddle, band);
    for (const side of [-1, 1]) {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.48), blanket);
      flap.position.set(side * (LLAMA.bodyRadius + 0.02), LLAMA.bodyRadius - 0.14, -0.02);
      flap.rotation.z = side * 0.18;
      this.body.add(flap);
      for (const z of [-0.18, 0, 0.18]) {
        const t = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), tassel);
        t.position.set(side * (LLAMA.bodyRadius + 0.05), LLAMA.bodyRadius - 0.29, z - 0.02);
        this.body.add(t);
      }
    }

    // Long neck, head, snout, banana ears, eyes.
    this.neck.position.set(0, 0.1, LLAMA.bodyLength / 2 + 0.12);
    this.neck.rotation.x = -0.28;
    const neckMesh = capsule(0.1, 0.5, wool);
    neckMesh.position.y = 0.3;
    this.neck.add(neckMesh);
    const head = new THREE.Group();
    head.position.set(0, 0.62, 0.02);
    head.rotation.x = 0.28;
    const skull = capsule(0.1, 0.1, wool);
    skull.rotation.x = Math.PI / 2;
    const snout = capsule(0.07, 0.1, woolDark);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.03, 0.14);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), face);
    nose.position.set(0, -0.01, 0.24);
    head.add(skull, snout, nose);
    for (const side of [-1, 1]) {
      const ear = capsule(0.025, 0.12, woolDark);
      ear.position.set(side * 0.06, 0.13, -0.03);
      ear.rotation.set(-0.15, 0, side * -0.25);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), face);
      eye.position.set(side * 0.075, 0.03, 0.07);
      head.add(ear, eye);
    }
    this.neck.add(head);
    this.body.add(this.neck);

    this.tail = capsule(0.06, 0.08, wool);
    this.tail.position.set(0, 0.12, -LLAMA.bodyLength / 2 - 0.25);
    this.tail.rotation.x = 0.6;
    this.body.add(this.tail);

    // Four legs: hip pivot → thigh → knee pivot → shin + little dark hoof.
    const half = LLAMA.legLength / 2;
    const corners: Array<[number, number, number]> = [
      [0.15, LLAMA.bodyLength / 2 - 0.02, 0], [-0.15, LLAMA.bodyLength / 2 - 0.02, Math.PI],
      [0.15, -LLAMA.bodyLength / 2 + 0.02, Math.PI], [-0.15, -LLAMA.bodyLength / 2 + 0.02, 0],
    ];
    for (const [x, z, phase] of corners) {
      const hip = new THREE.Group();
      hip.position.set(x, -0.08, z);
      const thigh = capsule(0.055, half - 0.04, wool);
      thigh.position.y = -half / 2;
      const knee = new THREE.Group();
      knee.position.y = -half;
      const shin = capsule(0.04, half - 0.06, woolDark);
      shin.position.y = -half / 2;
      const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.1), face);
      hoof.position.set(0, -half + 0.04, 0.02);
      knee.add(shin, hoof);
      hip.add(thigh, knee);
      this.body.add(hip);
      this.legs.push({ hip, knee, phase });
    }

    this.body.position.y = LLAMA.bodyY;
    this.group.add(this.body);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.group.visible = false;
    scene.add(this.group);

    // Kinematic collider so ragdolls bump into the llama; tagged as the player's so the rider, the crosshair
    // ray and bullets all ignore it.
    this.rigidBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
    this.rigidBody.userData = { figureId: ownerId, segment: 'pelvis' } satisfies BodyTag;
    physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.24, 0.24, 0.55).setTranslation(0, LLAMA.bodyY, 0).setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS),
      this.rigidBody,
    );
    physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.1, 0.3, 0.1).setTranslation(0, LLAMA.bodyY + 0.55, LLAMA.bodyLength / 2 + 0.2)
        .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS),
      this.rigidBody,
    );
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** Place the llama (ground position, heading) and animate the walk cycle for this tick. */
  update(dt: number, ground: THREE.Vector3, yaw: number, speed: number, visible: boolean): void {
    this.group.visible = visible;
    if (!visible) {
      this.rigidBody.setNextKinematicTranslation({ x: 0, y: -50, z: 0 });
      return;
    }
    this.gait += (dt * speed * 2 * Math.PI) / LLAMA.strideLength;
    const intensity = Math.min(1, speed / LLAMA.walkSpeed);
    for (const leg of this.legs) {
      const s = Math.sin(this.gait + leg.phase);
      leg.hip.rotation.x = 0.5 * s * intensity;
      leg.knee.rotation.x = Math.max(0, -Math.cos(this.gait + leg.phase)) * 0.8 * intensity;
    }
    this.body.position.y = LLAMA.bodyY + Math.abs(Math.sin(this.gait)) * 0.035 * intensity;
    this.neck.rotation.x = -0.28 + Math.sin(this.gait * 2) * 0.05 * intensity;
    this.tail.rotation.z = Math.sin(this.gait * 0.5 + performance.now() * 0.002) * 0.2;

    this.group.position.set(ground.x, 0, ground.z);
    this.group.rotation.y = yaw;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.rigidBody.setNextKinematicTranslation({ x: ground.x, y: 0, z: ground.z });
    this.rigidBody.setNextKinematicRotation(q);
  }

  /** Bob of the saddle this tick (the rider follows it). */
  saddleBob(): number {
    return this.body.position.y - LLAMA.bodyY;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.physics.world.removeRigidBody(this.rigidBody);
  }
}
