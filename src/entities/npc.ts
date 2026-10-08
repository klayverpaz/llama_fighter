import * as THREE from 'three';
import type { Figure } from '../figure/figure';
import { yawFromQuaternion, yawQuaternion } from '../figure/fk';
import { PELVIS_HEIGHT, type SegmentName } from '../figure/skeleton';
import { Animator } from '../anim/animator';
import { STANCE, ZOMBIE, ZOMBIE_SWIPE, ZOMBIE_SWIPE_HIT } from '../anim/clips';
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
}

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
    this.animator = new Animator(zombie ? ZOMBIE : STANCE);
    if (zombie) {
      this.hp = zombie.hp;
      this.riseLeft = ZOMBIE_TUNING.riseSeconds;
      this.attackCooldown = 0.6;
    }
  }

  /** Where the pelvis is drawn: below the ground while climbing out. */
  private rootPosition(): THREE.Vector3 {
    const p = this.position.clone();
    if (this.riseLeft > 0) {
      const k = this.riseLeft / ZOMBIE_TUNING.riseSeconds;
      p.y -= ZOMBIE_TUNING.riseDepth * k * k;
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
  private shatter(dir: THREE.Vector3, segment: SegmentName, point: THREE.Vector3): void {
    this.frozenLeft = 0;
    this.figure.setTint(null);
    this.hp = 0;
    this.pushback = null;
    this.state = 'ragdoll';
    this.timer = 0;
    this.figure.toRagdoll({ segment, impulse: dir.clone().normalize().multiplyScalar(SPECIAL.shatterImpulse), point });
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
  explode(k: number, dir: THREE.Vector3): boolean {
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
    hit: { damage: number; koImpulse: number; ragdollImpulse: number } = {
      damage: damageForSegment(segment), koImpulse: RIFLE.koImpulse, ragdollImpulse: RIFLE.ragdollImpulse,
    },
  ): ShotResult {
    if (this.state === 'ragdoll') {
      this.figure.applyImpulse(segment, dir.clone().multiplyScalar(hit.ragdollImpulse), point);
      this.timer = Math.min(this.timer, NPC_TUNING.ragdollMinSeconds - 2);
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
      return 'killed';
    }
    if (this.state !== 'recovering') {
      this.timer = 0;
      this.flinch(new THREE.Vector3(dir.x, 0, dir.z).normalize(), NPC_TUNING.shotPushbackDistance);
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
  update(dt: number, player: Vec2, others: Vec2[], margin = 0): number {
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
          this.pushback.remaining -= step;
          if (this.pushback.remaining <= 1e-9) this.pushback = null;
        }
        if (this.timer >= NPC_TUNING.flinchSeconds) { this.state = 'hold'; this.moveState = 'hold'; }
        break;
      }
      case 'chase':
      case 'hold': {
        if (this.zombie) {
          const r = this.zombieTick(dt, player, margin);
          dealt = r.dealt;
          if (r.busy) break;
        }
        const s = steer({ self: this.ground, player, others, state: this.moveState, margin, speed: this.zombie?.speed });
        this.moveState = s.state;
        this.state = s.state;
        const v = new THREE.Vector3(s.velocity.x, 0, s.velocity.z);
        speed = v.length();
        if (speed > 0.05) this.position.addScaledVector(v, dt);
        else speed = 0;
        this.yaw = lerpAngle(this.yaw, s.yaw, 1 - Math.exp(-8 * dt));
        break;
      }
    }

    const joints = this.animator.update(dt, speed);
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
    const reach = ZOMBIE_TUNING.reach + margin;
    this.attackCooldown -= dt;
    if (this.attackT === null && this.attackCooldown <= 0 && dist <= reach) {
      this.attackT = 0;
      this.animator.play(ZOMBIE_SWIPE, 0.08);
    }
    if (this.attackT === null) return { dealt: 0, busy: false };
    const before = this.attackT;
    this.attackT += dt;
    let dealt = 0;
    if (before < ZOMBIE_SWIPE_HIT && this.attackT >= ZOMBIE_SWIPE_HIT && dist <= reach + 0.25) dealt = z.damage;
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
