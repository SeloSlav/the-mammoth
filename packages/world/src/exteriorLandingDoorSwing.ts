import * as THREE from "three";
import type { LandingKitDef } from "@the-mammoth/schemas";
import {
  applyLandingFrameSlot,
  applyLandingGlassSlot,
  parseAuthorColorHex,
} from "./elevatorVisualMaterialUtils.js";
import { EXTERIOR_DOOR_H_M, EXTERIOR_DOOR_W_M } from "./elevatorCollisionTuning.js";

/** Match `fpElevatorLandingExteriorDoor` / editor preview. */
export const EXTERIOR_DOOR_PANEL_W_M = EXTERIOR_DOOR_W_M - 0.1;
export const EXTERIOR_DOOR_H = EXTERIOR_DOOR_H_M;

/** Glass mesh id; opening size is driven by {@link LandingKitDef.glassOpening}. */
export const LANDING_DOOR_GLASS_PART_ID = "landing_glass_lite" as const;

/** Editor-only gizmo target: resize / move the framed hole (glass follows). */
export const LANDING_DOOR_OPENING_PROXY_ID = "landing_opening_proxy" as const;

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

function clampOpening(open: ResolvedGlassOpening): ResolvedGlassOpening {
  const panelH = EXTERIOR_DOOR_H - 0.12;
  const maxW = Math.max(0.2, EXTERIOR_DOOR_PANEL_W_M - 0.24);
  const maxH = Math.max(0.2, panelH - 0.22);
  const half = panelH * 0.5;
  return {
    widthM: THREE.MathUtils.clamp(open.widthM, 0.12, maxW),
    heightM: THREE.MathUtils.clamp(open.heightM, 0.12, maxH),
    centerYM: THREE.MathUtils.clamp(open.centerYM, -half + 0.15, half - 0.15),
  };
}

/**
 * Rebuilds all swing children: rails, stiles, and glass sized to `glassOpening`.
 * Does not add the editor opening proxy.
 */
export function populateExteriorLandingDoorSwing(
  swing: THREE.Group,
  redMat: THREE.MeshStandardMaterial,
  glassMat: THREE.MeshPhysicalMaterial,
  kit: LandingKitDef | undefined,
): void {
  const open = clampOpening(resolveGlassOpening(kit));
  const panelH = EXTERIOR_DOOR_H - 0.12;
  const panelW = EXTERIOR_DOOR_PANEL_W_M;
  const panelT = 0.056;
  const centerZ = -panelW * 0.5;
  const railTopH = Math.max(0.12, panelH * 0.5 - (open.centerYM + open.heightM * 0.5));
  const railBotH = Math.max(0.12, open.centerYM - open.heightM * 0.5 + panelH * 0.5);
  const stileW = Math.max(0.12, (panelW - open.widthM) * 0.5);

  const addRed = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), redMat);
    m.position.set(x, y, z);
    m.castShadow = false;
    swing.add(m);
  };

  addRed(panelT, railTopH, panelW, panelT * 0.5, panelH * 0.5 - railTopH * 0.5, centerZ);
  addRed(panelT, railBotH, panelW, panelT * 0.5, -panelH * 0.5 + railBotH * 0.5, centerZ);
  addRed(panelT, open.heightM, stileW, panelT * 0.5, open.centerYM, -stileW * 0.5);
  addRed(panelT, open.heightM, stileW, panelT * 0.5, open.centerYM, -panelW + stileW * 0.5);

  const glassGeom = new THREE.BoxGeometry(
    0.046,
    Math.max(0.05, open.heightM - 0.02),
    Math.max(0.05, open.widthM - 0.02),
  );
  const glassMesh = new THREE.Mesh(glassGeom, glassMat);
  glassMesh.name = LANDING_DOOR_GLASS_PART_ID;
  glassMesh.userData.editorLandingPartId = LANDING_DOOR_GLASS_PART_ID;
  glassMesh.position.set(panelT * 0.5 + 0.014, open.centerYM, centerZ);
  glassMesh.castShadow = false;
  glassMesh.renderOrder = 2;
  swing.add(glassMesh);
}

/** Dispose mesh GPU assets under `swing` (geometries + materials). */
export function disposeExteriorLandingDoorSwingContents(swing: THREE.Group): void {
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

export function createExteriorLandingDoorMaterials(kit: LandingKitDef | undefined): {
  redMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshPhysicalMaterial;
} {
  const frameSlot = kit?.materials?.frame;
  const glassSlot = kit?.materials?.glass;
  const redMat = new THREE.MeshStandardMaterial({
    color: frameSlot?.colorHex ? parseAuthorColorHex(frameSlot.colorHex) : 0xc42b2b,
    roughness: frameSlot?.roughness ?? 0.52,
    metalness: frameSlot?.metalness ?? 0.12,
  });
  applyLandingFrameSlot(redMat, frameSlot);
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
  return { redMat, glassMat };
}

/**
 * Wireframe box matching the glass volume for editor picking (glass has raycast disabled there).
 */
export function addLandingDoorOpeningEditProxy(swing: THREE.Group, open: ResolvedGlassOpening): void {
  const panelW = EXTERIOR_DOOR_PANEL_W_M;
  const panelT = 0.056;
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
  proxy.name = LANDING_DOOR_OPENING_PROXY_ID;
  proxy.userData.editorLandingOpeningProxy = true;
  proxy.position.set(glassX, open.centerYM, centerZ);
  proxy.rotation.set(0, 0, 0);
  proxy.scale.set(1, 1, 1);
  swing.add(proxy);
}

/** Map proxy pose after a gizmo edit into authoritative `glassOpening` (clamped). */
export function glassOpeningFromProxyMesh(
  proxy: THREE.Object3D,
  kit: LandingKitDef | undefined,
): ResolvedGlassOpening {
  const base = clampOpening(resolveGlassOpening(kit));
  const innerW = Math.max(0.05, base.widthM - 0.02);
  const innerH = Math.max(0.05, base.heightM - 0.02);
  let widthM = innerW * Math.abs(proxy.scale.z) + 0.02;
  let heightM = innerH * Math.abs(proxy.scale.y) + 0.02;
  const centerYM = proxy.position.y;
  return clampOpening({ widthM, heightM, centerYM });
}
