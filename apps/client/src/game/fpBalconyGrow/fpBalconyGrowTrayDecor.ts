import * as THREE from "three";
import {
  BALCONY_GROW_TRAY_MAX_WATER_L,
  balconyGrowDecorTrayId,
  balconyGrowStageFromDays,
  balconyGrowStageVisualScale,
  balconyGrowTrayStashKey,
} from "@the-mammoth/schemas";
import { getMammothItemDef } from "../../inventory/mammothItemCatalog";
import { APARTMENT_STASH_KIND_GROW_TRAY } from "../fpApartment/fpApartmentStashKey.js";
import {
  balconyGrowSlotPickSizeFromTrayBounds,
  fitBalconyGrowSlotInteractionPick,
  fitBalconyGrowTrayCenterInteractionPick,
  fitBalconyGrowTrayInteractionPick,
  readDecorVisualLocalBounds,
} from "../fpApartment/fpApartmentInteractionPick.js";
import { FP_INTERACTION_PICK_LAYER } from "../fpSession/fpSessionConstants.js";
import type { BalconyGrowPlant } from "../../module_bindings/types";
import {
  mountBalconyGrowPlantVisual,
  mountBalconyGrowSeedVisual,
  probeGrowTraySoilLocalY,
  probeGrowTraySlotLocalOffsets,
} from "./fpBalconyGrowStageVisual.js";

const GROW_TRAY_SUFFIX = "grow-tray.glb";
const PHASE_MATURE = 2;
const _traySizeScratch = new THREE.Vector3();
const _trayBoundsScratch = new THREE.Box3();
const _plantPickCenterScratch = new THREE.Vector3();
const _plantPickSizeScratch = new THREE.Vector3();
const _plantPickWorldScaleScratch = new THREE.Vector3();

type GrowSlotHolderState = {
  visualKey?: string;
  visual?: THREE.Object3D;
};

export function isGrowTrayModelPath(modelRelPath: string): boolean {
  return modelRelPath.includes(GROW_TRAY_SUFFIX);
}

/** Stable grow-tray identity: DB imports use decor id; authored content keeps its content id. */
export function growTrayIdForPlacement(
  renderKey: string,
  decorId: bigint | null,
): string | null {
  if (decorId !== null) return balconyGrowDecorTrayId(decorId);
  if (renderKey.startsWith("content:")) {
    const parts = renderKey.split(":");
    const id = parts[2];
    if (id) return id;
  }
  return null;
}

export type GrowTrayDecorMount = {
  growTrayPickMeshes: THREE.Mesh[];
  growTrayCenterPickMeshes: THREE.Mesh[];
  growSlotPickMeshes: THREE.Mesh[];
  growPlantPickMeshes: THREE.Mesh[];
  slotVisualsGroup: THREE.Group;
  trayId: string;
};

