import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPhysics } from '../physics/world';
import { Game, type GameEvent, type GameInput, type GameMode } from '../game';
import { PELVIS_HEIGHT } from '../figure/skeleton';
import { ARENA } from './arena';
import type { Obstacle } from './obstacles';
import { kindStats } from '../modes/zombieTypes';

const DT = 1 / 60;
const idle = (): GameInput => ({ move: new THREE.Vector3(), run: false, strikes: [], cameraYaw: 0 });
const forward = new THREE.Vector3(0, 0, 1);

async function game(obstacles: Obstacle[] = [], mode: GameMode = 'training', npcs = 0) {
  const physics = await createPhysics();
  let s = 3;
  return new Game(physics, new THREE.Scene(), npcs, () => ((s = (s * 16807) % 2147483647) / 2147483647), mode, obstacles);
}

function run(g: Game, seconds: number, input: Partial<GameInput> = {}): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    g.step(DT, { ...idle(), ...input });
    events.push(...g.drainEvents());
  }
  return events;
}

describe('jumping', () => {
  it('jumps about a metre and lands back on the floor', async () => {
    const g = await game();
    const events = [...run(g, DT, { jump: true })];
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      events.push(...run(g, DT));
      peak = Math.max(peak, g.player.feetY);
    }
    expect(peak).toBeGreaterThan(0.85);
    expect(peak).toBeLessThan(1.3);
    expect(g.player.feetY).toBe(0);
    expect(g.player.grounded).toBe(true);
    expect(events.some((e) => e.kind === 'jump')).toBe(true);
    expect(events.some((e) => e.kind === 'land')).toBe(true);
  });

  it('can only jump from the ground (no double jump)', async () => {
    const g = await game();
    run(g, DT, { jump: true });
    run(g, 0.1);
    const vy = g.player.vy;
    run(g, DT, { jump: true });
    expect(g.player.vy).toBeLessThan(vy);
  });

  it('jumps up onto a crate and stands on it', async () => {
    const crate: Obstacle = { shape: 'box', kind: 'crate', x: 0, z: 1.4, w: 1, d: 1, h: 0.8, rot: 0 };
    const g = await game([crate]);
    run(g, DT, { jump: true, move: forward });
    run(g, 0.5, { move: forward });
    run(g, 0.5);
    expect(g.player.feetY).toBeCloseTo(0.8, 3);
    expect(g.player.figure.pelvisPosition().y).toBeCloseTo(PELVIS_HEIGHT + 0.8, 2);
  });

  it('jumps with the llama too', async () => {
    const g = await game();
    run(g, DT, { mount: true });
    run(g, 0.5);
    run(g, DT, { jump: true });
    let lift = 0;
    for (let i = 0; i < 30; i++) {
      run(g, DT);
      lift = Math.max(lift, g.llama.group.position.y);
    }
    expect(lift).toBeGreaterThan(0.8);
  });
});

describe('obstacles', () => {
  it('a pillar blocks the way (you stop at its edge)', async () => {
    const pillar: Obstacle = { shape: 'cylinder', kind: 'pillar', x: 0, z: 3, r: 0.5, h: 3 };
    const g = await game([pillar]);
    run(g, 2, { move: forward });
    expect(g.player.position.z).toBeLessThan(3 - 0.5 - 0.3 + 0.02);
  });

  it('a pillar stops bullets: an NPC behind it is safe', async () => {
    const pillar: Obstacle = { shape: 'cylinder', kind: 'pillar', x: 0, z: 4, r: 0.6, h: 3 };
    const g = await game([pillar], 'training', 1);
    const npc = g.npcs[0];
    g.step(DT, { ...idle(), weapon: 'rifle' });
    run(g, 0.6);
    npc.position.set(0, PELVIS_HEIGHT, 7);
    const events: GameEvent[] = [];
    for (let i = 0; i < 20; i++) {
      npc.position.set(0, PELVIS_HEIGHT, 7);
      const origin = g.player.position.clone().add(new THREE.Vector3(0, 0.6, -1));
      g.step(DT, { ...idle(), aim: true, fire: true, aimRay: { origin, dir: new THREE.Vector3(0, 0, 1) } });
      events.push(...g.drainEvents());
    }
    expect(events.filter((e) => e.kind === 'shot').every((e) => e.kind === 'shot' && e.target !== 'npc')).toBe(true);
    expect(npc.hp).toBe(50);
  });

  it('a zombie finds its way around a wall', async () => {
    const wall: Obstacle = { shape: 'box', kind: 'wall', x: 0, z: 5, w: 4, d: 0.5, h: 2, rot: 0 };
    const g = await game([wall], 'waves');
    const z = g.spawnZombie(new THREE.Vector3(0, PELVIS_HEIGHT, 9), Math.PI, { ...kindStats('runner', 3), kind: 'runner' });
    z.riseLeft = 0;
    let closest = Infinity;
    for (let i = 0; i < Math.round(8 / DT); i++) {
      g.step(DT, idle());
      g.drainEvents();
      g.waves!.health.hp = 100;
      closest = Math.min(closest, Math.hypot(z.position.x, z.position.z));
    }
    expect(closest).toBeLessThan(2);
  });
});

describe('the edge of the island', () => {
  it('training: walk off the edge, fall into the void, come back in the middle', async () => {
    const g = await game();
    g.player.position.set(0, PELVIS_HEIGHT, ARENA.radius - 1);
    const events = run(g, 1, { move: forward, run: true });
    expect(events.some((e) => e.kind === 'fell')).toBe(true);
    const later = run(g, 4);
    expect(later.some((e) => e.kind === 'respawn')).toBe(true);
    expect(Math.hypot(g.player.position.x, g.player.position.z)).toBeLessThan(0.5);
    expect(g.player.figure.mode).toBe('posed');
  });

  it('wave mode: falling off the island is death', async () => {
    const g = await game([], 'waves');
    g.player.position.set(0, PELVIS_HEIGHT, ARENA.radius - 1);
    const events = run(g, 5, { move: forward, run: true });
    const death = events.find((e) => e.kind === 'death');
    expect(death && death.kind === 'death' && death.reason).toBe('void');
    expect(g.waves!.over).toBe(true);
  });

  it('a zombie shoved past the edge goes over and counts as a kill', async () => {
    const g = await game([], 'waves');
    const z = g.spawnZombie(new THREE.Vector3(0, PELVIS_HEIGHT, 20), Math.PI, { ...kindStats('walker', 1), kind: 'walker' });
    z.riseLeft = 0;
    run(g, 0.1);
    z.position.set(0, PELVIS_HEIGHT, ARENA.radius + 0.5);
    run(g, 0.2);
    expect(z.state).toBe('ragdoll');
    expect(g.waves!.kills).toBe(1);
    run(g, 2);
    expect(z.figure.pelvisPosition().y).toBeLessThan(-3);
  });
});

describe('samurai', () => {
  it('the player wears the armour', async () => {
    const g = await game();
    const head = g.player.figure.group.children[2];
    expect(head.children.length).toBeGreaterThan(0);
  });
});
