import * as THREE from "three";
import {
  OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
} from "@the-mammoth/schemas";
import {
  mapOwnedApartmentLayoutFractionToWorldX,
  UNIT_SHELL_WALL_THICKNESS_M,
} from "@the-mammoth/world";
import type { OwnedApartmentFractionToPreviewXZ } from "./editorMyApartmentAuthoringShell.js";

/** @see `@the-mammoth/engine` — interior hollow-shell meshes (not authored slabs). */
const MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD = "mammothApartmentInteriorShellMesh";

/** Matches `editorMyApartmentMeshes.ts` — keep in sync. */
const EDITOR_MY_APARTMENT_INTERIOR_SLACK_M = 0.03;
const EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y = 0.02;
const EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M = 0.05;
const EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MAX_M = 8;
const EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M = 0.05;
const EDITOR_MY_APARTMENT_WALL_THICKNESS_MIN_M = 0.05;
const EDITOR_MY_APARTMENT_WALL_THICKNESS_MAX_M = 2;

export type WallSnapShellMeta = OwnedApartmentFractionToPreviewXZ & {
  interiorCeilingInnerY?: number;
};

export type UnitInteriorShellBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  floorY: number;
  ceilY: number | undefined;
};

export const EDITOR_MY_APARTMENT_WALL_SURFACE_SNAP_M = 0.4;
/** Vertical face snap — lintels / headers above doorway openings. */
export const EDITOR_MY_APARTMENT_WALL_VERTICAL_SNAP_M = 0.85;
/** Perpendicular L-corner face snap when vertically eligible (lintel / header reach). */
export const EDITOR_MY_APARTMENT_WALL_L_CORNER_SNAP_M = 1.25;

export type WallScalePinnedSpan = {
  /** Group-local scale axis under drag (`TransformControls.axis`). */
  localAxis: "x" | "y" | "z";
  /** Dominant world axis that local axis maps to after yaw. */
  worldAxis: "x" | "y" | "z";
  /** Which world AABB face stays fixed (opposite the dragged handle). */
  side: "min" | "max";
  /** World-space coordinate of the pinned face at pointer-down. */
  plane: number;
};

/**
 * While {@link TransformControls} scales the wall **group**, `object.scale` is the cumulative factor from
 * pointer-down, not a per-frame delta.
 */
export type ConstrainMyApartmentWallScaleDrag = {
  meshScaleAtGestureStart: THREE.Vector3;
  /** Active TransformControls local scale axis while dragging. */
  activeWorldAxis?: "X" | "Y" | "Z" | null;
  /** Fixed world face for one-sided (anchored) scale — set at pointer-down. */
  pinnedSpan?: WallScalePinnedSpan | null;
};

/** Capture the world face opposite the scale handle (same logic as {@link anchoredScaleGizmo}). */
export function captureWallScalePinnedSpanFromGesture(args: {
  root: THREE.Object3D;
  transformAxis: string | null | undefined;
  pointStart: THREE.Vector3 | null | undefined;
}): WallScalePinnedSpan | null {
  const active = parseTransformControlsWorldScaleAxis(args.transformAxis);
  if (!active) return null;

  args.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(args.root);
  if (box.isEmpty()) return null;

  const localAxis = active.toLowerCase() as "x" | "y" | "z";
  const worldAxis = localScaleAxisToWorldAxis(args.root, localAxis);
  const ps = args.pointStart;
  const handleSign =
    localAxis === "x"
      ? ps && ps.x < 0
        ? -1
        : 1
      : localAxis === "y"
        ? ps && ps.y < 0
          ? -1
          : 1
        : ps && ps.z < 0
          ? -1
          : 1;
  const side: "min" | "max" = handleSign < 0 ? "max" : "min";
  const plane = readWorldPlaneFromBox(box, worldAxis, side);
  return { localAxis, worldAxis, side, plane };
}

function localScaleAxisToWorldAxis(
  root: THREE.Object3D,
  localAxis: "x" | "y" | "z",
): "x" | "y" | "z" {
  if (localAxis === "y") return "y";
  wallSnapRunAxisScratch.set(
    localAxis === "x" ? 1 : 0,
    0,
    localAxis === "z" ? 1 : 0,
  ).applyQuaternion(root.quaternion);
  wallSnapRunAxisScratch.y = 0;
  if (wallSnapRunAxisScratch.lengthSq() < 1e-8) {
    return localAxis === "x" ? "x" : "z";
  }
  return Math.abs(wallSnapRunAxisScratch.x) >= Math.abs(wallSnapRunAxisScratch.z) ? "x" : "z";
}

function readWorldPlaneFromBox(
  box: THREE.Box3,
  worldAxis: "x" | "y" | "z",
  side: "min" | "max",
): number {
  if (worldAxis === "x") return side === "min" ? box.min.x : box.max.x;
  if (worldAxis === "y") return side === "min" ? box.min.y : box.max.y;
  return side === "min" ? box.min.z : box.max.z;
}

function repositionWallKeepingPinnedSpan(
  root: THREE.Object3D,
  pin: WallScalePinnedSpan,
): void {
  root.updateMatrixWorld(true);
  wallSnapBoxScratch.setFromObject(root);
  if (wallSnapBoxScratch.isEmpty()) return;
  const current = readWorldPlaneFromBox(wallSnapBoxScratch, pin.worldAxis, pin.side);
  const delta = pin.plane - current;
  if (Math.abs(delta) > 1e-6) {
    translateRootOnAxis(root, pin.worldAxis, delta);
  }
}

/** Re-apply the pointer-down pinned face after snap/clamp during scale drag. */
export function maintainWallScalePinnedSpan(
  root: THREE.Object3D,
  pin: WallScalePinnedSpan,
): void {
  repositionWallKeepingPinnedSpan(root, pin);
}

function applyPinnedSpanResize(
  root: THREE.Object3D,
  mesh: THREE.Mesh,
  pin: WallScalePinnedSpan,
  freePlane: number,
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined,
): void {
  const minLen =
    pin.localAxis === "y"
      ? EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M
      : pin.localAxis === "z"
        ? EDITOR_MY_APARTMENT_WALL_THICKNESS_MIN_M
        : EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M;
  const len = Math.max(minLen, Math.abs(freePlane - pin.plane));

  if (pin.localAxis === "x") {
    setEffectiveWallLengthX(root, mesh, len, scaleDrag);
  } else if (pin.localAxis === "y") {
    setEffectiveWallHeight(root, mesh, len, scaleDrag);
  } else {
    const mz = Math.max(Math.abs(mesh.scale.z), 1e-9);
    const next = THREE.MathUtils.clamp(
      len,
      EDITOR_MY_APARTMENT_WALL_THICKNESS_MIN_M,
      EDITOR_MY_APARTMENT_WALL_THICKNESS_MAX_M,
    );
    if (scaleDrag) {
      root.scale.z = next / mz;
    } else {
      root.scale.z = 1;
      mesh.scale.z = next;
    }
  }
  repositionWallKeepingPinnedSpan(root, pin);
}

/** Interior partition walls snap to 90° so corners meet cleanly. */
export function snapOwnedApartmentWallYawRad(yRad: number): number {
  const step = Math.PI / 2;
  return Math.round(yRad / step) * step;
}

