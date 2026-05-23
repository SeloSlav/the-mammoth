import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { resolveStaticModelFetchUrl } from "@the-mammoth/engine";
import {
  moodGradeMammothApartmentDecorMesh,
  attachApartmentWarmFixtureBulbGlow,
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  applyApartmentDecorCastShadowFlags,
  applyApartmentInteriorFloorReceiveShadowUnder,
  disposeLeakedApartmentDecorContactShadows,
  syncApartmentDecorShadowRig,
  syncApartmentDecorBakedFloorShadowOverlay,
  syncApartmentInteriorPracticalLighting,
  prepareMammothApartmentInteriorContentRoots,
  type ApartmentDecorBakedFloorShadowMount,
  type ApartmentDecorShadowRigMount,
  type ApartmentPracticalLightsMount,
  type ApartmentUnitWorldBounds,
} from "@the-mammoth/engine";
import { useEditorStore } from "../../state/editorStore.js";
import {
  APARTMENT_MIRROR_SURFACE_USERDATA_KEY,
  mapOwnedApartmentLayoutFractionToWorldX,
  mapOwnedApartmentWorldXToLayoutFraction,
  UNIT_SHELL_WALL_THICKNESS_M,
  applyOwnedApartmentWallSurfaceMaterial,
  applyOwnedApartmentWallSurfaceMaterialToVisuals,
  buildOwnedApartmentPartitionWallRefMesh,
  rebuildOwnedApartmentPartitionWallVisual,
  readOwnedApartmentPartitionWallLocalExtents,
  clampOwnedApartmentWallOpeningsForLength,
  clampWallOpeningTangentOffsetM,
  syncOwnedApartmentWallOpeningProxies,
  buildApartmentPlanarMirrorVisual,
  buildProceduralApartmentDecorVisual,
  isProceduralApartmentDecorModelPath,
  postProcessApartmentDecorGltfScene,
  tagProceduralApartmentDecorMeshesSkipMerge,
  mergeApartmentDecorManifestPaths,
} from "@the-mammoth/world";
import {
  OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
  OWNED_APARTMENT_DECOR_UNIFORM_SCALE_MIN,
  OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
  type OwnedApartmentBuiltinsDoc,
  type OwnedApartmentMirrorItem,
  type OwnedApartmentPlacedItem,
  ownedApartmentPlacedItemAuthoringAssetVisScale,
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
import {
  applyMyApartmentDecorRootScaleFromDoc,
  applyMyApartmentDecorUniformScale,
} from "./editorMyApartmentDecorScale.js";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForMirror,
  editorMyApartmentSelectedIdForWall,
  editorMyApartmentSelectedIdForWallOpening,
  parseMyApartmentLayoutWallOpeningSelectedId,
} from "./editorMyApartmentSelection.js";
import { teardownApartmentSavedObjectGroupManipulator } from "./editorMyApartmentSavedGroupManip.js";
import { getEditorMyApartmentDecorShadowRenderer } from "./editorMyApartmentPieceGroupBridge.js";
import { listMyApartmentPlacedItemModelRelPaths } from "./editorOwnedApartmentSceneLayout.js";
import {
  ownedApartmentPlacedItemPoseEqual,
  ownedApartmentPlacedItemStructuralEqual,
  ownedApartmentWallPlacementFieldsEqual,
} from "./preserveOwnedApartmentMountPlacementRefs.js";

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
/** Cached run length / thickness for door-proxy clamp (avoids `updateMatrixWorld` on holed visuals). */
export const EDITOR_MY_APARTMENT_WALL_RUN_LENGTH_UD = "editorMyApartmentWallRunLengthM" as const;
export const EDITOR_MY_APARTMENT_WALL_THICKNESS_UD = "editorMyApartmentWallThicknessM" as const;
/** Matches {@link APARTMENT_MIRROR_SURFACE_USERDATA_KEY} on the reflective plane mesh. */
export const EDITOR_MY_APARTMENT_MIRROR_SURFACE_USERDATA_KEY =
  APARTMENT_MIRROR_SURFACE_USERDATA_KEY;

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

export type EditorMyApartmentDecorTemplateMap = Map<string, THREE.Object3D>;

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

