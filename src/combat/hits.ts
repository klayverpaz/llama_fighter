import * as THREE from 'three';
import { RAPIER, bodyTag, type Physics } from '../physics/world';
import type { SegmentName } from '../figure/skeleton';

export interface HitCandidate {
  figureId: string;
  segment: SegmentName;
  /** Centre of mass of the struck segment's body (where the KO impulse is applied). */
  point: THREE.Vector3;
}

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Every figure (other than `excludeFigureId`) whose segments overlap a sphere; one entry per figure,
 * for the overlapping segment whose body centre is nearest the sphere centre.
 */
export function findHits(physics: Physics, center: THREE.Vector3, radius: number, excludeFigureId: string): HitCandidate[] {
  const best = new Map<string, { candidate: HitCandidate; distSq: number }>();
  physics.world.intersectionsWithShape(center, IDENTITY, new RAPIER.Ball(radius), (collider) => {
    const body = collider.parent();
    const tag = bodyTag(body);
    if (!body || !tag || tag.figureId === excludeFigureId) return true;
    const t = body.translation();
    const point = new THREE.Vector3(t.x, t.y, t.z);
    const distSq = point.distanceToSquared(center);
    const prev = best.get(tag.figureId);
    if (!prev || distSq < prev.distSq) best.set(tag.figureId, { candidate: { figureId: tag.figureId, segment: tag.segment, point }, distSq });
    return true;
  });
  return [...best.values()].map((b) => b.candidate);
}
