import * as THREE from "three";
import {
  exitFpSit,
  FP_SIT_STAND_NUDGE_M,
  getFpSitSession,
} from "./fpSitSession.js";

const _forward = new THREE.Vector3();

export function tryExitFpSitOnMovement(args: {
  keys: Set<string>;
  mainRaf: { bodyYaw: number; headLookYaw: number };
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

  _forward.set(Math.sin(args.mainRaf.bodyYaw), 0, Math.cos(args.mainRaf.bodyYaw));
  args.pos.x += _forward.x * FP_SIT_STAND_NUDGE_M;
  args.pos.z += _forward.z * FP_SIT_STAND_NUDGE_M;

  exitFpSit();
  return true;
}
