import * as THREE from 'three';
import type { Figure } from '../figure/figure';
import { yawFromQuaternion, yawQuaternion } from '../figure/fk';
import { PELVIS_HEIGHT, type SegmentName } from '../figure/skeleton';
import { Animator } from '../anim/animator';
import { STANCE, ZOMBIE, ZOMBIE_RIDE, ZOMBIE_SWIPE, ZOMBIE_SWIPE_HIT } from '../anim/clips';
import { LLAMA, type Llama } from './llama';
import type { ZombieKind } from '../modes/zombieTypes';
import { FLINCH } from '../anim/strikeClips';
import { applyDamage, impulseVector } from '../combat/damage';
import { NPC_MAX_HP, type StrikeDef } from '../combat/strikes';
import { RIFLE, damageForSegment } from '../weapons/rifle';
import { SPECIAL } from '../weapons/guns';
import { lerpAngle } from '../core/math';
import { NPC_TUNING, shouldRecover, steer, type NpcMoveState, type Vec2 } from './npcBrain';

export type NpcState = 'chase' | 'hold' | 'flinch' | 'ragdoll' | 'recovering' | 'frozen';

const ICE = 0x9fe3ff;
const SHOCK = 0xfff27a;
const FLOAT = 0xc58cff;

/** What a bullet did: dropped the NPC, hurt it, pushed a body already down, or nothing. */
export type ShotResult = 'killed' | 'hit' | 'body' | 'none';

interface Pushback { velocity: THREE.Vector3; remaining: number }

/** Wave mode: a zombie that walks at `speed`, claws for `damage`, and never gets back up. */
export interface ZombieConfig {
  hp: number;
  speed: number;
  damage: number;
  /** Which kind (looks and special behaviour); plain walker when omitted. */
  kind?: ZombieKind;
  /** Body size multiplier (the boss is 4×). */
  scale?: number;
}

/** A limb that just came off (the game turns these into blood fountains). */
export interface GoreEvent { segment: SegmentName; dir: THREE.Vector3 }

/** Damage a limb takes before it comes off (bigger bodies: more). */
export const LIMB_HP = 30;
/** Which piece comes off when a segment is destroyed: hands go at the elbow, the rest at their own joint. */
const CUT_ROOT: Partial<Record<SegmentName, SegmentName>> = {
  head: 'head', upperArmL: 'upperArmL', upperArmR: 'upperArmR', lowerArmL: 'lowerArmL', lowerArmR: 'lowerArmR',
  upperLegL: 'upperLegL', upperLegR: 'upperLegR', lowerLegL: 'lowerLegL', lowerLegR: 'lowerLegR',
};
const LEGS = new Set<SegmentName>(['upperLegL', 'upperLegR', 'lowerLegL', 'lowerLegR']);

export const ZOMBIE_TUNING = {
  /** Claw reach (pelvis to pelvis) and the pause between claws. */
  reach: 1.45,
  attackCooldown: 1.1,
  /** Seconds climbing out of the ground after spawning. */
  riseSeconds: 1.1,
  riseDepth: 1.15,
  /** A dead zombie's body lies around this long before it vanishes. */
  corpseSeconds: 3.5,
};

export class Npc {
  readonly animator: Animator;
  hp = NPC_MAX_HP;
  /** Zombie (wave mode) settings, or null for the training dummies. */
  readonly zombie: ZombieConfig | null;
  /** Zombie corpse ready to be removed from the game. */
  dead = false;
  /** Seconds left climbing out of the ground. */
  riseLeft = 0;
  private attackCooldown = 0;
  private attackT: number | null = null;
  /** Max HP at spawn (boss health bar). */
  readonly maxHp: number;
  /** Zombie cavalry: the zombie llama this zombie rides (removed by the game when the rider dies). */
  steed: Llama | null = null;
  /** Getting around obstacles: time spent blocked, and a sideways detour. */
  private stuck = 0;
  private detourLeft = 0;
  private detourSign = 1;
  /** Damage soaked by each limb (for dismemberment). */
  private readonly limbDamage: Partial<Record<SegmentName, number>> = {};
  /** Limbs cut off since the game last asked. */
  private gore: GoreEvent[] = [];
  /** Body size (the boss is 4×). */
  readonly scale: number;
  state: NpcState = 'chase';
  yaw = 0;
  readonly position: THREE.Vector3;
  private moveState: NpcMoveState = 'chase';
  private timer = 0;
  private pushback: Pushback | null = null;
  private readonly home: THREE.Vector3;
  private frozenLeft = 0;
  private shockLeft = 0;
  /** Seconds left floating up (anti-gravity). */
  floatLeft = 0;

