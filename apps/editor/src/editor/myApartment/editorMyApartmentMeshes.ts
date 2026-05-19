import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import {
  moodGradeMammothApartmentDecorMesh,
  moodGradeMammothApartmentShellMesh,
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  apartmentDecorContactShadowEligible,
  attachApartmentDecorContactShadow,
  syncApartmentInteriorPracticalLighting,
  type ApartmentPracticalLightsMount,
} from "@the-mammoth/engine";
import { UNIT_SHELL_WALL_THICKNESS_M, applyOwnedApartmentWallSurfaceMaterial } from "@the-mammoth/world";
import {
  OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
  OWNED_APARTMENT_DECOR_UNIFORM_SCALE_MIN,
  OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
  type OwnedApartmentBuiltinsDoc,
  type OwnedApartmentPlacedItem,
  ownedApartmentPlacedItemAuthoringAssetVisScale,
} from "@the-mammoth/schemas";
import type { OwnedApartmentFractionToPreviewXZ } from "./editorMyApartmentAuthoringShell.js";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForWall,
} from "./editorMyApartmentSelection.js";
import { teardownApartmentSavedObjectGroupManipulator } from "./editorMyApartmentSavedGroupManip.js";

/** Top of authoring shell floor slab — keep in sync with `editorMyApartmentAuthoringShell.ts`. */
export const EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y = 0.02;

/** Gizmo + serialized yaw for built-in apartment props (45° steps). */
export const EDITOR_MY_APARTMENT_YAW_SNAP_RAD = Math.PI / 4;
/** Imported decor — 15° steps on yaw / pitch / roll when grid snap is on (`YXZ` euler). */
export const EDITOR_MY_APARTMENT_DECOR_YAW_SNAP_RAD = THREE.MathUtils.degToRad(15);

const qSnapYawScratch = new THREE.Quaternion();
const decorEulerScratch = new THREE.Euler(0, 0, 0, "YXZ");

/** Breath room inside plaster inner faces so thick prop meshes do not plane-fight drywall. */
const EDITOR_MY_APARTMENT_INTERIOR_SLACK_M = 0.03;
/** Matches `OwnedApartmentDecorItemSchema.dy` max in `@the-mammoth/schemas`. */
export const EDITOR_MY_APARTMENT_DECOR_DY_SCHEMA_MAX_M = 4;
/** Built-in furniture `uniformScale` min in `@the-mammoth/schemas` (decor uses a lower minimum). */
export const EDITOR_MY_APARTMENT_UNIFORM_SCALE_MIN = 0.08;
export const EDITOR_MY_APARTMENT_UNIFORM_SCALE_MAX = 5.5;
/**
 * Authoring should be able to place props flush to the strict hull, including south/north window
 * faces on bar-end units. The position clamp already keeps roots inside the representable hull, so
 * the AABB pass should only prevent crossing the boundary, not reserve extra empty air.
 */
const EDITOR_MY_APARTMENT_AUTHORING_AABB_BOUNDARY_SLACK_M = 0;

/** Matches `OwnedApartmentWallItemSchema` extent clamps. */
export const EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M = 0.05;
export const EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MAX_M = 8;
export const EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M = 0.05;
export const EDITOR_MY_APARTMENT_WALL_SIZE_Y_MAX_M = 8;
export const EDITOR_MY_APARTMENT_WALL_THICKNESS_MIN_M = 0.02;
export const EDITOR_MY_APARTMENT_WALL_THICKNESS_MAX_M = 2;

export const EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY = "mammothEditorMyApartmentWallMesh" as const;

const decorClampBoundsScratch = new THREE.Box3();
const decorClampSizeScratch = new THREE.Vector3();
const decorClampCenterScratch = new THREE.Vector3();
const decorRecenterWorldCenterScratch = new THREE.Vector3();
const decorRecenterLocalCenterScratch = new THREE.Vector3();
const decorRecenterParentLocalCenterScratch = new THREE.Vector3();
const decorAnchorWorldScratch = new THREE.Vector3();
const decorAnchorLocalScratch = new THREE.Vector3();
const EDITOR_MY_APARTMENT_DECOR_ANCHOR_LOCAL_OFFSET_USERDATA_KEY =
  "editorMyApartmentDecorAnchorLocalOffset";

