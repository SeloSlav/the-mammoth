import type { BuildingDoc, FloorDoc } from "@the-mammoth/schemas";
import type { CollisionAabb } from "./collisionScene.js";
import { resolveFloorDocForLevel, type GetFloorOverrideDoc } from "./resolvedFloorDoc.js";
import { withoutElevatorsInStairwells } from "./floorCoreSanitize.js";
import { exteriorFacesForPlacedObjectInFloor } from "./exteriorFaceExposure.js";
import {
  DEFAULT_EXTERIOR_FACADE_SALT,
  planUnitExteriorWindowsForFace,
  UNIT_SHELL_WALL_THICKNESS_M,
  unitShellFacesForExteriorWindows,
} from "./unitExteriorWindows.js";

/** Sill tangent padding — narrow sills still get foot overlap (see exterior sill branch). */
const WINDOW_SEAL_TANGENT_PAD_M = 0.03;
/**
 * **One** collision box per window opening: still thicker than glass alone, but kept tight so you
 * can stand near the window; bump outward/inward if tunneling reappears.
 */
const WINDOW_IMPENETRABLE_INWARD_M = 0.52;
const WINDOW_IMPENETRABLE_OUTWARD_M = 0.22;
const WINDOW_IMPENETRABLE_Y_PAD_M = 0.1;
const WINDOW_IMPENETRABLE_TANG_PAD_M = 0.06;

/** Outward from shell **outer** face — matches the visible exterior window stool (m). */
const WINDOW_SILL_LEDGE_DEPTH_M = 0.42;
/** Vertical slab under the opening bottom; top is flush with the window sill line (m). */
const WINDOW_SILL_LEDGE_THICKNESS_M = 0.1;
/** Tiny upward lip so walk sampling and the capsule share the same top (m). */
const WINDOW_SILL_TOP_LIP_M = 0.02;
/**
 * Walk-only sill inflation: `stepFpLocomotion` probes start/end XZ each substep with a foot radius;
 * narrow sill AABBs lose overlap while still colliding, so support vanishes and you fall to `FLOOR_Y`.
 */
const WINDOW_SILL_LEDGE_WALK_EXTRA_DEPTH_M = 0.72;
const WINDOW_SILL_LEDGE_WALK_TANGENT_PAD_M = 0.16;
const WINDOW_SILL_WALK_EXTRA_TOP_LIP_M = 0.045;

type UnitWindowAnalyticKind = "interiorSeal" | "exteriorSill";

function isUnitPrefab(prefabId: string): boolean {
  const p = prefabId.toLowerCase();
  return p.includes("apartment") || p.includes("unit");
}

