import type { HeldItemId, ReplicatedPlayerSnapshot } from "@the-mammoth/game";

export type PlainPoseFields = {
  playerIdHex: string;
  x: number;
  y: number;
  z: number;
  yawRad: number;
  velX: number;
  velY: number;
  velZ: number;
  grounded: boolean;
};

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

/**
 * Pure adapter from numeric pose fields to the render boundary snapshot.
 * Apps map their DB row types -> `PlainPoseFields` without importing Three.js.
 */
export function replicatedPlayerSnapshotFromPlainPose(
  fields: PlainPoseFields,
  options?: {
    worldPositionOverride?: { x: number; y: number; z: number };
    observedTimeMs?: number;
    equippedPrimary?: HeldItemId;
    displayName?: string;
  },
): ReplicatedPlayerSnapshot {
  const observedTimeMs = options?.observedTimeMs ?? 0;
  const worldPosition = options?.worldPositionOverride ?? {
    x: fields.x,
    y: fields.y,
    z: fields.z,
  };
  return {
    playerIdHex: fields.playerIdHex,
    displayName: options?.displayName ?? fields.playerIdHex.slice(0, 8),
    observedTimeMs,
    worldPosition,
    yawRad: fields.yawRad,
    velocity: { x: fields.velX, y: fields.velY, z: fields.velZ },
    grounded: fields.grounded,
    locomotion: locomotionFromHorizontalSpeed(fields.velX, fields.velZ),
    equippedPrimary: options?.equippedPrimary ?? "crowbar",
  };
}