function clampPreviewXZToPlasterInterior(args: {
  footprintSx: number;
  footprintSz: number;
  x: number;
  z: number;
}): { x: number; z: number } {
  const wt = UNIT_SHELL_WALL_THICKNESS_M;
  const e = EDITOR_MY_APARTMENT_INTERIOR_SLACK_M;
  const ix0 = wt + e;
  const ix1 = args.footprintSx - wt - e;
  const iz0 = wt + e;
  const iz1 = args.footprintSz - wt - e;
  if (!(ix1 > ix0) || !(iz1 > iz0)) {
    return {
      x: THREE.MathUtils.clamp(args.x, 0, args.footprintSx),
      z: THREE.MathUtils.clamp(args.z, 0, args.footprintSz),
    };
  }
  return {
    x: THREE.MathUtils.clamp(args.x, ix0, ix1),
    z: THREE.MathUtils.clamp(args.z, iz0, iz1),
  };
}

function previewRepresentableXZBounds(spans: OwnedApartmentFractionToPreviewXZ): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const wt = UNIT_SHELL_WALL_THICKNESS_M;
  const e = EDITOR_MY_APARTMENT_INTERIOR_SLACK_M;
  const sx = spans.prefabFootprintSx;
  const sz = spans.prefabFootprintSz;
  const ixPl0 = wt + e;
  const ixPl1 = sx - wt - e;
  const izPl0 = wt + e;
  const izPl1 = sz - wt - e;

  const lxMinR =
    spans.strictMinX +
    spans.spanX * OWNED_APARTMENT_LAYOUT_FRACTION_MIN -
    spans.prefabOriginX;
  const lxMaxR =
    spans.strictMinX +
    spans.spanX * OWNED_APARTMENT_LAYOUT_FRACTION_MAX -
    spans.prefabOriginX;
  const lzMinR =
    spans.strictMinZ +
    spans.spanZ * OWNED_APARTMENT_LAYOUT_FRACTION_MIN -
    spans.prefabOriginZ;
  const lzMaxR =
    spans.strictMinZ +
    spans.spanZ * OWNED_APARTMENT_LAYOUT_FRACTION_MAX -
    spans.prefabOriginZ;

  const ix0 = Math.max(ixPl0, lxMinR);
  const ix1 = Math.min(ixPl1, lxMaxR);
  const iz0 = Math.max(izPl0, lzMinR);
  const iz1 = Math.min(izPl1, lzMaxR);

  if (!(ix1 > ix0) || !(iz1 > iz0)) {
    return {
      minX: ixPl0,
      maxX: ixPl1,
      minZ: izPl0,
      maxZ: izPl1,
    };
  }
  return {
    minX: ix0,
    maxX: ix1,
    minZ: iz0,
    maxZ: iz1,
  };
}

/**
 * Clamps prefab-slab XZ so props stay inside drywall and inside the portion of the slab that is
 * representable by the serialized fraction range.
 */
export function clampPreviewXZToAuthoringInterior(
  spans: OwnedApartmentFractionToPreviewXZ,
  x: number,
  z: number,
): { x: number; z: number } {
  const bounds = previewRepresentableXZBounds(spans);
  return {
    x: THREE.MathUtils.clamp(x, bounds.minX, bounds.maxX),
    z: THREE.MathUtils.clamp(z, bounds.minZ, bounds.maxZ),
  };
}

export type EditorMyApartmentAuthoringShellMeta = OwnedApartmentFractionToPreviewXZ & {
  sx: number;
  sz: number;
  /** Set when layout resolves; missing in square fallback (no ceiling clamp). */
  interiorCeilingInnerY?: number;
};

