import * as THREE from "three";
import type { OwnedApartmentEditorShellPlan } from "@the-mammoth/world";
import { appendOwnedApartmentEditorShellWalls } from "@the-mammoth/world";
import { EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y } from "./editorMyApartmentMeshes.js";

function stripRaycast(mesh: THREE.Mesh): void {
  mesh.raycast = () => {};
}

/**
 * Game-accurate reference shell walls sit in **preview XZ**: origin `(0,0)` is the prefab’s
 * south-west footprint corner; this group is centered on the unit midpoint at `(hx, hz)` (half the
 * floor JSON `scale X/Z`), matching hollow-shell room-local coordinates.
 */
export function buildOwnedApartmentDerivedReferenceRoom(opts: {
  shellPlan: OwnedApartmentEditorShellPlan;
  slabHalfExtentsXZ: readonly [number, number];
}): THREE.Group {
  const enclosure = new THREE.Group();
  enclosure.name = "editor_owned_apartment_reference_enclosure";

  const [hx, hz] = opts.slabHalfExtentsXZ;
  const yLift =
    EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y - opts.shellPlan.yLo;

  enclosure.position.set(hx, yLift, hz);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xeae6dc,
    roughness: 0.88,
    metalness: 0.03,
    side: THREE.DoubleSide,
  });

  appendOwnedApartmentEditorShellWalls(enclosure, opts.shellPlan, wallMat);

  enclosure.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.userData.editorOwnedApartmentReferenceOnly = true;
    stripRaycast(o);
  });

  return enclosure;
}
