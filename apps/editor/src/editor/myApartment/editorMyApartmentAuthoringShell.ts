import * as THREE from "three";
import { buildOwnedApartmentReferenceEnclosure } from "./editorMyApartmentReferenceEnclosure.js";

/**
 * Minimal preview floor for owned-apartment builtin authoring (no mammoth building graph).
 * Coordinates 0..W on XZ with Y up; props use the same space as {@link OwnedApartmentBuiltinsDoc}.
 */
export function buildOwnedApartmentAuthoringShell(previewSizeM: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "editor_owned_apartment_authoring_shell";

  const W = Math.max(2, previewSizeM);
  const floorGeom = new THREE.BoxGeometry(W, 0.04, W);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xd8dde6,
    roughness: 0.92,
    metalness: 0.02,
  });
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.name = "editor_owned_apartment_floor";
  floor.position.set(W * 0.5, 0, W * 0.5);
  floor.receiveShadow = false;
  floor.castShadow = false;
  root.add(floor);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(floorGeom),
    new THREE.LineBasicMaterial({ color: 0x8893a5 }),
  );
  edge.position.copy(floor.position);
  root.add(edge);

  const referenceRoom = buildOwnedApartmentReferenceEnclosure(W);
  root.add(referenceRoom);

  return root;
}
