import type { ReplicatedPlayerSnapshot } from "@the-mammoth/game";
import { replicatedPlayerSnapshotFromPlainPose } from "@the-mammoth/net";

/**
 * Dev-only patrols so the third-person pipeline is visible before multiple humans connect.
 * IDs are deliberately non-hex so they never collide with Spacetime identities.
 */
export function buildMockRemoteSnapshots(nowMs: number): Map<string, ReplicatedPlayerSnapshot> {
  const map = new Map<string, ReplicatedPlayerSnapshot>();
  const t = nowMs / 1000;

  const ax = Math.cos(t * 0.35) * 3.5;
  const az = Math.sin(t * 0.35) * 3.5;
  const avx = -Math.sin(t * 0.35) * 1.2;
  const avz = Math.cos(t * 0.35) * 1.2;
  map.set(
    "mock-scout-a",
    replicatedPlayerSnapshotFromPlainPose(
      {
        playerIdHex: "mock-scout-a",
        x: ax,
        y: 0.35 + 0.02,
        z: az,
        yawRad: t * 0.6,
        velX: avx,
        velY: 0,
        velZ: avz,
        grounded: true,
      },
      { observedTimeMs: nowMs, equippedPrimary: "crowbar" },
    ),
  );

  const bx = Math.sin(t * 0.28) * 2.5 + 4;
  const bz = Math.cos(t * 0.28) * 2.5 - 3;
  const bvx = Math.cos(t * 0.28) * 0.9;
  const bvz = -Math.sin(t * 0.28) * 0.9;
  map.set(
    "mock-scout-b",
    replicatedPlayerSnapshotFromPlainPose(
      {
        playerIdHex: "mock-scout-b",
        x: bx,
        y: 0.35 + 0.02,
        z: bz,
        yawRad: -t * 0.45,
        velX: bvx,
        velY: 0,
        velZ: bvz,
        grounded: true,
      },
      { observedTimeMs: nowMs, equippedPrimary: "crowbar" },
    ),
  );

  return map;
}
