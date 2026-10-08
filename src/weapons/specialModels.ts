import * as THREE from 'three';
import { AK_SCALE } from './akModel';
import type { GunPoints } from './guns';

const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).multiplyScalar(AK_SCALE);

/** Shared hold points (same hand spacing as the AK so the stick arms reach); only the muzzle differs. */
function points(muzzleZ: number, muzzleY = 0.06, butt = -0.36): GunPoints {
  return {
    grip: P(0, -0.03, 0),
    handguard: P(0, 0.0, 0.3),
    butt: P(0, 0.01, butt),
    magWell: P(0, -0.02, 0.12),
    chargingHandle: P(-0.035, 0.06, 0.15),
    muzzle: P(0, muzzleY, muzzleZ),
    ejectionPort: P(-0.03, 0.06, 0.1),
    centre: P(0, 0.03, 0.12),
  };
}

export const SPECIAL_POINTS = {
  rpg: points(0.66, 0.065, -0.4),
  freeze: points(0.64),
  tesla: points(0.66),
  antigrav: points(0.62),
  llamaCannon: points(0.6, 0.07),
};

export interface GunModelHandle {
  group: THREE.Group;
  /** Show the visible round (RPG warhead, llama peeking out of the cannon) only while loaded. */
  setLoaded?(loaded: boolean): void;
}

const toon = (color: number) => new THREE.MeshToonMaterial({ color });
const glow = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });

function box(w: number, h: number, l: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  return m;
}
function tube(r: number, l: number, mat: THREE.Material, x: number, y: number, z: number, r2 = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, l, 14), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}
function ring(r: number, t: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 20), mat);
  m.position.set(x, y, z);
  return m;
}
function sphere(r: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
  m.position.set(x, y, z);
  return m;
}
/** Grip and stock every special gun shares (pistol grip + butt). */
function gripAndStock(mat: THREE.Material, stock = true): THREE.Mesh[] {
  const parts = [box(0.034, 0.1, 0.042, mat, 0, -0.035, -0.01, -0.35)];
  if (stock) parts.push(box(0.04, 0.1, 0.24, mat, 0, 0.0, -0.24, 0.12));
  return parts;
}

function finish(body: THREE.Group, extra?: Partial<GunModelHandle>): GunModelHandle {
  body.scale.setScalar(AK_SCALE);
  const group = new THREE.Group();
  group.add(body);
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { group, ...extra };
}

/** RPG-7: launch tube on the shoulder, wooden heat guard, green warhead (hidden once fired). */
export function createRpgModel(): GunModelHandle {
  const olive = toon(0x4e5b31);
  const metal = toon(0x2b2d30);
  const wood = toon(0x8b4a22);
  const body = new THREE.Group();
  body.add(
    tube(0.04, 0.95, metal, 0, 0.065, 0.06),
    tube(0.055, 0.12, metal, 0, 0.065, -0.44, 0.04),
    box(0.11, 0.1, 0.26, wood, 0, 0.065, 0.02),
    box(0.03, 0.05, 0.05, metal, 0.05, 0.12, 0.1),
    box(0.034, 0.1, 0.042, wood, 0, -0.02, -0.0, -0.3),
    box(0.034, 0.09, 0.04, wood, 0, -0.01, 0.3, -0.25),
  );
  const warhead = new THREE.Group();
  warhead.add(tube(0.045, 0.1, olive, 0, 0.065, 0.58), tube(0.001, 0.12, olive, 0, 0.065, 0.69, 0.045), tube(0.012, 0.06, metal, 0, 0.065, 0.76));
  body.add(warhead);
  return finish(body, { setLoaded: (loaded) => { warhead.visible = loaded; } });
}

/** Freeze ray: white sci-fi body, glowing cyan coils and coolant tank. */
export function createFreezeModel(): GunModelHandle {
  const white = toon(0xe9eef2);
  const grey = toon(0x6b7480);
  const ice = glow(0x7fe3ff);
  const tank = glow(0x9feaff, 0.75);
  const body = new THREE.Group();
  body.add(
    box(0.065, 0.09, 0.4, white, 0, 0.04, 0.12),
    tube(0.022, 0.32, grey, 0, 0.06, 0.46),
    ring(0.045, 0.012, ice, 0, 0.06, 0.34), ring(0.045, 0.012, ice, 0, 0.06, 0.42), ring(0.045, 0.012, ice, 0, 0.06, 0.5),
    sphere(0.03, ice, 0, 0.06, 0.63),
    tube(0.03, 0.2, tank, 0, 0.12, 0.08),
    ...gripAndStock(white),
  );
  return finish(body);
}