function disposeGroupSubtreeGeometry(group: THREE.Object3D): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}

function cloneApartmentDecorTemplateMeshResources(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry = o.geometry.clone();
    if (Array.isArray(o.material)) {
      o.material = o.material.map((material) => material.clone());
    } else {
      o.material = o.material.clone();
    }
  });
}

function cloneProp(template: THREE.Object3D, modelRelPath: string): THREE.Object3D {
  const r = template.clone(true);
  cloneApartmentDecorTemplateMeshResources(r);
  r.userData.mammothEditorMyApartmentProp = true;
  if (isProceduralApartmentDecorModelPath(modelRelPath)) {
    tagProceduralApartmentDecorMeshesSkipMerge(r);
  }
  r.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      moodGradeMammothApartmentDecorMesh(o, { modelRelPath });
    }
  });
  attachApartmentWarmFixtureBulbGlow(r, modelRelPath);
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
  const yaw = snapOwnedApartmentWallYawRad(wall.yawRad);
  const pitch = THREE.MathUtils.clamp(
    snapOwnedApartmentDecorPitchRad(wall.pitchRad),
    -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
    OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  );
  group.rotation.set(pitch, yaw, 0, "YXZ");

  const refMesh = buildOwnedApartmentPartitionWallRefMesh({
    parent: group,
    sizeX: wall.sizeX,
    sizeY: wall.sizeY,
    sizeZ: wall.sizeZ,
  });
  refMesh.userData[EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY] = true;
  refMesh.userData.mammothEditorMyApartmentProp = true;

  constrainMyApartmentWallRootPose(group, undefined, { neighborSnap: false });

  const extents = readOwnedApartmentPartitionWallLocalExtents(group) ?? {
    sizeX: wall.sizeX,
    sizeY: wall.sizeY,
    sizeZ: wall.sizeZ,
  };
  writeEditorWallSlabExtentsCache(group, {
    sizeX: extents.sizeX,
    sizeZ: extents.sizeZ,
  });
  const openings = clampOwnedApartmentWallOpeningsForLength(
    extents.sizeX,
    wall.openings ?? [],
  );
  const wallMat = new THREE.MeshStandardMaterial({ visible: true, color: 0xc9c4bc });
  rebuildOwnedApartmentPartitionWallVisual({
    parent: group,
    sizeX: extents.sizeX,
    sizeY: extents.sizeY,
    sizeZ: extents.sizeZ,
    openings,
    wallMaterial: wallMat,
    opts: { editorWallVisual: true },
  });

  applyOwnedApartmentWallSurfaceMaterialToVisuals(group, (mesh) => {
    applyOwnedApartmentWallSurfaceMaterial(mesh, wall.material);
  });

  syncOwnedApartmentWallOpeningProxies({
    wallGroup: group,
    sizeX: extents.sizeX,
    sizeY: extents.sizeY,
    sizeZ: extents.sizeZ,
    openings,
  });

  const slabBottom = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + wall.dy;
  group.updateMatrixWorld(true);
  const boxBefore = new THREE.Box3().setFromObject(group);
  group.position.y += slabBottom - boxBefore.min.y;
  group.updateMatrixWorld(true);
}

export function syncWallOpeningSelectionGroups(
  selectionGroups: Record<string, THREE.Group>,
  wallId: string,
  wallGroup: THREE.Group,
  openings: readonly { id: string }[],
): void {
  const keep = new Set(
    openings.map((o) => editorMyApartmentSelectedIdForWallOpening(wallId, o.id)),
  );
  for (const key of Object.keys(selectionGroups)) {
    const parsed = parseMyApartmentLayoutWallOpeningSelectedId(key);
    if (parsed?.wallId === wallId && !keep.has(key)) {
      delete selectionGroups[key];
    }
  }
  for (const opening of openings) {
    const selId = editorMyApartmentSelectedIdForWallOpening(wallId, opening.id);
    const proxy = wallGroup.children.find(
      (c) =>
        c instanceof THREE.Group &&
        c.userData.mammothEditorMyApartmentWallOpeningId === opening.id,
    );
    if (proxy instanceof THREE.Group) {
      selectionGroups[selId] = proxy;
    }
  }
}

