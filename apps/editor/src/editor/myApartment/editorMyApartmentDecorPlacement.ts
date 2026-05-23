import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { resolveStaticModelFetchUrl } from "@the-mammoth/engine";
import {
  moodGradeMammothApartmentDecorMesh,
  attachApartmentWarmFixtureBulbGlow,
  applyApartmentDecorCastShadowFlags,
} from "@the-mammoth/engine";
import {
  APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH,
  buildProceduralApartmentDecorVisual,
  isProceduralApartmentDecorModelPath,
  postProcessApartmentDecorGltfScene,
  tagProceduralApartmentDecorMeshesSkipMerge,
} from "@the-mammoth/world";
import {
  OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
  type OwnedApartmentBuiltinsDoc,
  type OwnedApartmentPlacedItem,
  ownedApartmentPlacedItemAuthoringAssetVisScale,
} from "@the-mammoth/schemas";
import { demandEditorSceneRender } from "../editorScene/editorSceneRenderDemand.js";
import type { EditorApartmentFishTankBridge } from "./editorApartmentFishTankBridge.js";
import type { OwnedApartmentFractionToPreviewXZ } from "./editorMyApartmentAuthoringShell.js";
import {
  applyMyApartmentDecorRootScaleFromDoc,
  centerDecorVisualBoundsOnRoot,
  clampMyApartmentDecorEulerLimits,
  EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
  previewWorldFromNormalizedPlacement,
} from "./editorMyApartmentDecorClamp.js";
import { editorMyApartmentSelectedIdForDecor } from "./editorMyApartmentSelection.js";
import { listMyApartmentDecorTemplateRelPathsWithDeps } from "./editorOwnedApartmentSceneLayout.js";
import {
  ownedApartmentPlacedItemPoseEqual,
  ownedApartmentPlacedItemStructuralEqual,
} from "./preserveOwnedApartmentMountPlacementRefs.js";
import type { EditorMyApartmentFurnitureMount } from "./editorMyApartmentMeshes.js";

export type EditorMyApartmentDecorTemplateMap = Map<string, THREE.Object3D>;

export function disposeGroupSubtreeGeometry(group: THREE.Object3D): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}

function cloneApartmentDecorTemplateMeshResources(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry = o.geometry.clone();
    if (Array.isArray(o.material)) {
      o.material = o.material.map((material) => material.clone());
    } else {
      o.material = o.material.clone();
    }
  });
}

function cloneProp(template: THREE.Object3D, modelRelPath: string): THREE.Object3D {
  const r = template.clone(true);
  cloneApartmentDecorTemplateMeshResources(r);
  r.userData.mammothEditorMyApartmentProp = true;
  if (isProceduralApartmentDecorModelPath(modelRelPath)) {
    tagProceduralApartmentDecorMeshesSkipMerge(r);
  }
  r.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      moodGradeMammothApartmentDecorMesh(o, { modelRelPath });
    }
  });
  attachApartmentWarmFixtureBulbGlow(r, modelRelPath);
  return r;
}

function decorAssetUrl(modelRelPath: string): string {
  return `/${modelRelPath.trim().replace(/^\/+/u, "")}`;
}

function editorAuthoringVisScaleForPlacedItemKind(kind: OwnedApartmentPlacedItem["itemKind"]): number {
  return ownedApartmentPlacedItemAuthoringAssetVisScale(kind);
}

