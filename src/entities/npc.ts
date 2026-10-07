import * as THREE from 'three';
import type { Figure } from '../figure/figure';
import { yawFromQuaternion, yawQuaternion } from '../figure/fk';
import { PELVIS_HEIGHT, type SegmentName } from '../figure/skeleton';
import { Animator } from '../anim/animator';
import { STANCE } from '../anim/clips';
import { FLINCH } from '../anim/strikeClips';
import { applyDamage, impulseVector } from '../combat/damage';
import { NPC_MAX_HP, type StrikeDef } from '../combat/strikes';
import { lerpAngle } from '../core/math';
import { NPC_TUNING, shouldRecover, steer, type NpcMoveState, type Vec2 } from './npcBrain';

export type NpcState = 'chase' | 'hold' | 'flinch' | 'ragdoll' | 'recovering';

interface Pushback { velocity: THREE.Vector3; remaining: number }

export class Npc {
  readonly animator = new Animator(STANCE);
  hp = NPC_MAX_HP;
  state: NpcState = 'chase';
  yaw = 0;
  readonly position: THREE.Vector3;
  private moveState: NpcMoveState = 'chase';
  private timer = 0;
  private pushback: Pushback | null = null;
  private readonly home: THREE.Vector3;

  constructor(readonly figure: Figure, position: THREE.Vector3) {
    this.position = position.clone();
    this.home = position.clone();
  }

  get id(): string {
    return this.figure.id;
  }

  get standing(): boolean {
    return this.state === 'chase' || this.state === 'hold' || this.state === 'flinch';
  }

  get ground(): Vec2 {
    return { x: this.position.x, z: this.position.z };
  }

  /** Returns true when this hit knocked the NPC out. No effect unless standing. */
  takeHit(strike: StrikeDef, attackerYaw: number, segment: SegmentName, point: THREE.Vector3): boolean {
    if (!this.standing) return false;
    const r = applyDamage(this.hp, strike);
    this.hp = r.hp;
    this.timer = 0;
    if (r.knockedOut) {
      this.pushback = null;
      this.state = 'ragdoll';
      this.figure.toRagdoll({ segment, impulse: impulseVector(strike, attackerYaw), point });
      return true;
    }
    this.state = 'flinch';
    this.animator.play(FLINCH);
    const dir = new THREE.Vector3(Math.sin(attackerYaw), 0, Math.cos(attackerYaw));
    this.pushback = {
      velocity: dir.multiplyScalar(NPC_TUNING.pushbackDistance / NPC_TUNING.pushbackSeconds),
      remaining: NPC_TUNING.pushbackSeconds,
    };
    return false;
  }

  update(dt: number, player: Vec2, others: Vec2[]): void {
    this.timer += dt;
    let speed = 0;

    switch (this.state) {
      case 'ragdoll': {
        if (this.figure.pelvisPosition().y < -2) { this.teleportHome(); return; }
        if (!shouldRecover(this.timer, this.figure.maxSpeed())) return;
        this.standUp();
        return;
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
        const s = steer({ self: this.ground, player, others, state: this.moveState });
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
    this.figure.applyPose({ root: { position: this.position, rotation: yawQuaternion(this.yaw) }, joints }, dt);
  }

  /** Ragdoll → kinematic: blend root and joints from where the body lies back to the stance. */
  private standUp(): void {
    const rots = this.figure.readJointRots();
    const root = this.figure.readRoot();
    this.position.set(root.position.x, PELVIS_HEIGHT, root.position.z);
    this.yaw = yawFromQuaternion(root.rotation);
    this.figure.toPosed();
    this.figure.beginRootBlend(NPC_TUNING.recoverSeconds);
    this.animator.blendFromRots(rots, NPC_TUNING.recoverSeconds);
    this.hp = NPC_MAX_HP;
    this.state = 'recovering';
    this.timer = 0;
  }

  /** Numerical blow-up safety: back to the spawn point, standing. */
  private teleportHome(): void {
    this.figure.toPosed();
    this.position.copy(this.home);
    this.yaw = 0;
    this.hp = NPC_MAX_HP;
    this.state = 'recovering';
    this.timer = 0;
  }
}