  constructor(readonly figure: Figure, position: THREE.Vector3, zombie: ZombieConfig | null = null) {
    this.position = position.clone();
    this.home = position.clone();
    this.zombie = zombie;
    this.animator = new Animator(zombie?.kind === 'cavalry' ? ZOMBIE_RIDE : zombie ? ZOMBIE : STANCE);
    this.scale = zombie?.scale ?? 1;
    this.maxHp = zombie ? zombie.hp : NPC_MAX_HP;
    if (zombie) {
      this.hp = zombie.hp;
      // Cavalry gallops in; everything else climbs out of the ground.
      this.riseLeft = zombie.kind === 'cavalry' ? 0 : ZOMBIE_TUNING.riseSeconds;
      this.attackCooldown = 0.6;
    }
  }

  get kind(): ZombieKind | null {
    return this.zombie ? this.zombie.kind ?? 'walker' : null;
  }

  /** Extra reach / stand-off for zombies on a llama (the llama's head sticks out ahead). */
  private get mountMargin(): number {
    return (this.steed ? 0.7 : 0) + (this.scale - 1) * 0.9;
  }

  /** Where the pelvis is drawn: below the ground while climbing out, on the saddle when riding. */
  private rootPosition(): THREE.Vector3 {
    const p = this.position.clone();
    p.y = PELVIS_HEIGHT * this.scale;
    if (this.steed) p.y = LLAMA.saddlePelvisY + this.steed.saddleBob();
    if (this.riseLeft > 0) {
      const k = this.riseLeft / ZOMBIE_TUNING.riseSeconds;
      p.y -= ZOMBIE_TUNING.riseDepth * this.scale * k * k;
    }
    return p;
  }

  /** Insta-kill, nukes: drop dead on the spot with a little shove. */
  kill(dir: THREE.Vector3): boolean {
    if (this.state === 'ragdoll') return false;
    this.frozenLeft = 0;
    this.figure.setTint(null);
    this.hp = 0;
    this.pushback = null;
    this.attackT = null;
    this.state = 'ragdoll';
    this.timer = 0;
    this.figure.toRagdoll({ segment: 'torso', impulse: dir.clone().normalize().multiplyScalar(30), point: this.figure.segmentPosition('torso') });
    return true;
  }

  get id(): string {
    return this.figure.id;
  }

  /** On its feet and hittable: walking, holding, flinching, or frozen solid. */
  get standing(): boolean {
    return this.state === 'chase' || this.state === 'hold' || this.state === 'flinch' || this.state === 'frozen';
  }

  get frozen(): boolean {
    return this.state === 'frozen';
  }

  /** Frozen solid and hit again: burst into a ragdoll thrown along `dir`. */
  /** Limbs cut off since the last call. */
  consumeGore(): GoreEvent[] {
    const g = this.gore;
    this.gore = [];
    return g;
  }

  /** Cut the limb that `segment` belongs to (if it can come off). Returns true if something came off. */
  cut(segment: SegmentName, dir: THREE.Vector3, force = 1): boolean {
    const root = CUT_ROOT[segment];
    if (!root) return false;
    const away = dir.clone().normalize().add(new THREE.Vector3(0, 0.6, 0)).normalize();
    const mass = this.scale ** 3;
    if (!this.figure.detach(root, away.multiplyScalar((root === 'head' ? 4 : 7) * force * mass))) return false;
    this.gore.push({ segment: root, dir: dir.clone().normalize() });
    // Losing a leg brings you down; losing both arms makes the claws weak.
    if (LEGS.has(root) && this.state !== 'ragdoll') this.kill(dir);
    return true;
  }

