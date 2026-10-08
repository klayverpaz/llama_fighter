import * as THREE from 'three';
import { AK_POINTS } from '../weapons/akModel';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  /** Bounces on the floor instead of passing through. */
  bounce: boolean;
  shrink: boolean;
}

interface Tracer { mesh: THREE.Object3D; life: number; maxLife: number; fade?: THREE.Material[] }

/** Expanding, fading spheres (fireball, smoke, wool puffs). */
interface Puff { mesh: THREE.Mesh; life: number; maxLife: number; from: number; to: number; rise: number }

const GRAVITY = 9.81;
const UP = new THREE.Vector3(0, 1, 0);

/** Render-time visual effects: tracers, muzzle flash, impact sparks and ejected casings. */
export class Effects {
  private readonly particles: Particle[] = [];
  private readonly tracers: Tracer[] = [];
  private readonly puffs: Puff[] = [];
  private readonly puffGeo = new THREE.SphereGeometry(1, 14, 10);
  private readonly shardGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  private readonly shardMat = new THREE.MeshBasicMaterial({ color: 0xbff0ff });
  private readonly woolMat = new THREE.MeshBasicMaterial({ color: 0xf3ead8 });
  private readonly dirtMat = new THREE.MeshBasicMaterial({ color: 0x6b5a40 });
  private readonly beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  private readonly flash: THREE.Group;
  private readonly flashLight = new THREE.PointLight(0xffb347, 0, 5, 2);
  private flashLife = 0;

