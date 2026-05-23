import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  BALCONY_GROW_TRAY_MAX_WATER_L,
  balconyGrowDecorTrayId,
  balconyGrowStageFromDays,
  balconyGrowStageVisualScale,
  balconyGrowTrayStashKey,
  ownedApartmentPlacedItemAuthoringAssetVisScale,
} from "@the-mammoth/schemas";
import {
  moodGradeMammothApartmentDecorMesh,
  resolveStaticModelFetchUrl,
} from "@the-mammoth/engine";
import { getMammothItemDef } from "../../inventory/mammothItemCatalog";
import { APARTMENT_STASH_KIND_GROW_TRAY } from "../fpApartment/fpApartmentStashKey.js";
import { apartmentDecorFetchPath } from "../fpApartment/fpApartmentDecorAssets.js";
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

export const GROW_TRAY_EMPTY_MODEL_PATH = "static/models/objects/grow-tray-empty.glb";
export const GROW_TRAY_FILLED_MODEL_PATH = "static/models/objects/grow-tray.glb";

type GrowTrayBodyVariant = "empty" | "filled";

const _growTrayBodyGltfLoader = new GLTFLoader();
const _growTrayBodyTemplateByUrl = new Map<string, THREE.Object3D>();
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
  return (
    modelRelPath.includes(GROW_TRAY_EMPTY_MODEL_PATH) ||
    modelRelPath.includes(GROW_TRAY_FILLED_MODEL_PATH)
  );
}

export function growTrayBodyVariantForFertilizer(fertilizerPresent: boolean): GrowTrayBodyVariant {
  return fertilizerPresent ? "filled" : "empty";
}

function growTrayModelPathForVariant(variant: GrowTrayBodyVariant): string {
  return variant === "filled" ? GROW_TRAY_FILLED_MODEL_PATH : GROW_TRAY_EMPTY_MODEL_PATH;
}

function growTrayBodyVariantFromModelPath(modelRelPath: string | undefined): GrowTrayBodyVariant {
  if (modelRelPath?.includes(GROW_TRAY_EMPTY_MODEL_PATH)) return "empty";
  return "filled";
}

async function loadGrowTrayBodyTemplate(modelRelPath: string): Promise<THREE.Object3D> {
  const url = await resolveStaticModelFetchUrl(apartmentDecorFetchPath(modelRelPath));
  let template = _growTrayBodyTemplateByUrl.get(url);
  if (!template) {
    template = (await _growTrayBodyGltfLoader.loadAsync(url)).scene;
    _growTrayBodyTemplateByUrl.set(url, template);
  }
  return template;
}

function ensureGrowTrayBodyRoot(decorGroup: THREE.Group, trayId: string): THREE.Group {
  const existing = decorGroup.userData.mammothGrowTrayBodyRoot as THREE.Group | undefined;
  if (existing) return existing;

  const bodyRoot = new THREE.Group();
  bodyRoot.name = `grow_tray_body:${trayId}`;
  bodyRoot.userData.mammothGrowTrayBodyRoot = true;

  for (const child of [...decorGroup.children]) {
    decorGroup.remove(child);
    bodyRoot.add(child);
  }
  decorGroup.add(bodyRoot);

  const modelPath = decorGroup.userData.mammothApartmentDecorModelRelPath as string | undefined;
  decorGroup.userData.mammothGrowTrayBodyVariant = growTrayBodyVariantFromModelPath(modelPath);
  return bodyRoot;
}

function disposeGrowTrayBodyMeshes(bodyRoot: THREE.Group): void {
  for (const child of [...bodyRoot.children]) {
    bodyRoot.remove(child);
    child.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) mat.dispose();
    });
  }
}

function mountGrowTrayBodyClone(
  template: THREE.Object3D,
  modelRelPath: string,
  bodyRoot: THREE.Group,
): void {
  const clone = template.clone(true);
  clone.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      moodGradeMammothApartmentDecorMesh(o, { modelRelPath });
      o.frustumCulled = true;
    }
  });
  clone.scale.setScalar(ownedApartmentPlacedItemAuthoringAssetVisScale("plain"));
  bodyRoot.add(clone);
}

/** Swap tray body mesh between empty soil and compost-filled variants. */
export function syncGrowTrayBodyVisual(
  decorGroup: THREE.Object3D,
  fertilizerPresent: boolean,
): void {
  const bodyRoot = decorGroup.userData.mammothGrowTrayBodyRoot as THREE.Group | undefined;
  if (!bodyRoot) return;

  const target = growTrayBodyVariantForFertilizer(fertilizerPresent);
  const current = decorGroup.userData.mammothGrowTrayBodyVariant as GrowTrayBodyVariant | undefined;
  if (current === target) return;

  const swapGeneration = ((decorGroup.userData.mammothGrowTrayBodySwapGen as number | undefined) ?? 0) + 1;
  decorGroup.userData.mammothGrowTrayBodySwapGen = swapGeneration;

  const modelRelPath = growTrayModelPathForVariant(target);
  void loadGrowTrayBodyTemplate(modelRelPath)
    .then((template) => {
      if (decorGroup.userData.mammothGrowTrayBodySwapGen !== swapGeneration) return;
      disposeGrowTrayBodyMeshes(bodyRoot);
      mountGrowTrayBodyClone(template, modelRelPath, bodyRoot);
      decorGroup.userData.mammothGrowTrayBodyVariant = target;
      bodyRoot.updateMatrixWorld(true);
    })
    .catch((err) => {
      console.warn("[syncGrowTrayBodyVisual] failed to swap grow-tray body", err);
    });
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

  ensureGrowTrayBodyRoot(decorGroup, trayId);

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

  if (trayRoot) {
    syncGrowTrayBodyVisual(trayRoot, fertilizerPresent);
    decorMoistureHints(trayRoot, trayWaterLiters);
  }
}

function decorMoistureHints(trayGroup: THREE.Object3D, waterLiters: number): void {
  const visualKey = waterLiters.toFixed(2);
  if (trayGroup.userData.mammothGrowMoistureVisualKey === visualKey) return;
  trayGroup.userData.mammothGrowMoistureVisualKey = visualKey;
  trayGroup.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.userData.mammothGrowTraySoilMesh !== true) return;
    if (!(o.material instanceof THREE.MeshStandardMaterial)) return;
    const base = o.userData.mammothGrowTraySoilBaseColor as THREE.Color | undefined;
    if (!base) return;
    o.material.color.copy(base);
    if (waterLiters > 0.3) {
      o.material.color.lerp(new THREE.Color(0x2a1f14), 0.35);
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
