import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPhysics } from './physics/world';
import { Game } from './game';
import { PELVIS_HEIGHT } from './figure/skeleton';
import { NPC_MAX_HP, STRIKES } from './combat/strikes';
import type { PlayerInput } from './entities/player';

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

    run(9);
    expect(npc.standing).toBe(true);
    expect(npc.figure.mode).toBe('posed');
    expect(npc.hp).toBe(NPC_MAX_HP);
    expect(npc.figure.pelvisPosition().y).toBeCloseTo(PELVIS_HEIGHT, 1);

    game.dispose();
    physics.dispose();
  }, 30_000);
});