  /** Every limb it still has, blown off (frozen solid and shattered, or caught at the centre of a blast). */
  private cutAll(dir: THREE.Vector3, chance: number, rng: () => number = Math.random): number {
    let n = 0;
    for (const seg of ['head', 'upperArmL', 'upperArmR', 'upperLegL', 'upperLegR', 'lowerArmL', 'lowerArmR', 'lowerLegL', 'lowerLegR'] as SegmentName[]) {
      if (rng() >= chance) continue;
      const spread = dir.clone().add(new THREE.Vector3(rng() - 0.5, rng() * 0.8, rng() - 0.5)).normalize();
      if (this.cut(seg, spread, 1.6)) n++;
    }
    return n;
  }

  /** Bullet/pellet damage on a limb adds up; past the limit the limb comes off. */
  private woundLimb(segment: SegmentName, damage: number, dir: THREE.Vector3): void {
    if (!CUT_ROOT[segment] || segment === 'head') return;
    this.limbDamage[segment] = (this.limbDamage[segment] ?? 0) + damage;
    const limit = LIMB_HP * (this.zombie ? Math.max(1, this.maxHp / 60) : 1);
    if (this.limbDamage[segment]! >= limit) this.cut(segment, dir);
  }

  private shatter(dir: THREE.Vector3, segment: SegmentName, point: THREE.Vector3): void {
    this.frozenLeft = 0;
    this.figure.setTint(null);
    this.hp = 0;
    this.pushback = null;
    this.state = 'ragdoll';
    this.timer = 0;
    this.figure.toRagdoll({ segment, impulse: dir.clone().normalize().multiplyScalar(SPECIAL.shatterImpulse), point });
    // Frozen solid: it breaks into pieces.
    this.cutAll(dir, 0.8);
  }

  /** Freeze ray. Returns 'hit' when it froze, 'killed' when it shattered a frozen NPC, 'body' on a ragdoll. */
  freezeHit(segment: SegmentName, dir: THREE.Vector3, point: THREE.Vector3): ShotResult {
    if (this.state === 'ragdoll') {
      this.figure.applyImpulse(segment, dir.clone().multiplyScalar(10), point);
      return 'body';
    }
    if (this.state === 'frozen') {
      this.shatter(dir, segment, point);
      return 'killed';
    }
    this.state = 'frozen';
    this.frozenLeft = SPECIAL.freezeSeconds;
    this.pushback = null;
    this.figure.setTint(ICE);
    return 'hit';
  }

  /** Chain lightning. Damage and a jolt; a frozen NPC shatters; a body on the ground jumps. */
  zap(dir: THREE.Vector3): ShotResult {
    const torso = this.figure.segmentPosition('torso');
    const jolt = dir.clone().normalize().add(new THREE.Vector3(0, 0.8, 0)).normalize();
    if (this.state === 'ragdoll') {
      this.figure.applyImpulse('torso', jolt.multiplyScalar(SPECIAL.teslaImpulse), torso);
      this.flashShock();
      return 'body';
    }
    if (this.state === 'frozen') {
      this.shatter(dir, 'torso', torso);
      return 'killed';
    }
    this.hp = Math.max(0, this.hp - SPECIAL.teslaDamage);
    this.flashShock();
    if (this.hp <= 0) {
      this.pushback = null;
      this.state = 'ragdoll';
      this.timer = 0;
      this.figure.toRagdoll({ segment: 'torso', impulse: jolt.multiplyScalar(SPECIAL.teslaImpulse * 2), point: torso });
      return 'killed';
    }
    if (this.state !== 'recovering') {
      this.timer = 0;
      this.flinch(new THREE.Vector3(dir.x, 0, dir.z).normalize(), NPC_TUNING.shotPushbackDistance);
    }
    return 'hit';
  }

  private flashShock(): void {
    this.shockLeft = 0.3;
    if (this.state !== 'frozen' && this.floatLeft <= 0) this.figure.setTint(SHOCK);
  }

  /**
   * Caught in an explosion at strength k (1 at the centre, 0 at the edge). Returns true when this knocked a standing
   * NPC down. The caller then throws every ragdoll segment with Figure.blast.
   */
  explode(k: number, dir: THREE.Vector3, rng: () => number = Math.random): boolean {
    const knocked = this.explodeHit(k, dir);
    // Close to the blast, limbs come off (also off bodies already down).
    if (k > 0.35 && this.scale <= 1) this.cutAll(dir, (k - 0.35) * 0.9, rng);
    return knocked;
  }

