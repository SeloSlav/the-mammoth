/**
 * Diagnostic: simulate a player capsule walking through every apartment door in BOTH the
 * fully-closed state (expect blocked) and the fully-open state (expect passable). Reports
 * every door whose open-state behaviour disagrees with the elevator-door reference.
 *
 * Includes the full runtime collision stack (baked statics + stair opening + stair runtime
 * overlays + per-door dynamic AABB) — i.e. the same set the live client uses.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APARTMENT_DOOR_TEMPLATES,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  GENERATED_COLLISION_BLOCKER_AABBS,
  applyStairOpeningCollisionOverlay,
  applyStairRuntimeBlockerOverlay,
  buildStairOpeningCollisionOverlayForBuilding,
  buildStairRuntimeOverlayForBuilding,
  parseBuildingDoc,
  parseFloorDoc,
  parseStairWellDef,
  swingDoorClosedSlabAabb,
  swingDoorOpenSideNormal,
  swingDoorParkedLeafAabb,
  swingDoorTangentRest,
} from "../packages/world/src/index.ts";
import type { SwingDoorFace } from "../packages/world/src/swingDoorCollision.ts";

type Aabb = { min: readonly [number, number, number]; max: readonly [number, number, number] };

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const building = parseBuildingDoc(
  JSON.parse(readFileSync(join(root, "content/building/mammoth.json"), "utf8")),
);
const stairWellDef = parseStairWellDef(
  JSON.parse(readFileSync(join(root, "content/elevator/stairwell.json"), "utf8")),
);
const floorDir = join(root, "content/building/floors");
const getFloorDoc = (id: string) =>
  parseFloorDoc(JSON.parse(readFileSync(join(floorDir, `${id}.json`), "utf8")));

const stairOpeningOverlay = buildStairOpeningCollisionOverlayForBuilding(
  building,
  getFloorDoc,
  stairWellDef,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
);
const stairRuntimeOverlay = buildStairRuntimeOverlayForBuilding(
  building,
  getFloorDoc,
  stairWellDef,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
);

const baseStatics = applyStairRuntimeBlockerOverlay(
  applyStairOpeningCollisionOverlay(GENERATED_COLLISION_BLOCKER_AABBS, stairOpeningOverlay),
  stairRuntimeOverlay,
);

const templatesByFloorDoc = new Map(
  APARTMENT_DOOR_TEMPLATES.map((s) => [s.floorDocId, s.templates]),
);
const CAPSULE_RADIUS = 0.22; // matches `FP_PLAYER_COLLISION_RADIUS_M`

function overlaps(a: Aabb, b: Aabb): boolean {
  return !(
    a.max[0] <= b.min[0] + 1e-5 ||
    a.min[0] >= b.max[0] - 1e-5 ||
    a.max[1] <= b.min[1] + 1e-5 ||
    a.min[1] >= b.max[1] - 1e-5 ||
    a.max[2] <= b.min[2] + 1e-5 ||
    a.min[2] >= b.max[2] - 1e-5
  );
}

function capsuleAabb(cx: number, cz: number, feetY: number): Aabb {
  return {
    min: [cx - CAPSULE_RADIUS, feetY + 0.25, cz - CAPSULE_RADIUS],
    max: [cx + CAPSULE_RADIUS, feetY + 1.72, cz + CAPSULE_RADIUS],
  };
}

type Outcome = { blocked: boolean; firstD: number };
function sweepThroughDoor(
  blockers: readonly Aabb[],
  midX: number,
  midZ: number,
  norm: { x: number; z: number },
  feetY: number,
): Outcome {
  // Sample distances from corridor side (-1m) all the way to deep inside the unit (+1m).
  const samples = [-1.0, -0.6, -0.3, -0.1, 0.0, 0.1, 0.3, 0.6, 1.0];
  for (const d of samples) {
    const cx = midX + norm.x * d;
    const cz = midZ + norm.z * d;
    const cap = capsuleAabb(cx, cz, feetY);
    for (const b of blockers) {
      if (overlaps(cap, b)) return { blocked: true, firstD: d };
    }
  }
  return { blocked: false, firstD: NaN };
}

/** Walk the capsule from the CORRIDOR to the DOORWAY THRESHOLD for each of 9 lateral offsets
 *  along the wall-tangent axis. With inward-swinging apartment doors the leaf lives inside the
 *  unit, so we check only that corridor approach + doorway traversal is clear — NOT that every
 *  square inch of the unit interior is walkable (the open leaf is a real physical obstacle
 *  inside the unit, same as real-life apartment doors). */
