import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as tuning from "./elevatorCollisionTuning.js";

const rustPath = fileURLToPath(
  new URL("../../../apps/server/src/elevator/collision_tuning.rs", import.meta.url),
);

/** `pub(super) const NAME: f32 = LITERAL;` only (skips computed RHS). */
function rustLiteralConsts(source: string): Map<string, number> {
  const out = new Map<string, number>();
  const re = /pub\(super\) const ([A-Z0-9_]+): f32 = (-?[\d.]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.set(m[1], Number(m[2]));
  }
  return out;
}

describe("elevator collision tuning parity (TS world vs Rust server)", () => {
  it("matches every literal f32 in collision_tuning.rs", () => {
    const rust = readFileSync(rustPath, "utf8");
    expect(rust).toContain("elevatorCollisionTuning.ts");

    const literals = rustLiteralConsts(rust);
    const expectMap: Record<string, number> = {
      EXT_DOOR_W: tuning.EXTERIOR_DOOR_W_M,
      EXT_DOOR_H: tuning.EXTERIOR_DOOR_H_M,
      EXT_DOOR_COLLISION_OPEN_THRESH: tuning.EXTERIOR_DOOR_COLLISION_OPEN_THRESH,
      EXT_DOOR_ANIM_SPEED: tuning.EXTERIOR_DOOR_ANIM_SPEED,
      EXT_DOOR_SOLID_SLAB_MAX_SWING: tuning.EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING,
      EXT_DOOR_SWING_MAX_RAD: tuning.EXTERIOR_DOOR_SWING_MAX_RAD,
      EXT_DOOR_HINGE_OUTSET: tuning.EXTERIOR_DOOR_HINGE_OUTSET,
      EXT_DOOR_PANEL_HALF_THICK: tuning.EXTERIOR_DOOR_PANEL_HALF_THICK,
      EXT_INTERACT_L0: tuning.EXTERIOR_INTERACT_L0,
      EXT_INTERACT_L1: tuning.EXTERIOR_INTERACT_L1,
      EXT_INTERACT_LZ_PAD: tuning.EXTERIOR_INTERACT_LZ_PAD,
      EXT_STRIP_Y0: tuning.EXTERIOR_STRIP_Y0,
      EXT_STRIP_Y1: tuning.EXTERIOR_STRIP_Y1,
      EXT_COLLISION_L0: tuning.EXTERIOR_COLLISION_L0,
      EXT_COLLISION_L1: tuning.EXTERIOR_COLLISION_L1,
      EXT_COLLISION_LZ_PAD: tuning.EXTERIOR_COLLISION_LZ_PAD,
      EXT_INTERACT_WORLD_RADIUS_M: tuning.EXTERIOR_INTERACT_WORLD_RADIUS_M,
      EXT_INTERACT_WORLD_Y_HALF_M: tuning.EXTERIOR_INTERACT_WORLD_Y_HALF_M,
      CLOSED_CAB_OUTSIDE_SLAB_IN: tuning.CLOSED_CAB_OUTSIDE_SLAB_IN,
      CLOSED_CAB_OUTSIDE_SLAB_OUT: tuning.CLOSED_CAB_OUTSIDE_SLAB_OUT,
      CLOSED_CAB_OUTSIDE_WIDTH_PAD: tuning.CLOSED_CAB_OUTSIDE_WIDTH_PAD,
      LANDING_FRONT_WALL_SLAB_IN: tuning.LANDING_FRONT_WALL_SLAB_IN,
      LANDING_FRONT_WALL_SLAB_OUT: tuning.LANDING_FRONT_WALL_SLAB_OUT,
      LANDING_FRONT_WALL_PUSH_OUT: tuning.LANDING_FRONT_WALL_PUSH_OUT,
      LANDING_PASSAGE_DOCK_Y_TOL_M: tuning.LANDING_PASSAGE_DOCK_Y_TOL_M,
    };

    for (const [k, v] of Object.entries(expectMap)) {
      expect(literals.has(k), `missing Rust const ${k}`).toBe(true);
      expect(literals.get(k), k).toBeCloseTo(v, 6);
    }
  });

  it("keeps passage half-width formula aligned", () => {
    const rust = readFileSync(rustPath, "utf8");
    expect(rust).toMatch(
      /LANDING_FRONT_PASSAGE_HALF_W: f32 = EXT_DOOR_W \* 0\.5 \+ 0\.04;/,
    );
    expect(tuning.LANDING_FRONT_PASSAGE_HALF_W_M).toBeCloseTo(
      tuning.EXTERIOR_DOOR_W_M * 0.5 + 0.04,
      6,
    );
  });
});
