import * as THREE from 'three';
import { RAPIER, bodyTag, type Physics } from './physics/world';
import { Figure } from './figure/figure';
import { PELVIS_HEIGHT } from './figure/skeleton';
import { Player, type PlayerInput, type TargetInfo } from './entities/player';
import { Npc, type ShotResult, type ZombieConfig } from './entities/npc';
import { WaveMode, type WaveEvent, type WaveHost } from './modes/waveMode';
import { createAkModel, type AkModel } from './weapons/akModel';
import { createShotgunModel, type ShotgunModel } from './weapons/shotgunModel';
import { GUNS, GUN_NAMES, SPECIAL, type GunName } from './weapons/guns';
import {
  createAntigravModel, createFreezeModel, createLlamaCannonModel, createMiniLlama, createRocketMesh, createRpgModel,
  createTeslaModel, type GunModelHandle,
} from './weapons/specialModels';
import { GUN_POINTS, HOLSTER_SIDE } from './weapons/gunPoints';
import { holsterPose } from './entities/rifleRig';
import { ringPositions } from './entities/npcBrain';
import { LLAMA, Llama } from './entities/llama';
import { ZOMBIE_KINDS, mixColor } from './modes/zombieTypes';
import { pushOut, type Obstacle } from './world/obstacles';
import { createObstacleMesh } from './world/obstacleMeshes';
import { SAMURAI_BODY_COLOR, dressAsSamurai } from './figure/samurai';
import { ARENA, onIsland } from './world/arena';
import { findHits } from './combat/hits';

export const PLAYER_COLOR = SAMURAI_BODY_COLOR;
export const NPC_COLOR = 0xd94a3a;
export const ZOMBIE_COLOR = 0x6f9a4a;

export type GameMode = 'training' | 'waves';

export interface AimRay {
  origin: THREE.Vector3;
  /** Unit direction. */
  dir: THREE.Vector3;
}

/** Things that happened this tick, for effects, sound, recoil and the HUD. */
export type GameEvent =
  | {
    kind: 'shot';
    gun: GunName;
    /** 0 for the first (or only) projectile of a trigger pull; shotgun pellets count up. */
    pellet: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    normal: THREE.Vector3 | null;
    dir: THREE.Vector3;
    /** What the bullet hit: an NPC, the ground, or nothing within range. */
    target: 'npc' | 'world' | 'none';
    result: ShotResult;
    headshot: boolean;
  }
  | { kind: 'melee'; knockedOut: boolean; point: THREE.Vector3; dir: THREE.Vector3; zombie: boolean }
  /** A limb came off: blood pours from `stump()` and trails behind the flying piece at `limb()`. */
  | { kind: 'dismember'; point: THREE.Vector3; dir: THREE.Vector3; stump: () => THREE.Vector3; limb: () => THREE.Vector3; big: boolean }
  | { kind: 'dryFire' }
  | { kind: 'reloadStart' }
  | { kind: 'reloadEnd' }
  | { kind: 'swap' }
  | { kind: 'mount' }
  | { kind: 'dismount' }
  | { kind: 'pump'; port: THREE.Vector3; gunRotation: THREE.Quaternion }
  | { kind: 'shellLoaded' }
  /** A special weapon fired (sound, flash, recoil): `from` is the muzzle. */
  | { kind: 'fire'; gun: GunName; from: THREE.Vector3; gunRotation: THREE.Quaternion }
  | { kind: 'beam'; gun: 'freeze' | 'antigrav'; from: THREE.Vector3; to: THREE.Vector3; hitNpc: boolean }
  | { kind: 'lightning'; points: THREE.Vector3[]; knockouts: number }
  | { kind: 'shatter'; point: THREE.Vector3 }
  | { kind: 'float'; point: THREE.Vector3 }
  | { kind: 'smoke'; point: THREE.Vector3 }
  | { kind: 'explosion'; point: THREE.Vector3; knockouts: number }
  | { kind: 'llamaBonk'; point: THREE.Vector3; hitNpc: boolean; knockedOut: boolean }
  | { kind: 'steedDown'; point: THREE.Vector3 }
  | { kind: 'jump' }
  | { kind: 'land'; point: THREE.Vector3; speed: number }
  | { kind: 'fell' }
  | { kind: 'respawn' }
  | WaveEvent;

