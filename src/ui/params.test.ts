import { describe, it, expect } from 'vitest';
import { parseNpcCount } from './params';

describe('parseNpcCount', () => {
  it('reads ?npcs=N', () => {
    expect(parseNpcCount('?npcs=8')).toBe(8);
    expect(parseNpcCount('?foo=1&npcs=3')).toBe(3);
  });

  it('defaults to 5 when missing or garbage', () => {
    expect(parseNpcCount('')).toBe(5);
    expect(parseNpcCount('?npcs=abc')).toBe(5);
    expect(parseNpcCount('?npcs=')).toBe(5);
  });

  it('clamps to 1..20', () => {
    expect(parseNpcCount('?npcs=0')).toBe(1);
    expect(parseNpcCount('?npcs=-4')).toBe(1);
    expect(parseNpcCount('?npcs=99')).toBe(20);
    expect(parseNpcCount('?npcs=2.7')).toBe(2);
  });
});
