/**
 * Diagnostic: at each west-face apartment doorway threshold, dump every STATIC collision
 * AABB that overlaps the player capsule footprint. A properly carved wall should have ZERO
 * static overlap inside the doorway opening. Any overlap explains "pushed back / rubber-
 * banding at the threshold" because the player collides with a baked wall segment that
 * was never cut out for the door.
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
import type { SwingDoorFace } from "../packages/world/src/index.ts";

const RADIUS = 0.22;
const HEIGHT = 1.78;

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
const statics = applyStairRuntimeBlockerOverlay(
  applyStairOpeningCollisionOverlay(GENERATED_COLLISION_BLOCKER_AABBS, stairOpeningOverlay),
  stairRuntimeOverlay,
);

const templatesByFloorDoc = new Map(
  APARTMENT_DOOR_TEMPLATES.map((s) => [s.floorDocId, s.templates]),
);

type Blocker = { kind: string; min: readonly number[]; max: readonly number[] };

function dumpBlockers(cx: number, cz: number, feetY: number, radius: number): Blocker[] {
  const x0 = cx - radius;
  const x1 = cx + radius;
  const z0 = cz - radius;
  const z1 = cz + radius;
  // Probe the FULL vertical body plus a small safety margin so floor-pad style
  // low-lying blockers (e.g. a raised doorstep) are visible too.
  const yTop = feetY + HEIGHT + 0.02;
  const yBot = feetY - 0.02;
  const hits: Blocker[] = [];
  for (const a of statics) {
    if (a.max[0] < x0 || a.min[0] > x1) continue;
    if (a.max[2] < z0 || a.min[2] > z1) continue;
    if (a.max[1] < yBot || a.min[1] > yTop) continue;
    hits.push({ kind: "static", min: a.min, max: a.max });
  }
  return hits;
}

type Report = {
  templateId: string;
  level: number;
  face: SwingDoorFace;
  blockersAtMidpoint: number;
  blockersAtHingeApproach: number;
  blockersCorr: number;
  blockersUnit: number;
  blockersSweep: number;
  sampleMid: Blocker[];
};
const reports: Report[] = [];

for (let levelIndex = 0; levelIndex < building.floorRefs.length; levelIndex++) {
  const ref = building.floorRefs[levelIndex]!;
  const tpls = templatesByFloorDoc.get(ref.floorDocId) ?? [];
  const floorY = levelIndex * DEFAULT_BUILDING_FLOOR_SPACING_M;
  for (const t of tpls) {
    const face = t.face as SwingDoorFace;
    const feetY = floorY + t.feetYOffset + 0.05;
    const tan = swingDoorTangentRest(face);
    const norm = swingDoorOpenSideNormal(face);
    // Midpoint of doorway: hinge + tangent*(-panelW/2), standing right AT the wall plane.
    const midX = t.hingeX + tan.x * (t.panelWidthM * 0.5);
    const midZ = t.hingeZ + tan.z * (t.panelWidthM * 0.5);
    const blockersMid = dumpBlockers(midX, midZ, feetY, RADIUS);
    // Hinge-end approach: player near hinge side. Offset 0.4m along tangent from hinge.
    const hingeApproachX = t.hingeX + tan.x * Math.max(RADIUS + 0.05, 0.3);
    const hingeApproachZ = t.hingeZ + tan.z * Math.max(RADIUS + 0.05, 0.3);
    const blockersHinge = dumpBlockers(hingeApproachX, hingeApproachZ, feetY, RADIUS);
    // Corridor approach: player 0.4m OUT into the corridor from the doorway midpoint.
    const corrX = midX - norm.x * 0.4;
    const corrZ = midZ - norm.z * 0.4;
    const blockersCorr = dumpBlockers(corrX, corrZ, feetY, RADIUS);
    // Unit approach: player 0.4m INTO the unit from the doorway midpoint.
    const unitX = midX + norm.x * 0.4;
    const unitZ = midZ + norm.z * 0.4;
    const blockersUnit = dumpBlockers(unitX, unitZ, feetY, RADIUS);
    // Tangent sweep along the threshold. Use an INTERIOR band (no jamb tangency).
    let blockersSweepCount = 0;
    const sweepLats: number[] = [];
    for (let i = 0; i < 7; i++) {
      // Interior band: [radius + 0.08, panelW - radius - 0.08] so the capsule never grazes the jambs.
      const band = Math.max(0.01, t.panelWidthM - 2 * RADIUS - 0.16);
      const lat = RADIUS + 0.08 + (i / 6) * band;
      const sx = t.hingeX + tan.x * lat;
      const sz = t.hingeZ + tan.z * lat;
      if (dumpBlockers(sx, sz, feetY, RADIUS).length > 0) {
        blockersSweepCount++;
        sweepLats.push(lat);
      }
    }
    if (
      blockersMid.length > 0 ||
      blockersHinge.length > 0 ||
      blockersCorr.length > 0 ||
      blockersUnit.length > 0 ||
      blockersSweepCount > 0
    ) {
      reports.push({
        templateId: t.templateId,
        level: levelIndex,
        face,
        blockersAtMidpoint: blockersMid.length,
        blockersAtHingeApproach: blockersHinge.length,
        blockersCorr: blockersCorr.length,
        blockersUnit: blockersUnit.length,
        blockersSweep: blockersSweepCount,
        sampleMid: [...blockersCorr, ...blockersMid, ...blockersUnit].slice(0, 6),
      });
    }
  }
}

console.log(
  `Scanned ${Array.from(templatesByFloorDoc.values()).reduce((acc, ts) => acc + ts.length, 0) * building.floorRefs.length} door/floor pairs.`,
);
console.log(`Doorways with static-blocker overlap: ${reports.length}`);
const byFace: Record<string, number> = {};
for (const r of reports) byFace[r.face] = (byFace[r.face] ?? 0) + 1;
console.log("by face:", byFace);

for (const r of reports.slice(0, 15)) {
  console.log(
    `  ${r.templateId} L${r.level} face=${r.face}  mid=${r.blockersAtMidpoint}  hingeApp=${r.blockersAtHingeApproach}  corrSide=${r.blockersCorr}  unitSide=${r.blockersUnit}  sweep=${r.blockersSweep}/7`,
  );
  for (const b of r.sampleMid) {
    console.log(
      `    aabb x=[${b.min[0].toFixed(2)},${b.max[0].toFixed(2)}] y=[${b.min[1].toFixed(2)},${b.max[1].toFixed(2)}] z=[${b.min[2].toFixed(2)},${b.max[2].toFixed(2)}]`,
    );
  }
}
