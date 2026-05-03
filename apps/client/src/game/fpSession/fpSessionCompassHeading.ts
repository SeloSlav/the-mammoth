/**
 * Horizontal compass heading driven from the FP camera after each physics/presentation tick.
 *
 * Convention: zero radians = facing world +Z (“north”). Angle increases clockwise (toward +X /
 * east), matching {@link Math.atan2} on the flattened forward vector `{ x, z }`.
 */

let headingRad = 0;

const listeners = new Set<() => void>();

export function getFpSessionCompassHeadingRad(): number {
  return headingRad;
}

export function subscribeFpSessionCompassHeading(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * @param xzForwardX Camera forward direction X component (typically world‑space).
 * @param xzForwardZ Camera forward direction Z component (typically world‑space).
 */
export function publishFpSessionCompassHeadingFromForwardXZ(xzForwardX: number, xzForwardZ: number): void {
  const len = Math.hypot(xzForwardX, xzForwardZ);
  if (len < 1e-9) return;
  const next = Math.atan2(xzForwardX / len, xzForwardZ / len);
  headingRad = next;
  if (listeners.size === 0) return;
  for (const l of listeners) l();
}

export function resetFpSessionCompassHeading(): void {
  headingRad = 0;
}