export function purgeWallOpeningSelectionGroups(
  selectionGroups: Record<string, THREE.Group>,
  wallId: string,
): void {
  for (const key of Object.keys(selectionGroups)) {
    const parsed = parseMyApartmentLayoutWallOpeningSelectedId(key);
    if (parsed?.wallId === wallId) delete selectionGroups[key];
  }
}

/** Read wall run length for opening clamp without updating the holed visual subtree. */
export function readEditorWallSlabExtentsForOpeningClamp(
  wallRoot: THREE.Object3D,
  wallItem: Pick<OwnedApartmentBuiltinsDoc["wallItems"][number], "sizeX" | "sizeZ">,
): { sizeX: number; sizeZ: number } {
  const cachedX = wallRoot.userData[EDITOR_MY_APARTMENT_WALL_RUN_LENGTH_UD] as number | undefined;
  const cachedZ = wallRoot.userData[EDITOR_MY_APARTMENT_WALL_THICKNESS_UD] as number | undefined;
  if (
    typeof cachedX === "number" &&
    cachedX > 0 &&
    typeof cachedZ === "number" &&
    cachedZ > 0
  ) {
    return { sizeX: cachedX, sizeZ: cachedZ };
  }
  for (const child of wallRoot.children) {
    if (child instanceof THREE.Mesh && child.name === "wall_slab_ref") {
      return {
        sizeX: Math.abs(child.scale.x * wallRoot.scale.x),
        sizeZ: Math.abs(child.scale.z * wallRoot.scale.z),
      };
    }
  }
  return { sizeX: wallItem.sizeX, sizeZ: wallItem.sizeZ };
}

export function writeEditorWallSlabExtentsCache(
  wallRoot: THREE.Object3D,
  extents: { sizeX: number; sizeZ: number },
): void {
  wallRoot.userData[EDITOR_MY_APARTMENT_WALL_RUN_LENGTH_UD] = extents.sizeX;
  wallRoot.userData[EDITOR_MY_APARTMENT_WALL_THICKNESS_UD] = extents.sizeZ;
}

/** Re-cut door holes + proxies without resetting wall pose (opening drag commit / add door). */
export function refreshWallOpeningsOnGroup(
  group: THREE.Group,
  wall: OwnedApartmentBuiltinsDoc["wallItems"][number],
): void {
  const { sizeX, sizeZ } = readEditorWallSlabExtentsForOpeningClamp(group, wall);
  writeEditorWallSlabExtentsCache(group, { sizeX, sizeZ });
  const ref = findEditorMyApartmentWallSlabMesh(group);
  const sizeY = ref ? Math.abs(ref.scale.y * group.scale.y) : wall.sizeY;
  const openings = clampOwnedApartmentWallOpeningsForLength(sizeX, wall.openings ?? []);
  const wallMat = new THREE.MeshStandardMaterial({ visible: true, color: 0xc9c4bc });
  rebuildOwnedApartmentPartitionWallVisual({
    parent: group,
    sizeX,
    sizeY,
    sizeZ,
    openings,
    wallMaterial: wallMat,
    opts: { editorWallVisual: true },
  });
  applyOwnedApartmentWallSurfaceMaterialToVisuals(group, (mesh) => {
    applyOwnedApartmentWallSurfaceMaterial(mesh, wall.material);
  });
  syncOwnedApartmentWallOpeningProxies({
    wallGroup: group,
    sizeX,
    sizeY,
    sizeZ,
    openings,
  });
}

export function clampMyApartmentWallOpeningProxyPose(
  proxy: THREE.Object3D,
  wallRoot: THREE.Object3D,
  wallItem: OwnedApartmentBuiltinsDoc["wallItems"][number],
  openingId: string,
): void {
  const opening = (wallItem.openings ?? []).find((o) => o.id === openingId);
  if (!opening) return;
  const { sizeX, sizeZ } = readEditorWallSlabExtentsForOpeningClamp(wallRoot, wallItem);
  proxy.position.x = clampWallOpeningTangentOffsetM(sizeX, opening.widthM, proxy.position.x);
  proxy.position.y = opening.centerYM;
  proxy.position.z = sizeZ * 0.5 + 0.015;
  proxy.rotation.set(0, 0, 0);
  proxy.scale.set(1, 1, 1);
}

