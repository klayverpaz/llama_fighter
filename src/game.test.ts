import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPhysics } from './physics/world';
import { Game } from './game';
import { PELVIS_HEIGHT } from './figure/skeleton';
import { NPC_MAX_HP, STRIKES } from './combat/strikes';
import type { PlayerInput } from './entities/player';
import { findHits } from './combat/hits';

const DT = 1 / 60;
const idle: PlayerInput = { move: new THREE.Vector3(), run: false, strikes: [], cameraYaw: 0 };

describe('Game', () => {
  it('spawns the requested NPCs around the player', async () => {
    const physics = await createPhysics();
    const game = new Game(physics, new THREE.Scene(), 4);
    expect(game.npcs).toHaveLength(4);
    for (const n of game.npcs) expect(Math.hypot(n.position.x, n.position.z)).toBeGreaterThan(5);
    game.dispose();
    physics.dispose();
  });

  it('front kicks damage once per strike, KO on the third, ignore the downed NPC, then it gets up', async () => {
    const physics = await createPhysics();
    const game = new Game(physics, new THREE.Scene(), 1);
    const npc = game.npcs[0];
    npc.position.set(0, PELVIS_HEIGHT, 0.9);
    npc.yaw = Math.PI;
    const run = (seconds: number, input: PlayerInput = idle) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) game.step(DT, input);
    };

    run(0.5);
    expect(npc.state).toBe('hold');
    expect(game.player.figure.mode).toBe('posed');

    game.step(DT, { ...idle, strikes: ['frontKick'] });
    run(1.0);
    expect(npc.hp).toBe(NPC_MAX_HP - STRIKES.frontKick.damage);
    expect(npc.standing).toBe(true);
    expect(npc.state).toBe('hold');
    expect(Math.hypot(npc.position.x - game.player.position.x, npc.position.z - game.player.position.z)).toBeLessThanOrEqual(1.05);

    game.step(DT, { ...idle, strikes: ['frontKick'] });
    run(1.0);
    expect(npc.hp).toBe(NPC_MAX_HP - 2 * STRIKES.frontKick.damage);

    game.step(DT, { ...idle, strikes: ['frontKick'] });
    run(1.0);
    expect(game.knockouts).toBe(1);
    expect(npc.state).toBe('ragdoll');
    expect(npc.figure.mode).toBe('ragdoll');

    game.step(DT, { ...idle, strikes: ['frontKick'] });
    run(1.0);
    expect(game.knockouts).toBe(1);

    // A kick that lands while the NPC is getting back up does nothing.
    let waited = 0;
    while (npc.state !== 'recovering') {
      expect(waited, 'NPC never started recovering').toBeLessThan(9);
      game.step(DT, idle);
      waited += DT;
    }
    // Put the player in front of the recovering NPC, aimed at it, so the kick really overlaps it.
    const toNpc = new THREE.Vector3(npc.position.x, 0, npc.position.z).sub(new THREE.Vector3(game.player.position.x, 0, game.player.position.z)).normalize();
    game.player.position.set(npc.position.x - toNpc.x * 0.9, PELVIS_HEIGHT, npc.position.z - toNpc.z * 0.9);
    const aim = Math.atan2(toNpc.x, toNpc.z);
    game.player.yaw = aim;
    game.step(DT, { ...idle, strikes: ['frontKick'], cameraYaw: aim });
    let overlapped = false;
    for (let i = 0; i < Math.round(0.5 / DT); i++) {
      game.step(DT, { ...idle, cameraYaw: aim });
      const active = game.player.activeStrike();
      if (active && findHits(physics, active.point, active.strike.hitRadius, 'player').some((h) => h.figureId === npc.id)) overlapped = true;
    }
    expect(overlapped).toBe(true);
    expect(npc.hp).toBe(NPC_MAX_HP);
    expect(game.knockouts).toBe(1);

    run(9);
    expect(npc.standing).toBe(true);
    expect(npc.figure.mode).toBe('posed');
    expect(npc.hp).toBe(NPC_MAX_HP);
    expect(npc.figure.pelvisPosition().y).toBeCloseTo(PELVIS_HEIGHT, 1);

    game.dispose();
    physics.dispose();
  }, 30_000);

  it('twenty NPCs crowd around an idle player without overlapping each other or the player', async () => {
    const physics = await createPhysics();
    const game = new Game(physics, new THREE.Scene(), 20);
    for (let i = 0; i < Math.round(10 / DT); i++) game.step(DT, idle);

    const standing = game.npcs.filter((n) => n.standing);
    expect(standing).toHaveLength(20);
    const ground = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
    let minPair = Infinity;
    let minPlayer = Infinity;
    for (let i = 0; i < standing.length; i++) {
      minPlayer = Math.min(minPlayer, ground(standing[i].position, game.player.position));
      for (let j = i + 1; j < standing.length; j++) minPair = Math.min(minPair, ground(standing[i].position, standing[j].position));
    }
    console.log(`20 NPCs after 10 s: min NPC-NPC ${minPair.toFixed(3)} m, min NPC-player ${minPlayer.toFixed(3)} m`);
    expect(minPair).toBeGreaterThanOrEqual(0.7);
    expect(minPlayer).toBeGreaterThanOrEqual(0.75);

    game.dispose();
    physics.dispose();
  }, 30_000);
});
