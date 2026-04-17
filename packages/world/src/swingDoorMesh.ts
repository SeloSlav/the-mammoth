/**
 * Shared swing-door leaf geometry + materials.
 *
 * The elevator **landing exterior door** and the new **apartment unit door** are instances of the
 * same primitive: a hinged rectangular leaf made of rails, stiles, and an optional glass lite.
 * Call sites pass the panel dimensions + a "kit" that drives materials and optional overrides, and
 * this module is the only place that owns the mesh layout. Editing this file updates both variants
 * — the DRY goal set in the apartment-door design review.
 */
import * as THREE from "three";
import type { LandingKitDef } from "@the-mammoth/schemas";
import {
  applyLandingFrameSlot,
  applyLandingGlassSlot,
  parseAuthorColorHex,
} from "./elevatorVisualMaterialUtils.js";

/** Rail/stile thickness through the panel normal (door leaf depth). */
export const SWING_DOOR_PANEL_THICK_M = 0.056;

/** Default frame vertical inset (top + bottom combined reduces usable leaf height by this much). */
export const SWING_DOOR_FRAME_Y_INSET_M = 0.12;

/** Shared part-id namespace. Both landing and apartment leaves reuse these names — the editor
 * disambiguates by workspace mode, not by id prefix. */
export const SWING_DOOR_TOP_RAIL_PART_ID = "landing_frame_top_rail" as const;
export const SWING_DOOR_BOTTOM_RAIL_PART_ID = "landing_frame_bottom_rail" as const;
export const SWING_DOOR_LEFT_STILE_PART_ID = "landing_frame_left_stile" as const;
export const SWING_DOOR_RIGHT_STILE_PART_ID = "landing_frame_right_stile" as const;
export const SWING_DOOR_GLASS_PART_ID = "landing_glass_lite" as const;
/** Used when a kit authored as `solid: true` skips the glass lite — replaces it with a filled
 * panel across the opening. */
export const SWING_DOOR_SOLID_FILL_PART_ID = "swing_door_solid_fill" as const;
export const SWING_DOOR_OPENING_PROXY_ID = "landing_opening_proxy" as const;

export type SwingDoorDimensions = {
  /** Full leaf width (hinge-to-tip, meters). */
  panelW: number;
  /** Full leaf height, meters. */
  panelH: number;
  /** Leaf thickness through the panel normal. Defaults to `SWING_DOOR_PANEL_THICK_M`. */
  panelT?: number;
};

export type ResolvedGlassOpening = {
  widthM: number;
  heightM: number;
  centerYM: number;
};

const DEFAULT_OPENING: ResolvedGlassOpening = {
  widthM: 0.46,
  heightM: 0.46,
  centerYM: 0.46,
};

export function resolveGlassOpening(kit: LandingKitDef | undefined): ResolvedGlassOpening {
  const g = kit?.glassOpening;
  return {
    widthM: g?.widthM ?? DEFAULT_OPENING.widthM,
    heightM: g?.heightM ?? DEFAULT_OPENING.heightM,
    centerYM: g?.centerYM ?? DEFAULT_OPENING.centerYM,
  };
}

/** True when the kit authors the leaf as a solid panel (no glass lite — just a filled frame). */
export function isSolidLeafKit(kit: LandingKitDef | undefined): boolean {
  return Boolean(
    (kit as LandingKitDef & { solid?: boolean } | undefined)?.solid ?? false,
  );
}

function clampOpening(open: ResolvedGlassOpening, dims: SwingDoorDimensions): ResolvedGlassOpening {
  const panelH = dims.panelH - SWING_DOOR_FRAME_Y_INSET_M;
  const panelW = dims.panelW - 0.1;
  const maxW = Math.max(0.2, panelW - 0.24);
  const maxH = Math.max(0.2, panelH - 0.22);
  const half = panelH * 0.5;
  return {
    widthM: THREE.MathUtils.clamp(open.widthM, 0.12, maxW),
    heightM: THREE.MathUtils.clamp(open.heightM, 0.12, maxH),
    centerYM: THREE.MathUtils.clamp(open.centerYM, -half + 0.15, half - 0.15),
  };
}

