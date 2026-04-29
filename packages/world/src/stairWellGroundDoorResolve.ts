import * as THREE from "three";
import type { StairWellDef } from "@the-mammoth/schemas";
import {
  clampStairDoorTangentAlongInnerWall,
  computeSwitchbackStairLayout,
  GROUND_STOREY_EXTRA_BOTTOM_TREADS,
  pickCornerLandingNearDoorBand,
  pickStairShaftGroundDoorPlacement,
  shiftStairDoorTangentViewerRightFromInside,
  snapStairDoorTangentAlongWallToLanding,
  STAIR_CORRIDOR_DOOR_EXIT_TANGENT_NUDGE_M,
  type StairSwitchbackLayout,
} from "./stairWellGeometry.js";
import {
  SHAFT_DOUBLE_DOOR_H,
  SHAFT_DOUBLE_DOOR_W,
  SHAFT_GROUND_DOOR_BAND_M,
  type ShaftGroundDoorOpts,
} from "./stairElevatorShaftConstants.js";
import { normalizeStairDoorVerticalSpan } from "./stairShaftDoorGeometry.js";
import { stairWellOpeningDefForScope } from "./stairWellOpeningHelpers.js";
import type { StairWellAuthoringScope } from "./stairWellEditorIds.js";
import type { CardinalFace } from "./wallWithDoorCutout.js";

export type StairWellGroundDoorContext = {
  towardPlateXZ: readonly [number, number];
  shaftPlateXZ: readonly [number, number];
};

