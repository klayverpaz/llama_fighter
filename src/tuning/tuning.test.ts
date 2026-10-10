import { afterEach, describe, it, expect } from 'vitest';
import { DEFAULT_TUNING, TUNING, applyTuning, snapshotTuning } from './tuning';
import { DevMode, type KeyValueStore } from './devMode';
import { POINTS, boxCost } from '../modes/waves';
import { STRIKES } from '../combat/strikes';
import { GUNS } from '../weapons/guns';
import json from './tuning.json';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

afterEach(() => applyTuning(DEFAULT_TUNING));

describe('tuning', () => {
  it('starts with the values of tuning.json', () => {
    expect(snapshotTuning()).toEqual(json);
  });

  it('gameplay tables read the live values', () => {
    applyTuning({ points: { boxCost: 1000, boxCostGrowth: 2 }, strikes: { jab: { damage: 99 } }, guns: { rpg: { magSize: 3 } } });
    expect(POINTS.boxCost).toBe(1000);
    expect(boxCost(3)).toBe(4000);
    expect(STRIKES.jab.damage).toBe(99);
    expect(STRIKES.jab.key).toBe('KeyJ');
    expect(GUNS.rpg.magSize).toBe(3);
  });

  it('applyTuning keeps defaults for missing, unknown or non-numeric values', () => {
    applyTuning({ points: { hit: 'lots', kill: 70, bogus: 5 }, nope: {} });
    expect(TUNING.points.hit).toBe(DEFAULT_TUNING.points.hit);
    expect(TUNING.points.kill).toBe(70);
    expect(TUNING.waves).toEqual(DEFAULT_TUNING.waves);
    expect(snapshotTuning().points).not.toHaveProperty('bogus');
  });

  it('snapshots leave out the labels attached to the live objects', () => {
    expect(snapshotTuning().strikes.jab).not.toHaveProperty('key');
    expect(snapshotTuning().zombieKinds.boss).not.toHaveProperty('name');
  });
});

describe('dev mode', () => {
  it('switching off restores the defaults and switching on brings the tweaks back', () => {
    const dev = new DevMode(new MemoryStore());
    dev.setOn(true);
    TUNING.points.boxCostGrowth = 1.5;
    dev.changed();
    dev.setOn(false);
    expect(TUNING.points.boxCostGrowth).toBe(DEFAULT_TUNING.points.boxCostGrowth);
    dev.setOn(true);
    expect(TUNING.points.boxCostGrowth).toBe(1.5);
  });

  it('remembers the tweaks and the switch across reloads', () => {
    const store = new MemoryStore();
    const a = new DevMode(store);
    a.setOn(true);
    TUNING.health.max = 250;
    a.changed();
    applyTuning(DEFAULT_TUNING); // "reload"
    const b = new DevMode(store);
    expect(b.on).toBe(true);
    expect(TUNING.health.max).toBe(250);
  });

  it('dumps tuning.json-shaped JSON with the current tweaks', () => {
    const dev = new DevMode(null);
    dev.setOn(true);
    TUNING.strikes.highKick.damage = 45;
    const dump = JSON.parse(dev.dump());
    expect(Object.keys(dump)).toEqual(Object.keys(json));
    expect(dump.strikes.highKick.damage).toBe(45);
    expect(dump.strikes.highKick).not.toHaveProperty('limb');
  });

  it('reset brings the dev values back to tuning.json', () => {
    const dev = new DevMode(new MemoryStore());
    dev.setOn(true);
    TUNING.waves.perWave = 9;
    dev.reset();
    expect(TUNING.waves.perWave).toBe(DEFAULT_TUNING.waves.perWave);
  });

  it('survives a corrupt or throwing store', () => {
    const store = new MemoryStore();
    store.setItem('kb-dev-tuning', '{oops');
    expect(() => new DevMode(store)).not.toThrow();
    const broken: KeyValueStore = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    const dev = new DevMode(broken);
    expect(() => dev.setOn(true)).not.toThrow();
    expect(dev.on).toBe(true);
  });
});