function authoringPreviewSlabFootprintSx(spans: OwnedApartmentFractionToPreviewXZ): number {
  const slabSx = spans.slabFootprintSx;
  if (typeof slabSx === "number" && slabSx > spans.prefabFootprintSx) {
    return slabSx;
  }
  return spans.prefabFootprintSx;
}

/** Inner drywall faces of the unit shell (authoring-shell local/world space). */
/** Playable interior span along the wall run axis (south–north or west–east). */
export function unitInteriorRunSpanM(meta: WallSnapShellMeta, runAlongX: boolean): number {
  const b = getUnitInteriorShellBounds(meta);
  return runAlongX ? b.maxX - b.minX : b.maxZ - b.minZ;
}

/** Max wall length allowed for this root (unit interior when known, else generic cap). */
export function maxWallRunLengthMForRoot(root: THREE.Object3D): number {
  const meta = readWallSnapShellMetaFromAncestors(root);
  const selfRunsX = wallRunsAlongX(root);
  if (meta && selfRunsX !== null) {
    return Math.max(
      EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M,
      unitInteriorRunSpanM(meta, selfRunsX),
    );
  }
  return EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MAX_M;
}

export function getUnitInteriorShellBounds(meta: WallSnapShellMeta): UnitInteriorShellBounds {
  const wt = UNIT_SHELL_WALL_THICKNESS_M;
  const e = EDITOR_MY_APARTMENT_INTERIOR_SLACK_M;
  const sx = authoringPreviewSlabFootprintSx(meta);
  const sz = meta.prefabFootprintSz;
  const floorY = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y;
  const ceilRaw = meta.interiorCeilingInnerY;
  const ceilY =
    typeof ceilRaw === "number" &&
    Number.isFinite(ceilRaw) &&
    ceilRaw > floorY + EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M
      ? ceilRaw - e
      : undefined;
  return {
    minX: wt + e,
    maxX: sx - wt - e,
    minZ: wt + e,
    maxZ: sz - wt - e,
    floorY,
    ceilY,
  };
}

export function previewRepresentableXZBounds(spans: OwnedApartmentFractionToPreviewXZ): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const shell = getUnitInteriorShellBounds(spans);
  const wt = UNIT_SHELL_WALL_THICKNESS_M;
  const e = EDITOR_MY_APARTMENT_INTERIOR_SLACK_M;
  const sx = authoringPreviewSlabFootprintSx(spans);
  const sz = spans.prefabFootprintSz;
  const ixPl0 = wt + e;
  const ixPl1 = sx - wt - e;
  const izPl0 = wt + e;
  const izPl1 = sz - wt - e;

  const boundMinX = spans.strictMinX;
  const boundMaxX = spans.strictMinX + spans.spanX;
  const lxMinR =
    mapOwnedApartmentLayoutFractionToWorldX(
      boundMinX,
      boundMaxX,
      spans.unitId,
      OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
    ) - spans.prefabOriginX;
  const lxMaxR =
    mapOwnedApartmentLayoutFractionToWorldX(
      boundMinX,
      boundMaxX,
      spans.unitId,
      OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
    ) - spans.prefabOriginX;
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
    return { minX: shell.minX, maxX: shell.maxX, minZ: shell.minZ, maxZ: shell.maxZ };
  }
  return {
    minX: Math.max(shell.minX, ix0),
    maxX: Math.min(shell.maxX, ix1),
    minZ: Math.max(shell.minZ, iz0),
    maxZ: Math.min(shell.maxZ, iz1),
  };
}

const wallSnapBoxScratch = new THREE.Box3();
const wallSnapRunAxisScratch = new THREE.Vector3();

function collectNeighborWallRoots(
  root: THREE.Object3D,
  excludeWallId: string | undefined,
): THREE.Object3D[] {
  const parent = root.parent;
  if (!parent) return [];
  const out: THREE.Object3D[] = [];
  for (const child of parent.children) {
    if (child === root) continue;
    const id = child.userData.mammothEditorMyApartmentWallId;
    if (typeof id === "string" && id !== excludeWallId) {
      out.push(child);
    }
  }
  return out;
}

function wallRunAxisWorld(root: THREE.Object3D): THREE.Vector3 | null {
  wallSnapRunAxisScratch.set(1, 0, 0).applyQuaternion(root.quaternion);
  wallSnapRunAxisScratch.y = 0;
  if (wallSnapRunAxisScratch.lengthSq() < 1e-8) return null;
  return wallSnapRunAxisScratch.normalize();
}

function runsMostlyAlongWorldX(runAxis: THREE.Vector3): boolean {
  return Math.abs(runAxis.x) >= Math.abs(runAxis.z);
}

function setEffectiveWallLengthX(
  root: THREE.Object3D,
  mesh: THREE.Mesh,
  lengthM: number,
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined,
): void {
  const len = Math.max(EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M, lengthM);
  const mx = Math.max(Math.abs(mesh.scale.x), 1e-9);
  if (scaleDrag) {
    root.scale.x = len / mx;
  } else {
    root.scale.x = 1;
    mesh.scale.x = len;
  }
}

function setEffectiveWallHeight(
  root: THREE.Object3D,
  mesh: THREE.Mesh,
  heightM: number,
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined,
): void {
  const h = Math.max(EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M, heightM);
  const my = Math.max(Math.abs(mesh.scale.y), 1e-9);
  if (scaleDrag) {
    root.scale.y = h / my;
  } else {
    root.scale.y = 1;
    mesh.scale.y = h;
    mesh.position.y = h / 2;
  }
}

function snapWorldSpanAlongX(
  root: THREE.Object3D,
  mesh: THREE.Mesh,
  minX: number,
  maxX: number,
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined,
): void {
  if (maxX - minX < EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M - 1e-6) return;
  const pin = scaleDrag?.pinnedSpan;
  if (pin?.worldAxis === "x") {
    const freePlane = pin.side === "min" ? maxX : minX;
    applyPinnedSpanResize(root, mesh, pin, freePlane, scaleDrag);
    return;
  }
  root.position.x = (minX + maxX) * 0.5;
  setEffectiveWallLengthX(root, mesh, maxX - minX, scaleDrag);
}

function snapWorldSpanAlongZ(
  root: THREE.Object3D,
  mesh: THREE.Mesh,
  minZ: number,
  maxZ: number,
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined,
): void {
  if (maxZ - minZ < EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M - 1e-6) return;
  const pin = scaleDrag?.pinnedSpan;
  if (pin?.worldAxis === "z") {
    const freePlane = pin.side === "min" ? maxZ : minZ;
    applyPinnedSpanResize(root, mesh, pin, freePlane, scaleDrag);
    return;
  }
  /** Wall length lives in mesh local X (maps to world Z when yaw ≈ ±90°). */
  root.position.z = (minZ + maxZ) * 0.5;
  setEffectiveWallLengthX(root, mesh, maxZ - minZ, scaleDrag);
}