export async function mountGrowTrayDecorOnGroup(opts: {
  decorGroup: THREE.Group;
  unitKey: string;
  trayId: string;
  pickGeometry: THREE.BufferGeometry;
  pickMaterial: THREE.Material;
}): Promise<GrowTrayDecorMount> {
  const { decorGroup, unitKey, trayId, pickGeometry, pickMaterial } = opts;
  const growTrayPickMeshes: THREE.Mesh[] = [];
  const growTrayCenterPickMeshes: THREE.Mesh[] = [];
  const growSlotPickMeshes: THREE.Mesh[] = [];
  const growPlantPickMeshes: THREE.Mesh[] = [];

  const soilLocalY = probeGrowTraySoilLocalY(decorGroup);
  decorGroup.userData.mammothGrowTraySoilLocalY = soilLocalY;

  const slotOffsets = probeGrowTraySlotLocalOffsets(decorGroup);
  decorGroup.userData.mammothGrowTraySlotOffsets = slotOffsets;

  const trayVisualBounds = readDecorVisualLocalBounds(decorGroup, new THREE.Box3());
  const slotPickSize = balconyGrowSlotPickSizeFromTrayBounds(trayVisualBounds);
  if (!trayVisualBounds.isEmpty()) {
    trayVisualBounds.getSize(_traySizeScratch);
    decorGroup.userData.mammothGrowTrayMinStageScale = Math.max(
      _traySizeScratch.y * 0.12,
      _traySizeScratch.x * 0.06,
    );
  }

  const trayPick = new THREE.Mesh(pickGeometry, pickMaterial);
  trayPick.name = `grow_tray_pick:${trayId}`;
  fitBalconyGrowTrayInteractionPick(decorGroup, trayPick);
  trayPick.userData.mammothGrowTrayId = trayId;
  trayPick.userData.mammothGrowTrayUnitKey = unitKey;
  trayPick.userData.mammothGrowTrayRoot = decorGroup;
  Object.assign(trayPick.userData, growTrayStashPickUserData(unitKey, trayId));
  trayPick.layers.set(FP_INTERACTION_PICK_LAYER);
  decorGroup.add(trayPick);
  growTrayPickMeshes.push(trayPick);

  const slotVisualsGroup = new THREE.Group();
  slotVisualsGroup.name = `grow_slot_visuals:${trayId}`;
  decorGroup.add(slotVisualsGroup);

  for (let slot = 0; slot < slotOffsets.length; slot++) {
    const off = slotOffsets[slot];
    if (!off) continue;
    const slotPick = new THREE.Mesh(pickGeometry, pickMaterial);
    slotPick.name = `grow_slot_pick:${trayId}:${slot}`;
    fitBalconyGrowSlotInteractionPick(slotPick, off.x, off.z, slotPickSize);
    slotPick.userData.mammothGrowTrayId = trayId;
    slotPick.userData.mammothGrowTrayUnitKey = unitKey;
    slotPick.userData.mammothGrowSlotIndex = slot;
    slotPick.userData.mammothGrowTrayRoot = decorGroup;
    Object.assign(slotPick.userData, growTrayStashPickUserData(unitKey, trayId));
    slotPick.layers.set(FP_INTERACTION_PICK_LAYER);
    decorGroup.add(slotPick);
    growSlotPickMeshes.push(slotPick);

    const holder = new THREE.Group();
    holder.name = `grow_slot_${slot}`;
    holder.position.set(off.x, soilLocalY, off.z);
    holder.visible = false;
    holder.userData.mammothGrowSlotIndex = slot;

    const plantPick = new THREE.Mesh(pickGeometry, pickMaterial);
    plantPick.name = `grow_plant_pick:${trayId}:${slot}`;
    plantPick.visible = false;
    plantPick.userData.mammothGrowTrayId = trayId;
    plantPick.userData.mammothGrowTrayUnitKey = unitKey;
    plantPick.userData.mammothGrowSlotIndex = slot;
    plantPick.userData.mammothGrowTrayRoot = decorGroup;
    plantPick.userData.mammothGrowPlantPick = true;
    plantPick.layers.set(FP_INTERACTION_PICK_LAYER);
    holder.add(plantPick);
    growPlantPickMeshes.push(plantPick);

    slotVisualsGroup.add(holder);
  }

  const centerPick = new THREE.Mesh(pickGeometry, pickMaterial);
  centerPick.name = `grow_tray_center_pick:${trayId}`;
  fitBalconyGrowTrayCenterInteractionPick(centerPick, slotPickSize);
  centerPick.userData.mammothGrowTrayId = trayId;
  centerPick.userData.mammothGrowTrayUnitKey = unitKey;
  centerPick.userData.mammothGrowTrayRoot = decorGroup;
  centerPick.userData.mammothGrowTrayCenterPick = true;
  Object.assign(centerPick.userData, growTrayStashPickUserData(unitKey, trayId));
  centerPick.layers.set(FP_INTERACTION_PICK_LAYER);
  decorGroup.add(centerPick);
  growTrayCenterPickMeshes.push(centerPick);

  return {
    growTrayPickMeshes,
    growTrayCenterPickMeshes,
    growSlotPickMeshes,
    growPlantPickMeshes,
    slotVisualsGroup,
    trayId,
  };
}

function fitGrowPlantInteractionPick(holder: THREE.Group, visual: THREE.Object3D, plantPick: THREE.Mesh): void {
  visual.updateMatrixWorld(true);
  _trayBoundsScratch.setFromObject(visual);
  _trayBoundsScratch.getSize(_plantPickSizeScratch);
  _trayBoundsScratch.getCenter(_plantPickCenterScratch);
  holder.worldToLocal(_plantPickCenterScratch);
  holder.getWorldScale(_plantPickWorldScaleScratch);
  plantPick.position.copy(_plantPickCenterScratch);
  plantPick.scale.set(
    Math.max(0.22, _plantPickSizeScratch.x / _plantPickWorldScaleScratch.x),
    Math.max(0.38, _plantPickSizeScratch.y / _plantPickWorldScaleScratch.y),
    Math.max(0.22, _plantPickSizeScratch.z / _plantPickWorldScaleScratch.z),
  );
  plantPick.visible = true;
}

function growSlotHolderState(holder: THREE.Group): GrowSlotHolderState {
  const state = holder.userData.mammothGrowSlotVisualState as GrowSlotHolderState | undefined;
  if (state) return state;
  const next: GrowSlotHolderState = {};
  holder.userData.mammothGrowSlotVisualState = next;
  return next;
}

function growSlotPlantPick(holder: THREE.Group): THREE.Mesh | null {
  for (const child of holder.children) {
    if (child instanceof THREE.Mesh && child.userData.mammothGrowPlantPick === true) {
      return child;
    }
  }
  return null;
}

function disposeGrowStageVisual(visual: THREE.Object3D): void {
  visual.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) mat.dispose();
    // GLTF clones share template geometries; disposing geometry here would corrupt cached templates.
  });
}

