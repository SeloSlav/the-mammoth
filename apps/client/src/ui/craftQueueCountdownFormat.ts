/** Human-readable countdown for in-progress crafts (ceil seconds; mm:ss when ≥ 60s). */
export function formatCraftQueueCountdown(remainingSec: number): string {
  const s = Math.max(0, Math.ceil(remainingSec));
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  }
  return `${s}s`;
}