export type ResolvedStairWellGroundDoor = {
  groundDoor: ShaftGroundDoorOpts;
  doorHalfW: number;
  y0Local: number;
  y1Local: number;
  face: CardinalFace;
  tangentOffsetAlongWallM: number;
  widthM: number;
  heightM: number;
  centerYM: number;
};
export function resolveStairWellGroundDoor(args: {
  sx: number;
  sy: number;
  sz: number;
  context?: StairWellGroundDoorContext;
  layout?: StairSwitchbackLayout;
  def?: StairWellDef;
  authoringScope?: StairWellAuthoringScope;
}): ResolvedStairWellGroundDoor | null {
  const { sx, sy, sz, context } = args;
  const scope = args.authoringScope ?? "typical";
  const L =
    args.layout ??
    computeSwitchbackStairLayout(sx, sy, sz, {
      extraBottomTreads: scope === "ground" ? GROUND_STOREY_EXTRA_BOTTOM_TREADS : 0,
    });
  const wt = 0.11;
  const hy = sy * 0.5;
  const innerWallH = Math.max(sy - 2 * wt, 0.08);
  const wallCenterY = (-hy + wt) + innerWallH * 0.5;
  const yWallBottom = wallCenterY - innerWallH * 0.5;
  const bandHeightM = Math.max(0.55, Math.min(SHAFT_GROUND_DOOR_BAND_M, innerWallH));
  const maxDoorHalfW = Math.min(
    Math.max(sx - 2 * wt, 0.05) * 0.5 - 0.06,
    Math.max(sz - 2 * wt, 0.05) * 0.5 - 0.06,
  );
  const maxDoorH = bandHeightM - 0.06;
  const defaultDoorHalfW = THREE.MathUtils.clamp(
    SHAFT_DOUBLE_DOOR_W * 0.5,
    0.325,
    Math.max(0.325, maxDoorHalfW),
  );
  const defaultDoorH = THREE.MathUtils.clamp(
    SHAFT_DOUBLE_DOOR_H,
    0.65,
    Math.max(0.65, maxDoorH),
  );
  const baseYDoor0 = yWallBottom;
  const authored = stairWellOpeningDefForScope(args.def, scope);
  const widthM = THREE.MathUtils.clamp(
    authored?.widthM ?? defaultDoorHalfW * 2,
    0.65,
    Math.max(0.65, maxDoorHalfW * 2),
  );
  const heightM = THREE.MathUtils.clamp(
    authored?.heightM ?? defaultDoorH,
    0.65,
    Math.max(0.65, maxDoorH),
  );
  const doorHalfW = widthM * 0.5;
  const doorH = heightM;
  const baseYDoor1 = baseYDoor0 + doorH;
  const forceTypicalPerpendicularFace = scope === "typical";
  /**
   * Typical storeys keep the primary door on the **façade / exterior** band (south in shaft-local
   * space), not `entryOpening.face`, which often targets the corridor and reads as opening into
   * the hallway. Ground still uses authored openings + placement toward circulation.
   */
  let pickedFace = forceTypicalPerpendicularFace
    ? ("s" as CardinalFace)
    : (authored?.face as CardinalFace | undefined);
  let tangentOffsetAlongWall = authored?.tangentOffsetAlongWallM ?? 0;
  if (!pickedFace && !context) return null;
  if (context && !forceTypicalPerpendicularFace) {
    const picked = pickStairShaftGroundDoorPlacement(L, {
      sx,
      sz,
      wallThickness: wt,
      doorHalfWidthM: doorHalfW,
      doorY0Local: baseYDoor0,
      doorY1Local: baseYDoor1,
      collisionYMaxLocal: yWallBottom + bandHeightM,
      towardX: context.towardPlateXZ[0],
      towardZ: context.towardPlateXZ[1],
      shaftPx: context.shaftPlateXZ[0],
      shaftPz: context.shaftPlateXZ[1],
    });
    pickedFace ??= picked.face;
    /**
     * Undocumented shafts (`def` omitted): tread-hit scoring can pick the façade wall; pin the
     * ground door to the dominant circulation axis from `towardPlateXZ` before tangent snapping
     * (snapping uses the chosen face).
     */
    let towardPinnedFace = false;
    if (scope === "ground" && !args.def) {
      const tw = context.towardPlateXZ[0] - context.shaftPlateXZ[0];
      const tz = context.towardPlateXZ[1] - context.shaftPlateXZ[1];
      const prevFace = pickedFace;
      if (Math.abs(tw) >= Math.abs(tz)) {
        if (tw < -0.25) pickedFace = "w";
        else if (tw > 0.25) pickedFace = "e";
      } else {
        if (tz < -0.25) pickedFace = "s";
        else if (tz > 0.25) pickedFace = "n";
      }
      if (pickedFace !== prevFace) {
        towardPinnedFace = true;
        tangentOffsetAlongWall = 0;
      }
    }
    if (authored?.tangentOffsetAlongWallM == null && !towardPinnedFace) {
      tangentOffsetAlongWall = picked.tangentOffsetM;
      const landing = pickCornerLandingNearDoorBand(
        L,
        picked.face,
        tangentOffsetAlongWall,
        doorHalfW,
        (baseYDoor0 + baseYDoor1) * 0.5,
      );
      if (landing) {
        tangentOffsetAlongWall = snapStairDoorTangentAlongWallToLanding(
          landing,
          picked.face,
          doorHalfW,
          sx,
          sz,
          {
            alignTowardPlateXZ: context.towardPlateXZ,
            shaftPlateXZForAlign: context.shaftPlateXZ,
          },
        );
      }
      tangentOffsetAlongWall = shiftStairDoorTangentViewerRightFromInside(
        picked.face,
        tangentOffsetAlongWall,
        doorHalfW,
        sx,
        sz,
        wt,
      );
      const rightBiasSign = picked.face === "e" || picked.face === "s" ? 1 : -1;
      tangentOffsetAlongWall = clampStairDoorTangentAlongInnerWall(
        picked.face,
        tangentOffsetAlongWall + rightBiasSign * STAIR_CORRIDOR_DOOR_EXIT_TANGENT_NUDGE_M * 0.25,
        doorHalfW,
        sx,
        sz,
        wt,
      );
    }
    if (towardPinnedFace) {
      tangentOffsetAlongWall = clampStairDoorTangentAlongInnerWall(
        pickedFace,
        tangentOffsetAlongWall,
        doorHalfW,
        sx,
        sz,
        wt,
      );
    }
  }
  if (!pickedFace) return null;
  tangentOffsetAlongWall = clampStairDoorTangentAlongInnerWall(
    pickedFace,
    tangentOffsetAlongWall,
    widthM * 0.5,
    sx,
    sz,
    wt,
  );
  const centerMin = yWallBottom + heightM * 0.5;
  const centerMax = yWallBottom + bandHeightM - 0.04 - heightM * 0.5;
  const authoredCenterYM = THREE.MathUtils.clamp(
    authored?.centerYM ?? (baseYDoor0 + baseYDoor1) * 0.5,
    Math.min(centerMin, centerMax),
    Math.max(centerMin, centerMax),
  );
  let yDoor0 = authoredCenterYM - heightM * 0.5;
  let yDoor1 = authoredCenterYM + heightM * 0.5;
  // Stair/corridor thresholds must be floor-flush; otherwise a thin sill strip survives and
  // causes the same rubber-banding bug we previously had on west apartment doors.
  if (yDoor0 > yWallBottom) {
    yDoor1 -= yDoor0 - yWallBottom;
    yDoor0 = yWallBottom;
  }
  const centerYM = (yDoor0 + yDoor1) * 0.5;
  return {
    groundDoor: {
      face: pickedFace,
      bandHeightM: SHAFT_GROUND_DOOR_BAND_M,
      tangentOffsetAlongWall,
      doorWidthM: widthM,
      doorHoleY0Local: yDoor0,
      doorHoleY1Local: yDoor1,
    },
    doorHalfW: widthM * 0.5,
    y0Local: yDoor0,
    y1Local: yDoor1,
    face: pickedFace,
    tangentOffsetAlongWallM: tangentOffsetAlongWall,
    widthM,
    heightM,
    centerYM,
  };
}

