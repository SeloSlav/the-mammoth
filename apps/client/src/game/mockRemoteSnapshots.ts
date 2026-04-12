import type { ReplicatedPlayerSnapshot } from "@the-mammoth/game";

/**
 * Optional dev-only remote poses (e.g. patrol NPCs). Empty while tuning building-scale content.
 */
export function buildMockRemoteSnapshots(
  _nowMs: number,
): Map<string, ReplicatedPlayerSnapshot> {
  return new Map();
}