  private explodeHit(k: number, dir: THREE.Vector3): boolean {
    if (this.state === 'ragdoll') {
      this.timer = Math.min(this.timer, NPC_TUNING.ragdollMinSeconds - 2);
      return false;
    }
    if (this.state === 'frozen') {
      this.shatter(dir, 'torso', this.figure.segmentPosition('torso'));
      return true;
    }
    this.hp = Math.max(0, this.hp - SPECIAL.blastDamage * k);
    if (this.hp > 0 && k < 0.3) {
      if (this.state !== 'recovering') this.flinch(new THREE.Vector3(dir.x, 0, dir.z).normalize(), 0.5);
      return false;
    }
    this.pushback = null;
    this.state = 'ragdoll';
    this.timer = 0;
    this.figure.toRagdoll();
    return true;
  }

  /** Anti-gravity: knocked into a ragdoll that falls upward for a while, then drops. True if it was standing. */
  levitate(): boolean {
    const wasStanding = this.state !== 'ragdoll';
    if (wasStanding) {
      this.frozenLeft = 0;
      this.pushback = null;
      this.state = 'ragdoll';
      this.hp = 0;
      this.figure.toRagdoll({ segment: 'torso', impulse: new THREE.Vector3(0, 6, 0), point: this.figure.segmentPosition('torso') });
    }
    this.timer = 0;
    this.floatLeft = SPECIAL.floatSeconds;
    this.figure.setGravityScale(SPECIAL.floatGravity);
    this.figure.setTint(FLOAT);
    return wasStanding;
  }

  get ground(): Vec2 {
    return { x: this.position.x, z: this.position.z };
  }

  /** Returns true when this hit knocked the NPC out. No effect unless standing. */
  takeHit(strike: StrikeDef, attackerYaw: number, segment: SegmentName, point: THREE.Vector3): boolean {
    if (!this.standing) return false;
    if (this.state === 'frozen') {
      this.shatter(new THREE.Vector3(Math.sin(attackerYaw), 0.3, Math.cos(attackerYaw)), segment, point);
      return true;
    }
    const r = applyDamage(this.hp, strike);
    this.hp = r.hp;
    this.timer = 0;
    if (r.knockedOut) {
      this.pushback = null;
      this.state = 'ragdoll';
      this.figure.toRagdoll({ segment, impulse: impulseVector(strike, attackerYaw), point });
      // A high kick to a zombie's head can take it off.
      if (this.zombie && strike.name === 'highKick' && segment === 'head' && Math.random() < 0.5) {
        this.cut('head', new THREE.Vector3(Math.sin(attackerYaw), 0.4, Math.cos(attackerYaw)), 1.6);
      }
      return true;
    }
    this.flinch(new THREE.Vector3(Math.sin(attackerYaw), 0, Math.cos(attackerYaw)), NPC_TUNING.pushbackDistance);
    return false;
  }

  /**
   * A bullet travelling along `dir` hit `segment` at `point`. Standing or getting up: damage by body region,
   * KO into a ragdoll thrown along the bullet. Already down: the body is pushed and stays down a bit longer.
   */
  takeShot(
    segment: SegmentName,
    dir: THREE.Vector3,
    point: THREE.Vector3,
    hit: { damage: number; koImpulse: number; ragdollImpulse: number; decapChance?: number } = {
      damage: damageForSegment(segment), koImpulse: RIFLE.koImpulse, ragdollImpulse: RIFLE.ragdollImpulse, decapChance: 0.55,
    },
  ): ShotResult {
    if (this.state === 'ragdoll') {
      this.figure.applyImpulse(segment, dir.clone().multiplyScalar(hit.ragdollImpulse), point);
      this.timer = Math.min(this.timer, NPC_TUNING.ragdollMinSeconds - 2);
      // Shooting a body on the ground takes it apart.
      this.woundLimb(segment, hit.damage, dir);
      return 'body';
    }
    if (this.state === 'frozen') {
      this.shatter(dir, segment, point);
      return 'killed';
    }
    this.hp = Math.max(0, this.hp - hit.damage);
    if (this.hp <= 0) {
      this.pushback = null;
      this.state = 'ragdoll';
      this.timer = 0;
      this.figure.toRagdoll({ segment, impulse: dir.clone().multiplyScalar(hit.koImpulse), point });
      // A killing shot to the head can take it clean off.
      if (segment === 'head' && Math.random() < (hit.decapChance ?? 0.55)) this.cut('head', dir, 1.4);
      else this.woundLimb(segment, hit.damage, dir);
      return 'killed';
    }
    this.woundLimb(segment, hit.damage, dir);
    // Losing a leg just now brought it down.
    if ((this.state as NpcState) === 'ragdoll') return 'killed';
    if (this.state !== 'recovering') {
      this.timer = 0;
      this.flinch(new THREE.Vector3(dir.x, 0, dir.z).normalize(), NPC_TUNING.shotPushbackDistance * (1 / this.scale));
    }
    return 'hit';
  }