function readAuthoringShellAuthoringMetaFromAncestors(
  o: THREE.Object3D,
): EditorMyApartmentAuthoringShellMeta | null {
  let cur: THREE.Object3D | null = o.parent;
  while (cur) {
    const sx = cur.userData.editorMyApartmentSlabSx as number | undefined;
    const sz = cur.userData.editorMyApartmentSlabSz as number | undefined;
    const strictMinX = cur.userData.editorMyApartmentStrictMinX as number | undefined;
    const strictMinZ = cur.userData.editorMyApartmentStrictMinZ as number | undefined;
    const spanX = cur.userData.editorMyApartmentStrictSpanX as number | undefined;
    const spanZ = cur.userData.editorMyApartmentStrictSpanZ as number | undefined;
    const prefabOriginX = cur.userData.editorMyApartmentPrefabOriginX as number | undefined;
    const prefabOriginZ = cur.userData.editorMyApartmentPrefabOriginZ as number | undefined;
    const ceilingYRaw = cur.userData.editorMyApartmentInteriorCeilingInnerY as
      | number
      | undefined;
    const interiorCeilingInnerY =
      typeof ceilingYRaw === "number" && Number.isFinite(ceilingYRaw) && ceilingYRaw > 0
        ? ceilingYRaw
        : undefined;
    if (
      typeof sx === "number" &&
      typeof sz === "number" &&
      sx > 0 &&
      sz > 0
    ) {
      const haveStrict =
        typeof strictMinX === "number" &&
        typeof strictMinZ === "number" &&
        typeof spanX === "number" &&
        typeof spanZ === "number" &&
        typeof prefabOriginX === "number" &&
        typeof prefabOriginZ === "number" &&
        Number.isFinite(strictMinX) &&
        Number.isFinite(strictMinZ) &&
        Number.isFinite(spanX) &&
        Number.isFinite(spanZ) &&
        spanX > 0 &&
        spanZ > 0 &&
        Number.isFinite(prefabOriginX) &&
        Number.isFinite(prefabOriginZ);
      if (haveStrict) {
        return {
          sx,
          sz,
          strictMinX,
          strictMinZ,
          spanX,
          spanZ,
          prefabOriginX,
          prefabOriginZ,
          prefabFootprintSx: sx,
          prefabFootprintSz: sz,
          interiorCeilingInnerY,
        };
      }
      return {
        sx,
        sz,
        strictMinX: 0,
        strictMinZ: 0,
        spanX: sx,
        spanZ: sz,
        prefabOriginX: 0,
        prefabOriginZ: 0,
        prefabFootprintSx: sx,
        prefabFootprintSz: sz,
        interiorCeilingInnerY,
      };
    }
    cur = cur.parent;
  }
  return null;
}

export function snapOwnedApartmentYawRad(yRad: number): number {
  const s = EDITOR_MY_APARTMENT_YAW_SNAP_RAD;
  return Math.round(yRad / s) * s;
}

export function snapOwnedApartmentDecorYawRad(yRad: number): number {
  const s = EDITOR_MY_APARTMENT_DECOR_YAW_SNAP_RAD;
  return Math.round(yRad / s) * s;
}

export function snapOwnedApartmentDecorPitchRad(xRad: number): number {
  const s = EDITOR_MY_APARTMENT_DECOR_YAW_SNAP_RAD;
  return Math.round(xRad / s) * s;
}

export function snapOwnedApartmentDecorRollRad(zRad: number): number {
  const s = EDITOR_MY_APARTMENT_DECOR_YAW_SNAP_RAD;
  return Math.round(zRad / s) * s;
}

/** Clamps built-in furniture gizmo uniform scale to schema bounds. */
export function clampOwnedApartmentBuiltinUniformScale(s: number): number {
  return THREE.MathUtils.clamp(
    s,
    EDITOR_MY_APARTMENT_UNIFORM_SCALE_MIN,
    EDITOR_MY_APARTMENT_UNIFORM_SCALE_MAX,
  );
}

/** Clamps imported decor uniform scale (`OwnedApartmentDecorItemSchema`). */
export function clampOwnedApartmentDecorUniformScale(s: number): number {
  return THREE.MathUtils.clamp(
    s,
    OWNED_APARTMENT_DECOR_UNIFORM_SCALE_MIN,
    EDITOR_MY_APARTMENT_UNIFORM_SCALE_MAX,
  );
}

/** Uniform scale only — keeps drag/commit paths from non-uniform drift without rewriting rotation. */
export function applyMyApartmentDecorUniformScale(root: THREE.Object3D): void {
  const uniform = clampOwnedApartmentDecorUniformScale(
    (root.scale.x + root.scale.y + root.scale.z) / 3,
  );
  root.scale.setScalar(uniform);
}

/** Hard limits only — no quantization (grid snap applies separately when enabled). */
export function clampMyApartmentDecorEulerLimits(root: THREE.Object3D): void {
  decorEulerScratch.setFromQuaternion(root.quaternion, "YXZ");
  decorEulerScratch.x = THREE.MathUtils.clamp(
    decorEulerScratch.x,
    -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
    OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  );
  decorEulerScratch.z = THREE.MathUtils.clamp(
    decorEulerScratch.z,
    -OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
    OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
  );
  root.quaternion.setFromEuler(decorEulerScratch);
}