/** Tesla gun: brass body, copper coil, crackling ball at the front. */
export function createTeslaModel(): GunModelHandle {
  const brass = toon(0xb8862b);
  const copper = toon(0xc0622d);
  const dark = toon(0x2a2420);
  const wood = toon(0x7a4320);
  const ball = glow(0xcfe8ff);
  const body = new THREE.Group();
  body.add(box(0.06, 0.08, 0.3, brass, 0, 0.04, 0.08), tube(0.05, 0.28, copper, 0, 0.06, 0.38));
  for (let i = 0; i < 7; i++) body.add(ring(0.052, 0.006, dark, 0, 0.06, 0.26 + i * 0.04));
  body.add(tube(0.012, 0.08, dark, 0, 0.06, 0.56), sphere(0.055, ball, 0, 0.06, 0.63), ...gripAndStock(wood));
  return finish(body);
}

/** Anti-gravity gun: purple body with floating rings and a violet core. */
export function createAntigravModel(): GunModelHandle {
  const purple = toon(0x5b2d8e);
  const black = toon(0x1c1a22);
  const violet = glow(0xd28cff);
  const body = new THREE.Group();
  body.add(
    box(0.07, 0.1, 0.36, purple, 0, 0.045, 0.1),
    tube(0.02, 0.26, black, 0, 0.06, 0.42),
    ring(0.06, 0.008, violet, 0, 0.06, 0.4), ring(0.075, 0.008, violet, 0, 0.06, 0.48), ring(0.09, 0.008, violet, 0, 0.06, 0.56),
    sphere(0.035, violet, 0, 0.06, 0.6),
    ...gripAndStock(black),
  );
  return finish(body);
}

/** Llama cannon: fat orange tube with a flared bell and a mini llama peeking out while loaded. */
export function createLlamaCannonModel(): GunModelHandle {
  const orange = toon(0xe0742a);
  const dark = toon(0x2b2b2b);
  const body = new THREE.Group();
  body.add(
    tube(0.075, 0.55, orange, 0, 0.07, 0.25),
    tube(0.075, 0.1, orange, 0, 0.07, 0.56, 0.11),
    ring(0.078, 0.01, dark, 0, 0.07, 0.05), ring(0.078, 0.01, dark, 0, 0.07, 0.4),
    box(0.02, 0.06, 0.02, dark, -0.09, 0.07, 0.15),
    ...gripAndStock(dark),
  );
  const peek = createMiniLlama(0.55);
  peek.rotation.x = -0.5;
  peek.position.set(0, 0.07, 0.56);
  body.add(peek);
  return finish(body, { setLoaded: (loaded) => { peek.visible = loaded; } });
}

/** Small llama used as the cannon's projectile and as a bouncing prop. Origin at the body centre, facing +Z. */
export function createMiniLlama(scale = 1): THREE.Group {
  const wool = toon(0xeee2c8);
  const woolDark = toon(0xd6c4a2);
  const blanket = toon(0xc8372d);
  const face = toon(0x3a2a1f);
  const cap = (r: number, l: number, m: THREE.Material) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 3, 8), m);
  const g = new THREE.Group();
  const torso = cap(0.12, 0.22, wool);
  torso.rotation.x = Math.PI / 2;
  const saddle = box(0.25, 0.03, 0.2, blanket, 0, 0.11, -0.01);
  const neck = cap(0.05, 0.22, wool);
  neck.position.set(0, 0.16, 0.17);
  neck.rotation.x = 0.3;
  const head = cap(0.05, 0.06, wool);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.3, 0.24);
  const nose = sphere(0.018, face, 0, 0.29, 0.31);
  g.add(torso, saddle, neck, head, nose);
  for (const side of [-1, 1]) {
    const ear = cap(0.014, 0.06, woolDark);
    ear.position.set(side * 0.03, 0.37, 0.22);
    g.add(ear);
    for (const z of [-0.12, 0.12]) {
      const leg = cap(0.025, 0.14, woolDark);
      leg.position.set(side * 0.07, -0.16, z);
      g.add(leg);
    }
  }
  g.scale.setScalar(scale);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}

/** The rocket in flight: olive warhead and fins, pointing along +Z. */
export function createRocketMesh(): THREE.Group {
  const olive = toon(0x4e5b31);
  const metal = toon(0x2b2d30);
  const g = new THREE.Group();
  g.add(tube(0.035, 0.1, olive, 0, 0, 0.05), tube(0.001, 0.1, olive, 0, 0, 0.14, 0.035), tube(0.012, 0.22, metal, 0, 0, -0.1));
  for (let i = 0; i < 4; i++) {
    const fin = box(0.004, 0.06, 0.06, metal, 0, 0, -0.2);
    fin.rotation.z = (i * Math.PI) / 2;
    fin.position.set(Math.sin((i * Math.PI) / 2) * 0.025, Math.cos((i * Math.PI) / 2) * 0.025, -0.2);
    g.add(fin);
  }
  const flame = sphere(0.03, glow(0xffb347), 0, 0, -0.24);
  flame.scale.set(1, 1, 2);
  g.add(flame);
  return g;
}