  private flinch(dir: THREE.Vector3, distance: number): void {
    this.attackT = null;
    this.state = 'flinch';
    this.animator.play(FLINCH);
    this.pushback = {
      velocity: dir.multiplyScalar(distance / NPC_TUNING.pushbackSeconds),
      remaining: NPC_TUNING.pushbackSeconds,
    };
  }

  /** Advance one tick. Returns the damage a zombie claw dealt to the player this tick (0 otherwise). */
  update(dt: number, player: Vec2, others: Vec2[], margin = 0, collide?: (p: THREE.Vector3, radius: number) => void): number {
    this.timer += dt;
    let speed = 0;
    let dealt = 0;
    if (this.shockLeft > 0) {
      this.shockLeft -= dt;
      if (this.shockLeft <= 0 && this.state !== 'frozen' && this.floatLeft <= 0) this.figure.setTint(null);
    }

    switch (this.state) {
      case 'frozen': {
        // Solid ice: the kinematic body keeps its last pose until it thaws.
        this.attackT = null;
        this.frozenLeft -= dt;
        if (this.frozenLeft <= 0) {
          this.figure.setTint(null);
          this.state = 'hold';
          this.moveState = 'hold';
        }
        return 0;
      }
      case 'ragdoll': {
        if (this.floatLeft > 0) {
          this.floatLeft -= dt;
          this.timer = 0;
          if (this.floatLeft <= 0) {
            this.figure.setGravityScale(1);
            this.figure.setTint(null);
          }
        }
        if (this.zombie) {
          // Zombies stay down; the corpse is removed once it has settled for a while.
          if (this.floatLeft <= 0 && this.timer >= ZOMBIE_TUNING.corpseSeconds
            && (this.figure.maxSpeed() < NPC_TUNING.settleSpeed || this.timer > ZOMBIE_TUNING.corpseSeconds * 2)) this.dead = true;
          return 0;
        }
        if (this.figure.pelvisPosition().y < -2) { this.teleportHome(); return 0; }
        if (!shouldRecover(this.timer, this.figure.maxSpeed())) return 0;
        this.standUp();
        return 0;
      }
      case 'recovering': {
        if (this.timer >= NPC_TUNING.recoverSeconds) { this.state = 'chase'; this.moveState = 'chase'; }
        break;
      }
      case 'flinch': {
        if (this.pushback) {
          const step = Math.min(dt, this.pushback.remaining);
          this.position.addScaledVector(this.pushback.velocity, step);
          collide?.(this.position, 0.35 * this.scale);
          this.pushback.remaining -= step;
          if (this.pushback.remaining <= 1e-9) this.pushback = null;
        }
        if (this.timer >= NPC_TUNING.flinchSeconds) { this.state = 'hold'; this.moveState = 'hold'; }
        break;
      }
      case 'chase':
      case 'hold': {
        if (this.zombie) {
          const r = this.zombieTick(dt, player, margin + this.mountMargin);
          dealt = r.dealt;
          if (r.busy) break;
        }
        const s = steer({ self: this.ground, player, others, state: this.moveState, margin: margin + this.mountMargin, speed: this.zombie?.speed });
        this.moveState = s.state;
        this.state = s.state;
        const v = new THREE.Vector3(s.velocity.x, 0, s.velocity.z);
        // Blocked by an obstacle for a moment: detour sideways around it.
        if (this.detourLeft > 0) {
          this.detourLeft -= dt;
          v.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.detourSign * 1.15);
        }
        speed = v.length();
        if (speed > 0.05) {
          const before = this.position.clone();
          this.position.addScaledVector(v, dt);
          collide?.(this.position, 0.35 * this.scale);
          const moved = this.position.distanceTo(before);
          if (moved < speed * dt * 0.35) this.stuck += dt;
          else this.stuck = Math.max(0, this.stuck - dt);
          if (this.stuck > 0.3 && this.detourLeft <= 0) {
            this.detourSign = Math.random() < 0.5 ? -1 : 1;
            this.detourLeft = 0.9;
            this.stuck = 0;
          }
        } else speed = 0;
        this.yaw = lerpAngle(this.yaw, s.yaw, 1 - Math.exp(-8 * dt));
        break;
      }
    }

