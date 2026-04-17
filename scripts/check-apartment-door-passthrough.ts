/**
 * Diagnostic: re-harvest the collision AABBs directly from the rendered
 * building mesh and compare against the baked `GENERATED_COLLISION_BLOCKER_AABBS`.
 *
 * If a door opening shows "pushed back" on the client, one of:
 *   a) the baked artifact has an AABB the rendered mesh does NOT produce,
 *   b) the dynamic collision (closed slab / parked leaf) overlaps the hole.
 *
 * We report any baked AABB whose X×Z projection overlaps a door opening by
 * more than a small threshold, even if the re-harvested AABBs do not.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APARTMENT_DOOR_TEMPLATES,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  GENERATED_COLLISION_BLOCKER_AABBS,
  buildFpBlockerAABBsForBuilding,
  parseBuildingDoc,
  parseFloorDoc,
  parseStairWellDef,
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

const reharvested = buildFpBlockerAABBsForBuilding(
  building,
  (id) => parseFloorDoc(JSON.parse(readFileSync(join(floorDir, `${id}.json`), "utf8"))),
  { floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M, stairWellDef },
);

function keyOf(b: Aabb): string {
  const f = (n: number) => n.toFixed(3);
  return `${f(b.min[0])},${f(b.min[1])},${f(b.min[2])}|${f(b.max[0])},${f(b.max[1])},${f(b.max[2])}`;
}

const bakedKeys = new Set(GENERATED_COLLISION_BLOCKER_AABBS.map(keyOf));
const reKeys = new Set(reharvested.map(keyOf));

const bakedOnly: Aabb[] = GENERATED_COLLISION_BLOCKER_AABBS.filter(
  (b) => !reKeys.has(keyOf(b)),
);
const reharvestedOnly: Aabb[] = reharvested.filter(
  (b) => !bakedKeys.has(keyOf(b)),
);

console.log(`Baked blockers: ${GENERATED_COLLISION_BLOCKER_AABBS.length}`);
console.log(`Re-harvested blockers: ${reharvested.length}`);
console.log(`Blockers only in baked (stale leftovers): ${bakedOnly.length}`);
console.log(`Blockers only in re-harvested (missing from bake): ${reharvestedOnly.length}`);

// Now also: for each apartment-door opening, report overlapping blockers
// separately from "baked only" set — those would be the real culprits.
const templatesByFloorDoc = new Map(
  APARTMENT_DOOR_TEMPLATES.map((s) => [s.floorDocId, s.templates]),
);
function overlap(a: Aabb, b: Aabb): boolean {
  return !(
    a.max[0] <= b.min[0] + 1e-4 ||
    a.min[0] >= b.max[0] - 1e-4 ||
    a.max[1] <= b.min[1] + 1e-4 ||
    a.min[1] >= b.max[1] - 1e-4 ||
    a.max[2] <= b.min[2] + 1e-4 ||
    a.min[2] >= b.max[2] - 1e-4
  );
}

type Offender = { templateId: string; face: SwingDoorFace; levelIndex: number; box: Aabb; bakedOverlaps: Aabb[] };
const offenders: Offender[] = [];
for (let levelIndex = 0; levelIndex < building.floorRefs.length; levelIndex++) {
  const ref = building.floorRefs[levelIndex]!;
  const tpls = templatesByFloorDoc.get(ref.floorDocId) ?? [];
  const floorY = levelIndex * DEFAULT_BUILDING_FLOOR_SPACING_M;
  for (const t of tpls) {
    const feetY = floorY + t.feetYOffset;
    const tan = swingDoorTangentRest(t.face as SwingDoorFace);
    const tipX = t.hingeX + tan.x * t.panelWidthM;
    const tipZ = t.hingeZ + tan.z * t.panelWidthM;
    const stripHalf = 0.12;
    const shrink = 0.18;
    const box: Aabb =
      t.face === "w" || t.face === "e"
        ? {
            min: [
              t.hingeX - stripHalf,
              feetY + 0.25,
              Math.min(t.hingeZ, tipZ) + shrink,
            ],
            max: [
              t.hingeX + stripHalf,
              feetY + Math.min(t.panelHeightM, 1.75),
              Math.max(t.hingeZ, tipZ) - shrink,
            ],
          }
        : {
            min: [
              Math.min(t.hingeX, tipX) + shrink,
              feetY + 0.25,
              t.hingeZ - stripHalf,
            ],
            max: [
              Math.max(t.hingeX, tipX) - shrink,
              feetY + Math.min(t.panelHeightM, 1.75),
              t.hingeZ + stripHalf,
            ],
          };
    const hitsBaked = GENERATED_COLLISION_BLOCKER_AABBS.filter((b) => overlap(box, b));
    if (hitsBaked.length > 0) {
      offenders.push({ templateId: t.templateId, face: t.face as SwingDoorFace, levelIndex, box, bakedOverlaps: hitsBaked });
    }
  }
}

console.log(`\nDoors with baked blockers overlapping the carved opening: ${offenders.length}`);
for (const o of offenders.slice(0, 6)) {
  console.log(
    `  [${o.templateId}] L${o.levelIndex} face=${o.face} box min=[${o.box.min.map((n) => n.toFixed(3)).join(", ")}] max=[${o.box.max.map((n) => n.toFixed(3)).join(", ")}]`,
  );
  for (const b of o.bakedOverlaps.slice(0, 3)) {
    console.log(
      `    baked min=[${b.min.map((n) => n.toFixed(3)).join(", ")}] max=[${b.max.map((n) => n.toFixed(3)).join(", ")}]`,
    );
  }
}
