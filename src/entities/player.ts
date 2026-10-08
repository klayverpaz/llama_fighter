import * as THREE from 'three';
import type { Figure } from '../figure/figure';
import { forwardKinematics, yawQuaternion } from '../figure/fk';
import { Animator } from '../anim/animator';
import { RIDE, RIFLE_STANCE, STANCE } from '../anim/clips';
import { LLAMA } from './llama';
import { getStrikeClip } from '../anim/strikeClips';
import { canAttack, createAttackState, recordHit, startAttack, tickAttack, type AttackState } from '../combat/attack';
import { STRIKES, type StrikeDef, type StrikeName } from '../combat/strikes';
import { lerpAngle } from '../core/math';
import { yawToward } from './npcBrain';
import type { RifleState } from '../weapons/rifle';
import { GUNS, GUN_NAMES, RESERVE, type GunName } from '../weapons/guns';
import { GUN_POINTS, HOLSTER_SIDE } from '../weapons/gunPoints';
import { pumpStroke, SHOTGUN } from '../weapons/shotgun';
import type { SegmentTransform } from '../figure/fk';
import { muzzleOf, reloadWeight, solveGunRig, type RigOutput } from './rifleRig';

export type Weapon = 'fists' | GunName;

/** Q / the touch weapon button cycles through these; on the llama the fists are skipped. */
const WEAPON_CYCLE: Weapon[] = ['fists', ...GUN_NAMES];

export interface RifleEvents {
  dryFire: boolean;
  reloadStarted: boolean;
  reloadFinished: boolean;
  /** A gun just came off the back or went back on it. */
  swapped: boolean;
  mounted: boolean;
  dismounted: boolean;
  /** The shotgun's pump stroke started (spent shell flies out). */
  pumped: boolean;
  /** One shell pushed into the shotgun's tube. */
  shellLoaded: boolean;
}

export const PLAYER_TUNING = {
  walkSpeed: 3,
  runSpeed: 6,
  turnRate: 12,
  /** Exponential turn rate toward the auto-aim heading while a strike plays (180° ≈ done in 0.08 s). */
  aimTurnRate: 40,
  lockOnRange: 2.5,
  blockDistance: 0.5,
  /** Walking speed while aiming down the sights (no running). */
  aimWalkSpeed: 2,
  /** Seconds to take the rifle off the back or put it away. */
  swapSeconds: 0.35,
  /** How fast the rifle comes up to the shoulder / drops to low ready. */
  aimRaiseRate: 14,
  /** Body follows the camera this fast while aiming. */
  aimFollowRate: 25,
  /** The rifle stays shouldered this long after the last shot. */
  shoulderAfterShot: 0.45,
};

export interface PlayerInput {
  /** World-space unit direction or zero (already camera-relative). */
  move: THREE.Vector3;
  run: boolean;
  /** Strike keys pressed this tick, in order. */
  strikes: StrikeName[];
  cameraYaw: number;
  /** Switch weapon this tick ('toggle' = next, 'prev' = previous). */
  weapon?: Weapon | 'toggle' | 'prev';
  /** Right mouse held: shoulder the rifle and aim down the sights. */
  aim?: boolean;
  /** Left mouse held: fire. */
  fire?: boolean;
  /** Reload key pressed this tick. */
  reload?: boolean;
  /** Get on / off the llama this tick. */
  mount?: boolean;
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

/** Blocks a step that ends too close to a standing target AND moves closer to it; retreating is always allowed. */
export function blockedByTarget(current: THREE.Vector3, next: THREE.Vector3, targets: TargetInfo[]): boolean {
  return targets.some((t) => {
    if (!t.standing) return false;
    const after = groundDistance(next, t.position);
    return after < PLAYER_TUNING.blockDistance && after < groundDistance(current, t.position);
  });
}

/** One tick of the smooth turn toward the strike's aim heading. */
export function turnTowardAim(yaw: number, aimYaw: number, dt: number): number {
  return lerpAngle(yaw, aimYaw, 1 - Math.exp(-PLAYER_TUNING.aimTurnRate * dt));
}

export class Player {
  readonly animator = new Animator(STANCE);
  attack: AttackState = createAttackState();
  yaw = 0;
  /** Heading the current strike turns toward (nearest target, else the camera). */
  aimYaw = 0;
  readonly position: THREE.Vector3;