function placeDecorGroup(args: {
  group: THREE.Group;
  template: THREE.Object3D;
  decor: OwnedApartmentPlacedItem;
  spans: OwnedApartmentFractionToPreviewXZ;
  fishTankBridge: EditorApartmentFishTankBridge;
  fishSwimmerTemplate?: THREE.Object3D;
}): void {
  const { group, template, decor, spans, fishTankBridge, fishSwimmerTemplate } = args;
  disposeGroupSubtreeGeometry(group);
  group.clear();
  group.userData.mammothEditorMyApartmentProp = true;
  group.userData.mammothEditorMyApartmentDecorId = decor.id;
  group.userData.mammothApartmentDecorModelRelPath = decor.modelRelPath;
  applyDecorGroupPoseFromDoc({ group, decor, spans });
  const vis = cloneProp(template, decor.modelRelPath);
  vis.scale.setScalar(editorAuthoringVisScaleForPlacedItemKind(decor.itemKind));
  group.add(vis);
  centerDecorVisualBoundsOnRoot(group);
  clampMyApartmentDecorEulerLimits(group);
  applyApartmentDecorCastShadowFlags(group, decor.modelRelPath);

  fishTankBridge.tryMountOnTankVisual({
    decorModelRelPath: decor.modelRelPath,
    tankVisualRoot: vis,
    decorId: decor.id,
    fishTemplateRoot: fishSwimmerTemplate,
    decorateSwimmerMesh: (mesh) =>
      moodGradeMammothApartmentDecorMesh(mesh, {
        modelRelPath: APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH,
      }),
    onFirstSchoolMounted: () => {
      demandEditorSceneRender();
    },
  });
}

/** Pose-only update — keeps meshes/materials (and PMREM env bind) intact. */
export function applyDecorGroupPoseFromDoc(args: {
  group: THREE.Group;
  decor: OwnedApartmentPlacedItem;
  spans: OwnedApartmentFractionToPreviewXZ;
}): void {
  const { group, decor, spans } = args;
  const pv = previewWorldFromNormalizedPlacement({
    spans,
    fx: decor.fx,
    fz: decor.fz,
  });
  group.position.set(pv.x, EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + decor.dy, pv.z);
  group.rotation.order = "YXZ";
  const yaw = decor.yawRad;
  const pitch = THREE.MathUtils.clamp(
    decor.pitchRad,
    -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
    OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  );
  const roll = THREE.MathUtils.clamp(
    decor.rollRad ?? 0,
    -OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
    OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
  );
  group.rotation.set(pitch, yaw, roll, "YXZ");
  applyMyApartmentDecorRootScaleFromDoc(group, {
    uniformScale: decor.uniformScale,
    verticalScaleMul: decor.verticalScaleMul ?? 1,
    scaleX: decor.scaleX,
    scaleY: decor.scaleY,
    scaleZ: decor.scaleZ,
  });
}

export function editorMyApartmentDecorGroups(
  selectionGroups: Record<string, THREE.Group>,
): THREE.Group[] {
  return Object.values(selectionGroups).filter(
    (group) => typeof group.userData.mammothApartmentDecorModelRelPath === "string",
  );
}

export function mountIdSet(ids: readonly { id: string }[]): Set<string> {
  return new Set(ids.map((x) => x.id));
}

