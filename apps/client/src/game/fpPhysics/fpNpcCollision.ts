import type { CollisionAabb } from "@the-mammoth/world";
import {
  isLivingWorldNpc,
  npcBodyDimsForArchetype,
  npcCapsuleCollisionAabb,
  PLAYER_BODY_HEIGHT_STAND_M,
  verticalCapsuleOverlap,
} from "@the-mammoth/game";
import type { DynamicCollisionQueryPose } from "./fpPlayerCollision.js";

export type FpNpcCollisionRow = {
  npcId: bigint;
  archetype: string;
  x: number;
  y: number;
  z: number;
  state: number;
  health: number;
};

export type FpNpcCollisionSource = {
  syncNpcRow: (row: FpNpcCollisionRow) => void;
  removeNpc: (npcId: bigint) => void;
  clear: () => void;
  visitCollisionAabbsInXZ: (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    queryPose?: DynamicCollisionQueryPose,
  ) => void;
};

export function createFpNpcCollisionSource(): FpNpcCollisionSource {
  const living = new Map<string, FpNpcCollisionRow>();

  const syncNpcRow = (row: FpNpcCollisionRow): void => {
    const key = row.npcId.toString();
    if (!isLivingWorldNpc(row.state, row.health)) {
      living.delete(key);
      return;
    }
    living.set(key, row);
  };

  const removeNpc = (npcId: bigint): void => {
    living.delete(npcId.toString());
  };

  const clear = (): void => {
    living.clear();
  };

  const visitCollisionAabbsInXZ = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    queryPose?: DynamicCollisionQueryPose,
  ): void => {
    const queryFeetY = queryPose?.bodyFeetY;
    const queryHeightM = queryPose?.bodyHeightM ?? PLAYER_BODY_HEIGHT_STAND_M;

    for (const row of living.values()) {
      const dims = npcBodyDimsForArchetype(row.archetype);
      if (
        queryFeetY !== undefined &&
        !verticalCapsuleOverlap(queryFeetY, queryHeightM, row.y, dims.heightM)
      ) {
        continue;
      }

      const cx = row.x;
      const cz = row.z;
      if (cx + dims.radiusM < x0 || cx - dims.radiusM > x1 || cz + dims.radiusM < z0 || cz - dims.radiusM > z1) {
        continue;
      }

      const built = npcCapsuleCollisionAabb({
        feetX: row.x,
        feetY: row.y,
        feetZ: row.z,
        radiusM: dims.radiusM,
        heightM: dims.heightM,
      });
      visit(built);
    }
  };

  return {
    syncNpcRow,
    removeNpc,
    clear,
    visitCollisionAabbsInXZ,
  };
}
