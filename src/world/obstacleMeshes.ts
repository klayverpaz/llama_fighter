import * as THREE from 'three';
import type { Obstacle } from './obstacles';

const toon = (color: number) => new THREE.MeshToonMaterial({ color });
const MATS = {
  wood: toon(0x9a6a3c),
  woodDark: toon(0x6e4a28),
  stone: toon(0x9c958a),
  stoneDark: toon(0x7c766c),
  moss: toon(0x6f8f45),
  rock: toon(0x857a68),
};

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

/** Visual for one obstacle, sitting on the island floor at its (x, z). */
export function createObstacleMesh(o: Obstacle): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.z);
  if (o.shape === 'box') {
    g.rotation.y = o.rot;
    if (o.kind === 'crate') {
      // One crate, or two stacked.
      const layers = o.h > 1.3 ? 2 : 1;
      const lh = o.h / layers;
      for (let i = 0; i < layers; i++) {
        const crate = new THREE.Group();
        crate.position.y = lh * i + lh / 2;
        crate.rotation.y = i * 0.25;
        crate.add(new THREE.Mesh(new THREE.BoxGeometry(o.w, lh, o.d), MATS.wood));
        // Dark frame planks on the edges and a diagonal brace.
        const t = 0.07;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(t, lh + 0.01, t), MATS.woodDark);
          post.position.set(sx * (o.w / 2 - t / 2 + 0.005), 0, sz * (o.d / 2 - t / 2 + 0.005));
          crate.add(post);
        }
        for (const sz of [-1, 1]) {
          const brace = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(o.w, lh) * 0.92, t, 0.02), MATS.woodDark);
          brace.position.z = sz * (o.d / 2 + 0.006);
          brace.rotation.z = Math.atan2(lh, o.w);
          crate.add(brace);
        }
        g.add(crate);
      }
    } else {
      // Low stone wall made of blocks.
      const blocks = Math.max(2, Math.round(o.w / 0.6));
      const bw = o.w / blocks;
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < blocks; i++) {
          const shift = row % 2 === 0 ? 0 : bw / 2;
          const x = -o.w / 2 + bw / 2 + i * bw + shift;
          if (x > o.w / 2) continue;
          const block = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.96, o.h / 2 * 0.94, o.d), (i + row) % 3 === 0 ? MATS.stoneDark : MATS.stone);
          block.position.set(Math.min(x, o.w / 2 - bw / 2), o.h / 4 + row * (o.h / 2), 0);
          g.add(block);
        }
      }
    }
  } else if (o.kind === 'pillar') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.92, o.r, o.h, 14), MATS.stone);
    shaft.position.y = o.h / 2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 1.15, o.r * 1.1, 0.18, 14), MATS.stoneDark);
    cap.position.y = o.h + 0.09;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 1.2, o.r * 1.25, 0.2, 14), MATS.stoneDark);
    base.position.y = 0.1;
    const moss = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 1.17, o.r * 1.17, 0.06, 14), MATS.moss);
    moss.position.y = o.h + 0.2;
    g.add(shaft, cap, base, moss);
  } else {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), MATS.rock);
    rock.scale.set(o.r * 1.05, o.h * 0.6, o.r * 1.05);
    rock.position.y = o.h * 0.45;
    rock.rotation.y = o.x * 3;
    const moss = new THREE.Mesh(new THREE.SphereGeometry(o.r * 0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), MATS.moss);
    moss.position.y = o.h * 0.88;
    moss.scale.y = 0.35;
    g.add(rock, moss);
  }
  return shadowed(g);
}