function clampWorldSpanAlongX(
  root: THREE.Object3D,
  mesh: THREE.Mesh,
  bounds: UnitInteriorShellBounds,
  box: THREE.Box3,
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined,
): boolean {
  let minX = box.min.x;
  let maxX = box.max.x;
  let changed = false;

  if (minX < bounds.minX) {
    root.position.x += bounds.minX - minX;
    changed = true;
    minX = bounds.minX;
  }
  if (maxX > bounds.maxX) {
    root.position.x -= maxX - bounds.maxX;
    changed = true;
    maxX = bounds.maxX;
  }

  root.updateMatrixWorld(true);
  wallSnapBoxScratch.setFromObject(root);
  minX = wallSnapBoxScratch.min.x;
  maxX = wallSnapBoxScratch.max.x;

  const span = maxX - minX;
  const maxSpan = bounds.maxX - bounds.minX;
  if (span > maxSpan + 1e-4) {
    snapWorldSpanAlongX(root, mesh, bounds.minX, bounds.maxX, scaleDrag);
    return true;
  }

  if (minX < bounds.minX - 1e-4 || maxX > bounds.maxX + 1e-4) {
    const clampedMin = THREE.MathUtils.clamp(
      minX,
      bounds.minX,
      bounds.maxX - EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M,
    );
    const clampedMax = THREE.MathUtils.clamp(
      maxX,
      clampedMin + EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M,
      bounds.maxX,
    );
    snapWorldSpanAlongX(root, mesh, clampedMin, clampedMax, scaleDrag);
    return true;
  }

  return changed;
}

function clampWorldSpanAlongZ(
  root: THREE.Object3D,
  mesh: THREE.Mesh,
  bounds: UnitInteriorShellBounds,
  box: THREE.Box3,
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined,
): boolean {
  let minZ = box.min.z;
  let maxZ = box.max.z;
  let changed = false;

  if (minZ < bounds.minZ) {
    root.position.z += bounds.minZ - minZ;
    changed = true;
    minZ = bounds.minZ;
  }
  if (maxZ > bounds.maxZ) {
    root.position.z -= maxZ - bounds.maxZ;
    changed = true;
    maxZ = bounds.maxZ;
  }

  root.updateMatrixWorld(true);
  wallSnapBoxScratch.setFromObject(root);
  minZ = wallSnapBoxScratch.min.z;
  maxZ = wallSnapBoxScratch.max.z;

  const span = maxZ - minZ;
  const maxSpan = bounds.maxZ - bounds.minZ;
  if (span > maxSpan + 1e-4) {
    snapWorldSpanAlongZ(root, mesh, bounds.minZ, bounds.maxZ, scaleDrag);
    return true;
  }

  if (minZ < bounds.minZ - 1e-4 || maxZ > bounds.maxZ + 1e-4) {
    const clampedMin = THREE.MathUtils.clamp(
      minZ,
      bounds.minZ,
      bounds.maxZ - EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M,
    );
    const clampedMax = THREE.MathUtils.clamp(
      maxZ,
      clampedMin + EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M,
      bounds.maxZ,
    );
    snapWorldSpanAlongZ(root, mesh, clampedMin, clampedMax, scaleDrag);
    return true;
  }

  return changed;
}

function clampVerticalSpan(
  root: THREE.Object3D,
  mesh: THREE.Mesh,
  bounds: UnitInteriorShellBounds,
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined,
): boolean {
  root.updateMatrixWorld(true);
  wallSnapBoxScratch.setFromObject(root);
  if (wallSnapBoxScratch.isEmpty()) return false;

  let changed = false;

  if (wallSnapBoxScratch.min.y < bounds.floorY - 1e-4) {
    root.position.y += bounds.floorY - wallSnapBoxScratch.min.y;
    changed = true;
  }

  if (bounds.ceilY !== undefined) {
    root.updateMatrixWorld(true);
    wallSnapBoxScratch.setFromObject(root);
    if (wallSnapBoxScratch.max.y > bounds.ceilY + 1e-4) {
      const h = wallSnapBoxScratch.max.y - wallSnapBoxScratch.min.y;
      const maxAllowedH = bounds.ceilY - bounds.floorY;
      const heightScaleDrag =
        scaleDrag?.activeWorldAxis === "Y" || scaleDrag?.pinnedSpan?.localAxis === "y";

      if (heightScaleDrag) {
        const bottom = wallSnapBoxScratch.min.y;
        const maxAllowedH = bounds.ceilY - Math.max(bottom, bounds.floorY);
        root.updateMatrixWorld(true);
        wallSnapBoxScratch.setFromObject(root);
        const my = Math.max(Math.abs(mesh.scale.y), 1e-9);
        const effY =
          scaleDrag && scaleDrag.activeWorldAxis === "Y"
            ? my * Math.abs(root.scale.y)
            : wallSnapBoxScratch.max.y - wallSnapBoxScratch.min.y;
        const nextH = THREE.MathUtils.clamp(
          effY,
          EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M,
          maxAllowedH,
        );
        if (nextH >= EDITOR_MY_APARTMENT_WALL_SIZE_Y_MIN_M - 1e-4) {
          setEffectiveWallHeight(root, mesh, nextH, scaleDrag);
        } else {
          root.position.y -= wallSnapBoxScratch.max.y - bounds.ceilY;
        }
      } else if (!scaleDrag && h > maxAllowedH + 1e-4) {
        /** Placed taller than the room — shrink on conform, not during translate clamp. */
        setEffectiveWallHeight(root, mesh, maxAllowedH, scaleDrag);
      } else {
        /** Translate / length scale — stop at ceiling without squashing height. */
        root.position.y -= wallSnapBoxScratch.max.y - bounds.ceilY;
      }
      changed = true;
    }
  }

  return changed;
}

function clampPinnedWallSpanInShell(
  root: THREE.Group,
  mesh: THREE.Mesh,
  bounds: UnitInteriorShellBounds,
  pin: WallScalePinnedSpan,
  scaleDrag: ConstrainMyApartmentWallScaleDrag,
): boolean {
  root.updateMatrixWorld(true);
  wallSnapBoxScratch.setFromObject(root);
  if (wallSnapBoxScratch.isEmpty()) return false;

  const freeSide: "min" | "max" = pin.side === "min" ? "max" : "min";
  const freePlane = readWorldPlaneFromBox(wallSnapBoxScratch, pin.worldAxis, freeSide);

  if (pin.worldAxis === "x") {
    const lo = bounds.minX;
    const hi = bounds.maxX;
    const clampedFree = THREE.MathUtils.clamp(freePlane, lo, hi);
    if (Math.abs(clampedFree - freePlane) > 1e-4) {
      applyPinnedSpanResize(root, mesh, pin, clampedFree, scaleDrag);
      return true;
    }
    return false;
  }

  if (pin.worldAxis === "z") {
    const lo = bounds.minZ;
    const hi = bounds.maxZ;
    const clampedFree = THREE.MathUtils.clamp(freePlane, lo, hi);
    if (Math.abs(clampedFree - freePlane) > 1e-4) {
      applyPinnedSpanResize(root, mesh, pin, clampedFree, scaleDrag);
      return true;
    }
    return false;
  }

  if (pin.worldAxis === "y" && bounds.ceilY !== undefined) {
    const top = readWorldPlaneFromBox(wallSnapBoxScratch, "y", "max");
    if (top > bounds.ceilY + 1e-4) {
      applyPinnedSpanResize(root, mesh, pin, bounds.ceilY, scaleDrag);
      return true;
    }
  }

  return false;
}