function appendUnitExteriorWindowAnalyticSolids(
  out: CollisionAabb[],
  kind: UnitWindowAnalyticKind,
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  floorSpacingM: number,
  options?: {
    getFloorOverrideDoc?: GetFloorOverrideDoc;
    facadeSalt?: number;
    /** When building exterior sill boxes for **walk** AABBs only — deeper/wider than collision. */
    sillLedgeForWalkSurfaces?: boolean;
  },
): void {
  const sillWalk = kind === "exteriorSill" && Boolean(options?.sillLedgeForWalkSurfaces);
  const sillTangPad = sillWalk ? WINDOW_SILL_LEDGE_WALK_TANGENT_PAD_M : WINDOW_SEAL_TANGENT_PAD_M;
  const sillDepth = sillWalk ? WINDOW_SILL_LEDGE_DEPTH_M + WINDOW_SILL_LEDGE_WALK_EXTRA_DEPTH_M : WINDOW_SILL_LEDGE_DEPTH_M;
  const sillTopLip = sillWalk ? WINDOW_SILL_TOP_LIP_M + WINDOW_SILL_WALK_EXTRA_TOP_LIP_M : WINDOW_SILL_TOP_LIP_M;

  const ox = building.worldOrigin?.[0] ?? 0;
  const oy = building.worldOrigin?.[1] ?? 0;
  const oz = building.worldOrigin?.[2] ?? 0;
  const sorted = [...building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex);
  const resolveDocForRef = (ref: BuildingDoc["floorRefs"][number]) =>
    resolveFloorDocForLevel({
      building,
      ref,
      getFloorDoc,
      getFloorOverrideDoc: options?.getFloorOverrideDoc,
    });

  const salt = options?.facadeSalt ?? DEFAULT_EXTERIOR_FACADE_SALT;

  for (const ref of sorted) {
    const doc = withoutElevatorsInStairwells(resolveDocForRef(ref));
    const plateY = (ref.levelIndex - 1) * floorSpacingM;

    for (const obj of doc.objects) {
      if (!isUnitPrefab(obj.prefabId)) continue;
      if (obj.rotation) continue;

      const sx = obj.scale?.[0] ?? 1;
      const sy = obj.scale?.[1] ?? 1;
      const sz = obj.scale?.[2] ?? 1;
      const hx = sx * 0.5;
      const hz = sz * 0.5;
      const px = obj.position[0];
      const py = obj.position[1];
      const pz = obj.position[2];

      const faces = unitShellFacesForExteriorWindows(exteriorFacesForPlacedObjectInFloor(doc, obj));
      if (faces.length === 0) continue;

      const wt = UNIT_SHELL_WALL_THICKNESS_M;
      const vh = Math.max(sy - 2 * wt, 0.05);
      const vlenX = Math.max(sx - 2 * wt, 0.05);
      const vlenZ = Math.max(sz - 2 * wt, 0.05);
      const yLo = -vh * 0.5;
      const yHi = vh * 0.5;

      const baseWy = oy + plateY + py;

      for (const face of faces) {
        const plan = planUnitExteriorWindowsForFace({
          face,
          vlenX,
          vlenZ,
          yLo,
          yHi,
          facadeSalt: salt,
          storyLevelIndex: ref.levelIndex,
          floorDocId: doc.id,
          placedObjectId: obj.id,
        });
        const holesEw = face === "e" || face === "w" ? plan.holesEw : [];
        const holesNs = face === "n" || face === "s" ? plan.holesNs : [];

        const pushWorld = (lx0: number, lx1: number, ly0: number, ly1: number, lz0: number, lz1: number) => {
          const ax0 = Math.min(lx0, lx1);
          const ax1 = Math.max(lx0, lx1);
          const ay0 = Math.min(ly0, ly1);
          const ay1 = Math.max(ly0, ly1);
          const az0 = Math.min(lz0, lz1);
          const az1 = Math.max(lz0, lz1);
          out.push({
            min: [ox + px + ax0, baseWy + ay0, oz + pz + az0],
            max: [ox + px + ax1, baseWy + ay1, oz + pz + az1],
          });
        };

        if (face === "e") {
          const inner = hx - wt;
          for (const h of holesEw) {
            const tang = kind === "exteriorSill" ? sillTangPad : WINDOW_IMPENETRABLE_TANG_PAD_M;
            const zA = Math.min(h.z0, h.z1) - tang;
            const zB = Math.max(h.z0, h.z1) + tang;
            const yA = Math.min(h.y0, h.y1);
            const yB = Math.max(h.y0, h.y1);
            if (zB - zA < 0.05 || yB - yA < 0.05) continue;
            if (kind === "interiorSeal") {
              const yLo = yA - WINDOW_IMPENETRABLE_Y_PAD_M;
              const yHi = yB + WINDOW_IMPENETRABLE_Y_PAD_M;
              pushWorld(
                inner - WINDOW_IMPENETRABLE_INWARD_M,
                hx + WINDOW_IMPENETRABLE_OUTWARD_M,
                yLo,
                yHi,
                zA,
                zB,
              );
            } else {
              const yBottom = yA;
              pushWorld(
                hx,
                hx + sillDepth,
                yBottom - WINDOW_SILL_LEDGE_THICKNESS_M,
                yBottom + sillTopLip,
                zA,
                zB,
              );
            }
          }
        } else if (face === "w") {
          const inner = -hx + wt;
          for (const h of holesEw) {
            const tang = kind === "exteriorSill" ? sillTangPad : WINDOW_IMPENETRABLE_TANG_PAD_M;
            const zA = Math.min(h.z0, h.z1) - tang;
            const zB = Math.max(h.z0, h.z1) + tang;
            const yA = Math.min(h.y0, h.y1);
            const yB = Math.max(h.y0, h.y1);
            if (zB - zA < 0.05 || yB - yA < 0.05) continue;
            if (kind === "interiorSeal") {
              const yLo = yA - WINDOW_IMPENETRABLE_Y_PAD_M;
              const yHi = yB + WINDOW_IMPENETRABLE_Y_PAD_M;
              pushWorld(
                -hx - WINDOW_IMPENETRABLE_OUTWARD_M,
                inner + WINDOW_IMPENETRABLE_INWARD_M,
                yLo,
                yHi,
                zA,
                zB,
              );
            } else {
              const yBottom = yA;
              pushWorld(
                -hx - sillDepth,
                -hx,
                yBottom - WINDOW_SILL_LEDGE_THICKNESS_M,
                yBottom + sillTopLip,
                zA,
                zB,
              );
            }
          }
        } else if (face === "n") {
          const inner = hz - wt;
          for (const h of holesNs) {
            const tang = kind === "exteriorSill" ? sillTangPad : WINDOW_IMPENETRABLE_TANG_PAD_M;
            const xA = Math.min(h.x0, h.x1) - tang;
            const xB = Math.max(h.x0, h.x1) + tang;
            const yA = Math.min(h.y0, h.y1);
            const yB = Math.max(h.y0, h.y1);
            if (xB - xA < 0.05 || yB - yA < 0.05) continue;
            if (kind === "interiorSeal") {
              const yLo = yA - WINDOW_IMPENETRABLE_Y_PAD_M;
              const yHi = yB + WINDOW_IMPENETRABLE_Y_PAD_M;
              pushWorld(
                xA,
                xB,
                yLo,
                yHi,
                inner - WINDOW_IMPENETRABLE_INWARD_M,
                hz + WINDOW_IMPENETRABLE_OUTWARD_M,
              );
            } else {
              const yBottom = yA;
              pushWorld(
                xA,
                xB,
                yBottom - WINDOW_SILL_LEDGE_THICKNESS_M,
                yBottom + sillTopLip,
                hz,
                hz + sillDepth,
              );
            }
          }
        } else {
          const inner = -hz + wt;
          for (const h of holesNs) {
            const tang = kind === "exteriorSill" ? sillTangPad : WINDOW_IMPENETRABLE_TANG_PAD_M;
            const xA = Math.min(h.x0, h.x1) - tang;
            const xB = Math.max(h.x0, h.x1) + tang;
            const yA = Math.min(h.y0, h.y1);
            const yB = Math.max(h.y0, h.y1);
            if (xB - xA < 0.05 || yB - yA < 0.05) continue;
            if (kind === "interiorSeal") {
              const yLo = yA - WINDOW_IMPENETRABLE_Y_PAD_M;
              const yHi = yB + WINDOW_IMPENETRABLE_Y_PAD_M;
              pushWorld(
                xA,
                xB,
                yLo,
                yHi,
                -hz - WINDOW_IMPENETRABLE_OUTWARD_M,
                inner + WINDOW_IMPENETRABLE_INWARD_M,
              );
            } else {
              const yBottom = yA;
              pushWorld(
                xA,
                xB,
                yBottom - WINDOW_SILL_LEDGE_THICKNESS_M,
                yBottom + sillTopLip,
                -hz - sillDepth,
                -hz,
              );
            }
          }
        }
      }
    }
  }
}

