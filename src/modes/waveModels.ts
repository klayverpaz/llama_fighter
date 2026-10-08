import * as THREE from 'three';
import type { PowerUpKind } from './waves';

const toon = (color: number) => new THREE.MeshToonMaterial({ color });
const glow = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({
  color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
});

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Floating power-up icon on a glowing halo. Origin on the ground. */
export function createPowerUpMesh(kind: PowerUpKind): { group: THREE.Group; icon: THREE.Group } {
  const group = new THREE.Group();
  const icon = new THREE.Group();
  const haloColor = kind === 'maxAmmo' ? 0x7dff8a : kind === 'instaKill' ? 0xff5a4a : 0xffe14a;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 32), glow(haloColor));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.05;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 16, 1, true), glow(haloColor, 0.18));
  beam.position.y = 1.1;
  group.add(halo, beam);

  if (kind === 'maxAmmo') {
    const brass = toon(0xd2a644);
    const tip = toon(0xb87333);
    for (let i = -1; i <= 1; i++) {
      icon.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 10), brass, i * 0.15, 0, 0));
      icon.add(mesh(new THREE.ConeGeometry(0.06, 0.14, 10), tip, i * 0.15, 0.23, 0));
    }
    icon.add(mesh(new THREE.BoxGeometry(0.55, 0.06, 0.18), toon(0x2f6b35), 0, -0.19, 0));
  } else if (kind === 'instaKill') {
    const bone = toon(0xf2efe6);
    const black = toon(0x111111);
    icon.add(mesh(new THREE.SphereGeometry(0.24, 16, 12), bone, 0, 0.05, 0));
    icon.add(mesh(new THREE.BoxGeometry(0.26, 0.14, 0.2), bone, 0, -0.18, 0.02));
    icon.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), black, -0.09, 0.07, 0.19));
    icon.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), black, 0.09, 0.07, 0.19));
    icon.add(mesh(new THREE.ConeGeometry(0.035, 0.07, 6), black, 0, -0.04, 0.22));
  } else {
    const yellow = toon(0xffd21f);
    const black = toon(0x1a1a1a);
    icon.add(mesh(new THREE.SphereGeometry(0.26, 18, 14), yellow));
    for (let i = 0; i < 3; i++) {
      const blade = mesh(new THREE.CylinderGeometry(0.16, 0.02, 0.06, 3, 1), black, 0, 0, 0.24);
      blade.rotation.set(Math.PI / 2, 0, (i * 2 * Math.PI) / 3);
      blade.position.set(Math.sin((i * 2 * Math.PI) / 3) * 0.1, Math.cos((i * 2 * Math.PI) / 3) * 0.1, 0.24);
      icon.add(blade);
    }
    icon.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), black, 0, 0, 0.26));
  }
  icon.position.y = 1.0;
  group.add(icon);
  return { group, icon };
}

/** The Mystery Box: wooden chest with gold trim, question marks and a blue light beam into the sky. */
export function createMysteryBox(): { group: THREE.Group; lid: THREE.Group; beam: THREE.Mesh } {
  const group = new THREE.Group();
  const wood = toon(0x6b3e1f);
  const darkWood = toon(0x4a2913);
  const gold = toon(0xe8b923);
  const mark = glow(0x9fd8ff);
  group.add(mesh(new THREE.BoxGeometry(1.1, 0.5, 0.55), wood, 0, 0.25, 0));
  for (const x of [-0.53, 0.53]) group.add(mesh(new THREE.BoxGeometry(0.06, 0.52, 0.58), gold, x, 0.25, 0));
  group.add(mesh(new THREE.BoxGeometry(1.14, 0.05, 0.58), gold, 0, 0.03, 0));
  // Question marks on both long sides, built from little blocks.
  for (const side of [-1, 1]) {
    const q = new THREE.Group();
    const blocks: Array<[number, number, number, number]> = [
      [0, 0.12, 0.14, 0.04], [0.06, 0.07, 0.04, 0.1], [0.02, 0.02, 0.08, 0.04], [0, -0.04, 0.04, 0.06], [0, -0.12, 0.05, 0.05],
    ];
    for (const [x, y, w, h] of blocks) q.add(mesh(new THREE.BoxGeometry(w, h, 0.01), mark, x, y, 0));
    q.position.set(0, 0.27, side * 0.281);
    if (side < 0) q.rotation.y = Math.PI;
    group.add(q);
  }
  const lid = new THREE.Group();
  lid.position.set(0, 0.5, -0.275);
  const top = mesh(new THREE.BoxGeometry(1.12, 0.12, 0.57), darkWood, 0, 0.06, 0.275);
  const trim = mesh(new THREE.BoxGeometry(1.14, 0.03, 0.59), gold, 0, 0.0, 0.275);
  lid.add(top, trim);
  group.add(lid);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 12, 18, 1, true), glow(0x6fb8ff, 0.16));
  beam.position.y = 6.5;
  group.add(beam);
  return { group, lid, beam };
}
