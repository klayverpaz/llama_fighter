import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPhysics } from '../physics/world';
import { Game, coneSample, type GameEvent, type GameInput } from '../game';
import { PELVIS_HEIGHT } from '../figure/skeleton';
import { NPC_MAX_HP } from '../combat/strikes';
import { damageForSegment } from './rifle';

const DT = 1 / 60;
const idle = (): GameInput => ({ move: new THREE.Vector3(), run: false, strikes: [], cameraYaw: 0 });

async function setup() {
  const physics = await createPhysics();
  const game = new Game(physics, new THREE.Scene(), 1, () => 0.5);
  const npc = game.npcs[0];
  npc.position.set(0, PELVIS_HEIGHT, 7);
  npc.yaw = Math.PI;
  game.step(DT, { ...idle(), weapon: 'rifle' });
  for (let i = 0; i < 30; i++) game.step(DT, idle());
  return { physics, game, npc };
}

/** Over-the-shoulder camera ray at a segment of the NPC. */
function rayAt(game: Game, target: THREE.Vector3) {
  const origin = game.player.position.clone().add(new THREE.Vector3(-0.5, 0.75, -1.8));
  return { origin, dir: target.clone().sub(origin).normalize() };
}

function fire(game: Game, seconds: number, aimAt: () => THREE.Vector3): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    game.step(DT, { ...idle(), aim: true, fire: true, aimRay: rayAt(game, aimAt()) });
    events.push(...game.drainEvents());
  }
  return events;
}

const shots = (events: GameEvent[]) => events.filter((e): e is Extract<GameEvent, { kind: 'shot' }> => e.kind === 'shot');

describe('shooting', () => {
  it('takes the rifle off the back into both hands', async () => {
    const { game } = await setup();
    expect(game.player.weapon).toBe('rifle');
    expect(game.player.armed).toBe(true);
    expect(game.ak.group.visible).toBe(true);
    const muzzle = game.player.muzzle()!;
    expect(muzzle.distanceTo(game.player.position)).toBeLessThan(1.2);
  });

  it('three torso shots drop a standing NPC into a ragdoll', async () => {
    const { game, npc } = await setup();
    const hits: number[] = [];
    const events: GameEvent[] = [];
    for (let i = 0; i < 90 && npc.state !== 'ragdoll'; i++) {
      game.step(DT, { ...idle(), aim: true, fire: true, aimRay: rayAt(game, npc.figure.readTransforms().torso.position) });
      for (const e of game.drainEvents()) {
        events.push(e);
        if (e.kind === 'shot' && e.target === 'npc') hits.push(npc.hp);
      }
    }
    expect(npc.state).toBe('ragdoll');
    expect(npc.figure.mode).toBe('ragdoll');
    expect(game.knockouts).toBe(1);
    expect(hits.slice(0, 2)).toEqual([NPC_MAX_HP - damageForSegment('torso'), NPC_MAX_HP - 2 * damageForSegment('torso')]);
    expect(shots(events).at(-1)!.result).toBe('killed');
  });

  it('a headshot drops the NPC with the first bullet that connects', async () => {
    const { game, npc } = await setup();
    const events = fire(game, 0.6, () => npc.figure.readTransforms().head.position);
    const first = shots(events).find((e) => e.target === 'npc')!;
    expect(first.headshot).toBe(true);
    expect(first.result).toBe('killed');
    expect(game.knockouts).toBe(1);
  });

  it('bullets keep pushing a body that is already down and keep it down', async () => {
    const { game, npc } = await setup();
    fire(game, 0.4, () => npc.figure.readTransforms().head.position);
    expect(npc.state).toBe('ragdoll');
    const pelvisBefore = npc.figure.pelvisPosition();
    const events = fire(game, 2.0, () => npc.figure.readTransforms().torso.position);
    expect(shots(events).some((e) => e.result === 'body')).toBe(true);
    expect(npc.figure.pelvisPosition().distanceTo(pelvisBefore)).toBeGreaterThan(0.05);
    expect(game.knockouts).toBe(1);
  });

  it('never hits the shooter, even with the camera ray passing through the player', async () => {
    const { game, npc } = await setup();
    const events = fire(game, 0.3, () => npc.figure.readTransforms().torso.position);
    for (const e of shots(events)) expect(e.to.distanceTo(game.player.position)).toBeGreaterThan(0.6);
  });

  it('ignores melee keys while holding the rifle; Q cycles through every gun back to the fists', async () => {
    const { game } = await setup();
    game.step(DT, { ...idle(), strikes: ['jab'] });
    expect(game.player.attack.phase).toBe('idle');
    game.step(DT, { ...idle(), weapon: 'toggle' });
    expect(game.player.weapon).toBe('shotgun');
    for (let i = 0; i < 50; i++) game.step(DT, idle());
    expect(game.player.heldGun).toBe('shotgun');
    expect(game.player.armed).toBe(true);
    for (let i = 0; i < 6; i++) game.step(DT, { ...idle(), weapon: 'toggle' });
    for (let i = 0; i < 30; i++) game.step(DT, idle());
    expect(game.player.weapon).toBe('fists');
    expect(game.player.swap).toBe(0);
    game.step(DT, { ...idle(), strikes: ['jab'] });
    expect(game.player.attack.phase).not.toBe('idle');
  });
});

