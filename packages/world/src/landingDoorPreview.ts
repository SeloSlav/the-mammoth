import * as THREE from "three";
import type { LandingKitDef } from "@the-mammoth/schemas";
import type { ElevatorShaftLayout } from "./elevatorShaftLayout.js";
import {
  addLandingDoorOpeningEditProxy,
  createExteriorLandingDoorMaterials,
  disposeExteriorLandingDoorSwingContents,
  LANDING_DOOR_GLASS_PART_ID,
  populateExteriorLandingDoorSwing,
  resolveLandingDims,
  resolveGlassOpening,
} from "./exteriorLandingDoorSwing.js";
import {
  EXTERIOR_DOOR_JAMB_INSET_M,
  exteriorLandingDoorSwingOriginY,
} from "./elevatorCollisionTuning.js";

export {
  LANDING_DOOR_BOTTOM_RAIL_PART_ID,
  LANDING_DOOR_GLASS_PART_ID,
  LANDING_DOOR_LEFT_STILE_PART_ID,
  LANDING_DOOR_OPENING_PROXY_ID,
  LANDING_DOOR_RIGHT_STILE_PART_ID,
  LANDING_DOOR_TOP_RAIL_PART_ID,
} from "./exteriorLandingDoorSwing.js";

function applyLandingKitPreviewMeta(
  doorStructure: THREE.Object3D,
  def: LandingKitDef | undefined,
): void {
  const dims = resolveLandingDims(def);
  doorStructure.userData.editorLandingKitRoot = true;
  doorStructure.userData.editorLandingKitSolid = Boolean(def?.solid);
  doorStructure.userData.editorLandingPanelWidthM = dims.panelW;
  doorStructure.userData.editorLandingPanelHeightM = dims.panelH;
}

/**
 * Rebuilds swing meshes + editor opening proxy from `def` (materials, rails/stiles/glass, proxy).
 * Preserves swing's world transform; caller should re-apply preview swing angle if needed.
 */
export function rebuildLandingDoorPreviewSwing(doorStructure: THREE.Group, def: LandingKitDef | undefined): void {
  const swing = doorStructure.getObjectByName("editor_landing_door_swing") as THREE.Group | undefined;
  if (!swing) return;
  disposeExteriorLandingDoorSwingContents(swing);
  const { redMat, glassMat } = createExteriorLandingDoorMaterials(def);
  populateExteriorLandingDoorSwing(swing, redMat, glassMat, def);
  applyLandingKitPreviewMeta(doorStructure, def);
  const glass = swing.getObjectByName(LANDING_DOOR_GLASS_PART_ID) as THREE.Mesh | undefined;
  if (glass) {
    glass.raycast = () => {};
  }
  // Solid-leaf kits (e.g. apartment unit) don't render a glass lite, so skip the opening gizmo —
  // the glassOpening field still round-trips in JSON but has no visible effect on the leaf.
  if (!def?.solid) {
    addLandingDoorOpeningEditProxy(swing, resolveGlassOpening(def), def);
  }
  applyLandingKitPartTransforms(doorStructure, def);
}

/**
 * One exterior landing door assembly for editor `Landing` workspace (matches client pivot layout).
 */
export function buildLandingDoorPreviewRoot(args: {
  face: ElevatorShaftLayout["doorFace"];
  hx: number;
  hz: number;
  def?: LandingKitDef;
  /** Partial open 0..1 for preview. */
  swingOpen01?: number;
}): THREE.Group {
  const { face, hx, hz, def, swingOpen01 = 0.35 } = args;

  const dims = resolveLandingDims(def);
  const doorY = exteriorLandingDoorSwingOriginY(dims.panelH);
  const structure = new THREE.Group();
  structure.name = "editor_landing_door";
  const swing = new THREE.Group();
  swing.name = "editor_landing_door_swing";
  structure.add(swing);

  rebuildLandingDoorPreviewSwing(structure, def);

  const jambZ = dims.panelW * 0.5 - EXTERIOR_DOOR_JAMB_INSET_M;
  const swingSign = -1;
  const maxRad = def?.exteriorSwingMaxRad ?? 1.55;

  if (face === "e") structure.position.set(hx + 0.048, doorY, jambZ);
  else if (face === "w") {
    structure.position.set(-hx - 0.048, doorY, jambZ);
    structure.rotation.y = Math.PI;
  } else if (face === "n") {
    structure.position.set(-jambZ, doorY, hz + 0.048);
    structure.rotation.y = -Math.PI * 0.5;
  } else {
    structure.position.set(jambZ, doorY, -hz - 0.048);
    structure.rotation.y = Math.PI * 0.5;
  }

  swing.rotation.y = swingSign * swingOpen01 * maxRad;

  applyLandingKitPreviewMeta(structure, def);
  return structure;
}

/**
 * Apply {@link LandingKitDef.partTransforms} to meshes tagged with `userData.editorLandingPartId`.
 * Skips the procedural glass lite (driven by {@link LandingKitDef.glassOpening}).
 */
export function applyLandingKitPartTransforms(
  root: THREE.Object3D,
  def: LandingKitDef | undefined,
): void {
  const pt = def?.partTransforms;
  if (!pt) return;
  root.traverse((o) => {
    const id = o.userData.editorLandingPartId as string | undefined;
    if (!id || id === LANDING_DOOR_GLASS_PART_ID) return;
    const p = pt[id];
    if (!p) return;
    if (p.position) o.position.set(p.position[0], p.position[1], p.position[2]);
    if (p.scale) o.scale.set(p.scale[0], p.scale[1], p.scale[2]);
    if (p.rotation)
      o.quaternion.set(p.rotation[0], p.rotation[1], p.rotation[2], p.rotation[3] ?? 1);
  });
}
