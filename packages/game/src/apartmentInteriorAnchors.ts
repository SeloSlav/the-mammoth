/**
 * Helpers for orienting apartment props toward room center (visual yaw).
 * Authoritative interact positions live on `ApartmentUnit` (`wardrobe_x/z`, `foot_x/z`, `bed_*`).
 */

export type ApartmentInteriorBounds = {
  boundMinX: number;
  boundMaxX: number;
  boundMinZ: number;
  boundMaxZ: number;
};

export function yawTowardRoomCenterXZ(
  fromX: number,
  fromZ: number,
  bounds: ApartmentInteriorBounds,
): number {
  const cx = (bounds.boundMinX + bounds.boundMaxX) * 0.5;
  const cz = (bounds.boundMinZ + bounds.boundMaxZ) * 0.5;
  return Math.atan2(cx - fromX, cz - fromZ);
}