function clearGrowStageVisual(holder: THREE.Group, state: GrowSlotHolderState): void {
  if (!state.visual) return;
  holder.remove(state.visual);
  disposeGrowStageVisual(state.visual);
  state.visual = undefined;
  state.visualKey = undefined;
}

function syncPlantPickForVisual(holder: THREE.Group, state: GrowSlotHolderState): void {
  const plantPick = growSlotPlantPick(holder);
  if (!plantPick) return;
  if (!state.visual || !holder.visible) {
    plantPick.visible = false;
    return;
  }
  fitGrowPlantInteractionPick(holder, state.visual, plantPick);
}

export function syncGrowSlotVisuals(
  slotVisualsGroup: THREE.Group,
  plants: readonly BalconyGrowPlant[],
  trayId: string,
  trayWaterLiters: number,
  fertilizerPresent: boolean,
): void {
  const plantBySlot = new Map<number, BalconyGrowPlant>();
  for (const plant of plants) {
    if (plant.trayId === trayId) plantBySlot.set(plant.slotIndex, plant);
  }
  const trayRoot = slotVisualsGroup.parent;
  let minStageScale = 0;
  if (trayRoot) {
    const cached = trayRoot.userData.mammothGrowTrayMinStageScale;
    if (typeof cached === "number" && Number.isFinite(cached)) {
      minStageScale = cached;
    }
  }

  for (const holder of slotVisualsGroup.children) {
    if (!(holder instanceof THREE.Group)) continue;
    const slot = holder.userData.mammothGrowSlotIndex as number | undefined;
    if (slot === undefined) continue;
    const state = growSlotHolderState(holder);
    const plantPick = growSlotPlantPick(holder);
    if (plantPick) plantPick.visible = false;
    const plant = plantBySlot.get(slot);

    if (!plant || plant.phase === 0) {
      clearGrowStageVisual(holder, state);
      holder.visible = false;
      continue;
    }
    const daysGrown = Number(plant.daysGrown);
    const targetDays = Number(plant.targetDays);
    const stage =
      plant.phase === PHASE_MATURE
        ? "mature"
        : balconyGrowStageFromDays(daysGrown, targetDays);
    const def = getMammothItemDef(plant.cropDefId);
    const tint = def?.balconyGrow?.stageTint ?? "#3d8b4a";
    const cropScale = def?.balconyGrow?.stageScale ?? 1;
    const stageScale = Math.max(balconyGrowStageVisualScale(stage, cropScale), minStageScale);
    const matureGlow = plant.phase === PHASE_MATURE;
    const visualKey = `${plant.cropDefId}:${stage}:${tint}:${stageScale.toFixed(4)}:${matureGlow ? 1 : 0}`;
    holder.visible = true;

    if (state.visualKey === visualKey && state.visual) {
      continue;
    }

    clearGrowStageVisual(holder, state);

    if (stage === "seed") {
      state.visual = mountBalconyGrowSeedVisual(holder, stageScale, tint);
      state.visualKey = visualKey;
      syncPlantPickForVisual(holder, state);
      continue;
    }

    state.visual = mountBalconyGrowPlantVisual(holder, stage, stageScale, tint, matureGlow);
    state.visualKey = visualKey;
    syncPlantPickForVisual(holder, state);
  }

  decorMoistureAndFertilizerHints(slotVisualsGroup.parent, trayWaterLiters, fertilizerPresent);
}

function decorMoistureAndFertilizerHints(
  trayGroup: THREE.Object3D | null,
  waterLiters: number,
  fertilizerPresent: boolean,
): void {
  if (!trayGroup) return;
  const visualKey = `${waterLiters.toFixed(2)}:${fertilizerPresent ? 1 : 0}`;
  if (trayGroup.userData.mammothGrowMoistureVisualKey === visualKey) return;
  trayGroup.userData.mammothGrowMoistureVisualKey = visualKey;
  trayGroup.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.userData.mammothGrowTraySoilMesh !== true) return;
    if (!(o.material instanceof THREE.MeshStandardMaterial)) return;
    const base = o.userData.mammothGrowTraySoilBaseColor as THREE.Color | undefined;
    if (base) {
      o.material.color.copy(base);
      if (waterLiters > 0.3) {
        o.material.color.lerp(new THREE.Color(0x2a1f14), 0.35);
      }
    }
    if (fertilizerPresent && o.userData.mammothGrowTrayRimMesh === true) {
      o.material.emissive.set(0xc8b88a);
      o.material.emissiveIntensity = 0.25;
    }
  });
}

export function growTrayStashPickUserData(unitKey: string, trayId: string) {
  return {
    mammothApartmentStashKey: balconyGrowTrayStashKey(unitKey, trayId),
    mammothApartmentStashKind: APARTMENT_STASH_KIND_GROW_TRAY,
    mammothApartmentStashPickUnitKey: unitKey,
  };
}

export { BALCONY_GROW_TRAY_MAX_WATER_L };
