import * as THREE from "three";
import { MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD } from "@the-mammoth/engine";
import type { OwnedApartmentEditorShellPlan } from "@the-mammoth/world";
import {
  appendOwnedApartmentEditorShellWalls,
  floorPlaceholderMeshMaterials,
} from "@the-mammoth/world";
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

  /** Interior plaster + exterior concrete cladding — same pair as `matsFor("unit")` in hollow shells. */
  const wallMat = floorPlaceholderMeshMaterials.unitWall;
  const exteriorWallMat = floorPlaceholderMeshMaterials.unitExteriorWall;

  appendOwnedApartmentEditorShellWalls(
    enclosure,
    opts.shellPlan,
    wallMat,
    exteriorWallMat,
  );

  /** Shell mats from `@the-mammoth/world` already bake interior palette tints at creation — do not
   *  mood-grade again here or PBR albedo reads as flat brown. */
  enclosure.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.userData.editorOwnedApartmentReferenceOnly = true;
    o.userData[MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD] = true;
    stripRaycast(o);
  });

  return enclosure;
}