interface Projectile {
  kind: 'rocket' | 'llama';
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  mesh: THREE.Object3D;
  spin: THREE.Vector3;
}

interface LlamaProp {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  age: number;
}

export interface GameInput extends PlayerInput {
  /** Ray through the crosshair (camera position and forward). */
  aimRay?: AimRay;
  /** Interact (Mystery Box) this tick. */
  use?: boolean;
}

export class Game implements WaveHost {
  readonly player: Player;
  readonly npcs: Npc[] = [];
  knockouts = 0;
  readonly ak: AkModel = createAkModel();
  readonly shotgun: ShotgunModel = createShotgunModel();
  /** The five special guns' models. */
  readonly specials: Record<Exclude<GunName, 'rifle' | 'shotgun'>, GunModelHandle> = {
    rpg: createRpgModel(),
    freeze: createFreezeModel(),
    tesla: createTeslaModel(),
    antigrav: createAntigravModel(),
    llamaCannon: createLlamaCannonModel(),
  };
  readonly projectiles: Projectile[] = [];
  private readonly obstacleMeshes: THREE.Object3D[] = [];
  private readonly obstacleBodies: RAPIER.RigidBody[] = [];
  private respawnTimer = 0;
  readonly llamaProps: LlamaProp[] = [];
  readonly scene: THREE.Scene;
  /** Zombie wave mode, or null in training. */
  readonly waves: WaveMode | null = null;
  private zombieCount = 0;
  readonly llama: Llama;
  /** Where the llama stands when nobody rides it (null = not summoned yet). */
  private parkedLlama: { position: THREE.Vector3; yaw: number } | null = null;
  /** Where the crosshair points this tick (null without an aim ray). */
  aimPoint: THREE.Vector3 | null = null;
  private readonly byId = new Map<string, Npc>();
  private events: GameEvent[] = [];