function placeMirrorGroup(args: {
  group: THREE.Group;
  mirror: OwnedApartmentMirrorItem;
  spans: OwnedApartmentFractionToPreviewXZ;
}): void {
  const { group, mirror, spans } = args;
  disposeGroupSubtreeGeometry(group);
  group.clear();
  group.userData.mammothEditorMyApartmentProp = true;
  group.userData.mammothEditorMyApartmentMirrorId = mirror.id;

  const pv = previewWorldFromNormalizedPlacement({
    spans,
    fx: mirror.fx,
    fz: mirror.fz,
  });
  group.position.set(pv.x, 0, pv.z);
  group.rotation.order = "YXZ";
  const yaw = mirror.yawRad;
  const pitch = THREE.MathUtils.clamp(
    mirror.pitchRad,
    -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
    OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  );
  const roll = THREE.MathUtils.clamp(
    mirror.rollRad ?? 0,
    -OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
    OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
  );
  group.rotation.set(pitch, yaw, roll, "YXZ");

  const visual = buildApartmentPlanarMirrorVisual({
    widthM: mirror.sizeX,
    heightM: mirror.sizeY,
    includeFrame: true,
  });
  group.add(visual);
  constrainMyApartmentMirrorRootPose(group);

  const slabTop = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + mirror.dy;
  group.updateMatrixWorld(true);
  const boxBefore = new THREE.Box3().setFromObject(group);
  group.position.y += slabTop - boxBefore.min.y;
  group.updateMatrixWorld(true);
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
  applyDecorGroupPoseFromDoc({ group, decor, spans });
  const vis = cloneProp(template, decor.modelRelPath);
  vis.scale.setScalar(editorAuthoringVisScaleForPlacedItemKind(decor.itemKind));
  group.add(vis);
  centerDecorVisualBoundsOnRoot(group);
  clampMyApartmentDecorEulerLimits(group);
  applyApartmentDecorCastShadowFlags(group, decor.modelRelPath);
}

/** Pose-only update — keeps meshes/materials (and PMREM env bind) intact. */
export function applyDecorGroupPoseFromDoc(args: {
  group: THREE.Group;
  decor: OwnedApartmentPlacedItem;
  spans: OwnedApartmentFractionToPreviewXZ;
}): void {
  const { group, decor, spans } = args;
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
  applyMyApartmentDecorRootScaleFromDoc(
    group,
    decor.uniformScale,
    decor.verticalScaleMul ?? 1,
  );
}

function editorMyApartmentDecorGroups(
  selectionGroups: Record<string, THREE.Group>,
): THREE.Group[] {
  return Object.values(selectionGroups).filter(
    (group) => typeof group.userData.mammothApartmentDecorModelRelPath === "string",
  );
}

export type EditorMyApartmentFurnitureMount = {
  root: THREE.Group;
  selectionGroups: Record<string, THREE.Group>;
  practicalLights: ApartmentPracticalLightsMount | null;
  decorShadowRig: ApartmentDecorShadowRigMount | null;
  bakedFloorShadowMount: ApartmentDecorBakedFloorShadowMount | null;
  resyncPracticalLights: (
    windowScanRoot: THREE.Object3D,
    unitBounds?: ApartmentUnitWorldBounds,
  ) => void;
  resyncDecorShadows: (unitBounds?: ApartmentUnitWorldBounds) => void;
  dispose: () => void;
  /** Wall ids currently represented in `selectionGroups` (incremental sync). */
  mountedWallIds: Set<string>;
  mountedMirrorIds: Set<string>;
  mountedDecorIds: Set<string>;
};

function mountIdSet(ids: readonly { id: string }[]): Set<string> {
  return new Set(ids.map((x) => x.id));
}

