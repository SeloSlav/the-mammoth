import type { OwnedApartmentNpcCombatSpawn } from "@the-mammoth/schemas";
import { mapOwnedApartmentLayoutFractionToWorldX } from "./residentialUnitBalcony.js";

export type NpcCombatSpawnWorldPosition = {
  x: number;
  y: number;
  z: number;
};

/** Layout-fraction NPC spawn → world feet (matches server apartment decor mapping). */
export function ownedApartmentNpcCombatSpawnWorldPosition(args: {
  unitId: string;
  footY: number;
  boundMinX: number;
  boundMaxX: number;
  boundMinZ: number;
  boundMaxZ: number;
  spawn: Pick<OwnedApartmentNpcCombatSpawn, "fx" | "fz">;
}): NpcCombatSpawnWorldPosition {
  const spanZ = args.boundMaxZ - args.boundMinZ;
  return {
    x: mapOwnedApartmentLayoutFractionToWorldX(
      args.boundMinX,
      args.boundMaxX,
      args.unitId,
      args.spawn.fx,
    ),
    y: args.footY,
    z: args.boundMinZ + args.spawn.fz * spanZ,
  };
}

export function resolveOwnedApartmentNpcCombatSpawnsWorld(args: {
  unitId: string;
  footY: number;
  boundMinX: number;
  boundMaxX: number;
  boundMinZ: number;
  boundMaxZ: number;
  spawns: readonly OwnedApartmentNpcCombatSpawn[];
}): Array<
  OwnedApartmentNpcCombatSpawn & NpcCombatSpawnWorldPosition & { yaw: number }
> {
  return args.spawns.map((spawn) => {
    const pos = ownedApartmentNpcCombatSpawnWorldPosition({
      unitId: args.unitId,
      footY: args.footY,
      boundMinX: args.boundMinX,
      boundMaxX: args.boundMaxX,
      boundMinZ: args.boundMinZ,
      boundMaxZ: args.boundMaxZ,
      spawn,
    });
    return { ...spawn, ...pos, yaw: spawn.yawRad };
  });
}
