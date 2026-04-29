/** Smallest absolute difference between two yaw angles (radians). */
export function fpShortestAngleDeltaAbsRad(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}
