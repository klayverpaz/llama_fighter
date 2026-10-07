# Kickboxing de Palito MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browser game where a third-person stick figure walks around and lands 7 kickboxing strikes on NPCs that follow it; NPCs lose HP, ragdoll on KO, settle, get up and resume.

**Architecture:** Every figure is 11 Rapier rigid bodies joined by spherical/revolute joints, each drawn as a Three.js capsule. Standing figures are kinematic and driven by a hand-authored keyframe animator through forward kinematics; a KO flips the bodies to dynamic (ragdoll) with the strike impulse. Pure modules (FK, animation sampling, attack state machine, damage, NPC steering) have no Rapier dependency and are tested in Node with vitest; Figure/physics integration gets Node smoke tests with real Rapier; visuals are validated by playing.

**Tech Stack:** Vite 8, TypeScript 5.9, three 0.186, @dimforge/rapier3d-compat 0.21, vitest 5. No backend, no UI framework.

**Spec:** `docs/superpowers/specs/2026-10-07-kickboxing-mvp-design.md`

## Global Constraints

- Project root is `/Users/klayver/projects/fun/kickboxing` (git repo already initialized, spec committed).
- Node 25, npm 11. Use `npm` (not pnpm) so a single lockfile exists.
- `package.json` is `"type": "module"`. Tests are colocated as `src/**/*.test.ts`, run with `npm test` (`vitest run`). `npm run typecheck` (`tsc --noEmit`) must pass at every commit.
- Pure modules (`core/loop.ts`, `core/math.ts`, `figure/fk.ts`, `figure/skeleton.ts`, `anim/*`, `combat/strikes.ts`, `combat/attack.ts`, `combat/damage.ts`, `entities/npcBrain.ts`, `camera/thirdPerson.ts` pure helpers, `ui/params.ts`) may import math classes from `three` (they run in Node) but never `@dimforge/rapier3d-compat`, `WebGLRenderer`, or DOM.
- Coordinate convention (fixed, used everywhere): Y up. A figure at yaw 0 faces **+Z**; its **left** side is **+X**. `forward(yaw) = (sin yaw, 0, cos yaw)`. Segment capsules run along local Y; limbs hang toward local −Y in the rest pose. Joint rotation = rotation of the child segment relative to its parent, identity = rest pose (standing straight, arms down).
- Physics step is a fixed 1/60 s. `world.step` must always be called as `world.step(eventQueue, hooks)` with a real `EventQueue`: the self-collision filter hook is silently ignored when the event queue is omitted (verified on 0.21).
- Rapier 0.21 quirk: a joint created from `JointData.spherical` is typed as `GenericImpulseJoint` and exposes no motor API. Spherical "soft limits" are configured through `rawSet.jointConfigureMotorPosition` (see Task 6 helper). Revolute joints are typed correctly and use `setLimits`.
- Tunables (lengths, masses, damping, spring stiffness, strike numbers, NPC distances) live only in `figure/skeleton.ts`, `combat/strikes.ts` and `entities/npcBrain.ts`. Spec values adjusted here on purpose: NPC hold distance 1.0 m / resume 1.4 m (spec said 1.3 / 1.8, but punch reach is ~0.9 m); strike hit radius 0.22 m.
- Commit after every task with a conventional message in Portuguese (`feat:`, `test:`, `chore:`), ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Local commits are pre-authorized; never push.
- Language: UI copy in Portuguese (pt-BR); code identifiers and comments in English.

## Review Focus

1. Pressing a strike key while a strike is in progress must be ignored, not queued or restarted — pinned by `startAttack` test in Task 4.
2. One strike must count at most once per NPC even though the active window spans several physics ticks — pinned by `recordHit` test in Task 4 and the Game integration test in Task 9.
3. Hitting an NPC that is already ragdolled or recovering must do nothing (no HP change, no extra KO) — pinned by the Game integration test in Task 9.
4. `?npcs=` with garbage, 0, negative, or >20 must clamp to 1..20 and default to 5 — pinned by `parseNpcCount` tests in Task 10.
5. A ragdoll that keeps sliding/jittering and never drops below the settle speed must still get up (hard cap at 8 s) — pinned by `shouldRecover` tests in Task 5.
6. Tab hidden for a minute then shown must not run hundreds of physics steps — pinned by the fixed-stepper clamp test in Task 1.

---

### Task 1: Scaffold, fixed-step loop, empty scene

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`
- Create: `src/core/loop.ts`, `src/core/loop.test.ts`, `src/scene/scene.ts`, `src/main.ts`

**Interfaces:**
- Produces: `createFixedStepper(dt?: number, maxSteps?: number): FixedStepper` with `advance(elapsedSeconds, step: () => void): number` (returns steps run). `createScene(container: HTMLElement): SceneSetup` with `{ scene, camera, renderer, resize }`.

- [ ] **Step 1: Create package.json, tsconfig, vite config, gitignore**

`package.json`:
```json
{
  "name": "kickboxing",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@dimforge/rapier3d-compat": "^0.21.0",
    "three": "^0.186.1"
  },
  "devDependencies": {
    "@types/three": "^0.186.0",
    "typescript": "^5.9.0",
    "vite": "^8.3.3",
    "vitest": "^5.0.3"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "types": ["vite/client"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src", "vite.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: { open: false },
});
```

`.gitignore`:
```
node_modules
dist
.DS_Store
```

Run: `cd /Users/klayver/projects/fun/kickboxing && npm install`
Expected: installs without errors, `package-lock.json` created.

- [ ] **Step 2: Write the failing fixed-stepper test**

`src/core/loop.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createFixedStepper } from './loop';

