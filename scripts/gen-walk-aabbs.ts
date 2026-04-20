/**
 * Emits `apps/server/src/generated_walk_surfaces.rs` plus shard files under
 * `apps/server/src/generated_walk_surfaces/` from authored building + floor JSON.
 * Re-run after changing floors, `worldOrigin`, or walk-surface rules in `@the-mammoth/world`.
 *
 * Each shard is a full `static PART_…` item so `include!` is valid (one item per file).
 *
 * Floor JSON is memoized: the building stack asks for the same `floorDocId` tens of times per
 * run (walk + collision + shaft scans). Parsing once per id avoids redundant work.
 *
 * Slow runs are usually dominated by `buildFpBlockerAABBsForBuilding` (full Three.js stack +
 * co-planar merge over ~10k+ AABBs). Set `GEN_WALK_AABBS_TIMING=1` to print phase timings.
 */
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FloorDoc } from "@the-mammoth/schemas";
import { collisionAabbXZFootprint } from "../packages/world/src/collisionScene.ts";
import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "../packages/world/src/buildingFloorStack.ts";
import { buildFpBlockerAABBsForBuilding } from "../packages/world/src/fpBlockerAABBs.ts";
import { buildUnitExteriorWindowFpBlockerAABBsForBuilding } from "../packages/world/src/unitExteriorWindowBlockers.ts";
import {
  parseBuildingDoc,
  parseFloorDoc,
  parseStairWellDef,
} from "../packages/world/src/worldDocParsers.ts";
import {
  walkSurfaceAabbXZFootprint,
  walkSurfaceAABBsForBuilding,
} from "../packages/world/src/walkSurfaceAABBs.ts";
import {
  computeWorldCollisionSourceFingerprint,
  writeWorldCollisionArtifactsStamp,
} from "./worldCollisionArtifacts.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const sourceFingerprint = computeWorldCollisionSourceFingerprint(root);

function msSince(t0: number): string {
  return `${(performance.now() - t0).toFixed(0)}ms`;
}

const logTiming = process.env.GEN_WALK_AABBS_TIMING === "1";

/** AABB rows per shard — keeps each generated file reviewable. */
const AABBS_PER_SHARD = 500;

const mammoth = JSON.parse(
  readFileSync(join(root, "content/building/mammoth.json"), "utf8"),
) as unknown;
const building = parseBuildingDoc(mammoth);
const stairWellDef = parseStairWellDef(
  JSON.parse(readFileSync(join(root, "content/elevator/stairwell.json"), "utf8")) as unknown,
);
const floorDir = join(root, "content/building/floors");

/** Same floor id is requested many times per storey (shaft merge, walk pass, collision pass). */
const floorDocCache = new Map<string, FloorDoc>();
function getFloorDoc(floorDocId: string) {
  let doc = floorDocCache.get(floorDocId);
  if (!doc) {
    doc = parseFloorDoc(
      JSON.parse(readFileSync(join(floorDir, `${floorDocId}.json`), "utf8")) as unknown,
    );
    floorDocCache.set(floorDocId, doc);
  }
  return doc;
}

const tWalk = performance.now();
const aabbs = walkSurfaceAABBsForBuilding(
  building,
  getFloorDoc,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  { stairWellDef },
);
if (logTiming) {
  console.log(`walkSurfaceAABBsForBuilding: ${msSince(tWalk)} (${floorDocCache.size} floor JSON cached)`);
}

const tSolid = performance.now();
const coreSolidAabbs = buildFpBlockerAABBsForBuilding(building, getFloorDoc, {
  floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M,
  stairWellDef,
  mergeCoplanarPreheat: true,
});
const unitWindowSolidAabbs = buildUnitExteriorWindowFpBlockerAABBsForBuilding(
  building,
  getFloorDoc,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
);
const solidAabbs = [...coreSolidAabbs, ...unitWindowSolidAabbs];
if (logTiming) {
  console.log(`buildFpBlockerAABBsForBuilding (core): ${msSince(tSolid)}`);
}

const lines = aabbs.map(
  (b) =>
    `    ([${b.min.map((n) => n.toFixed(5)).join(", ")}], [${b.max.map((n) => n.toFixed(5)).join(", ")}]),`,
);
const coreSolidLines = coreSolidAabbs.map(
  (b) =>
    `    ([${b.min.map((n) => n.toFixed(5)).join(", ")}], [${b.max.map((n) => n.toFixed(5)).join(", ")}]),`,
);
const unitWindowSolidLines = unitWindowSolidAabbs.map(
  (b) =>
    `    ([${b.min.map((n) => n.toFixed(5)).join(", ")}], [${b.max.map((n) => n.toFixed(5)).join(", ")}]),`,
);

