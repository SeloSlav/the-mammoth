import * as THREE from "three";
import {
  BALCONY_GROW_SLOT_LOCAL_OFFSETS,
  BALCONY_GROW_SLOT_SOIL_INSET_FRAC,
  BALCONY_GROW_SOIL_LOCAL_Y,
  balconyGrowSlotLocalPosition,
  balconyGrowSlotOffsetsFromHalfExtents,
  type BalconyGrowSlotXZ,
  type BalconyGrowStage,
} from "@the-mammoth/schemas";
import { readDecorVisualLocalBounds } from "../fpApartment/fpApartmentInteractionPick.js";

const _boundsScratch = new THREE.Box3();
const _sizeScratch = new THREE.Vector3();

/** Probe merged tray decor for the soil rim height in tray-local space. */
export function probeGrowTraySoilLocalY(decorGroup: THREE.Object3D): number {
  readDecorVisualLocalBounds(decorGroup, _boundsScratch);
  if (_boundsScratch.isEmpty()) return BALCONY_GROW_SOIL_LOCAL_Y;
  return _boundsScratch.max.y - 0.01;
}

/** 2×2 slot centers spread across the inset soil patch in tray-local space. */
export function probeGrowTraySlotLocalOffsets(decorGroup: THREE.Object3D): BalconyGrowSlotXZ[] {
  readDecorVisualLocalBounds(decorGroup, _boundsScratch);
  if (_boundsScratch.isEmpty()) {
    return BALCONY_GROW_SLOT_LOCAL_OFFSETS.map((o) => ({ ...o }));
  }

  _boundsScratch.getSize(_sizeScratch);
  const insetX = _sizeScratch.x * BALCONY_GROW_SLOT_SOIL_INSET_FRAC;
  const insetZ = _sizeScratch.z * BALCONY_GROW_SLOT_SOIL_INSET_FRAC;
  _boundsScratch.min.x += insetX;
  _boundsScratch.max.x -= insetX;
  _boundsScratch.min.z += insetZ;
  _boundsScratch.max.z -= insetZ;

  _boundsScratch.getSize(_sizeScratch);
  const centerX = (_boundsScratch.min.x + _boundsScratch.max.x) * 0.5;
  const centerZ = (_boundsScratch.min.z + _boundsScratch.max.z) * 0.5;

  return balconyGrowSlotOffsetsFromHalfExtents(
    _sizeScratch.x * 0.5,
    _sizeScratch.z * 0.5,
    centerX,
    centerZ,
  );
}

export function readGrowTraySoilLocalY(trayRoot: THREE.Object3D): number {
  const y = trayRoot.userData.mammothGrowTraySoilLocalY;
  return typeof y === "number" && Number.isFinite(y) ? y : BALCONY_GROW_SOIL_LOCAL_Y;
}

export function readGrowTraySlotLocalOffsets(trayRoot: THREE.Object3D): readonly BalconyGrowSlotXZ[] {
  const stored = trayRoot.userData.mammothGrowTraySlotOffsets;
  if (Array.isArray(stored) && stored.length === 4) {
    return stored as BalconyGrowSlotXZ[];
  }
  return BALCONY_GROW_SLOT_LOCAL_OFFSETS;
}

/** Bottom of `visual` rests on holder origin (soil contact). */
export function bottomAlignGrowStageVisual(visual: THREE.Object3D, uniformScale: number): void {
  visual.scale.setScalar(uniformScale);
  visual.position.set(0, 0, 0);
  visual.rotation.set(0, 0, 0);
  visual.updateMatrixWorld(true);
  _boundsScratch.setFromObject(visual);
  visual.position.y = -_boundsScratch.min.y;
}

export function mountBalconyGrowStageVisual(
  holder: THREE.Group,
  template: THREE.Object3D,
  stage: BalconyGrowStage,
  stageScale: number,
  tint: string,
  matureGlow: boolean,
): THREE.Object3D {
  const vis = template.clone(true);
  bottomAlignGrowStageVisual(vis, stageScale);
  vis.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
      o.material = o.material.clone();
      o.material.color.set(tint);
      if (matureGlow) {
        o.material.emissive.set(tint);
        o.material.emissiveIntensity = 0.12;
      }
    }
  });
  holder.add(vis);
  return vis;
}

export function balconyGrowSlotWorldPosition(
  trayWorldMatrix: THREE.Matrix4,
  slotIndex: number,
  soilLocalY: number,
  out: THREE.Vector3,
  trayRoot?: THREE.Object3D,
): THREE.Vector3 {
  const offsets = trayRoot ? readGrowTraySlotLocalOffsets(trayRoot) : BALCONY_GROW_SLOT_LOCAL_OFFSETS;
  const local = balconyGrowSlotLocalPosition(slotIndex, soilLocalY, offsets);
  return out.set(local.x, local.y, local.z).applyMatrix4(trayWorldMatrix);
}
