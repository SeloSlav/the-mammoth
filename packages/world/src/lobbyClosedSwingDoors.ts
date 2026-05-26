/**
 * Non-interactable closed swing leaves for ground-storey lobby exterior door bays.
 *
 * PR podium holes are CSG cutouts + trim only — no `apartment_door` rows (nothing to open).
 * Reuses the same solid apartment corridor kit as unit entries (`apartment_unit_kit.json`).
 */
import * as THREE from "three";
import type { LandingKitDef } from "@the-mammoth/schemas";
import { resolveLandingDims } from "./exteriorLandingDoorSwing.js";
import {
  createSwingDoorMaterials,
  populateSwingDoorLeaf,
  SWING_DOOR_PANEL_THICK_M,
} from "./swingDoorMesh.js";
import {
  swingDoorOrientationForFace,
  type SwingDoorFace,
} from "./swingDoorCollision.js";
import {
  UNIT_ENTRY_DOOR_H,
  UNIT_ENTRY_DOOR_W,
} from "./unitEntryAdjacency.js";
import {
  doorFrameTrimPlaneConstantX,
  doorFrameTrimPlaneConstantZ,
  type CardinalFace,
} from "./wallWithDoorCutout.js";

/** Must match {@link addExteriorWallCladding} / lobby exterior trim in `hollowRoomShell`. */
export const LOBBY_EXTERIOR_CLADDING_TH_M = 0.035;

/** Mirrors `content/door/apartment_unit_kit.json` — solid corridor leaf. */
export const APARTMENT_CORRIDOR_DOOR_KIT = {
  id: "default_apartment_unit_kit",
  version: 1,
  displayName: "Apartment unit door kit",
  solid: true,
  panelWidthM: UNIT_ENTRY_DOOR_W,
  panelHeightM: UNIT_ENTRY_DOOR_H,
  exteriorSwingMaxRad: 1.55,
  glassOpening: { widthM: 0.92, heightM: 1.72, centerYM: 0 },
  materials: {
    frame: {
      colorHex: "0xffffff",
      roughness: 0.72,
      metalness: 0.02,
      mapUrl: "/static/materials/apartment-unit-door/basecolor.png",
      normalMapUrl: "/static/materials/apartment-unit-door/normal.png",
    },
    glass: {
      colorHex: "0xd8e8f0",
      roughness: 0.04,
      metalness: 0,
      transmission: 0.94,
    },
  },
} as const satisfies LandingKitDef;

export type LobbyClosedSwingDoorArgs = {
  hx: number;
  hz: number;
  wt: number;
  /** East interior wall bays (subset of full Z spine). */
  czListEast: readonly number[];
  /** West interior wall bays (full Z spine). */
  czListWest: readonly number[];
  /** North/south end bays (shared X centers). */
  cxListNs: readonly number[];
  /** Which lobby shell faces are exterior façades (black trim + closed leaf on street side). */
  exteriorFaces: readonly CardinalFace[];
  yDoor0: number;
  yDoor1: number;
  exteriorCladT?: number;
};

function exteriorFaceSet(faces: readonly CardinalFace[]): Set<CardinalFace> {
  return new Set(faces);
}

/** Hinge X on east/west walls — leaf center sits on the same trim plane as `addDoorFrameTrimConstantX`. */
export function lobbyClosedDoorHingeXForEastWestWall(args: {
  face: "e" | "w";
  hx: number;
  wt: number;
  exterior: boolean;
  exteriorCladT: number;
}): number {
  const { face, hx, wt, exterior, exteriorCladT } = args;
  if (face === "e") {
    const xInner = exterior ? hx + exteriorCladT : hx - wt;
    const framePlaneX = doorFrameTrimPlaneConstantX(xInner, -1);
    return framePlaneX - SWING_DOOR_PANEL_THICK_M * 0.5;
  }
  const xInner = exterior ? -hx - exteriorCladT : -hx + wt;
  const framePlaneX = doorFrameTrimPlaneConstantX(xInner, 1);
  return framePlaneX - SWING_DOOR_PANEL_THICK_M * 0.5;
}

