import * as THREE from "three";
import {
  APARTMENT_MIRROR_SURFACE_USERDATA_KEY,
  mapOwnedApartmentLayoutFractionToWorldX,
  mapOwnedApartmentWorldXToLayoutFraction,
  UNIT_SHELL_WALL_THICKNESS_M,
} from "@the-mammoth/world";
import type { ApartmentUnitWorldBounds } from "@the-mammoth/engine";
import {
  OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
} from "@the-mammoth/schemas";
import {
  applyMyApartmentWallSurfaceSnap,
  maintainWallScalePinnedSpan,
  maxWallRunLengthMForRoot,
  previewRepresentableXZBounds,
  snapOwnedApartmentWallYawRad,
  type ConstrainMyApartmentWallScaleDrag,
} from "./editorMyApartmentWallSnap.js";
import type { OwnedApartmentFractionToPreviewXZ } from "./editorMyApartmentAuthoringShell.js";

/** Top of authoring shell floor slab — keep in sync with `editorMyApartmentAuthoringShell.ts`. */
export const EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y = 0.02;

/** Matches hollow-shell vertical span for window practical-light filtering in layout preview. */
export function apartmentUnitBoundsFromAuthoringFractionMapping(
  spans: OwnedApartmentFractionToPreviewXZ,
  ceilingHeightM: number,
): ApartmentUnitWorldBounds {
  const maxY = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + Math.max(2, ceilingHeightM);
  const slabSx =
    typeof spans.slabFootprintSx === "number" && spans.slabFootprintSx > spans.prefabFootprintSx
      ? spans.slabFootprintSx
      : spans.prefabFootprintSx;
  /** Authoring shell root is at origin — decor XZ is `[0, footprint]`, not floor-doc world coords. */
  return {
    minX: 0,
    maxX: slabSx,
    minY: EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
    maxY,
    minZ: 0,
    maxZ: spans.prefabFootprintSz,
  };
}

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
/** Matches `OwnedApartmentWallItemSchema` extent clamps. */
export const EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M = 0.05;
export const EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MAX_M = 8;
export const EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M = 0.05;
export const EDITOR_MY_APARTMENT_WALL_SIZE_Y_MAX_M = 8;
export const EDITOR_MY_APARTMENT_WALL_THICKNESS_MIN_M = 0.02;
export const EDITOR_MY_APARTMENT_WALL_THICKNESS_MAX_M = 2;

export const EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY = "mammothEditorMyApartmentWallMesh" as const;
/** Cached run length / thickness for door-proxy clamp (avoids `updateMatrixWorld` on holed visuals). */
export const EDITOR_MY_APARTMENT_WALL_RUN_LENGTH_UD = "editorMyApartmentWallRunLengthM" as const;
export const EDITOR_MY_APARTMENT_WALL_THICKNESS_UD = "editorMyApartmentWallThicknessM" as const;
/** Matches {@link APARTMENT_MIRROR_SURFACE_USERDATA_KEY} on the reflective plane mesh. */
export const EDITOR_MY_APARTMENT_MIRROR_SURFACE_USERDATA_KEY =
  APARTMENT_MIRROR_SURFACE_USERDATA_KEY;

const decorClampBoundsScratch = new THREE.Box3();
const decorRecenterWorldCenterScratch = new THREE.Vector3();
const decorRecenterLocalCenterScratch = new THREE.Vector3();
const decorRecenterParentLocalCenterScratch = new THREE.Vector3();
const decorAnchorWorldScratch = new THREE.Vector3();
const decorAnchorLocalScratch = new THREE.Vector3();
export const EDITOR_MY_APARTMENT_DECOR_ANCHOR_LOCAL_OFFSET_USERDATA_KEY =
  "editorMyApartmentDecorAnchorLocalOffset";