/** Hard containment — wall AABB must stay inside unit floor/ceiling/plaster shell. */
export function clampWallAabbToUnitShellInterior(
  root: THREE.Group,
  mesh: THREE.Mesh,
  meta: WallSnapShellMeta,
  scaleDrag?: ConstrainMyApartmentWallScaleDrag,
): void {
  const bounds = getUnitInteriorShellBounds(meta);
  const runAxis = wallRunAxisWorld(root);
  const runAlongX = runAxis ? runsMostlyAlongWorldX(runAxis) : true;
  const active = scaleDrag?.activeWorldAxis;
  const pin = scaleDrag?.pinnedSpan;

  for (let pass = 0; pass < 12; pass++) {
    let changed = clampVerticalSpan(root, mesh, bounds, scaleDrag);

    root.updateMatrixWorld(true);
    wallSnapBoxScratch.setFromObject(root);
    if (wallSnapBoxScratch.isEmpty()) return;

    if (pin) {
      changed = clampPinnedWallSpanInShell(root, mesh, bounds, pin, scaleDrag) || changed;
      root.updateMatrixWorld(true);
      wallSnapBoxScratch.setFromObject(root);
      if (runAlongX && pin.localAxis === "x") {
        if (wallSnapBoxScratch.min.z < bounds.minZ) {
          root.position.z += bounds.minZ - wallSnapBoxScratch.min.z;
          changed = true;
        }
        if (wallSnapBoxScratch.max.z > bounds.maxZ) {
          root.position.z -= wallSnapBoxScratch.max.z - bounds.maxZ;
          changed = true;
        }
      } else if (!runAlongX && pin.localAxis === "x") {
        if (wallSnapBoxScratch.min.x < bounds.minX) {
          root.position.x += bounds.minX - wallSnapBoxScratch.min.x;
          changed = true;
        }
        if (wallSnapBoxScratch.max.x > bounds.maxX) {
          root.position.x -= wallSnapBoxScratch.max.x - bounds.maxX;
          changed = true;
        }
      }
      if (!changed) break;
      continue;
    }

    if (runAlongX) {
      if (active === "X") {
        let minX = wallSnapBoxScratch.min.x;
        let maxX = wallSnapBoxScratch.max.x;
        if (minX < bounds.minX) {
          maxX = Math.min(maxX, bounds.maxX);
          minX = bounds.minX;
          snapWorldSpanAlongX(root, mesh, minX, maxX, scaleDrag);
          changed = true;
        } else if (maxX > bounds.maxX) {
          minX = Math.max(minX, bounds.minX);
          maxX = bounds.maxX;
          snapWorldSpanAlongX(root, mesh, minX, maxX, scaleDrag);
          changed = true;
        }
      } else {
        changed = clampWorldSpanAlongX(root, mesh, bounds, wallSnapBoxScratch, scaleDrag) || changed;
      }
      root.updateMatrixWorld(true);
      wallSnapBoxScratch.setFromObject(root);
      if (wallSnapBoxScratch.min.z < bounds.minZ) {
        root.position.z += bounds.minZ - wallSnapBoxScratch.min.z;
        changed = true;
      }
      if (wallSnapBoxScratch.max.z > bounds.maxZ) {
        root.position.z -= wallSnapBoxScratch.max.z - bounds.maxZ;
        changed = true;
      }
    } else {
      if (active === "Z") {
        let minZ = wallSnapBoxScratch.min.z;
        let maxZ = wallSnapBoxScratch.max.z;
        if (minZ < bounds.minZ) {
          maxZ = Math.min(maxZ, bounds.maxZ);
          minZ = bounds.minZ;
          snapWorldSpanAlongZ(root, mesh, minZ, maxZ, scaleDrag);
          changed = true;
        } else if (maxZ > bounds.maxZ) {
          minZ = Math.max(minZ, bounds.minZ);
          maxZ = bounds.maxZ;
          snapWorldSpanAlongZ(root, mesh, minZ, maxZ, scaleDrag);
          changed = true;
        }
      } else {
        changed = clampWorldSpanAlongZ(root, mesh, bounds, wallSnapBoxScratch, scaleDrag) || changed;
      }
      root.updateMatrixWorld(true);
      wallSnapBoxScratch.setFromObject(root);
      if (wallSnapBoxScratch.min.x < bounds.minX) {
        root.position.x += bounds.minX - wallSnapBoxScratch.min.x;
        changed = true;
      }
      if (wallSnapBoxScratch.max.x > bounds.maxX) {
        root.position.x -= wallSnapBoxScratch.max.x - bounds.maxX;
        changed = true;
      }
    }

    if (!changed) break;
  }
}

function wallRunsAlongX(root: THREE.Object3D): boolean | null {
  const run = wallRunAxisWorld(root);
  if (!run) return null;
  return runsMostlyAlongWorldX(run);
}

function boxesWithinSnap(a: THREE.Box3, b: THREE.Box3, snapM: number): boolean {
  const dx =
    a.max.x < b.min.x ? b.min.x - a.max.x : b.max.x < a.min.x ? a.min.x - b.max.x : 0;
  const dz =
    a.max.z < b.min.z ? b.min.z - a.max.z : b.max.z < a.min.z ? a.min.z - b.max.z : 0;
  return dx <= snapM && dz <= snapM;
}

function yGapBetweenBoxes(a: THREE.Box3, b: THREE.Box3): number {
  if (a.max.y < b.min.y) return b.min.y - a.max.y;
  if (b.max.y < a.min.y) return a.min.y - b.max.y;
  return 0;
}

function wallYRangesOverlap(a: THREE.Box3, b: THREE.Box3): boolean {
  return a.min.y < b.max.y - 1e-4 && a.max.y > b.min.y + 1e-4;
}

/** Plan-close and vertically overlapping or within lintel/header reach. */
function wallNeighborSnapEligible(a: THREE.Box3, b: THREE.Box3): boolean {
  if (!boxesWithinSnap(a, b, EDITOR_MY_APARTMENT_WALL_SURFACE_SNAP_M)) return false;
  if (wallYRangesOverlap(a, b)) return true;
  return yGapBetweenBoxes(a, b) <= EDITOR_MY_APARTMENT_WALL_VERTICAL_SNAP_M;
}

function snapVerticalWallPair(args: {
  root: THREE.Object3D;
  mesh: THREE.Mesh;
  neighbor: THREE.Object3D;
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined;
}): boolean {
  const { root, scaleDrag } = args;
  if (scaleDrag?.activeWorldAxis === "Y") return false;

  root.updateMatrixWorld(true);
  args.neighbor.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const nb = new THREE.Box3().setFromObject(args.neighbor);
  if (box.isEmpty() || nb.isEmpty()) return false;
  if (!wallNeighborSnapEligible(box, nb)) return false;

  const yPairs: { selfFace: number; plane: number }[] = [
    { selfFace: box.max.y, plane: nb.min.y },
    { selfFace: box.min.y, plane: nb.max.y },
  ];

  let best: { selfFace: number; plane: number; dist: number } | null = null;
  for (const pair of yPairs) {
    const dist = Math.abs(pair.selfFace - pair.plane);
    if (
      dist <= EDITOR_MY_APARTMENT_WALL_VERTICAL_SNAP_M &&
      (!best || dist < best.dist)
    ) {
      best = { ...pair, dist };
    }
  }
  if (!best) return false;

  translateRootOnAxis(root, "y", best.plane - best.selfFace);
  return true;
}

