import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPhysics } from './physics/world';
import { Game, type GameInput } from './game';
import { PELVIS_HEIGHT } from './figure/skeleton';
import { kindStats } from './modes/zombieTypes';
import { generateObstacles } from './world/obstacles';
import { Effects } from './fx/effects';

const DT = 1 / 60;
const idle = (): GameInput => ({ move: new THREE.Vector3(), run: false, strikes: [], cameraYaw: 0 });

describe('stress', () => {
  it('rockets, dismemberment and bleeding stumps on corpses that get removed never break the physics', async () => {
    const physics = await createPhysics();
    let s = 1234;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const scene = new THREE.Scene();
    const g = new Game(physics, scene, 0, rng, 'waves', generateObstacles(rng, [{ x: 0, z: 0, r: 3.5 }]));
    const effects = new Effects(scene);
    g.player.giveGun('rpg');
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < 12; i++) {
        const a = rng() * Math.PI * 2;
        const r = 3 + rng() * 6;
        const z = g.spawnZombie(new THREE.Vector3(Math.sin(a) * r, PELVIS_HEIGHT, Math.cos(a) * r), 0, { ...kindStats('walker', 6), kind: 'walker' });
        z.riseLeft = 0;
      }
      for (let i = 0; i < 300; i++) {
        const t = g.npcs[0]?.figure.segmentPosition('torso') ?? new THREE.Vector3(0, 1, 5);
        const origin = g.player.position.clone().add(new THREE.Vector3(0, 0.8, -1.5));
        g.step(DT, { ...idle(), aim: true, fire: i % 40 === 0, reload: i % 40 === 20, aimRay: { origin, dir: t.sub(origin).normalize() } });
        for (const e of g.drainEvents()) {
          // What the browser does with gore: long bleeds that outlive the corpse.
          if (e.kind === 'dismember') {
            effects.bleed(e.stump, 8);
            effects.bleed(e.limb, 8);
          }
        }
        effects.update(DT);
        g.waves!.health.hp = 100;
      }
    }
    expect(g.waves!.kills).toBeGreaterThan(20);
    expect(() => physics.step()).not.toThrow();
  }, 60000);
});
