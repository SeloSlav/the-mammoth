/**
 * Horizontal compass heading driven from a camera forward vector each frame.
 *
 * Convention: zero radians = facing world +Z (“north”). Angle increases clockwise (toward +X /
 * east), matching {@link Math.atan2} on the flattened forward vector `{ x, z }`.
 */

let headingRad = 0;

const listeners = new Set<() => void>();

export function getMammothCompassHeadingRad(): number {
  return headingRad;
}

export function subscribeMammothCompassHeading(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * @param xzForwardX Camera forward direction X component (typically world‑space).
 * @param xzForwardZ Camera forward direction Z component (typically world‑space).
 */
export function publishMammothCompassHeadingFromForwardXZ(
  xzForwardX: number,
  xzForwardZ: number,
): void {
  const len = Math.hypot(xzForwardX, xzForwardZ);
  if (len < 1e-9) return;
  const next = Math.atan2(xzForwardX / len, xzForwardZ / len);
  headingRad = next;
  if (listeners.size === 0) return;
  for (const l of listeners) l();
}

export function resetMammothCompassHeading(): void {
  headingRad = 0;
}
