/** Units to carry when middle-mouse dragging half a stack; null when split is not allowed. */
export function mammothHalfStackDragQuantity(totalQuantity: number, maxStack: number): number | null {
  if (maxStack <= 1 || totalQuantity <= 1) return null;
  const half = Math.floor(totalQuantity / 2);
  return half > 0 ? half : null;
}