/** Add/update/remove décor groups without rebuilding walls/mirrors or reloading GLB templates. */
export function syncEditorMyApartmentDecorOnMount(
  mount: EditorMyApartmentFurnitureMount,
  decorTemplates: EditorMyApartmentDecorTemplateMap,
  doc: OwnedApartmentBuiltinsDoc,
  spans: OwnedApartmentFractionToPreviewXZ,
  prevPlacedItems?: readonly OwnedApartmentPlacedItem[],
): { structuralRebuild: boolean } {
  const prevById = new Map((prevPlacedItems ?? []).map((item) => [item.id, item]));
  let structuralRebuild = false;
  const nextIds = new Set(doc.placedItems.map((d) => d.id));
  for (const decor of doc.placedItems) {
    const template = decorTemplates.get(decor.modelRelPath);
    if (!template) continue;
    const selId = editorMyApartmentSelectedIdForDecor(decor.id);
    let group = mount.selectionGroups[selId];
    const prev = prevById.get(decor.id);
    if (!group) {
      group = new THREE.Group();
      group.name = `editor_my_apartment_placed:${decor.id}`;
      mount.root.add(group);
      mount.selectionGroups[selId] = group;
      placeDecorGroup({ group, template, decor, spans });
      structuralRebuild = true;
      continue;
    }
    if (!prev || !ownedApartmentPlacedItemStructuralEqual(prev, decor)) {
      placeDecorGroup({ group, template, decor, spans });
      structuralRebuild = true;
      continue;
    }
    if (!ownedApartmentPlacedItemPoseEqual(prev, decor)) {
      applyDecorGroupPoseFromDoc({ group, decor, spans });
      centerDecorVisualBoundsOnRoot(group);
      clampMyApartmentDecorEulerLimits(group);
    }
  }
  for (const id of mount.mountedDecorIds) {
    if (nextIds.has(id)) continue;
    structuralRebuild = true;
    const selId = editorMyApartmentSelectedIdForDecor(id);
    const group = mount.selectionGroups[selId];
    if (group) {
      disposeGroupSubtreeGeometry(group);
      mount.root.remove(group);
      delete mount.selectionGroups[selId];
    }
  }
  mount.mountedDecorIds = nextIds;
  return { structuralRebuild };
}

/** Add/update/remove wall groups without rebuilding decor/mirror meshes. */
export function syncEditorMyApartmentWallsOnMount(
  mount: EditorMyApartmentFurnitureMount,
  doc: OwnedApartmentBuiltinsDoc,
  spans: OwnedApartmentFractionToPreviewXZ,
  opts?: {
    onlyWallIds?: ReadonlySet<string>;
    prevWallItems?: OwnedApartmentBuiltinsDoc["wallItems"];
  },
): void {
  const prevById = new Map((opts?.prevWallItems ?? []).map((w) => [w.id, w]));
  const nextIds = new Set(doc.wallItems.map((w) => w.id));
  for (const wall of doc.wallItems) {
    if (opts?.onlyWallIds && !opts.onlyWallIds.has(wall.id)) {
      continue;
    }
    const selId = editorMyApartmentSelectedIdForWall(wall.id);
    let group = mount.selectionGroups[selId];
    if (!group) {
      group = new THREE.Group();
      group.name = `editor_my_apartment_wall:${wall.id}`;
      mount.root.add(group);
      mount.selectionGroups[selId] = group;
    }
    const prevWall = prevById.get(wall.id);
    const openingsOnly =
      prevWall !== undefined &&
      group.children.length > 0 &&
      ownedApartmentWallPlacementFieldsEqual(prevWall, wall) &&
      JSON.stringify(prevWall.openings ?? []) !== JSON.stringify(wall.openings ?? []);
    if (openingsOnly) {
      refreshWallOpeningsOnGroup(group, wall);
    } else {
      placeWallGroup({ group, wall, spans });
    }
    syncWallOpeningSelectionGroups(mount.selectionGroups, wall.id, group, wall.openings ?? []);
  }
  for (const id of mount.mountedWallIds) {
    if (nextIds.has(id)) continue;
    purgeWallOpeningSelectionGroups(mount.selectionGroups, id);
    const selId = editorMyApartmentSelectedIdForWall(id);
    const group = mount.selectionGroups[selId];
    if (group) {
      disposeGroupSubtreeGeometry(group);
      mount.root.remove(group);
      delete mount.selectionGroups[selId];
    }
  }
  mount.mountedWallIds = nextIds;
}