function sweepDoorAcrossWidth(
  blockers: readonly Aabb[],
  hingeX: number,
  hingeZ: number,
  panelW: number,
  norm: { x: number; z: number },
  tan: { x: number; z: number },
  feetY: number,
): { blockedLateralFraction: number } {
  const radius = CAPSULE_RADIUS;
  const N = 9;
  let blockedSamples = 0;
  for (let i = 0; i < N; i++) {
    const t = radius + (i / (N - 1)) * (panelW - 2 * radius);
    const cx0 = hingeX + tan.x * t;
    const cz0 = hingeZ + tan.z * t;
    let hit = false;
    // Corridor side (-norm) → exactly at wall plane. Past the wall plane the player is
    // inside the unit where the open leaf legitimately occupies one corner.
    for (const d of [-0.8, -0.5, -0.3, -0.1, 0.0]) {
      const cx = cx0 + norm.x * d;
      const cz = cz0 + norm.z * d;
      const cap = capsuleAabb(cx, cz, feetY);
      for (const b of blockers) {
        if (overlaps(cap, b)) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }
    if (hit) blockedSamples++;
  }
  return { blockedLateralFraction: blockedSamples / N };
}

let closedBlocked = 0;
let closedPassable = 0;
let openBlocked = 0;
let openPassable = 0;
const surprises: { kind: string; templateId: string; level: number; face: string; firstD: number }[] = [];

for (let levelIndex = 0; levelIndex < building.floorRefs.length; levelIndex++) {
  const ref = building.floorRefs[levelIndex]!;
  const tpls = templatesByFloorDoc.get(ref.floorDocId) ?? [];
  const floorY = levelIndex * DEFAULT_BUILDING_FLOOR_SPACING_M;
  for (const t of tpls) {
    const face = t.face as SwingDoorFace;
    const feetY = floorY + t.feetYOffset;
    const norm = swingDoorOpenSideNormal(face);
    const tan = swingDoorTangentRest(face);
    const tipX = t.hingeX + tan.x * t.panelWidthM;
    const tipZ = t.hingeZ + tan.z * t.panelWidthM;
    const midX = (t.hingeX + tipX) * 0.5;
    const midZ = (t.hingeZ + tipZ) * 0.5;
    const slab = swingDoorClosedSlabAabb({
      face,
      hingeX: t.hingeX,
      hingeZ: t.hingeZ,
      feetY,
      panelWidthM: t.panelWidthM,
      panelHeightM: t.panelHeightM,
    });
    const leaf = swingDoorParkedLeafAabb({
      face,
      hingeX: t.hingeX,
      hingeZ: t.hingeZ,
      feetY,
      panelWidthM: t.panelWidthM,
      panelHeightM: t.panelHeightM,
      swingInward: true, // apartment doors swing inward
    });
    const closedSet = [...baseStatics, slab];
    const openSet = [...baseStatics, leaf];
    const closed = sweepThroughDoor(closedSet, midX, midZ, norm, feetY);
    const open = sweepThroughDoor(openSet, midX, midZ, norm, feetY);
    if (closed.blocked) closedBlocked++; else closedPassable++;
    if (open.blocked) openBlocked++; else openPassable++;

    if (!closed.blocked) {
      surprises.push({ kind: "closed-passable", templateId: t.templateId, level: levelIndex, face, firstD: closed.firstD });
    }
    if (open.blocked) {
      surprises.push({ kind: "open-blocked", templateId: t.templateId, level: levelIndex, face, firstD: open.firstD });
    }

    // Stricter check: straight-line corridor approach must be clear for at least 70% of the
    // doorway width. The hinge-adjacent portion sometimes overlaps the open leaf's thickness
    // (real physical interaction) and the REAL character controller slides around it — see
    // `sim-apartment-door-walkthrough.ts` for the full capsule+slide simulation (source of
    // truth). A blocked fraction above ~22% means something structural is wrong.
    const widthSweep = sweepDoorAcrossWidth(
      openSet,
      t.hingeX,
      t.hingeZ,
      t.panelWidthM,
      norm,
      tan,
      feetY,
    );
    if (widthSweep.blockedLateralFraction > 0.3) {
      surprises.push({
        kind: `open-blocked-at-${(widthSweep.blockedLateralFraction * 100).toFixed(0)}%-of-width`,
        templateId: t.templateId,
        level: levelIndex,
        face,
        firstD: NaN,
      });
    }
  }
}

console.log(`closed: blocked=${closedBlocked}  passable=${closedPassable}`);
console.log(`open  : blocked=${openBlocked}  passable=${openPassable}`);
console.log(`surprises (these violate the open/closed contract): ${surprises.length}`);
const byFace: Record<string, Record<string, number>> = {};
for (const s of surprises) {
  byFace[s.face] = byFace[s.face] ?? {};
  byFace[s.face][s.kind] = (byFace[s.face][s.kind] ?? 0) + 1;
}
console.log("by face:", JSON.stringify(byFace, null, 2));
for (const s of surprises.slice(0, 10)) {
  console.log(`  ${s.kind} face=${s.face} template=${s.templateId} L${s.level} firstD=${s.firstD}`);
}