function translateRootOnAxis(
  root: THREE.Object3D,
  axis: "x" | "y" | "z",
  delta: number,
): void {
  if (axis === "x") root.position.x += delta;
  else if (axis === "y") root.position.y += delta;
  else root.position.z += delta;
}

function applyRunEndSnap(args: {
  root: THREE.Object3D;
  mesh: THREE.Mesh;
  box: THREE.Box3;
  runAxis: "x" | "z";
  side: "min" | "max";
  plane: number;
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined;
  resizeLength: boolean;
  runAlongX: boolean;
  snapM?: number;
}): boolean {
  const { root, mesh, box, runAxis, side, plane, scaleDrag, resizeLength, runAlongX } = args;
  const snapM = args.snapM ?? EDITOR_MY_APARTMENT_WALL_SURFACE_SNAP_M;
  const face =
    runAxis === "x" ? (side === "min" ? box.min.x : box.max.x) : side === "min" ? box.min.z : box.max.z;
  const delta = plane - face;
  if (Math.abs(delta) > snapM) return false;

  const pin = scaleDrag?.pinnedSpan;
  const canResize =
    resizeLength &&
    ((runAlongX && runAxis === "x") || (!runAlongX && runAxis === "z"));

  if (canResize && pin?.localAxis === "x" && runAxis === pin.worldAxis) {
    if (side === pin.side) return false;
    applyPinnedSpanResize(root, mesh, pin, plane, scaleDrag);
    return true;
  }

  if (canResize) {
    if (runAxis === "x") {
      const minX = side === "min" ? plane : box.min.x;
      const maxX = side === "max" ? plane : box.max.x;
      snapWorldSpanAlongX(root, mesh, minX, maxX, scaleDrag);
    } else {
      const minZ = side === "min" ? plane : box.min.z;
      const maxZ = side === "max" ? plane : box.max.z;
      snapWorldSpanAlongZ(root, mesh, minZ, maxZ, scaleDrag);
    }
    return true;
  }

  if (pin && runAxis === pin.worldAxis && side === pin.side) return false;

  translateRootOnAxis(root, runAxis, delta);
  return true;
}

function maybeAutoYawPerpendicularForCorner(
  root: THREE.Object3D,
  neighbor: THREE.Object3D,
  box: THREE.Box3,
  nb: THREE.Box3,
): boolean {
  const selfRunsX = wallRunsAlongX(root);
  const nRunsX = wallRunsAlongX(neighbor);
  if (selfRunsX === null || nRunsX === null || selfRunsX !== nRunsX) return false;

  const dx =
    box.max.x < nb.min.x ? nb.min.x - box.max.x : nb.max.x < box.min.x ? box.min.x - nb.max.x : 0;
  const dz =
    box.max.z < nb.min.z ? nb.min.z - box.max.z : nb.max.z < box.min.z ? box.min.z - nb.max.z : 0;
  if (!wallNeighborSnapEligible(box, nb)) return false;
  /** L-corners often overlap on one axis while offset on the other — allow up to ~1.25 m plan gap. */
  if (Math.hypot(dx, dz) > 1.25) return false;

  const runAxis: "x" | "z" = selfRunsX ? "x" : "z";
  const thickAxis: "x" | "z" = selfRunsX ? "z" : "x";
  const selfMin = runAxis === "x" ? box.min.x : box.min.z;
  const selfMax = runAxis === "x" ? box.max.x : box.max.z;
  const nMin = runAxis === "x" ? nb.min.x : nb.min.z;
  const nMax = runAxis === "x" ? nb.max.x : nb.max.z;
  const runEndDist = Math.min(Math.abs(selfMax - nMin), Math.abs(selfMin - nMax));
  const selfThick = (thickAxis === "z" ? box.max.z - box.min.z : box.max.x - box.min.x) * 0.5;
  const nThick = (thickAxis === "z" ? nb.max.z - nb.min.z : nb.max.x - nb.min.x) * 0.5;
  const selfCenterThick =
    thickAxis === "z" ? (box.min.z + box.max.z) * 0.5 : (box.min.x + box.max.x) * 0.5;
  const nCenterThick =
    thickAxis === "z" ? (nb.min.z + nb.max.z) * 0.5 : (nb.min.x + nb.max.x) * 0.5;
  const thickDelta = Math.abs(selfCenterThick - nCenterThick);

  /** Colinear end-to-end extension — leave yaw alone and let parallel snap handle it. */
  if (
    runEndDist <= EDITOR_MY_APARTMENT_WALL_SURFACE_SNAP_M &&
    thickDelta <= Math.max(selfThick, nThick) + 0.06
  ) {
    return false;
  }

  /** L-corner intent: offset on thickness axis, not a flush end-to-end run. */
  if (thickDelta < 0.15) return false;

  const nYaw = snapOwnedApartmentWallYawRad(
    new THREE.Euler().setFromQuaternion(neighbor.quaternion, "YXZ").y,
  );
  const targetYaw = snapOwnedApartmentWallYawRad(nYaw + Math.PI / 2);
  const selfYaw = snapOwnedApartmentWallYawRad(
    new THREE.Euler().setFromQuaternion(root.quaternion, "YXZ").y,
  );
  if (Math.abs(selfYaw - targetYaw) < 0.05) return false;

  root.rotation.order = "YXZ";
  root.rotation.set(0, targetYaw, 0, "YXZ");
  root.updateMatrixWorld(true);
  return true;
}