export function clampPreviewXZToPlasterInterior(args: {
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

/**
 * Clamps prefab-slab XZ so props stay inside drywall and inside the portion of the slab that is
 * representable by the serialized fraction range.
 */
export { previewRepresentableXZBounds } from "./editorMyApartmentWallSnap.js";

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

export function readAuthoringShellAuthoringMetaFromAncestors(
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
      const unitId = (cur.userData.editorMyApartmentUnitId as string | undefined) ?? "";
      if (haveStrict) {
        return {
          unitId,
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
          slabFootprintSx: sx,
          interiorCeilingInnerY,
        };
      }
      return {
        unitId,
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
        slabFootprintSx: sx,
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

export {
  applyMyApartmentDecorRootScaleFromDoc,
  applyMyApartmentDecorUniformScale,
  clampOwnedApartmentDecorUniformScale,
  constrainMyApartmentDecorScaleFromGizmo,
  readMyApartmentDecorCommittedScale,
  type MyApartmentDecorScaleGesturePin,
} from "./editorMyApartmentDecorScale.js";

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

export {
  applyMyApartmentWallSurfaceSnap,
  clampWallAabbToUnitShellInterior,
  snapOwnedApartmentWallYawRad,
  type ConstrainMyApartmentWallScaleDrag,
} from "./editorMyApartmentWallSnap.js";

export function constrainMyApartmentWallRootPose(
  root: THREE.Object3D,
  scaleDrag?: ConstrainMyApartmentWallScaleDrag,
  wallSnapOpts?: {
    autoYaw?: boolean;
    neighborSnap?: boolean;
    fillRunBracket?: boolean;
  },
): void {
  if (!(root instanceof THREE.Group)) return;

  const maxRunLenM = maxWallRunLengthMForRoot(root);
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
      maxRunLenM,
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
    if (scaleDrag.pinnedSpan) {
      maintainWallScalePinnedSpan(root, scaleDrag.pinnedSpan);
    }
  } else {
    foldWallSlabScaleIntoMesh(root);
  }

  const eulerW = new THREE.Euler().setFromQuaternion(root.quaternion, "YXZ");
  const y = snapOwnedApartmentWallYawRad(eulerW.y);
  qSnapYawScratch.setFromEuler(new THREE.Euler(0, y, 0, "YXZ"));
  root.quaternion.copy(qSnapYawScratch);

  const mesh = findEditorMyApartmentWallSlabMesh(root);
  if (mesh && !scaleDrag) {
    mesh.scale.x = THREE.MathUtils.clamp(
      mesh.scale.x,
      EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M,
      maxRunLenM,
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
  if (mesh) {
    const ceilY = meta?.interiorCeilingInnerY;
    const ceilCap =
      typeof ceilY === "number" &&
      Number.isFinite(ceilY) &&
      ceilY > EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y
        ? ceilY - EDITOR_MY_APARTMENT_INTERIOR_SLACK_M
        : undefined;
    if (ceilCap !== undefined) {
      for (let pass = 0; pass < 8; pass++) {
        root.updateMatrixWorld(true);
        const tallBox = new THREE.Box3().setFromObject(root);
        if (tallBox.max.y <= ceilCap + 1e-4) break;
        const h = tallBox.max.y - tallBox.min.y;
        const floorY = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y;
        const maxAllowedH = ceilCap - floorY;
        const heightScaleDrag =
          scaleDrag?.activeWorldAxis === "Y" || scaleDrag?.pinnedSpan?.localAxis === "y";

        if (heightScaleDrag && scaleDrag) {
          const bottom = Math.max(tallBox.min.y, floorY);
          const maxH = ceilCap - bottom;
          const my = Math.max(mesh.scale.y, 1e-9);
          const desiredH = my * root.scale.y;
          const nextH = THREE.MathUtils.clamp(
            desiredH,
            EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M,
            maxH,
          );
          root.scale.y = nextH / my;
          if (scaleDrag.pinnedSpan?.localAxis === "y") {
            maintainWallScalePinnedSpan(root, scaleDrag.pinnedSpan);
          }
          break;
        } else if (!scaleDrag && h > maxAllowedH + 1e-4) {
          mesh.scale.y = maxAllowedH;
          mesh.position.y = mesh.scale.y / 2;
        } else {
          root.position.y -= tallBox.max.y - ceilCap;
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

  if (mesh && meta) {
    applyMyApartmentWallSurfaceSnap(root, mesh, meta, {
      scaleDrag,
      autoYaw: wallSnapOpts?.autoYaw === true && !scaleDrag,
      neighborSnap: wallSnapOpts?.neighborSnap !== false,
      fillRunBracket: wallSnapOpts?.fillRunBracket === true,
    });
    if (scaleDrag?.pinnedSpan) {
      maintainWallScalePinnedSpan(root, scaleDrag.pinnedSpan);
    }
  }
}

export function findEditorMyApartmentMirrorSurfaceMesh(
  root: THREE.Object3D,
): THREE.Mesh | undefined {
  let found: THREE.Mesh | undefined;
  root.traverse((c) => {
    if (
      found === undefined &&
      c instanceof THREE.Mesh &&
      c.userData[EDITOR_MY_APARTMENT_MIRROR_SURFACE_USERDATA_KEY] === true
    ) {
      found = c;
    }
  });
  return found;
}

export function foldMirrorSurfaceScaleIntoMesh(root: THREE.Group): THREE.Mesh | undefined {
  const mesh = findEditorMyApartmentMirrorSurfaceMesh(root);
  if (!mesh) return undefined;
  const sx = Math.abs(mesh.scale.x * root.scale.x);
  const sy = Math.abs(mesh.scale.y * root.scale.y);
  root.scale.set(1, 1, 1);
  mesh.scale.set(sx, sy, 1);
  mesh.position.y = sy / 2;
  return mesh;
}

export type ConstrainMyApartmentMirrorScaleDrag = {
  meshScaleAtGestureStart: THREE.Vector3;
};

export function constrainMyApartmentMirrorRootPose(
  root: THREE.Object3D,
  scaleDrag?: ConstrainMyApartmentMirrorScaleDrag,
): void {
  if (!(root instanceof THREE.Group)) return;

  const meshAtStart = findEditorMyApartmentMirrorSurfaceMesh(root);

  if (scaleDrag && meshAtStart) {
    meshAtStart.scale.copy(scaleDrag.meshScaleAtGestureStart);
    const mx = meshAtStart.scale.x;
    const my = meshAtStart.scale.y;
    let ex = Math.abs(mx * root.scale.x);
    let ey = Math.abs(my * root.scale.y);
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
    const eps = 1e-9;
    root.scale.set(mx > eps ? ex / mx : 1, my > eps ? ey / my : 1, 1);
  } else {
    foldMirrorSurfaceScaleIntoMesh(root);
  }

  clampMyApartmentDecorEulerLimits(root);

  const mesh = findEditorMyApartmentMirrorSurfaceMesh(root);
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
    mesh.position.y = mesh.scale.y / 2;
  }

  const meta = readAuthoringShellAuthoringMetaFromAncestors(root);
  if (meta) {
    const c = clampPreviewXZToAuthoringInterior(meta, root.position.x, root.position.z);
    root.position.x = c.x;
    root.position.z = c.z;
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

export function previewWorldFromNormalizedPlacement(args: {
  spans: OwnedApartmentFractionToPreviewXZ;
  fx: number;
  fz: number;
}): { x: number; z: number } {
  const { spans, fx, fz } = args;
  const worldX = mapOwnedApartmentLayoutFractionToWorldX(
    spans.strictMinX,
    spans.strictMinX + spans.spanX,
    spans.unitId,
    fx,
  );
  const pos = clampPreviewXZToAuthoringInterior(
    spans,
    worldX - spans.prefabOriginX,
    spans.strictMinZ + fz * spans.spanZ - spans.prefabOriginZ,
  );
  return {
    x: pos.x,
    z: pos.z,
  };
}

/**
 * Inverse of {@link previewWorldFromNormalizedPlacement} for gizmo commits — uses balcony-aware
 * `fx` mapping (must match client {@link mapOwnedApartmentLayoutFractionToWorldX}).
 */
export function layoutFractionsFromPreviewWorldPosition(
  spans: OwnedApartmentFractionToPreviewXZ,
  previewWorldX: number,
  previewWorldZ: number,
): { fx: number; fz: number } {
  const worldX = previewWorldX + spans.prefabOriginX;
  const worldZ = previewWorldZ + spans.prefabOriginZ;
  return {
    fx: THREE.MathUtils.clamp(
      mapOwnedApartmentWorldXToLayoutFraction(
        spans.strictMinX,
        spans.strictMinX + spans.spanX,
        spans.unitId,
        worldX,
      ),
      OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
      OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
    ),
    fz: THREE.MathUtils.clamp(
      (worldZ - spans.strictMinZ) / spans.spanZ,
      OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
      OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
    ),
  };
}
