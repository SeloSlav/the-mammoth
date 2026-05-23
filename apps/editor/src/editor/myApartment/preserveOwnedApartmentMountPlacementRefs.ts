import {
  resolveOwnedApartmentDecorRootScale,
  type OwnedApartmentBuiltinsDoc,
  type OwnedApartmentMirrorItem,
  type OwnedApartmentPlacedItem,
  type OwnedApartmentWallItem,
} from "@the-mammoth/schemas";
import { editorMyApartmentSelectedIdForWall } from "./editorMyApartmentSelection.js";

export function ownedApartmentPlacedItemStructuralEqual(
  left: OwnedApartmentPlacedItem,
  right: OwnedApartmentPlacedItem,
): boolean {
  const leftScale = resolveOwnedApartmentDecorRootScale(left);
  const rightScale = resolveOwnedApartmentDecorRootScale(right);
  return (
    left.id === right.id &&
    left.modelRelPath === right.modelRelPath &&
    leftScale.x === rightScale.x &&
    leftScale.y === rightScale.y &&
    leftScale.z === rightScale.z &&
    left.ignoreSupportSurfaces === right.ignoreSupportSurfaces &&
    left.itemKind === right.itemKind
  );
}

export function ownedApartmentPlacedItemPoseEqual(
  left: OwnedApartmentPlacedItem,
  right: OwnedApartmentPlacedItem,
): boolean {
  return (
    left.fx === right.fx &&
    left.fz === right.fz &&
    left.dy === right.dy &&
    left.yawRad === right.yawRad &&
    left.pitchRad === right.pitchRad &&
    (left.rollRad ?? 0) === (right.rollRad ?? 0)
  );
}

export function ownedApartmentPlacedItemsOnlyPoseChanged(
  prev: readonly OwnedApartmentPlacedItem[],
  next: readonly OwnedApartmentPlacedItem[],
): boolean {
  if (prev.length !== next.length) return false;
  const prevById = new Map(prev.map((item) => [item.id, item]));
  for (const item of next) {
    const prior = prevById.get(item.id);
    if (!prior || !ownedApartmentPlacedItemStructuralEqual(prior, item)) {
      return false;
    }
  }
  return true;
}

function placedItemsEqual(
  a: readonly OwnedApartmentPlacedItem[],
  b: readonly OwnedApartmentPlacedItem[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    const leftScale = resolveOwnedApartmentDecorRootScale(left);
    const rightScale = resolveOwnedApartmentDecorRootScale(right);
    if (
      left.id !== right.id ||
      left.modelRelPath !== right.modelRelPath ||
      left.fx !== right.fx ||
      left.fz !== right.fz ||
      left.dy !== right.dy ||
      left.yawRad !== right.yawRad ||
      left.pitchRad !== right.pitchRad ||
      left.rollRad !== right.rollRad ||
      leftScale.x !== rightScale.x ||
      leftScale.y !== rightScale.y ||
      leftScale.z !== rightScale.z ||
      left.ignoreSupportSurfaces !== right.ignoreSupportSurfaces ||
      left.itemKind !== right.itemKind
    ) {
      return false;
    }
  }
  return true;
}

/** Pose/size/material only — ignores door opening list (for lightweight opening refresh). */
export function ownedApartmentWallPlacementFieldsEqual(
  left: OwnedApartmentWallItem,
  right: OwnedApartmentWallItem,
): boolean {
  return (
    left.id === right.id &&
    left.fx === right.fx &&
    left.fz === right.fz &&
    left.dy === right.dy &&
    left.yawRad === right.yawRad &&
    left.pitchRad === right.pitchRad &&
    left.sizeX === right.sizeX &&
    left.sizeY === right.sizeY &&
    left.sizeZ === right.sizeZ &&
    JSON.stringify(left.material) === JSON.stringify(right.material)
  );
}

function ownedApartmentWallItemPlacementEqual(
  left: OwnedApartmentWallItem,
  right: OwnedApartmentWallItem,
): boolean {
  return (
    ownedApartmentWallPlacementFieldsEqual(left, right) &&
    JSON.stringify(left.openings ?? []) === JSON.stringify(right.openings ?? [])
  );
}

export function ownedApartmentWallItemsDeepEqual(
  a: readonly OwnedApartmentWallItem[],
  b: readonly OwnedApartmentWallItem[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!ownedApartmentWallItemPlacementEqual(a[i]!, b[i]!)) {
      return false;
    }
  }
  return true;
}