    if (this.steed) this.steed.update(dt, this.position, this.yaw, speed, true);
    // Giants take long strides: animate as if walking slower.
    const joints = this.animator.update(dt, this.steed ? 0 : this.scale > 1 ? (speed / this.scale) * 2.2 : speed);
    this.figure.applyPose({ root: { position: this.rootPosition(), rotation: yawQuaternion(this.yaw) }, joints }, dt);
    return dealt;
  }

  /**
   * Zombie extras on top of walking: climbing out of the ground, and clawing the player when in reach.
   * `busy` means it should not walk this tick.
   */
  private zombieTick(dt: number, player: Vec2, margin: number): { dealt: number; busy: boolean } {
    const z = this.zombie!;
    if (this.riseLeft > 0) {
      this.riseLeft = Math.max(0, this.riseLeft - dt);
      return { dealt: 0, busy: true };
    }
    const dist = Math.hypot(player.x - this.position.x, player.z - this.position.z);
    const reach = ZOMBIE_TUNING.reach * (this.scale > 1 ? this.scale * 0.8 : 1) + margin;
    this.attackCooldown -= dt;
    if (this.attackT === null && this.attackCooldown <= 0 && dist <= reach) {
      this.attackT = 0;
      this.animator.play(ZOMBIE_SWIPE, 0.08);
    }
    if (this.attackT === null) return { dealt: 0, busy: false };
    const before = this.attackT;
    this.attackT += dt;
    let dealt = 0;
    if (before < ZOMBIE_SWIPE_HIT && this.attackT >= ZOMBIE_SWIPE_HIT && dist <= reach + 0.25) {
      // No arms left: only a weak bite.
      const arms = (this.figure.isDetached('lowerArmL') ? 0 : 1) + (this.figure.isDetached('lowerArmR') ? 0 : 1);
      dealt = arms === 0 ? Math.round(z.damage * 0.4) : z.damage;
    }
    if (this.attackT >= ZOMBIE_SWIPE.duration) {
      this.attackT = null;
      this.attackCooldown = ZOMBIE_TUNING.attackCooldown;
    }
    this.yaw = lerpAngle(this.yaw, Math.atan2(player.x - this.position.x, player.z - this.position.z), 1 - Math.exp(-8 * dt));
    return { dealt, busy: true };
  }

  /** Ragdoll → kinematic: blend root and joints from where the body lies back to the stance. */
  private standUp(): void {
    this.figure.setGravityScale(1);
    this.figure.setTint(null);
    this.floatLeft = 0;
    const rots = this.figure.readJointRots();
    const root = this.figure.readRoot();
    this.position.set(root.position.x, PELVIS_HEIGHT, root.position.z);
    this.yaw = yawFromQuaternion(root.rotation);
    this.figure.toPosed();
    this.figure.beginRootBlend(NPC_TUNING.recoverSeconds);
    this.animator.stopAction();
    this.animator.blendFromRots(rots, NPC_TUNING.recoverSeconds);
    this.hp = NPC_MAX_HP;
    this.state = 'recovering';
    this.timer = 0;
  }

  /** Numerical blow-up safety: back to the spawn point, standing. */
  private teleportHome(): void {
    this.figure.setGravityScale(1);
    this.figure.setTint(null);
    this.floatLeft = 0;
    this.figure.toPosed();
    this.animator.stopAction();
    this.position.copy(this.home);
    this.yaw = 0;
    this.hp = NPC_MAX_HP;
    this.state = 'recovering';
    this.timer = 0;
  }
}
