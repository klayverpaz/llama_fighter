/** The floating island everything happens on. Step off the edge and you fall into the void. */
export const ARENA = {
  radius: 24,
  /** Thickness of the island (for the visuals and the physics slab). */
  depth: 3,
  /** Below this the player is lost in the void. */
  voidY: -18,
};

export function onIsland(x: number, z: number, margin = 0): boolean {
  return Math.hypot(x, z) <= ARENA.radius - margin;
}
