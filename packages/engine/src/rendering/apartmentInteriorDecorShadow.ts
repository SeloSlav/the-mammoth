import * as THREE from "three";
import { MAMMOTH_APARTMENT_INTERIOR_LIGHT_LAYER_MASK } from "./apartmentInteriorLayers.js";
import { MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_UD } from "./apartmentDecorMoodGrade.js";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  apartmentDecorContactShadowEligible,
  type ApartmentUnitWorldBounds,
} from "./apartmentInteriorVisualProfile.js";

const SHADOW_LIGHT_NAME = "apartment_decor_shadow_light";

const _boundsScratch = new THREE.Box3();
const _centerScratch = new THREE.Vector3();
const _sizeScratch = new THREE.Vector3();
const _worldScratch = new THREE.Vector3();

export type ApartmentDecorShadowRigMount = {
  light: THREE.DirectionalLight;
  dispose: () => void;
};

export function isApartmentInteriorFloorShellMesh(mesh: THREE.Mesh): boolean {
  const name = mesh.name;
  return name.startsWith("shell_floor") || name === "editor_owned_apartment_floor";
}

/** Shared filter for decor floor-shadow geometry (realtime + baked overlay). */
export function apartmentDecorMeshShouldCastFloorShadow(mesh: THREE.Mesh): boolean {
  if (mesh.userData[MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_UD] === true) return false;
  if (mesh.userData.mammothSkipFloorGeometryMerge === true) {
    const mat = mesh.material;
    const mats = Array.isArray(mat) ? mat : [mat];
    for (const m of mats) {
      if (m instanceof THREE.Material && m.transparent && "opacity" in m && m.opacity === 0) {
        return false;
      }
    }
  }
  return true;
}

/** Enable shadow cast/receive flags on decor meshes (silhouette-accurate grounding). */
export function applyApartmentDecorCastShadowFlags(
  decorRoot: THREE.Object3D,
  modelRelPath: string,
): void {
  const enabled = APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow.enabled;
  const cast = enabled && apartmentDecorContactShadowEligible(modelRelPath);
  decorRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!apartmentDecorMeshShouldCastFloorShadow(obj)) {
      obj.castShadow = false;
      return;
    }
    obj.castShadow = cast;
    /** Rugs and other floor props must receive shadows from taller casters above them. */
    obj.receiveShadow = enabled;
  });
}

/** Shell floor plates receive the decor shadow pass. */
export function applyApartmentInteriorFloorReceiveShadowUnder(root: THREE.Object3D): void {
  if (!APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow.enabled) return;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!isApartmentInteriorFloorShellMesh(obj)) return;
    obj.receiveShadow = true;
  });
}

const _lightLocalPos = new THREE.Vector3();
const _lightTargetLocalPos = new THREE.Vector3();
const _parentInv = new THREE.Matrix4();

function worldPointToLightParentLocal(
  parent: THREE.Object3D,
  world: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  parent.updateMatrixWorld(true);
  _parentInv.copy(parent.matrixWorld).invert();
  return out.copy(world).applyMatrix4(_parentInv);
}

function fitDecorShadowCamera(
  light: THREE.DirectionalLight,
  lightParent: THREE.Object3D,
  bounds: ApartmentUnitWorldBounds,
): void {
  const cfg = APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow;
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cz = (bounds.minZ + bounds.maxZ) * 0.5;
  const halfX = (bounds.maxX - bounds.minX) * 0.5 + cfg.cameraPaddingM;
  const halfZ = (bounds.maxZ - bounds.minZ) * 0.5 + cfg.cameraPaddingM;
  const half = Math.max(halfX, halfZ, 1.5);

  worldPointToLightParentLocal(
    lightParent,
    _worldScratch.set(cx, bounds.maxY + cfg.cameraHeightM, cz),
    _lightLocalPos,
  );
  worldPointToLightParentLocal(
    lightParent,
    _centerScratch.set(cx, bounds.minY, cz),
    _lightTargetLocalPos,
  );
  light.position.copy(_lightLocalPos);
  light.target.position.copy(_lightTargetLocalPos);
  light.target.updateMatrixWorld();

  const cam = light.shadow.camera;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = 0.25;
  cam.far = cfg.cameraHeightM + (bounds.maxY - bounds.minY) + 2;
  cam.updateProjectionMatrix();
}