  weapon: Weapon = 'fists';
  /** Each gun keeps its own magazine. */
  readonly guns = Object.fromEntries(GUN_NAMES.map((g) => [g, GUNS[g].create()])) as Record<GunName, RifleState>;
  /** The gun physically in the hands (or on its way in / out); null with empty hands. */
  heldGun: GunName | null = null;
  /** Drawn by a plain click with empty hands, and when getting on the llama. */
  lastGun: GunName = 'rifle';
  /** Weapons the player has (training: everything; wave mode: fists + AK, more from the Mystery Box). */
  readonly owned = new Set<Weapon>(['fists', ...GUN_NAMES]);
  /** Spare rounds per gun (Infinity in training). */
  readonly reserve = Object.fromEntries(GUN_NAMES.map((g) => [g, Infinity])) as Record<GunName, number>;
  /** 0 = held gun slung on the back, 1 = in the hands. */
  swap = 0;
  /** Torso world transform this tick (for slinging the guns on the back). */
  torso: SegmentTransform | null = null;
  private reloadBlend = 0;
  /** 0 = low ready, 1 = shouldered. */
  aimBlend = 0;
  /** Was the player moving last tick (adds bullet spread). */
  moving = false;
  /** Latest rifle pose (world), recomputed every tick. */
  gun: RigOutput | null = null;
  /** Riding the llama: rifle only, no strikes, llama speeds. */
  mounted = false;
  /** Ground speed last tick (drives the llama's gait). */
  speed = 0;
  /** Saddle bob from the llama's gait, set by the game each tick. */
  rideBob = 0;
  private sinceShot = Infinity;
  private pendingShots = 0;
  private events: RifleEvents = this.noEvents();

  private noEvents(): RifleEvents {
    return {
      dryFire: false, reloadStarted: false, reloadFinished: false, swapped: false,
      mounted: false, dismounted: false, pumped: false, shellLoaded: false,
    };
  }

  /** Where the pelvis really is: raised onto the saddle while riding. */
  rootPosition(): THREE.Vector3 {
    const p = this.position.clone();
    if (this.mounted) p.y = LLAMA.saddlePelvisY + this.rideBob;
    return p;
  }

  private baseClip() {
    if (this.mounted) return RIDE;
    return this.weapon === 'fists' ? STANCE : RIFLE_STANCE;
  }

  /** The selected gun, or null with fists. */
  get currentGun(): GunName | null {
    return this.weapon === 'fists' ? null : this.weapon;
  }

  /** Ammo/reload/spread state of the selected gun (the rifle's when empty-handed). */
  get rifle(): RifleState {
    return this.guns[this.currentGun ?? this.lastGun];
  }

  constructor(readonly figure: Figure, position: THREE.Vector3) {
    this.position = position.clone();
  }

  /** A gun in the hands and ready (not mid-swap). */
  get armed(): boolean {
    return this.weapon !== 'fists' && this.heldGun === this.weapon && this.swap >= 1;
  }

  /** Rounds fired since the last call. */
  consumeShots(): number {
    const n = this.pendingShots;
    this.pendingShots = 0;
    return n;
  }

  consumeRifleEvents(): RifleEvents {
    const e = this.events;
    this.events = this.noEvents();
    return e;
  }

  muzzle(): THREE.Vector3 | null {
    return this.gun && this.heldGun ? muzzleOf(this.gun, GUN_POINTS[this.heldGun]) : null;
  }

