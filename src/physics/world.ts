import RAPIER from '@dimforge/rapier3d-compat';
import type { SegmentName } from '../figure/skeleton';
import { ARENA } from '../world/arena';

export { RAPIER };

/** Stored in `RigidBody.userData` on every figure segment. */
export interface BodyTag {
  figureId: string;
  segment: SegmentName;
}

export interface Physics {
  world: RAPIER.World;
  eventQueue: RAPIER.EventQueue;
  hooks: RAPIER.PhysicsHooks;
  step(): void;
  dispose(): void;
}

export function bodyTag(body: RAPIER.RigidBody | null | undefined): BodyTag | null {
  const tag = body?.userData as BodyTag | undefined;
  return tag && typeof tag.figureId === 'string' ? tag : null;
}

export async function createPhysics(dt = 1 / 60): Promise<Physics> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = dt;

  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    // The floating island: a disc. Anything pushed past its edge falls into the void.
    RAPIER.ColliderDesc.cylinder(ARENA.depth / 2, ARENA.radius).setTranslation(0, -ARENA.depth / 2, 0).setFriction(0.9),
    ground,
  );

  // Segments of the same figure never collide with each other. The hook only runs
  // when step() receives a real EventQueue (Rapier 0.21 behaviour).
  const eventQueue = new RAPIER.EventQueue(false);
  const hooks: RAPIER.PhysicsHooks = {
    filterContactPair: (_c1, _c2, b1, b2) => {
      const t1 = bodyTag(world.getRigidBody(b1));
      const t2 = bodyTag(world.getRigidBody(b2));
      if (t1 && t2 && t1.figureId === t2.figureId) return null;
      return RAPIER.SolverFlags.COMPUTE_IMPULSE;
    },
    filterIntersectionPair: () => true,
  };

  return {
    world,
    eventQueue,
    hooks,
    step() {
      world.step(eventQueue, hooks);
    },
    dispose() {
      eventQueue.free();
      world.free();
    },
  };
}
