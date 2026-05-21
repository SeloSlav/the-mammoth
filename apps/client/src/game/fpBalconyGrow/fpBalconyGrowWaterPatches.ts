import * as THREE from "three";
import type { BalconyWaterPatch } from "../../module_bindings/types";
import { BALCONY_WATER_PATCH_RADIUS_M } from "@the-mammoth/schemas";

export type BalconyWaterPatchVisuals = {
  sync: (patches: readonly BalconyWaterPatch[], floorY: number, nowMicros: number) => void;
  dispose: () => void;
};

export function createBalconyWaterPatchVisuals(parent: THREE.Object3D): BalconyWaterPatchVisuals {
  const group = new THREE.Group();
  group.name = "balconyWaterPatches";
  parent.add(group);

  const meshById = new Map<string, THREE.Mesh>();
  const geo = new THREE.RingGeometry(0.05, BALCONY_WATER_PATCH_RADIUS_M, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x4aa3df,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  return {
    sync(patches, floorY, nowMicros) {
      const live = new Set<string>();
      for (const p of patches) {
        const id = p.patchId.toString();
        live.add(id);
        let mesh = meshById.get(id);
        if (!mesh) {
          mesh = new THREE.Mesh(geo, mat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.y = floorY + 0.01;
          group.add(mesh);
          meshById.set(id, mesh);
        }
        mesh.position.set(p.posX, floorY + 0.01, p.posZ);
        const created = Number(p.createdAtMicros);
        const expires = Number(p.expiresAtMicros);
        const age = (nowMicros - created) / Math.max(1, expires - created);
        const fade = 1 - Math.min(1, age);
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0.15 + fade * 0.35;
        mesh.scale.setScalar(0.6 + fade * 0.5);
      }
      for (const [id, mesh] of meshById) {
        if (!live.has(id)) {
          group.remove(mesh);
          meshById.delete(id);
        }
      }
    },
    dispose() {
      parent.remove(group);
      geo.dispose();
      mat.dispose();
      meshById.clear();
    },
  };
}
