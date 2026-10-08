import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPhysics } from '../physics/world';
import { Game, type GameEvent, type GameInput } from '../game';
import { PELVIS_HEIGHT } from '../figure/skeleton';
import { LLAMA } from '../entities/llama';
import { WAVES } from './waves';
import { kindStats, type ZombieKind } from './zombieTypes';

const DT = 1 / 60;
const idle = (): GameInput => ({ move: new THREE.Vector3(), run: false, strikes: [], cameraYaw: 0 });

async function game() {
  const physics = await createPhysics();
  let s = 21;
  return new Game(physics, new THREE.Scene(), 0, () => ((s = (s * 16807) % 2147483647) / 2147483647), 'waves');
}

function spawn(g: Game, kind: ZombieKind, x: number, z: number, wave = 5) {
  const pos = new THREE.Vector3(x, PELVIS_HEIGHT, z);
  const npc = g.spawnZombie(pos, Math.atan2(-x, -z), { ...kindStats(kind, wave), kind });
  npc.riseLeft = 0;
  return npc;
}

function run(g: Game, seconds: number, input: Partial<GameInput> = {}): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    g.step(DT, { ...idle(), ...input });
    events.push(...g.drainEvents());
  }
  return events;
}

describe('zombie kinds in play', () => {
  it('a Bombardeiro runs up, blows itself up, hurts the player and knocks the zombies around it down', async () => {
    const g = await game();
    const bomber = spawn(g, 'exploder', 0, 6);
    const buddy = spawn(g, 'walker', 0.8, 6.6);
    buddy.hp = 30;
    const events = run(g, 4);
    expect(bomber.detonated).toBe(true);
    expect(events.some((e) => e.kind === 'explosion')).toBe(true);
    expect(events.some((e) => e.kind === 'hurt')).toBe(true);
    expect(buddy.state).toBe('ragdoll');
  });

  it('shooting a Bombardeiro inside a crowd sets off a chain reaction', async () => {
    const g = await game();
    const bombers = [spawn(g, 'exploder', 0, 12), spawn(g, 'exploder', 1.6, 12.4), spawn(g, 'exploder', 3.2, 12.8)];
    run(g, 0.05);
    bombers[0].kill(new THREE.Vector3(0, 0, 1));
    const events = run(g, 0.3);
    expect(events.filter((e) => e.kind === 'explosion').length).toBe(3);
    expect(bombers.every((b) => b.state === 'ragdoll')).toBe(true);
  });

  it('the Cavaleiro Zumbi rides a zombie llama, fast; kill the rider and the llama goes down', async () => {
    const g = await game();
    const rider = spawn(g, 'cavalry', 0, 16);
    expect(rider.steed).not.toBeNull();
    run(g, 0.5);
    expect(rider.figure.pelvisPosition().y).toBeGreaterThan(LLAMA.saddlePelvisY - 0.1);
    const start = rider.position.clone();
    run(g, 1);
    expect(rider.position.distanceTo(start)).toBeGreaterThan(4);
    rider.kill(new THREE.Vector3(0, 0, 1));
    const events = run(g, 0.1);
    expect(events.some((e) => e.kind === 'steedDown')).toBe(true);
    expect(rider.steed).toBeNull();
  });

  it('bullets that hit the zombie llama hurt its rider', async () => {
    const g = await game();
    const rider = spawn(g, 'cavalry', 0, 14);
    g.step(DT, { ...idle(), weapon: 'rifle' });
    run(g, 0.6);
    const hp = rider.hp;
    // Aim low at the llama's flank, under the rider.
    for (let i = 0; i < 20; i++) {
      const target = rider.position.clone().setY(0.85);
      const origin = g.player.position.clone().add(new THREE.Vector3(-0.5, 0.75, -1.8));
      g.step(DT, { ...idle(), aim: true, fire: true, aimRay: { origin, dir: target.sub(origin).normalize() } });
    }
    expect(rider.hp).toBeLessThan(hp);
  });

  it('wave 5 brings the crowned boss, with a health bar, and announces it', async () => {
    const g = await game();
    g.waves!.director.wave = 4;
    const events = run(g, WAVES.firstIntermission + 1);
    expect(events.some((e) => e.kind === 'bossIncoming')).toBe(true);
    const boss = g.waves!.boss!;
    expect(boss).not.toBeNull();
    expect(boss.kind).toBe('boss');
    expect(boss.maxHp).toBeGreaterThan(kindStats('walker', 5).hp * 10);
    boss.kill(new THREE.Vector3(0, 0, 1));
    run(g, 0.1);
    expect(g.waves!.boss).toBeNull();
  });

  it('a new kind is announced the wave it shows up', async () => {
    const g = await game();
    g.waves!.director.wave = 1;
    const events = run(g, WAVES.firstIntermission + 0.5);
    const fresh = events.find((e) => e.kind === 'newZombies');
    expect(fresh && fresh.kind === 'newZombies' && fresh.names).toEqual(['CORREDORES']);
  });
});