export function createSwingDoorMaterials(kit: LandingKitDef | undefined): {
  frameMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshPhysicalMaterial;
} {
  const frameSlot = kit?.materials?.frame;
  const glassSlot = kit?.materials?.glass;
  const frameMat = new THREE.MeshStandardMaterial({
    color: frameSlot?.colorHex ? parseAuthorColorHex(frameSlot.colorHex) : 0xc42b2b,
    roughness: frameSlot?.roughness ?? 0.52,
    metalness: frameSlot?.metalness ?? 0.12,
  });
  applyLandingFrameSlot(frameMat, frameSlot);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: glassSlot?.colorHex ? parseAuthorColorHex(glassSlot.colorHex) : 0xffffff,
    metalness: glassSlot?.metalness ?? 0,
    roughness: glassSlot?.roughness ?? 0.06,
    transmission: glassSlot?.transmission ?? 0.92,
    thickness: 0.09,
    ior: 1.45,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  applyLandingGlassSlot(glassMat, glassSlot);
  return { frameMat, glassMat };
}

/**
 * Rebuild all leaf children under `swing`. The hinge is at the swing origin; the leaf extends in
 * `-Z` (so opening swings the leaf across `+X` world as the group rotates about Y).
 *
 * - Panel dimensions `{ panelW, panelH }` are caller-supplied; this file contains **no elevator-
 *   specific constants** so both variants share identical geometry code.
 * - When `solid: true` on the kit, the glass lite is replaced by a full filled panel so the leaf
 *   reads as an opaque door (apartment use-case).
 */
export function populateSwingDoorLeaf(
  swing: THREE.Group,
  frameMat: THREE.MeshStandardMaterial,
  glassMat: THREE.MeshPhysicalMaterial,
  kit: LandingKitDef | undefined,
  dims: SwingDoorDimensions,
): void {
  const open = clampOpening(resolveGlassOpening(kit), dims);
  const panelH = dims.panelH - SWING_DOOR_FRAME_Y_INSET_M;
  const panelW = dims.panelW - 0.1;
  const panelT = dims.panelT ?? SWING_DOOR_PANEL_THICK_M;
  const centerZ = -panelW * 0.5;
  const solid = isSolidLeafKit(kit);

  // Solid leaves skip the rebate: rails fill top+bottom, stiles fill left+right, and a filled
  // panel covers the opening rectangle. Glass/lite geometry is omitted entirely.
  const effectiveOpen = solid
    ? { widthM: Math.max(0.12, panelW - 0.24), heightM: Math.max(0.12, panelH - 0.22), centerYM: 0 }
    : open;

  const railTopH = Math.max(
    0.12,
    panelH * 0.5 - (effectiveOpen.centerYM + effectiveOpen.heightM * 0.5),
  );
  const railBotH = Math.max(
    0.12,
    effectiveOpen.centerYM - effectiveOpen.heightM * 0.5 + panelH * 0.5,
  );
  const stileW = Math.max(0.12, (panelW - effectiveOpen.widthM) * 0.5);

  const addFrame = (
    id: string,
    sx: number,
    sy: number,
    sz: number,
    x: number,
    y: number,
    z: number,
  ): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), frameMat);
    m.name = id;
    m.userData.editorLandingPartId = id;
    m.position.set(x, y, z);
    m.castShadow = false;
    swing.add(m);
  };

  addFrame(
    SWING_DOOR_TOP_RAIL_PART_ID,
    panelT,
    railTopH,
    panelW,
    panelT * 0.5,
    panelH * 0.5 - railTopH * 0.5,
    centerZ,
  );
  addFrame(
    SWING_DOOR_BOTTOM_RAIL_PART_ID,
    panelT,
    railBotH,
    panelW,
    panelT * 0.5,
    -panelH * 0.5 + railBotH * 0.5,
    centerZ,
  );
  addFrame(
    SWING_DOOR_LEFT_STILE_PART_ID,
    panelT,
    effectiveOpen.heightM,
    stileW,
    panelT * 0.5,
    effectiveOpen.centerYM,
    -stileW * 0.5,
  );
  addFrame(
    SWING_DOOR_RIGHT_STILE_PART_ID,
    panelT,
    effectiveOpen.heightM,
    stileW,
    panelT * 0.5,
    effectiveOpen.centerYM,
    -panelW + stileW * 0.5,
  );

  if (solid) {
    const fillGeom = new THREE.BoxGeometry(
      panelT,
      Math.max(0.05, effectiveOpen.heightM),
      Math.max(0.05, effectiveOpen.widthM),
    );
    const fill = new THREE.Mesh(fillGeom, frameMat);
    fill.name = SWING_DOOR_SOLID_FILL_PART_ID;
    fill.userData.editorLandingPartId = SWING_DOOR_SOLID_FILL_PART_ID;
    fill.position.set(panelT * 0.5, effectiveOpen.centerYM, centerZ);
    fill.castShadow = false;
    swing.add(fill);
    return;
  }

  const glassGeom = new THREE.BoxGeometry(
    0.046,
    Math.max(0.05, effectiveOpen.heightM - 0.02),
    Math.max(0.05, effectiveOpen.widthM - 0.02),
  );
  const glassMesh = new THREE.Mesh(glassGeom, glassMat);
  glassMesh.name = SWING_DOOR_GLASS_PART_ID;
  glassMesh.userData.editorLandingPartId = SWING_DOOR_GLASS_PART_ID;
  glassMesh.position.set(panelT * 0.5 + 0.014, effectiveOpen.centerYM, centerZ);
  glassMesh.castShadow = false;
  glassMesh.renderOrder = 2;
  swing.add(glassMesh);
}