/** Quantize `YXZ` yaw/pitch/roll when grid snap is enabled for decor rotation. */
export function snapMyApartmentDecorEulerToGrid(root: THREE.Object3D): void {
  decorEulerScratch.setFromQuaternion(root.quaternion, "YXZ");
  decorEulerScratch.y = snapOwnedApartmentDecorYawRad(decorEulerScratch.y);
  decorEulerScratch.x = THREE.MathUtils.clamp(
    snapOwnedApartmentDecorPitchRad(decorEulerScratch.x),
    -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
    OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  );
  decorEulerScratch.z = THREE.MathUtils.clamp(
    snapOwnedApartmentDecorRollRad(decorEulerScratch.z),
    -OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
    OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
  );
  root.quaternion.setFromEuler(decorEulerScratch);
}

/**
 * Legacy helper: uniform scale + euler limit clamp (no grid quantization).
 * Prefer {@link applyMyApartmentDecorUniformScale} + explicit clamp/snap at interaction boundaries.
 */
export function constrainMyApartmentDecorRootPose(root: THREE.Object3D): void {
  applyMyApartmentDecorUniformScale(root);
  clampMyApartmentDecorEulerLimits(root);
}

export function constrainMyApartmentDecorVerticalBounds(root: THREE.Object3D): void {
  const meta = readAuthoringShellAuthoringMetaFromAncestors(root);
  const floorY = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y;
  const ceilY = meta?.interiorCeilingInnerY;
  const ceilCap =
    typeof ceilY === "number" && Number.isFinite(ceilY) && ceilY > floorY
      ? ceilY - EDITOR_MY_APARTMENT_INTERIOR_SLACK_M
      : undefined;

  for (let pass = 0; pass < 4; pass++) {
    root.updateMatrixWorld(true);
    decorClampBoundsScratch.setFromObject(root);
    if (decorClampBoundsScratch.isEmpty()) return;
    if (decorClampBoundsScratch.min.y < floorY) {
      root.position.y += floorY - decorClampBoundsScratch.min.y;
      continue;
    }
    if (ceilCap !== undefined && decorClampBoundsScratch.max.y > ceilCap) {
      root.position.y -= decorClampBoundsScratch.max.y - ceilCap;
      continue;
    }
    break;
  }
}

export function centerDecorRootOnVisualBounds(
  root: THREE.Object3D,
): void {
  root.updateMatrixWorld(true);
  decorClampBoundsScratch.setFromObject(root);
  if (decorClampBoundsScratch.isEmpty()) return;
  decorClampBoundsScratch.getCenter(decorRecenterWorldCenterScratch);
  decorRecenterLocalCenterScratch.copy(decorRecenterWorldCenterScratch);
  root.worldToLocal(decorRecenterLocalCenterScratch);
  root.userData[EDITOR_MY_APARTMENT_DECOR_ANCHOR_LOCAL_OFFSET_USERDATA_KEY] = [
    -decorRecenterLocalCenterScratch.x,
    -decorRecenterLocalCenterScratch.y,
    -decorRecenterLocalCenterScratch.z,
  ] as const;
  for (const child of root.children) {
    child.position.sub(decorRecenterLocalCenterScratch);
  }
  const parent = root.parent;
  if (!parent) {
    root.position.copy(decorRecenterWorldCenterScratch);
    return;
  }
  parent.updateMatrixWorld(true);
  decorRecenterParentLocalCenterScratch.copy(decorRecenterWorldCenterScratch);
  parent.worldToLocal(decorRecenterParentLocalCenterScratch);
  root.position.copy(decorRecenterParentLocalCenterScratch);
  root.updateMatrixWorld(true);
}

export function centerDecorVisualBoundsOnRoot(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  decorClampBoundsScratch.setFromObject(root);
  if (decorClampBoundsScratch.isEmpty()) return;
  decorClampBoundsScratch.getCenter(decorRecenterWorldCenterScratch);
  decorRecenterLocalCenterScratch.copy(decorRecenterWorldCenterScratch);
  root.worldToLocal(decorRecenterLocalCenterScratch);
  for (const child of root.children) {
    child.position.sub(decorRecenterLocalCenterScratch);
  }
  root.updateMatrixWorld(true);
}

export function getMyApartmentDecorAnchorWorldPosition(root: THREE.Object3D): THREE.Vector3 {
  const raw = root.userData[EDITOR_MY_APARTMENT_DECOR_ANCHOR_LOCAL_OFFSET_USERDATA_KEY];
  if (
    Array.isArray(raw) &&
    raw.length >= 3 &&
    raw.every((value) => typeof value === "number" && Number.isFinite(value))
  ) {
    decorAnchorLocalScratch.set(raw[0]!, raw[1]!, raw[2]!);
    return root.localToWorld(decorAnchorLocalScratch.clone());
  }
  return root.getWorldPosition(decorAnchorWorldScratch);
}

