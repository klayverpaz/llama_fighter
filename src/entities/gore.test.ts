import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPhysics } from '../physics/world';
import { Figure } from '../figure/figure';
import { Game, type GameEvent, type GameInput } from '../game';
import { PELVIS_HEIGHT } from '../figure/skeleton';
import { identityJointRots, yawQuaternion, forwardKinematics } from '../figure/fk';
import { kindStats, type ZombieKind } from '../modes/zombieTypes';

const DT = 1 / 60;
const idle = (): GameInput => ({ move: new THREE.Vector3(), run: false, strikes: [], cameraYaw: 0 });

async function waves() {
  const physics = await createPhysics();
  let s = 9;
  return new Game(physics, new THREE.Scene(), 0, () => ((s = (s * 16807) % 2147483647) / 2147483647), 'waves');
}
function zombie(g: Game, kind: ZombieKind, x: number, z: number, wave = 3) {
  const stats = kindStats(kind, wave);
  const n = g.spawnZombie(new THREE.Vector3(x, PELVIS_HEIGHT, z), Math.atan2(-x, -z), { ...stats, kind });
  n.riseLeft = 0;
  return n;
}
function run(g: Game, seconds: number, input: Partial<GameInput> = {}): GameEvent[] {
  const ev: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    g.step(DT, { ...idle(), ...input });
    ev.push(...g.drainEvents());
    if (g.waves) g.waves.health.hp = 100;
  }
  return ev;
}
function shootAt(g: Game, target: () => THREE.Vector3, seconds: number): GameEvent[] {
  const ev: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const origin = g.player.position.clone().add(new THREE.Vector3(-0.5, 0.75, -1.8));
    g.step(DT, { ...idle(), aim: true, fire: true, aimRay: { origin, dir: target().sub(origin).normalize() } });
    ev.push(...g.drainEvents());
    if (g.waves) g.waves.health.hp = 100;
  }
  return ev;
}

describe('Figure.detach', () => {
  it('cuts a forearm off a standing figure: it falls while the rest keeps its pose, and it grows back on standing up', async () => {
    const physics = await createPhysics();
    const f = new Figure(physics, new THREE.Scene(), { id: 'd', color: 0, position: new THREE.Vector3(0, PELVIS_HEIGHT, 0) });
    const pose = { root: { position: new THREE.Vector3(0, PELVIS_HEIGHT, 0), rotation: yawQuaternion(0) }, joints: identityJointRots() };
    f.applyPose(pose, DT);
    physics.step();
    const joints = physics.world.impulseJoints.len();
    expect(f.detach('lowerArmL', new THREE.Vector3(0, 0, 3))).toBe(true);
    expect(f.detach('lowerArmL')).toBe(false);
    expect(f.detach('torso')).toBe(false);
    expect(physics.world.impulseJoints.len()).toBe(joints - 1);
    for (let i = 0; i < 60; i++) { f.applyPose(pose, DT); physics.step(); }
    expect(f.segmentPosition('lowerArmL').y).toBeLessThan(0.3);
    expect(f.segmentPosition('torso').distanceTo(forwardKinematics(pose).torso.position)).toBeLessThan(1e-3);
    f.toRagdoll();
    f.toPosed();
    expect(physics.world.impulseJoints.len()).toBe(joints);
    expect(f.detachedCount).toBe(0);
  });

  it('a scaled figure is that much bigger', async () => {
    const physics = await createPhysics();
    const f = new Figure(physics, new THREE.Scene(), { id: 'big', color: 0, position: new THREE.Vector3(0, PELVIS_HEIGHT * 4, 0), scale: 4 });
    physics.step();
    expect(f.segmentPosition('head').y).toBeGreaterThan(6.5);
  });
});

