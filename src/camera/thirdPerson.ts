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
  /** Over-the-shoulder aim: closer, offset to the right, higher, narrower field of view. */
  aimDistance: 2.1,
  aimShoulderOffset: 0.75,
  aimFocusAbovePelvis: 0.6,
  fov: 60,
  aimFov: 45,
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

  /** Screen-right on the ground for the current yaw (−X when looking along +Z). */
  right(): THREE.Vector3 {
    return new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  /**
   * `focus` is the pelvis position; the camera looks slightly above it.
   * `aim` 0..1 blends to the over-the-shoulder aiming view.
   */
  update(focus: THREE.Vector3, dt: number, aim = 0): void {
    const t = aim * aim * (3 - 2 * aim);
    const target = focus.clone();
    target.y = focus.y + THREE.MathUtils.lerp(CAMERA_TUNING.focusAbovePelvis, CAMERA_TUNING.aimFocusAbovePelvis, t);
    target.addScaledVector(this.right(), CAMERA_TUNING.aimShoulderOffset * t);
    const distance = THREE.MathUtils.lerp(CAMERA_TUNING.distance, CAMERA_TUNING.aimDistance, t);
    const fov = THREE.MathUtils.lerp(CAMERA_TUNING.fov, CAMERA_TUNING.aimFov, t);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const desired = target.clone().add(cameraOffset(this.yaw, this.pitch, distance));
    desired.y = Math.max(desired.y, CAMERA_TUNING.minHeight);
    // While aiming the camera must not lag: the crosshair has to sit exactly where the rifle points.
    const k = 1 - Math.exp(-THREE.MathUtils.lerp(CAMERA_TUNING.smoothing, 40, t) * dt);
    this.camera.position.lerp(desired, k);
    this.camera.lookAt(target);
  }
}