const fp = walkSurfaceAabbXZFootprint(aabbs) ?? {
  minX: 0,
  maxX: 0,
  minZ: 0,
  maxZ: 0,
};
const solidFp = collisionAabbXZFootprint(solidAabbs) ?? {
  minX: 0,
  maxX: 0,
  minZ: 0,
  maxZ: 0,
};

const partsDir = join(root, "apps/server/src/generated_walk_surfaces");
mkdirSync(partsDir, { recursive: true });
for (const name of readdirSync(partsDir)) {
  if (name.startsWith("part_") && name.endsWith(".rs")) unlinkSync(join(partsDir, name));
}
for (const name of readdirSync(partsDir)) {
  if (name.endsWith(".inc")) unlinkSync(join(partsDir, name));
}

const solidsDir = join(root, "apps/server/src/generated_collision_solids");
mkdirSync(solidsDir, { recursive: true });
for (const name of readdirSync(solidsDir)) {
  if (name.startsWith("part_") && name.endsWith(".rs")) unlinkSync(join(solidsDir, name));
}

const unitWindowSolidsDir = join(root, "apps/server/src/generated_unit_window_collision_solids");
mkdirSync(unitWindowSolidsDir, { recursive: true });
for (const name of readdirSync(unitWindowSolidsDir)) {
  if (name.startsWith("part_") && name.endsWith(".rs")) unlinkSync(join(unitWindowSolidsDir, name));
}

function writeShardedAabbModule(opts: {
  dir: string;
  lines: string[];
  partPrefix: string;
  title: string;
  outputFile: string;
  footprint: { minX: number; maxX: number; minZ: number; maxZ: number };
  shardConstName: string;
  footprintPrefix: string;
}) {
  const shardCount = Math.max(1, Math.ceil(opts.lines.length / AABBS_PER_SHARD));
  const partNames: string[] = [];

  for (let s = 0; s < shardCount; s++) {
    const start = s * AABBS_PER_SHARD;
    const chunk = opts.lines.slice(start, start + AABBS_PER_SHARD);
    const idx = String(s).padStart(4, "0");
    const sym = `PART_${idx}`;
    partNames.push(sym);
    const partPath = join(opts.dir, `part_${idx}.rs`);
    const partBody = `// AUTO-GENERATED by scripts/gen-walk-aabbs.ts — ${opts.title} shard ${s + 1}/${shardCount} — do not hand-edit.
static ${sym}: &[([f32; 3], [f32; 3])] = &[
${chunk.join("\n")}
];
`;
    writeFileSync(partPath, partBody, "utf8");
  }

  const includes = Array.from({ length: shardCount }, (_, s) => {
    const idx = String(s).padStart(4, "0");
    return `include!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/${opts.partPrefix}/part_${idx}.rs"));`;
  }).join("\n");
  const shardRefs = partNames.map((n) => `    ${n},`).join("\n");
  const mainRs = `// AUTO-GENERATED by scripts/gen-walk-aabbs.ts — do not hand-edit.
// Re-run from repo root: pnpm content:gen-walk-aabbs

${includes}

#[allow(dead_code)]
pub const ${opts.footprintPrefix}_FOOTPRINT_MIN_X: f32 = ${opts.footprint.minX.toFixed(5)};
#[allow(dead_code)]
pub const ${opts.footprintPrefix}_FOOTPRINT_MAX_X: f32 = ${opts.footprint.maxX.toFixed(5)};
#[allow(dead_code)]
pub const ${opts.footprintPrefix}_FOOTPRINT_MIN_Z: f32 = ${opts.footprint.minZ.toFixed(5)};
#[allow(dead_code)]
pub const ${opts.footprintPrefix}_FOOTPRINT_MAX_Z: f32 = ${opts.footprint.maxZ.toFixed(5)};

/// AABBs split across shard files for reviewability.
pub static ${opts.shardConstName}: &[&[([f32; 3], [f32; 3])]] = &[
${shardRefs}
];
`;
  writeFileSync(join(root, opts.outputFile), mainRs, "utf8");
  return { shardCount };
}