function snapParallelWallPair(args: {
  root: THREE.Object3D;
  mesh: THREE.Mesh;
  neighbor: THREE.Object3D;
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined;
  resizeLength: boolean;
}): boolean {
  const { root, mesh, neighbor, scaleDrag, resizeLength } = args;
  root.updateMatrixWorld(true);
  neighbor.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const nb = new THREE.Box3().setFromObject(neighbor);
  if (box.isEmpty() || nb.isEmpty()) return false;
  if (!wallNeighborSnapEligible(box, nb)) return false;

  let changed = false;
  const runAlongX = wallRunsAlongX(root) === true;
  const runAxis: "x" | "z" = runAlongX ? "x" : "z";

  const runPlanes: { side: "min" | "max"; plane: number }[] = [
    { side: "min", plane: runAxis === "x" ? nb.min.x : nb.min.z },
    { side: "max", plane: runAxis === "x" ? nb.max.x : nb.max.z },
  ];
  const selfMin = runAxis === "x" ? box.min.x : box.min.z;
  const selfMax = runAxis === "x" ? box.max.x : box.max.z;

  let best: { side: "min" | "max"; plane: number; dist: number } | null = null;
  for (const rp of runPlanes) {
    const face = rp.side === "min" ? selfMin : selfMax;
    const dist = Math.abs(face - rp.plane);
    if (dist <= EDITOR_MY_APARTMENT_WALL_SURFACE_SNAP_M && (!best || dist < best.dist)) {
      best = { side: rp.side, plane: rp.plane, dist };
    }
  }
  if (best) {
    changed =
      applyRunEndSnap({
        root,
        mesh,
        box,
        runAxis,
        side: best.side,
        plane: best.plane,
        scaleDrag,
        resizeLength,
        runAlongX,
      }) || changed;
  }

  root.updateMatrixWorld(true);
  wallSnapBoxScratch.setFromObject(root);
  const thickAxis: "x" | "z" = runAlongX ? "z" : "x";
  if (scaleDrag?.pinnedSpan?.localAxis === "x") {
    return changed;
  }
  const selfCenter = thickAxis === "z" ? (wallSnapBoxScratch.min.z + wallSnapBoxScratch.max.z) * 0.5 : (wallSnapBoxScratch.min.x + wallSnapBoxScratch.max.x) * 0.5;
  const nCenter = thickAxis === "z" ? (nb.min.z + nb.max.z) * 0.5 : (nb.min.x + nb.max.x) * 0.5;
  const centerDelta = nCenter - selfCenter;
  const thickDelta = Math.abs(centerDelta);
  const runEndDist = Math.min(
    Math.abs((runAxis === "x" ? box.max.x : box.max.z) - (runAxis === "x" ? nb.min.x : nb.min.z)),
    Math.abs((runAxis === "x" ? box.min.x : box.min.z) - (runAxis === "x" ? nb.max.x : nb.max.z)),
  );
  const lCornerIntent =
    thickDelta >= 0.2 &&
    runEndDist > EDITOR_MY_APARTMENT_WALL_SURFACE_SNAP_M &&
    runEndDist <= 1.25;
  if (
    !lCornerIntent &&
    Math.abs(centerDelta) <= EDITOR_MY_APARTMENT_WALL_SURFACE_SNAP_M
  ) {
    translateRootOnAxis(root, thickAxis, centerDelta);
    changed = true;
  }

  return changed;
}

function snapPerpendicularWallPair(args: {
  root: THREE.Object3D;
  mesh: THREE.Mesh;
  neighbor: THREE.Object3D;
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined;
  resizeLength: boolean;
}): boolean {
  const { root, mesh, neighbor, scaleDrag, resizeLength } = args;
  const selfRunsX = wallRunsAlongX(root);
  if (selfRunsX === null) return false;

  root.updateMatrixWorld(true);
  neighbor.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const nb = new THREE.Box3().setFromObject(neighbor);
  if (box.isEmpty() || nb.isEmpty()) return false;
  if (!wallNeighborSnapEligible(box, nb)) return false;

  /** L-corners often overlap on one plan axis while offset on the other — wider snap than flush end-to-end. */
  const planSnapM = EDITOR_MY_APARTMENT_WALL_L_CORNER_SNAP_M;

  let changed = false;

  /** Self run ends (length axis) snap to neighbor broad faces (thickness axis). */
  const runAxis: "x" | "z" = selfRunsX ? "x" : "z";
  const broadAxis: "x" | "z" = selfRunsX ? "x" : "z";
  const runEnds: { side: "min" | "max"; face: number }[] = [
    { side: "min", face: runAxis === "x" ? box.min.x : box.min.z },
    { side: "max", face: runAxis === "x" ? box.max.x : box.max.z },
  ];

  let bestRun: { side: "min" | "max"; plane: number; dist: number } | null = null;
  for (const end of runEnds) {
    /** L-corner exterior pairing: max run end → min broad face, min run end → max broad face. */
    const plane =
      end.side === "max"
        ? broadAxis === "x"
          ? nb.min.x
          : nb.min.z
        : broadAxis === "x"
          ? nb.max.x
          : nb.max.z;
    const dist = Math.abs(end.face - plane);
    if (dist <= planSnapM && (!bestRun || dist < bestRun.dist)) {
      bestRun = { side: end.side, plane, dist };
    }
  }
  if (bestRun) {
    changed =
      applyRunEndSnap({
        root,
        mesh,
        box,
        runAxis,
        side: bestRun.side,
        plane: bestRun.plane,
        scaleDrag,
        resizeLength,
        runAlongX: selfRunsX,
        snapM: planSnapM,
      }) || changed;
  }

  root.updateMatrixWorld(true);
  wallSnapBoxScratch.setFromObject(root);

  /** Self thickness edges snap to neighbor run ends — completes the L-corner. */
  const thickAxis: "x" | "z" = selfRunsX ? "z" : "x";
  const nRunAxis: "x" | "z" = selfRunsX ? "z" : "x";

  let bestThick: { face: number; plane: number; dist: number } | null = null;
  const minThickFace =
    thickAxis === "z" ? wallSnapBoxScratch.min.z : wallSnapBoxScratch.min.x;
  const maxThickFace =
    thickAxis === "z" ? wallSnapBoxScratch.max.z : wallSnapBoxScratch.max.x;
  const selfThickCenter = (minThickFace + maxThickFace) * 0.5;
  for (const runSide of ["min", "max"] as const) {
    const plane =
      nRunAxis === "z"
        ? runSide === "min"
          ? nb.min.z
          : nb.max.z
        : runSide === "min"
          ? nb.min.x
          : nb.max.x;
    const minDist = Math.abs(minThickFace - plane);
    const maxDist = Math.abs(maxThickFace - plane);
    let face: number;
    if (minDist <= 1e-3) face = minThickFace;
    else if (maxDist <= 1e-3) face = maxThickFace;
    else face = selfThickCenter <= plane ? minThickFace : maxThickFace;
    const dist = Math.abs(face - plane);
    if (dist <= 1e-3) continue;
    if (dist <= planSnapM && (!bestThick || dist < bestThick.dist)) {
      bestThick = { face, plane, dist };
    }
  }
  if (bestThick) {
    translateRootOnAxis(root, thickAxis, bestThick.plane - bestThick.face);
    changed = true;
  }

  return changed;
}

/** Plan overlap on wall thickness — allows bracketing across a wide run-axis gap (room opening). */
function wallNeighborBracketEligible(
  self: THREE.Box3,
  nb: THREE.Box3,
  runAlongX: boolean,
): boolean {
  if (!wallYRangesOverlap(self, nb) && yGapBetweenBoxes(self, nb) > EDITOR_MY_APARTMENT_WALL_VERTICAL_SNAP_M) {
    return false;
  }
  if (runAlongX) {
    return self.min.z < nb.max.z - 1e-4 && self.max.z > nb.min.z + 1e-4;
  }
  return self.min.x < nb.max.x - 1e-4 && self.max.x > nb.min.x + 1e-4;
}

function bracketPlanesFromNeighborPair(
  self: THREE.Box3,
  nb: THREE.Box3,
  runAxis: "x" | "z",
  selfRunsX: boolean,
  nRunsX: boolean,
): { minPlane?: number; maxPlane?: number } {
  const center =
    runAxis === "x" ? (self.min.x + self.max.x) * 0.5 : (self.min.z + self.max.z) * 0.5;
  const nCenter =
    runAxis === "x" ? (nb.min.x + nb.max.x) * 0.5 : (nb.min.z + nb.max.z) * 0.5;

  const read = (side: "min" | "max"): number =>
    runAxis === "x"
      ? side === "min"
        ? nb.min.x
        : nb.max.x
      : side === "min"
        ? nb.min.z
        : nb.max.z;

  if (selfRunsX === nRunsX) {
    if (nCenter < center - 1e-3) {
      return { minPlane: read("max") };
    }
    if (nCenter > center + 1e-3) {
      return { maxPlane: read("min") };
    }
    /** Same run-axis band (beside / coplanar) — not a run-end bracket for this wall. */
    return {};
  }

  if (nCenter < center - 1e-3) {
    return { minPlane: read("max") };
  }
  if (nCenter > center + 1e-3) {
    return { maxPlane: read("min") };
  }
  return {};
}