/** Wall ids whose door/opening list changed (placement fields may match). */
export function collectOwnedApartmentWallIdsWithOpeningChanges(
  prev: readonly OwnedApartmentWallItem[],
  next: readonly OwnedApartmentWallItem[],
): Set<string> {
  const changed = new Set<string>();
  const prevById = new Map(prev.map((w) => [w.id, w]));
  const nextById = new Map(next.map((w) => [w.id, w]));
  for (const wall of next) {
    const prior = prevById.get(wall.id);
    if (
      !prior ||
      JSON.stringify(prior.openings ?? []) !== JSON.stringify(wall.openings ?? [])
    ) {
      changed.add(wall.id);
    }
  }
  for (const wall of prev) {
    if (!nextById.has(wall.id)) {
      changed.add(wall.id);
    }
  }
  return changed;
}

/** Wall ids whose placement or openings changed — for incremental mount sync. */
export function collectChangedOwnedApartmentWallIds(
  prev: readonly OwnedApartmentWallItem[],
  next: readonly OwnedApartmentWallItem[],
): Set<string> {
  const changed = new Set<string>();
  const prevById = new Map(prev.map((w) => [w.id, w]));
  const nextById = new Map(next.map((w) => [w.id, w]));
  for (const wall of next) {
    const prior = prevById.get(wall.id);
    if (!prior || !ownedApartmentWallItemPlacementEqual(prior, wall)) {
      changed.add(wall.id);
    }
  }
  for (const wall of prev) {
    if (!nextById.has(wall.id)) {
      changed.add(wall.id);
    }
  }
  return changed;
}

/** Wall ids that need `placeWallGroup` — data changed and/or no selection group in the mount yet. */
export function collectWallIdsNeedingEditorMountSync(
  prevWallItems: readonly OwnedApartmentWallItem[],
  nextWallItems: readonly OwnedApartmentWallItem[],
  mountedWallSelectionKeys: ReadonlySet<string>,
): Set<string> {
  const ids = collectChangedOwnedApartmentWallIds(prevWallItems, nextWallItems);
  for (const wall of nextWallItems) {
    const selId = editorMyApartmentSelectedIdForWall(wall.id);
    if (!mountedWallSelectionKeys.has(selId)) {
      ids.add(wall.id);
    }
  }
  return ids;
}

function mirrorItemsEqual(
  a: readonly OwnedApartmentMirrorItem[],
  b: readonly OwnedApartmentMirrorItem[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.id !== right.id ||
      left.fx !== right.fx ||
      left.fz !== right.fz ||
      left.dy !== right.dy ||
      left.yawRad !== right.yawRad ||
      left.pitchRad !== right.pitchRad ||
      left.rollRad !== right.rollRad ||
      left.sizeX !== right.sizeX ||
      left.sizeY !== right.sizeY
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Zod parse always allocates fresh placement arrays. Reuse prior refs when placement data is
 * unchanged so apartment mount sync does not rebuild meshes for object-group-only edits.
 */
export function preserveOwnedApartmentMountPlacementRefs(
  prev: OwnedApartmentBuiltinsDoc,
  next: OwnedApartmentBuiltinsDoc,
): OwnedApartmentBuiltinsDoc {
  if (
    prev === next ||
    (prev.previewSizeM === next.previewSizeM &&
      prev.placedItems === next.placedItems &&
      prev.wallItems === next.wallItems &&
      prev.mirrorItems === next.mirrorItems)
  ) {
    return next;
  }

  const placedItems =
    prev.placedItems !== next.placedItems &&
    placedItemsEqual(prev.placedItems, next.placedItems)
      ? prev.placedItems
      : next.placedItems;
  const wallItems =
    prev.wallItems !== next.wallItems &&
    ownedApartmentWallItemsDeepEqual(prev.wallItems, next.wallItems)
      ? prev.wallItems
      : next.wallItems;
  const mirrorItems =
    prev.mirrorItems !== next.mirrorItems &&
    mirrorItemsEqual(prev.mirrorItems, next.mirrorItems)
      ? prev.mirrorItems
      : next.mirrorItems;

  if (
    placedItems === next.placedItems &&
    wallItems === next.wallItems &&
    mirrorItems === next.mirrorItems
  ) {
    return next;
  }

  return {
    ...next,
    placedItems,
    wallItems,
    mirrorItems,
  };
}

/** Stable signature for wall opening punches — used to force mesh rebuilds. */
export function ownedApartmentWallOpeningsSignature(
  wallItems: readonly OwnedApartmentWallItem[],
): string {
  return wallItems
    .map((w) => `${w.id}\0${JSON.stringify(w.openings ?? [])}`)
    .join("\n");
}