  update(dt: number, input: PlayerInput, targets: TargetInfo[], aimPoint?: THREE.Vector3 | null): void {
    if (this.figure.mode !== 'posed') return;

    if (input.mount && canAttack(this.attack)) this.toggleMount();
    this.updateWeapon(dt, input);
    const aiming = this.weapon !== 'fists' && this.aimBlend > 0.2;

    const wanted = !this.mounted && this.weapon === 'fists' && this.swap <= 0 ? input.strikes[0] : undefined;
    if (wanted && canAttack(this.attack)) {
      const target = pickTarget(this.position, targets);
      this.aimYaw = target
        ? yawToward({ x: this.position.x, z: this.position.z }, { x: target.position.x, z: target.position.z })
        : input.cameraYaw;
      this.attack = startAttack(this.attack, wanted);
      this.animator.play(getStrikeClip(wanted));
    } else {
      this.attack = tickAttack(this.attack, dt);
    }
    if (!canAttack(this.attack)) this.yaw = turnTowardAim(this.yaw, this.aimYaw, dt);

    let speed = 0;
    if (canAttack(this.attack) && input.move.lengthSq() > 0) {
      if (this.mounted) speed = aiming ? LLAMA.aimSpeed : input.run ? LLAMA.runSpeed : LLAMA.walkSpeed;
      else speed = aiming ? PLAYER_TUNING.aimWalkSpeed : input.run ? PLAYER_TUNING.runSpeed : PLAYER_TUNING.walkSpeed;
      const next = this.position.clone().addScaledVector(input.move, speed * dt);
      if (!this.mounted && blockedByTarget(this.position, next, targets)) speed = 0;
      else this.position.copy(next);
      if (!aiming) {
        const targetYaw = Math.atan2(input.move.x, input.move.z);
        const rate = this.mounted ? LLAMA.turnRate : PLAYER_TUNING.turnRate;
        this.yaw = lerpAngle(this.yaw, targetYaw, 1 - Math.exp(-rate * dt));
      }
    }
    // Aiming: the body faces where the camera looks and strafes.
    if (aiming) this.yaw = lerpAngle(this.yaw, input.cameraYaw, 1 - Math.exp(-PLAYER_TUNING.aimFollowRate * dt));
    this.moving = speed > 0;
    this.speed = speed;

    // Riding: the llama walks, the rider's legs stay in the saddle pose.
    const joints = this.animator.update(dt, this.mounted ? 0 : speed);
    const root = { position: this.rootPosition(), rotation: yawQuaternion(this.yaw) };
    const aim = aimPoint ?? this.defaultAimPoint();

    // Lean the chest toward where the rifle points.
    if (this.aimBlend > 0) {
      const chest = root.position.clone().add(new THREE.Vector3(0, 0.55, 0));
      const dir = aim.clone().sub(chest).normalize();
      const pitch = Math.asin(Math.min(1, Math.max(-1, -dir.y)));
      const lean = Math.min(0.45, Math.max(-0.35, pitch * 0.5)) * this.aimBlend;
      joints.spine = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lean).multiply(joints.spine);
    }

    const torso = forwardKinematics({ root, joints }).torso;
    this.torso = torso;
    this.gun = null;
    if (this.heldGun) {
      const spec = GUNS[this.heldGun];
      const state = this.guns[this.heldGun];
      const phase = state.reloading > 0 ? 1 - state.reloading / spec.reloadSeconds : 0;
      this.reloadBlend += ((state.reloading > 0 ? 1 : 0) - this.reloadBlend) * (1 - Math.exp(-12 * dt));
      const reload = spec.reloadStyle === 'mag'
        ? (state.reloading > 0 ? { style: 'mag' as const, phase, weight: reloadWeight(phase) } : null)
        : (this.reloadBlend > 0.01 ? { style: 'shell' as const, phase: state.reloading > 0 ? phase : 0, weight: this.reloadBlend } : null);
      this.gun = solveGunRig({
        torso, aimPoint: aim, aimBlend: this.aimBlend, swap: this.swap,
        points: GUN_POINTS[this.heldGun], holsterSide: HOLSTER_SIDE[this.heldGun],
        reload, pump: this.heldGun === 'shotgun' ? pumpStroke(this.sinceShot) : 0,
      });
      if (this.swap > 0) Object.assign(joints, this.gun.joints);
    }

    this.figure.applyPose({ root, joints }, dt);
  }

  private toggleMount(): void {
    this.mounted = !this.mounted;
    if (this.mounted) {
      // On the llama there are only guns.
      if (this.weapon === 'fists') this.selectWeapon(this.lastGun);
      this.events.mounted = true;
    } else {
      // Step off to the llama's left side.
      this.position.add(new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(0.85));
      this.events.dismounted = true;
    }
    this.animator.setBase(this.baseClip(), 0.3);
  }

  private defaultAimPoint(): THREE.Vector3 {
    return this.rootPosition().add(new THREE.Vector3(Math.sin(this.yaw) * 20, 0.45, Math.cos(this.yaw) * 20));
  }

  /** Next (or previous, step −1) weapon for Q / the mouse wheel; the llama skips the fists. */
  nextWeapon(step = 1): Weapon {
    const cycle = WEAPON_CYCLE.filter((w) => this.owned.has(w) && !(this.mounted && w === 'fists'));
    const i = Math.max(0, cycle.indexOf(this.weapon));
    return cycle[(i + step + cycle.length) % cycle.length];
  }

