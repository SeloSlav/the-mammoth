import * as THREE from "three";
import type { CorridorEditorShellPlan } from "@the-mammoth/world";
import { addHollowRoomShell } from "@the-mammoth/world";
import { EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y } from "./editorMyApartmentMeshes.js";
import { tagEditorApartmentReferenceShellMeshes } from "./editorMyApartmentReferenceEnclosure.js";

/**
 * Corridor reference walls in **preview XZ** (south-west footprint origin), centered on
 * `(hx, hz)` like the apartment enclosure.
 */
export function buildCorridorDerivedReferenceRoom(opts: {
  shellPlan: CorridorEditorShellPlan;
}): THREE.Group {
  const enclosure = new THREE.Group();
  enclosure.name = "editor_corridor_reference_enclosure";

  const { shellPlan } = opts;
  const yLift = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y - shellPlan.yLo;
  enclosure.position.set(shellPlan.hx, yLift, shellPlan.hz);

  addHollowRoomShell(
    enclosure,
    shellPlan.interiorSx,
    shellPlan.sy,
    shellPlan.sz,
    "corridor",
    {
      shaftHolesPlate: [],
      roomPx: 0,
      roomPz: 0,
      skipShaftCutouts: true,
      storyLevelIndex: shellPlan.storyLevelIndex,
      corridorWallHoles: shellPlan.corridorWallHoles,
      exteriorFaces: shellPlan.exteriorFaces,
      shellFloorSlab: false,
      shellCeilingSlab: false,
    },
  );

  tagEditorApartmentReferenceShellMeshes(enclosure);
  return enclosure;
}
