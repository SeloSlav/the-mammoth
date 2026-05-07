/**
 * Persist last known feet pose for the active **guest save slot** (local-only).
 * Spacetime `player_pose` is authoritative once subscribed; this removes the lobby-hub snap on refresh
 * and seeds AOI before snapshot handlers replay.
 */

import {
  readGuestSaveRegistry,
  writeGuestSaveRegistry,
} from "./guestSaveRegistry.js";

export type GuestPersistedFeetPose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  atMs: number;
};

const POSE_EPS = 0.004;
const YAW_EPS = 0.002;

/** Read hydrated feet + yaw for FP bootstrap. */
export function readActiveGuestLastWorldPose(): GuestPersistedFeetPose | null {
  const reg = readGuestSaveRegistry();
  if (!reg.activeSlotId) return null;
  const slot = reg.slots.find((s) => s.id === reg.activeSlotId);
  const lp = slot?.lastWorldPose;
  if (!lp || !numbersFiniteTriple(lp.x, lp.y, lp.z)) return null;
  const yaw =
    lp.yaw === undefined ? 0 : typeof lp.yaw === "number" && Number.isFinite(lp.yaw) ? lp.yaw : 0;
  const atMs = typeof lp.atMs === "number" && Number.isFinite(lp.atMs) ? lp.atMs : 0;
  return { x: lp.x, y: lp.y, z: lp.z, yaw, atMs };
}

function numbersFiniteTriple(a: unknown, b: unknown, c: unknown): boolean {
  return (
    typeof a === "number" &&
    Number.isFinite(a) &&
    typeof b === "number" &&
    Number.isFinite(b) &&
    typeof c === "number" &&
    Number.isFinite(c)
  );
}

export function persistActiveGuestLastWorldPose(pose: Omit<GuestPersistedFeetPose, "atMs">): void {
  const reg = readGuestSaveRegistry();
  if (!reg.activeSlotId) return;

  let changedSlot = false;
  const slots = reg.slots.map((s) => {
    if (s.id !== reg.activeSlotId) return s;
    const prev = s.lastWorldPose;
    const atMs = Date.now();
    const movedEnough =
      !prev ||
      Math.abs(prev.x - pose.x) >= POSE_EPS ||
      Math.abs(prev.y - pose.y) >= POSE_EPS ||
      Math.abs(prev.z - pose.z) >= POSE_EPS ||
      Math.abs((prev.yaw ?? 0) - pose.yaw) >= YAW_EPS;
    if (!movedEnough) return s;

    changedSlot = true;
    return {
      ...s,
      lastWorldPose: { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, atMs },
      updatedAtMs: atMs,
    };
  });

  if (changedSlot) {
    writeGuestSaveRegistry({ ...reg, slots });
  }
}

let guestFeetAutosaveGateMs = 0;

/** Called from RAF with wall-clock ms — persists guest pose at most ~`intervalMs` unless forced on tab hide. */
export function bumpGuestFeetAutosaveIfDue(
  wallMs: number,
  pose: { x: number; y: number; z: number; yaw: number },
  opts: { intervalMs?: number } = {},
): void {
  const intervalMs = opts.intervalMs ?? 520;
  if (!readGuestSaveRegistry().activeSlotId) return;
  if (wallMs - guestFeetAutosaveGateMs < intervalMs) return;
  guestFeetAutosaveGateMs = wallMs;
  persistActiveGuestLastWorldPose(pose);
}