export function findEditorMyApartmentWallSlabMesh(
  root: THREE.Object3D,
): THREE.Mesh | undefined {
  const found = root.children.find(
    (c) =>
      c instanceof THREE.Mesh &&
      c.userData[EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY] === true,
  );
  return found instanceof THREE.Mesh ? found : undefined;
}

/** Fold gizmo scale on the root group into the wall mesh local scale (unit cube baseline). */
export function foldWallSlabScaleIntoMesh(root: THREE.Group): THREE.Mesh | undefined {
  const mesh = findEditorMyApartmentWallSlabMesh(root);
  if (!mesh) return undefined;
  const sx = Math.abs(mesh.scale.x * root.scale.x);
  const sy = Math.abs(mesh.scale.y * root.scale.y);
  const sz = Math.abs(mesh.scale.z * root.scale.z);
  root.scale.set(1, 1, 1);
  mesh.scale.set(sx, sy, sz);
  mesh.position.y = sy / 2;
  return mesh;
}

/**
 * While {@link TransformControls} scales the wall **group**, `object.scale` is the cumulative factor from
 * pointer-down, not a per-frame delta. Folding `mesh *= root` every `objectChange` therefore compounds the
 * active axis and leaks into idle axes — keep mesh fixed at gesture start until drag ends, then fold once.
 */
export type ConstrainMyApartmentWallScaleDrag = {
  meshScaleAtGestureStart: THREE.Vector3;
};

