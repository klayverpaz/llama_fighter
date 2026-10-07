import * as THREE from 'three';
import { RAPIER, bodyTag, type Physics } from '../physics/world';
import type { SegmentName } from '../figure/skeleton';

export interface HitCandidate {
  figureId: string;
  segment: SegmentName;
  point: THREE.Vector3;
}

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

/** Every figure (other than `excludeFigureId`) whose segments overlap a sphere; one entry per figure. */
export function findHits(physics: Physics, center: THREE.Vector3, radius: number, excludeFigureId: string): HitCandidate[] {
  const out: HitCandidate[] = [];
  const seen = new Set<string>();
  physics.world.intersectionsWithShape(center, IDENTITY, new RAPIER.Ball(radius), (collider) => {
    const tag = bodyTag(collider.parent());
    if (tag && tag.figureId !== excludeFigureId && !seen.has(tag.figureId)) {
      seen.add(tag.figureId);
      out.push({ figureId: tag.figureId, segment: tag.segment, point: center.clone() });
    }
    return true;
  });
  return out;
}