describe('dismemberment in play', () => {
  it('enough bullets in an arm take the arm off, and the zombie keeps coming', async () => {
    const g = await waves();
    const z = g.spawnZombie(new THREE.Vector3(0, PELVIS_HEIGHT, 9), Math.PI, { hp: 60, speed: 1.5, damage: 20, kind: 'walker' });
    z.riseLeft = 0;
    z.hp = 2000;
    run(g, 0.1);
    const dir = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < 4; i++) z.takeShot('upperArmR', dir, z.figure.segmentPosition('upperArmR'), { damage: 11, koImpulse: 38, ragdollImpulse: 14 });
    expect(z.figure.isDetached('upperArmR')).toBe(true);
    expect(z.figure.isDetached('lowerArmR')).toBe(true);
    expect(z.standing).toBe(true);
    const ev = run(g, 0.1);
    expect(ev.filter((e) => e.kind === 'dismember')).toHaveLength(1);
    const at = z.position.clone();
    run(g, 1);
    expect(z.position.distanceTo(at)).toBeGreaterThan(0.5);
  });

  it('shooting a leg off drops the zombie, and it counts as a kill', async () => {
    const g = await waves();
    const z = g.spawnZombie(new THREE.Vector3(0, PELVIS_HEIGHT, 9), Math.PI, { hp: 60, speed: 1.5, damage: 20, kind: 'walker' });
    z.riseLeft = 0;
    z.hp = 2000;
    run(g, 0.1);
    for (let i = 0; i < 4; i++) z.takeShot('lowerLegL', new THREE.Vector3(0, 0, 1), z.figure.segmentPosition('lowerLegL'), { damage: 8, koImpulse: 38, ragdollImpulse: 14 });
    expect(z.figure.isDetached('lowerLegL')).toBe(true);
    expect(z.state).toBe('ragdoll');
    run(g, 0.1);
    expect(g.waves!.kills).toBe(1);
  });

  it('a shotgun blast to the head takes it off', async () => {
    const g = await waves();
    const z = zombie(g, 'walker', 0, 4.5, 1);
    g.player.giveGun('shotgun');
    run(g, 0.7);
    shootAt(g, () => z.figure.segmentPosition('head'), 0.2);
    expect(z.state).toBe('ragdoll');
    expect(z.figure.isDetached('head')).toBe(true);
  });

  it('a frozen zombie shatters into pieces', async () => {
    const g = await waves();
    const z = zombie(g, 'walker', 0, 7);
    z.freezeHit('torso', new THREE.Vector3(0, 0, 1), z.figure.segmentPosition('torso'));
    z.freezeHit('torso', new THREE.Vector3(0, 0, 1), z.figure.segmentPosition('torso'));
    expect(z.figure.detachedCount).toBeGreaterThanOrEqual(3);
    const ev = run(g, 0.1);
    expect(ev.filter((e) => e.kind === 'dismember').length).toBe(z.figure.detachedCount);
  });

  it('a rocket into a group blows limbs off', async () => {
    const g = await waves();
    const zs = [zombie(g, 'walker', -0.7, 10), zombie(g, 'walker', 0, 10.4), zombie(g, 'walker', 0.7, 10)];
    g.blastAt(zs[1].figure.segmentPosition('pelvis'));
    expect(zs.reduce((n, z) => n + z.figure.detachedCount, 0)).toBeGreaterThan(0);
  });
});

describe('the giant boss', () => {
  it('is four times as big and claws you from far away', async () => {
    const g = await waves();
    const boss = zombie(g, 'boss', 0, 8, 5);
    expect(boss.scale).toBe(4);
    run(g, 0.2);
    expect(boss.figure.segmentPosition('head').y).toBeGreaterThan(6);
    let hurt = 0;
    let closest = Infinity;
    for (let i = 0; i < Math.round(8 / DT); i++) {
      g.step(DT, idle());
      for (const e of g.drainEvents()) if (e.kind === 'hurt') hurt++;
      g.waves!.health.hp = 100;
      closest = Math.min(closest, Math.hypot(boss.position.x, boss.position.z));
    }
    expect(hurt).toBeGreaterThan(0);
    expect(closest).toBeGreaterThan(2.5);
  });
});
