import type { DbConnection } from "../../module_bindings/index.js";
import {
  partitionWallWorldCollisionAabbs,
  type PartitionWallWorldPose,
} from "@the-mammoth/game";

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { unitKey: string; flat: number[] } | null = null;

function flattenPartitionBlockers(
  poses: readonly PartitionWallWorldPose[],
): number[] {
  const flat: number[] = [];
  for (const pose of poses) {
    for (const aabb of partitionWallWorldCollisionAabbs(pose)) {
      flat.push(
        aabb.min[0],
        aabb.min[1],
        aabb.min[2],
        aabb.max[0],
        aabb.max[1],
        aabb.max[2],
      );
    }
  }
  return flat;
}

/** Debounced `sync_apartment_partition_blockers` for owned-unit decor rebuilds. */
export function scheduleSyncApartmentPartitionBlockers(
  conn: DbConnection,
  unitKey: string,
  poses: readonly PartitionWallWorldPose[],
): void {
  pending = { unitKey, flat: flattenPartitionBlockers(poses) };
  if (syncTimer !== null) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    const job = pending;
    pending = null;
    if (!job) return;
    conn.reducers
      .syncApartmentPartitionBlockers({ unitKey: job.unitKey, aabbFlat: job.flat })
      .catch((err: unknown) => {
        console.warn("[fpApartment] sync_apartment_partition_blockers failed", err);
      });
  }, 250);
}

export function partitionPosesFromWallRows(
  rows: ReadonlyArray<{
    posX: number;
    posY: number;
    posZ: number;
    yawRad: number;
    pitchRad: number;
    sizeX: number;
    sizeY: number;
    sizeZ: number;
    openings?: PartitionWallWorldPose["openings"];
  }>,
): PartitionWallWorldPose[] {
  return rows.map((w) => ({
    posX: w.posX,
    posY: w.posY,
    posZ: w.posZ,
    yawRad: w.yawRad,
    pitchRad: w.pitchRad,
    rollRad: 0,
    sizeX: w.sizeX,
    sizeY: w.sizeY,
    sizeZ: w.sizeZ,
    openings: w.openings,
  }));
}