/** Hinge Z on north/south walls — leaf center sits on the same trim plane as `addDoorFrameTrimConstantZ`. */
export function lobbyClosedDoorHingeZForNorthSouthWall(args: {
  face: "n" | "s";
  hz: number;
  wt: number;
  exterior: boolean;
  exteriorCladT: number;
}): number {
  const { face, hz, wt, exterior, exteriorCladT } = args;
  if (face === "n") {
    const zInner = exterior ? hz + exteriorCladT : hz - wt;
    const framePlaneZ = doorFrameTrimPlaneConstantZ(zInner, -1);
    return framePlaneZ + SWING_DOOR_PANEL_THICK_M * 0.5;
  }
  const zInner = exterior ? -hz - exteriorCladT : -hz + wt;
  const framePlaneZ = doorFrameTrimPlaneConstantZ(zInner, 1);
  return framePlaneZ + SWING_DOOR_PANEL_THICK_M * 0.5;
}

function addClosedLeaf(
  group: THREE.Group,
  face: SwingDoorFace,
  hingeX: number,
  hingeZ: number,
  feetY: number,
  panelH: number,
  kit: LandingKitDef,
  frameMat: THREE.MeshStandardMaterial,
  glassMat: THREE.MeshPhysicalMaterial,
  name: string,
): void {
  const { baseYaw } = swingDoorOrientationForFace(face);
  const swing = new THREE.Group();
  swing.name = name;
  swing.userData.mammothLobbyClosedDoor = true;
  swing.position.set(hingeX, feetY + panelH * 0.5, hingeZ);
  swing.rotation.y = baseYaw;
  populateSwingDoorLeaf(swing, frameMat, glassMat, kit, resolveLandingDims(kit));
  group.add(swing);
}

/**
 * One centered apartment corridor leaf per lobby double-door bay on every non-openable façade.
 */
export function addLobbyClosedApartmentSwingDoors(
  group: THREE.Group,
  args: LobbyClosedSwingDoorArgs,
): void {
  const {
    hx,
    hz,
    wt,
    czListEast,
    czListWest,
    cxListNs,
    exteriorFaces,
    yDoor0,
    yDoor1,
    exteriorCladT = LOBBY_EXTERIOR_CLADDING_TH_M,
  } = args;
  const ext = exteriorFaceSet(exteriorFaces);
  const panelW = UNIT_ENTRY_DOOR_W;
  const panelH = UNIT_ENTRY_DOOR_H;
  const feetY = yDoor0 + Math.max(0, (yDoor1 - yDoor0 - panelH) * 0.5);
  const kit = APARTMENT_CORRIDOR_DOOR_KIT;
  const { frameMat, glassMat } = createSwingDoorMaterials(kit);
  let idx = 0;

  for (const zc of czListEast) {
    addClosedLeaf(
      group,
      "e",
      lobbyClosedDoorHingeXForEastWestWall({
        face: "e",
        hx,
        wt,
        exterior: ext.has("e"),
        exteriorCladT,
      }),
      zc + panelW * 0.5,
      feetY,
      panelH,
      kit,
      frameMat,
      glassMat,
      `shell_lobby_closed_door_e_${idx++}`,
    );
  }
  for (const zc of czListWest) {
    addClosedLeaf(
      group,
      "w",
      lobbyClosedDoorHingeXForEastWestWall({
        face: "w",
        hx,
        wt,
        exterior: ext.has("w"),
        exteriorCladT,
      }),
      zc + panelW * 0.5,
      feetY,
      panelH,
      kit,
      frameMat,
      glassMat,
      `shell_lobby_closed_door_w_${idx++}`,
    );
  }
  for (const xc of cxListNs) {
    addClosedLeaf(
      group,
      "n",
      xc + panelW * 0.5,
      lobbyClosedDoorHingeZForNorthSouthWall({
        face: "n",
        hz,
        wt,
        exterior: ext.has("n"),
        exteriorCladT,
      }),
      feetY,
      panelH,
      kit,
      frameMat,
      glassMat,
      `shell_lobby_closed_door_n_${idx++}`,
    );
    addClosedLeaf(
      group,
      "s",
      xc + panelW * 0.5,
      lobbyClosedDoorHingeZForNorthSouthWall({
        face: "s",
        hz,
        wt,
        exterior: ext.has("s"),
        exteriorCladT,
      }),
      feetY,
      panelH,
      kit,
      frameMat,
      glassMat,
      `shell_lobby_closed_door_s_${idx++}`,
    );
  }
}