describe('createFixedStepper', () => {
  it('runs one step for exactly one dt', () => {
    const s = createFixedStepper(1 / 60);
    let n = 0;
    expect(s.advance(1 / 60, () => n++)).toBe(1);
    expect(n).toBe(1);
  });

  it('accumulates small frames until a full dt is available', () => {
    const s = createFixedStepper(1 / 60);
    let n = 0;
    expect(s.advance(0.01, () => n++)).toBe(0);
    expect(s.advance(0.01, () => n++)).toBe(1);
    expect(n).toBe(1);
  });

  it('runs two steps for a 30fps frame', () => {
    const s = createFixedStepper(1 / 60);
    expect(s.advance(1 / 30, () => {})).toBe(2);
  });

  it('clamps a huge elapsed time to maxSteps and drops the remainder', () => {
    const s = createFixedStepper(1 / 60, 5);
    expect(s.advance(60, () => {})).toBe(5);
    expect(s.advance(0.001, () => {})).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/core/loop.test.ts`
Expected: FAIL, cannot resolve `./loop`.

- [ ] **Step 4: Implement loop.ts**

`src/core/loop.ts`:
```ts
export interface FixedStepper {
  readonly dt: number;
  /** Feed elapsed wall-clock seconds; runs `step` zero or more times. Returns steps run. */
  advance(elapsed: number, step: () => void): number;
}

export function createFixedStepper(dt = 1 / 60, maxSteps = 5): FixedStepper {
  let acc = 0;
  return {
    dt,
    advance(elapsed, step) {
      acc += Math.min(Math.max(elapsed, 0), 0.25);
      let n = 0;
      while (acc >= dt && n < maxSteps) {
        step();
        acc -= dt;
        n++;
      }
      if (n === maxSteps) acc = 0;
      return n;
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/core/loop.test.ts`
Expected: 4 passed.

- [ ] **Step 6: Create index.html, scene.ts, main.ts**

`index.html`:
```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Kickboxing de Palito</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #f3eee2; font-family: ui-sans-serif, system-ui, sans-serif; }
      #app { position: fixed; inset: 0; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/scene/scene.ts`:
```ts
import * as THREE from 'three';

export interface SceneSetup {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  resize(): void;
}

export function createScene(container: HTMLElement): SceneSetup {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3eee2);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 3, -6);
  camera.lookAt(0, 1, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xcbbfa3, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.far = 60;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshToonMaterial({ color: 0xece5d3 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(60, 60, 0xc9bf9f, 0xded5bd);
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

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  resize();
  window.addEventListener('resize', resize);

  return { scene, camera, renderer, resize };
}
```

`src/main.ts` (temporary; replaced in Tasks 8 and 10):
```ts
import { createScene } from './scene/scene';

const app = document.getElementById('app')!;
const { scene, camera, renderer } = createScene(app);

function frame() {
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 7: Typecheck and smoke the dev server**

Run: `npm run typecheck`
Expected: no output (exit 0).

Run: `timeout 8 npm run dev -- --port 5173 2>&1 | head -5 || true`
Expected: Vite prints a local URL and exits by timeout without build errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite+three+rapier, loop de timestep fixo e cena base

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Skeleton definition and forward kinematics

**Files:**
- Create: `src/figure/skeleton.ts`, `src/figure/fk.ts`, `src/figure/fk.test.ts`

**Interfaces:**
- Produces (`skeleton.ts`): `SegmentName`, `JointName`, `Limb`, `SegmentDef`, `SEGMENTS: SegmentDef[]` (parent-first order), `SEGMENT_NAMES`, `JOINT_NAMES`, `PELVIS_HEIGHT = 0.96`, `LIMB_ENDS: Record<Limb, { segment: SegmentName; local: Vector3 }>`, `BODY_TUNING`.
- Produces (`fk.ts`): `JointRots`, `RootTransform`, `Pose`, `SegmentTransform`, `SegmentTransforms`, `identityJointRots()`, `yawQuaternion(yaw)`, `yawFromQuaternion(q)`, `forwardKinematics(pose)`, `jointRotsFromTransforms(t)`, `localToWorld(t, local)`.

- [ ] **Step 1: Write skeleton.ts**

`src/figure/skeleton.ts`:
```ts
import { Vector3 } from 'three';

export type SegmentName =
  | 'pelvis' | 'torso' | 'head'
  | 'upperArmL' | 'lowerArmL' | 'upperArmR' | 'lowerArmR'
  | 'upperLegL' | 'lowerLegL' | 'upperLegR' | 'lowerLegR';

export type JointName =
  | 'spine' | 'neck'
  | 'shoulderL' | 'elbowL' | 'shoulderR' | 'elbowR'
  | 'hipL' | 'kneeL' | 'hipR' | 'kneeR';

export type Limb = 'handL' | 'handR' | 'footL' | 'footR';

export type JointKind =
  | { kind: 'spherical'; springStiffness: number; springDamping: number }
  | { kind: 'revolute'; axis: Vector3; limits: [number, number] };

export interface SegmentDef {
  name: SegmentName;
  parent: SegmentName | null;
  joint: JointName | null;
  /** Capsule cylinder length along local Y (0 = ball). */
  length: number;
  radius: number;
  mass: number;
  /** Joint position in the parent's local frame. */
  parentAnchor: Vector3;
  /** Joint position in this segment's local frame. */
  selfAnchor: Vector3;
  jointKind: JointKind | null;
}

const X = new Vector3(1, 0, 0);
const soft = (k: number, d: number): JointKind => ({ kind: 'spherical', springStiffness: k, springDamping: d });
const hinge = (limits: [number, number]): JointKind => ({ kind: 'revolute', axis: X.clone(), limits });

/** Pelvis center height when standing. */
export const PELVIS_HEIGHT = 0.96;

/** Parent-first order: FK walks this array top to bottom. */
export const SEGMENTS: SegmentDef[] = [
  { name: 'pelvis', parent: null, joint: null, length: 0.15, radius: 0.08, mass: 10,
    parentAnchor: new Vector3(), selfAnchor: new Vector3(), jointKind: null },
  { name: 'torso', parent: 'pelvis', joint: 'spine', length: 0.5, radius: 0.1, mass: 20,
    parentAnchor: new Vector3(0, 0.075, 0), selfAnchor: new Vector3(0, -0.25, 0), jointKind: soft(40, 4) },
  { name: 'head', parent: 'torso', joint: 'neck', length: 0, radius: 0.12, mass: 4,
    parentAnchor: new Vector3(0, 0.27, 0), selfAnchor: new Vector3(0, -0.14, 0), jointKind: soft(15, 1.5) },
  { name: 'upperArmL', parent: 'torso', joint: 'shoulderL', length: 0.3, radius: 0.04, mass: 2.5,
    parentAnchor: new Vector3(0.2, 0.22, 0), selfAnchor: new Vector3(0, 0.15, 0), jointKind: soft(10, 1) },
  { name: 'lowerArmL', parent: 'upperArmL', joint: 'elbowL', length: 0.28, radius: 0.035, mass: 1.5,
    parentAnchor: new Vector3(0, -0.15, 0), selfAnchor: new Vector3(0, 0.14, 0), jointKind: hinge([-2.4, 0]) },
  { name: 'upperArmR', parent: 'torso', joint: 'shoulderR', length: 0.3, radius: 0.04, mass: 2.5,
    parentAnchor: new Vector3(-0.2, 0.22, 0), selfAnchor: new Vector3(0, 0.15, 0), jointKind: soft(10, 1) },
  { name: 'lowerArmR', parent: 'upperArmR', joint: 'elbowR', length: 0.28, radius: 0.035, mass: 1.5,
    parentAnchor: new Vector3(0, -0.15, 0), selfAnchor: new Vector3(0, 0.14, 0), jointKind: hinge([-2.4, 0]) },
  { name: 'upperLegL', parent: 'pelvis', joint: 'hipL', length: 0.42, radius: 0.05, mass: 7,
    parentAnchor: new Vector3(0.1, -0.075, 0), selfAnchor: new Vector3(0, 0.21, 0), jointKind: soft(20, 2) },
  { name: 'lowerLegL', parent: 'upperLegL', joint: 'kneeL', length: 0.42, radius: 0.045, mass: 4,
    parentAnchor: new Vector3(0, -0.21, 0), selfAnchor: new Vector3(0, 0.21, 0), jointKind: hinge([0, 2.4]) },
  { name: 'upperLegR', parent: 'pelvis', joint: 'hipR', length: 0.42, radius: 0.05, mass: 7,
    parentAnchor: new Vector3(-0.1, -0.075, 0), selfAnchor: new Vector3(0, 0.21, 0), jointKind: soft(20, 2) },
  { name: 'lowerLegR', parent: 'upperLegR', joint: 'kneeR', length: 0.42, radius: 0.045, mass: 4,
    parentAnchor: new Vector3(0, -0.21, 0), selfAnchor: new Vector3(0, 0.21, 0), jointKind: hinge([0, 2.4]) },
];

export const SEGMENT_NAMES: SegmentName[] = SEGMENTS.map((s) => s.name);
export const JOINT_NAMES: JointName[] = SEGMENTS.flatMap((s) => (s.joint ? [s.joint] : []));

export function segmentDef(name: SegmentName): SegmentDef {
  const def = SEGMENTS.find((s) => s.name === name);
  if (!def) throw new Error(`unknown segment ${name}`);
  return def;
}

/** Where hands and feet are, in the local frame of the segment that owns them. */
export const LIMB_ENDS: Record<Limb, { segment: SegmentName; local: Vector3 }> = {
  handL: { segment: 'lowerArmL', local: new Vector3(0, -0.14, 0) },
  handR: { segment: 'lowerArmR', local: new Vector3(0, -0.14, 0) },
  footL: { segment: 'lowerLegL', local: new Vector3(0, -0.21, 0) },
  footR: { segment: 'lowerLegR', local: new Vector3(0, -0.21, 0) },
};

export const BODY_TUNING = {
  linearDamping: 0.5,
  angularDamping: 3,
  friction: 0.8,
  restitution: 0.05,
};
```

- [ ] **Step 2: Write the failing FK tests**

`src/figure/fk.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Quaternion, Vector3, Euler } from 'three';
import {
  forwardKinematics, identityJointRots, yawQuaternion, yawFromQuaternion,
  jointRotsFromTransforms, localToWorld, type Pose,
} from './fk';
import { PELVIS_HEIGHT, LIMB_ENDS, JOINT_NAMES } from './skeleton';

function restPose(yaw = 0): Pose {
  return {
    root: { position: new Vector3(0, PELVIS_HEIGHT, 0), rotation: yawQuaternion(yaw) },
    joints: identityJointRots(),
  };
}

describe('forwardKinematics', () => {
  it('stacks torso and head above the pelvis in the rest pose', () => {
    const t = forwardKinematics(restPose());
    expect(t.torso.position.y).toBeCloseTo(PELVIS_HEIGHT + 0.075 + 0.25, 5);
    expect(t.head.position.y).toBeCloseTo(PELVIS_HEIGHT + 0.075 + 0.25 + 0.27 + 0.14, 5);
    expect(t.torso.position.x).toBeCloseTo(0, 5);
  });

  it('puts the left foot near the ground on the +X side', () => {
    const t = forwardKinematics(restPose());
    const foot = localToWorld(t.lowerLegL, LIMB_ENDS.footL.local);
    expect(foot.y).toBeCloseTo(PELVIS_HEIGHT - 0.075 - 0.42 - 0.42, 5);
    expect(foot.x).toBeCloseTo(0.1, 5);
  });

  it('bending the left elbow moves only the left forearm, forward (+Z)', () => {
    const pose = restPose();
    pose.joints.elbowL = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
    const t = forwardKinematics(pose);
    const rest = forwardKinematics(restPose());
    const hand = localToWorld(t.lowerArmL, LIMB_ENDS.handL.local);
    expect(hand.z).toBeCloseTo(0.28, 4);
    expect(t.upperArmL.position.distanceTo(rest.upperArmL.position)).toBeCloseTo(0, 6);
    expect(t.lowerArmR.position.distanceTo(rest.lowerArmR.position)).toBeCloseTo(0, 6);
  });

  it('yaw of +90deg turns the left shoulder from +X to -Z', () => {
    const t = forwardKinematics(restPose(Math.PI / 2));
    expect(t.upperArmL.position.x).toBeCloseTo(0, 5);
    expect(t.upperArmL.position.z).toBeCloseTo(-0.2, 5);
  });

  it('jointRotsFromTransforms inverts forwardKinematics', () => {
    const pose = restPose(0.7);
    pose.joints.kneeR = new Quaternion().setFromEuler(new Euler(1.1, 0, 0));
    pose.joints.shoulderL = new Quaternion().setFromEuler(new Euler(-1.3, 0.2, -0.25));
    const back = jointRotsFromTransforms(forwardKinematics(pose));
    for (const j of JOINT_NAMES) {
      expect(Math.abs(back[j].dot(pose.joints[j]))).toBeCloseTo(1, 5);
    }
  });
});

describe('yaw helpers', () => {
  it('yawFromQuaternion round-trips yawQuaternion', () => {
    for (const yaw of [0, 0.5, -2.0, 3.0]) {
      const back = yawFromQuaternion(yawQuaternion(yaw));
      expect(Math.atan2(Math.sin(back - yaw), Math.cos(back - yaw))).toBeCloseTo(0, 5);
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/figure/fk.test.ts`
Expected: FAIL, cannot resolve `./fk`.

- [ ] **Step 4: Implement fk.ts**

`src/figure/fk.ts`:
```ts
import { Quaternion, Vector3 } from 'three';
import { SEGMENTS, JOINT_NAMES, type JointName, type SegmentName, segmentDef } from './skeleton';

export type JointRots = Record<JointName, Quaternion>;

export interface RootTransform {
  position: Vector3;
  rotation: Quaternion;
}

export interface Pose {
  root: RootTransform;
  joints: JointRots;
}

export interface SegmentTransform {
  position: Vector3;
  rotation: Quaternion;
}

export type SegmentTransforms = Record<SegmentName, SegmentTransform>;

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);

export function identityJointRots(): JointRots {
  const out = {} as JointRots;
  for (const j of JOINT_NAMES) out[j] = new Quaternion();
  return out;
}

export function cloneJointRots(rots: JointRots): JointRots {
  const out = {} as JointRots;
  for (const j of JOINT_NAMES) out[j] = rots[j].clone();
  return out;
}

export function yawQuaternion(yaw: number): Quaternion {
  return new Quaternion().setFromAxisAngle(UP, yaw);
}

/** Heading of the rotated +Z axis projected on the ground; 0 if it points straight up/down. */
export function yawFromQuaternion(q: Quaternion): number {
  const f = FORWARD.clone().applyQuaternion(q);
  if (f.x * f.x + f.z * f.z < 1e-4) return 0;
  return Math.atan2(f.x, f.z);
}

export function localToWorld(t: SegmentTransform, local: Vector3): Vector3 {
  return local.clone().applyQuaternion(t.rotation).add(t.position);
}

export function forwardKinematics(pose: Pose): SegmentTransforms {
  const out = {} as SegmentTransforms;
  for (const seg of SEGMENTS) {
    if (seg.parent === null || seg.joint === null) {
      out[seg.name] = { position: pose.root.position.clone(), rotation: pose.root.rotation.clone() };
      continue;
    }
    const parent = out[seg.parent];
    const jointWorld = seg.parentAnchor.clone().applyQuaternion(parent.rotation).add(parent.position);
    const rotation = parent.rotation.clone().multiply(pose.joints[seg.joint]);
    const position = jointWorld.sub(seg.selfAnchor.clone().applyQuaternion(rotation));
    out[seg.name] = { position, rotation };
  }
  return out;
}

/** Recover joint rotations from world transforms: q_joint = inverse(parentRot) * childRot. */
export function jointRotsFromTransforms(t: SegmentTransforms): JointRots {
  const out = identityJointRots();
  for (const seg of SEGMENTS) {
    if (seg.parent === null || seg.joint === null) continue;
    const parentRot = t[seg.parent].rotation;
    out[seg.joint] = parentRot.clone().invert().multiply(t[seg.name].rotation).normalize();
  }
  return out;
}

export function segmentLength(name: SegmentName): number {
  return segmentDef(name).length;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/figure/fk.test.ts && npm run typecheck`
Expected: 6 passed; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/figure
git commit -m "feat: esqueleto de 11 segmentos e cinemática direta

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Animation engine (clip sampling, walk layer, animator) and the stance clip

**Files:**
- Create: `src/anim/clip.ts`, `src/anim/clip.test.ts`, `src/anim/walk.ts`, `src/anim/clips.ts`, `src/anim/animator.ts`, `src/anim/animator.test.ts`

**Interfaces:**
- Consumes: `JointName`, `JOINT_NAMES` from `figure/skeleton`; `JointRots`, `identityJointRots`, `cloneJointRots` from `figure/fk`.
- Produces: `EulerXYZ`, `JointEulers`, `Keyframe`, `Clip`, `PartialJointRots`, `eulerToQuat(e)`, `sampleClip(clip, time)`, `walkLayer(phase, intensity)`, `GUARD: JointEulers`, `STANCE: Clip`, `class Animator { constructor(base: Clip); play(clip, blendSeconds?); blendFromRots(rots, seconds); update(dt, moveSpeed?): JointRots; get actionName(): string | null }`.

- [ ] **Step 1: Write the failing clip tests**

`src/anim/clip.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Quaternion, Euler } from 'three';
import { sampleClip, eulerToQuat, type Clip } from './clip';

const clip: Clip = {
  name: 'test',
  duration: 1,
  loop: false,
  keyframes: [
    { t: 0, joints: { elbowL: [0, 0, 0] } },
    { t: 1, joints: { elbowL: [-1, 0, 0], kneeR: [0.5, 0, 0] } },
  ],
};

describe('sampleClip', () => {
  it('returns the first keyframe value at t=0', () => {
    const r = sampleClip(clip, 0);
    expect(r.elbowL!.angleTo(new Quaternion())).toBeCloseTo(0, 5);
  });

  it('slerps halfway between two keyframes', () => {
    const r = sampleClip(clip, 0.5);
    expect(r.elbowL!.angleTo(new Quaternion())).toBeCloseTo(0.5, 4);
  });

  it('a joint defined in only one keyframe holds that value', () => {
    const r = sampleClip(clip, 0.2);
    expect(r.kneeR!.angleTo(eulerToQuat([0.5, 0, 0]))).toBeCloseTo(0, 5);
  });

  it('clamps past the end when not looping', () => {
    const r = sampleClip(clip, 5);
    expect(r.elbowL!.angleTo(eulerToQuat([-1, 0, 0]))).toBeCloseTo(0, 5);
  });

  it('wraps time when looping', () => {
    const r = sampleClip({ ...clip, loop: true }, 1.5);
    expect(r.elbowL!.angleTo(new Quaternion())).toBeCloseTo(0.5, 4);
  });

  it('omits joints the clip never mentions', () => {
    expect(sampleClip(clip, 0.3).shoulderL).toBeUndefined();
  });

  it('eulerToQuat uses XYZ order in radians', () => {
    const q = eulerToQuat([0.3, -0.2, 0.1]);
    expect(q.angleTo(new Quaternion().setFromEuler(new Euler(0.3, -0.2, 0.1, 'XYZ')))).toBeCloseTo(0, 6);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/anim/clip.test.ts`
Expected: FAIL, cannot resolve `./clip`.

- [ ] **Step 3: Implement clip.ts**

`src/anim/clip.ts`:
```ts
import { Euler, Quaternion } from 'three';
import { JOINT_NAMES, type JointName } from '../figure/skeleton';

/** Radians, applied in XYZ order. */
export type EulerXYZ = [number, number, number];
export type JointEulers = Partial<Record<JointName, EulerXYZ>>;

export interface Keyframe {
  t: number;
  joints: JointEulers;
}

export interface Clip {
  name: string;
  duration: number;
  loop: boolean;
  /** Sorted by t ascending. */
  keyframes: Keyframe[];
}

export type PartialJointRots = Partial<Record<JointName, Quaternion>>;

export function eulerToQuat(e: EulerXYZ): Quaternion {
  return new Quaternion().setFromEuler(new Euler(e[0], e[1], e[2], 'XYZ'));
}

function clipTime(clip: Clip, time: number): number {
  if (clip.duration <= 0) return 0;
  if (clip.loop) {
    const t = time % clip.duration;
    return t < 0 ? t + clip.duration : t;
  }
  return Math.min(Math.max(time, 0), clip.duration);
}

/** Per joint, interpolate between the nearest keyframes that define that joint. */
export function sampleClip(clip: Clip, time: number): PartialJointRots {
  const t = clipTime(clip, time);
  const out: PartialJointRots = {};
  for (const joint of JOINT_NAMES) {
    let before: Keyframe | null = null;
    let after: Keyframe | null = null;
    for (const kf of clip.keyframes) {
      if (kf.joints[joint] === undefined) continue;
      if (kf.t <= t) before = kf;
      if (kf.t >= t && after === null) after = kf;
    }
    if (!before && !after) continue;
    if (!before) { out[joint] = eulerToQuat(after!.joints[joint]!); continue; }
    if (!after || after === before || after.t === before.t) { out[joint] = eulerToQuat(before.joints[joint]!); continue; }
    const k = (t - before.t) / (after.t - before.t);
    out[joint] = eulerToQuat(before.joints[joint]!).slerp(eulerToQuat(after.joints[joint]!), k);
  }
  return out;
}
```

- [ ] **Step 4: Run clip tests**

Run: `npm test -- src/anim/clip.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Write walk.ts and clips.ts (stance)**

`src/anim/walk.ts`:
```ts
import { eulerToQuat, type PartialJointRots } from './clip';

const HIP_SWING = 0.5;
const KNEE_BEND = 0.8;

/**
 * Procedural leg cycle layered over the stance. `phase` in radians, `intensity` 0..1.
 * Positive hip X rotation swings the leg backward; the knee bends while the leg is back.
 */
export function walkLayer(phase: number, intensity: number): PartialJointRots {
  if (intensity <= 0) return {};
  const s = Math.sin(phase) * intensity;
  return {
    hipL: eulerToQuat([HIP_SWING * s, 0, 0.08]),
    hipR: eulerToQuat([-HIP_SWING * s, 0, -0.08]),
    kneeL: eulerToQuat([KNEE_BEND * Math.max(0, s), 0, 0]),
    kneeR: eulerToQuat([KNEE_BEND * Math.max(0, -s), 0, 0]),
  };
}

/** Phase advance per second at a given ground speed (one full cycle per ~1.4 m). */
export function walkPhaseRate(speed: number): number {
  return (2 * Math.PI * speed) / 1.4;
}
```

`src/anim/clips.ts`:
```ts
import type { Clip, JointEulers } from './clip';

/** Guard: fists up by the chin, elbows tucked, slight lean, left foot forward. */
export const GUARD: JointEulers = {
  spine: [0.1, 0, 0],
  neck: [0.05, 0, 0],
  shoulderL: [-1.3, 0, -0.25],
  elbowL: [-2.0, 0, 0],
  shoulderR: [-1.3, 0, 0.25],
  elbowR: [-2.0, 0, 0],
  hipL: [-0.35, 0, 0.08],
  kneeL: [0.35, 0, 0],
  hipR: [0.1, 0, -0.08],
  kneeR: [0.25, 0, 0],
};

export const STANCE: Clip = {
  name: 'stance',
  duration: 2,
  loop: true,
  keyframes: [
    { t: 0, joints: GUARD },
    { t: 1, joints: { ...GUARD, spine: [0.14, 0, 0], shoulderL: [-1.25, 0, -0.25], shoulderR: [-1.25, 0, 0.25] } },
    { t: 2, joints: GUARD },
  ],
};
```

- [ ] **Step 6: Write the failing animator tests**

`src/anim/animator.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Quaternion } from 'three';
import { Animator } from './animator';
import { STANCE, GUARD } from './clips';
import { eulerToQuat, type Clip } from './clip';
import { identityJointRots } from '../figure/fk';

const punch: Clip = {
  name: 'punch',
  duration: 0.4,
  loop: false,
  keyframes: [
    { t: 0, joints: { shoulderL: GUARD.shoulderL! } },
    { t: 0.2, joints: { shoulderL: [-1.57, 0, 0] } },
    { t: 0.4, joints: { shoulderL: GUARD.shoulderL! } },
  ],
};

describe('Animator', () => {
  it('outputs the stance when idle', () => {
    const a = new Animator(STANCE);
    const r = a.update(0);
    expect(r.elbowL.angleTo(eulerToQuat(GUARD.elbowL!))).toBeCloseTo(0, 5);
    expect(r.kneeL.angleTo(eulerToQuat(GUARD.kneeL!))).toBeCloseTo(0, 5);
  });

  it('plays an action over the stance and reports its name until it ends', () => {
    const a = new Animator(STANCE);
    a.update(0);
    a.play(punch, 0);
    expect(a.actionName).toBe('punch');
    a.update(0.2);
    const r = a.update(0);
    expect(r.shoulderL.angleTo(eulerToQuat([-1.57, 0, 0]))).toBeCloseTo(0, 3);
    expect(r.elbowR.angleTo(eulerToQuat(GUARD.elbowR!))).toBeCloseTo(0, 5);
    a.update(0.25);
    expect(a.actionName).toBeNull();
  });

  it('blends from captured rotations toward the target over the given time', () => {
    const a = new Animator(STANCE);
    a.update(0);
    a.blendFromRots(identityJointRots(), 1);
    const start = a.update(0);
    expect(start.elbowL.angleTo(new Quaternion())).toBeCloseTo(0, 4);
    const half = a.update(0.5);
    expect(half.elbowL.angleTo(new Quaternion())).toBeCloseTo(1.0, 2);
    const end = a.update(0.6);
    expect(end.elbowL.angleTo(eulerToQuat(GUARD.elbowL!))).toBeCloseTo(0, 4);
  });

  it('moves the hips when walking and not when standing', () => {
    const a = new Animator(STANCE);
    a.update(0);
    const standing = a.update(0.1, 0).hipL.clone();
    for (let i = 0; i < 20; i++) a.update(0.05, 3);
    const walking = a.update(0.05, 3).hipL;
    expect(walking.angleTo(standing)).toBeGreaterThan(0.05);
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `npm test -- src/anim/animator.test.ts`
Expected: FAIL, cannot resolve `./animator`.

- [ ] **Step 8: Implement animator.ts**

`src/anim/animator.ts`:
```ts
import { JOINT_NAMES } from '../figure/skeleton';
import { cloneJointRots, identityJointRots, type JointRots } from '../figure/fk';
import { sampleClip, type Clip, type PartialJointRots } from './clip';
import { walkLayer, walkPhaseRate } from './walk';

interface Action { clip: Clip; time: number }
interface Blend { from: JointRots; t: number; duration: number }

function overlay(target: JointRots, layer: PartialJointRots): void {
  for (const j of JOINT_NAMES) {
    const q = layer[j];
    if (q) target[j].copy(q);
  }
}

export class Animator {
  private baseTime = 0;
  private action: Action | null = null;
  private blend: Blend | null = null;
  private walkPhase = 0;
  private walkIntensity = 0;
  private current: JointRots = identityJointRots();

  constructor(private readonly base: Clip) {}

  get actionName(): string | null {
    return this.action?.clip.name ?? null;
  }

  /** Start a one-shot clip layered over the base, blending from the current output. */
  play(clip: Clip, blendSeconds = 0.1): void {
    this.action = { clip, time: 0 };
    if (blendSeconds > 0) this.blendFromRots(this.current, blendSeconds);
    else this.blend = null;
  }

  /** Blend from arbitrary rotations (e.g. read back from a ragdoll) to the animated target. */
  blendFromRots(rots: JointRots, seconds: number): void {
    this.blend = { from: cloneJointRots(rots), t: 0, duration: Math.max(seconds, 1e-3) };
  }

  update(dt: number, moveSpeed = 0): JointRots {
    this.baseTime += dt;
    const target = identityJointRots();
    overlay(target, sampleClip(this.base, this.baseTime));

    const wantIntensity = this.action ? 0 : Math.min(1, moveSpeed / 3);
    this.walkIntensity += (wantIntensity - this.walkIntensity) * Math.min(1, dt * 10);
    this.walkPhase += dt * walkPhaseRate(moveSpeed);
    overlay(target, walkLayer(this.walkPhase, this.walkIntensity));

    if (this.action) {
      this.action.time += dt;
      const { clip, time } = this.action;
      overlay(target, sampleClip(clip, time));
      if (!clip.loop && time >= clip.duration) this.action = null;
    }

    if (this.blend) {
      this.blend.t += dt;
      const k = Math.min(1, this.blend.t / this.blend.duration);
      for (const j of JOINT_NAMES) target[j] = this.blend.from[j].clone().slerp(target[j], k);
      if (k >= 1) this.blend = null;
    }

    this.current = target;
    return cloneJointRots(target);
  }
}
```

- [ ] **Step 9: Run all anim tests and typecheck**

Run: `npm test -- src/anim && npm run typecheck`
Expected: 11 passed; typecheck clean.

- [ ] **Step 10: Commit**

```bash
git add src/anim
git commit -m "feat: motor de animação por keyframes, camada de caminhada e postura de luta

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Strike table, attack state machine, damage

**Files:**
- Create: `src/combat/strikes.ts`, `src/combat/attack.ts`, `src/combat/damage.ts`, `src/combat/combat.test.ts`

**Interfaces:**
- Consumes: `Limb` from `figure/skeleton`; `yawQuaternion` from `figure/fk`.
- Produces: `StrikeName`, `StrikeDef`, `STRIKES`, `STRIKE_NAMES`, `KEY_TO_STRIKE`, `strikeDuration(def)`, `NPC_MAX_HP`; `AttackPhase`, `AttackState`, `createAttackState()`, `canAttack(s)`, `startAttack(s, name)`, `tickAttack(s, dt)`, `recordHit(s, targetId)`; `applyDamage(hp, def): { hp, knockedOut }`, `impulseVector(def, yaw): Vector3`.

- [ ] **Step 1: Write strikes.ts**

`src/combat/strikes.ts`:
```ts
import type { Limb } from '../figure/skeleton';

export type StrikeName = 'jab' | 'cross' | 'hookL' | 'hookR' | 'lowKick' | 'frontKick' | 'highKick';

export interface StrikeDef {
  name: StrikeName;
  /** KeyboardEvent.code */
  key: string;
  limb: Limb;
  damage: number;
  /** Impulse magnitude in N·s applied on KO. */
  impulse: number;
  startup: number;
  active: number;
  recovery: number;
  /** Direction in the attacker's local frame (x = left, y = up, z = forward); normalized at use. */
  direction: [number, number, number];
  /** Radius of the sphere swept at the hand/foot while active. */
  hitRadius: number;
}

export const NPC_MAX_HP = 50;

export const STRIKES: Record<StrikeName, StrikeDef> = {
  jab:       { name: 'jab',       key: 'KeyJ',  limb: 'handL', damage: 8,  impulse: 40,  startup: 0.08, active: 0.10, recovery: 0.15, direction: [0, 0.1, 1],      hitRadius: 0.22 },
  cross:     { name: 'cross',     key: 'KeyK',  limb: 'handR', damage: 14, impulse: 70,  startup: 0.12, active: 0.10, recovery: 0.22, direction: [0, 0.15, 1],     hitRadius: 0.22 },
  hookL:     { name: 'hookL',     key: 'KeyU',  limb: 'handL', damage: 18, impulse: 90,  startup: 0.16, active: 0.10, recovery: 0.26, direction: [-0.5, 0.35, 1],  hitRadius: 0.22 },
  hookR:     { name: 'hookR',     key: 'KeyI',  limb: 'handR', damage: 18, impulse: 90,  startup: 0.16, active: 0.10, recovery: 0.26, direction: [0.5, 0.35, 1],   hitRadius: 0.22 },
  lowKick:   { name: 'lowKick',   key: 'KeyN',  limb: 'footR', damage: 15, impulse: 60,  startup: 0.18, active: 0.12, recovery: 0.30, direction: [0.3, -0.2, 1],   hitRadius: 0.22 },
  frontKick: { name: 'frontKick', key: 'KeyM',  limb: 'footR', damage: 20, impulse: 110, startup: 0.20, active: 0.12, recovery: 0.32, direction: [0, 0.2, 1],      hitRadius: 0.22 },
  highKick:  { name: 'highKick',  key: 'Comma', limb: 'footR', damage: 30, impulse: 140, startup: 0.26, active: 0.12, recovery: 0.40, direction: [0.4, 0.5, 1],    hitRadius: 0.22 },
};

export const STRIKE_NAMES = Object.keys(STRIKES) as StrikeName[];

export const KEY_TO_STRIKE: Record<string, StrikeName> = Object.fromEntries(
  STRIKE_NAMES.map((n) => [STRIKES[n].key, n]),
) as Record<string, StrikeName>;

export function strikeDuration(def: StrikeDef): number {
  return def.startup + def.active + def.recovery;
}
```

- [ ] **Step 2: Write the failing combat tests**

`src/combat/combat.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { STRIKES, STRIKE_NAMES, KEY_TO_STRIKE, strikeDuration, NPC_MAX_HP } from './strikes';
import { createAttackState, canAttack, startAttack, tickAttack, recordHit } from './attack';
import { applyDamage, impulseVector } from './damage';

describe('strikes table', () => {
  it('maps every key to exactly one strike', () => {
    expect(Object.keys(KEY_TO_STRIKE)).toHaveLength(STRIKE_NAMES.length);
    expect(KEY_TO_STRIKE['Comma']).toBe('highKick');
    expect(KEY_TO_STRIKE['KeyJ']).toBe('jab');
  });

  it('has positive numbers everywhere', () => {
    for (const n of STRIKE_NAMES) {
      const s = STRIKES[n];
      for (const v of [s.damage, s.impulse, s.startup, s.active, s.recovery, s.hitRadius]) expect(v).toBeGreaterThan(0);
      expect(s.direction[2]).toBeGreaterThan(0);
    }
  });
});

describe('attack state machine', () => {
  it('goes idle → startup → active → recovery → idle on the strike timings', () => {
    const jab = STRIKES.jab;
    let s = startAttack(createAttackState(), 'jab');
    expect(s.phase).toBe('startup');
    s = tickAttack(s, jab.startup + 0.001);
    expect(s.phase).toBe('active');
    s = tickAttack(s, jab.active);
    expect(s.phase).toBe('recovery');
    s = tickAttack(s, jab.recovery);
    expect(s.phase).toBe('idle');
    expect(s.strike).toBeNull();
  });

  it('ignores a new strike while one is in progress', () => {
    const s = startAttack(createAttackState(), 'cross');
    const again = startAttack(tickAttack(s, 0.05), 'jab');
    expect(again.strike).toBe('cross');
    expect(canAttack(again)).toBe(false);
  });

  it('canAttack only when idle', () => {
    expect(canAttack(createAttackState())).toBe(true);
    const s = startAttack(createAttackState(), 'highKick');
    const dur = strikeDuration(STRIKES.highKick);
    expect(canAttack(tickAttack(s, dur - 0.01))).toBe(false);
    expect(canAttack(tickAttack(s, dur + 0.01))).toBe(true);
  });

  it('records each target once and keeps hits through the active window', () => {
    let s = startAttack(createAttackState(), 'jab');
    s = tickAttack(s, STRIKES.jab.startup + 0.01);
    s = recordHit(s, 'npc-1');
    s = tickAttack(s, 0.02);
    expect(s.phase).toBe('active');
    expect(s.hit.has('npc-1')).toBe(true);
    expect(s.hit.has('npc-2')).toBe(false);
  });

  it('starts a fresh hit set for every new strike', () => {
    let s = recordHit(startAttack(createAttackState(), 'jab'), 'npc-1');
    s = tickAttack(s, 10);
    s = startAttack(s, 'jab');
    expect(s.hit.size).toBe(0);
  });
});

describe('damage', () => {
  it('seven jabs knock out a full-HP NPC, six do not', () => {
    let hp = NPC_MAX_HP;
    for (let i = 0; i < 6; i++) {
      const r = applyDamage(hp, STRIKES.jab);
      hp = r.hp;
      expect(r.knockedOut).toBe(false);
    }
    const r = applyDamage(hp, STRIKES.jab);
    expect(r.knockedOut).toBe(true);
    expect(r.hp).toBe(0);
  });

  it('impulse points forward for yaw 0 and toward +X for yaw +90deg, scaled by magnitude', () => {
    const f = impulseVector(STRIKES.cross, 0);
    expect(f.z).toBeGreaterThan(0);
    expect(f.length()).toBeCloseTo(STRIKES.cross.impulse, 5);
    const r = impulseVector(STRIKES.cross, Math.PI / 2);
    expect(r.x).toBeGreaterThan(0.9 * STRIKES.cross.impulse);
    expect(Math.abs(r.z)).toBeLessThan(0.2 * STRIKES.cross.impulse);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/combat`
Expected: FAIL, cannot resolve `./attack` / `./damage`.

- [ ] **Step 4: Implement attack.ts and damage.ts**

`src/combat/attack.ts`:
```ts
import { STRIKES, strikeDuration, type StrikeName } from './strikes';

export type AttackPhase = 'idle' | 'startup' | 'active' | 'recovery';

export interface AttackState {
  phase: AttackPhase;
  strike: StrikeName | null;
  /** Seconds since the strike started. */
  t: number;
  /** Target ids already hit by this strike. */
  hit: ReadonlySet<string>;
}

export function createAttackState(): AttackState {
  return { phase: 'idle', strike: null, t: 0, hit: new Set() };
}

export function canAttack(s: AttackState): boolean {
  return s.phase === 'idle';
}

export function startAttack(s: AttackState, strike: StrikeName): AttackState {
  if (!canAttack(s)) return s;
  return { phase: 'startup', strike, t: 0, hit: new Set() };
}

export function tickAttack(s: AttackState, dt: number): AttackState {
  if (s.phase === 'idle' || s.strike === null) return s;
  const def = STRIKES[s.strike];
  const t = s.t + dt;
  if (t >= strikeDuration(def)) return createAttackState();
  const phase: AttackPhase = t < def.startup ? 'startup' : t < def.startup + def.active ? 'active' : 'recovery';
  return { ...s, phase, t };
}

export function recordHit(s: AttackState, targetId: string): AttackState {
  const hit = new Set(s.hit);
  hit.add(targetId);
  return { ...s, hit };
}
```

`src/combat/damage.ts`:
```ts
import { Vector3 } from 'three';
import { yawQuaternion } from '../figure/fk';
import type { StrikeDef } from './strikes';

export interface DamageResult {
  hp: number;
  knockedOut: boolean;
}

export function applyDamage(hp: number, strike: StrikeDef): DamageResult {
  const next = Math.max(0, hp - strike.damage);
  return { hp: next, knockedOut: next <= 0 };
}

/** Strike direction rotated into the world by the attacker's yaw, scaled to the strike impulse. */
export function impulseVector(strike: StrikeDef, yaw: number): Vector3 {
  return new Vector3(...strike.direction)
    .normalize()
    .applyQuaternion(yawQuaternion(yaw))
    .multiplyScalar(strike.impulse);
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- src/combat && npm run typecheck`
Expected: 9 passed; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/combat
git commit -m "feat: tabela de golpes, máquina de estados do ataque e dano

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Math helpers and NPC brain (pure steering, spawn ring, recovery rule)

**Files:**
- Create: `src/core/math.ts`, `src/core/math.test.ts`, `src/entities/npcBrain.ts`, `src/entities/npcBrain.test.ts`

**Interfaces:**
- Produces (`core/math.ts`): `clamp(v, lo, hi)`, `lerpAngle(a, b, t)`, `wrapAngle(a)`.
- Produces (`npcBrain.ts`): `Vec2 {x, z}`, `NpcMoveState = 'chase' | 'hold'`, `NPC_TUNING`, `yawToward(from, to)`, `steer(input): SteerOutput`, `ringPositions(count, minR?, maxR?): Vec2[]`, `shouldRecover(ragdollSeconds, maxSpeed): boolean`.

- [ ] **Step 1: Write the failing math tests**

`src/core/math.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { clamp, lerpAngle, wrapAngle } from './math';

describe('math', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('wrapAngle keeps angles in (-pi, pi]', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('lerpAngle takes the short way around', () => {
    expect(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI, 5);
    expect(lerpAngle(0, 1, 0.25)).toBeCloseTo(0.25, 6);
  });
});
```

- [ ] **Step 2: Implement math.ts and run**

`src/core/math.ts`:
```ts
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Wrap to (-pi, pi]. */
export function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r <= -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI) r -= 2 * Math.PI;
  return r;
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * clamp(t, 0, 1);
}
```

Run: `npm test -- src/core/math.test.ts`
Expected: 3 passed.

- [ ] **Step 3: Write the failing NPC brain tests**

`src/entities/npcBrain.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { steer, yawToward, ringPositions, shouldRecover, NPC_TUNING } from './npcBrain';

const origin = { x: 0, z: 0 };

describe('yawToward', () => {
  it('is 0 toward +Z and +pi/2 toward +X', () => {
    expect(yawToward(origin, { x: 0, z: 5 })).toBeCloseTo(0, 6);
    expect(yawToward(origin, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('steer', () => {
  it('chases the player at full speed when far', () => {
    const r = steer({ self: origin, player: { x: 0, z: 10 }, others: [], state: 'chase' });
    expect(r.state).toBe('chase');
    expect(r.velocity.z).toBeCloseTo(NPC_TUNING.speed, 6);
    expect(r.velocity.x).toBeCloseTo(0, 6);
    expect(r.yaw).toBeCloseTo(0, 6);
  });

  it('switches to hold inside the hold distance and stops', () => {
    const r = steer({ self: origin, player: { x: 0, z: NPC_TUNING.holdDistance - 0.05 }, others: [], state: 'chase' });
    expect(r.state).toBe('hold');
    expect(Math.hypot(r.velocity.x, r.velocity.z)).toBeCloseTo(0, 6);
  });

  it('stays in hold until the player is past the resume distance', () => {
    const near = steer({ self: origin, player: { x: 0, z: NPC_TUNING.resumeDistance - 0.1 }, others: [], state: 'hold' });
    expect(near.state).toBe('hold');
    const far = steer({ self: origin, player: { x: 0, z: NPC_TUNING.resumeDistance + 0.1 }, others: [], state: 'hold' });
    expect(far.state).toBe('chase');
  });

  it('keeps facing the player while holding', () => {
    const r = steer({ self: origin, player: { x: 0.5, z: 0.5 }, others: [], state: 'hold' });
    expect(r.yaw).toBeCloseTo(Math.PI / 4, 6);
  });

  it('is pushed away from a neighbour inside the separation radius', () => {
    const r = steer({ self: origin, player: { x: 0, z: 10 }, others: [{ x: 0.3, z: 0 }], state: 'chase' });
    expect(r.velocity.x).toBeLessThan(0);
    const none = steer({ self: origin, player: { x: 0, z: 10 }, others: [{ x: 3, z: 0 }], state: 'chase' });
    expect(none.velocity.x).toBeCloseTo(0, 6);
  });
});

describe('ringPositions', () => {
  it('returns count positions with radii in [minR, maxR]', () => {
    const ps = ringPositions(7, 6, 10);
    expect(ps).toHaveLength(7);
    for (const p of ps) {
      const r = Math.hypot(p.x, p.z);
      expect(r).toBeGreaterThanOrEqual(6 - 1e-9);
      expect(r).toBeLessThanOrEqual(10 + 1e-9);
    }
    expect(ringPositions(0)).toEqual([]);
  });
});

describe('shouldRecover', () => {
  it('waits at least 4 s, then needs the body to settle', () => {
    expect(shouldRecover(3.9, 0)).toBe(false);
    expect(shouldRecover(4.1, 0.2)).toBe(true);
    expect(shouldRecover(4.1, 2.0)).toBe(false);
  });

  it('gives up waiting for settle after 8 s', () => {
    expect(shouldRecover(8.1, 5.0)).toBe(true);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npm test -- src/entities/npcBrain.test.ts`
Expected: FAIL, cannot resolve `./npcBrain`.

- [ ] **Step 5: Implement npcBrain.ts**

`src/entities/npcBrain.ts`:
```ts
export interface Vec2 { x: number; z: number }

export type NpcMoveState = 'chase' | 'hold';

export const NPC_TUNING = {
  speed: 2.5,
  holdDistance: 1.0,
  resumeDistance: 1.4,
  separationRadius: 0.9,
  separationStrength: 2.0,
  ragdollMinSeconds: 4,
  ragdollMaxSeconds: 8,
  settleSpeed: 0.6,
  recoverSeconds: 0.8,
  flinchSeconds: 0.3,
  pushbackDistance: 0.3,
  pushbackSeconds: 0.2,
};

export interface SteerInput {
  self: Vec2;
  player: Vec2;
  /** Other standing NPCs. */
  others: Vec2[];
  state: NpcMoveState;
}

export interface SteerOutput {
  velocity: Vec2;
  yaw: number;
  state: NpcMoveState;
}

/** Heading from `from` to `to`, consistent with forward = (sin yaw, 0, cos yaw). */
export function yawToward(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function steer({ self, player, others, state }: SteerInput): SteerOutput {
  const dx = player.x - self.x;
  const dz = player.z - self.z;
  const dist = Math.hypot(dx, dz);

  let next = state;
  if (state === 'chase' && dist <= NPC_TUNING.holdDistance) next = 'hold';
  else if (state === 'hold' && dist >= NPC_TUNING.resumeDistance) next = 'chase';

  let vx = 0;
  let vz = 0;
  if (next === 'chase' && dist > 1e-6) {
    vx = (dx / dist) * NPC_TUNING.speed;
    vz = (dz / dist) * NPC_TUNING.speed;
  }
  for (const o of others) {
    const ox = self.x - o.x;
    const oz = self.z - o.z;
    const d = Math.hypot(ox, oz);
    if (d < NPC_TUNING.separationRadius && d > 1e-6) {
      const k = (1 - d / NPC_TUNING.separationRadius) * NPC_TUNING.separationStrength;
      vx += (ox / d) * k;
      vz += (oz / d) * k;
    }
  }
  return { velocity: { x: vx, z: vz }, yaw: yawToward(self, player), state: next };
}

/** Evenly spaced around the origin, radius cycling through three bands between minR and maxR. */
export function ringPositions(count: number, minR = 6, maxR = 10): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2;
    const r = minR + ((maxR - minR) * (i % 3)) / 2;
    out.push({ x: Math.sin(angle) * r, z: Math.cos(angle) * r });
  }
  return out;
}

export function shouldRecover(ragdollSeconds: number, maxSpeed: number): boolean {
  if (ragdollSeconds < NPC_TUNING.ragdollMinSeconds) return false;
  if (ragdollSeconds >= NPC_TUNING.ragdollMaxSeconds) return true;
  return maxSpeed < NPC_TUNING.settleSpeed;
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- src/entities src/core && npm run typecheck`
Expected: all pass; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/core src/entities
git commit -m "feat: steering puro do NPC, anel de spawn e regra de levantar

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Physics world and the Figure (bodies, joints, meshes, posed ↔ ragdoll)

**Files:**
- Create: `src/physics/world.ts`, `src/figure/figure.ts`, `src/figure/figure.test.ts`

**Interfaces:**
- Consumes: `SEGMENTS`, `SEGMENT_NAMES`, `LIMB_ENDS`, `BODY_TUNING`, `PELVIS_HEIGHT` from `figure/skeleton`; `forwardKinematics`, `identityJointRots`, `jointRotsFromTransforms`, `yawQuaternion`, types from `figure/fk`.
- Produces (`physics/world.ts`): `RAPIER` (re-export), `BodyTag { figureId; segment }`, `Physics { world; eventQueue; hooks; step(); dispose() }`, `createPhysics(dt?)`.
- Produces (`figure/figure.ts`): `FigureMode`, `FigureOptions { id; color; position: Vector3; yaw? }`, `HitImpulse { segment; impulse; point }`, `class Figure { id; mode; group; applyPose(pose, dt); toRagdoll(hit?); toPosed(); beginRootBlend(seconds); readTransforms(); readJointRots(); readRoot(); maxSpeed(); limbPoint(limb); pelvisPosition(); syncMeshes(); dispose() }`.

- [ ] **Step 1: Write world.ts**

`src/physics/world.ts`:
```ts
import RAPIER from '@dimforge/rapier3d-compat';
import type { SegmentName } from '../figure/skeleton';

export { RAPIER };

/** Stored in `RigidBody.userData` on every figure segment. */
export interface BodyTag {
  figureId: string;
  segment: SegmentName;
}

export interface Physics {
  world: RAPIER.World;
  eventQueue: RAPIER.EventQueue;
  hooks: RAPIER.PhysicsHooks;
  step(): void;
  dispose(): void;
}

export function bodyTag(body: RAPIER.RigidBody | null | undefined): BodyTag | null {
  const tag = body?.userData as BodyTag | undefined;
  return tag && typeof tag.figureId === 'string' ? tag : null;
}

export async function createPhysics(dt = 1 / 60): Promise<Physics> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = dt;

  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(40, 0.5, 40).setTranslation(0, -0.5, 0).setFriction(0.9),
    ground,
  );

  // Segments of the same figure never collide with each other. The hook only runs
  // when step() receives a real EventQueue (Rapier 0.21 behaviour).
  const eventQueue = new RAPIER.EventQueue(false);
  const hooks: RAPIER.PhysicsHooks = {
    filterContactPair: (_c1, _c2, b1, b2) => {
      const t1 = bodyTag(world.getRigidBody(b1));
      const t2 = bodyTag(world.getRigidBody(b2));
      if (t1 && t2 && t1.figureId === t2.figureId) return null;
      return RAPIER.SolverFlags.COMPUTE_IMPULSE;
    },
    filterIntersectionPair: () => true,
  };

  return {
    world,
    eventQueue,
    hooks,
    step() {
      world.step(eventQueue, hooks);
    },
    dispose() {
      eventQueue.free();
      world.free();
    },
  };
}
```

- [ ] **Step 2: Write the failing figure tests**

`src/figure/figure.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createPhysics, RAPIER, type Physics } from '../physics/world';
import { Figure } from './figure';
import { PELVIS_HEIGHT, SEGMENT_NAMES, JOINT_NAMES } from './skeleton';
import { identityJointRots, yawQuaternion, type Pose } from './fk';
import { eulerToQuat } from '../anim/clip';

function pose(x = 0, z = 0, yaw = 0): Pose {
  return { root: { position: new THREE.Vector3(x, PELVIS_HEIGHT, z), rotation: yawQuaternion(yaw) }, joints: identityJointRots() };
}

function finite(f: Figure): boolean {
  const t = f.readTransforms();
  return SEGMENT_NAMES.every((s) =>
    Number.isFinite(t[s].position.x) && Number.isFinite(t[s].position.y) && Number.isFinite(t[s].position.z) && Number.isFinite(t[s].rotation.w));
}

describe('Figure', () => {
  let physics: Physics;
  beforeAll(async () => {
    physics = await createPhysics();
  });

  it('creates 11 bodies and 10 joints with tagged userData', () => {
    const before = physics.world.bodies.len();
    const f = new Figure(physics, new THREE.Scene(), { id: 'a', color: 0xff0000, position: new THREE.Vector3(0, PELVIS_HEIGHT, 0) });
    expect(physics.world.bodies.len() - before).toBe(11);
    expect(physics.world.impulseJoints.len()).toBe(10);
    expect(f.group.children).toHaveLength(11);
    f.dispose();
    expect(physics.world.bodies.len()).toBe(before);
  });

  it('kinematic bodies follow the applied pose exactly after a step', () => {
    const f = new Figure(physics, new THREE.Scene(), { id: 'b', color: 0, position: new THREE.Vector3(5, PELVIS_HEIGHT, 5) });
    const p = pose(5, 5, 0.4);
    p.joints.elbowL = eulerToQuat([-1.5, 0, 0]);
    f.applyPose(p, 1 / 60);
    physics.step();
    const back = f.readJointRots();
    for (const j of JOINT_NAMES) expect(Math.abs(back[j].dot(p.joints[j]))).toBeCloseTo(1, 4);
    expect(f.readRoot().position.distanceTo(p.root.position)).toBeCloseTo(0, 4);
    expect(f.mode).toBe('posed');
    f.dispose();
  });

  it('ragdolls, falls, stays finite and settles on the ground', () => {
    const f = new Figure(physics, new THREE.Scene(), { id: 'c', color: 0, position: new THREE.Vector3(-5, PELVIS_HEIGHT, -5) });
    f.applyPose(pose(-5, -5), 1 / 60);
    physics.step();
    f.toRagdoll({ segment: 'torso', impulse: new THREE.Vector3(0, 30, 120), point: new THREE.Vector3(-5, 1.3, -5) });
    expect(f.mode).toBe('ragdoll');
    for (let i = 0; i < 60; i++) physics.step();
    expect(finite(f)).toBe(true);
    for (let i = 0; i < 300; i++) physics.step();
    expect(finite(f)).toBe(true);
    expect(f.pelvisPosition().y).toBeLessThan(0.6);
    expect(f.pelvisPosition().y).toBeGreaterThan(-0.2);
    expect(f.maxSpeed()).toBeLessThan(0.6);
    f.dispose();
  });

  it('returns to posed and tracks the pose again', () => {
    const f = new Figure(physics, new THREE.Scene(), { id: 'd', color: 0, position: new THREE.Vector3(8, PELVIS_HEIGHT, -8) });
    f.applyPose(pose(8, -8), 1 / 60);
    physics.step();
    f.toRagdoll();
    for (let i = 0; i < 120; i++) physics.step();
    f.toPosed();
    for (let i = 0; i < 10; i++) { f.applyPose(pose(8, -8), 1 / 60); physics.step(); }
    expect(f.pelvisPosition().y).toBeCloseTo(PELVIS_HEIGHT, 3);
    f.dispose();
  });

  it('limbPoint puts the left hand 0.2 m to +X at rest', () => {
    const f = new Figure(physics, new THREE.Scene(), { id: 'e', color: 0, position: new THREE.Vector3(12, PELVIS_HEIGHT, 12) });
    f.applyPose(pose(12, 12), 1 / 60);
    physics.step();
    const hand = f.limbPoint('handL');
    expect(hand.x).toBeCloseTo(12.2, 3);
    expect(hand.y).toBeCloseTo(PELVIS_HEIGHT + 0.075 + 0.25 + 0.22 - 0.3 - 0.28, 3);
    f.dispose();
  });
});

describe('revolute limit sign convention', () => {
  it('a knee with limits [0, 2.4] about +X cannot bend forward (+Z)', async () => {
    const physics = await createPhysics();
    const w = physics.world;
    const thigh = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 2, 0));
    w.createCollider(RAPIER.ColliderDesc.capsule(0.21, 0.05), thigh);
    const shin = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.58, 0).setAngularDamping(0.5));
    w.createCollider(RAPIER.ColliderDesc.capsule(0.21, 0.045).setMass(4), shin);
    const jd = RAPIER.JointData.revolute({ x: 0, y: -0.21, z: 0 }, { x: 0, y: 0.21, z: 0 }, { x: 1, y: 0, z: 0 });
    const joint = w.getImpulseJoint(w.createImpulseJoint(jd, thigh, shin, true).handle) as RAPIER.RevoluteImpulseJoint;
    joint.setLimits(0, 2.4);
    // Push the foot forward (+Z): the limit must stop it near zero.
    shin.applyImpulseAtPoint({ x: 0, y: 0, z: 6 }, { x: 0, y: 1.37, z: 0 }, true);
    let maxForward = 0;
    for (let i = 0; i < 90; i++) {
      physics.step();
      const foot = new THREE.Vector3(0, -0.21, 0).applyQuaternion(new THREE.Quaternion().copy(shin.rotation() as THREE.Quaternion)).add(shin.translation() as THREE.Vector3);
      maxForward = Math.max(maxForward, foot.z);
    }
    expect(maxForward).toBeLessThan(0.08);
    // And backward (-Z) is free.
    shin.applyImpulseAtPoint({ x: 0, y: 0, z: -6 }, { x: 0, y: 1.37, z: 0 }, true);
    let maxBack = 0;
    for (let i = 0; i < 60; i++) {
      physics.step();
      const foot = new THREE.Vector3(0, -0.21, 0).applyQuaternion(new THREE.Quaternion().copy(shin.rotation() as THREE.Quaternion)).add(shin.translation() as THREE.Vector3);
      maxBack = Math.max(maxBack, -foot.z);
    }
    expect(maxBack).toBeGreaterThan(0.15);
    physics.dispose();
  });
});
```

If the last test fails with the forward/backward roles swapped, the Rapier revolute sign is the opposite of this plan's assumption: flip every revolute `limits` pair in `skeleton.ts` (elbows become `[0, 2.4]`, knees `[-2.4, 0]`) and flip the test's expectations, then continue. Do not silently loosen the thresholds.

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/figure/figure.test.ts`
Expected: FAIL, cannot resolve `./figure`.

- [ ] **Step 4: Implement figure.ts**

`src/figure/figure.ts`:
```ts
import * as THREE from 'three';
import { RAPIER, type Physics, type BodyTag } from '../physics/world';
import {
  SEGMENTS, SEGMENT_NAMES, LIMB_ENDS, BODY_TUNING, type SegmentName, type Limb,
} from './skeleton';
import {
  forwardKinematics, identityJointRots, jointRotsFromTransforms, yawQuaternion,
  type JointRots, type Pose, type RootTransform, type SegmentTransforms,
} from './fk';

export type FigureMode = 'posed' | 'ragdoll';

export interface FigureOptions {
  id: string;
  color: number;
  /** Pelvis center. */
  position: THREE.Vector3;
  yaw?: number;
}

export interface HitImpulse {
  segment: SegmentName;
  impulse: THREE.Vector3;
  point: THREE.Vector3;
}

interface RootBlend { from: RootTransform; t: number; duration: number }

/**
 * Rapier 0.21 types spherical joints as GenericImpulseJoint, which hides the motor API.
 * Configure a position motor at angle 0 on all three angular axes directly on the raw set:
 * it acts as a soft spring pulling the joint back toward the rest pose.
 */
function setSphericalSpring(joint: RAPIER.ImpulseJoint, stiffness: number, damping: number): void {
  const raw = joint as unknown as {
    handle: number;
    rawSet: { jointConfigureMotorPosition(h: number, axis: number, target: number, k: number, d: number): void };
  };
  for (const axis of [RAPIER.JointAxis.AngX, RAPIER.JointAxis.AngY, RAPIER.JointAxis.AngZ]) {
    raw.rawSet.jointConfigureMotorPosition(raw.handle, axis, 0, stiffness, damping);
  }
}

export class Figure {
  readonly id: string;
  mode: FigureMode = 'posed';
  readonly group = new THREE.Group();
  private readonly bodies = {} as Record<SegmentName, RAPIER.RigidBody>;
  private readonly meshes = {} as Record<SegmentName, THREE.Mesh>;
  private readonly joints: RAPIER.ImpulseJoint[] = [];
  private rootBlend: RootBlend | null = null;

  constructor(private readonly physics: Physics, scene: THREE.Scene, opts: FigureOptions) {
    this.id = opts.id;
    const world = physics.world;
    const rest = forwardKinematics({
      root: { position: opts.position.clone(), rotation: yawQuaternion(opts.yaw ?? 0) },
      joints: identityJointRots(),
    });
    const material = new THREE.MeshToonMaterial({ color: opts.color });

    for (const seg of SEGMENTS) {
      const t = rest[seg.name];
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(t.position.x, t.position.y, t.position.z)
          .setRotation(t.rotation)
          .setLinearDamping(BODY_TUNING.linearDamping)
          .setAngularDamping(BODY_TUNING.angularDamping)
          .setCcdEnabled(true),
      );
      body.userData = { figureId: this.id, segment: seg.name } satisfies BodyTag;
      const shape = seg.length > 0
        ? RAPIER.ColliderDesc.capsule(seg.length / 2, seg.radius)
        : RAPIER.ColliderDesc.ball(seg.radius);
      world.createCollider(
        shape.setMass(seg.mass)
          .setFriction(BODY_TUNING.friction)
          .setRestitution(BODY_TUNING.restitution)
          .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS),
        body,
      );
      this.bodies[seg.name] = body;

      const geometry = seg.length > 0
        ? new THREE.CapsuleGeometry(seg.radius, seg.length, 4, 12)
        : new THREE.SphereGeometry(seg.radius, 16, 12);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.copy(t.position);
      mesh.quaternion.copy(t.rotation);
      this.meshes[seg.name] = mesh;
      this.group.add(mesh);
    }

    for (const seg of SEGMENTS) {
      if (!seg.parent || !seg.jointKind) continue;
      const parent = this.bodies[seg.parent];
      const child = this.bodies[seg.name];
      const data = seg.jointKind.kind === 'revolute'
        ? RAPIER.JointData.revolute(seg.parentAnchor, seg.selfAnchor, seg.jointKind.axis)
        : RAPIER.JointData.spherical(seg.parentAnchor, seg.selfAnchor);
      const created = world.createImpulseJoint(data, parent, child, true);
      const joint = world.getImpulseJoint(created.handle);
      joint.setContactsEnabled(false);
      if (seg.jointKind.kind === 'revolute') {
        (joint as RAPIER.RevoluteImpulseJoint).setLimits(seg.jointKind.limits[0], seg.jointKind.limits[1]);
      } else {
        setSphericalSpring(joint, seg.jointKind.springStiffness, seg.jointKind.springDamping);
      }
      this.joints.push(joint);
    }

    scene.add(this.group);
  }

  /** Posed mode only: drive every kinematic body to the FK result of `pose`. */
  applyPose(pose: Pose, dt: number): void {
    if (this.mode !== 'posed') return;
    let root = pose.root;
    if (this.rootBlend) {
      this.rootBlend.t += dt;
      const k = Math.min(1, this.rootBlend.t / this.rootBlend.duration);
      root = {
        position: this.rootBlend.from.position.clone().lerp(pose.root.position, k),
        rotation: this.rootBlend.from.rotation.clone().slerp(pose.root.rotation, k),
      };
      if (k >= 1) this.rootBlend = null;
    }
    const transforms = forwardKinematics({ root, joints: pose.joints });
    for (const name of SEGMENT_NAMES) {
      const t = transforms[name];
      this.bodies[name].setNextKinematicTranslation(t.position);
      this.bodies[name].setNextKinematicRotation(t.rotation);
    }
  }

  /** Switch to dynamic bodies, keeping the current kinematic velocity, then apply the hit. */
  toRagdoll(hit?: HitImpulse): void {
    if (this.mode === 'ragdoll') return;
    this.mode = 'ragdoll';
    this.rootBlend = null;
    for (const name of SEGMENT_NAMES) {
      const b = this.bodies[name];
      const lv = b.linvel();
      const av = b.angvel();
      b.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      b.setLinvel(lv, true);
      b.setAngvel(av, true);
    }
    if (hit) this.bodies[hit.segment].applyImpulseAtPoint(hit.impulse, hit.point, true);
  }

  toPosed(): void {
    if (this.mode === 'posed') return;
    this.mode = 'posed';
    for (const name of SEGMENT_NAMES) {
      const b = this.bodies[name];
      b.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /** Next applyPose calls interpolate the root from where the pelvis is now. */
  beginRootBlend(seconds: number): void {
    this.rootBlend = { from: this.readRoot(), t: 0, duration: Math.max(seconds, 1e-3) };
  }

  readTransforms(): SegmentTransforms {
    const out = {} as SegmentTransforms;
    for (const name of SEGMENT_NAMES) {
      const b = this.bodies[name];
      const t = b.translation();
      const r = b.rotation();
      out[name] = { position: new THREE.Vector3(t.x, t.y, t.z), rotation: new THREE.Quaternion(r.x, r.y, r.z, r.w) };
    }
    return out;
  }

  readJointRots(): JointRots {
    return jointRotsFromTransforms(this.readTransforms());
  }

  readRoot(): RootTransform {
    const t = this.readTransforms().pelvis;
    return { position: t.position, rotation: t.rotation };
  }

  pelvisPosition(): THREE.Vector3 {
    const t = this.bodies.pelvis.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  maxSpeed(): number {
    let max = 0;
    for (const name of SEGMENT_NAMES) {
      const v = this.bodies[name].linvel();
      max = Math.max(max, Math.hypot(v.x, v.y, v.z));
    }
    return max;
  }

  limbPoint(limb: Limb): THREE.Vector3 {
    const { segment, local } = LIMB_ENDS[limb];
    const b = this.bodies[segment];
    const r = b.rotation();
    const t = b.translation();
    return local.clone().applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z));
  }

  syncMeshes(): void {
    for (const name of SEGMENT_NAMES) {
      const b = this.bodies[name];
      const t = b.translation();
      const r = b.rotation();
      this.meshes[name].position.set(t.x, t.y, t.z);
      this.meshes[name].quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  dispose(): void {
    const world = this.physics.world;
    for (const j of this.joints) world.removeImpulseJoint(j, true);
    this.joints.length = 0;
    for (const name of SEGMENT_NAMES) world.removeRigidBody(this.bodies[name]);
    this.group.removeFromParent();
    for (const name of SEGMENT_NAMES) this.meshes[name].geometry.dispose();
    (this.meshes.pelvis.material as THREE.Material).dispose();
  }
}
```

- [ ] **Step 5: Run figure tests and typecheck**

Run: `npm test -- src/figure/figure.test.ts && npm run typecheck`
Expected: 6 passed; typecheck clean. If the "settles" test fails only on `maxSpeed() < 0.6`, raise `BODY_TUNING.angularDamping` to 5 and `linearDamping` to 1.0 in `skeleton.ts` and rerun; if the pelvis never drops below 0.6, the joint anchors are wrong — recheck `parentAnchor`/`selfAnchor` against Task 2, do not touch the test.

- [ ] **Step 6: Commit**

```bash
git add src/physics src/figure
git commit -m "feat: mundo Rapier com filtro de autocolisão e Figure cinemático/ragdoll

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Strike clips and flinch clip

**Files:**
- Create: `src/anim/strikeClips.ts`, `src/anim/strikeClips.test.ts`

**Interfaces:**
- Consumes: `Clip`, `JointEulers` from `anim/clip`; `GUARD` from `anim/clips`; `STRIKES`, `STRIKE_NAMES`, `strikeDuration`, `StrikeName` from `combat/strikes`.
- Produces: `STRIKE_CLIPS: Record<StrikeName, Clip>`, `getStrikeClip(name): Clip`, `FLINCH: Clip`.

- [ ] **Step 1: Write the failing tests**

`src/anim/strikeClips.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { STRIKE_CLIPS, getStrikeClip, FLINCH } from './strikeClips';
import { STRIKES, STRIKE_NAMES, strikeDuration } from '../combat/strikes';

describe('strike clips', () => {
  it('has one clip per strike with duration equal to the strike timing', () => {
    for (const n of STRIKE_NAMES) {
      const clip = getStrikeClip(n);
      expect(clip).toBe(STRIKE_CLIPS[n]);
      expect(clip.loop).toBe(false);
      expect(clip.duration).toBeCloseTo(strikeDuration(STRIKES[n]), 6);
    }
  });

  it('keyframes are sorted, start at 0 and end at duration', () => {
    for (const clip of [...Object.values(STRIKE_CLIPS), FLINCH]) {
      const ts = clip.keyframes.map((k) => k.t);
      expect(ts[0]).toBe(0);
      expect(ts[ts.length - 1]).toBeCloseTo(clip.duration, 6);
      for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
    }
  });

  it('the striking limb is extended at the start of the active window', () => {
    for (const n of STRIKE_NAMES) {
      const def = STRIKES[n];
      const clip = STRIKE_CLIPS[n];
      const kf = clip.keyframes.find((k) => Math.abs(k.t - def.startup) < 1e-6);
      expect(kf, `${n} needs a keyframe at t=startup`).toBeDefined();
      const joint = def.limb === 'handL' ? 'shoulderL' : def.limb === 'handR' ? 'shoulderR' : def.limb === 'footL' ? 'hipL' : 'hipR';
      expect(kf!.joints[joint]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/anim/strikeClips.test.ts`
Expected: FAIL, cannot resolve `./strikeClips`.

- [ ] **Step 3: Implement strikeClips.ts**

Each clip: guard at `t=0`, extended at `t=startup`, still extended at `t=startup+active`, back to guard at `t=duration`. Values are starting points for playtest tuning (Task 10 step 6).

`src/anim/strikeClips.ts`:
```ts
import type { Clip, JointEulers } from './clip';
import { GUARD } from './clips';
import { STRIKES, strikeDuration, type StrikeName, type StrikeDef } from '../combat/strikes';

function strikeClip(def: StrikeDef, extended: JointEulers, chamber?: JointEulers): Clip {
  const duration = strikeDuration(def);
  const keyframes = [{ t: 0, joints: GUARD }];
  if (chamber) keyframes.push({ t: def.startup * 0.5, joints: { ...GUARD, ...chamber } });
  keyframes.push(
    { t: def.startup, joints: { ...GUARD, ...extended } },
    { t: def.startup + def.active, joints: { ...GUARD, ...extended } },
    { t: duration, joints: GUARD },
  );
  return { name: def.name, duration, loop: false, keyframes };
}

export const STRIKE_CLIPS: Record<StrikeName, Clip> = {
  jab: strikeClip(STRIKES.jab, {
    shoulderL: [-1.55, 0, -0.05], elbowL: [-0.15, 0, 0], spine: [0.15, -0.3, 0],
  }),
  cross: strikeClip(STRIKES.cross, {
    shoulderR: [-1.6, 0, 0.05], elbowR: [-0.1, 0, 0], spine: [0.15, 0.5, 0], hipR: [-0.2, 0, -0.08],
  }),
  hookL: strikeClip(STRIKES.hookL, {
    shoulderL: [-1.45, 0, -0.95], elbowL: [-1.6, 0, 0], spine: [0.1, -0.7, 0],
  }),
  hookR: strikeClip(STRIKES.hookR, {
    shoulderR: [-1.45, 0, 0.95], elbowR: [-1.6, 0, 0], spine: [0.1, 0.7, 0],
  }),
  lowKick: strikeClip(STRIKES.lowKick, {
    hipR: [-0.9, 0.5, -0.3], kneeR: [0.4, 0, 0], hipL: [-0.2, 0, 0.1], spine: [0, -0.5, 0.2],
  }),
  frontKick: strikeClip(
    STRIKES.frontKick,
    { hipR: [-1.5, 0, -0.05], kneeR: [0.1, 0, 0], spine: [-0.2, 0, 0], hipL: [-0.2, 0, 0.1] },
    { hipR: [-1.6, 0, -0.05], kneeR: [2.0, 0, 0] },
  ),
  highKick: strikeClip(
    STRIKES.highKick,
    { hipR: [-2.0, 0.4, -0.5], kneeR: [0.2, 0, 0], spine: [-0.3, -0.6, 0.4], hipL: [-0.2, 0, 0.1] },
    { hipR: [-1.4, 0.3, -0.3], kneeR: [2.0, 0, 0] },
  ),
};

export function getStrikeClip(name: StrikeName): Clip {
  return STRIKE_CLIPS[name];
}

/** Short recoil when hit without KO: lean back, head back, arms pulled in. */
export const FLINCH: Clip = {
  name: 'flinch',
  duration: 0.3,
  loop: false,
  keyframes: [
    { t: 0, joints: GUARD },
    { t: 0.1, joints: { ...GUARD, spine: [-0.35, 0, 0], neck: [-0.3, 0, 0], elbowL: [-2.5, 0, 0], elbowR: [-2.5, 0, 0] } },
    { t: 0.3, joints: GUARD },
  ],
};
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- src/anim && npm run typecheck`
Expected: all pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/anim
git commit -m "feat: clipes dos sete golpes e do flinch

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Input, third-person camera, player entity, playable scene without NPCs

**Files:**
- Create: `src/input/keyboard.ts`, `src/input/mouse.ts`, `src/camera/thirdPerson.ts`, `src/camera/thirdPerson.test.ts`, `src/entities/player.ts`, `src/entities/player.test.ts`
- Modify: `src/main.ts` (replace whole file)

**Interfaces:**
- Consumes: `Figure` (Task 6), `Animator`, `STANCE`, `getStrikeClip`, `createAttackState/startAttack/tickAttack/recordHit/canAttack`, `STRIKES`, `KEY_TO_STRIKE`, `yawQuaternion`, `PELVIS_HEIGHT`, `lerpAngle`, `yawToward`, `createFixedStepper`, `createScene`, `createPhysics`.
- Produces: `class Keyboard { isDown(code); drainPressed(): string[]; clear(); attach(); detach() }`; `class MouseLook { locked; requestLock(); consume(): {dx, dy}; onLockChange?; attach(); detach() }`; `cameraOffset(yaw, pitch, distance)`, `moveDirection(keys, cameraYaw)`, `class ThirdPersonCamera { yaw; pitch; rotate(dx, dy); update(focus, dt) }`; `PLAYER_TUNING`, `PlayerInput`, `TargetInfo`, `pickTarget(position, targets)`, `class Player { figure; animator; attack; yaw; position; update(dt, input, targets); activeStrike(); recordHit(id) }`.

- [ ] **Step 1: Write keyboard.ts and mouse.ts**

`src/input/keyboard.ts`:
```ts
export class Keyboard {
  private held = new Set<string>();
  private pressed: string[] = [];

  private onDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.held.add(e.code);
    this.pressed.push(e.code);
  };
  private onUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };
  private onBlur = () => this.clear();

  attach(): void {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** Keys pressed since the last drain (edge-triggered). */
  drainPressed(): string[] {
    const out = this.pressed;
    this.pressed = [];
    return out;
  }

  clear(): void {
    this.held.clear();
    this.pressed = [];
  }
}
```

`src/input/mouse.ts`:
```ts
export class MouseLook {
  locked = false;
  onLockChange?: (locked: boolean) => void;
  private dx = 0;
  private dy = 0;

  constructor(private readonly element: HTMLElement) {}

  private onMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.dx += e.movementX;
    this.dy += e.movementY;
  };
  private onLock = () => {
    this.locked = document.pointerLockElement === this.element;
    this.dx = 0;
    this.dy = 0;
    this.onLockChange?.(this.locked);
  };

  attach(): void {
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('pointerlockchange', this.onLock);
  }

  detach(): void {
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('pointerlockchange', this.onLock);
  }

  requestLock(): void {
    if (!this.locked) void this.element.requestPointerLock();
  }

  /** Accumulated movement since the last call. */
  consume(): { dx: number; dy: number } {
    const out = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return out;
  }
}
```

- [ ] **Step 2: Write the failing camera tests**

`src/camera/thirdPerson.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { cameraOffset, moveDirection } from './thirdPerson';

describe('cameraOffset', () => {
  it('sits behind (-Z) and above the focus at yaw 0 with positive pitch', () => {
    const o = cameraOffset(0, 0.3, 4);
    expect(o.z).toBeLessThan(0);
    expect(o.y).toBeGreaterThan(0);
    expect(o.length()).toBeCloseTo(4, 6);
  });

  it('rotates with yaw: at yaw +90deg it sits at -X', () => {
    const o = cameraOffset(Math.PI / 2, 0, 4);
    expect(o.x).toBeCloseTo(-4, 6);
    expect(o.z).toBeCloseTo(0, 6);
  });
});

describe('moveDirection', () => {
  const none = { forward: false, back: false, left: false, right: false };

  it('W moves along the camera forward (+Z at yaw 0)', () => {
    const d = moveDirection({ ...none, forward: true }, 0);
    expect(d.x).toBeCloseTo(0, 6);
    expect(d.z).toBeCloseTo(1, 6);
  });

  it('D moves screen-right, which is -X when looking along +Z', () => {
    const d = moveDirection({ ...none, right: true }, 0);
    expect(d.x).toBeCloseTo(-1, 6);
  });

  it('diagonals are unit length and no keys give zero', () => {
    expect(moveDirection({ ...none, forward: true, left: true }, 0.4).length()).toBeCloseTo(1, 6);
    expect(moveDirection(none, 1).length()).toBe(0);
    expect(moveDirection({ ...none, forward: true, back: true }, 1).length()).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/camera`
Expected: FAIL, cannot resolve `./thirdPerson`.

- [ ] **Step 4: Implement thirdPerson.ts**

`src/camera/thirdPerson.ts`:
```ts
import * as THREE from 'three';
import { clamp } from '../core/math';

export const CAMERA_TUNING = {
  distance: 4,
  focusAbovePelvis: 0.24,
  sensitivity: 0.0025,
  minPitch: -20 * (Math.PI / 180),
  maxPitch: 60 * (Math.PI / 180),
  smoothing: 12,
  minHeight: 0.3,
};

/** Camera position relative to the focus point. Positive pitch looks down from above. */
export function cameraOffset(yaw: number, pitch: number, distance: number): THREE.Vector3 {
  const c = Math.cos(pitch);
  return new THREE.Vector3(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c).multiplyScalar(distance);
}

export interface MoveKeys { forward: boolean; back: boolean; left: boolean; right: boolean }

/** World-space unit direction for WASD relative to the camera yaw, or zero. */
export function moveDirection(keys: MoveKeys, cameraYaw: number): THREE.Vector3 {
  const forward = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
  const right = new THREE.Vector3(-Math.cos(cameraYaw), 0, Math.sin(cameraYaw));
  const d = new THREE.Vector3();
  if (keys.forward) d.add(forward);
  if (keys.back) d.sub(forward);
  if (keys.right) d.add(right);
  if (keys.left) d.sub(right);
  return d.lengthSq() > 1e-9 ? d.normalize() : d.set(0, 0, 0);
}

export class ThirdPersonCamera {
  yaw = 0;
  pitch = 0.3;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  rotate(dx: number, dy: number): void {
    this.yaw -= dx * CAMERA_TUNING.sensitivity;
    this.pitch = clamp(this.pitch + dy * CAMERA_TUNING.sensitivity, CAMERA_TUNING.minPitch, CAMERA_TUNING.maxPitch);
  }

  /** `focus` is the pelvis position; the camera looks slightly above it. */
  update(focus: THREE.Vector3, dt: number): void {
    const target = focus.clone();
    target.y = focus.y + CAMERA_TUNING.focusAbovePelvis; // look at chest height
    const desired = target.clone().add(cameraOffset(this.yaw, this.pitch, CAMERA_TUNING.distance));
    desired.y = Math.max(desired.y, CAMERA_TUNING.minHeight);
    const k = 1 - Math.exp(-CAMERA_TUNING.smoothing * dt);
    this.camera.position.lerp(desired, k);
    this.camera.lookAt(target);
  }
}
```

- [ ] **Step 5: Run camera tests**

Run: `npm test -- src/camera`
Expected: 5 passed.

- [ ] **Step 6: Write the failing player tests (pure parts)**

`src/entities/player.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { pickTarget, blockedByTarget, PLAYER_TUNING } from './player';

const at = (x: number, z: number, standing = true, id = `${x},${z}`) => ({ id, position: new Vector3(x, 0.96, z), standing });

describe('pickTarget', () => {
  it('returns the nearest standing target within lock-on range', () => {
    const t = pickTarget(new Vector3(0, 0.96, 0), [at(0, 2), at(1, 0), at(0, -0.5, false)]);
    expect(t?.id).toBe('1,0');
  });

  it('ignores targets beyond range and downed targets', () => {
    expect(pickTarget(new Vector3(), [at(0, PLAYER_TUNING.lockOnRange + 0.1), at(0.3, 0, false)])).toBeNull();
  });
});

describe('blockedByTarget', () => {
  it('blocks a step that ends inside a standing target', () => {
    const next = new Vector3(0, 0.96, 0.8);
    expect(blockedByTarget(next, [at(0, 1.0)])).toBe(true);
    expect(blockedByTarget(next, [at(0, 1.0, false)])).toBe(false);
    expect(blockedByTarget(next, [at(0, 2.0)])).toBe(false);
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `npm test -- src/entities/player.test.ts`
Expected: FAIL, cannot resolve `./player`.

- [ ] **Step 8: Implement player.ts**

`src/entities/player.ts`:
```ts
import * as THREE from 'three';
import type { Figure } from '../figure/figure';
import { yawQuaternion } from '../figure/fk';
import { Animator } from '../anim/animator';
import { STANCE } from '../anim/clips';
import { getStrikeClip } from '../anim/strikeClips';
import { canAttack, createAttackState, recordHit, startAttack, tickAttack, type AttackState } from '../combat/attack';
import { STRIKES, type StrikeDef, type StrikeName } from '../combat/strikes';
import { lerpAngle } from '../core/math';
import { yawToward } from './npcBrain';

export const PLAYER_TUNING = {
  walkSpeed: 3,
  runSpeed: 6,
  turnRate: 12,
  lockOnRange: 2.5,
  blockDistance: 0.5,
};

export interface PlayerInput {
  /** World-space unit direction or zero (already camera-relative). */
  move: THREE.Vector3;
  run: boolean;
  /** Strike keys pressed this tick, in order. */
  strikes: StrikeName[];
  cameraYaw: number;
}

export interface TargetInfo {
  id: string;
  position: THREE.Vector3;
  standing: boolean;
}

function groundDistance(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function pickTarget(position: THREE.Vector3, targets: TargetInfo[]): TargetInfo | null {
  let best: TargetInfo | null = null;
  let bestD = PLAYER_TUNING.lockOnRange;
  for (const t of targets) {
    if (!t.standing) continue;
    const d = groundDistance(position, t.position);
    if (d <= bestD) { best = t; bestD = d; }
  }
  return best;
}

export function blockedByTarget(next: THREE.Vector3, targets: TargetInfo[]): boolean {
  return targets.some((t) => t.standing && groundDistance(next, t.position) < PLAYER_TUNING.blockDistance);
}

export class Player {
  readonly animator = new Animator(STANCE);
  attack: AttackState = createAttackState();
  yaw = 0;
  readonly position: THREE.Vector3;

  constructor(readonly figure: Figure, position: THREE.Vector3) {
    this.position = position.clone();
  }

  update(dt: number, input: PlayerInput, targets: TargetInfo[]): void {
    if (this.figure.mode !== 'posed') return;

    const wanted = input.strikes[0];
    if (wanted && canAttack(this.attack)) {
      const target = pickTarget(this.position, targets);
      this.yaw = target
        ? yawToward({ x: this.position.x, z: this.position.z }, { x: target.position.x, z: target.position.z })
        : input.cameraYaw;
      this.attack = startAttack(this.attack, wanted);
      this.animator.play(getStrikeClip(wanted));
    } else {
      this.attack = tickAttack(this.attack, dt);
    }

    let speed = 0;
    if (canAttack(this.attack) && input.move.lengthSq() > 0) {
      speed = input.run ? PLAYER_TUNING.runSpeed : PLAYER_TUNING.walkSpeed;
      const next = this.position.clone().addScaledVector(input.move, speed * dt);
      if (blockedByTarget(next, targets)) speed = 0;
      else this.position.copy(next);
      const targetYaw = Math.atan2(input.move.x, input.move.z);
      this.yaw = lerpAngle(this.yaw, targetYaw, 1 - Math.exp(-PLAYER_TUNING.turnRate * dt));
    }

    const joints = this.animator.update(dt, speed);
    this.figure.applyPose({ root: { position: this.position, rotation: yawQuaternion(this.yaw) }, joints }, dt);
  }

  /** While a strike is in its active window: the strike and the current hand/foot position. */
  activeStrike(): { strike: StrikeDef; point: THREE.Vector3 } | null {
    if (this.attack.phase !== 'active' || !this.attack.strike) return null;
    const strike = STRIKES[this.attack.strike];
    return { strike, point: this.figure.limbPoint(strike.limb) };
  }

  recordHit(targetId: string): void {
    this.attack = recordHit(this.attack, targetId);
  }
}
```

- [ ] **Step 9: Run player tests and typecheck**

Run: `npm test -- src/entities/player.test.ts && npm run typecheck`
Expected: 3 passed; typecheck clean.

- [ ] **Step 10: Replace main.ts with a playable scene (no NPCs yet)**

`src/main.ts`:
```ts
import * as THREE from 'three';
import { createScene } from './scene/scene';
import { createPhysics } from './physics/world';
import { createFixedStepper } from './core/loop';
import { Figure } from './figure/figure';
import { PELVIS_HEIGHT } from './figure/skeleton';
import { Player, type TargetInfo } from './entities/player';
import { Keyboard } from './input/keyboard';
import { MouseLook } from './input/mouse';
import { ThirdPersonCamera, moveDirection } from './camera/thirdPerson';
import { KEY_TO_STRIKE, type StrikeName } from './combat/strikes';

async function main() {
  const app = document.getElementById('app')!;
  const { scene, camera, renderer } = createScene(app);
  const physics = await createPhysics();

  const keyboard = new Keyboard();
  keyboard.attach();
  const mouse = new MouseLook(renderer.domElement);
  mouse.attach();
  renderer.domElement.addEventListener('click', () => mouse.requestLock());

  const orbit = new ThirdPersonCamera(camera);
  const figure = new Figure(physics, scene, { id: 'player', color: 0x2a6fdb, position: new THREE.Vector3(0, PELVIS_HEIGHT, 0) });
  const player = new Player(figure, new THREE.Vector3(0, PELVIS_HEIGHT, 0));
  const targets: TargetInfo[] = [];

  const stepper = createFixedStepper(1 / 60);
  let last = performance.now();

  function frame(now: number) {
    const elapsed = (now - last) / 1000;
    last = now;
    const { dx, dy } = mouse.consume();
    orbit.rotate(dx, dy);

    if (mouse.locked) {
      stepper.advance(elapsed, () => {
        const strikes = keyboard.drainPressed().map((c) => KEY_TO_STRIKE[c]).filter((s): s is StrikeName => !!s);
        const move = moveDirection({
          forward: keyboard.isDown('KeyW'), back: keyboard.isDown('KeyS'),
          left: keyboard.isDown('KeyA'), right: keyboard.isDown('KeyD'),
        }, orbit.yaw);
        player.update(stepper.dt, { move, run: keyboard.isDown('ShiftLeft') || keyboard.isDown('ShiftRight'), strikes, cameraYaw: orbit.yaw }, targets);
        physics.step();
        figure.syncMeshes();
      });
    } else {
      keyboard.clear();
    }

    orbit.update(player.position, elapsed);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:16px">Falha ao iniciar: ${String(err)}</pre>`;
});
```

- [ ] **Step 11: Manual check in the browser**

Run: `npm run dev` and open the URL. Click the canvas to lock the mouse.
Expected: a blue stick figure in fighting stance on a paper-colored floor; mouse orbits the camera; W/A/S/D walks relative to the camera with legs cycling; Shift runs; J/K/U/I/N/M/, play the seven strikes and the figure cannot walk while striking; Esc releases the mouse and freezes the simulation.

Record anything visibly wrong (limb bending the wrong way, strike pose unreadable) as a note in the commit body; tuning happens in Task 10 step 6.

- [ ] **Step 12: Typecheck and commit**

Run: `npm run typecheck && npm test`
Expected: clean; all tests pass.

```bash
git add -A
git commit -m "feat: input, câmera em terceira pessoa e jogador jogável sem NPCs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Hit detection, NPC entity, Game orchestration (integration-tested in Node)

**Files:**
- Create: `src/combat/hits.ts`, `src/entities/npc.ts`, `src/game.ts`, `src/game.test.ts`

**Interfaces:**
- Consumes: `Physics`, `RAPIER`, `bodyTag` (Task 6), `Figure`, `Player`, `PlayerInput`, `TargetInfo` (Task 8), `Animator`, `STANCE`, `FLINCH`, `steer`, `ringPositions`, `shouldRecover`, `NPC_TUNING`, `Vec2`, `NpcMoveState`, `applyDamage`, `impulseVector`, `NPC_MAX_HP`, `StrikeDef`, `yawQuaternion`, `yawFromQuaternion`, `PELVIS_HEIGHT`, `lerpAngle`.
- Produces: `findHits(physics, center, radius, excludeFigureId): HitCandidate[]`; `NpcState`, `class Npc { figure; animator; hp; state; yaw; position; id; standing; ground; takeHit(strike, attackerYaw, segment, point): boolean; update(dt, player: Vec2, others: Vec2[]) }`; `class Game { player; npcs; knockouts; step(dt, input); dispose() }`, `PLAYER_COLOR`, `NPC_COLOR`.

- [ ] **Step 1: Write hits.ts**

`src/combat/hits.ts`:
```ts
import * as THREE from 'three';
import { RAPIER, bodyTag, type Physics } from '../physics/world';
import type { SegmentName } from '../figure/skeleton';

export interface HitCandidate {
  figureId: string;
  segment: SegmentName;
  point: THREE.Vector3;
}

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

/** Every figure (other than `excludeFigureId`) whose segments overlap a sphere; one entry per figure. */
export function findHits(physics: Physics, center: THREE.Vector3, radius: number, excludeFigureId: string): HitCandidate[] {
  const out: HitCandidate[] = [];
  const seen = new Set<string>();
  physics.world.intersectionsWithShape(center, IDENTITY, new RAPIER.Ball(radius), (collider) => {
    const tag = bodyTag(collider.parent());
    if (tag && tag.figureId !== excludeFigureId && !seen.has(tag.figureId)) {
      seen.add(tag.figureId);
      out.push({ figureId: tag.figureId, segment: tag.segment, point: center.clone() });
    }
    return true;
  });
  return out;
}
```

- [ ] **Step 2: Write npc.ts**

`src/entities/npc.ts`:
```ts
import * as THREE from 'three';
import type { Figure } from '../figure/figure';
import { yawFromQuaternion, yawQuaternion } from '../figure/fk';
import { PELVIS_HEIGHT, type SegmentName } from '../figure/skeleton';
import { Animator } from '../anim/animator';
import { STANCE } from '../anim/clips';
import { FLINCH } from '../anim/strikeClips';
import { applyDamage, impulseVector } from '../combat/damage';
import { NPC_MAX_HP, type StrikeDef } from '../combat/strikes';
import { lerpAngle } from '../core/math';
import { NPC_TUNING, shouldRecover, steer, type NpcMoveState, type Vec2 } from './npcBrain';

export type NpcState = 'chase' | 'hold' | 'flinch' | 'ragdoll' | 'recovering';

interface Pushback { velocity: THREE.Vector3; remaining: number }

export class Npc {
  readonly animator = new Animator(STANCE);
  hp = NPC_MAX_HP;
  state: NpcState = 'chase';
  yaw = 0;
  readonly position: THREE.Vector3;
  private moveState: NpcMoveState = 'chase';
  private timer = 0;
  private pushback: Pushback | null = null;
  private readonly home: THREE.Vector3;

  constructor(readonly figure: Figure, position: THREE.Vector3) {
    this.position = position.clone();
    this.home = position.clone();
  }

  get id(): string {
    return this.figure.id;
  }

  get standing(): boolean {
    return this.state === 'chase' || this.state === 'hold' || this.state === 'flinch';
  }

  get ground(): Vec2 {
    return { x: this.position.x, z: this.position.z };
  }

  /** Returns true when this hit knocked the NPC out. No effect unless standing. */
  takeHit(strike: StrikeDef, attackerYaw: number, segment: SegmentName, point: THREE.Vector3): boolean {
    if (!this.standing) return false;
    const r = applyDamage(this.hp, strike);
    this.hp = r.hp;
    this.timer = 0;
    if (r.knockedOut) {
      this.pushback = null;
      this.state = 'ragdoll';
      this.figure.toRagdoll({ segment, impulse: impulseVector(strike, attackerYaw), point });
      return true;
    }
    this.state = 'flinch';
    this.animator.play(FLINCH);
    const dir = new THREE.Vector3(Math.sin(attackerYaw), 0, Math.cos(attackerYaw));
    this.pushback = {
      velocity: dir.multiplyScalar(NPC_TUNING.pushbackDistance / NPC_TUNING.pushbackSeconds),
      remaining: NPC_TUNING.pushbackSeconds,
    };
    return false;
  }

  update(dt: number, player: Vec2, others: Vec2[]): void {
    this.timer += dt;
    let speed = 0;

    switch (this.state) {
      case 'ragdoll': {
        if (this.figure.pelvisPosition().y < -2) { this.teleportHome(); return; }
        if (!shouldRecover(this.timer, this.figure.maxSpeed())) return;
        this.standUp();
        return;
      }
      case 'recovering': {
        if (this.timer >= NPC_TUNING.recoverSeconds) { this.state = 'chase'; this.moveState = 'chase'; }
        break;
      }
      case 'flinch': {
        if (this.pushback) {
          this.position.addScaledVector(this.pushback.velocity, dt);
          this.pushback.remaining -= dt;
          if (this.pushback.remaining <= 0) this.pushback = null;
        }
        if (this.timer >= NPC_TUNING.flinchSeconds) { this.state = 'hold'; this.moveState = 'hold'; }
        break;
      }
      case 'chase':
      case 'hold': {
        const s = steer({ self: this.ground, player, others, state: this.moveState });
        this.moveState = s.state;
        this.state = s.state;
        const v = new THREE.Vector3(s.velocity.x, 0, s.velocity.z);
        speed = v.length();
        if (speed > 0.05) this.position.addScaledVector(v, dt);
        else speed = 0;
        this.yaw = lerpAngle(this.yaw, s.yaw, 1 - Math.exp(-8 * dt));
        break;
      }
    }

    const joints = this.animator.update(dt, speed);
    this.figure.applyPose({ root: { position: this.position, rotation: yawQuaternion(this.yaw) }, joints }, dt);
  }

  /** Ragdoll → kinematic: blend root and joints from where the body lies back to the stance. */
  private standUp(): void {
    const rots = this.figure.readJointRots();
    const root = this.figure.readRoot();
    this.position.set(root.position.x, PELVIS_HEIGHT, root.position.z);
    this.yaw = yawFromQuaternion(root.rotation);
    this.figure.toPosed();
    this.figure.beginRootBlend(NPC_TUNING.recoverSeconds);
    this.animator.blendFromRots(rots, NPC_TUNING.recoverSeconds);
    this.hp = NPC_MAX_HP;
    this.state = 'recovering';
    this.timer = 0;
  }

  /** Numerical blow-up safety: back to the spawn point, standing. */
  private teleportHome(): void {
    this.figure.toPosed();
    this.position.copy(this.home);
    this.yaw = 0;
    this.hp = NPC_MAX_HP;
    this.state = 'recovering';
    this.timer = 0;
  }
}
```

- [ ] **Step 3: Write the failing Game integration test**

`src/game.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPhysics } from './physics/world';
import { Game } from './game';
import { PELVIS_HEIGHT } from './figure/skeleton';
import { NPC_MAX_HP, STRIKES } from './combat/strikes';
import type { PlayerInput } from './entities/player';

const DT = 1 / 60;
const idle: PlayerInput = { move: new THREE.Vector3(), run: false, strikes: [], cameraYaw: 0 };

describe('Game', () => {
  it('spawns the requested NPCs around the player', async () => {
    const physics = await createPhysics();
    const game = new Game(physics, new THREE.Scene(), 4);
    expect(game.npcs).toHaveLength(4);
    for (const n of game.npcs) expect(Math.hypot(n.position.x, n.position.z)).toBeGreaterThan(5);
    game.dispose();
    physics.dispose();
  });

  it('front kicks damage once per strike, KO on the third, ignore the downed NPC, then it gets up', async () => {
    const physics = await createPhysics();
    const game = new Game(physics, new THREE.Scene(), 1);
    const npc = game.npcs[0];
    npc.position.set(0, PELVIS_HEIGHT, 0.9);
    npc.yaw = Math.PI;
    const run = (seconds: number, input: PlayerInput = idle) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) game.step(DT, input);
    };

    run(0.5);
    expect(npc.state).toBe('hold');
    expect(game.player.figure.mode).toBe('posed');

    game.step(DT, { ...idle, strikes: ['frontKick'] });
    run(1.0);
    expect(npc.hp).toBe(NPC_MAX_HP - STRIKES.frontKick.damage);
    expect(npc.standing).toBe(true);

    game.step(DT, { ...idle, strikes: ['frontKick'] });
    run(1.0);
    expect(npc.hp).toBe(NPC_MAX_HP - 2 * STRIKES.frontKick.damage);

    game.step(DT, { ...idle, strikes: ['frontKick'] });
    run(1.0);
    expect(game.knockouts).toBe(1);
    expect(npc.state).toBe('ragdoll');
    expect(npc.figure.mode).toBe('ragdoll');

    game.step(DT, { ...idle, strikes: ['frontKick'] });
    run(1.0);
    expect(game.knockouts).toBe(1);

    run(9);
    expect(npc.standing).toBe(true);
    expect(npc.figure.mode).toBe('posed');
    expect(npc.hp).toBe(NPC_MAX_HP);
    expect(npc.figure.pelvisPosition().y).toBeCloseTo(PELVIS_HEIGHT, 1);

    game.dispose();
    physics.dispose();
  }, 30_000);
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npm test -- src/game.test.ts`
Expected: FAIL, cannot resolve `./game`.

- [ ] **Step 5: Implement game.ts**

`src/game.ts`:
```ts
import * as THREE from 'three';
import type { Physics } from './physics/world';
import { Figure } from './figure/figure';
import { PELVIS_HEIGHT } from './figure/skeleton';
import { Player, type PlayerInput, type TargetInfo } from './entities/player';
import { Npc } from './entities/npc';
import { ringPositions } from './entities/npcBrain';
import { findHits } from './combat/hits';

export const PLAYER_COLOR = 0x2a6fdb;
export const NPC_COLOR = 0xd94a3a;

export class Game {
  readonly player: Player;
  readonly npcs: Npc[] = [];
  knockouts = 0;
  private readonly byId = new Map<string, Npc>();

  constructor(private readonly physics: Physics, scene: THREE.Scene, npcCount: number) {
    const origin = new THREE.Vector3(0, PELVIS_HEIGHT, 0);
    this.player = new Player(new Figure(physics, scene, { id: 'player', color: PLAYER_COLOR, position: origin }), origin);
    ringPositions(npcCount).forEach((p, i) => {
      const pos = new THREE.Vector3(p.x, PELVIS_HEIGHT, p.z);
      const yaw = Math.atan2(-p.x, -p.z);
      const npc = new Npc(new Figure(physics, scene, { id: `npc-${i}`, color: NPC_COLOR, position: pos, yaw }), pos);
      npc.yaw = yaw;
      this.npcs.push(npc);
      this.byId.set(npc.id, npc);
    });
  }

  /** One fixed physics tick. */
  step(dt: number, input: PlayerInput): void {
    const targets: TargetInfo[] = this.npcs.map((n) => ({ id: n.id, position: n.position, standing: n.standing }));
    this.player.update(dt, input, targets);

    const playerGround = { x: this.player.position.x, z: this.player.position.z };
    for (const npc of this.npcs) {
      const others = this.npcs.filter((o) => o !== npc && o.standing).map((o) => o.ground);
      npc.update(dt, playerGround, others);
    }

    this.physics.step();

    const active = this.player.activeStrike();
    if (active) {
      for (const hit of findHits(this.physics, active.point, active.strike.hitRadius, this.player.figure.id)) {
        if (this.player.attack.hit.has(hit.figureId)) continue;
        const npc = this.byId.get(hit.figureId);
        if (!npc || !npc.standing) continue;
        this.player.recordHit(hit.figureId);
        if (npc.takeHit(active.strike, this.player.yaw, hit.segment, hit.point)) this.knockouts++;
      }
    }

    this.player.figure.syncMeshes();
    for (const npc of this.npcs) npc.figure.syncMeshes();
  }

  dispose(): void {
    this.player.figure.dispose();
    for (const npc of this.npcs) npc.figure.dispose();
    this.npcs.length = 0;
    this.byId.clear();
  }
}
```

- [ ] **Step 6: Run the integration test**

Run: `npm test -- src/game.test.ts && npm run typecheck`
Expected: 2 passed; typecheck clean.

If the HP assertion after the first kick fails with HP still 50, the foot is not reaching: print `game.player.figure.limbPoint('footR')` during the active window and compare with the NPC pelvis at (0, 0.96, 0.9); the expected foot is near (−0.1, 0.8, 0.84). Fix the `frontKick` extended pose in `strikeClips.ts` (more negative `hipR[0]` reaches farther), not the test distance. If HP is 10 after one kick, the same strike is counting twice: check `recordHit` is called before `takeHit`.

- [ ] **Step 7: Commit**

```bash
git add src/combat/hits.ts src/entities/npc.ts src/game.ts src/game.test.ts
git commit -m "feat: detecção de acerto, NPC com HP/flinch/ragdoll/levantar e orquestração do jogo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Start screen, HUD, pause, reset, README and playtest tuning

**Files:**
- Create: `src/ui/params.ts`, `src/ui/params.test.ts`, `src/ui/overlay.ts`, `README.md`
- Modify: `src/main.ts` (replace whole file)

**Interfaces:**
- Consumes: `Game` (Task 9), everything `main.ts` used in Task 8.
- Produces: `parseNpcCount(search: string, fallback?: number): number`, `NPC_COUNT_MIN = 1`, `NPC_COUNT_MAX = 20`; `createOverlay(root): Overlay { showStart(defaultCount, onStart); showPaused(onResume); hide(); setKnockouts(n); showError(message) }`.

- [ ] **Step 1: Write the failing params tests**

`src/ui/params.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/ui`
Expected: FAIL, cannot resolve `./params`.

- [ ] **Step 3: Implement params.ts**

`src/ui/params.ts`:
```ts
import { clamp } from '../core/math';

export const NPC_COUNT_MIN = 1;
export const NPC_COUNT_MAX = 20;
export const NPC_COUNT_DEFAULT = 5;

export function clampNpcCount(n: number): number {
  if (!Number.isFinite(n)) return NPC_COUNT_DEFAULT;
  return clamp(Math.floor(n), NPC_COUNT_MIN, NPC_COUNT_MAX);
}

export function parseNpcCount(search: string, fallback = NPC_COUNT_DEFAULT): number {
  const raw = new URLSearchParams(search).get('npcs');
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? clampNpcCount(n) : fallback;
}
```

- [ ] **Step 4: Run params tests**

Run: `npm test -- src/ui`
Expected: 3 passed.

- [ ] **Step 5: Write overlay.ts**

`src/ui/overlay.ts`:
```ts
import { NPC_COUNT_MAX, NPC_COUNT_MIN, clampNpcCount } from './params';

export interface Overlay {
  showStart(defaultCount: number, onStart: (count: number) => void): void;
  showPaused(onResume: () => void): void;
  hide(): void;
  setKnockouts(n: number): void;
  showError(message: string): void;
}

const CSS = `
.kb-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(243, 238, 226, 0.85); color: #2b2620; z-index: 10; }
.kb-overlay[hidden] { display: none; }
.kb-card { background: #fffdf7; border: 2px solid #2b2620; border-radius: 12px; padding: 28px 32px; min-width: 320px;
  box-shadow: 6px 6px 0 #2b2620; text-align: center; }
.kb-card h1 { margin: 0 0 8px; font-size: 28px; }
.kb-card p { margin: 6px 0; color: #5c554b; }
.kb-card label { display: block; margin: 18px 0 8px; font-weight: 600; }
.kb-card input { font-size: 20px; width: 80px; text-align: center; padding: 6px; border: 2px solid #2b2620; border-radius: 8px; }
.kb-card button { margin-top: 18px; font-size: 18px; padding: 10px 22px; border: 2px solid #2b2620; border-radius: 8px;
  background: #2a6fdb; color: white; cursor: pointer; box-shadow: 3px 3px 0 #2b2620; }
.kb-card button:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #2b2620; }
.kb-hud { position: absolute; left: 16px; bottom: 16px; color: #2b2620; font-size: 13px; line-height: 1.5;
  background: rgba(255, 253, 247, 0.8); padding: 10px 14px; border-radius: 8px; border: 1px solid #2b2620; pointer-events: none; }
.kb-hud[hidden] { display: none; }
.kb-ko { position: absolute; left: 16px; top: 16px; color: #2b2620; font-size: 22px; font-weight: 700;
  background: rgba(255, 253, 247, 0.8); padding: 8px 14px; border-radius: 8px; border: 1px solid #2b2620; pointer-events: none; }
.kb-ko[hidden] { display: none; }
`;

const CONTROLS = [
  'WASD mover · Shift correr · Mouse câmera',
  'J jab · K direto · U cruzado esq · I cruzado dir',
  'N low kick · M chute frontal · , high kick',
  'R reiniciar · Esc pausar',
];

export function createOverlay(root: HTMLElement): Overlay {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'kb-overlay';
  const card = document.createElement('div');
  card.className = 'kb-card';
  overlay.appendChild(card);

  const hud = document.createElement('div');
  hud.className = 'kb-hud';
  hud.innerHTML = CONTROLS.map((l) => `<div>${l}</div>`).join('');
  hud.hidden = true;

  const ko = document.createElement('div');
  ko.className = 'kb-ko';
  ko.textContent = 'Nocautes: 0';
  ko.hidden = true;

  root.append(overlay, hud, ko);

  function show(html: string): HTMLElement {
    card.innerHTML = html;
    overlay.hidden = false;
    return card;
  }

  return {
    showStart(defaultCount, onStart) {
      const c = show(`
        <h1>Kickboxing de Palito</h1>
        <p>Derrube os bonecos. Eles levantam.</p>
        <label for="kb-count">Quantos inimigos? (${NPC_COUNT_MIN} a ${NPC_COUNT_MAX})</label>
        <input id="kb-count" type="number" min="${NPC_COUNT_MIN}" max="${NPC_COUNT_MAX}" value="${defaultCount}" />
        <div><button id="kb-start">Começar</button></div>
        <p style="margin-top:16px;font-size:12px">${CONTROLS.join('<br/>')}</p>
      `);
      const input = c.querySelector<HTMLInputElement>('#kb-count')!;
      const start = () => onStart(clampNpcCount(Number(input.value)));
      c.querySelector<HTMLButtonElement>('#kb-start')!.addEventListener('click', start);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
      input.focus();
    },
    showPaused(onResume) {
      const c = show(`
        <h1>Pausado</h1>
        <p>Clique para voltar ao jogo.</p>
        <div><button id="kb-resume">Continuar</button></div>
      `);
      c.querySelector<HTMLButtonElement>('#kb-resume')!.addEventListener('click', onResume);
    },
    hide() {
      overlay.hidden = true;
      hud.hidden = false;
      ko.hidden = false;
    },
    setKnockouts(n) {
      ko.textContent = `Nocautes: ${n}`;
    },
    showError(message) {
      show(`<h1>Não deu</h1><p>${message}</p>`);
      hud.hidden = true;
      ko.hidden = true;
    },
  };
}
```

- [ ] **Step 6: Replace main.ts with the full game flow**

`src/main.ts`:
```ts
import { createScene } from './scene/scene';
import { createPhysics } from './physics/world';
import { createFixedStepper } from './core/loop';
import { Game } from './game';
import { Keyboard } from './input/keyboard';
import { MouseLook } from './input/mouse';
import { ThirdPersonCamera, moveDirection } from './camera/thirdPerson';
import { KEY_TO_STRIKE, type StrikeName } from './combat/strikes';
import { createOverlay } from './ui/overlay';
import { parseNpcCount } from './ui/params';

async function main() {
  const app = document.getElementById('app')!;
  const overlay = createOverlay(app);
  const { scene, camera, renderer } = createScene(app);

  let physics;
  try {
    physics = await createPhysics();
  } catch (err) {
    overlay.showError(`Não consegui carregar a física (WASM): ${String(err)}`);
    return;
  }

  const keyboard = new Keyboard();
  keyboard.attach();
  const mouse = new MouseLook(renderer.domElement);
  mouse.attach();
  const orbit = new ThirdPersonCamera(camera);
  const stepper = createFixedStepper(1 / 60);

  let game: Game | null = null;
  let npcCount = parseNpcCount(window.location.search);

  function startGame(count: number) {
    npcCount = count;
    game?.dispose();
    game = new Game(physics!, scene, count);
    overlay.setKnockouts(0);
    overlay.hide();
    keyboard.clear();
    mouse.requestLock();
  }

  mouse.onLockChange = (locked) => {
    if (!game) return;
    if (locked) overlay.hide();
    else overlay.showPaused(() => mouse.requestLock());
  };
  renderer.domElement.addEventListener('click', () => { if (game) mouse.requestLock(); });

  overlay.showStart(npcCount, startGame);

  let last = performance.now();
  function frame(now: number) {
    const elapsed = (now - last) / 1000;
    last = now;
    const { dx, dy } = mouse.consume();
    orbit.rotate(dx, dy);

    if (game && mouse.locked) {
      const g = game;
      stepper.advance(elapsed, () => {
        const pressed = keyboard.drainPressed();
        if (pressed.includes('KeyR')) { startGame(npcCount); return; }
        const strikes = pressed.map((c) => KEY_TO_STRIKE[c]).filter((s): s is StrikeName => !!s);
        const move = moveDirection({
          forward: keyboard.isDown('KeyW'), back: keyboard.isDown('KeyS'),
          left: keyboard.isDown('KeyA'), right: keyboard.isDown('KeyD'),
        }, orbit.yaw);
        const run = keyboard.isDown('ShiftLeft') || keyboard.isDown('ShiftRight');
        g.step(stepper.dt, { move, run, strikes, cameraYaw: orbit.yaw });
      });
      overlay.setKnockouts(game.knockouts);
    } else {
      keyboard.clear();
    }

    if (game) orbit.update(game.player.position, elapsed);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:16px">Falha ao iniciar: ${String(err)}</pre>`;
});
```

Note: because `startGame` inside `stepper.advance` replaces `game`, the local `g` keeps stepping the old instance only for the remainder of that single `advance` call; `return` right after `startGame` prevents that.

- [ ] **Step 7: Typecheck, run all tests**

Run: `npm run typecheck && npm test`
Expected: clean; every test file passes.

- [ ] **Step 8: Playtest and tune**

Run: `npm run dev`, open the URL, start with 5 NPCs. Check each line; fix only in the file named, rerun `npm test` after each change:

1. NPCs walk toward you, stop about one meter away in guard, keep facing you, do not pile up. (`npcBrain.ts` `NPC_TUNING`)
2. Jab, direto, cruzados reach an NPC standing in front of you and make it flinch and slide back; a high kick on a damaged NPC knocks it down. (`strikeClips.ts` poses, `strikes.ts` `hitRadius`)
3. The KO'd body flies in the direction of the strike, flops to the floor, limbs bend only at plausible angles (knees backward, elbows inward), no jitter after a second. (`skeleton.ts` `BODY_TUNING`, spring stiffness/damping; if a limb bends the wrong way, flip that joint's `limits` sign)
4. After ~4 s the body blends back up to the stance where it fell and comes after you again; HUD counter incremented. (`NPC_TUNING.ragdollMinSeconds`, `settleSpeed`)
5. Esc shows the pause card and freezes everything; clicking Continuar resumes with no jump. R restarts with the same count. `?npcs=12` starts the field at 12.
6. Nothing in the console except maybe Vite HMR messages.

Record the tuned values in the commit message.

- [ ] **Step 9: Write README.md**

`README.md`:
```markdown
# Kickboxing de Palito

Joguinho 3D no browser: um boneco de palito em terceira pessoa dá golpes de kickboxing em NPCs que o seguem. NPCs nocauteados caem de ragdoll (Rapier), levantam e voltam.

## Rodar

    npm install
    npm run dev

Abra a URL impressa. Escolha a quantidade de inimigos (ou use `?npcs=12`) e clique em Começar. Clique na tela para travar o mouse; Esc pausa.

## Controles

| Ação | Tecla |
|---|---|
| Mover | W A S D (relativo à câmera) |
| Correr | Shift |
| Câmera | Mouse |
| Jab / Direto | J / K |
| Cruzado esquerdo / direito | U / I |
| Low kick / Chute frontal / High kick | N / M / , |
| Reiniciar | R |

## Desenvolvimento

    npm test          # vitest (lógica pura + smoke tests de física em Node)
    npm run typecheck
    npm run build

Arquitetura e decisões: `docs/superpowers/specs/2026-10-07-kickboxing-mvp-design.md`. Valores de ajuste ficam em `src/figure/skeleton.ts`, `src/combat/strikes.ts` e `src/entities/npcBrain.ts`.
```

- [ ] **Step 10: Final verification and commit**

Run: `npm run typecheck && npm test && npm run build`
Expected: all clean; `dist/` produced.

```bash
git add -A
git commit -m "feat: tela inicial, HUD, pausa, reinício e README; ajustes de playtest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
