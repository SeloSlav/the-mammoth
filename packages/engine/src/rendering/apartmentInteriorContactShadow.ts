import * as THREE from "three";
import { MAMMOTH_APARTMENT_DECOR_PROP_LAYER } from "./apartmentInteriorLayers.js";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  apartmentDecorContactShadowEligible,
} from "./apartmentInteriorVisualProfile.js";

const SHADOW_MESH_NAME = "apartment_decor_contact_shadow";
const BATCHED_SHADOW_MESH_NAME = "apartment_decor_contact_shadow_batch";
const BAKED_FLOOR_SHADOW_MESH_NAME = "apartment_decor_baked_floor_shadow";

const _boundsScratch = new THREE.Box3();
const _sizeScratch = new THREE.Vector3();
const _centerScratch = new THREE.Vector3();
const _worldScratch = new THREE.Vector3();
const _matrixScratch = new THREE.Matrix4();
const _positionScratch = new THREE.Vector3();
const _scaleScratch = new THREE.Vector3();
const _quatScratch = new THREE.Quaternion();
const _eulerScratch = new THREE.Euler(-Math.PI / 2, 0, 0);

let sharedUnitCircleGeometry: THREE.CircleGeometry | null = null;
let sharedContactShadowMaterial: THREE.MeshBasicMaterial | null = null;

function sharedContactShadowCircleGeometry(): THREE.CircleGeometry {
  if (!sharedUnitCircleGeometry) {
    sharedUnitCircleGeometry = new THREE.CircleGeometry(1, 16);
  }
  return sharedUnitCircleGeometry;
}

function sharedContactShadowMaterialRef(): THREE.MeshBasicMaterial {
  const cfg = APARTMENT_INTERIOR_VISUAL_PROFILE.contactShadow;
  if (!sharedContactShadowMaterial) {
    sharedContactShadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: cfg.opacity,
      depthWrite: false,
    });
    return sharedContactShadowMaterial;
  }
  sharedContactShadowMaterial.opacity = cfg.opacity;
  sharedContactShadowMaterial.needsUpdate = true;
  return sharedContactShadowMaterial;
}

export function computeApartmentDecorContactShadowRadius(
  decorRoot: THREE.Object3D,
): { center: THREE.Vector3; radius: number; floorWorldY: number } | null {
  decorRoot.updateMatrixWorld(true);
  _boundsScratch.setFromObject(decorRoot);
  if (_boundsScratch.isEmpty()) return null;

  _boundsScratch.getSize(_sizeScratch);
  _boundsScratch.getCenter(_centerScratch);
  const cfg = APARTMENT_INTERIOR_VISUAL_PROFILE.contactShadow;
  const radius = THREE.MathUtils.clamp(
    Math.max(_sizeScratch.x, _sizeScratch.z) * cfg.radiusScale,
    cfg.minRadiusM,
    cfg.maxRadiusM,
  );
  return {
    center: _centerScratch.clone(),
    radius,
    floorWorldY: _boundsScratch.min.y + 0.004,
  };
}

/**
 * Removes contact-shadow meshes left on ancestors by older editor builds (shadow was a sibling of
 * the decor group, so `group.clear()` never deleted it). Safe to call on any apartment preview root.
 */
export function disposeLeakedApartmentDecorContactShadows(sceneRoot: THREE.Object3D): void {
  const leaks: THREE.Object3D[] = [];
  sceneRoot.traverse((ch) => {
    if (ch.name === SHADOW_MESH_NAME || ch.name === BATCHED_SHADOW_MESH_NAME || ch.name === BAKED_FLOOR_SHADOW_MESH_NAME) {
      leaks.push(ch);
    }
  });
  for (const ch of leaks) {
    if (ch instanceof THREE.Mesh || ch instanceof THREE.InstancedMesh) {
      if (ch.geometry !== sharedUnitCircleGeometry) {
        ch.geometry?.dispose();
      }
    }
    ch.removeFromParent();
  }
}