function readWallSnapShellMetaFromAncestors(
  o: THREE.Object3D,
): WallSnapShellMeta | null {
  let cur: THREE.Object3D | null = o.parent;
  while (cur) {
    const sx = cur.userData.editorMyApartmentSlabSx as number | undefined;
    const sz = cur.userData.editorMyApartmentSlabSz as number | undefined;
    if (typeof sx !== "number" || typeof sz !== "number" || sx <= 0 || sz <= 0) {
      cur = cur.parent;
      continue;
    }
    const strictMinX = cur.userData.editorMyApartmentStrictMinX as number | undefined;
    const strictMinZ = cur.userData.editorMyApartmentStrictMinZ as number | undefined;
    const spanX = cur.userData.editorMyApartmentStrictSpanX as number | undefined;
    const spanZ = cur.userData.editorMyApartmentStrictSpanZ as number | undefined;
    const prefabOriginX = cur.userData.editorMyApartmentPrefabOriginX as number | undefined;
    const prefabOriginZ = cur.userData.editorMyApartmentPrefabOriginZ as number | undefined;
    const ceilingYRaw = cur.userData.editorMyApartmentInteriorCeilingInnerY as number | undefined;
    const interiorCeilingInnerY =
      typeof ceilingYRaw === "number" && Number.isFinite(ceilingYRaw) && ceilingYRaw > 0
        ? ceilingYRaw
        : undefined;
    const unitId = (cur.userData.editorMyApartmentUnitId as string | undefined) ?? "";
    const haveStrict =
      typeof strictMinX === "number" &&
      typeof strictMinZ === "number" &&
      typeof spanX === "number" &&
      typeof spanZ === "number" &&
      typeof prefabOriginX === "number" &&
      typeof prefabOriginZ === "number" &&
      Number.isFinite(strictMinX) &&
      Number.isFinite(strictMinZ) &&
      spanX > 0 &&
      spanZ > 0;
    if (haveStrict) {
      return {
        unitId,
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
      unitId,
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
  return null;
}

function findAuthoringShellRoot(o: THREE.Object3D): THREE.Object3D | null {
  let cur: THREE.Object3D | null = o;
  while (cur) {
    if (cur.name === "editor_owned_apartment_authoring_shell") return cur;
    cur = cur.parent;
  }
  return null;
}

/** How far past the current run ends we search for bracket faces (opening fill, not whole-unit jump). */
function bracketReachAlongRunM(runSpanM: number): number {
  const span = Math.max(runSpanM, EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M);
  return Math.min(
    EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MAX_M,
    span + Math.max(span * 2, EDITOR_MY_APARTMENT_WALL_L_CORNER_SNAP_M * 2),
  );
}

function acceptMinRunBracketPlane(
  plane: number,
  self: THREE.Box3,
  runAxis: "x" | "z",
  center: number,
  reachM: number,
): boolean {
  if (plane >= center - 1e-3) return false;
  const selfMin = runAxis === "x" ? self.min.x : self.min.z;
  return selfMin - plane <= reachM + 1e-4;
}

function acceptMaxRunBracketPlane(
  plane: number,
  self: THREE.Box3,
  runAxis: "x" | "z",
  center: number,
  reachM: number,
): boolean {
  if (plane <= center + 1e-3) return false;
  const selfMax = runAxis === "x" ? self.max.x : self.max.z;
  return plane - selfMax <= reachM + 1e-4;
}

function pushUnitShellBracketPlaneCandidates(args: {
  root: THREE.Object3D;
  runAlongX: boolean;
  center: number;
  selfBox: THREE.Box3;
  reachM: number;
  minCandidates: number[];
  maxCandidates: number[];
}): void {
  const meta = readWallSnapShellMetaFromAncestors(args.root);
  const shellReachM =
    meta !== null
      ? Math.max(args.reachM, unitInteriorRunSpanM(meta, args.runAlongX))
      : args.reachM;

  if (meta) {
    const bounds = getUnitInteriorShellBounds(meta);
    if (args.runAlongX) {
      if (bounds.minX < args.center - 1e-3) args.minCandidates.push(bounds.minX);
      if (bounds.maxX > args.center + 1e-3) args.maxCandidates.push(bounds.maxX);
    } else {
      if (bounds.minZ < args.center - 1e-3) args.minCandidates.push(bounds.minZ);
      if (bounds.maxZ > args.center + 1e-3) args.maxCandidates.push(bounds.maxZ);
    }
  }

  const shellRoot = findAuthoringShellRoot(args.root);
  if (!shellRoot) return;

  const meshBox = new THREE.Box3();
  shellRoot.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.userData[MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD] !== true) return;
    meshBox.setFromObject(o);
    if (meshBox.isEmpty()) return;

    const sx = meshBox.max.x - meshBox.min.x;
    const sy = meshBox.max.y - meshBox.min.y;
    const sz = meshBox.max.z - meshBox.min.z;
    if (sy < 0.35 || sy < Math.max(sx, sz) * 0.35) return;

    const nCenter = args.runAlongX
      ? (meshBox.min.x + meshBox.max.x) * 0.5
      : (meshBox.min.z + meshBox.max.z) * 0.5;
    if (args.runAlongX) {
      if (
        nCenter < args.center - 1e-3 &&
        acceptMinRunBracketPlane(meshBox.max.x, args.selfBox, "x", args.center, shellReachM)
      ) {
        args.minCandidates.push(meshBox.max.x);
      } else if (
        nCenter > args.center + 1e-3 &&
        acceptMaxRunBracketPlane(meshBox.min.x, args.selfBox, "x", args.center, shellReachM)
      ) {
        args.maxCandidates.push(meshBox.min.x);
      }
    } else {
      if (
        nCenter < args.center - 1e-3 &&
        acceptMinRunBracketPlane(meshBox.max.z, args.selfBox, "z", args.center, shellReachM)
      ) {
        args.minCandidates.push(meshBox.max.z);
      } else if (
        nCenter > args.center + 1e-3 &&
        acceptMaxRunBracketPlane(meshBox.min.z, args.selfBox, "z", args.center, shellReachM)
      ) {
        args.maxCandidates.push(meshBox.min.z);
      }
    }
  });
}

/**
 * Stretch the wall run axis so both ends meet inner faces of neighbors across an opening
 * (authored slabs and/or playable unit hollow-shell walls).
 */
