/**
 * Diagnostic including the runtime stair / shaft overlays applied on top of
 * the baked static blockers, so we see what the running client actually uses.
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
  swingDoorOpenSideNormal,
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

const blockers = applyStairRuntimeBlockerOverlay(
  applyStairOpeningCollisionOverlay(GENERATED_COLLISION_BLOCKER_AABBS, stairOpeningOverlay),
  stairRuntimeOverlay,
);
console.log(`Total runtime blockers (after stair overlays): ${blockers.length}`);

const templatesByFloorDoc = new Map(
  APARTMENT_DOOR_TEMPLATES.map((s) => [s.floorDocId, s.templates]),
);
const CAPSULE_RADIUS = 0.32;

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

type Issue = {
  templateId: string;
  face: SwingDoorFace;
  levelIndex: number;
  atD: number;
  cx: number;
  cz: number;
  y: number;
  blockers: Aabb[];
};
const issues: Issue[] = [];
let checked = 0;

for (let levelIndex = 0; levelIndex < building.floorRefs.length; levelIndex++) {
  const ref = building.floorRefs[levelIndex]!;
  const tpls = templatesByFloorDoc.get(ref.floorDocId) ?? [];
  const floorY = levelIndex * DEFAULT_BUILDING_FLOOR_SPACING_M;
  for (const t of tpls) {
    checked += 1;
    const feetY = floorY + t.feetYOffset;
    const norm = swingDoorOpenSideNormal(t.face as SwingDoorFace);
    const tan = swingDoorTangentRest(t.face as SwingDoorFace);
    const tipX = t.hingeX + tan.x * t.panelWidthM;
    const tipZ = t.hingeZ + tan.z * t.panelWidthM;
    const midX = (t.hingeX + tipX) * 0.5;
    const midZ = (t.hingeZ + tipZ) * 0.5;
    const distances = [-1.0, -0.6, -0.3, 0.0, +0.3, +0.6, +1.0];
    for (const d of distances) {
      const cx = midX + norm.x * d;
      const cz = midZ + norm.z * d;
      const cap: Aabb = {
        min: [cx - CAPSULE_RADIUS, feetY + 0.25, cz - CAPSULE_RADIUS],
        max: [cx + CAPSULE_RADIUS, feetY + 1.72, cz + CAPSULE_RADIUS],
      };
      const hits: Aabb[] = [];
      for (const b of blockers) {
        if (overlaps(cap, b)) hits.push(b);
      }
      if (hits.length > 0) {
        issues.push({
          templateId: t.templateId,
          face: t.face as SwingDoorFace,
          levelIndex,
          atD: d,
          cx,
          cz,
          y: feetY,
          blockers: hits,
        });
        break;
      }
    }
  }
}

console.log(`Checked ${checked} door instances with stair/shaft overlays applied.`);
console.log(`Doors with blocker in capsule sweep: ${issues.length}`);
const byFace: Record<string, number> = {};
for (const i of issues) byFace[i.face] = (byFace[i.face] ?? 0) + 1;
console.log("By face:", byFace);

for (const i of issues.slice(0, 8)) {
  console.log(
    `  [${i.templateId}] L${i.levelIndex} face=${i.face} @d=${i.atD} xz=(${i.cx.toFixed(3)}, ${i.cz.toFixed(3)}) feetY=${i.y.toFixed(3)}`,
  );
  for (const b of i.blockers.slice(0, 3)) {
    console.log(
      `    blocker min=[${b.min.map((n) => n.toFixed(3)).join(", ")}] max=[${b.max.map((n) => n.toFixed(3)).join(", ")}]`,
    );
  }
}
