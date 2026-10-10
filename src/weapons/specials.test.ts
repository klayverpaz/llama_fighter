import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPhysics } from '../physics/world';
import { Game, type GameEvent, type GameInput } from '../game';
import { PELVIS_HEIGHT } from '../figure/skeleton';
import { COMBAT } from '../combat/strikes';
import { GUN_NAMES, SPECIAL, type GunName } from './guns';

const DT = 1 / 60;
const idle = (): GameInput => ({ move: new THREE.Vector3(), run: false, strikes: [], cameraYaw: 0 });

async function armed(gun: GunName, npcSpots: Array<[number, number]>) {
  const physics = await createPhysics();
  let seed = 7;
  const game = new Game(physics, new THREE.Scene(), npcSpots.length, () => ((seed = (seed * 16807) % 2147483647) / 2147483647));
  npcSpots.forEach(([x, z], i) => {
    game.npcs[i].position.set(x, PELVIS_HEIGHT, z);
    game.npcs[i].yaw = Math.PI;
  });
  game.step(DT, { ...idle(), weapon: gun });
  for (let i = 0; i < 40; i++) game.step(DT, idle());
  return game;
}

function rayAt(game: Game, target: THREE.Vector3) {
  const origin = game.player.position.clone().add(new THREE.Vector3(-0.5, 0.75, -1.8));
  return { origin, dir: target.clone().sub(origin).normalize() };
}

/** Hold aim on `target()` for `seconds`, pulling the trigger on the first tick only (or every tick). */
function shoot(game: Game, target: () => THREE.Vector3, seconds: number, hold = false): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    game.step(DT, { ...idle(), aim: true, fire: hold || i === 3, aimRay: rayAt(game, target()) });
    events.push(...game.drainEvents());
  }
  return events;
}

const torso = (game: Game, i: number) => () => game.npcs[i].figure.segmentPosition('torso');

describe('special weapons', () => {
  it('every gun can be selected and drawn; with empty hands only the last gun hangs on the back', async () => {
    const game = await armed('rifle', []);
    for (const gun of GUN_NAMES) {
      game.step(DT, { ...idle(), weapon: gun });
      for (let i = 0; i < 50; i++) game.step(DT, idle());
      expect(game.player.heldGun).toBe(gun);
      expect(game.player.armed).toBe(true);
    }
    game.step(DT, { ...idle(), weapon: 'fists' });
    for (let i = 0; i < 30; i++) game.step(DT, idle());
    const visible = GUN_NAMES.filter((g) => (g === 'rifle' ? game.ak.group : g === 'shotgun' ? game.shotgun.group : game.specials[g].group).visible);
    expect(visible).toEqual(['llamaCannon']);
  });

  it('bazooka: the rocket flies, explodes, and drops a whole group at once', async () => {
    const game = await armed('rpg', [[-0.9, 9], [0, 9], [0.9, 9]]);
    const events = shoot(game, torso(game, 1), 1.0);
    expect(events.some((e) => e.kind === 'smoke')).toBe(true);
    const blast = events.find((e) => e.kind === 'explosion');
    expect(blast && blast.kind === 'explosion' && blast.knockouts).toBeGreaterThanOrEqual(3);
    expect(game.npcs.every((n) => n.state === 'ragdoll')).toBe(true);
    let highest = 0;
    for (let i = 0; i < 40; i++) {
      game.step(DT, idle());
      for (const n of game.npcs) highest = Math.max(highest, n.figure.pelvisPosition().y);
    }
    expect(highest).toBeGreaterThan(1.3);
    expect(game.player.rifle.ammo).toBe(0);
  });

  it('freeze ray: freezes solid in place, then the next hit shatters it', async () => {
    const game = await armed('freeze', [[0, 7]]);
    const npc = game.npcs[0];
    shoot(game, torso(game, 0), 0.2);
    expect(npc.state).toBe('frozen');
    const where = npc.figure.pelvisPosition();
    for (let i = 0; i < 60; i++) game.step(DT, idle());
    expect(npc.figure.pelvisPosition().distanceTo(where)).toBeLessThan(1e-3);
    const events = shoot(game, torso(game, 0), 0.2);
    expect(npc.state).toBe('ragdoll');
    expect(events.some((e) => e.kind === 'shatter')).toBe(true);
    expect(game.knockouts).toBe(1);
  });

  it('freeze ray: a frozen NPC also shatters from a punch', async () => {
    const game = await armed('freeze', [[0, 1.0]]);
    const npc = game.npcs[0];
    shoot(game, torso(game, 0), 0.2);
    expect(npc.state).toBe('frozen');
    game.step(DT, { ...idle(), weapon: 'fists' });
    for (let i = 0; i < 30; i++) game.step(DT, idle());
    game.step(DT, { ...idle(), strikes: ['cross'] });
    for (let i = 0; i < 30; i++) game.step(DT, idle());
    expect(npc.state).toBe('ragdoll');
    expect(game.knockouts).toBe(1);
  });

  it('frozen NPCs thaw after a few seconds and come back', async () => {
    const game = await armed('freeze', [[0, 7]]);
    shoot(game, torso(game, 0), 0.2);
    for (let i = 0; i < Math.round((SPECIAL.freezeSeconds + 0.3) / DT); i++) game.step(DT, idle());
    expect(game.npcs[0].state).not.toBe('frozen');
    expect(game.npcs[0].standing).toBe(true);
  });

  it('tesla: one shot chains through a line of NPCs', async () => {
    const game = await armed('tesla', [[0, 6], [1.5, 8.5], [3, 11]]);
    const events = shoot(game, torso(game, 0), 0.2);
    const bolt = events.find((e) => e.kind === 'lightning');
    expect(bolt && bolt.kind === 'lightning' && bolt.points.length).toBe(4);
    for (const n of game.npcs) expect(n.hp).toBe(COMBAT.npcMaxHp - SPECIAL.teslaDamage);
  });

  it('anti-gravity: the NPC floats up into the sky, then falls back down', async () => {
    const game = await armed('antigrav', [[0, 7]]);
    const npc = game.npcs[0];
    shoot(game, torso(game, 0), 0.2);
    expect(npc.state).toBe('ragdoll');
    expect(game.knockouts).toBe(1);
    let peak = 0;
    for (let i = 0; i < Math.round(SPECIAL.floatSeconds / DT); i++) {
      game.step(DT, idle());
      peak = Math.max(peak, npc.figure.pelvisPosition().y);
    }
    expect(peak).toBeGreaterThan(4);
    for (let i = 0; i < 240; i++) game.step(DT, idle());
    expect(npc.figure.pelvisPosition().y).toBeLessThan(1.5);
  });

  it('llama cannon: a lobbed llama knocks an NPC out and stays bouncing around as a prop', async () => {
    const game = await armed('llamaCannon', [[0, 7]]);
    const npc = game.npcs[0];
    const events = shoot(game, torso(game, 0), 1.2);
    const bonk = events.find((e) => e.kind === 'llamaBonk');
    expect(bonk && bonk.kind === 'llamaBonk' && bonk.hitNpc).toBe(true);
    expect(npc.state).toBe('ragdoll');
    expect(game.llamaProps).toHaveLength(1);
    for (let i = 0; i < Math.round((SPECIAL.llamaPropSeconds + 0.2) / DT); i++) game.step(DT, idle());
    expect(game.llamaProps).toHaveLength(0);
  });
});
