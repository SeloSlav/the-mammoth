import type { PlayerPose } from "../../module_bindings/types";
import type { PoseInterpBuffer } from "../fpRemote/poseInterpBuffer.js";

export type FpRemotePoseLastXZ = { x: number; z: number; t: number };

export function feedRemotePoseSample(
  interp: PoseInterpBuffer,
  id: string,
  row: PlayerPose,
  last: Map<string, FpRemotePoseLastXZ>,
): void {
  const prev = last.get(id);
  const now = performance.now();
  const dt = prev ? Math.max((now - prev.t) / 1000, 0.016) : 0.034;
  const vx = prev ? (row.x - prev.x) / dt : 0;
  const vz = prev ? (row.z - prev.z) / dt : 0;
  last.set(id, { x: row.x, z: row.z, t: now });
  interp.push(id, row.x, row.y, row.z, vx, vz);
}
