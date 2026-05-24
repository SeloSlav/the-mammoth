export type PointerButtonEdges = {
  primaryPress: boolean;
  primaryRelease: boolean;
  secondaryPress: boolean;
  secondaryRelease: boolean;
};

/** Detect left/right mouse button press and release edges from the `buttons` bitmask. */
export function detectPointerButtonEdges(
  prevButtons: number,
  nextButtons: number,
): PointerButtonEdges {
  return {
    primaryPress: (nextButtons & 1) !== 0 && (prevButtons & 1) === 0,
    primaryRelease: (nextButtons & 1) === 0 && (prevButtons & 1) !== 0,
    secondaryPress: (nextButtons & 2) !== 0 && (prevButtons & 2) === 0,
    secondaryRelease: (nextButtons & 2) === 0 && (prevButtons & 2) !== 0,
  };
}