  /** Wave mode loadout: fists and the AK with limited spare ammo. */
  limitArsenal(): void {
    this.owned.clear();
    this.owned.add('fists');
    this.owned.add('rifle');
    for (const g of GUN_NAMES) this.reserve[g] = RESERVE[g];
  }

  /** Give a gun (Mystery Box) with a full magazine and reserve, and switch to it. */
  giveGun(gun: GunName): void {
    this.owned.add(gun);
    this.guns[gun] = GUNS[gun].create();
    this.reserve[gun] = RESERVE[gun];
    this.selectWeapon(gun);
  }

  /** Max Ammo: every owned gun full, magazine and reserve. */
  refillAmmo(): void {
    for (const g of GUN_NAMES) {
      if (!this.owned.has(g)) continue;
      this.guns[g] = { ...this.guns[g], ammo: GUNS[g].magSize, reloading: 0 };
      if (Number.isFinite(this.reserve[g])) this.reserve[g] = RESERVE[g];
    }
  }

  private selectWeapon(next: Weapon): void {
    if (next === this.weapon || !this.owned.has(next)) return;
    const old = this.currentGun;
    if (old) this.guns[old] = { ...this.guns[old], reloading: 0 };
    this.weapon = next;
    if (next !== 'fists') this.lastGun = next;
    this.animator.setBase(this.baseClip());
    this.events.swapped = true;
  }

  private updateWeapon(dt: number, input: PlayerInput): void {
    if (input.weapon && canAttack(this.attack)) {
      const next = input.weapon === 'toggle' ? this.nextWeapon() : input.weapon === 'prev' ? this.nextWeapon(-1) : input.weapon;
      if (!(this.mounted && next === 'fists')) this.selectWeapon(next);
    }

    // Swap animation: put the gun in hand away first, then draw the selected one.
    const swapRate = dt / PLAYER_TUNING.swapSeconds;
    const target = this.currentGun;
    if (this.heldGun !== target) {
      if (this.heldGun === null || this.swap <= 0) {
        this.heldGun = target;
        this.swap = 0;
      } else {
        this.swap = Math.max(0, this.swap - swapRate);
      }
    } else if (this.heldGun) {
      this.swap = Math.min(1, this.swap + swapRate);
    }

    const before = this.sinceShot;
    this.sinceShot += dt;
    if (this.heldGun === 'shotgun' && before < SHOTGUN.pumpDelay && this.sinceShot >= SHOTGUN.pumpDelay) this.events.pumped = true;
    const gun = this.currentGun;
    if (this.armed && gun) {
      const before = this.guns[gun];
      const spare = this.reserve[gun];
      const r = GUNS[gun].tick(before, dt, { trigger: !!input.fire, reload: !!input.reload && spare > 0 });
      let next = r.state;
      // Reloading draws from the reserve: no spare rounds, no reload; a partial reserve only partly fills.
      if (spare <= 0 && next.reloading > 0 && before.reloading === 0) {
        next = { ...next, reloading: 0 };
        r.reloadStarted = false;
      }
      const loaded = next.ammo - before.ammo + r.shots;
      if (loaded > 0) {
        const take = Math.min(loaded, spare);
        next = { ...next, ammo: next.ammo - (loaded - take) };
        this.reserve[gun] = spare - take;
        if (this.reserve[gun] <= 0) next = { ...next, reloading: 0 };
      }
      this.guns[gun] = next;
      if (r.shots > 0) {
        this.pendingShots += r.shots;
        this.sinceShot = 0;
      }
      this.events.dryFire ||= r.dryFire;
      this.events.reloadStarted ||= r.reloadStarted;
      this.events.reloadFinished ||= r.reloadFinished;
      this.events.shellLoaded ||= !!r.shellLoaded;
    }

    const wantAim = this.armed && this.rifle.reloading === 0
      && (!!input.aim || !!input.fire || this.sinceShot < PLAYER_TUNING.shoulderAfterShot);
    this.aimBlend += ((wantAim ? 1 : 0) - this.aimBlend) * (1 - Math.exp(-PLAYER_TUNING.aimRaiseRate * dt));
    if (!wantAim && this.aimBlend < 1e-3) this.aimBlend = 0;
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
