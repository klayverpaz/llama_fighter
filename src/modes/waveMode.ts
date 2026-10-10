import * as THREE from 'three';
import type { Npc, ZombieConfig } from '../entities/npc';
import type { Player } from '../entities/player';
import { PELVIS_HEIGHT } from '../figure/skeleton';
import { GUN_NAMES, RESERVE, GUNS, type GunName } from '../weapons/guns';
import { createAkModel } from '../weapons/akModel';
import { createShotgunModel } from '../weapons/shotgunModel';
import {
  createAntigravModel, createFreezeModel, createLlamaCannonModel, createRpgModel, createTeslaModel,
} from '../weapons/specialModels';
import {
  WaveDirector, PlayerHealth, POINTS, POWERUPS, boxCost, rollPowerUp, type PowerUpKind,
} from './waves';
import { createMysteryBox, createPowerUpMesh } from './waveModels';
import { pushOut, type Obstacle } from '../world/obstacles';
import { ZOMBIES, ZOMBIE_KINDS, isBossWave, kindStats, newKinds, pickZombieKind, type ZombieKind } from './zombieTypes';
import { TUNING } from '../tuning/tuning';

/** What the wave mode needs from the game (kept narrow so it can be tested through Game). */
export interface WaveHost {
  readonly scene: THREE.Scene;
  readonly player: Player;
  readonly npcs: Npc[];
  readonly random: () => number;
  readonly obstacles: Obstacle[];
  spawnZombie(position: THREE.Vector3, yaw: number, config: ZombieConfig): Npc;
  removeNpc(npc: Npc): void;
  /** Explosion at a point: knocks zombies down and throws bodies (the player is handled by the wave mode). */
  blastAt(point: THREE.Vector3): void;
  emit(event: WaveEvent): void;
}

export type WaveEvent =
  | { kind: 'waveStart'; wave: number; zombies: number }
  | { kind: 'waveCleared'; wave: number }
  | { kind: 'hurt'; amount: number; hp: number }
  | { kind: 'death'; wave: number; kills: number; points: number; reason: 'zombies' | 'void' }
  | { kind: 'zombieSpawn'; point: THREE.Vector3; zombie: ZombieKind }
  | { kind: 'newZombies'; names: string[] }
  | { kind: 'bossIncoming' }
  | { kind: 'zombieKilled'; point: THREE.Vector3 }
  | { kind: 'corpseGone'; point: THREE.Vector3 }
  | { kind: 'powerUpDrop'; power: PowerUpKind; point: THREE.Vector3 }
  | { kind: 'powerUp'; power: PowerUpKind }
  | { kind: 'boxOpen' }
  | { kind: 'boxResult'; gun: GunName };

/** Spawn ring, box use radius/roll time and starting points come from tuning.json. */
export const ARENA = Object.assign(TUNING.arena, {
  boxPosition: new THREE.Vector3(0, 0, -7),
});

interface DroppedPowerUp {
  kind: PowerUpKind;
  position: THREE.Vector3;
  age: number;
  group: THREE.Group;
  icon: THREE.Group;
}

interface Snapshot { hp: number; down: boolean }

export class WaveMode {
  readonly director = new WaveDirector();
  readonly health = new PlayerHealth();
  points = ARENA.startPoints;
  kills = 0;
  instaKillLeft = 0;
  over = false;
  /** The player stands next to the Mystery Box (show the prompt). */
  nearBox = false;
  readonly powerUps: DroppedPowerUp[] = [];
  private readonly snapshots = new Map<Npc, Snapshot>();
  private readonly box = createMysteryBox();
  private readonly showcase: Record<GunName, THREE.Group>;
  private rolling = 0;
  private rollResult: GunName | null = null;
  private showcaseTimer = 0;
  private shown: GunName | null = null;
  private bossPending = false;
  /** The boss of this wave while it's alive (HUD health bar). */
  boss: Npc | null = null;

  constructor(private readonly host: WaveHost) {
    host.player.limitArsenal();
    this.box.group.position.copy(ARENA.boxPosition);
    host.scene.add(this.box.group);
    this.showcase = {
      rifle: createAkModel().group,
      shotgun: createShotgunModel().group,
      rpg: createRpgModel().group,
      freeze: createFreezeModel().group,
      tesla: createTeslaModel().group,
      antigrav: createAntigravModel().group,
      llamaCannon: createLlamaCannonModel().group,
    };
    for (const g of Object.values(this.showcase)) {
      g.visible = false;
      g.scale.setScalar(1.3);
      g.position.copy(ARENA.boxPosition).add(new THREE.Vector3(0, 1.1, 0));
      host.scene.add(g);
    }
  }

  get wave(): number {
    return this.director.wave;
  }

  /** What the Mystery Box costs right now (grows every wave). */
  get boxCost(): number {
    return boxCost(this.wave);
  }