export function constrainMyApartmentWallRootPose(
  root: THREE.Object3D,
  scaleDrag?: ConstrainMyApartmentWallScaleDrag,
): void {
  if (!(root instanceof THREE.Group)) return;

  const meshAtStart = findEditorMyApartmentWallSlabMesh(root);

  if (scaleDrag && meshAtStart) {
    meshAtStart.scale.copy(scaleDrag.meshScaleAtGestureStart);
    const mx = meshAtStart.scale.x;
    const my = meshAtStart.scale.y;
    const mz = meshAtStart.scale.z;
    let ex = Math.abs(mx * root.scale.x);
    let ey = Math.abs(my * root.scale.y);
    let ez = Math.abs(mz * root.scale.z);
    ex = THREE.MathUtils.clamp(
      ex,
      EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M,
      EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MAX_M,
    );
    ey = THREE.MathUtils.clamp(
      ey,
      EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M,
      EDITOR_MY_APARTMENT_WALL_SIZE_Y_MAX_M,
    );
    ez = THREE.MathUtils.clamp(
      ez,
      EDITOR_MY_APARTMENT_WALL_THICKNESS_MIN_M,
      EDITOR_MY_APARTMENT_WALL_THICKNESS_MAX_M,
    );
    const eps = 1e-9;
    root.scale.set(mx > eps ? ex / mx : 1, my > eps ? ey / my : 1, mz > eps ? ez / mz : 1);
  } else {
    foldWallSlabScaleIntoMesh(root);
  }

  const eulerW = new THREE.Euler().setFromQuaternion(root.quaternion, "YXZ");
  const y = snapOwnedApartmentDecorYawRad(eulerW.y);
  const x = THREE.MathUtils.clamp(
    snapOwnedApartmentDecorPitchRad(eulerW.x),
    -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
    OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  );
  qSnapYawScratch.setFromEuler(new THREE.Euler(x, y, 0, "YXZ"));
  root.quaternion.copy(qSnapYawScratch);

  const mesh = findEditorMyApartmentWallSlabMesh(root);
  if (mesh && !scaleDrag) {
    mesh.scale.x = THREE.MathUtils.clamp(
      mesh.scale.x,
      EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M,
      EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MAX_M,
    );
    mesh.scale.y = THREE.MathUtils.clamp(
      mesh.scale.y,
      EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M,
      EDITOR_MY_APARTMENT_WALL_SIZE_Y_MAX_M,
    );
    mesh.scale.z = THREE.MathUtils.clamp(
      mesh.scale.z,
      EDITOR_MY_APARTMENT_WALL_THICKNESS_MIN_M,
      EDITOR_MY_APARTMENT_WALL_THICKNESS_MAX_M,
    );
    mesh.position.y = mesh.scale.y / 2;
  }

  const meta = readAuthoringShellAuthoringMetaFromAncestors(root);
  if (meta) {
    const c = clampPreviewXZToAuthoringInterior(meta, root.position.x, root.position.z);
    root.position.x = c.x;
    root.position.z = c.z;
  }

  if (meta) {
    root.updateMatrixWorld(true);
    decorClampBoundsScratch.setFromObject(root);
    decorClampBoundsScratch.getSize(decorClampSizeScratch);
    decorClampBoundsScratch.getCenter(decorClampCenterScratch);
    const bounds = previewRepresentableXZBounds(meta);
    const minX = bounds.minX + EDITOR_MY_APARTMENT_AUTHORING_AABB_BOUNDARY_SLACK_M;
    const maxX = bounds.maxX - EDITOR_MY_APARTMENT_AUTHORING_AABB_BOUNDARY_SLACK_M;
    const minZ = bounds.minZ + EDITOR_MY_APARTMENT_AUTHORING_AABB_BOUNDARY_SLACK_M;
    const maxZ = bounds.maxZ - EDITOR_MY_APARTMENT_AUTHORING_AABB_BOUNDARY_SLACK_M;

    let dx = 0;
    if (decorClampSizeScratch.x > maxX - minX) {
      dx = (minX + maxX) * 0.5 - decorClampCenterScratch.x;
    } else if (decorClampBoundsScratch.min.x < minX) {
      dx = minX - decorClampBoundsScratch.min.x;
    } else if (decorClampBoundsScratch.max.x > maxX) {
      dx = maxX - decorClampBoundsScratch.max.x;
    }

    let dz = 0;
    if (decorClampSizeScratch.z > maxZ - minZ) {
      dz = (minZ + maxZ) * 0.5 - decorClampCenterScratch.z;
    } else if (decorClampBoundsScratch.min.z < minZ) {
      dz = minZ - decorClampBoundsScratch.min.z;
    } else if (decorClampBoundsScratch.max.z > maxZ) {
      dz = maxZ - decorClampBoundsScratch.max.z;
    }

    if (dx !== 0 || dz !== 0) {
      root.position.x += dx;
      root.position.z += dz;
    }
  }

  /** Keep slab top at or below hollow-shell interior ceiling (matches decor + runtime shell `vh`). */
  if (mesh) {
    const ceilY = meta?.interiorCeilingInnerY;
    const ceilCap =
      typeof ceilY === "number" &&
      Number.isFinite(ceilY) &&
      ceilY > EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y
        ? ceilY - EDITOR_MY_APARTMENT_INTERIOR_SLACK_M
        : undefined;
    if (ceilCap !== undefined) {
      for (let pass = 0; pass < 32; pass++) {
        root.updateMatrixWorld(true);
        const tallBox = new THREE.Box3().setFromObject(root);
        if (tallBox.max.y <= ceilCap + 1e-4) break;
        const h = tallBox.max.y - tallBox.min.y;
        if (h <= EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M + 1e-6) break;
        const over = tallBox.max.y - ceilCap;
        const factor = (h - over) / h;
        if (scaleDrag) {
          const eps = 1e-9;
          const my = Math.max(mesh.scale.y, eps);
          const effY = my * root.scale.y;
          const nextEffY = Math.max(
            EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M,
            effY * factor,
          );
          if (nextEffY >= effY - 1e-6) {
            root.scale.y = EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M / my;
            break;
          }
          root.scale.y = nextEffY / my;
        } else {
          const nextSy = Math.max(
            EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M,
            mesh.scale.y * factor,
          );
          if (nextSy >= mesh.scale.y - 1e-6) {
            mesh.scale.y = EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M;
            mesh.position.y = mesh.scale.y / 2;
            break;
          }
          mesh.scale.y = nextSy;
          mesh.position.y = mesh.scale.y / 2;
        }
      }
    }
  }

  const floorY = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y;
  const maxBottomY = floorY + EDITOR_MY_APARTMENT_DECOR_DY_SCHEMA_MAX_M;

  for (let pass = 0; pass < 4; pass++) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.min.y < floorY) {
      root.position.y += floorY - box.min.y;
      continue;
    }
    if (box.min.y > maxBottomY) {
      root.position.y -= box.min.y - maxBottomY;
      continue;
    }
    break;
  }
}

export type EditorMyApartmentDecorTemplateMap = Map<string, THREE.Object3D>;

