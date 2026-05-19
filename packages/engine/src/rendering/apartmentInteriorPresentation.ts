import * as THREE from "three";
import { fpLocomotionConstants } from "../fpLocomotion.js";
import {
  MAMMOTH_FP_VIEWMODEL_RENDER_LAYER,
  tagApartmentDecorPropMeshesForInteriorLighting,
  tagResidentialUnitInteriorMeshesUnder,
  syncMammothApartmentInteriorViewLayers,
} from "./apartmentInteriorLayers.js";
import {
  bindMammothApartmentPropReadableEnv,
  isApartmentInteriorShellMesh,
  MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD,
} from "./bindMammothApartmentDecorIndirectEnv.js";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  mammothApartmentInteriorBlend01,
} from "./apartmentInteriorVisualProfile.js";
import {
  applyMammothApartmentInteriorScene,
  syncMammothApartmentInteriorMetallicEnv,
  type MammothApartmentInteriorAtmosphereRestore,
  type MammothApartmentInteriorBounceRig,
  type MammothApartmentInteriorGlobalRig,
} from "./apartmentInteriorSceneLighting.js";

const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _look = new THREE.Vector3();
const _camPos = new THREE.Vector3();

/** Mark shell meshes so PMREM bind matches FP megablock shells. */
export function tagMammothApartmentInteriorShellRoot(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (isApartmentInteriorShellMesh(obj)) {
      obj.userData[MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD] = true;
    }
  });
}

/**
 * Layer tags for shell (3) + decor props (5). Call after geometry mount, before env bind.
 */
export function prepareMammothApartmentInteriorContentRoots(input: {
  shellRoot: THREE.Object3D;
  decorRoot?: THREE.Object3D | null;
}): void {
  tagMammothApartmentInteriorShellRoot(input.shellRoot);
  tagResidentialUnitInteriorMeshesUnder(input.shellRoot);
  if (!input.decorRoot) return;
  tagResidentialUnitInteriorMeshesUnder(input.decorRoot);
  tagApartmentDecorPropMeshesForInteriorLighting(input.decorRoot);
}

export type MammothApartmentInteriorPresentationInput = {
  scene: THREE.Scene;
  renderer: THREE.WebGPURenderer;
  /** Raw 0..1; editor layout uses `1`, FP uses doorway proximity. */
  interiorProximity01: number;
  bounce: MammothApartmentInteriorBounceRig;
  global?: MammothApartmentInteriorGlobalRig;
  exteriorLightScale?: number;
  pmremTexture: THREE.Texture | null;
  shellRoots: readonly THREE.Object3D[];
  decorRoots: readonly THREE.Object3D[];
  /** FP hands/weapon on layer {@link MAMMOTH_FP_VIEWMODEL_RENDER_LAYER}. */
  viewmodelRoots?: readonly THREE.Object3D[];
  view?: {
    camera: THREE.Camera;
    raycasters?: readonly THREE.Raycaster[];
  };
  atmosphereRestore?: MammothApartmentInteriorAtmosphereRestore;
};

/** Same PMREM as decor/shell so metal/rough PBR on the viewmodel matches the flat. */
export function bindMammothApartmentInteriorViewmodelEnv(
  viewmodelRoot: THREE.Object3D,
  envTexture: THREE.Texture | null,
): void {
  viewmodelRoot.traverse((obj) => {
    obj.layers.enable(MAMMOTH_FP_VIEWMODEL_RENDER_LAYER);
  });
  bindMammothApartmentPropReadableEnv(viewmodelRoot, envTexture);
}

/**
 * **The** editor + FP apartment interior pipeline: scene lights, atmosphere, PMREM, view layers.
 */
export function applyMammothApartmentInteriorPresentation(
  input: MammothApartmentInteriorPresentationInput,
): number {
  input.scene.environment = null;

  const interior01 = applyMammothApartmentInteriorScene({
    scene: input.scene,
    renderer: input.renderer,
    interiorProximity01: input.interiorProximity01,
    bounce: input.bounce,
    global: input.global,
    exteriorLightScale: input.exteriorLightScale,
    atmosphereRestore: input.atmosphereRestore,
  });

  syncMammothApartmentInteriorMetallicEnv({
    scene: input.scene,
    envTexture: input.pmremTexture,
    decorRoots: input.decorRoots,
    shellRoots: input.shellRoots,
  });
  if (input.viewmodelRoots) {
    for (const root of input.viewmodelRoots) {
      bindMammothApartmentInteriorViewmodelEnv(root, input.pmremTexture);
    }
  }

  const viewActive =
    interior01 > APARTMENT_INTERIOR_VISUAL_PROFILE.scene.atmosphereActiveThreshold;
  if (input.view) {
    syncMammothApartmentInteriorViewLayers(input.view, viewActive);
  }

  return interior01;
}

/** Editor layout: full flat lighting (what FP uses at `interiorProximity01 === 1`). */
export function applyMammothApartmentInteriorEditorLayoutPresentation(
  input: Omit<MammothApartmentInteriorPresentationInput, "interiorProximity01">,
): number {
  return applyMammothApartmentInteriorPresentation({
    ...input,
    interiorProximity01: 1,
  });
}

/**
 * Orbit camera at FP eye height inside the unit — avoids bird's-eye preview that reads brighter
 * than standing in the flat.
 */
export function frameMammothApartmentInteriorGameplayPreview(input: {
  camera: THREE.PerspectiveCamera;
  orbitControls: { target: THREE.Vector3; update: () => void };
  shellRoot: THREE.Object3D;
  eyeHeightM?: number;
}): void {
  _box.setFromObject(input.shellRoot);
  if (_box.isEmpty()) return;

  _box.getCenter(_center);
  _box.getSize(_size);
  const eyeY = _box.min.y + (input.eyeHeightM ?? 1.55);
  _look.set(_center.x, eyeY, _center.z);

  const span = Math.max(_size.x, _size.z, 2.5);
  const dist = THREE.MathUtils.clamp(span * 0.42, 2.8, 7.5);
  _camPos.set(_center.x + dist * 0.55, eyeY, _center.z + dist * 0.55);

  input.camera.up.set(0, 1, 0);
  input.orbitControls.target.copy(_look);
  input.camera.position.copy(_camPos);
  input.camera.lookAt(_look);
  input.camera.fov = fpLocomotionConstants.cameraFovDeg;
  input.camera.updateProjectionMatrix();
  input.orbitControls.update();
}

export { mammothApartmentInteriorBlend01 };