  /** Zombies of this wave still to kill (alive or waiting to spawn). */
  get remaining(): number {
    return this.director.remaining(this.aliveCount());
  }

  get boxRolling(): boolean {
    return this.rolling > 0;
  }

  private aliveCount(): number {
    return this.host.npcs.filter((n) => n.state !== 'ragdoll').length;
  }

  /** One fixed tick, after the game has moved everything. `damage` is the zombie claws that landed this tick. */
  update(dt: number, input: { use: boolean; damage: number }): void {
    if (this.over) return;
    const { player } = this.host;

    this.health.update(dt);
    if (input.damage > 0) {
      // Several claws can land on the same tick; never more than one big hit's worth at once.
      const taken = this.health.damage(Math.min(ZOMBIES.maxHit, input.damage));
      if (taken > 0) this.host.emit({ kind: 'hurt', amount: taken, hp: this.health.hp });
      if (this.health.dead) {
        const torso = player.figure.segmentPosition('torso');
        player.figure.toRagdoll({ segment: 'torso', impulse: new THREE.Vector3(0, 8, 0), point: torso });
        this.die('zombies');
        return;
      }
    }

    this.scoreHitsAndKills();
    this.removeCorpses();
    this.runDirector(dt);
    this.updatePowerUps(dt);
    this.updateBox(dt, input.use);
    if (this.instaKillLeft > 0) this.instaKillLeft = Math.max(0, this.instaKillLeft - dt);
  }

  /** Fell off the island into the void. */
  voidDeath(): void {
    if (this.over) return;
    this.health.hp = 0;
    this.die('void');
  }

  private die(reason: 'zombies' | 'void'): void {
    this.over = true;
    this.host.emit({ kind: 'death', wave: this.wave, kills: this.kills, points: this.points, reason });
  }

  /** Points for every hit, more for kills; insta-kill finishes anything that got hurt; maybe drop a power-up. */
  private scoreHitsAndKills(): void {
    const from = this.host.player.position;
    for (const npc of this.host.npcs) {
      const prev = this.snapshots.get(npc) ?? { hp: npc.hp, down: npc.state === 'ragdoll' };
      if (!prev.down && npc.hp < prev.hp) {
        this.points += POINTS.hit;
        if (this.instaKillLeft > 0 && npc.state !== 'ragdoll') npc.kill(npc.position.clone().sub(from).setY(0.3));
      }
      const down = npc.state === 'ragdoll';
      if (!prev.down && down) {
        this.points += POINTS.kill;
        this.kills++;
        this.director.onKill();
        const at = npc.figure.pelvisPosition();
        this.host.emit({ kind: 'zombieKilled', point: at });
        if (npc === this.boss) this.boss = null;
        const power = rollPowerUp(this.host.random);
        if (power) this.dropPowerUp(power, at.setY(0));
      }
      this.snapshots.set(npc, { hp: npc.hp, down });
    }
  }

  private removeCorpses(): void {
    for (const npc of [...this.host.npcs]) {
      if (!npc.dead) continue;
      this.host.emit({ kind: 'corpseGone', point: npc.figure.pelvisPosition() });
      this.snapshots.delete(npc);
      this.host.removeNpc(npc);
    }
  }

  private runDirector(dt: number): void {
    const t = this.director.update(dt, this.aliveCount());
    if (t.started) {
      // A little ammo between waves, like finding a few rounds on the floor.
      const player = this.host.player;
      for (const g of GUN_NAMES) {
        if (player.owned.has(g)) player.reserve[g] = Math.min(RESERVE[g], player.reserve[g] + GUNS[g].magSize);
      }
      this.host.emit({ kind: 'waveStart', wave: t.started, zombies: this.director.pending });
      const fresh = newKinds(t.started).filter((k) => k !== 'walker').map((k) => ZOMBIE_KINDS[k].plural);
      if (fresh.length) this.host.emit({ kind: 'newZombies', names: fresh });
      this.bossPending = isBossWave(t.started);
      if (this.bossPending) this.host.emit({ kind: 'bossIncoming' });
    }
    if (t.cleared) this.host.emit({ kind: 'waveCleared', wave: t.cleared });
    for (let i = 0; i < t.spawn; i++) this.spawnOne();
  }

  private spawnOne(): void {
    const { player, random } = this.host;
    let angle = random() * Math.PI * 2;
    const r = ARENA.spawnMin + random() * (ARENA.spawnMax - ARENA.spawnMin);
    let pos = new THREE.Vector3(Math.sin(angle) * r, PELVIS_HEIGHT, Math.cos(angle) * r);
    if (Math.hypot(pos.x - player.position.x, pos.z - player.position.z) < ARENA.spawnAwayFromPlayer) {
      angle += Math.PI;
      pos = new THREE.Vector3(Math.sin(angle) * r, PELVIS_HEIGHT, Math.cos(angle) * r);
    }
    // Don't climb out of the ground inside a pillar or a rock.
    const free = pushOut(this.host.obstacles, pos.x, pos.z, 0.6, 0);
    pos.x = free.x;
    pos.z = free.z;
    const yaw = Math.atan2(player.position.x - pos.x, player.position.z - pos.z);
    const kind: ZombieKind = this.bossPending ? 'boss' : pickZombieKind(this.wave, random);
    const npc = this.host.spawnZombie(pos, yaw, { ...kindStats(kind, this.wave), kind });
    if (kind === 'boss') {
      this.bossPending = false;
      this.boss = npc;
    }
    this.snapshots.set(npc, { hp: npc.hp, down: false });
    this.host.emit({ kind: 'zombieSpawn', point: pos.clone().setY(0), zombie: kind });
  }