export function syncEditorMyApartmentMirrorsOnMount(
  mount: EditorMyApartmentFurnitureMount,
  doc: OwnedApartmentBuiltinsDoc,
  spans: OwnedApartmentFractionToPreviewXZ,
): void {
  const nextIds = new Set(doc.mirrorItems.map((m) => m.id));
  for (const mirror of doc.mirrorItems) {
    const selId = editorMyApartmentSelectedIdForMirror(mirror.id);
    let group = mount.selectionGroups[selId];
    if (!group) {
      group = new THREE.Group();
      group.name = `editor_my_apartment_mirror:${mirror.id}`;
      mount.root.add(group);
      mount.selectionGroups[selId] = group;
    }
    placeMirrorGroup({ group, mirror, spans });
  }
  for (const id of mount.mountedMirrorIds) {
    if (nextIds.has(id)) continue;
    const selId = editorMyApartmentSelectedIdForMirror(id);
    const group = mount.selectionGroups[selId];
    if (group) {
      disposeGroupSubtreeGeometry(group);
      mount.root.remove(group);
      delete mount.selectionGroups[selId];
    }
  }
  mount.mountedMirrorIds = nextIds;
}

const editorMyApartmentDecorTemplatePromises = new Map<string, Promise<THREE.Object3D>>();

export function listMissingEditorDecorTemplatePaths(
  doc: OwnedApartmentBuiltinsDoc,
  templates: EditorMyApartmentDecorTemplateMap,
): string[] {
  return listMyApartmentPlacedItemModelRelPaths(doc).filter((path) => !templates.has(path));
}

/** Loads any catalog paths not yet in `templates` (e.g. after Import in the same session). */
export async function loadMissingEditorDecorTemplates(
  templates: EditorMyApartmentDecorTemplateMap,
  modelRelPaths: readonly string[],
): Promise<void> {
  const missing = [...new Set(modelRelPaths)].filter((path) => !templates.has(path));
  if (missing.length === 0) return;
  const loaded = await loadEditorMyApartmentDecorTemplates(missing);
  for (const [path, scene] of loaded) {
    templates.set(path, scene);
  }
}

