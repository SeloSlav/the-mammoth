import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  BALCONY_GROW_TRAY_BUILTIN_IDS,
  BALCONY_GROW_TRAY_MAX_WATER_L,
  balconyGrowStageFromProgress,
  balconyGrowStageVisualScale,
  balconyGrowTrayStashKey,
} from "@the-mammoth/schemas";
import { balconyGrowStageGlb } from "@the-mammoth/assets";
import { getMammothItemDef } from "../../inventory/mammothItemCatalog";
import { APARTMENT_STASH_KIND_GROW_TRAY } from "../fpApartment/fpApartmentStashKey.js";
import {
  balconyGrowSlotPickSizeFromTrayBounds,
  fitBalconyGrowSlotInteractionPick,
  fitBalconyGrowTrayInteractionPick,
  readDecorVisualLocalBounds,
} from "../fpApartment/fpApartmentInteractionPick.js";
import { FP_INTERACTION_PICK_LAYER } from "../fpSession/fpSessionConstants.js";
import type { BalconyGrowPlant } from "../../module_bindings/types";
import {
  mountBalconyGrowStageVisual,
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

export function isGrowTrayModelPath(modelRelPath: string): boolean {
  return modelRelPath.includes(GROW_TRAY_SUFFIX);
}

/** Map sorted grow-tray placements in a unit to stable builtin UUIDs. */
export function growTrayBuiltinIdForPlacement(
  renderKey: string,
  sortedIndexAmongGrowTrays: number,
): string | null {
  if (renderKey.startsWith("content:")) {
    const parts = renderKey.split(":");
    const id = parts[2];
    if (id && (BALCONY_GROW_TRAY_BUILTIN_IDS as readonly string[]).includes(id)) {
      return id;
    }
  }
  return BALCONY_GROW_TRAY_BUILTIN_IDS[sortedIndexAmongGrowTrays] ?? null;
}

export type GrowTrayDecorMount = {
  growTrayPickMeshes: THREE.Mesh[];
  growSlotPickMeshes: THREE.Mesh[];
  growPlantPickMeshes: THREE.Mesh[];
  slotVisualsGroup: THREE.Group;
  trayBuiltinId: string;
};

export async function mountGrowTrayDecorOnGroup(opts: {
  decorGroup: THREE.Group;
  unitKey: string;
  trayBuiltinId: string;
  pickGeometry: THREE.BufferGeometry;
  pickMaterial: THREE.Material;
  loader: GLTFLoader;
}): Promise<GrowTrayDecorMount> {
  const { decorGroup, unitKey, trayBuiltinId, pickGeometry, pickMaterial, loader } = opts;
  const growTrayPickMeshes: THREE.Mesh[] = [];
  const growSlotPickMeshes: THREE.Mesh[] = [];
  const growPlantPickMeshes: THREE.Mesh[] = [];

  const soilLocalY = probeGrowTraySoilLocalY(decorGroup);
  decorGroup.userData.mammothGrowTraySoilLocalY = soilLocalY;

  const slotOffsets = probeGrowTraySlotLocalOffsets(decorGroup);
  decorGroup.userData.mammothGrowTraySlotOffsets = slotOffsets;

  const trayVisualBounds = readDecorVisualLocalBounds(decorGroup, new THREE.Box3());
  const slotPickSize = balconyGrowSlotPickSizeFromTrayBounds(trayVisualBounds);

  const trayPick = new THREE.Mesh(pickGeometry, pickMaterial);
  trayPick.name = `grow_tray_pick:${trayBuiltinId}`;
  fitBalconyGrowTrayInteractionPick(decorGroup, trayPick);
  trayPick.userData.mammothGrowTrayId = trayBuiltinId;
  trayPick.userData.mammothGrowTrayUnitKey = unitKey;
  trayPick.userData.mammothGrowTrayRoot = decorGroup;
  Object.assign(trayPick.userData, growTrayStashPickUserData(unitKey, trayBuiltinId));
  trayPick.layers.set(FP_INTERACTION_PICK_LAYER);
  decorGroup.add(trayPick);
  growTrayPickMeshes.push(trayPick);

  const slotVisualsGroup = new THREE.Group();
  slotVisualsGroup.name = `grow_slot_visuals:${trayBuiltinId}`;
  decorGroup.add(slotVisualsGroup);

  const stageTemplateCache = new Map<string, THREE.Object3D>();
  for (let slot = 0; slot < slotOffsets.length; slot++) {
    const off = slotOffsets[slot];
    if (!off) continue;
    const slotPick = new THREE.Mesh(pickGeometry, pickMaterial);
    slotPick.name = `grow_slot_pick:${trayBuiltinId}:${slot}`;
    fitBalconyGrowSlotInteractionPick(slotPick, off.x, off.z, slotPickSize);
    slotPick.userData.mammothGrowTrayId = trayBuiltinId;
    slotPick.userData.mammothGrowTrayUnitKey = unitKey;
    slotPick.userData.mammothGrowSlotIndex = slot;
    slotPick.userData.mammothGrowTrayRoot = decorGroup;
    Object.assign(slotPick.userData, growTrayStashPickUserData(unitKey, trayBuiltinId));
    slotPick.layers.set(FP_INTERACTION_PICK_LAYER);
    decorGroup.add(slotPick);
    growSlotPickMeshes.push(slotPick);

    const holder = new THREE.Group();
    holder.name = `grow_slot_${slot}`;
    holder.position.set(off.x, soilLocalY, off.z);
    holder.visible = false;
    holder.userData.mammothGrowSlotIndex = slot;

    const plantPick = new THREE.Mesh(pickGeometry, pickMaterial);
    plantPick.name = `grow_plant_pick:${trayBuiltinId}:${slot}`;
    plantPick.visible = false;
    plantPick.userData.mammothGrowTrayId = trayBuiltinId;
    plantPick.userData.mammothGrowTrayUnitKey = unitKey;
    plantPick.userData.mammothGrowSlotIndex = slot;
    plantPick.userData.mammothGrowTrayRoot = decorGroup;
    plantPick.userData.mammothGrowPlantPick = true;
    plantPick.layers.set(FP_INTERACTION_PICK_LAYER);
    holder.add(plantPick);
    growPlantPickMeshes.push(plantPick);

    slotVisualsGroup.add(holder);
  }

  return {
    growTrayPickMeshes,
    growSlotPickMeshes,
    growPlantPickMeshes,
    slotVisualsGroup,
    trayBuiltinId,
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
    Math.max(0.08, _plantPickSizeScratch.x / _plantPickWorldScaleScratch.x),
    Math.max(0.12, _plantPickSizeScratch.y / _plantPickWorldScaleScratch.y),
    Math.max(0.08, _plantPickSizeScratch.z / _plantPickWorldScaleScratch.z),
  );
  plantPick.visible = true;
}

export async function syncGrowSlotVisuals(
  slotVisualsGroup: THREE.Group,
  plants: readonly BalconyGrowPlant[],
  trayId: string,
  trayWaterLiters: number,
  fertilizerPresent: boolean,
  loader: GLTFLoader,
  stageTemplateCache: Map<string, THREE.Object3D>,
): Promise<void> {
  const now = Date.now() * 1000;
  for (const holder of slotVisualsGroup.children) {
    if (!(holder instanceof THREE.Group)) continue;
    const slot = holder.userData.mammothGrowSlotIndex as number | undefined;
    if (slot === undefined) continue;
    const plant = plants.find((p) => p.trayId === trayId && p.slotIndex === slot);
    while (holder.children.length > 0) {
      const c = holder.children[0]!;
      holder.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.dispose();
        }
      });
    }
    const plantPick = holder.children.find(
      (child): child is THREE.Mesh =>
        child instanceof THREE.Mesh && child.userData.mammothGrowPlantPick === true,
    );
    if (plantPick) plantPick.visible = false;

    if (!plant || plant.phase === 0) {
      holder.visible = false;
      continue;
    }
    const plantedAt = Number(plant.plantedAtMicros);
    const matureAt = Number(plant.matureAtMicros);
    const progress =
      matureAt > plantedAt
        ? Math.min(1, (now - plantedAt) / (matureAt - plantedAt))
        : plant.phase === PHASE_MATURE
          ? 1
          : 0;
    const stage = balconyGrowStageFromProgress(progress);
    const url = balconyGrowStageGlb(stage);
    let template = stageTemplateCache.get(url);
    if (!template) {
      try {
        const gltf = await loader.loadAsync(url);
        template = gltf.scene;
        stageTemplateCache.set(url, template);
      } catch (err) {
        console.warn("[balcony-grow] failed to load stage mesh", url, err);
        holder.visible = false;
        continue;
      }
    }
    const def = getMammothItemDef(plant.cropDefId);
    const tint = def?.balconyGrow?.stageTint ?? "#3d8b4a";
    const cropScale = def?.balconyGrow?.stageScale ?? 1;
    let stageScale = balconyGrowStageVisualScale(stage, cropScale);
    const trayRoot = slotVisualsGroup.parent;
    if (trayRoot) {
      readDecorVisualLocalBounds(trayRoot, _trayBoundsScratch);
      if (!_trayBoundsScratch.isEmpty()) {
        _trayBoundsScratch.getSize(_traySizeScratch);
        stageScale = Math.max(
          stageScale,
          _traySizeScratch.y * 0.12,
          _traySizeScratch.x * 0.06,
        );
      }
    }
    const visual = mountBalconyGrowStageVisual(
      holder,
      template,
      stage,
      stageScale,
      tint,
      plant.phase === PHASE_MATURE,
    );
    holder.visible = true;
    if (plantPick) fitGrowPlantInteractionPick(holder, visual, plantPick);
  }

  decorMoistureAndFertilizerHints(slotVisualsGroup.parent, trayWaterLiters, fertilizerPresent);
}

function decorMoistureAndFertilizerHints(
  trayGroup: THREE.Object3D | null,
  waterLiters: number,
  fertilizerPresent: boolean,
): void {
  if (!trayGroup) return;
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
