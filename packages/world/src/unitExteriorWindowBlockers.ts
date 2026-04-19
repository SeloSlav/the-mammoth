import type { BuildingDoc, FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import type { CollisionAabb } from "./collisionScene.js";
import { resolveFloorDocForLevel, type GetFloorOverrideDoc } from "./resolvedFloorDoc.js";
import { withoutElevatorsInStairwells } from "./floorCoreSanitize.js";
import {
  DEFAULT_EXTERIOR_FACADE_SALT,
  planUnitExteriorWindowsForFace,
  UNIT_SHELL_WALL_THICKNESS_M,
} from "./unitExteriorWindows.js";
import type { CardinalFace } from "./wallWithDoorCutout.js";

/**
 * How far the seal slab sits **inside** the apartment from the inner plaster face (m).
 * Must stay ≥ ~0.1 so overlap resolution does not fight a slab thinner than the capsule radius.
 */
const WINDOW_INWARD_SEAL_DEPTH_M = 0.12;
/** Stay slightly short of the inner face so the AABB never protrudes into the exterior void (+X eject). */
const WINDOW_SEAL_INNER_FACE_EPS_M = 0.002;
/** Slight tangent padding so we do not leave hairline gaps at mullion corners. */
const WINDOW_SEAL_TANGENT_PAD_M = 0.03;
const EXTERIOR_FACE_TOL_M = 0.16;

function isUnitPrefab(prefabId: string): boolean {
  const p = prefabId.toLowerCase();
  return p.includes("apartment") || p.includes("unit");
}

function expandPlateBounds(min: [number, number, number], max: [number, number, number], obj: PlacedObject): void {
  const [px, py, pz] = obj.position;
  const sx = obj.scale?.[0] ?? 1;
  const sy = obj.scale?.[1] ?? 1;
  const sz = obj.scale?.[2] ?? 1;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  min[0] = Math.min(min[0], px - hx);
  min[1] = Math.min(min[1], py - hy);
  min[2] = Math.min(min[2], pz - hz);
  max[0] = Math.max(max[0], px + hx);
  max[1] = Math.max(max[1], py + hy);
  max[2] = Math.max(max[2], pz + hz);
}

/**
 * Thin vertical slabs **fully inside** each window opening (they never cross the inner plaster
 * face into the exterior void, so depenetration pushes back into the unit, not outside).
 * Horizontal FP blockers only — no walk surfaces, no mesh edits.
 *
 * Fills holes where holed `shell_wall_*` has no collision and the capsule would otherwise slide out.
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

  const out: CollisionAabb[] = [];
  const salt = options?.facadeSalt ?? DEFAULT_EXTERIOR_FACADE_SALT;

  for (const ref of sorted) {
    const doc = withoutElevatorsInStairwells(resolveDocForRef(ref));
    const plateY = (ref.levelIndex - 1) * floorSpacingM;

    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    let has = false;
    for (const obj of doc.objects) {
      expandPlateBounds(min, max, obj);
      has = true;
    }
    if (!has) continue;

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

      const x0 = px - hx;
      const x1 = px + hx;
      const z0 = pz - hz;
      const z1 = pz + hz;

      const faces: CardinalFace[] = [];
      if (x1 >= max[0] - EXTERIOR_FACE_TOL_M) faces.push("e");
      if (x0 <= min[0] + EXTERIOR_FACE_TOL_M) faces.push("w");
      if (z1 >= max[2] - EXTERIOR_FACE_TOL_M) faces.push("n");
      if (z0 <= min[2] + EXTERIOR_FACE_TOL_M) faces.push("s");
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

        const pushSeal = (lx0: number, lx1: number, ly0: number, ly1: number, lz0: number, lz1: number) => {
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
            const zA = Math.min(h.z0, h.z1) - WINDOW_SEAL_TANGENT_PAD_M;
            const zB = Math.max(h.z0, h.z1) + WINDOW_SEAL_TANGENT_PAD_M;
            const yA = Math.min(h.y0, h.y1);
            const yB = Math.max(h.y0, h.y1);
            if (zB - zA < 0.05 || yB - yA < 0.05) continue;
            // Interior only: x < inner. Deeper x = further into unit (−x direction from opening).
            pushSeal(
              inner - WINDOW_INWARD_SEAL_DEPTH_M,
              inner - WINDOW_SEAL_INNER_FACE_EPS_M,
              yA,
              yB,
              zA,
              zB,
            );
          }
        } else if (face === "w") {
          const inner = -hx + wt;
          for (const h of holesEw) {
            const zA = Math.min(h.z0, h.z1) - WINDOW_SEAL_TANGENT_PAD_M;
            const zB = Math.max(h.z0, h.z1) + WINDOW_SEAL_TANGENT_PAD_M;
            const yA = Math.min(h.y0, h.y1);
            const yB = Math.max(h.y0, h.y1);
            if (zB - zA < 0.05 || yB - yA < 0.05) continue;
            pushSeal(
              inner + WINDOW_SEAL_INNER_FACE_EPS_M,
              inner + WINDOW_INWARD_SEAL_DEPTH_M,
              yA,
              yB,
              zA,
              zB,
            );
          }
        } else if (face === "n") {
          const inner = hz - wt;
          for (const h of holesNs) {
            const xA = Math.min(h.x0, h.x1) - WINDOW_SEAL_TANGENT_PAD_M;
            const xB = Math.max(h.x0, h.x1) + WINDOW_SEAL_TANGENT_PAD_M;
            const yA = Math.min(h.y0, h.y1);
            const yB = Math.max(h.y0, h.y1);
            if (xB - xA < 0.05 || yB - yA < 0.05) continue;
            pushSeal(
              xA,
              xB,
              yA,
              yB,
              inner - WINDOW_INWARD_SEAL_DEPTH_M,
              inner - WINDOW_SEAL_INNER_FACE_EPS_M,
            );
          }
        } else {
          const inner = -hz + wt;
          for (const h of holesNs) {
            const xA = Math.min(h.x0, h.x1) - WINDOW_SEAL_TANGENT_PAD_M;
            const xB = Math.max(h.x0, h.x1) + WINDOW_SEAL_TANGENT_PAD_M;
            const yA = Math.min(h.y0, h.y1);
            const yB = Math.max(h.y0, h.y1);
            if (xB - xA < 0.05 || yB - yA < 0.05) continue;
            pushSeal(
              xA,
              xB,
              yA,
              yB,
              inner + WINDOW_SEAL_INNER_FACE_EPS_M,
              inner + WINDOW_INWARD_SEAL_DEPTH_M,
            );
          }
        }
      }
    }
  }

  return out;
}
