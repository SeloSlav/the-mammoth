import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  attachApartmentWarmFixtureBulbGlow,
  bindMammothApartmentPropReadableEnv,
  moodGradeMammothApartmentDecorMesh,
  prepareMammothApartmentInteriorContentRoots,
  syncApartmentInteriorPracticalLighting,
  type ApartmentPracticalLightsMount,
} from "@the-mammoth/engine";
import { resolveOwnedApartmentDecorRootScale } from "@the-mammoth/schemas";
import { postProcessApartmentDecorGltfScene, ENABLE_STAIRWELL_AND_CORRIDOR_CEILING_LIGHTS, ENABLE_RUNTIME_SHARED_STATIC_FIXTURE_PRACTICAL_LIGHTS } from "@the-mammoth/world";
import { apartmentDecorFetchPath } from "../fpApartment/fpApartmentDecorAssets.js";
import { disposeStaticWorldObjectTree } from "./fpSessionStaticWorldDispose.js";
import {
  resolveFpFloor19CorridorAuthoringContext,
  resolveFpFloor19CorridorDecorPlacements,
  type FpFloor19CorridorDecorPlacement,
} from "./fpFloor19CorridorBuiltinsFromContent.js";

export const FP_FLOOR_19_CORRIDOR_DECOR_ROOT_NAME = "fp_floor_19_corridor_decor";

const _fixtureBoundsScratch = new THREE.Box3();
const _fixtureCenterWorldScratch = new THREE.Vector3();
const _fixtureCenterLocalScratch = new THREE.Vector3();

export type FpSessionCorridorCeilingLightsMount = {
  ready: Promise<void>;
  dispose: () => void;
};

function prepCorridorDecorTemplate(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = false;
    obj.receiveShadow = false;
  });
}

function prepCorridorDecorVisual(root: THREE.Object3D, modelRelPath: string): void {
  root.userData.mammothApartmentDecorProp = true;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    moodGradeMammothApartmentDecorMesh(obj, { modelRelPath });
    obj.userData.mammothUnitInterior = true;
  });
  attachApartmentWarmFixtureBulbGlow(root, modelRelPath);
}

function centerFixtureVisualBoundsOnPlacementRoot(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  _fixtureBoundsScratch.setFromObject(root);
  if (_fixtureBoundsScratch.isEmpty()) return;
  _fixtureBoundsScratch.getCenter(_fixtureCenterWorldScratch);
  _fixtureCenterLocalScratch.copy(_fixtureCenterWorldScratch);
  root.worldToLocal(_fixtureCenterLocalScratch);
  for (const child of root.children) {
    child.position.sub(_fixtureCenterLocalScratch);
  }
  root.updateMatrixWorld(true);
}

function corridorDecorPlacementGroups(root: THREE.Group): THREE.Group[] {
  return root.children.filter(
    (child): child is THREE.Group =>
      child instanceof THREE.Group &&
      typeof child.userData.mammothApartmentDecorModelRelPath === "string",
  );
}

function bindCorridorDecorReadableEnv(
  buildingRoot: THREE.Group,
  decorRoot: THREE.Group,
): void {
  let scene: THREE.Scene | null = null;
  for (let cur: THREE.Object3D | null = buildingRoot; cur; cur = cur.parent) {
    if (cur instanceof THREE.Scene) {
      scene = cur;
      break;
    }
  }
  if (!scene) return;
  const tex = scene.userData.mammothFpMetallicReadableEnv;
  bindMammothApartmentPropReadableEnv(
    decorRoot,
    tex instanceof THREE.Texture ? tex : null,
  );
}

function applyCorridorDecorRootScale(
  root: THREE.Group,
  placement: FpFloor19CorridorDecorPlacement,
): void {
  const scale = resolveOwnedApartmentDecorRootScale({
    uniformScale: placement.uniformScale,
    verticalScaleMul: placement.verticalScaleMul,
    scaleX: placement.scaleX,
    scaleY: placement.scaleY,
    scaleZ: placement.scaleZ,
  });
  root.scale.set(scale.x, scale.y, scale.z);
}