export async function loadEditorMyApartmentDecorTemplates(
  modelRelPaths: readonly string[],
): Promise<EditorMyApartmentDecorTemplateMap> {
  const gltfLoader = new GLTFLoader();
  const objLoader = new OBJLoader();
  const out: EditorMyApartmentDecorTemplateMap = new Map();
  await Promise.all(
    [...new Set(modelRelPaths)].map(async (modelRelPath) => {
      try {
        const procedural = buildProceduralApartmentDecorVisual(modelRelPath);
        if (procedural) {
          out.set(modelRelPath, procedural);
          return;
        }
        const url = await resolveStaticModelFetchUrl(decorAssetUrl(modelRelPath));
        let pending = editorMyApartmentDecorTemplatePromises.get(url);
        if (!pending) {
          const loadPromise = modelRelPath.toLowerCase().endsWith(".obj")
            ? objLoader.loadAsync(url)
            : gltfLoader.loadAsync(url).then((gltf) => {
                postProcessApartmentDecorGltfScene(gltf.scene, modelRelPath);
                return gltf.scene;
              });
          pending = loadPromise.catch((err: unknown) => {
            editorMyApartmentDecorTemplatePromises.delete(url);
            throw err;
          });
          editorMyApartmentDecorTemplatePromises.set(url, pending);
        }
        out.set(modelRelPath, await pending);
      } catch (err) {
        console.warn(
          `[editor] Failed to load decor model ${modelRelPath}:`,
          err instanceof Error ? err.message : err,
        );
      }
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
  unitBounds?: ApartmentUnitWorldBounds,
): EditorMyApartmentFurnitureMount {
  disposeLeakedApartmentDecorContactShadows(parent);

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
    syncWallOpeningSelectionGroups(
      selectionGroups,
      wall.id,
      group,
      wall.openings ?? [],
    );
  }

  for (const mirror of doc.mirrorItems) {
    const group = new THREE.Group();
    group.name = `editor_my_apartment_mirror:${mirror.id}`;
    root.add(group);
    placeMirrorGroup({
      group,
      mirror,
      spans: authoringFractionMapping,
    });
    selectionGroups[editorMyApartmentSelectedIdForMirror(mirror.id)] = group;
  }

  let practicalLights: ApartmentPracticalLightsMount | null = null;
  let decorShadowRig: ApartmentDecorShadowRigMount | null = null;
  let bakedFloorShadowMount: ApartmentDecorBakedFloorShadowMount | null = null;
  const resyncDecorShadows = (bounds?: ApartmentUnitWorldBounds): void => {
    const decorGroups = editorMyApartmentDecorGroups(selectionGroups);
    const resolvedBounds = bounds ?? unitBounds;
    decorShadowRig = syncApartmentDecorShadowRig({
      lightParent: parent,
      decorGroups,
      unitBounds: resolvedBounds,
      previous: decorShadowRig,
    });
    const showBakedFloorShadows =
      useEditorStore.getState().apartmentBakedFloorShadowsEnabled;
    if (!showBakedFloorShadows) {
      bakedFloorShadowMount?.dispose();
      bakedFloorShadowMount = null;
      return;
    }
    const renderer = getEditorMyApartmentDecorShadowRenderer();
    if (!renderer) {
      bakedFloorShadowMount?.dispose();
      bakedFloorShadowMount = null;
      return;
    }
    try {
      bakedFloorShadowMount = syncApartmentDecorBakedFloorShadowOverlay({
        renderer,
        parent,
        decorGroups,
        unitBounds: resolvedBounds,
        floorWorldY:
          EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y +
          APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow.bakedFloorOffsetM,
        previous: bakedFloorShadowMount,
      });
    } catch (err: unknown) {
      bakedFloorShadowMount?.dispose();
      bakedFloorShadowMount = null;
      console.warn("[editor] apartment baked floor shadow failed:", err);
    }
  };
  const resyncPracticalLights = (
    scanRoot: THREE.Object3D,
    _bounds?: ApartmentUnitWorldBounds,
  ): void => {
    if (!useEditorStore.getState().apartmentPracticalLightsEnabled) {
      practicalLights?.dispose();
      practicalLights = null;
      return;
    }
    practicalLights = syncApartmentInteriorPracticalLighting({
      lightParent: root,
      windowScanRoot: scanRoot,
      maxWindowLights: APARTMENT_INTERIOR_VISUAL_PROFILE.maxWindowPracticalLightsPerUnit,
      /** Authoring shell is already one preview unit — skip megablock bounds cull from FP client. */
      unitBounds: undefined,
      decorGroups: editorMyApartmentDecorGroups(selectionGroups),
      previous: practicalLights,
    });
  };
  resyncPracticalLights(windowScanRoot);
  prepareMammothApartmentInteriorContentRoots({ shellRoot: parent, decorRoot: root });
  applyApartmentInteriorFloorReceiveShadowUnder(parent);
  for (const group of editorMyApartmentDecorGroups(selectionGroups)) {
    const modelRelPath = group.userData.mammothApartmentDecorModelRelPath;
    if (typeof modelRelPath === "string") {
      applyApartmentDecorCastShadowFlags(group, modelRelPath);
    }
  }
  resyncDecorShadows(unitBounds);

  const dispose = (): void => {
    teardownApartmentSavedObjectGroupManipulator();
    practicalLights?.dispose();
    decorShadowRig?.dispose();
    bakedFloorShadowMount?.dispose();
    for (const g of Object.values(selectionGroups)) disposeGroupSubtreeGeometry(g);
    parent.remove(root);
    root.clear();
  };

  return {
    root,
    selectionGroups,
    practicalLights,
    decorShadowRig,
    bakedFloorShadowMount,
    resyncPracticalLights,
    resyncDecorShadows,
    dispose,
    mountedWallIds: mountIdSet(doc.wallItems),
    mountedMirrorIds: mountIdSet(doc.mirrorItems),
    mountedDecorIds: mountIdSet(doc.placedItems),
  };
}

