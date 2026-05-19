import * as THREE from "three";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "./apartmentInteriorVisualProfile.js";

const _boundsScratch = new THREE.Box3();
const _sizeScratch = new THREE.Vector3();
const _centerScratch = new THREE.Vector3();

const contactShadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: APARTMENT_INTERIOR_VISUAL_PROFILE.contactShadow.opacity,
  depthWrite: false,
});

/**
 * Dark blob under floor-standing decor — cheap grounding without shadow maps.
 */
export function attachApartmentDecorContactShadow(
  decorRoot: THREE.Object3D,
  floorWorldY: number,
): THREE.Mesh | null {
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

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    contactShadowMaterial,
  );
  shadow.name = "apartment_decor_contact_shadow";
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = -1;
  shadow.raycast = () => {};
  shadow.position.set(
    _centerScratch.x,
    floorWorldY + 0.004,
    _centerScratch.z,
  );
  decorRoot.parent?.add(shadow);
  return shadow;
}