function fitDecorShadowCameraFromDecorGroups(
  light: THREE.DirectionalLight,
  lightParent: THREE.Object3D,
  decorGroups: readonly THREE.Object3D[],
  paddingM: number,
): boolean {
  _boundsScratch.makeEmpty();
  for (const group of decorGroups) {
    group.updateMatrixWorld(true);
    _boundsScratch.union(_boundsScratch.setFromObject(group));
  }
  if (_boundsScratch.isEmpty()) return false;

  _boundsScratch.getCenter(_centerScratch);
  _boundsScratch.getSize(_sizeScratch);
  const half = Math.max(_sizeScratch.x, _sizeScratch.z) * 0.5 + paddingM;
  const cfg = APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow;

  worldPointToLightParentLocal(
    lightParent,
    _worldScratch.set(
      _centerScratch.x,
      _boundsScratch.max.y + cfg.cameraHeightM,
      _centerScratch.z,
    ),
    _lightLocalPos,
  );
  worldPointToLightParentLocal(
    lightParent,
    _worldScratch.set(_centerScratch.x, _boundsScratch.min.y, _centerScratch.z),
    _lightTargetLocalPos,
  );
  light.position.copy(_lightLocalPos);
  light.target.position.copy(_lightTargetLocalPos);
  light.target.updateMatrixWorld();

  const cam = light.shadow.camera;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = 0.25;
  cam.far = cfg.cameraHeightM + _sizeScratch.y + 2;
  cam.updateProjectionMatrix();
  return true;
}

function configureDecorShadowLight(light: THREE.DirectionalLight): void {
  const cfg = APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow;
  light.color.setHex(cfg.lightColor);
  light.intensity = cfg.lightIntensity;
  light.castShadow = true;
  light.layers.mask = MAMMOTH_APARTMENT_INTERIOR_LIGHT_LAYER_MASK;

  light.shadow.mapSize.set(cfg.mapSize, cfg.mapSize);
  light.shadow.bias = cfg.bias;
  light.shadow.normalBias = cfg.normalBias;
  light.shadow.radius = cfg.radius;
  light.shadow.autoUpdate = true;
  light.shadow.needsUpdate = true;
}

export function ensureMammothApartmentDecorShadowRenderer(
  renderer: THREE.WebGPURenderer,
): void {
  if (!APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow.enabled) return;
  renderer.shadowMap.enabled = true;
  requestMammothRendererShadowMapUpdate(renderer);
}

/**
 * One downward directional shadow pass for static decor in a unit — baked once per layout change
 * (`renderer.shadowMap.autoUpdate = false`, `needsUpdate = true` after sync).
 */
export function syncApartmentDecorShadowRig(input: {
  /** Usually the unit shell root — same space as decor bounds. */
  lightParent: THREE.Object3D;
  decorGroups: readonly THREE.Object3D[];
  unitBounds?: ApartmentUnitWorldBounds;
  previous?: ApartmentDecorShadowRigMount | null;
}): ApartmentDecorShadowRigMount | null {
  input.previous?.dispose();

  if (!APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow.enabled) {
    return null;
  }

  const useRealtime = APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow.realtimeShadowMap;
  if (!useRealtime) {
    for (const group of input.decorGroups) {
      const modelRelPath = group.userData.mammothApartmentDecorModelRelPath;
      if (typeof modelRelPath !== "string") continue;
      applyApartmentDecorCastShadowFlags(group, modelRelPath);
    }
    return null;
  }

  for (const group of input.decorGroups) {
    const modelRelPath = group.userData.mammothApartmentDecorModelRelPath;
    if (typeof modelRelPath !== "string") continue;
    applyApartmentDecorCastShadowFlags(group, modelRelPath);
  }

  const eligibleDecor = input.decorGroups.filter((group) => {
    const modelRelPath = group.userData.mammothApartmentDecorModelRelPath;
    return (
      typeof modelRelPath === "string" &&
      apartmentDecorContactShadowEligible(modelRelPath)
    );
  });
  if (eligibleDecor.length === 0) {
    return null;
  }

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.name = SHADOW_LIGHT_NAME;
  configureDecorShadowLight(light);

  const cfg = APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow;
  let fitted = fitDecorShadowCameraFromDecorGroups(
    light,
    input.lightParent,
    eligibleDecor,
    cfg.cameraPaddingM,
  );
  if (!fitted && input.unitBounds) {
    fitDecorShadowCamera(light, input.lightParent, input.unitBounds);
    fitted = true;
  }
  if (!fitted) {
    light.dispose();
    return null;
  }

  input.lightParent.add(light);
  input.lightParent.add(light.target);

  return {
    light,
    dispose: () => {
      input.lightParent.remove(light, light.target);
      light.dispose();
    },
  };
}

export function requestMammothRendererShadowMapUpdate(renderer: THREE.WebGPURenderer): void {
  if (!APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow.enabled) return;
  const shadowMap = renderer.shadowMap as typeof renderer.shadowMap & {
    needsUpdate?: boolean;
  };
  if (!shadowMap.enabled) return;
  shadowMap.needsUpdate = true;
}