  private readonly tracerGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 5, 1, true);
  private readonly tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.85 });
  private readonly sparkGeo = new THREE.BoxGeometry(0.018, 0.018, 0.018);
  private readonly sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  private readonly dustMat = new THREE.MeshBasicMaterial({ color: 0xc9bb93 });
  private readonly hitMat = new THREE.MeshBasicMaterial({ color: 0x7a1d1d });
  private readonly casingGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.038, 6);
  private readonly casingMat = new THREE.MeshToonMaterial({ color: 0xc8a14a });
  private readonly shellGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.06, 8);
  private readonly shellMat = new THREE.MeshToonMaterial({ color: 0xc0261e });

  constructor(private readonly scene: THREE.Scene) {
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffc04d, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.flash = new THREE.Group();
    const petal = new THREE.PlaneGeometry(0.09, 0.22);
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(petal, flashMat);
      p.position.z = 0.09;
      p.rotation.set(Math.PI / 2, 0, (i * Math.PI) / 3);
      this.flash.add(p);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), flashMat);
    this.flash.add(disc);
    this.flash.visible = false;
    scene.add(this.flash, this.flashLight);
  }

  /** Muzzle flash, tracer and casing for one round. `gunRotation` orients the flash along the barrel. */
  shot(from: THREE.Vector3, to: THREE.Vector3, gunPosition: THREE.Vector3, gunRotation: THREE.Quaternion): void {
    this.muzzleFlash(from, gunRotation, 1);
    this.tracer(from, to);
    // Brass flies out of the ejection port to the right, a little up and back.
    this.casing(AK_POINTS.ejectionPort.clone().applyQuaternion(gunRotation).add(gunPosition), gunRotation, 'brass');
  }

  muzzleFlash(from: THREE.Vector3, gunRotation: THREE.Quaternion, size: number): void {
    this.flash.position.copy(from);
    this.flash.quaternion.copy(gunRotation);
    this.flash.rotateZ(Math.random() * Math.PI);
    this.flash.scale.setScalar((0.8 + Math.random() * 0.6) * size);
    this.flash.visible = true;
    this.flashLight.position.copy(from);
    this.flashLight.intensity = 6 * size;
    this.flashLife = 0.045 * Math.sqrt(size);
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const length = from.distanceTo(to);
    if (length > 0.3) {
      const tracer = new THREE.Mesh(this.tracerGeo, this.tracerMat);
      tracer.position.copy(from).lerp(to, 0.5);
      tracer.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize());
      tracer.scale.set(1, length, 1);
      this.scene.add(tracer);
      this.tracers.push({ mesh: tracer, life: 0.06, maxLife: 0.06 });
    }
  }

  /** A spent case thrown out of the ejection port to the right: brass for the AK, a red hull for the shotgun. */
  casing(port: THREE.Vector3, gunRotation: THREE.Quaternion, kind: 'brass' | 'shell'): void {
    const right = new THREE.Vector3(-1, 0.6, -0.3).applyQuaternion(gunRotation).normalize();
    const casing = kind === 'brass'
      ? new THREE.Mesh(this.casingGeo, this.casingMat)
      : new THREE.Mesh(this.shellGeo, this.shellMat);
    casing.position.copy(port);
    casing.castShadow = true;
    this.spawn(casing, right.multiplyScalar(kind === 'brass' ? 2.2 + Math.random() : 1.6 + Math.random() * 0.6),
      kind === 'brass' ? 1.6 : 2.5, true, false, new THREE.Vector3(14, 4, 9));
  }

  /** Burst at a bullet impact: dark red on a body, dust and sparks on the ground. */
  impact(point: THREE.Vector3, normal: THREE.Vector3 | null, onBody: boolean): void {
    const n = normal && normal.lengthSq() > 0 ? normal.clone().normalize() : UP.clone();
    const count = onBody ? 7 : 9;
    for (let i = 0; i < count; i++) {
      const mat = onBody ? this.hitMat : i % 3 === 0 ? this.sparkMat : this.dustMat;
      const m = new THREE.Mesh(this.sparkGeo, mat);
      m.position.copy(point);
      const v = n.clone().multiplyScalar(1 + Math.random() * 2)
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(2.2));
      this.spawn(m, v, 0.25 + Math.random() * 0.25, false, true, new THREE.Vector3());
    }
  }

  private spawn(mesh: THREE.Mesh, velocity: THREE.Vector3, life: number, bounce: boolean, shrink: boolean, spin: THREE.Vector3): void {
    this.scene.add(mesh);
    this.particles.push({ mesh, velocity, spin, life, maxLife: life, gravity: GRAVITY, bounce, shrink });
  }

  /** Freeze (cyan) or anti-gravity (violet) beam: a thick glowing rod that fades fast. */
  beam(from: THREE.Vector3, to: THREE.Vector3, color: number, width: number): void {
    const length = from.distanceTo(to);
    if (length < 0.05) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
    const rod = new THREE.Mesh(this.beamGeo, mat);
    rod.position.copy(from).lerp(to, 0.5);
    rod.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize());
    rod.scale.set(width, length, width);
    this.scene.add(rod);
    this.tracers.push({ mesh: rod, life: 0.14, maxLife: 0.14, fade: [mat] });
  }

  /** Jagged electric bolt through `points` (muzzle → target → next target…). */
  lightning(points: THREE.Vector3[]): void {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xd8ecff, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i];
      const b = points[i + 1];
      const steps = Math.max(4, Math.round(a.distanceTo(b) / 0.5));
      let prev = a.clone();
      for (let k = 1; k <= steps; k++) {
        const p = a.clone().lerp(b, k / steps);
        if (k < steps) p.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.35));
        const len = prev.distanceTo(p);
        const seg = new THREE.Mesh(this.beamGeo, mat);
        seg.position.copy(prev).lerp(p, 0.5);
        seg.quaternion.setFromUnitVectors(UP, p.clone().sub(prev).normalize());
        seg.scale.set(0.018, len, 0.018);
        group.add(seg);
        prev = p;
      }
      this.puff(b, 0x9fd0ff, 0.05, 0.35, 0.18, 0, true);
    }
    this.scene.add(group);
    this.tracers.push({ mesh: group, life: 0.16, maxLife: 0.16, fade: [mat] });
    this.flashLight.position.copy(points[points.length - 1]);
    this.flashLight.color.setHex(0x9fd0ff);
    this.flashLight.intensity = 8;
    this.flashLife = 0.08;
  }

  /** Rocket blast: fireball, black smoke, sparks and a big light flash. */
  explosion(point: THREE.Vector3): void {
    this.puff(point, 0xffd36b, 0.3, 2.6, 0.32, 0, true);
    this.puff(point, 0xff7b2e, 0.2, 2.0, 0.45, 0.4, true);
    for (let i = 0; i < 6; i++) {
      const at = point.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).multiplyScalar(1.6));
      this.puff(at, 0x3b3631, 0.3, 1.1 + Math.random() * 0.6, 1.2 + Math.random() * 0.6, 1.4, false);
    }
    for (let i = 0; i < 3; i++) this.impact(point, UP, false);
    this.flashLight.position.copy(point).add(new THREE.Vector3(0, 0.8, 0));
    this.flashLight.color.setHex(0xffa040);
    this.flashLight.intensity = 30;
    this.flashLight.distance = 18;
    this.flashLife = 0.18;
  }

  /** Grey puff left behind by the rocket. */
  smoke(point: THREE.Vector3): void {
    this.puff(point, 0xbdb6aa, 0.05, 0.35, 0.7, 0.3, false);
  }

  /** Ice shards bursting off a frozen NPC. */
  shards(point: THREE.Vector3): void {
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(this.shardGeo, this.shardMat);
      m.position.copy(point);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).multiplyScalar(7);
      this.spawn(m, v, 0.6 + Math.random() * 0.4, true, true, new THREE.Vector3(10, 8, 6));
    }
    this.puff(point, 0xd8f6ff, 0.1, 0.8, 0.3, 0, true);
  }

  /** Wool flying off a llama hit. */
  wool(point: THREE.Vector3): void {
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(this.shardGeo, this.woolMat);
      m.position.copy(point);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(4);
      this.spawn(m, v, 0.5 + Math.random() * 0.3, false, true, new THREE.Vector3(4, 4, 4));
    }
    this.puff(point, 0xf3ead8, 0.1, 0.6, 0.35, 0.2, false);
  }

  /** Dust ring when landing from a jump (strength 0..1). */
  dust(point: THREE.Vector3, strength: number): void {
    for (let i = 0; i < 6 + Math.round(8 * strength); i++) {
      const a = Math.random() * Math.PI * 2;
      const m = new THREE.Mesh(this.sparkGeo, this.dustMat);
      m.position.copy(point).add(new THREE.Vector3(0, 0.05, 0));
      const v = new THREE.Vector3(Math.sin(a), 0.4, Math.cos(a)).multiplyScalar(1.5 + 2.5 * strength);
      this.spawn(m, v, 0.35, false, true, new THREE.Vector3());
    }
  }

  /** Dirt thrown up where a zombie climbs out of the ground. */
  dirt(point: THREE.Vector3): void {
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(this.sparkGeo, this.dirtMat);
      m.position.copy(point).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.05, (Math.random() - 0.5) * 0.6));
      const v = new THREE.Vector3((Math.random() - 0.5) * 2.5, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 2.5);
      this.spawn(m, v, 0.7 + Math.random() * 0.4, true, true, new THREE.Vector3(6, 6, 6));
    }
    this.puff(point.clone().setY(0.2), 0x7a6a50, 0.2, 0.9, 0.9, 0.4, false);
  }

  /** Violet sparkle on a body starting to float. */
  sparkle(point: THREE.Vector3, color: number): void {
    this.puff(point, color, 0.1, 0.9, 0.4, 0.6, true);
  }

  private puff(at: THREE.Vector3, color: number, from: number, to: number, life: number, rise: number, additive: boolean): void {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(this.puffGeo, mat);
    mesh.position.copy(at);
    mesh.scale.setScalar(from);
    this.scene.add(mesh);
    this.puffs.push({ mesh, life, maxLife: life, from, to, rise });
  }

  update(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      const k = 1 - Math.max(0, p.life / p.maxLife);
      p.mesh.scale.setScalar(p.from + (p.to - p.from) * (1 - (1 - k) * (1 - k)));
      p.mesh.position.y += p.rise * dt;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      if (p.life <= 0) {
        p.mesh.removeFromParent();
        (p.mesh.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
      }
    }

    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) {
        this.flash.visible = false;
        this.flashLight.intensity = 0;
        this.flashLight.color.setHex(0xffb347);
        this.flashLight.distance = 5;
      }
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      const k = Math.max(0, t.life / t.maxLife);
      if (t.fade) for (const m of t.fade) (m as THREE.MeshBasicMaterial).opacity = 0.9 * k;
      else t.mesh.scale.x = t.mesh.scale.z = k;
      if (t.life <= 0) {
        t.mesh.removeFromParent();
        if (t.fade) for (const m of t.fade) m.dispose();
        this.tracers.splice(i, 1);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.velocity.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      if (p.mesh.position.y < 0.01) {
        p.mesh.position.y = 0.01;
        if (p.bounce && p.velocity.y < -0.4) {
          p.velocity.y *= -0.35;
          p.velocity.x *= 0.5;
          p.velocity.z *= 0.5;
          p.spin.multiplyScalar(0.5);
        } else {
          p.velocity.set(0, 0, 0);
          p.spin.set(0, 0, 0);
        }
      }
      if (p.shrink) p.mesh.scale.setScalar(Math.max(0.05, p.life / p.maxLife));
      if (p.life <= 0) {
        p.mesh.removeFromParent();
        this.particles.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const p of this.puffs) p.mesh.removeFromParent();
    this.puffs.length = 0;
    for (const t of this.tracers) t.mesh.removeFromParent();
    for (const p of this.particles) p.mesh.removeFromParent();
    this.tracers.length = 0;
    this.particles.length = 0;
    this.flash.visible = false;
    this.flashLight.intensity = 0;
  }
}
