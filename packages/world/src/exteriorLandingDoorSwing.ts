/**
 * Elevator landing exterior swing door — adapter over the shared swing-door primitive.
 *
 * Visual + opening-proxy + materials are owned by `swingDoorMesh.ts`; this module just plugs in
 * the elevator door's authoritative dimensions (`EXTERIOR_DOOR_W_M` / `EXTERIOR_DOOR_H_M`) so
 * landing doors and apartment doors share one mesh path. Re-exports the part-id constants under
 * their original `LANDING_*` names for back-compat with editor + visual call sites.
 */
import * as THREE from "three";
import type { LandingKitDef } from "@the-mammoth/schemas";
import { EXTERIOR_DOOR_H_M, EXTERIOR_DOOR_W_M } from "./elevatorCollisionTuning.js";
import {
  addSwingDoorOpeningEditProxy,
  createSwingDoorMaterials,
  disposeSwingDoorLeafContents,
  glassOpeningFromProxyMesh as glassOpeningFromProxyMeshShared,
  populateSwingDoorLeaf,
  resolveGlassOpening,
  type ResolvedGlassOpening,
  type SwingDoorDimensions,
  SWING_DOOR_BOTTOM_RAIL_PART_ID,
  SWING_DOOR_GLASS_PART_ID,
  SWING_DOOR_LEFT_STILE_PART_ID,
  SWING_DOOR_OPENING_PROXY_ID,
  SWING_DOOR_RIGHT_STILE_PART_ID,
  SWING_DOOR_TOP_RAIL_PART_ID,
} from "./swingDoorMesh.js";

export const EXTERIOR_DOOR_PANEL_W_M = EXTERIOR_DOOR_W_M - 0.1;
export const EXTERIOR_DOOR_H = EXTERIOR_DOOR_H_M;

export const LANDING_DOOR_GLASS_PART_ID = SWING_DOOR_GLASS_PART_ID;
export const LANDING_DOOR_TOP_RAIL_PART_ID = SWING_DOOR_TOP_RAIL_PART_ID;
export const LANDING_DOOR_BOTTOM_RAIL_PART_ID = SWING_DOOR_BOTTOM_RAIL_PART_ID;
export const LANDING_DOOR_LEFT_STILE_PART_ID = SWING_DOOR_LEFT_STILE_PART_ID;
export const LANDING_DOOR_RIGHT_STILE_PART_ID = SWING_DOOR_RIGHT_STILE_PART_ID;
export const LANDING_DOOR_OPENING_PROXY_ID = SWING_DOOR_OPENING_PROXY_ID;

export type { ResolvedGlassOpening };
export { resolveGlassOpening };

const LANDING_DIMS: SwingDoorDimensions = {
  panelW: EXTERIOR_DOOR_W_M,
  panelH: EXTERIOR_DOOR_H_M,
};

/**
 * Resolve the leaf dimensions used by a landing-door preview: honors authored
 * `panelWidthM`/`panelHeightM` overrides on the kit (the apartment variant authors smaller dims),
 * falling back to the elevator landing door defaults.
 */
export function resolveLandingDims(kit: LandingKitDef | undefined): SwingDoorDimensions {
  const w = kit?.panelWidthM;
  const h = kit?.panelHeightM;
  if (w === undefined && h === undefined) return LANDING_DIMS;
  return {
    panelW: w ?? LANDING_DIMS.panelW,
    panelH: h ?? LANDING_DIMS.panelH,
  };
}

export function populateExteriorLandingDoorSwing(
  swing: THREE.Group,
  redMat: THREE.MeshStandardMaterial,
  glassMat: THREE.MeshPhysicalMaterial,
  kit: LandingKitDef | undefined,
): void {
  populateSwingDoorLeaf(swing, redMat, glassMat, kit, resolveLandingDims(kit));
}

export function disposeExteriorLandingDoorSwingContents(swing: THREE.Group): void {
  disposeSwingDoorLeafContents(swing);
}

export function createExteriorLandingDoorMaterials(kit: LandingKitDef | undefined): {
  redMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshPhysicalMaterial;
} {
  const { frameMat, glassMat } = createSwingDoorMaterials(kit);
  return { redMat: frameMat, glassMat };
}

export function addLandingDoorOpeningEditProxy(
  swing: THREE.Group,
  open: ResolvedGlassOpening,
  kit?: LandingKitDef,
): void {
  addSwingDoorOpeningEditProxy(swing, open, resolveLandingDims(kit));
}

export function glassOpeningFromProxyMesh(
  proxy: THREE.Object3D,
  kit: LandingKitDef | undefined,
): ResolvedGlassOpening {
  return glassOpeningFromProxyMeshShared(proxy, kit, resolveLandingDims(kit));
}
