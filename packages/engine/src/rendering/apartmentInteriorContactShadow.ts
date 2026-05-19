import * as THREE from "three";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "./apartmentInteriorVisualProfile.js";

const SHADOW_MESH_NAME = "apartment_decor_contact_shadow";

const _boundsScratch = new THREE.Box3();
const _sizeScratch = new THREE.Vector3();
const _centerScratch = new THREE.Vector3();
const _worldScratch = new THREE.Vector3();

const contactShadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: APARTMENT_INTERIOR_VISUAL_PROFILE.contactShadow.opacity,
  depthWrite: false,
});

export function computeApartmentDecorContactShadowRadius(
  decorRoot: THREE.Object3D,
): { center: THREE.Vector3; radius: number } | null {
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
  return { center: _centerScratch.clone(), radius };
}

/**
 * Removes contact-shadow meshes left on ancestors by older editor builds (shadow was a sibling of
 * the decor group, so `group.clear()` never deleted it). Safe to call on any apartment preview root.
 */
export function disposeLeakedApartmentDecorContactShadows(sceneRoot: THREE.Object3D): void {
  const leaks: THREE.Object3D[] = [];
  sceneRoot.traverse((ch) => {
    if (ch.name === SHADOW_MESH_NAME) leaks.push(ch);
  });
  for (const ch of leaks) {
    if (ch instanceof THREE.Mesh) {
      ch.geometry?.dispose();
    }
    ch.removeFromParent();
  }
}

/**
 * Dark blob under floor-standing decor — cheap grounding without shadow maps.
 * Shadow is parented on `decorRoot` so editor `group.clear()` does not leak siblings.
 */
export function attachApartmentDecorContactShadow(
  decorRoot: THREE.Object3D,
  floorWorldY: number,
): THREE.Mesh | null {
  if (!APARTMENT_INTERIOR_VISUAL_PROFILE.contactShadow.enabled) {
    return null;
  }

  const prior = decorRoot.getObjectByName(SHADOW_MESH_NAME);
  if (prior) {
    if (prior instanceof THREE.Mesh) prior.geometry?.dispose();
    prior.removeFromParent();
  }

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

  const floorY = _boundsScratch.min.y;
  _worldScratch.set(_centerScratch.x, floorY + 0.004, _centerScratch.z);
  decorRoot.worldToLocal(_worldScratch);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    contactShadowMaterial,
  );
  shadow.name = SHADOW_MESH_NAME;
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = -1;
  shadow.raycast = () => {};
  shadow.position.copy(_worldScratch);
  decorRoot.add(shadow);
  return shadow;
}
