/**
 * In-place sort for distance-ranked remote player tuples (nearest camera first).
 * Tie-break by `id` so equal distances do not thrash when players stand in a ring.
 */
export function sortRemoteCrowdRankInPlace(rank: { id: string; distSq: number }[]): void {
  rank.sort((a, b) => a.distSq - b.distSq || a.id.localeCompare(b.id));
}

/** Preconditions: `rank` sorted by {@link sortRemoteCrowdRankInPlace}. */
export function remoteIdsForTopKFullDetail(rank: readonly { id: string }[], k: number): Set<string> {
  const out = new Set<string>();
  const n = Math.min(k, rank.length);
  for (let i = 0; i < n; i++) {
    out.add(rank[i]!.id);
  }
  return out;
}
