import * as THREE from 'three';
import type { Figure } from '../figure/figure';
import { yawQuaternion } from '../figure/fk';
import { Animator } from '../anim/animator';
import { STANCE } from '../anim/clips';
import { getStrikeClip } from '../anim/strikeClips';
import { canAttack, createAttackState, recordHit, startAttack, tickAttack, type AttackState } from '../combat/attack';
import { STRIKES, type StrikeDef, type StrikeName } from '../combat/strikes';
import { lerpAngle } from '../core/math';
import { yawToward } from './npcBrain';

export const PLAYER_TUNING = {
  walkSpeed: 3,
  runSpeed: 6,
  turnRate: 12,
  lockOnRange: 2.5,
  blockDistance: 0.5,
};

export interface PlayerInput {
  /** World-space unit direction or zero (already camera-relative). */
  move: THREE.Vector3;
  run: boolean;
  /** Strike keys pressed this tick, in order. */
  strikes: StrikeName[];
  cameraYaw: number;
}

export interface TargetInfo {
  id: string;
  position: THREE.Vector3;
  standing: boolean;
}

function groundDistance(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function pickTarget(position: THREE.Vector3, targets: TargetInfo[]): TargetInfo | null {
  let best: TargetInfo | null = null;
  let bestD = PLAYER_TUNING.lockOnRange;
  for (const t of targets) {
    if (!t.standing) continue;
    const d = groundDistance(position, t.position);
    if (d <= bestD) { best = t; bestD = d; }
  }
  return best;
}

export function blockedByTarget(next: THREE.Vector3, targets: TargetInfo[]): boolean {
  return targets.some((t) => t.standing && groundDistance(next, t.position) < PLAYER_TUNING.blockDistance);
}

export class Player {
  readonly animator = new Animator(STANCE);
  attack: AttackState = createAttackState();
  yaw = 0;
  readonly position: THREE.Vector3;

  constructor(readonly figure: Figure, position: THREE.Vector3) {
    this.position = position.clone();
  }

  update(dt: number, input: PlayerInput, targets: TargetInfo[]): void {
    if (this.figure.mode !== 'posed') return;

    const wanted = input.strikes[0];
    if (wanted && canAttack(this.attack)) {
      const target = pickTarget(this.position, targets);
      this.yaw = target
        ? yawToward({ x: this.position.x, z: this.position.z }, { x: target.position.x, z: target.position.z })
        : input.cameraYaw;
      this.attack = startAttack(this.attack, wanted);
      this.animator.play(getStrikeClip(wanted));
    } else {
      this.attack = tickAttack(this.attack, dt);
    }

    let speed = 0;
    if (canAttack(this.attack) && input.move.lengthSq() > 0) {
      speed = input.run ? PLAYER_TUNING.runSpeed : PLAYER_TUNING.walkSpeed;
      const next = this.position.clone().addScaledVector(input.move, speed * dt);
      if (blockedByTarget(next, targets)) speed = 0;
      else this.position.copy(next);
      const targetYaw = Math.atan2(input.move.x, input.move.z);
      this.yaw = lerpAngle(this.yaw, targetYaw, 1 - Math.exp(-PLAYER_TUNING.turnRate * dt));
    }

    const joints = this.animator.update(dt, speed);
    this.figure.applyPose({ root: { position: this.position, rotation: yawQuaternion(this.yaw) }, joints }, dt);
  }

  /** While a strike is in its active window: the strike and the current hand/foot position. */
  activeStrike(): { strike: StrikeDef; point: THREE.Vector3 } | null {
    if (this.attack.phase !== 'active' || !this.attack.strike) return null;
    const strike = STRIKES[this.attack.strike];
    return { strike, point: this.figure.limbPoint(strike.limb) };
  }

  recordHit(targetId: string): void {
    this.attack = recordHit(this.attack, targetId);
  }
}