export function previewWorldFromNormalizedPlacement(args: {
  spans: OwnedApartmentFractionToPreviewXZ;
  fx: number;
  fz: number;
}): { x: number; z: number } {
  const { spans, fx, fz } = args;
  const pos = clampPreviewXZToAuthoringInterior(
    spans,
    spans.strictMinX + fx * spans.spanX - spans.prefabOriginX,
    spans.strictMinZ + fz * spans.spanZ - spans.prefabOriginZ,
  );
  return {
    x: pos.x,
    z: pos.z,
  };
}

function disposeGroupSubtreeGeometry(group: THREE.Object3D): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}

function cloneProp(template: THREE.Object3D, modelRelPath: string): THREE.Object3D {
  const r = template.clone(true);
  r.userData.mammothEditorMyApartmentProp = true;
  r.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      moodGradeMammothApartmentDecorMesh(o, { modelRelPath });
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return r;
}

function decorAssetUrl(modelRelPath: string): string {
  return `/${modelRelPath.trim().replace(/^\/+/u, "")}`;
}

function editorAuthoringVisScaleForPlacedItemKind(kind: OwnedApartmentPlacedItem["itemKind"]): number {
  return ownedApartmentPlacedItemAuthoringAssetVisScale(kind);
}

function placeWallGroup(args: {
  group: THREE.Group;
  wall: OwnedApartmentBuiltinsDoc["wallItems"][number];
  spans: OwnedApartmentFractionToPreviewXZ;
}): void {
  const { group, wall, spans } = args;
  disposeGroupSubtreeGeometry(group);
  group.clear();
  group.userData.mammothEditorMyApartmentProp = true;
  group.userData.mammothEditorMyApartmentWallId = wall.id;

  const pv = previewWorldFromNormalizedPlacement({
    spans,
    fx: wall.fx,
    fz: wall.fz,
  });
  group.position.set(pv.x, 0, pv.z);
  group.rotation.order = "YXZ";
  const yaw = snapOwnedApartmentDecorYawRad(wall.yawRad);
  const pitch = THREE.MathUtils.clamp(
    snapOwnedApartmentDecorPitchRad(wall.pitchRad),
    -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
    OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  );
  group.rotation.set(pitch, yaw, 0, "YXZ");

  const geom = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshStandardMaterial({ visible: true, color: 0xc9c4bc }),
  );
  mesh.userData[EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY] = true;
  mesh.userData.mammothEditorMyApartmentProp = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.scale.set(wall.sizeX, wall.sizeY, wall.sizeZ);
  mesh.position.y = wall.sizeY / 2;
  group.add(mesh);

  constrainMyApartmentWallRootPose(group);

  const slabTop = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + wall.dy;
  group.updateMatrixWorld(true);
  const boxBefore = new THREE.Box3().setFromObject(group);
  group.position.y += slabTop - boxBefore.min.y;
  group.updateMatrixWorld(true);

  applyOwnedApartmentWallSurfaceMaterial(mesh, wall.material);
}

function placeDecorGroup(args: {
  group: THREE.Group;
  template: THREE.Object3D;
  decor: OwnedApartmentPlacedItem;
  spans: OwnedApartmentFractionToPreviewXZ;
}): void {
  const { group, template, decor, spans } = args;
  disposeGroupSubtreeGeometry(group);
  group.clear();
  group.userData.mammothEditorMyApartmentProp = true;
  group.userData.mammothEditorMyApartmentDecorId = decor.id;
  group.userData.mammothApartmentDecorModelRelPath = decor.modelRelPath;
  const pv = previewWorldFromNormalizedPlacement({
    spans,
    fx: decor.fx,
    fz: decor.fz,
  });
  group.position.set(pv.x, EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + decor.dy, pv.z);
  group.rotation.order = "YXZ";
  const yaw = decor.yawRad;
  const pitch = THREE.MathUtils.clamp(
    decor.pitchRad,
    -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
    OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  );
  const roll = THREE.MathUtils.clamp(
    decor.rollRad ?? 0,
    -OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
    OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
  );
  group.rotation.set(pitch, yaw, roll, "YXZ");
  group.scale.setScalar(decor.uniformScale);
  const vis = cloneProp(template, decor.modelRelPath);
  vis.scale.setScalar(editorAuthoringVisScaleForPlacedItemKind(decor.itemKind));
  group.add(vis);
  centerDecorVisualBoundsOnRoot(group);
  applyMyApartmentDecorUniformScale(group);
  clampMyApartmentDecorEulerLimits(group);

  if (apartmentDecorContactShadowEligible(decor.modelRelPath)) {
    attachApartmentDecorContactShadow(
      group,
      EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
    );
  }
}