export function resolveStairWellSupplementalDoors(args: {
  sx: number;
  sy: number;
  sz: number;
  context?: StairWellGroundDoorContext;
  layout?: StairSwitchbackLayout;
  def?: StairWellDef;
  authoringScope?: StairWellAuthoringScope;
  primaryDoor?: ResolvedStairWellGroundDoor | null;
}): readonly ResolvedStairWellGroundDoor[] {
  const { sx, sy, sz } = args;
  const authored = args.def?.secondaryEntryOpening;
  if (!authored) return [];

  const primaryDoor =
    args.primaryDoor ??
    resolveStairWellGroundDoor({
      sx,
      sy,
      sz,
      context: args.context,
      layout: args.layout,
      def: args.def,
      authoringScope: args.authoringScope,
    });
  if (!primaryDoor) return [];

  const wt = 0.11;
  const hy = sy * 0.5;
  const innerWallH = Math.max(sy - 2 * wt, 0.08);
  const yWallBottom = -hy + wt;
  const maxDoorHalfW = Math.min(
    Math.max(sx - 2 * wt, 0.05) * 0.5 - 0.06,
    Math.max(sz - 2 * wt, 0.05) * 0.5 - 0.06,
  );
  const widthM = THREE.MathUtils.clamp(
    authored.widthM ?? primaryDoor.widthM,
    0.65,
    Math.max(0.65, maxDoorHalfW * 2),
  );
  const face = (authored.face ?? "s") as CardinalFace;
  const tangentOffsetAlongWallM = clampStairDoorTangentAlongInnerWall(
    face,
    authored.tangentOffsetAlongWallM ?? 0,
    widthM * 0.5,
    sx,
    sz,
    wt,
  );
  // Secondary stair openings connect stacked landings, so they must clear the full wall band.
  const { y0, y1 } = normalizeStairDoorVerticalSpan(
    yWallBottom,
    yWallBottom + innerWallH,
    yWallBottom,
    yWallBottom + innerWallH,
  );

  return [
    {
      groundDoor: {
        face,
        bandHeightM: innerWallH,
        tangentOffsetAlongWall: tangentOffsetAlongWallM,
        doorWidthM: widthM,
        doorHoleY0Local: y0,
        doorHoleY1Local: y1,
      },
      doorHalfW: widthM * 0.5,
      y0Local: y0,
      y1Local: y1,
      face,
      tangentOffsetAlongWallM,
      widthM,
      heightM: y1 - y0,
      centerYM: (y0 + y1) * 0.5,
    },
  ];
}