function mountCorridorDecorPlacement(
  root: THREE.Group,
  template: THREE.Object3D,
  placement: FpFloor19CorridorDecorPlacement,
): void {
  const fixtureRoot = new THREE.Group();
  fixtureRoot.name = `fp_floor_19_corridor_decor_${placement.id}`;
  fixtureRoot.position.fromArray(placement.position);
  fixtureRoot.rotation.order = "YXZ";
  fixtureRoot.rotation.set(placement.pitchRad, placement.yawRad, placement.rollRad);
  applyCorridorDecorRootScale(fixtureRoot, placement);
  fixtureRoot.userData.mammothApartmentDecorModelRelPath = placement.modelRelPath;

  const fixtureVisual = template.clone(true);
  prepCorridorDecorVisual(fixtureVisual, placement.modelRelPath);
  fixtureRoot.add(fixtureVisual);
  centerFixtureVisualBoundsOnPlacementRoot(fixtureRoot);
  root.add(fixtureRoot);
}

export function mountFpFloor19CorridorCeilingLights(args: {
  buildingRoot: THREE.Group;
}): FpSessionCorridorCeilingLightsMount {
  if (!ENABLE_STAIRWELL_AND_CORRIDOR_CEILING_LIGHTS) {
    return {
      ready: Promise.resolve(),
      dispose: () => {},
    };
  }

  const root = new THREE.Group();
  root.name = FP_FLOOR_19_CORRIDOR_DECOR_ROOT_NAME;
  args.buildingRoot.add(root);

  let disposed = false;
  let practicalLights: ApartmentPracticalLightsMount | null = null;
  const loader = new GLTFLoader();
  const ready = resolveFpFloor19CorridorAuthoringContext()
    .then(async ({ doc, footprint }) => {
      if (disposed) return;
      const placements = resolveFpFloor19CorridorDecorPlacements({ doc, footprint });
      if (placements.length === 0) return;

      const templates = new Map<string, THREE.Object3D>();
      for (const modelRelPath of [...new Set(placements.map((p) => p.modelRelPath))]) {
        const gltf = await loader.loadAsync(apartmentDecorFetchPath(modelRelPath));
        if (disposed) {
          disposeStaticWorldObjectTree(gltf.scene);
          return;
        }
        postProcessApartmentDecorGltfScene(gltf.scene, modelRelPath);
        prepCorridorDecorTemplate(gltf.scene);
        templates.set(modelRelPath, gltf.scene);
      }

      if (disposed) return;
      for (const placement of placements) {
        const template = templates.get(placement.modelRelPath);
        if (!template) continue;
        mountCorridorDecorPlacement(root, template, placement);
      }

      prepareMammothApartmentInteriorContentRoots({
        shellRoot: args.buildingRoot,
        decorRoot: root,
      });
      bindCorridorDecorReadableEnv(args.buildingRoot, root);
      if (ENABLE_RUNTIME_SHARED_STATIC_FIXTURE_PRACTICAL_LIGHTS) {
        practicalLights = syncApartmentInteriorPracticalLighting({
          lightParent: root,
          maxWindowLights: 0,
          decorGroups: corridorDecorPlacementGroups(root),
          includeStaticFixturePracticalLights: true,
          includeDynamicDecorPracticalLights: false,
          previous: practicalLights,
        });
      }
    })
    .catch((error: unknown) => {
      console.warn("[fpSession] failed to mount floor 19 corridor decor", error);
    });

  return {
    ready,
    dispose: () => {
      disposed = true;
      practicalLights?.dispose();
      practicalLights = null;
      args.buildingRoot.remove(root);
      disposeStaticWorldObjectTree(root);
      root.clear();
    },
  };
}
