import * as THREE from 'three';

/** Stick deflection −1..1 from a finger offset in pixels (screen y grows downward; returned y is "forward"). */
export function joystickVector(dx: number, dy: number, radius: number): { x: number; y: number; magnitude: number } {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6 || radius <= 0) return { x: 0, y: 0, magnitude: 0 };
  const magnitude = Math.min(1, len / radius);
  return { x: (dx / len) * magnitude, y: (-dy / len) * magnitude, magnitude };
}

/** Dead zone below which the stick does nothing, and the deflection above which the player runs. */
export const STICK_DEAD_ZONE = 0.18;
export const STICK_RUN = 0.92;

/** World-space unit move direction for a stick deflection, relative to the camera yaw (same basis as WASD). */
export function stickMoveDirection(x: number, y: number, cameraYaw: number): THREE.Vector3 {
  if (Math.hypot(x, y) < STICK_DEAD_ZONE) return new THREE.Vector3();
  const forward = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
  const right = new THREE.Vector3(-Math.cos(cameraYaw), 0, Math.sin(cameraYaw));
  return forward.multiplyScalar(y).addScaledVector(right, x).normalize();
}
