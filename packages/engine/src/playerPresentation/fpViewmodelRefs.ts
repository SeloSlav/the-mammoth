import type { ModelRef } from "@the-mammoth/assets";

/** Half-Life style FP melee: closed right hand in grip pose (see `content/references/meshy/`). */
export const FP_MELEE_HAND_RIGHT: Extract<ModelRef, { kind: "gltf" }> = {
  kind: "gltf",
  key: "player/fp_hand_right",
  uri: "/static/models/fp/hands/right.glb",
};
