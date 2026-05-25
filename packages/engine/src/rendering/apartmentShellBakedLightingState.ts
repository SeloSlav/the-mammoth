/** When shell lightmaps are active, interior bounce is scaled down to avoid double-fill. */
let bounceScale = 1;

export function setApartmentShellBakedLightingBounceScale(scale: number): void {
  bounceScale = Math.max(0, scale);
}

export function getApartmentShellBakedLightingBounceScale(): number {
  return bounceScale;
}
