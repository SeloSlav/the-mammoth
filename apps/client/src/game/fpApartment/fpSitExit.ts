import * as THREE from "three";
import { exitFpSit, getFpSitSession } from "./fpSitSession.js";

export function tryExitFpSitOnMovement(args: {
  keys: Set<string>;
  mainRaf: { bodyYaw: number; headLookYaw: number; pitch: number };
  pos: THREE.Vector3;
}): boolean {
  const moving =
    args.keys.has("KeyW") ||
    args.keys.has("KeyS") ||
    args.keys.has("KeyA") ||
    args.keys.has("KeyD");
  if (!moving) return false;
  const sit = getFpSitSession();
  if (!sit) return false;

  if (args.mainRaf.headLookYaw !== 0) {
    args.mainRaf.bodyYaw += args.mainRaf.headLookYaw;
    args.mainRaf.headLookYaw = 0;
  }
  if (sit.mode === "lie") {
    args.mainRaf.pitch = 0;
  }

  args.pos.set(sit.standFeet.x, sit.standFeet.y, sit.standFeet.z);
  exitFpSit();
  return true;
}
