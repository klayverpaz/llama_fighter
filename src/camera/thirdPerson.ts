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
