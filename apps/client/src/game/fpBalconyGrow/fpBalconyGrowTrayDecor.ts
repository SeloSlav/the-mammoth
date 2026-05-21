import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  BALCONY_GROW_SLOT_LOCAL_OFFSETS,
  BALCONY_GROW_TRAY_BUILTIN_IDS,
  BALCONY_GROW_TRAY_MAX_WATER_L,
  balconyGrowStageFromProgress,
  balconyGrowTrayStashKey,
} from "@the-mammoth/schemas";
import { balconyGrowStageGlb } from "@the-mammoth/assets";
import { getMammothItemDef } from "../../inventory/mammothItemCatalog";
import { APARTMENT_STASH_KIND_GROW_TRAY } from "../fpApartment/fpApartmentStashKey.js";
import { fitApartmentInteractionPickToObject } from "../fpApartment/fpApartmentInteractionPick.js";
import { FP_INTERACTION_PICK_LAYER } from "../fpSession/fpSessionConstants.js";
import type { BalconyGrowPlant } from "../../module_bindings/types";

const GROW_TRAY_SUFFIX = "grow-tray.glb";
const PHASE_MATURE = 2;

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

  const trayPick = new THREE.Mesh(pickGeometry, pickMaterial);
  trayPick.name = `grow_tray_pick:${trayBuiltinId}`;
  fitApartmentInteractionPickToObject(decorGroup, trayPick, { x: 0.4, y: 0.2, z: 0.4 });
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
  for (let slot = 0; slot < BALCONY_GROW_SLOT_LOCAL_OFFSETS.length; slot++) {
    const off = BALCONY_GROW_SLOT_LOCAL_OFFSETS[slot];
    if (!off) continue;
    const slotPick = new THREE.Mesh(pickGeometry, pickMaterial);
    slotPick.position.set(off.x, 0.08, off.z);
    slotPick.userData.mammothGrowTrayId = trayBuiltinId;
    slotPick.userData.mammothGrowTrayUnitKey = unitKey;
    slotPick.userData.mammothGrowSlotIndex = slot;
    slotPick.userData.mammothGrowTrayRoot = decorGroup;
    slotPick.layers.set(FP_INTERACTION_PICK_LAYER);
    decorGroup.add(slotPick);
    growSlotPickMeshes.push(slotPick);

    const holder = new THREE.Group();
    holder.name = `grow_slot_${slot}`;
    holder.position.set(off.x, 0.02, off.z);
    holder.visible = false;
    holder.userData.mammothGrowSlotIndex = slot;
    slotVisualsGroup.add(holder);
  }

  return {
    growTrayPickMeshes,
    growSlotPickMeshes,
    slotVisualsGroup,
    trayBuiltinId,
  };
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
      const gltf = await loader.loadAsync(url);
      template = gltf.scene;
      stageTemplateCache.set(url, template);
    }
    const def = getMammothItemDef(plant.cropDefId);
    const tint = def?.balconyGrow?.stageTint ?? "#3d8b4a";
    const scale = (def?.balconyGrow?.stageScale ?? 1) * 0.45;
    const vis = template.clone(true);
    vis.scale.setScalar(scale);
    vis.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        o.material = o.material.clone();
        o.material.color.set(tint);
        if (plant.phase === PHASE_MATURE) {
          o.material.emissive.set(tint);
          o.material.emissiveIntensity = 0.12;
        }
      }
    });
    holder.add(vis);
    holder.visible = true;
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
