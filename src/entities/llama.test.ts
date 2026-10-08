import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPhysics } from '../physics/world';
import { Game, type GameInput } from '../game';
import { PELVIS_HEIGHT } from '../figure/skeleton';
import { LLAMA } from './llama';
import { NPC_TUNING } from './npcBrain';

const DT = 1 / 60;
const idle = (): GameInput => ({ move: new THREE.Vector3(), run: false, strikes: [], cameraYaw: 0 });
const run = (game: Game, seconds: number, input: Partial<GameInput> = {}) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.step(DT, { ...idle(), ...input });
};

async function mountedGame(npcs = 0) {
  const physics = await createPhysics();
  const game = new Game(physics, new THREE.Scene(), npcs, () => 0.5);
  game.step(DT, { ...idle(), mount: true });
  run(game, 0.5);
  return game;
}

describe('llama', () => {
  it('mounting puts the rider on the saddle with the rifle drawn', async () => {
    const game = await mountedGame();
    const p = game.player;
    expect(p.mounted).toBe(true);
    expect(p.weapon).toBe('rifle');
    expect(p.armed).toBe(true);
    expect(game.llama.visible).toBe(true);
    expect(p.figure.pelvisPosition().y).toBeGreaterThan(LLAMA.saddlePelvisY - 0.05);
    // Feet hang beside the llama, clear of the ground.
    expect(p.figure.limbPoint('footL').y).toBeGreaterThan(0.25);
  });

  it('only guns while mounted: strikes and empty hands are refused, Q cycles the guns and skips the fists', async () => {
    const game = await mountedGame();
    game.step(DT, { ...idle(), strikes: ['jab'] });
    expect(game.player.attack.phase).toBe('idle');
    game.step(DT, { ...idle(), weapon: 'fists' });
    run(game, 0.5);
    expect(game.player.weapon).toBe('rifle');
    game.step(DT, { ...idle(), weapon: 'toggle' });
    expect(game.player.weapon).toBe('shotgun');
    for (let i = 0; i < 6; i++) game.step(DT, { ...idle(), weapon: 'toggle' });
    expect(game.player.weapon).toBe('rifle');
    game.step(DT, { ...idle(), weapon: 'prev' });
    expect(game.player.weapon).toBe('llamaCannon');
  });

  it('the llama runs faster than the stick man', async () => {
    const game = await mountedGame();
    const start = game.player.position.clone();
    run(game, 1, { move: new THREE.Vector3(0, 0, 1), run: true });
    expect(game.player.position.distanceTo(start)).toBeGreaterThan(6.5);
  });

  it('shoots from the saddle without the bullets or the crosshair hitting the llama', async () => {
    const physics = await createPhysics();
    const game = new Game(physics, new THREE.Scene(), 1, () => 0.5);
    const npc = game.npcs[0];
    npc.position.set(0, PELVIS_HEIGHT, 8);
    game.step(DT, { ...idle(), mount: true });
    run(game, 0.5);
    for (let i = 0; i < 120 && npc.state !== 'ragdoll'; i++) {
      // Camera behind and above the rider: its ray passes over/through the llama.
      const origin = game.player.position.clone().add(new THREE.Vector3(-0.6, 1.1, -2.2));
      const dir = npc.figure.readTransforms().torso.position.sub(origin).normalize();
      game.step(DT, { ...idle(), aim: true, fire: true, aimRay: { origin, dir } });
    }
    expect(npc.state).toBe('ragdoll');
    expect(game.knockouts).toBe(1);
  });

  it('NPCs stop farther away from a mounted player', async () => {
    const physics = await createPhysics();
    const game = new Game(physics, new THREE.Scene(), 4, () => 0.5);
    game.step(DT, { ...idle(), mount: true });
    run(game, 8);
    for (const n of game.npcs) {
      const d = Math.hypot(n.position.x - game.player.position.x, n.position.z - game.player.position.z);
      expect(d).toBeGreaterThan(NPC_TUNING.minPlayerDistance + LLAMA.npcMargin - 0.05);
    }
  });

  it('getting off leaves the llama parked and the rider on foot beside it', async () => {
    const game = await mountedGame();
    const llamaSpot = game.player.position.clone();
    game.step(DT, { ...idle(), mount: true });
    run(game, 0.5);
    const p = game.player;
    expect(p.mounted).toBe(false);
    expect(game.llama.visible).toBe(true);
    expect(game.llama.group.position.distanceTo(new THREE.Vector3(llamaSpot.x, 0, llamaSpot.z))).toBeLessThan(0.01);
    expect(p.position.distanceTo(llamaSpot)).toBeGreaterThan(0.7);
    expect(p.figure.pelvisPosition().y).toBeCloseTo(PELVIS_HEIGHT, 1);
    // Back on foot the fists work again once the rifle is put away.
    game.step(DT, { ...idle(), weapon: 'fists' });
    run(game, 0.5);
    game.step(DT, { ...idle(), strikes: ['jab'] });
    expect(p.attack.phase).not.toBe('idle');
  });
});
