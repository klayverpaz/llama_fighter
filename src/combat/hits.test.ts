import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { RAPIER, createPhysics, type BodyTag, type Physics } from '../physics/world';
import type { SegmentName } from '../figure/skeleton';
import { findHits } from './hits';

function addBall(physics: Physics, figureId: string, segment: SegmentName, at: [number, number, number], radius: number) {
  const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...at));
  body.userData = { figureId, segment } satisfies BodyTag;
  physics.world.createCollider(RAPIER.ColliderDesc.ball(radius), body);
}

describe('findHits', () => {
  it('keeps, per figure, the overlapping segment whose body centre is nearest, and reports its centre', async () => {
    const physics = await createPhysics();
    // Same figure: a light forearm registered first, the torso nearer the strike point.
    addBall(physics, 'npc-0', 'lowerArmL', [0.18, 1.3, 0], 0.05);
    addBall(physics, 'npc-0', 'torso', [0, 1.3, 0.1], 0.1);
    addBall(physics, 'npc-1', 'head', [0.1, 1.5, 0], 0.12);
    addBall(physics, 'player', 'lowerLegR', [0, 1.3, 0], 0.05);
    physics.step();

    const hits = findHits(physics, new THREE.Vector3(0, 1.3, 0), 0.22, 'player');
    const byId = new Map(hits.map((h) => [h.figureId, h]));
    expect(hits).toHaveLength(2);
    expect(byId.get('npc-0')?.segment).toBe('torso');
    expect(byId.get('npc-0')?.point.toArray()).toEqual([expect.closeTo(0, 5), expect.closeTo(1.3, 5), expect.closeTo(0.1, 5)]);
    expect(byId.get('npc-1')?.segment).toBe('head');
    expect(byId.has('player')).toBe(false);
    physics.dispose();
  });
});
