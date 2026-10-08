import * as THREE from 'three';
import { AK_SCALE } from './akModel';
import type { GunPoints } from './guns';

const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).multiplyScalar(AK_SCALE);

/** Same frame convention as the AK: origin at the grip, +Z down the barrel, +X the gun's left. Scaled. */
export const SHOTGUN_POINTS: GunPoints = {
  grip: P(0, -0.03, -0.01),
  handguard: P(0, 0.01, 0.33),
  butt: P(0, 0.0, -0.37),
  magWell: P(0, 0.0, 0.1),
  chargingHandle: P(-0.03, 0.05, 0.12),
  muzzle: P(0, 0.075, 0.68),
  ejectionPort: P(-0.03, 0.065, 0.08),
  centre: P(0, 0.03, 0.15),
};

export interface ShotgunModel {
  group: THREE.Group;
  /** Slide the forend back by `offset` metres (scaled frame) for the pump stroke. */
  setPump(offset: number): void;
}

function box(w: number, h: number, l: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  return m;
}

function tube(r: number, l: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 12), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

export function createShotgunModel(): ShotgunModel {
  const blued = new THREE.MeshToonMaterial({ color: 0x24262b });
  const black = new THREE.MeshToonMaterial({ color: 0x151515 });
  const walnut = new THREE.MeshToonMaterial({ color: 0x6e3b1c });
  const shellRed = new THREE.MeshToonMaterial({ color: 0xc0261e });
  const brass = new THREE.MeshToonMaterial({ color: 0xd2a644 });

  const body = new THREE.Group();
  body.scale.setScalar(AK_SCALE);
  const parts = [
    // Receiver, barrel, magazine tube, bead.
    box(0.046, 0.072, 0.23, blued, 0, 0.042, 0.06),
    tube(0.013, 0.52, blued, 0, 0.075, 0.42),
    tube(0.012, 0.44, black, 0, 0.036, 0.39),
    tube(0.013, 0.02, blued, 0, 0.036, 0.61),
    new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), brass),
    // Stock: neck, butt, recoil pad; grip and trigger guard.
    box(0.036, 0.055, 0.13, walnut, 0, 0.02, -0.11, 0.16),
    box(0.042, 0.12, 0.2, walnut, 0, -0.015, -0.27, 0.16),
    box(0.044, 0.125, 0.02, black, 0, -0.03, -0.375, 0.16),
    box(0.034, 0.09, 0.042, walnut, 0, -0.03, -0.02, -0.45),
    box(0.008, 0.008, 0.07, black, 0, -0.005, 0.04),
  ];
  parts[4].position.set(0, 0.092, 0.665);
  for (const p of parts) body.add(p);

  // Side saddle with four spare shells on the left of the receiver.
  for (let i = 0; i < 4; i++) {
    const z = 0.0 + i * 0.035;
    const shell = tube(0.011, 0.055, shellRed, 0.034, 0.045, z);
    shell.rotation.set(0, 0, 0);
    const head = tube(0.0115, 0.012, brass, 0.034, 0.045 - 0.032, z);
    head.rotation.set(0, 0, 0);
    body.add(shell, head);
  }

  // Ribbed pump forend that slides along the magazine tube.
  const pump = new THREE.Group();
  pump.add(box(0.052, 0.048, 0.17, walnut, 0, 0.034, 0.33));
  for (let i = 0; i < 5; i++) pump.add(box(0.054, 0.006, 0.008, black, 0, 0.034 + 0.018, 0.27 + i * 0.03));
  body.add(pump);

  const group = new THREE.Group();
  group.add(body);
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return {
    group,
    setPump(offset) {
      pump.position.z = -offset / AK_SCALE;
    },
  };
}
