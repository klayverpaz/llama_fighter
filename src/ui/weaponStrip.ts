export interface StripSlot<W> {
  weapon: W;
  /** Position relative to the selected weapon: −1 previous, 0 selected, 1 and 2 the next ones. */
  offset: number;
}

/** Offsets in the order they claim a weapon, so a short cycle never shows the same weapon twice. */
const PRIORITY = [0, 1, -1, 2];

/**
 * The few weapons shown around the selected one: the previous, the selected and the next two
 * (fewer when fewer are owned), sorted top to bottom. `cycle` is the order Q / the wheel go through.
 */
export function weaponStrip<W>(cycle: readonly W[], current: W): StripSlot<W>[] {
  const n = cycle.length;
  if (n === 0) return [];
  const i = Math.max(0, cycle.indexOf(current));
  const used = new Set<number>();
  const slots: StripSlot<W>[] = [];
  for (const offset of PRIORITY) {
    const j = (((i + offset) % n) + n) % n;
    if (used.has(j)) continue;
    used.add(j);
    slots.push({ weapon: cycle[j], offset });
  }
  return slots.sort((a, b) => a.offset - b.offset);
}