/**
 * **Thick** collision only: one deep/wide/tall AABB per window hole (well into the room and past
 * the façade) so players cannot tunnel or squeeze through; sills stay separate for walk support.
 *
 * Horizontal FP blockers only — no walk surfaces, no mesh edits.
 */
export function buildUnitExteriorWindowSealBlockersForBuilding(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  floorSpacingM: number,
  options?: {
    getFloorOverrideDoc?: GetFloorOverrideDoc;
    facadeSalt?: number;
  },
): CollisionAabb[] {
  const out: CollisionAabb[] = [];
  appendUnitExteriorWindowAnalyticSolids(out, "interiorSeal", building, getFloorDoc, floorSpacingM, options);
  return out;
}

/**
 * Exterior window **stool** ledges: thin horizontal slabs just outside the shell outer face.
 * Cladding is collision-excluded (`mammothNoCollision`); without these, feet miss walk AABBs and
 * locomotion can snap to the exterior walk fallback slab (`WALK_FALLBACK_FLOOR_TOP_Y`).
 *
 * Pass `sillLedgeForWalkSurfaces: true` for **walk** AABBs only — deeper/wider than collision so
 * `sampleWalkGroundTopY` still overlaps the foot rectangle while striding (see `stepFpLocomotion`).
 */
export function buildUnitExteriorWindowSillLedgeAABBsForBuilding(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  floorSpacingM: number,
  options?: {
    getFloorOverrideDoc?: GetFloorOverrideDoc;
    facadeSalt?: number;
    sillLedgeForWalkSurfaces?: boolean;
  },
): CollisionAabb[] {
  const out: CollisionAabb[] = [];
  appendUnitExteriorWindowAnalyticSolids(out, "exteriorSill", building, getFloorDoc, floorSpacingM, options);
  return out;
}
