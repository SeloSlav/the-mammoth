import type { PlayerPose } from "../../module_bindings/types";

export function poseSeqAsBigint(seq: PlayerPose["seq"]): bigint {
  return typeof seq === "bigint" ? seq : BigInt(seq as number);
}
