import type { CollisionAabb } from "@the-mammoth/world";
import type { DbConnection } from "../../module_bindings";
import type { PlayerPose, PlayerVitals } from "../../module_bindings/types";

export const REMOTE_PLAYER_COLLISION_RADIUS_M = 0.22;
export const REMOTE_PLAYER_COLLISION_HEIGHT_M = 1.78;

function remotePlayerIsDead(conn: DbConnection, pose: PlayerPose): boolean {
  const vitals = conn.db.player_vitals.identity.find(pose.identity) as PlayerVitals | undefined;
  return (vitals?.health ?? 1) <= 0;
}

export function visitRemotePlayerCollisionAabbsInXZ(
  conn: DbConnection,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  visit: (aabb: CollisionAabb) => void,
): void {
  const self = conn.identity;
  if (!self) return;

  for (const row of conn.db.player_pose) {
    const pose = row as PlayerPose;
    if (self.isEqual(pose.identity)) continue;
    if (remotePlayerIsDead(conn, pose)) continue;

    const minX = pose.x - REMOTE_PLAYER_COLLISION_RADIUS_M;
    const maxX = pose.x + REMOTE_PLAYER_COLLISION_RADIUS_M;
    const minZ = pose.z - REMOTE_PLAYER_COLLISION_RADIUS_M;
    const maxZ = pose.z + REMOTE_PLAYER_COLLISION_RADIUS_M;
    if (maxX < x0 || minX > x1 || maxZ < z0 || minZ > z1) continue;

    visit({
      min: [minX, pose.y, minZ],
      max: [maxX, pose.y + REMOTE_PLAYER_COLLISION_HEIGHT_M, maxZ],
    });
  }
}