export function expandWallRunToBracketingNeighbors(
  root: THREE.Object3D,
  mesh: THREE.Mesh,
  neighborRoots: readonly THREE.Object3D[],
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined,
): boolean {
  const selfRunsX = wallRunsAlongX(root);
  if (selfRunsX === null) return false;
  const runAlongX = selfRunsX;
  const runAxis: "x" | "z" = runAlongX ? "x" : "z";

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return false;

  const center =
    runAxis === "x" ? (box.min.x + box.max.x) * 0.5 : (box.min.z + box.max.z) * 0.5;
  const runSpanM = runAxis === "x" ? box.max.x - box.min.x : box.max.z - box.min.z;
  const reachM = bracketReachAlongRunM(runSpanM);
  const minCandidates: number[] = [];
  const maxCandidates: number[] = [];

  for (const neighbor of neighborRoots) {
    neighbor.updateMatrixWorld(true);
    const nb = new THREE.Box3().setFromObject(neighbor);
    if (nb.isEmpty()) continue;
    if (!wallNeighborBracketEligible(box, nb, runAlongX)) continue;

    const nRunsX = wallRunsAlongX(neighbor);
    if (nRunsX === null) continue;

    const planes = bracketPlanesFromNeighborPair(box, nb, runAxis, runAlongX, nRunsX);
    if (
      planes.minPlane !== undefined &&
      acceptMinRunBracketPlane(planes.minPlane, box, runAxis, center, reachM)
    ) {
      minCandidates.push(planes.minPlane);
    }
    if (
      planes.maxPlane !== undefined &&
      acceptMaxRunBracketPlane(planes.maxPlane, box, runAxis, center, reachM)
    ) {
      maxCandidates.push(planes.maxPlane);
    }
  }

  pushUnitShellBracketPlaneCandidates({
    root,
    runAlongX,
    center,
    selfBox: box,
    reachM,
    minCandidates,
    maxCandidates,
  });

  if (minCandidates.length === 0 || maxCandidates.length === 0) return false;

  const bracketMin = Math.max(...minCandidates);
  const bracketMax = Math.min(...maxCandidates);
  const span = bracketMax - bracketMin;
  const maxBracketSpanM = maxWallRunLengthMForRoot(root);
  if (span < EDITOR_MY_APARTMENT_WALL_SIZE_XZ_MIN_M - 1e-6) return false;
  if (span > maxBracketSpanM + 1e-3) return false;

  const pin = scaleDrag?.pinnedSpan;
  if (pin?.worldAxis === runAxis) {
    const freePlane = pin.side === "min" ? bracketMax : bracketMin;
    applyPinnedSpanResize(root, mesh, pin, freePlane, scaleDrag);
  } else if (runAxis === "x") {
    snapWorldSpanAlongX(root, mesh, bracketMin, bracketMax, scaleDrag);
  } else {
    snapWorldSpanAlongZ(root, mesh, bracketMin, bracketMax, scaleDrag);
  }
  return true;
}

/** True when the gizmo is scaling wall length (mesh local X), not thickness or height. */
export function isWallLengthScaleDrag(
  root: THREE.Object3D,
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined,
): boolean {
  const active = scaleDrag?.activeWorldAxis;
  if (!active) return false;
  const run = wallRunAxisWorld(root);
  if (!run) return active === "X";
  return Math.abs(run.x) >= Math.abs(run.z) ? active === "X" : active === "Z";
}

function snapToNeighborWalls(args: {
  root: THREE.Object3D;
  mesh: THREE.Mesh;
  neighborRoots: readonly THREE.Object3D[];
  scaleDrag: ConstrainMyApartmentWallScaleDrag | undefined;
  autoYaw: boolean;
}): void {
  const { root, mesh, neighborRoots, scaleDrag, autoYaw } = args;
  if (neighborRoots.length === 0) return;

  /**
   * Run-end snap to neighbors pins both faces to adjacent slabs — blocks lengthening a wall
   * that already sits between perpendicular neighbors (common room divider case).
   */
  if (isWallLengthScaleDrag(root, scaleDrag)) {
    expandWallRunToBracketingNeighbors(root, mesh, neighborRoots, scaleDrag);
    return;
  }

  /** Length-scale drags return early; remaining scale axes must not resize run span via snap. */
  const resizeLength = false;

  /** Auto-yaw before parallel centering can collapse L-corner offsets. */
  if (autoYaw) {
    root.updateMatrixWorld(true);
    wallSnapBoxScratch.setFromObject(root);
    for (const neighbor of neighborRoots) {
      neighbor.updateMatrixWorld(true);
      const nb = new THREE.Box3().setFromObject(neighbor);
      if (nb.isEmpty()) continue;
      maybeAutoYawPerpendicularForCorner(root, neighbor, wallSnapBoxScratch, nb);
    }
  }

  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    root.updateMatrixWorld(true);
    wallSnapBoxScratch.setFromObject(root);

    for (const neighbor of neighborRoots) {
      neighbor.updateMatrixWorld(true);
      const nb = new THREE.Box3().setFromObject(neighbor);
      if (nb.isEmpty()) continue;
      if (!wallNeighborSnapEligible(wallSnapBoxScratch, nb)) continue;

      const selfRunsX = wallRunsAlongX(root);
      const nRunsX = wallRunsAlongX(neighbor);
      if (selfRunsX === null || nRunsX === null) continue;

      if (selfRunsX === nRunsX) {
        if (
          autoYaw &&
          maybeAutoYawPerpendicularForCorner(root, neighbor, wallSnapBoxScratch, nb)
        ) {
          changed = true;
          continue;
        }
        changed =
          snapParallelWallPair({ root, mesh, neighbor, scaleDrag, resizeLength }) || changed;
      } else {
        changed =
          snapPerpendicularWallPair({ root, mesh, neighbor, scaleDrag, resizeLength }) ||
          changed;
      }

      changed =
        snapVerticalWallPair({ root, mesh, neighbor, scaleDrag }) || changed;
    }

    if (!changed) break;
  }
}

export function applyMyApartmentWallSurfaceSnap(
  root: THREE.Group,
  mesh: THREE.Mesh,
  meta: WallSnapShellMeta,
  opts?: {
    scaleDrag?: ConstrainMyApartmentWallScaleDrag;
    /** When true, a parallel wall dragged near another may auto-rotate 90° for an L-corner. */
    autoYaw?: boolean;
    /** When false, skip face-to-neighbor snapping (used when persisting / loading authored poses). */
    neighborSnap?: boolean;
    /** Stretch run axis to span between bracketing neighbors (opening fill). */
    fillRunBracket?: boolean;
  },
): void {
  clampWallAabbToUnitShellInterior(root, mesh, meta, opts?.scaleDrag);

  const excludeWallId = root.userData.mammothEditorMyApartmentWallId as string | undefined;
  const neighborRoots = collectNeighborWallRoots(root, excludeWallId);

  if (opts?.fillRunBracket === true) {
    expandWallRunToBracketingNeighbors(root, mesh, neighborRoots, opts?.scaleDrag);
  }

  if (opts?.neighborSnap !== false) {
    snapToNeighborWalls({
      root,
      mesh,
      neighborRoots,
      scaleDrag: opts?.scaleDrag,
      autoYaw: opts?.autoYaw === true,
    });
  }

  clampWallAabbToUnitShellInterior(root, mesh, meta, opts?.scaleDrag);
}

export function parseTransformControlsWorldScaleAxis(
  axis: string | null | undefined,
): "X" | "Y" | "Z" | null {
  if (!axis || axis === "XYZ" || axis.includes("E")) return null;
  if (axis.includes("X")) return "X";
  if (axis.includes("Y")) return "Y";
  if (axis.includes("Z")) return "Z";
  return null;
}
