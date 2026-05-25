import { estimateStoreyFromFeetY } from "@the-mammoth/world";
import type { ReplicatedNpcSnapshot } from "@the-mammoth/game";

export type FpNpcRenderPvsGateInput = {
  snapshot: ReplicatedNpcSnapshot;
  floorPlateBand: { lo: number; hi: number };
  storeyOpts: {
    buildingWorldOriginY: number;
    floorSpacingM: number;
    maxLevel: number;
  };
  insideResidentialUnit: boolean;
  insideApartmentInteriorLightingZone: boolean;
  corridorPvsVisibleUnitKeys: ReadonlySet<string>;
  unitKeyContainingPoint: (x: number, y: number, z: number) => string | null;
};

/** CPU-side NPC render gate — storey band + corridor door PVS (no GPU readback). */
export function fpNpcPassesRenderPvsGate(input: FpNpcRenderPvsGateInput): boolean {
  const { snapshot, floorPlateBand, storeyOpts } = input;
  const y = snapshot.worldPosition.y;
  const npcStorey = estimateStoreyFromFeetY(y, storeyOpts);
  if (npcStorey < floorPlateBand.lo || npcStorey > floorPlateBand.hi) {
    return false;
  }
  if (input.insideResidentialUnit || !input.insideApartmentInteriorLightingZone) {
    return true;
  }
  const { x, z } = snapshot.worldPosition;
  const unitKey = input.unitKeyContainingPoint(x, y, z);
  if (unitKey === null) return true;
  return input.corridorPvsVisibleUnitKeys.has(unitKey);
}

export function createFpNpcRenderPvsGate(
  getInput: () => Omit<FpNpcRenderPvsGateInput, "snapshot">,
): (snapshot: ReplicatedNpcSnapshot) => boolean {
  return (snapshot) =>
    fpNpcPassesRenderPvsGate({
      snapshot,
      ...getInput(),
    });
}
