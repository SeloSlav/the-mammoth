import * as THREE from "three";
import { apartmentSittableSpecFromModelPath } from "@the-mammoth/schemas";
import type { FpLocomotionInput, FpLocomotionState } from "@the-mammoth/engine";
import type { ApartmentSittablePrompt } from "./fpApartmentSittableTypes.js";
import { clientCanEnterApartmentSittable } from "./fpApartmentSittablePrompt.js";
import { computeApartmentSittableWorldPose } from "./fpApartmentSittablePose.js";
import { enterFpSit } from "./fpSitSession.js";
import type { DbConnection } from "../../module_bindings";

export function tryEnterFpSitFromPrompt(args: {
  conn: DbConnection;
  prompt: ApartmentSittablePrompt;
  playerPos: THREE.Vector3;
  pos: THREE.Vector3;
  loco: FpLocomotionState;
  mainRaf: { bodyYaw: number; headLookYaw: number; pitch: number };
  sendMoveIntent: (input: FpLocomotionInput, jump: boolean, nowMs: number) => void;
  nowMs: number;
  crouchToggle: boolean;
}): boolean {
  if (!clientCanEnterApartmentSittable(args.conn, args.prompt, args.playerPos)) return false;
  const spec = apartmentSittableSpecFromModelPath(args.prompt.modelRelPath);
  if (!spec) return false;
  const pose = computeApartmentSittableWorldPose(args.prompt.root, spec);
  const exitFeet = { x: args.pos.x, y: args.pos.y, z: args.pos.z };
  args.pos.set(pose.feetX, pose.feetY, pose.feetZ);
  args.loco.velocity.set(0, 0, 0);
  args.mainRaf.bodyYaw = pose.bodyYawRad;
  args.mainRaf.headLookYaw = 0;
  if (spec.mode === "lie") {
    args.mainRaf.pitch = pose.defaultPitchRad;
  }
  enterFpSit({
    active: true,
    sittableKey: args.prompt.sittableKey,
    unitKey: args.prompt.unitKey,
    mode: pose.mode,
    anchorFeet: { x: pose.feetX, y: pose.feetY, z: pose.feetZ },
    exitFeet,
    bodyYawRad: pose.bodyYawRad,
    eyeHeightM: pose.eyeHeightM,
  });
  args.sendMoveIntent(
    {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      crouch: args.crouchToggle,
      jumpHeld: false,
    },
    false,
    args.nowMs,
  );
  return true;
}