export type EditorMyApartmentFurnitureMount = {
  root: THREE.Group;
  selectionGroups: Record<string, THREE.Group>;
  practicalLights: ApartmentPracticalLightsMount | null;
  dispose: () => void;
};

const editorMyApartmentDecorTemplatePromises = new Map<string, Promise<THREE.Object3D>>();

export async function loadEditorMyApartmentDecorTemplates(
  modelRelPaths: readonly string[],
): Promise<EditorMyApartmentDecorTemplateMap> {
  const gltfLoader = new GLTFLoader();
  const objLoader = new OBJLoader();
  const out: EditorMyApartmentDecorTemplateMap = new Map();
  await Promise.all(
    [...new Set(modelRelPaths)].map(async (modelRelPath) => {
      let pending = editorMyApartmentDecorTemplatePromises.get(modelRelPath);
      if (!pending) {
        const url = decorAssetUrl(modelRelPath);
        pending = modelRelPath.toLowerCase().endsWith(".obj")
          ? objLoader.loadAsync(url)
          : gltfLoader.loadAsync(url).then((gltf) => gltf.scene);
        editorMyApartmentDecorTemplatePromises.set(modelRelPath, pending);
      }
      out.set(modelRelPath, await pending);
    }),
  );
  return out;
}

export function mountEditorMyApartmentFurnitureUnder(
  parent: THREE.Object3D,
  decorTemplates: EditorMyApartmentDecorTemplateMap,
  doc: OwnedApartmentBuiltinsDoc,
  authoringFractionMapping: OwnedApartmentFractionToPreviewXZ,
  windowScanRoot: THREE.Object3D,
): EditorMyApartmentFurnitureMount {
  const root = new THREE.Group();
  root.name = "editor_my_apartment_furniture";
  parent.add(root);

  const selectionGroups: Record<string, THREE.Group> = {};

  for (const decor of doc.placedItems) {
    const template = decorTemplates.get(decor.modelRelPath);
    if (!template) continue;
    const group = new THREE.Group();
    group.name = `editor_my_apartment_placed:${decor.id}`;
    root.add(group);
    placeDecorGroup({ group, template, decor, spans: authoringFractionMapping });
    selectionGroups[editorMyApartmentSelectedIdForDecor(decor.id)] = group;
  }

  for (const wall of doc.wallItems) {
    const group = new THREE.Group();
    group.name = `editor_my_apartment_wall:${wall.id}`;
    root.add(group);
    placeWallGroup({
      group,
      wall,
      spans: authoringFractionMapping,
    });
    selectionGroups[editorMyApartmentSelectedIdForWall(wall.id)] = group;
  }

  const practicalLights = syncApartmentInteriorPracticalLighting({
    lightParent: root,
    windowScanRoot,
    maxWindowLights: APARTMENT_INTERIOR_VISUAL_PROFILE.maxWindowPracticalLightsPerUnit,
    decorGroups: Object.values(selectionGroups),
    previous: null,
  });

  const dispose = (): void => {
    teardownApartmentSavedObjectGroupManipulator();
    practicalLights.dispose();
    for (const g of Object.values(selectionGroups)) disposeGroupSubtreeGeometry(g);
    parent.remove(root);
    root.clear();
  };

  return { root, selectionGroups, practicalLights, dispose };
}

export function updateEditorMyApartmentMountFromDoc(
  mount: EditorMyApartmentFurnitureMount,
  decorTemplates: EditorMyApartmentDecorTemplateMap,
  doc: OwnedApartmentBuiltinsDoc,
  authoringFractionMapping: OwnedApartmentFractionToPreviewXZ,
  windowScanRoot: THREE.Object3D,
): void {
  const parent = mount.root.parent;
  if (!parent) return;
  teardownApartmentSavedObjectGroupManipulator();
  const rebuilt = mountEditorMyApartmentFurnitureUnder(
    parent,
    decorTemplates,
    doc,
    authoringFractionMapping,
    windowScanRoot,
  );
  mount.dispose();
  mount.root = rebuilt.root;
  mount.selectionGroups = rebuilt.selectionGroups;
  mount.practicalLights = rebuilt.practicalLights;
  mount.dispose = rebuilt.dispose;
}