describe('coneSample', () => {
  it('stays within the spread angle', () => {
    const axis = new THREE.Vector3(0.3, -0.2, 1).normalize();
    for (const [u, v] of [[0, 0], [1, 0.25], [0.5, 0.9], [1, 1]]) {
      expect(coneSample(axis, 0.05, u, v).angleTo(axis)).toBeLessThanOrEqual(0.05 + 1e-9);
    }
  });
});

describe('shotgun in play', () => {
  async function shotgunSetup(distance: number) {
    const physics = await createPhysics();
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const game = new Game(physics, new THREE.Scene(), 1, rng);
    const npc = game.npcs[0];
    npc.position.set(0, PELVIS_HEIGHT, distance);
    npc.yaw = Math.PI;
    game.step(DT, { ...idle(), weapon: 'shotgun' });
    for (let i = 0; i < 40; i++) game.step(DT, idle());
    return { game, npc };
  }

  it('draws the shotgun into the hands and fires nine pellets per trigger pull', async () => {
    const { game, npc } = await shotgunSetup(12);
    expect(game.player.heldGun).toBe('shotgun');
    expect(game.shotgun.group.visible).toBe(true);
    expect(game.ak.group.visible).toBe(false);
    game.step(DT, { ...idle(), aim: true, fire: true, aimRay: rayAt(game, npc.figure.readTransforms().torso.position) });
    const pellets = shots(game.drainEvents());
    expect(pellets).toHaveLength(9);
    expect(pellets.every((e) => e.gun === 'shotgun')).toBe(true);
    expect(game.player.rifle.ammo).toBe(7);
  });

  it('one point-blank blast to the chest drops the NPC and throws the body hard', async () => {
    const { game, npc } = await shotgunSetup(2.2);
    for (let i = 0; i < 3; i++) game.step(DT, { ...idle(), aim: true, aimRay: rayAt(game, npc.figure.readTransforms().torso.position) });
    const torsoBefore = npc.figure.readTransforms().torso.position;
    game.step(DT, { ...idle(), aim: true, fire: true, aimRay: rayAt(game, npc.figure.readTransforms().torso.position) });
    expect(npc.state).toBe('ragdoll');
    expect(game.knockouts).toBe(1);
    game.step(DT, idle());
    expect(npc.figure.maxSpeed()).toBeGreaterThan(3);
    // The chest is thrown away from the shooter.
    for (let i = 0; i < 25; i++) game.step(DT, idle());
    const away = npc.figure.readTransforms().torso.position.sub(torsoBefore);
    expect(away.z).toBeGreaterThan(0.25);
  });

  it('works the pump after each shot and reloads shell by shell', async () => {
    const { game, npc } = await shotgunSetup(15);
    const events: GameEvent[] = [];
    for (let i = 0; i < 60; i++) {
      game.step(DT, { ...idle(), aim: true, fire: i === 0, aimRay: rayAt(game, npc.figure.readTransforms().torso.position) });
      events.push(...game.drainEvents());
    }
    expect(events.filter((e) => e.kind === 'pump')).toHaveLength(1);
    game.step(DT, { ...idle(), reload: true });
    for (let i = 0; i < 40; i++) {
      game.step(DT, idle());
      events.push(...game.drainEvents());
    }
    expect(events.some((e) => e.kind === 'shellLoaded')).toBe(true);
    expect(game.player.rifle.ammo).toBe(8);
  });
});