/** Add/update/remove décor groups without rebuilding walls/mirrors or reloading GLB templates. */
export function syncEditorMyApartmentDecorOnMount(
  mount: EditorMyApartmentFurnitureMount,
  decorTemplates: EditorMyApartmentDecorTemplateMap,
  doc: OwnedApartmentBuiltinsDoc,
  spans: OwnedApartmentFractionToPreviewXZ,
  prevPlacedItems?: readonly OwnedApartmentPlacedItem[],
): { structuralRebuild: boolean } {
  const fishSwimmerTemplate =
    decorTemplates.get(APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH) ?? undefined;
  const prevById = new Map((prevPlacedItems ?? []).map((item) => [item.id, item]));
  let structuralRebuild = false;
  const nextIds = new Set(doc.placedItems.map((d) => d.id));
  for (const decor of doc.placedItems) {
    const template = decorTemplates.get(decor.modelRelPath);
    if (!template) continue;
    const selId = editorMyApartmentSelectedIdForDecor(decor.id);
    let group = mount.selectionGroups[selId];
    const prev = prevById.get(decor.id);
    if (!group) {
      group = new THREE.Group();
      group.name = `editor_my_apartment_placed:${decor.id}`;
      mount.root.add(group);
      mount.selectionGroups[selId] = group;
      placeDecorGroup({
        group,
        template,
        decor,
        spans,
        fishTankBridge: mount.fishTankBridge,
        fishSwimmerTemplate,
      });
      structuralRebuild = true;
      continue;
    }
    if (!prev || !ownedApartmentPlacedItemStructuralEqual(prev, decor)) {
      placeDecorGroup({
        group,
        template,
        decor,
        spans,
        fishTankBridge: mount.fishTankBridge,
        fishSwimmerTemplate,
      });
      structuralRebuild = true;
      continue;
    }
    if (!ownedApartmentPlacedItemPoseEqual(prev, decor)) {
      applyDecorGroupPoseFromDoc({ group, decor, spans });
      centerDecorVisualBoundsOnRoot(group);
      clampMyApartmentDecorEulerLimits(group);
    }
  }
  for (const id of mount.mountedDecorIds) {
    if (nextIds.has(id)) continue;
    structuralRebuild = true;
    mount.fishTankBridge.removeByDecorId(id);
    const selId = editorMyApartmentSelectedIdForDecor(id);
    const group = mount.selectionGroups[selId];
    if (group) {
      disposeGroupSubtreeGeometry(group);
      mount.root.remove(group);
      delete mount.selectionGroups[selId];
    }
  }
  mount.mountedDecorIds = nextIds;
  return { structuralRebuild };
}

const editorMyApartmentDecorTemplatePromises = new Map<string, Promise<THREE.Object3D>>();

export function listMissingEditorDecorTemplatePaths(
  doc: OwnedApartmentBuiltinsDoc,
  templates: EditorMyApartmentDecorTemplateMap,
): string[] {
  return listMyApartmentDecorTemplateRelPathsWithDeps(doc).filter((path) => !templates.has(path));
}

/** Loads any catalog paths not yet in `templates` (e.g. after Import in the same session). */
export async function loadMissingEditorDecorTemplates(
  templates: EditorMyApartmentDecorTemplateMap,
  modelRelPaths: readonly string[],
): Promise<void> {
  const missing = [...new Set(modelRelPaths)].filter((path) => !templates.has(path));
  if (missing.length === 0) return;
  const loaded = await loadEditorMyApartmentDecorTemplates(missing);
  for (const [path, scene] of loaded) {
    templates.set(path, scene);
  }
}

export async function loadEditorMyApartmentDecorTemplates(
  modelRelPaths: readonly string[],
): Promise<EditorMyApartmentDecorTemplateMap> {
  const gltfLoader = new GLTFLoader();
  const objLoader = new OBJLoader();
  const out: EditorMyApartmentDecorTemplateMap = new Map();
  await Promise.all(
    [...new Set(modelRelPaths)].map(async (modelRelPath) => {
      try {
        const procedural = buildProceduralApartmentDecorVisual(modelRelPath);
        if (procedural) {
          out.set(modelRelPath, procedural);
          return;
        }
        const url = await resolveStaticModelFetchUrl(decorAssetUrl(modelRelPath));
        let pending = editorMyApartmentDecorTemplatePromises.get(url);
        if (!pending) {
          const loadPromise = modelRelPath.toLowerCase().endsWith(".obj")
            ? objLoader.loadAsync(url)
            : gltfLoader.loadAsync(url).then((gltf) => {
                postProcessApartmentDecorGltfScene(gltf.scene, modelRelPath);
                return gltf.scene;
              });
          pending = loadPromise.catch((err: unknown) => {
            editorMyApartmentDecorTemplatePromises.delete(url);
            throw err;
          });
          editorMyApartmentDecorTemplatePromises.set(url, pending);
        }
        out.set(modelRelPath, await pending);
      } catch (err) {
        console.warn(
          `[editor] Failed to load decor model ${modelRelPath}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );
  return out;
}

export { placeDecorGroup };
