import {
  estimateStoreyFromFeetY,
  mammothVerticalStoryBandIndex,
} from "@the-mammoth/world";
import type { ReplicatedNpcSnapshot } from "@the-mammoth/game";

export type FpNpcStoreyOpts = {
  buildingWorldOriginY: number;
  floorSpacingM: number;
  maxLevel: number;
};

export type FpNpcRenderPvsGateInput = {
  snapshot: ReplicatedNpcSnapshot;
  /** Local player feet Y (authoritative pose). */
  playerFeetY: number;
  storeyOpts: FpNpcStoreyOpts;
};

/** True when NPC and player share the same vertical band (robust vs slab/elevator drift). */
export function fpNpcOnPlayerStorey(
  npcFeetY: number,
  playerFeetY: number,
  storeyOpts: FpNpcStoreyOpts,
): boolean {
  const oy = storeyOpts.buildingWorldOriginY;
  const spacing = storeyOpts.floorSpacingM;
  return (
    mammothVerticalStoryBandIndex(npcFeetY, oy, spacing) ===
    mammothVerticalStoryBandIndex(playerFeetY, oy, spacing)
  );
}

/**
 * CPU-side NPC presentation gate — same-storey only.
 * Corridor door PVS applies to unit shells/decor, not combat NPCs (they must read on the slab you're on).
 */
export function fpNpcPassesRenderPvsGate(input: FpNpcRenderPvsGateInput): boolean {
  const { snapshot, playerFeetY, storeyOpts } = input;
  return fpNpcOnPlayerStorey(snapshot.worldPosition.y, playerFeetY, storeyOpts);
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