  constructor(
    private readonly physics: Physics,
    scene: THREE.Scene,
    npcCount: number,
    readonly random: () => number = Math.random,
    readonly mode: GameMode = 'training',
    /** Solid obstacles on the island (a fresh random layout per match; none by default). */
    readonly obstacles: Obstacle[] = [],
  ) {
    this.scene = scene;
    for (const o of obstacles) {
      const mesh = createObstacleMesh(o);
      scene.add(mesh);
      this.obstacleMeshes.push(mesh);
      const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(o.x, 0, o.z)
        .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.shape === 'box' ? o.rot : 0)));
      const desc = o.shape === 'box'
        ? RAPIER.ColliderDesc.cuboid(o.w / 2, o.h / 2, o.d / 2)
        : RAPIER.ColliderDesc.cylinder(o.h / 2, o.r);
      physics.world.createCollider(desc.setTranslation(0, o.h / 2, 0).setFriction(0.8), body);
      this.obstacleBodies.push(body);
    }
    scene.add(this.ak.group, this.shotgun.group, ...Object.values(this.specials).map((m) => m.group));
    const origin = new THREE.Vector3(0, PELVIS_HEIGHT, 0);
    this.player = new Player(new Figure(physics, scene, { id: 'player', color: PLAYER_COLOR, position: origin }), origin);
    this.player.obstacles = obstacles;
    dressAsSamurai(this.player.figure);
    this.llama = new Llama(physics, scene, this.player.figure.id);
    if (mode === 'waves') this.waves = new WaveMode(this);
    ringPositions(mode === 'waves' ? 0 : npcCount).forEach((p, i) => {
      const pos = new THREE.Vector3(p.x, PELVIS_HEIGHT, p.z);
      const yaw = Math.atan2(-p.x, -p.z);
      const npc = new Npc(new Figure(physics, scene, { id: `npc-${i}`, color: NPC_COLOR, position: pos, yaw }), pos);
      npc.yaw = yaw;
      this.npcs.push(npc);
      this.byId.set(npc.id, npc);
    });
  }

  private collideNpc = (p: THREE.Vector3, radius: number) => {
    if (this.obstacles.length === 0) return;
    const q = pushOut(this.obstacles, p.x, p.z, radius, 0);
    p.x = q.x;
    p.z = q.z;
  };

  /** After falling off: in training, back to the middle of the island; in wave mode, the void kills. */
  private updateFall(dt: number): void {
    const p = this.player;
    if (!p.fellOff) return;
    if (p.figure.pelvisPosition().y > ARENA.voidY) return;
    if (this.waves) {
      this.waves.voidDeath();
      return;
    }
    this.respawnTimer += dt;
    if (this.respawnTimer > 0.2) {
      this.respawnTimer = 0;
      if (p.mounted) p.mounted = false;
      p.respawn();
      this.events.push({ kind: 'respawn' });
    }
  }

  /**
   * Keep the camera out of pillars and walls: the closest point along `from → to` that isn't inside the
   * scenery (only fixed things — the island and obstacles — count).
   */
  cameraClip(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 1e-4) return to.clone();
    dir.divideScalar(len);
    const hit = this.physics.world.castRay(new RAPIER.Ray(from, dir), len, true, undefined, undefined, undefined, undefined,
      (c) => !!c.parent()?.isFixed());
    if (!hit) return to.clone();
    return from.clone().addScaledVector(dir, Math.max(0.3, hit.timeOfImpact - 0.25));
  }

  emit(event: WaveEvent): void {
    this.events.push(event);
  }

  spawnZombie(position: THREE.Vector3, yaw: number, config: ZombieConfig): Npc {
    const id = `zombie-${this.zombieCount++}`;
    const spec = ZOMBIE_KINDS[config.kind ?? 'walker'];
    // Every zombie a slightly different shade so a horde doesn't look cloned.
    const color = config.kind ? mixColor(spec.skin, this.random() < 0.5 ? 0x2b2620 : 0xf3eee2, this.random() * 0.22) : ZOMBIE_COLOR;
    const scale = config.scale ?? 1;
    const figure = new Figure(this.physics, this.scene, { id, color, position: position.clone().setY(position.y * scale), yaw, scale });
    figure.setBulk(spec.bulk, spec.head);
    figure.addEyes(spec.eyes);
    if (config.kind === 'boss') figure.addCrown();
    const npc = new Npc(figure, position, config);
    if (config.kind === 'cavalry') npc.steed = new Llama(this.physics, this.scene, id, 'zombie');
    npc.yaw = yaw;
    this.npcs.push(npc);
    this.byId.set(id, npc);
    return npc;
  }

  /** Rocket-sized blast at a point (Bombardeiro zombies). */
  blastAt(point: THREE.Vector3): void {
    this.explode(point);
  }

  removeNpc(npc: Npc): void {
    npc.steed?.dispose();
    npc.steed = null;
    const i = this.npcs.indexOf(npc);
    if (i >= 0) this.npcs.splice(i, 1);
    this.byId.delete(npc.id);
    npc.figure.dispose();
  }

  /** Events since the last call. */
  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** One fixed physics tick. */
  step(dt: number, input: GameInput): void {
    const targets: TargetInfo[] = this.npcs.map((n) => ({ id: n.id, position: n.position, standing: n.standing }));
    this.aimPoint = input.aimRay ? this.castAim(input.aimRay) : null;
    this.player.update(dt, input, targets, this.aimPoint);
    const rifleEvents = this.player.consumeRifleEvents();
    if (rifleEvents.dryFire) this.events.push({ kind: 'dryFire' });
    if (rifleEvents.reloadStarted) this.events.push({ kind: 'reloadStart' });
    if (rifleEvents.reloadFinished) this.events.push({ kind: 'reloadEnd' });
    if (rifleEvents.swapped) this.events.push({ kind: 'swap' });
    if (rifleEvents.mounted) this.events.push({ kind: 'mount' });
    if (rifleEvents.jumped) this.events.push({ kind: 'jump' });
    if (rifleEvents.landed > 0) this.events.push({ kind: 'land', point: this.player.position.clone().setY(this.player.feetY), speed: rifleEvents.landed });
    if (rifleEvents.fell) this.events.push({ kind: 'fell' });
    this.updateFall(dt);
    if (rifleEvents.shellLoaded) this.events.push({ kind: 'shellLoaded' });
    if (rifleEvents.pumped && this.player.gun) {
      const port = GUN_POINTS.shotgun.ejectionPort.clone().applyQuaternion(this.player.gun.gunRotation).add(this.player.gun.gunPosition);
      this.events.push({ kind: 'pump', port, gunRotation: this.player.gun.gunRotation.clone() });
    }
    if (rifleEvents.dismounted) {
      this.events.push({ kind: 'dismount' });
      // The llama stays where the rider got off (the player already stepped to its side).
      const side = new THREE.Vector3(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw)).multiplyScalar(0.85);
      this.parkedLlama = { position: this.player.position.clone().sub(side), yaw: this.player.yaw };
    }
    if (this.player.mounted) this.parkedLlama = null;

    if (this.player.mounted) this.llama.update(dt, this.player.position, this.player.yaw, this.player.speed, true, this.player.feetY);
    else if (this.parkedLlama) this.llama.update(dt, this.parkedLlama.position, this.parkedLlama.yaw, 0, true);
    else this.llama.update(dt, this.player.position, 0, 0, false);
    this.player.rideBob = this.llama.saddleBob();

    const playerGround = { x: this.player.position.x, z: this.player.position.z };
    const margin = this.player.mounted ? LLAMA.npcMargin : 0;
    const standing = this.npcs.filter((o) => o.standing);
    let clawDamage = 0;
    for (const npc of this.npcs) {
      const others = standing.filter((o) => o !== npc).map((o) => o.ground);
      clawDamage += npc.update(dt, playerGround, others, margin, this.collideNpc);
      // A dead rider takes the zombie llama with him.
      if (npc.steed && npc.state === 'ragdoll') {
        this.events.push({ kind: 'steedDown', point: npc.position.clone().setY(0.6) });
        npc.steed.dispose();
        npc.steed = null;
      }
    }

    this.physics.step();

    // Shoved past the edge of the island: over it goes (after the step, so the bodies are really out there).
    for (const npc of this.npcs) {
      if (npc.standing && !onIsland(npc.position.x, npc.position.z)) {
        const out = npc.position.clone().setY(0).normalize();
        npc.kill(out.add(new THREE.Vector3(0, 0.3, 0)));
      }
    }

    const active = this.player.activeStrike();
    if (active) {
      for (const hit of findHits(this.physics, active.point, active.strike.hitRadius, this.player.figure.id)) {
        if (this.player.attack.hit.has(hit.figureId)) continue;
        const npc = this.byId.get(hit.figureId);
        if (!npc || !npc.standing) continue;
        this.player.recordHit(hit.figureId);
        const wasFrozen = npc.frozen;
        const knockedOut = npc.takeHit(active.strike, this.player.yaw, hit.segment, hit.point);
        if (wasFrozen) this.events.push({ kind: 'shatter', point: hit.point });
        if (knockedOut) this.knockouts++;
        this.events.push({
          kind: 'melee', knockedOut, point: hit.point.clone(),
          dir: new THREE.Vector3(Math.sin(this.player.yaw), 0.2, Math.cos(this.player.yaw)), zombie: !!npc.zombie,
        });
      }
    }

    for (let shots = this.player.consumeShots(); shots > 0; shots--) this.fireShot();
    this.updateProjectiles(dt);
    this.updateLlamaProps(dt);
    this.waves?.update(dt, { use: !!input.use, damage: clawDamage });

    this.collectGore();
    this.player.figure.syncMeshes();
    for (const npc of this.npcs) npc.figure.syncMeshes();
    this.syncRifle();
  }

  private excludePlayer = (collider: RAPIER.Collider) => bodyTag(collider.parent())?.figureId !== this.player.figure.id;

  /** First thing under the crosshair (ignoring the player), or a point far down the ray. */
  private castAim(ray: AimRay): THREE.Vector3 {
    const range = 150;
    const hit = this.physics.world.castRay(
      new RAPIER.Ray(ray.origin, ray.dir), range, true, undefined, undefined, undefined, undefined, this.excludePlayer,
    );
    const toi = hit ? hit.timeOfImpact : range;
    return ray.origin.clone().addScaledVector(ray.dir, toi);
  }

  /** One trigger pull: a single bullet for the AK, nine pellets for the shotgun. */
  private fireShot(): void {
    const gun = this.player.currentGun;
    const from = this.player.muzzle();
    if (!gun || !from) return;
    const spec = GUNS[gun];
    const fwd = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    const base = (this.aimPoint ?? from.clone().add(fwd)).clone().sub(from);
    if (base.lengthSq() < 1e-8) base.copy(fwd);
    base.normalize();
    const spread = spec.spread(this.player.guns[gun], this.player.aimBlend, this.player.moving);
    if (spec.kind !== 'hitscan') {
      const gunRotation = this.player.gun ? this.player.gun.gunRotation.clone() : new THREE.Quaternion();
      this.events.push({ kind: 'fire', gun, from: from.clone(), gunRotation });
      this.fireSpecial(spec.kind, from, coneSample(base, spread, this.random(), this.random()));
      return;
    }

    for (let pellet = 0; pellet < spec.pellets; pellet++) {
      const dir = coneSample(base, spread, this.random(), this.random());
      const hit = this.physics.world.castRayAndGetNormal(
        new RAPIER.Ray(from, dir), spec.range, true, undefined, undefined, undefined, undefined, this.excludePlayer,
      );
      const shot = { kind: 'shot' as const, gun, pellet, from, dir };
      if (!hit) {
        this.events.push({ ...shot, to: from.clone().addScaledVector(dir, spec.range), normal: null, target: 'none', result: 'none', headshot: false });
        continue;
      }
      const to = from.clone().addScaledVector(dir, hit.timeOfImpact);
      const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
      const tag = bodyTag(hit.collider.parent());
      const npc = tag ? this.byId.get(tag.figureId) : undefined;
      if (!tag || !npc) {
        this.events.push({ ...shot, to, normal, target: 'world', result: 'none', headshot: false });
        continue;
      }
      const result = npc.takeShot(tag.segment, dir, to, {
        damage: spec.damage(tag.segment, hit.timeOfImpact),
        koImpulse: spec.koImpulse,
        ragdollImpulse: spec.ragdollImpulse,
        // Buckshot to the head always takes it off.
        decapChance: gun === 'shotgun' ? 1 : 0.55,
      });
      if (result === 'killed') this.knockouts++;
      this.events.push({ ...shot, to, normal, target: 'npc', result, headshot: tag.segment === 'head' });
    }
  }

  /** Turn limbs that came off this tick into blood events. */
  private collectGore(): void {
    for (const npc of this.npcs) {
      for (const g of npc.consumeGore()) {
        const figure = npc.figure;
        const segment = g.segment;
        this.events.push({
          kind: 'dismember',
          point: figure.stumpPosition(segment),
          dir: g.dir,
          stump: () => figure.stumpPosition(segment),
          limb: () => figure.segmentPosition(segment),
          big: npc.scale > 1,
        });
      }
    }
  }

  /** First collider along a ray from `from` (the player and the llama it rides are ignored). */
  private ray(from: THREE.Vector3, dir: THREE.Vector3, range: number) {
    const hit = this.physics.world.castRayAndGetNormal(
      new RAPIER.Ray(from, dir), range, true, undefined, undefined, undefined, undefined, this.excludePlayer,
    );
    if (!hit) return null;
    const point = from.clone().addScaledVector(dir, hit.timeOfImpact);
    const tag = bodyTag(hit.collider.parent());
    const npc = tag ? this.byId.get(tag.figureId) ?? null : null;
    return {
      point, distance: hit.timeOfImpact, normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      npc, segment: tag?.segment ?? null,
    };
  }

  private fireSpecial(kind: 'rocket' | 'llama' | 'freeze' | 'tesla' | 'antigrav', from: THREE.Vector3, dir: THREE.Vector3): void {
    switch (kind) {
      case 'rocket':
      case 'llama': {
        const mesh = kind === 'rocket' ? createRocketMesh() : createMiniLlama(1);
        mesh.position.copy(from);
        this.scene.add(mesh);
        const speed = kind === 'rocket' ? SPECIAL.rocketSpeed : SPECIAL.llamaSpeed;
        const spin = kind === 'llama'
          ? new THREE.Vector3(this.random() * 8 - 4, this.random() * 8 - 4, this.random() * 8 - 4)
          : new THREE.Vector3();
        // The llama is lobbed a little upward so it flies in an arc.
        const velocity = dir.clone().multiplyScalar(speed);
        if (kind === 'llama') velocity.y += 2.5;
        this.projectiles.push({ kind, position: from.clone(), velocity, age: 0, mesh, spin });
        return;
      }
      case 'freeze':
      case 'antigrav': {
        const range = GUNS[kind].range;
        const hit = this.ray(from, dir, range);
        const to = hit ? hit.point : from.clone().addScaledVector(dir, range);
        if (hit?.npc && hit.segment) {
          if (kind === 'freeze') {
            const result = hit.npc.freezeHit(hit.segment, dir, hit.point);
            if (result === 'killed') {
              this.knockouts++;
              this.events.push({ kind: 'shatter', point: hit.point });
            }
          } else {
            if (hit.npc.levitate()) this.knockouts++;
            this.events.push({ kind: 'float', point: hit.point });
          }
        }
        this.events.push({ kind: 'beam', gun: kind, from, to, hitNpc: !!hit?.npc });
        return;
      }
      case 'tesla': {
        const first = this.ray(from, dir, SPECIAL.teslaRange);
        const points = [from.clone(), first ? first.point : from.clone().addScaledVector(dir, SPECIAL.teslaRange)];
        let knockouts = 0;
        if (first?.npc) {
          const hitSet = new Set<Npc>();
          let current = first.npc;
          let prev = from.clone();
          while (current && hitSet.size < SPECIAL.teslaMaxTargets) {
            hitSet.add(current);
            const at = current.figure.segmentPosition('torso');
            if (hitSet.size > 1) points.push(at);
            const result = current.zap(at.clone().sub(prev));
            if (result === 'killed') knockouts++;
            prev = at;
            // Jump to the nearest NPC in reach that hasn't been hit yet.
            let next: Npc | null = null;
            let best = SPECIAL.teslaChainRadius;
            for (const n of this.npcs) {
              if (hitSet.has(n)) continue;
              const d = n.figure.segmentPosition('torso').distanceTo(at);
              if (d < best) { best = d; next = n; }
            }
            current = next!;
          }
        }
        this.knockouts += knockouts;
        this.events.push({ kind: 'lightning', points, knockouts });
        return;
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      p.velocity.y -= (p.kind === 'rocket' ? SPECIAL.rocketGravity : 9.81) * dt;
      const step = p.velocity.clone().multiplyScalar(dt);
      const len = step.length();
      const hit = len > 0 ? this.ray(p.position, step.clone().divideScalar(len), len + 0.05) : null;
      if (hit || p.age > 6) {
        const at = hit ? hit.point : p.position.clone();
        this.projectiles.splice(i, 1);
        p.mesh.removeFromParent();
        if (p.kind === 'rocket') this.explode(at);
        else this.llamaImpact(p, at, hit);
        continue;
      }
      p.position.add(step);
      p.mesh.position.copy(p.position);
      if (p.kind === 'rocket') {
        p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.velocity.clone().normalize());
        if (Math.round(p.age * 60) % 2 === 0) this.events.push({ kind: 'smoke', point: p.position.clone() });
      } else {
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
        p.mesh.rotation.z += p.spin.z * dt;
      }
    }
  }

  /** Rocket blast: damage and knock down by distance, then throw every body (and llama) in range. */
  private explode(point: THREE.Vector3): void {
    let knockouts = 0;
    for (const npc of this.npcs) {
      const d = npc.figure.distanceTo(point);
      if (d >= SPECIAL.blastRadius) continue;
      const k = 1 - d / SPECIAL.blastRadius;
      const dir = npc.figure.segmentPosition('torso').sub(point);
      if (npc.explode(k, dir, this.random)) knockouts++;
      npc.figure.blast(point, SPECIAL.blastRadius, SPECIAL.blastSpeed);
    }
    for (const prop of this.llamaProps) {
      const t = prop.body.translation();
      const away = new THREE.Vector3(t.x - point.x, t.y - point.y, t.z - point.z);
      const d = away.length();
      if (d < SPECIAL.blastRadius) {
        prop.body.applyImpulse(away.normalize().add(new THREE.Vector3(0, 1, 0)).multiplyScalar(60 * (1 - d / SPECIAL.blastRadius)), true);
      }
    }
    this.knockouts += knockouts;
    this.events.push({ kind: 'explosion', point, knockouts });
  }

  private llamaImpact(p: Projectile, at: THREE.Vector3, hit: ReturnType<Game['ray']>): void {
    let knockedOut = false;
    const dir = p.velocity.clone().normalize();
    if (hit?.npc && hit.segment) {
      const result = hit.npc.takeShot(hit.segment, dir, at, {
        damage: SPECIAL.llamaDamage, koImpulse: SPECIAL.llamaImpulse, ragdollImpulse: SPECIAL.llamaImpulse * 0.6, decapChance: 0.4,
      });
      knockedOut = result === 'killed';
      if (knockedOut) this.knockouts++;
    }
    this.events.push({ kind: 'llamaBonk', point: at, hitNpc: !!hit?.npc, knockedOut });
    // The llama survives and tumbles around as a physics prop.
    const back = hit ? hit.normal.clone().multiplyScalar(0.25) : new THREE.Vector3();
    const start = at.clone().add(back).setY(Math.max(at.y + back.y, 0.25));
    const body = this.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z)
        .setLinvel(p.velocity.x * 0.3, Math.abs(p.velocity.y) * 0.2 + 2, p.velocity.z * 0.3)
        .setAngvel({ x: p.spin.x, y: p.spin.y, z: p.spin.z })
        .setLinearDamping(0.2).setAngularDamping(0.6),
    );
    this.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.13, 0.2, 0.22).setMass(8).setRestitution(0.45).setFriction(0.6), body,
    );
    this.scene.add(p.mesh);
    this.llamaProps.push({ body, mesh: p.mesh, age: 0 });
    while (this.llamaProps.length > SPECIAL.maxLlamaProps) this.removeProp(0);
  }

  private updateLlamaProps(dt: number): void {
    for (let i = this.llamaProps.length - 1; i >= 0; i--) {
      const prop = this.llamaProps[i];
      prop.age += dt;
      const t = prop.body.translation();
      const r = prop.body.rotation();
      prop.mesh.position.set(t.x, t.y, t.z);
      prop.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      // Shrink away at the end of their life.
      const left = SPECIAL.llamaPropSeconds - prop.age;
      if (left < 0.5) prop.mesh.scale.setScalar(Math.max(0.01, left / 0.5));
      if (left <= 0 || t.y < -5) this.removeProp(i);
    }
  }

  private removeProp(i: number): void {
    const [prop] = this.llamaProps.splice(i, 1);
    prop.mesh.removeFromParent();
    this.physics.world.removeRigidBody(prop.body);
  }

  private gunModel(name: GunName): { group: THREE.Group; setLoaded?(loaded: boolean): void } {
    if (name === 'rifle') return this.ak;
    if (name === 'shotgun') return this.shotgun;
    return this.specials[name];
  }

  /** The gun in hand follows the rig; with empty hands the last gun used hangs on the back. */
  private syncRifle(): void {
    const p = this.player;
    if (p.figure.mode === 'ragdoll') {
      for (const name of GUN_NAMES) this.gunModel(name).group.visible = false;
      return;
    }
    for (const name of GUN_NAMES) {
      const model = this.gunModel(name);
      const group = model.group;
      const state = p.guns[name];
      model.setLoaded?.(state.ammo > 0);
      const slung = p.heldGun === null && name === p.lastGun;
      if (p.heldGun === name && p.gun) {
        group.position.copy(p.gun.gunPosition);
        group.quaternion.copy(p.gun.gunRotation);
        group.visible = true;
      } else if (p.torso && slung) {
        const pose = holsterPose(p.torso, GUN_POINTS[name], HOLSTER_SIDE[name]);
        group.position.copy(pose.position);
        group.quaternion.copy(pose.rotation);
        group.visible = true;
      } else {
        group.visible = false;
      }
    }
    const held = p.heldGun === 'rifle' ? p.gun : null;
    this.ak.setMagazine(held ? held.magOffset : new THREE.Vector3(), held ? held.magVisible : true);
    this.shotgun.setPump(p.heldGun === 'shotgun' && p.gun ? p.gun.pumpOffset : 0);
  }

  dispose(): void {
    for (const m of this.obstacleMeshes) m.removeFromParent();
    for (const b of this.obstacleBodies) this.physics.world.removeRigidBody(b);
    this.waves?.dispose();
    for (const npc of this.npcs) npc.steed?.dispose();
    for (const pr of this.projectiles) pr.mesh.removeFromParent();
    this.projectiles.length = 0;
    while (this.llamaProps.length) this.removeProp(0);
    for (const m of Object.values(this.specials)) m.group.removeFromParent();
    this.llama.dispose();
    this.ak.group.removeFromParent();
    this.shotgun.group.removeFromParent();
    this.shotgun.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.ak.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.player.figure.dispose();
    for (const npc of this.npcs) npc.figure.dispose();
    this.npcs.length = 0;
    this.byId.clear();
  }
}

/** Random direction inside a cone of half-angle `spread` around `axis` (uniform over the cone's cap). */
export function coneSample(axis: THREE.Vector3, spread: number, u: number, v: number): THREE.Vector3 {
  if (spread <= 0) return axis.clone();
  const angle = spread * Math.sqrt(u);
  const around = 2 * Math.PI * v;
  const helper = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const a = new THREE.Vector3().crossVectors(axis, helper).normalize();
  const b = new THREE.Vector3().crossVectors(axis, a);
  return axis.clone().multiplyScalar(Math.cos(angle))
    .addScaledVector(a, Math.sin(angle) * Math.cos(around))
    .addScaledVector(b, Math.sin(angle) * Math.sin(around))
    .normalize();
}
