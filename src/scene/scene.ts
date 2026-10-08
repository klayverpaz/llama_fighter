import * as THREE from 'three';
import type { Atmosphere } from '../modes/zombieTypes';
import { ARENA } from '../world/arena';

export interface SceneSetup {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  resize(): void;
  /** Sky, fog, light colours and the blood moon (zombie waves get darker). */
  setAtmosphere(a: Atmosphere): void;
}

/** `lowPower` (phones): lower pixel ratio and shadow resolution. */
export function createScene(container: HTMLElement, lowPower = false): SceneSetup {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3eee2);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 3, -6);
  camera.lookAt(0, 1, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2));
  container.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xcbbfa3, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.far = 60;
  scene.add(sun);

  // Floating island: grassy-sand top, rocky sides, a jagged underside of earth hanging into the void.
  const R = ARENA.radius;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R, 72), new THREE.MeshToonMaterial({ color: 0xece5d3 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.97, ARENA.depth, 72, 1, true), new THREE.MeshToonMaterial({ color: 0x8a7a5e }));
  rim.position.y = -ARENA.depth / 2;
  scene.add(rim);
  const under = new THREE.Mesh(new THREE.ConeGeometry(R * 0.97, 14, 40, 4), new THREE.MeshToonMaterial({ color: 0x5e4f3a }));
  under.rotation.x = Math.PI;
  under.position.y = -ARENA.depth - 7;
  // Lumpy underside.
  const pos = under.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 6.9) {
      pos.setX(i, pos.getX(i) * (0.85 + Math.random() * 0.3));
      pos.setZ(i, pos.getZ(i) * (0.85 + Math.random() * 0.3));
    }
  }
  under.geometry.computeVertexNormals();
  scene.add(under);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 8, 96), new THREE.MeshToonMaterial({ color: 0x6f6350 }));
  edge.rotation.x = Math.PI / 2;
  edge.position.y = -0.05;
  scene.add(edge);
  // Little rocks drifting in the void around the island.
  const rockMat = new THREE.MeshToonMaterial({ color: 0x7a6a52 });
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = R + 6 + Math.random() * 30;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + Math.random() * 1.8), rockMat);
    rock.position.set(Math.sin(a) * d, -4 - Math.random() * 18, Math.cos(a) * d);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    scene.add(rock);
  }

  const grid = new THREE.PolarGridHelper(R, 24, 12, 96, 0xc9bf9f, 0xded5bd);
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.5;
  grid.position.y = 0.01;
  scene.add(grid);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(9.9, 10.1, 96),
    new THREE.MeshBasicMaterial({ color: 0xb8aa84, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  scene.add(ring);

  // Blood moon low in the sky, with a soft glow; hidden by day.
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xd8342a, transparent: true, opacity: 0, fog: false });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 20), moonMat);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 20), haloMat);
  moon.position.set(-60, 38, 110);
  halo.position.copy(moon.position);
  moon.visible = halo.visible = false;
  scene.add(moon, halo);
  scene.fog = new THREE.Fog(0xf3eee2, 60, 140);

  function setAtmosphere(a: Atmosphere) {
    (scene.background as THREE.Color).setHex(a.sky);
    const fog = scene.fog as THREE.Fog;
    fog.color.setHex(a.fog);
    fog.near = a.fogNear;
    fog.far = a.fogFar;
    sun.color.setHex(a.sun);
    sun.intensity = a.sunIntensity;
    hemi.color.setHex(a.hemiSky);
    hemi.groundColor.setHex(a.hemiGround);
    hemi.intensity = a.hemiIntensity;
    moonMat.opacity = a.moon;
    haloMat.opacity = a.moon * 0.18;
    moon.visible = halo.visible = a.moon > 0.01;
    // The grid and the arena ring would glow white in the dark: fade them out at night.
    gridMat.opacity = 0.5 * (1 - 0.75 * a.moon);
    (ring.material as THREE.MeshBasicMaterial).color.setHex(a.moon > 0.5 ? 0x6a3a3a : 0xb8aa84);
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  resize();
  window.addEventListener('resize', resize);

  return { scene, camera, renderer, resize, setAtmosphere };
}
