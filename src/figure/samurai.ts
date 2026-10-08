import * as THREE from 'three';
import type { Figure } from './figure';

/**
 * Samurai armour for the player. Every piece is attached to a body segment's mesh, in that segment's local
 * frame: +Y along the limb (towards the head / shoulder), +Z forward, +X the figure's left.
 */
const M = {
  lacquer: new THREE.MeshToonMaterial({ color: 0xb3261e }),
  lacquerDark: new THREE.MeshToonMaterial({ color: 0x7e1913 }),
  black: new THREE.MeshToonMaterial({ color: 0x1c1b22 }),
  iron: new THREE.MeshToonMaterial({ color: 0x3a3d45 }),
  gold: new THREE.MeshToonMaterial({ color: 0xe0b02e }),
  cord: new THREE.MeshToonMaterial({ color: 0x2f5fbf }),
  white: new THREE.MeshToonMaterial({ color: 0xf4efe3, side: THREE.DoubleSide }),
  flag: new THREE.MeshToonMaterial({ color: 0xc8302a, side: THREE.DoubleSide }),
  wrap: new THREE.MeshToonMaterial({ color: 0x223b6e }),
};

/** Indigo body (gi and hakama) under the armour. */
export const SAMURAI_BODY_COLOR = 0x24305a;

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function kabuto(): THREE.Group {
  const g = new THREE.Group();
  // Bowl.
  g.add(mesh(new THREE.SphereGeometry(0.138, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.black, 0, 0.01, 0));
  const rim = mesh(new THREE.TorusGeometry(0.135, 0.012, 6, 24), M.gold, 0, 0.012, 0);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  // Shikoro: flared, layered neck guard around the back and sides.
  for (let i = 0; i < 3; i++) {
    const r = 0.14 + i * 0.022;
    const layer = mesh(new THREE.CylinderGeometry(r, r + 0.02, 0.045, 20, 1, true, Math.PI * 0.2, Math.PI * 1.6), i % 2 ? M.lacquerDark : M.black, 0, -0.02 - i * 0.04, 0);
    layer.rotation.y = Math.PI;
    g.add(layer);
  }
  // Kuwagata: two golden horns in a V, and a crescent moon between them.
  for (const side of [-1, 1]) {
    const horn = mesh(new THREE.BoxGeometry(0.02, 0.2, 0.012), M.gold, side * 0.06, 0.15, 0.1);
    horn.rotation.z = side * -0.45;
    horn.rotation.x = -0.2;
    g.add(horn);
  }
  const moon = mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16, Math.PI), M.gold, 0, 0.12, 0.125);
  g.add(moon);
  // Mempo: red half mask over the mouth and chin.
  const mask = mesh(new THREE.SphereGeometry(0.105, 14, 8, -Math.PI * 0.45, Math.PI * 0.9, Math.PI * 0.5, Math.PI * 0.32), M.lacquer, 0, 0.0, 0.012);
  g.add(mask);
  return g;
}

function dou(): THREE.Group {
  const g = new THREE.Group();
  // Breastplate: a lacquered barrel around the chest with lacing bands.
  g.add(mesh(new THREE.CylinderGeometry(0.135, 0.125, 0.4, 18), M.lacquer, 0, 0.04, 0));
  for (let i = 0; i < 4; i++) {
    const band = mesh(new THREE.TorusGeometry(0.133 - i * 0.002, 0.008, 6, 24), i === 0 ? M.gold : M.cord, 0, 0.2 - i * 0.11, 0);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  }
  // Shoulder straps.
  for (const side of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.03, 0.26), M.black, side * 0.09, 0.24, 0));
  // Sashimono: banner pole on the back with a red flag and a white sun.
  const pole = mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.0, 6), M.black, 0, 0.55, -0.15);
  g.add(pole);
  const flag = mesh(new THREE.PlaneGeometry(0.3, 0.42), M.flag, 0, 0.82, -0.15);
  flag.rotation.y = Math.PI / 2;
  flag.position.x = 0.15;
  const sun = mesh(new THREE.CircleGeometry(0.08, 20), M.white, 0.151, 0.84, -0.15);
  sun.rotation.y = Math.PI / 2;
  g.add(flag, sun, mesh(new THREE.BoxGeometry(0.34, 0.012, 0.012), M.black, 0.15, 1.04, -0.15));
  return g;
}

/** Sode: shoulder plates on the outer side of the upper arm. `side` = +1 left arm, −1 right arm. */
function sode(side: 1 | -1): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const plate = mesh(new THREE.BoxGeometry(0.02, 0.06, 0.14), i % 2 ? M.lacquerDark : M.lacquer, side * (0.055 + i * 0.004), 0.12 - i * 0.055, 0);
    plate.rotation.z = side * 0.18;
    g.add(plate);
  }
  g.add(mesh(new THREE.BoxGeometry(0.025, 0.012, 0.15), M.gold, side * 0.058, 0.155, 0));
  return g;
}

function kusazuri(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const plate = mesh(new THREE.BoxGeometry(0.1, 0.17, 0.016), i % 2 ? M.lacquerDark : M.lacquer, Math.sin(a) * 0.115, -0.06, Math.cos(a) * 0.115);
    plate.rotation.y = a;
    plate.rotation.x = 0.22;
    g.add(plate);
  }
  return g;
}

/** Katana in its black scabbard, slung at the left hip and pointing back. */
function katana(): THREE.Group {
  const g = new THREE.Group();
  const saya = mesh(new THREE.BoxGeometry(0.025, 0.035, 0.68), M.black, 0, 0, -0.26);
  const tsuba = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 12), M.gold, 0, 0, 0.085);
  tsuba.rotation.x = Math.PI / 2;
  const tsuka = mesh(new THREE.BoxGeometry(0.024, 0.03, 0.22), M.wrap, 0, 0, 0.2);
  g.add(saya, tsuba, tsuka, mesh(new THREE.BoxGeometry(0.026, 0.032, 0.02), M.gold, 0, 0, 0.31));
  g.position.set(0.14, 0.0, 0.02);
  g.rotation.set(0.45, 0.12, 0);
  return g;
}

function suneate(): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(0.075, 0.26, 0.02), M.iron, 0, -0.02, 0.048);
  return m;
}

export function dressAsSamurai(figure: Figure): void {
  figure.attach('head', kabuto());
  figure.attach('torso', dou());
  figure.attach('upperArmL', sode(1));
  figure.attach('upperArmR', sode(-1));
  figure.attach('pelvis', kusazuri());
  figure.attach('pelvis', katana());
  figure.attach('lowerLegL', suneate());
  figure.attach('lowerLegR', suneate());
}
