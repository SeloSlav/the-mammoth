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
  const geo = new THREE.CircleGeometry(BALCONY_WATER_PATCH_RADIUS_M, 40);

  const createPatchMaterial = () =>
    new THREE.MeshBasicMaterial({
      color: 0x10140f,
      transparent: true,
      opacity: 0.22,
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
          mesh = new THREE.Mesh(geo, createPatchMaterial());
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
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0.06 + fade * 0.22;
        mesh.scale.setScalar(0.96 + fade * 0.04);
      }
      for (const [id, mesh] of meshById) {
        if (!live.has(id)) {
          group.remove(mesh);
          if (mesh.material instanceof THREE.Material) mesh.material.dispose();
          meshById.delete(id);
        }
      }
    },
    dispose() {
      parent.remove(group);
      geo.dispose();
      for (const mesh of meshById.values()) {
        if (mesh.material instanceof THREE.Material) mesh.material.dispose();
      }
      meshById.clear();
    },
  };
}
