import type {
  OwnedApartmentBuiltinsDoc,
  OwnedApartmentMirrorItem,
  OwnedApartmentPlacedItem,
  OwnedApartmentWallItem,
} from "@the-mammoth/schemas";

function placedItemsEqual(
  a: readonly OwnedApartmentPlacedItem[],
  b: readonly OwnedApartmentPlacedItem[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.id !== right.id ||
      left.modelRelPath !== right.modelRelPath ||
      left.fx !== right.fx ||
      left.fz !== right.fz ||
      left.dy !== right.dy ||
      left.yawRad !== right.yawRad ||
      left.pitchRad !== right.pitchRad ||
      left.rollRad !== right.rollRad ||
      left.uniformScale !== right.uniformScale ||
      left.ignoreSupportSurfaces !== right.ignoreSupportSurfaces ||
      left.itemKind !== right.itemKind
    ) {
      return false;
    }
  }
  return true;
}

function wallItemsEqual(
  a: readonly OwnedApartmentWallItem[],
  b: readonly OwnedApartmentWallItem[],
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
      left.sizeX !== right.sizeX ||
      left.sizeY !== right.sizeY ||
      left.sizeZ !== right.sizeZ ||
      JSON.stringify(left.material) !== JSON.stringify(right.material)
    ) {
      return false;
    }
  }
  return true;
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
    prev.wallItems !== next.wallItems && wallItemsEqual(prev.wallItems, next.wallItems)
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
