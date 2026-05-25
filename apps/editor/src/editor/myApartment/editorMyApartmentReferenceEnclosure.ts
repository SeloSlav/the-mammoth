import * as THREE from "three";
import { MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD } from "@the-mammoth/engine";
import type { OwnedApartmentEditorShellPlan } from "@the-mammoth/world";
import {
  appendOwnedApartmentEditorShellWalls,
  addResidentialBalconyBayShell,
  DEFAULT_EXTERIOR_FACADE_SALT,
  floorPlaceholderMeshMaterials,
  residentialBalconyHollowShellExtras,
  residentialUnitHasBalconyBay,
} from "@the-mammoth/world";
import { EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y } from "./editorMyApartmentMeshes.js";

function stripRaycast(mesh: THREE.Mesh): void {
  mesh.raycast = () => {};
}

function isEditorApartmentReferenceCeilingMesh(mesh: THREE.Mesh): boolean {
  return (
    mesh.name.startsWith("shell_ceiling") ||
    mesh.name.startsWith("balcony_shell_ceiling")
  );
}

/** Reference shell is visual-only — keep ceilings hidden for top-down authoring. */
export function tagEditorApartmentReferenceShellMeshes(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.userData.editorOwnedApartmentReferenceOnly = true;
    o.userData[MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD] = true;
    o.userData.mammothUnitInterior = true;
    /** Match megablock shells — frustum culling drops in-room walls when the camera sits inside. */
    o.frustumCulled = false;
    if (isEditorApartmentReferenceCeilingMesh(o)) {
      o.visible = false;
    }
    stripRaycast(o);
  });
}

/**
 * Game-accurate reference shell walls sit in **preview XZ**: origin `(0,0)` is the prefab’s
 * south-west footprint corner; this group is centered on the unit midpoint at `(hx, hz)` (half the
 * floor JSON `scale X/Z`), matching hollow-shell room-local coordinates.
 */
export function buildOwnedApartmentDerivedReferenceRoom(opts: {
  unitId: string;
  shellPlan: OwnedApartmentEditorShellPlan;
  slabHalfExtentsXZ: readonly [number, number];
  placedScaleY: number;
  placedScaleZ: number;
  floorDocId: string;
  storyLevelIndex: number;
}): THREE.Group {
  const enclosure = new THREE.Group();
  enclosure.name = "editor_owned_apartment_reference_enclosure";

  const [hx, hz] = opts.slabHalfExtentsXZ;
  const yLift = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y - opts.shellPlan.yLo;
  enclosure.position.set(hx, yLift, hz);

  const interiorSx = opts.shellPlan.hx * 2;
  const sy = opts.placedScaleY;
  const sz = opts.placedScaleZ;
  const balconyExtras = residentialBalconyHollowShellExtras(opts.unitId, interiorSx);

  /** Walls + corridor door cutouts + exterior cladding/glass — no floor/ceiling slabs. */
  appendOwnedApartmentEditorShellWalls(
    enclosure,
    opts.shellPlan,
    floorPlaceholderMeshMaterials.unitWall,
    floorPlaceholderMeshMaterials.unitExteriorWall,
    { openFaces: balconyExtras?.openInteriorFaces },
  );

  if (residentialUnitHasBalconyBay(opts.unitId)) {
    addResidentialBalconyBayShell(enclosure, interiorSx, sy, sz, opts.unitId, {
      storyLevelIndex: opts.storyLevelIndex,
      floorDocId: opts.floorDocId,
      facadeSalt: DEFAULT_EXTERIOR_FACADE_SALT,
    });
  }

  tagEditorApartmentReferenceShellMeshes(enclosure);
  return enclosure;
}