export type ApartmentDecorBatchedContactShadowMount = {
  inst: THREE.InstancedMesh;
  dispose: () => void;
};

function decorGroupsEligibleForContactShadow(
  decorGroups: readonly THREE.Object3D[],
): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (const group of decorGroups) {
    const modelRelPath = group.userData.mammothApartmentDecorModelRelPath;
    if (typeof modelRelPath !== "string") continue;
    if (!apartmentDecorContactShadowEligible(modelRelPath)) continue;
    out.push(group);
  }
  return out;
}

/**
 * One `InstancedMesh` for all floor-standing decor — same look as per-prop blobs without N draw calls.
 */
export function syncApartmentDecorBatchedContactShadows(input: {
  parent: THREE.Object3D;
  decorGroups: readonly THREE.Object3D[];
  previous?: ApartmentDecorBatchedContactShadowMount | null;
}): ApartmentDecorBatchedContactShadowMount | null {
  input.previous?.dispose();

  if (!APARTMENT_INTERIOR_VISUAL_PROFILE.contactShadow.enabled) {
    return null;
  }

  const eligibleGroups = decorGroupsEligibleForContactShadow(input.decorGroups);
  const placements: Array<{ x: number; y: number; z: number; radius: number }> = [];
  for (const group of eligibleGroups) {
    const computed = computeApartmentDecorContactShadowRadius(group);
    if (!computed) continue;
    placements.push({
      x: computed.center.x,
      y: computed.floorWorldY,
      z: computed.center.z,
      radius: computed.radius,
    });
  }

  if (placements.length === 0) {
    return null;
  }

  input.parent.updateMatrixWorld(true);
  const inst = new THREE.InstancedMesh(
    sharedContactShadowCircleGeometry(),
    sharedContactShadowMaterialRef(),
    placements.length,
  );
  inst.name = BATCHED_SHADOW_MESH_NAME;
  inst.renderOrder = -1;
  inst.raycast = () => {};
  inst.frustumCulled = false;
  inst.layers.set(MAMMOTH_APARTMENT_DECOR_PROP_LAYER);

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!;
    _worldScratch.set(p.x, p.y, p.z);
    input.parent.worldToLocal(_worldScratch);
    _positionScratch.copy(_worldScratch);
    _scaleScratch.set(p.radius, p.radius, 1);
    _quatScratch.setFromEuler(_eulerScratch);
    _matrixScratch.compose(_positionScratch, _quatScratch, _scaleScratch);
    inst.setMatrixAt(i, _matrixScratch);
  }
  inst.instanceMatrix.needsUpdate = true;
  input.parent.add(inst);

  return {
    inst,
    dispose: () => {
      inst.removeFromParent();
    },
  };
}

/**
 * @deprecated Prefer {@link syncApartmentDecorBatchedContactShadows} — one draw call for all props.
 */
export function attachApartmentDecorContactShadow(
  decorRoot: THREE.Object3D,
  _floorWorldY: number,
): THREE.Mesh | null {
  if (!APARTMENT_INTERIOR_VISUAL_PROFILE.contactShadow.enabled) {
    return null;
  }

  const prior = decorRoot.getObjectByName(SHADOW_MESH_NAME);
  if (prior) {
    if (prior instanceof THREE.Mesh) prior.geometry?.dispose();
    prior.removeFromParent();
  }

  const computed = computeApartmentDecorContactShadowRadius(decorRoot);
  if (!computed) return null;

  _worldScratch.set(computed.center.x, computed.floorWorldY, computed.center.z);
  decorRoot.worldToLocal(_worldScratch);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(computed.radius, 20),
    sharedContactShadowMaterialRef(),
  );
  shadow.name = SHADOW_MESH_NAME;
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = -1;
  shadow.raycast = () => {};
  shadow.position.copy(_worldScratch);
  shadow.layers.set(MAMMOTH_APARTMENT_DECOR_PROP_LAYER);
  decorRoot.add(shadow);
  return shadow;
}
