import * as THREE from "three";
import { readFpCollisionDebugDraw } from "./fpCollisionPolicy.js";

/**
 * Lightweight runtime collision debug: feet ring + horizontal velocity arrow.
 * Enable: `localStorage.setItem("mammothFpCollisionDebug", "1")` then reload.
 */
export function createFpCollisionDebugOverlay(): {
  group: THREE.Group;
  update: (pos: THREE.Vector3, vel: THREE.Vector3) => void;
} {
  const group = new THREE.Group();
  group.name = "fpCollisionDebug";

  const ringGeom = new THREE.RingGeometry(0.18, 0.24, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0.02, 0),
    0.6,
    0xff3366,
    0.08,
    0.06,
  );
  group.add(arrow);

  group.visible = false;

  return {
    group,
    update(pos, vel) {
      const on = readFpCollisionDebugDraw();
      group.visible = on;
      if (!on) return;
      group.position.copy(pos);
      const h = Math.hypot(vel.x, vel.z);
      if (h > 1e-4) {
        arrow.setDirection(new THREE.Vector3(vel.x / h, 0, vel.z / h));
        arrow.setLength(Math.min(1.2, h * 0.25), 0.08, 0.06);
      }
      arrow.visible = h > 1e-4;
    },
  };
}