  private dropPowerUp(kind: PowerUpKind, at: THREE.Vector3): void {
    const { group, icon } = createPowerUpMesh(kind);
    group.position.copy(at);
    this.host.scene.add(group);
    this.powerUps.push({ kind, position: at.clone(), age: 0, group, icon });
    this.host.emit({ kind: 'powerUpDrop', power: kind, point: at.clone() });
  }

  private updatePowerUps(dt: number): void {
    const player = this.host.player.position;
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      p.age += dt;
      p.icon.rotation.y += dt * 2;
      p.icon.position.y = 1.0 + Math.sin(p.age * 3) * 0.12;
      // Blink during the last five seconds.
      const left = POWERUPS.lifetime - p.age;
      p.group.visible = left > 5 || Math.floor(left * 6) % 2 === 0;
      const reached = Math.hypot(player.x - p.position.x, player.z - p.position.z) < POWERUPS.pickupRadius;
      if (reached) this.collect(p.kind);
      if (reached || left <= 0) {
        p.group.removeFromParent();
        this.powerUps.splice(i, 1);
      }
    }
  }

  private collect(kind: PowerUpKind): void {
    const player = this.host.player;
    if (kind === 'maxAmmo') player.refillAmmo();
    else if (kind === 'instaKill') this.instaKillLeft = POWERUPS.instaKillSeconds;
    else {
      this.points += POINTS.nuke;
      for (const npc of this.host.npcs) npc.kill(npc.position.clone().sub(player.position).setY(0.6));
    }
    this.host.emit({ kind: 'powerUp', power: kind });
  }

  private updateBox(dt: number, use: boolean): void {
    const player = this.host.player;
    this.nearBox = Math.hypot(player.position.x - ARENA.boxPosition.x, player.position.z - ARENA.boxPosition.z) < ARENA.boxUseRadius;
    this.box.beam.rotation.y += dt * 0.5;

    if (this.rolling > 0) {
      this.rolling -= dt;
      this.box.lid.rotation.x = -1.3;
      // Cycle through the guns, slowing down, then land on the prize.
      this.showcaseTimer -= dt;
      if (this.showcaseTimer <= 0) {
        const pool = GUN_NAMES;
        this.show(pool[Math.floor(this.host.random() * pool.length)]);
        this.showcaseTimer = 0.07 + 0.25 * (1 - Math.max(0, this.rolling) / ARENA.boxRollSeconds);
      }
      if (this.rolling <= 0) {
        const gun = this.rollResult!;
        this.show(gun);
        player.giveGun(gun);
        this.host.emit({ kind: 'boxResult', gun });
        this.showcaseTimer = 1.2;
      }
    } else if (this.shown) {
      this.showcaseTimer -= dt;
      if (this.showcaseTimer <= 0) {
        this.show(null);
        this.box.lid.rotation.x = 0;
      }
    }
    if (this.shown) {
      const g = this.showcase[this.shown];
      g.rotation.y += dt * 3;
      g.position.y = ARENA.boxPosition.y + 1.0 + (this.rolling > 0 ? (1 - this.rolling / ARENA.boxRollSeconds) * 0.4 : 0.4);
    }

    if (use && this.nearBox && this.rolling <= 0 && !this.shown && this.points >= this.boxCost) {
      this.points -= this.boxCost;
      this.rolling = ARENA.boxRollSeconds;
      this.showcaseTimer = 0;
      // Prefer a gun the player doesn't have yet.
      const fresh = GUN_NAMES.filter((g) => !player.owned.has(g));
      const pool = fresh.length > 0 ? fresh : GUN_NAMES.filter((g) => g !== player.weapon);
      this.rollResult = pool[Math.floor(this.host.random() * pool.length)];
      this.host.emit({ kind: 'boxOpen' });
    }
  }

  private show(gun: GunName | null): void {
    for (const [name, g] of Object.entries(this.showcase)) g.visible = name === gun;
    this.shown = gun;
  }

  dispose(): void {
    this.box.group.removeFromParent();
    for (const g of Object.values(this.showcase)) g.removeFromParent();
    for (const p of this.powerUps) p.group.removeFromParent();
    this.powerUps.length = 0;
  }
}
