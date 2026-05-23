/** Units to carry when middle-mouse dragging half a stack; null when split is not allowed. */
export function mammothHalfStackDragQuantity(totalQuantity: number, maxStack: number): number | null {
  if (maxStack <= 1 || totalQuantity <= 1) return null;
  const half = Math.floor(totalQuantity / 2);
  return half > 0 ? half : null;
}

/** Units to carry when right-mouse dragging one item from a stack; null when the slot is empty. */
export function mammothSingleUnitDragQuantity(totalQuantity: number): number | null {
  return totalQuantity >= 1 ? 1 : null;
}