function writeClientCollisionArtifactsTs(opts: {
  walkAabbs: typeof aabbs;
  walkFootprint: { minX: number; maxX: number; minZ: number; maxZ: number };
  coreBlockerAabbs: typeof coreSolidAabbs;
  unitWindowBlockerAabbs: typeof unitWindowSolidAabbs;
  blockerFootprint: { minX: number; maxX: number; minZ: number; maxZ: number };
}) {
  const fmtBox = (b: { min: readonly [number, number, number]; max: readonly [number, number, number] }) =>
    `  { min: [${b.min.map((n) => n.toFixed(5)).join(", ")}], max: [${b.max.map((n) => n.toFixed(5)).join(", ")}] },`;
  const out = `// AUTO-GENERATED by scripts/gen-walk-aabbs.ts — do not hand-edit.
// Re-run from repo root: pnpm content:gen-walk-aabbs

import type { CollisionAabb } from "./collisionScene.js";
import type { WalkSurfaceAabb } from "./walkSurfaceAABBs.js";

export const GENERATED_WALK_SURFACE_AABBS: readonly WalkSurfaceAabb[] = [
${opts.walkAabbs.map(fmtBox).join("\n")}
];

export const GENERATED_WALK_SURFACE_FOOTPRINT = {
  minX: ${opts.walkFootprint.minX.toFixed(5)},
  maxX: ${opts.walkFootprint.maxX.toFixed(5)},
  minZ: ${opts.walkFootprint.minZ.toFixed(5)},
  maxZ: ${opts.walkFootprint.maxZ.toFixed(5)},
} as const;

/** Mesh-harvest + merge only — apply stair overlays to this, then append {@link GENERATED_COLLISION_UNIT_WINDOW_BLOCKER_AABBS}. */
export const GENERATED_COLLISION_CORE_BLOCKER_AABBS: readonly CollisionAabb[] = [
${opts.coreBlockerAabbs.map(fmtBox).join("\n")}
];

/** Unit window seals + sill ledges — append **after** stair opening/runtime overlays (not suppress-culled). */
export const GENERATED_COLLISION_UNIT_WINDOW_BLOCKER_AABBS: readonly CollisionAabb[] = [
${opts.unitWindowBlockerAabbs.map(fmtBox).join("\n")}
];

/** Full static bake (core + windows) before runtime stair overlays — diagnostics / tooling only. */
export const GENERATED_COLLISION_BLOCKER_AABBS: readonly CollisionAabb[] = [
  ...GENERATED_COLLISION_CORE_BLOCKER_AABBS,
  ...GENERATED_COLLISION_UNIT_WINDOW_BLOCKER_AABBS,
];

export const GENERATED_COLLISION_BLOCKER_FOOTPRINT = {
  minX: ${opts.blockerFootprint.minX.toFixed(5)},
  maxX: ${opts.blockerFootprint.maxX.toFixed(5)},
  minZ: ${opts.blockerFootprint.minZ.toFixed(5)},
  maxZ: ${opts.blockerFootprint.maxZ.toFixed(5)},
} as const;
`;
  writeFileSync(join(root, "packages/world/src/generatedCollisionArtifacts.ts"), out, "utf8");
}

const walkOut = writeShardedAabbModule({
  dir: partsDir,
  lines,
  partPrefix: "generated_walk_surfaces",
  title: "walk surfaces",
  outputFile: "apps/server/src/generated_walk_surfaces.rs",
  footprint: fp,
  shardConstName: "WALK_SURFACE_AABB_SHARDS",
  footprintPrefix: "WALK_SURFACE",
});
const solidOut = writeShardedAabbModule({
  dir: solidsDir,
  lines: coreSolidLines,
  partPrefix: "generated_collision_solids",
  title: "collision solids (core mesh harvest)",
  outputFile: "apps/server/src/generated_collision_solids.rs",
  footprint: solidFp,
  shardConstName: "COLLISION_SOLID_AABB_SHARDS",
  footprintPrefix: "COLLISION_SOLID",
});
const unitWindowFp =
  collisionAabbXZFootprint(unitWindowSolidAabbs) ?? {
    minX: 0,
    maxX: 0,
    minZ: 0,
    maxZ: 0,
  };
const unitWindowOut = writeShardedAabbModule({
  dir: unitWindowSolidsDir,
  lines: unitWindowSolidLines,
  partPrefix: "generated_unit_window_collision_solids",
  title: "unit window collision",
  outputFile: "apps/server/src/generated_unit_window_collision_solids.rs",
  footprint: unitWindowFp,
  shardConstName: "UNIT_WINDOW_COLLISION_SOLID_AABB_SHARDS",
  footprintPrefix: "UNIT_WINDOW_COLLISION_SOLID",
});
writeClientCollisionArtifactsTs({
  walkAabbs: aabbs,
  walkFootprint: fp,
  coreBlockerAabbs: coreSolidAabbs,
  unitWindowBlockerAabbs: unitWindowSolidAabbs,
  blockerFootprint: solidFp,
});
writeWorldCollisionArtifactsStamp({
  repoRoot: root,
  sourceFingerprint,
  generatedFiles: [
    "apps/server/src/generated_walk_surfaces.rs",
    "apps/server/src/generated_collision_solids.rs",
    "apps/server/src/generated_unit_window_collision_solids.rs",
    "packages/world/src/generatedCollisionArtifacts.ts",
  ],
});
console.log(
  `Wrote ${aabbs.length} walk / ${coreSolidAabbs.length} core + ${unitWindowSolidAabbs.length} unit-window collision AABBs across ${walkOut.shardCount} + ${solidOut.shardCount} + ${unitWindowOut.shardCount} shards.`,
);
