import * as THREE from 'three';
import type { GunPoints } from './guns';

/** The stick figures have short arms: the rifle is built at real size and drawn at 85%. */
export const AK_SCALE = 0.85;

const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).multiplyScalar(AK_SCALE);

/**
 * Reference points in the rifle's local frame: origin at the pistol grip (right hand),
 * +Z along the barrel, +Y up, +X the rifle's left side. Already scaled by AK_SCALE.
 */
export const AK_POINTS: GunPoints = {
  grip: P(0, -0.03, -0.005),
  handguard: P(0, 0.005, 0.3),
  butt: P(0, 0.01, -0.39),
  magWell: P(0, -0.02, 0.14),
  chargingHandle: P(-0.035, 0.075, 0.2),
  muzzle: P(0, 0.05, 0.74),
  ejectionPort: P(-0.03, 0.07, 0.12),
  /** Middle of the rifle, used to centre it when slung on the back. */
  centre: P(0, 0.03, 0.17),
};

export interface AkModel {
  group: THREE.Group;
  /** The curved magazine, offset during the reload animation via setMagazine. */
  magazine: THREE.Group;
  /** Offset (in the rifle frame, metres, already scaled like AK_POINTS) and visibility of the magazine. */
  setMagazine(offset: THREE.Vector3, visible: boolean): void;
}

function box(w: number, h: number, l: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  return m;
}

function tube(r: number, l: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 10), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

export function createAkModel(): AkModel {
  const metal = new THREE.MeshToonMaterial({ color: 0x2c2c2e });
  const darkMetal = new THREE.MeshToonMaterial({ color: 0x1b1b1c });
  const wood = new THREE.MeshToonMaterial({ color: 0x8b4a22 });
  const bakelite = new THREE.MeshToonMaterial({ color: 0xb4521e });

  const group = new THREE.Group();
  const parts: THREE.Mesh[] = [
    // Receiver and dust cover.
    box(0.046, 0.07, 0.36, metal, 0, 0.045, 0.08),
    box(0.04, 0.022, 0.33, darkMetal, 0, 0.09, 0.075),
    // Stock: neck and butt, angled down like the real thing.
    box(0.034, 0.05, 0.14, wood, 0, 0.035, -0.165, 0.1),
    box(0.04, 0.115, 0.17, wood, 0, 0.005, -0.31, 0.14),
    box(0.042, 0.12, 0.012, darkMetal, 0, 0.0, -0.395, 0.14),
    // Pistol grip and trigger guard.
    box(0.034, 0.11, 0.042, wood, 0, -0.04, -0.015, -0.35),
    box(0.008, 0.008, 0.075, darkMetal, 0, -0.012, 0.045),
    box(0.008, 0.03, 0.008, darkMetal, 0, 0.0, 0.03),
    // Handguards (lower and gas-tube upper).
    box(0.05, 0.05, 0.2, wood, 0, 0.032, 0.37),
    box(0.036, 0.03, 0.17, wood, 0, 0.088, 0.355),
    // Barrel, gas block, front sight, muzzle brake.
    tube(0.011, 0.27, darkMetal, 0, 0.05, 0.585),
    box(0.03, 0.045, 0.028, metal, 0, 0.078, 0.495),
    box(0.006, 0.045, 0.01, metal, 0, 0.1, 0.635),
    tube(0.015, 0.045, metal, 0, 0.05, 0.72),
    // Rear sight and charging handle.
    box(0.03, 0.016, 0.045, metal, 0, 0.105, 0.265),
    box(0.03, 0.012, 0.012, metal, -0.03, 0.07, 0.2),
  ];

  const magazine = new THREE.Group();
  const magSegments: Array<[number, number, number]> = [[-0.01, 0.135, 0.18], [-0.068, 0.158, 0.36], [-0.122, 0.193, 0.55]];
  for (const [y, z, rx] of magSegments) magazine.add(box(0.034, 0.068, 0.062, bakelite, 0, y, z, rx));
  const body = new THREE.Group();
  body.scale.setScalar(AK_SCALE);
  for (const p of parts) body.add(p);
  body.add(magazine);
  group.add(body);
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return {
    group,
    magazine,
    setMagazine(offset, visible) {
      magazine.position.copy(offset).divideScalar(AK_SCALE);
      magazine.visible = visible;
    },
  };
}
