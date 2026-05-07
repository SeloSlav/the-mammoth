import type { ReplicatedPlayerSnapshot } from "@the-mammoth/game";

export function locomotionFromHorizontalSpeed(
  velX: number,
  velZ: number,
  opts?: { walkThreshold?: number; runThreshold?: number },
): ReplicatedPlayerSnapshot["locomotion"] {
  const walkThreshold = opts?.walkThreshold ?? 0.22;
  const runThreshold = opts?.runThreshold ?? 3.15;
  const h = Math.hypot(velX, velZ);
  if (h < walkThreshold) return "idle";
  if (h >= runThreshold) return "run";
  return "walk";
}
