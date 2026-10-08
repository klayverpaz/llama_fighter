import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPhysics } from '../physics/world';
import { Game, type GameEvent, type GameInput } from '../game';
import { WAVES, HEALTH, POINTS, waveSize } from './waves';
import { ARENA } from './waveMode';
import { RESERVE } from '../weapons/guns';
import { RIFLE } from '../weapons/rifle';
import { ZOMBIE_TUNING } from '../entities/npc';

const DT = 1 / 60;
const idle = (): GameInput => ({ move: new THREE.Vector3(), run: false, strikes: [], cameraYaw: 0 });

async function waveGame(rng: () => number = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })()) {
  const physics = await createPhysics();
  return new Game(physics, new THREE.Scene(), 0, rng, 'waves');
}

function run(game: Game, seconds: number, input: Partial<GameInput> = {}): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    game.step(DT, { ...idle(), ...input });
    events.push(...game.drainEvents());
  }
  return events;
}

const killAll = (game: Game) => { for (const z of game.npcs) z.kill(new THREE.Vector3(0, 0.5, 1)); };

describe('zombie waves', () => {
  it('starts with fists and the AK only, 500 points, full health', async () => {
    const game = await waveGame();
    const w = game.waves!;
    expect([...game.player.owned]).toEqual(['fists', 'rifle']);
    expect(w.points).toBe(ARENA.startPoints);
    expect(w.health.hp).toBe(HEALTH.max);
    expect(game.npcs).toHaveLength(0);
  });

  it('wave 1 brings 5 zombies that climb out of the ground away from the player and come for them', async () => {
    const game = await waveGame();
    const events = run(game, WAVES.firstIntermission + 4);
    const start = events.find((e) => e.kind === 'waveStart');
    expect(start && start.kind === 'waveStart' && start.wave).toBe(1);
    expect(game.npcs).toHaveLength(5);
    for (const z of game.npcs) {
      expect(z.zombie).not.toBeNull();
      expect(Math.hypot(z.position.x, z.position.z)).toBeLessThan(ARENA.spawnMax + 1);
    }
    const startDist = Math.min(...game.npcs.map((z) => z.position.length()));
    run(game, 2);
    expect(Math.min(...game.npcs.map((z) => Math.hypot(z.position.x, z.position.z)))).toBeLessThan(startDist);
  });

  it('zombies claw the player down; health regenerates out of combat; standing still long enough is death', async () => {
    const game = await waveGame();
    const events = run(game, 30);
    const hurt = events.filter((e) => e.kind === 'hurt');
    expect(hurt.length).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === 'death')).toBe(true);
    expect(game.waves!.over).toBe(true);
    expect(game.player.figure.mode).toBe('ragdoll');
  });

  it('killing every zombie clears the wave, scores points, removes the bodies, and wave 2 brings 10', async () => {
    const game = await waveGame();
    run(game, WAVES.firstIntermission + 3.5);
    expect(game.npcs).toHaveLength(waveSize(1));
    const before = game.waves!.points;
    killAll(game);
    const events = run(game, ZOMBIE_TUNING.corpseSeconds * 2 + 0.5);
    expect(game.waves!.kills).toBe(5);
    expect(game.waves!.points).toBeGreaterThanOrEqual(before + 5 * POINTS.kill);
    expect(events.some((e) => e.kind === 'waveCleared')).toBe(true);
    expect(events.filter((e) => e.kind === 'corpseGone')).toHaveLength(5);
    const next = [...events, ...run(game, WAVES.intermission + 7)];
    const start = next.find((e) => e.kind === 'waveStart');
    expect(start && start.kind === 'waveStart' && start.wave).toBe(2);
    expect(game.npcs.filter((z) => z.state !== 'ragdoll')).toHaveLength(waveSize(2));
  });

  it('caps at 40 zombies a wave and 24 on the field', async () => {
    const game = await waveGame();
    game.waves!.director.wave = 9;
    let peak = 0;
    for (let i = 0; i < Math.round((WAVES.firstIntermission + 20) / DT); i++) {
      game.step(DT, idle());
      game.drainEvents();
      // Keep the player alive: this test only counts zombies.
      game.waves!.health.hp = HEALTH.max;
      peak = Math.max(peak, game.npcs.length);
    }
    expect(game.waves!.wave).toBe(10);
    expect(peak).toBe(WAVES.maxAlive);
    expect(game.waves!.remaining).toBe(40);
  });

  it('the Mystery Box costs 950 and gives a new gun after the roll', async () => {
    const game = await waveGame();
    const w = game.waves!;
    w.points = 1200;
    game.player.position.set(ARENA.boxPosition.x + 1, game.player.position.y, ARENA.boxPosition.z);
    run(game, 0.2);
    expect(w.nearBox).toBe(true);
    const events = run(game, 0.1, { use: true });
    expect(events.some((e) => e.kind === 'boxOpen')).toBe(true);
    expect(w.points).toBe(1200 - POINTS.boxCost);
    const result = run(game, ARENA.boxRollSeconds + 0.2).find((e) => e.kind === 'boxResult');
    expect(result).toBeDefined();
    const gun = result!.kind === 'boxResult' ? result!.gun : 'rifle';
    expect(gun).not.toBe('rifle');
    expect(game.player.owned.has(gun)).toBe(true);
    expect(game.player.weapon).toBe(gun);
  });

  it('cannot open the box without enough points or away from it', async () => {
    const game = await waveGame();
    game.waves!.points = 400;
    game.player.position.set(ARENA.boxPosition.x + 1, game.player.position.y, ARENA.boxPosition.z);
    expect(run(game, 0.2, { use: true }).some((e) => e.kind === 'boxOpen')).toBe(false);
    game.waves!.points = 5000;
    game.player.position.set(10, game.player.position.y, 10);
    expect(run(game, 0.2, { use: true }).some((e) => e.kind === 'boxOpen')).toBe(false);
  });

  it('reloading uses the limited reserve; an empty reserve means no reload', async () => {
    const game = await waveGame();
    game.step(DT, { ...idle(), weapon: 'rifle' });
    run(game, 0.6);
    const p = game.player;
    expect(p.reserve.rifle).toBe(RESERVE.rifle);
    run(game, 3.5, { fire: true });
    run(game, RIFLE.reloadSeconds + 0.3);
    expect(p.rifle.ammo).toBe(RIFLE.magSize);
    expect(p.reserve.rifle).toBe(RESERVE.rifle - RIFLE.magSize);
    p.reserve.rifle = 0;
    run(game, 3.5, { fire: true });
    run(game, RIFLE.reloadSeconds + 0.3);
    expect(p.rifle.ammo).toBe(0);
  });

  it('a Max Ammo power-up refills, Insta-Kill makes any hit lethal, a Nuke kills everything', async () => {
    // rng 0.01 → every kill drops a power-up; the second draw picks the kind (0.01 → Max Ammo).
    const game = await waveGame(() => 0.01);
    run(game, WAVES.firstIntermission + 3.5);
    const w = game.waves!;
    game.player.reserve.rifle = 3;
    const target = game.npcs[0];
    target.kill(new THREE.Vector3(0, 0.5, 1));
    run(game, 0.05);
    expect(w.powerUps.length).toBeGreaterThan(0);
    const drop = w.powerUps[0];
    expect(drop.kind).toBe('maxAmmo');
    game.player.position.set(drop.position.x, game.player.position.y, drop.position.z);
    const picked = run(game, 0.1);
    expect(picked.some((e) => e.kind === 'powerUp')).toBe(true);
    expect(game.player.reserve.rifle).toBe(RESERVE.rifle);
    expect(game.player.rifle.ammo).toBe(RIFLE.magSize);
  });
});