/** Dispose mesh GPU assets under `swing` (geometries + materials). */
export function disposeSwingDoorLeafContents(swing: THREE.Group): void {
  while (swing.children.length > 0) {
    const ch = swing.children[0]!;
    swing.remove(ch);
    ch.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry?.dispose();
        const mat = o.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
  }
}

/** Editor-only wireframe proxy matching the glass volume for gizmo editing. */
export function addSwingDoorOpeningEditProxy(
  swing: THREE.Group,
  open: ResolvedGlassOpening,
  dims: SwingDoorDimensions,
): void {
  const panelW = dims.panelW - 0.1;
  const panelT = dims.panelT ?? SWING_DOOR_PANEL_THICK_M;
  const centerZ = -panelW * 0.5;
  const glassX = panelT * 0.5 + 0.014;
  const h = Math.max(0.05, open.heightM - 0.02);
  const w = Math.max(0.05, open.widthM - 0.02);
  const geom = new THREE.BoxGeometry(0.055, h, w);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x55b4ff,
    wireframe: true,
    transparent: true,
    opacity: 0.45,
    depthTest: true,
  });
  const proxy = new THREE.Mesh(geom, mat);
  proxy.name = SWING_DOOR_OPENING_PROXY_ID;
  proxy.userData.editorLandingOpeningProxy = true;
  proxy.position.set(glassX, open.centerYM, centerZ);
  proxy.rotation.set(0, 0, 0);
  proxy.scale.set(1, 1, 1);
  swing.add(proxy);
}

export function glassOpeningFromProxyMesh(
  proxy: THREE.Object3D,
  kit: LandingKitDef | undefined,
  dims: SwingDoorDimensions,
): ResolvedGlassOpening {
  const base = clampOpening(resolveGlassOpening(kit), dims);
  const innerW = Math.max(0.05, base.widthM - 0.02);
  const innerH = Math.max(0.05, base.heightM - 0.02);
  const widthM = innerW * Math.abs(proxy.scale.z) + 0.02;
  const heightM = innerH * Math.abs(proxy.scale.y) + 0.02;
  const centerYM = proxy.position.y;
  return clampOpening({ widthM, heightM, centerYM }, dims);
}
