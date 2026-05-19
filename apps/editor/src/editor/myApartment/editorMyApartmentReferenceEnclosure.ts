import * as THREE from "three";

import { MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD } from "@the-mammoth/engine";

import type { OwnedApartmentEditorShellPlan } from "@the-mammoth/world";

import {

  addHollowRoomShell,

  addResidentialBalconyBayShell,

  addUnitExteriorWindowGlassMeshes,

  DEFAULT_EXTERIOR_FACADE_SALT,

  residentialBalconyHollowShellExtras,

  residentialUnitHasBalconyBay,

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

  const yLift =

    EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y - opts.shellPlan.yLo;



  enclosure.position.set(hx, yLift, hz);



  const interiorSx = opts.shellPlan.hx * 2;

  const sy = opts.placedScaleY;

  const sz = opts.placedScaleZ;

  const balconyExtras = residentialBalconyHollowShellExtras(opts.unitId, interiorSx);



  /** Same hollow shell as {@link buildFloorMeshes} — one lengthened unit, partition open, bay façade separate. */

  addHollowRoomShell(enclosure, interiorSx, sy, sz, "unit", {

    shaftHolesPlate: [],

    roomPx: 0,

    roomPz: 0,

    skipShaftCutouts: true,

    storyLevelIndex: opts.storyLevelIndex,

    corridorWallHoles: opts.shellPlan.corridorWallHoles,

    exteriorFaces: opts.shellPlan.exteriorFaces,

    exteriorWindowHoles: opts.shellPlan.exteriorWindowHoles,

    /** Grey `editor_owned_apartment_floor` already covers the lengthened footprint. */

    shellFloorSlab: false,

    ...balconyExtras,

  });



  const win = opts.shellPlan.exteriorWindowHoles;

  const glassFaces = opts.shellPlan.windowFacesForGlass;

  if (win && glassFaces.length > 0) {

    addUnitExteriorWindowGlassMeshes(enclosure, {

      faces: glassFaces,

      hx: opts.shellPlan.hx,

      hz: opts.shellPlan.hz,

      tintByFace: opts.shellPlan.tintByExteriorFace,

      holesEw: { e: win.e, w: win.w },

      holesNs: { n: win.n, s: win.s },

    });

  }



  if (residentialUnitHasBalconyBay(opts.unitId)) {

    addResidentialBalconyBayShell(

      enclosure,

      interiorSx,

      sy,

      sz,

      opts.unitId,

      {

        storyLevelIndex: opts.storyLevelIndex,

        floorDocId: opts.floorDocId,

        facadeSalt: DEFAULT_EXTERIOR_FACADE_SALT,

      },

    );

  }



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


