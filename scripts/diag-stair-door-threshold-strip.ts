import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  GENERATED_COLLISION_BLOCKER_AABBS,
  applyStairOpeningCollisionOverlay,
  applyStairRuntimeBlockerOverlay,
  buildStairOpeningCollisionOverlayForBuilding,
  buildStairRuntimeOverlayForBuilding,
  getBuildingStairShaftSpecs,
  parseBuildingDoc,
  parseFloorDoc,
  parseStairWellDef,
} from "../packages/world/src/index.ts";
import { resolveStairWellGroundDoor } from "../packages/world/src/stairElevatorPlaceholders.ts";

type Aabb = { min: readonly [number, number, number]; max: readonly [number, number, number] };

const WT = 0.11;
const BODY_RADIUS = 0.22;

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

const worldOrigin = building.worldOrigin ?? [0, 0, 0];
const sorted = [...building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex);
const specs = getBuildingStairShaftSpecs(
  building,
  getFloorDoc,
  sorted,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
);

const openingOverlay = buildStairOpeningCollisionOverlayForBuilding(
  building,
  getFloorDoc,
  stairWellDef,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
);
const runtimeOverlay = buildStairRuntimeOverlayForBuilding(
  building,
  getFloorDoc,
  stairWellDef,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
);

const stages = {
  baked: GENERATED_COLLISION_BLOCKER_AABBS,
  opened: applyStairOpeningCollisionOverlay(GENERATED_COLLISION_BLOCKER_AABBS, openingOverlay),
  runtime: applyStairRuntimeBlockerOverlay(
    applyStairOpeningCollisionOverlay(GENERATED_COLLISION_BLOCKER_AABBS, openingOverlay),
    runtimeOverlay,
  ),
} satisfies Record<string, readonly Aabb[]>;

function overlapsFootBand(list: readonly Aabb[], cx: number, cz: number, y0: number, y1: number): Aabb[] {
  const x0 = cx - BODY_RADIUS;
  const x1 = cx + BODY_RADIUS;
  const z0 = cz - BODY_RADIUS;
  const z1 = cz + BODY_RADIUS;
  return list.filter(
    (aabb) =>
      !(aabb.max[0] <= x0 || aabb.min[0] >= x1 || aabb.max[2] <= z0 || aabb.min[2] >= z1) &&
      !(aabb.max[1] <= y0 || aabb.min[1] >= y1),
  );
}

for (const spec of specs) {
  for (let i = 0; i < spec.storeyCount; i++) {
    const authoringScope = i === 0 ? "ground" : "typical";
    const resolvedDoor = resolveStairWellGroundDoor({
      sx: spec.sx,
      sy: spec.syPlate,
      sz: spec.sz,
      context: spec.entryDoorContexts[i],
      def: stairWellDef,
      authoringScope,
    });
    if (!resolvedDoor) continue;

    const worldX = worldOrigin[0] + spec.px;
    const worldY =
      worldOrigin[1] + spec.bottomY + DEFAULT_BUILDING_FLOOR_SPACING_M * 0.5 + i * spec.storeySpacing;
    const worldZ = worldOrigin[2] + spec.pz;
    const hx = spec.sx * 0.5;
    const hz = spec.sz * 0.5;
    const hy = spec.syPlate * 0.5;
    const wallBottom = worldY + (-hy + WT);
    const gap = resolvedDoor.y0Local - (-hy + WT);

    let probeX = worldX;
    let probeZ = worldZ;
    if (resolvedDoor.face === "e") {
      probeX = worldX + hx - WT * 0.5;
      probeZ = worldZ + resolvedDoor.tangentOffsetAlongWallM;
    } else if (resolvedDoor.face === "w") {
      probeX = worldX - hx + WT * 0.5;
      probeZ = worldZ + resolvedDoor.tangentOffsetAlongWallM;
    } else if (resolvedDoor.face === "n") {
      probeX = worldX + resolvedDoor.tangentOffsetAlongWallM;
      probeZ = worldZ + hz - WT * 0.5;
    } else {
      probeX = worldX + resolvedDoor.tangentOffsetAlongWallM;
      probeZ = worldZ - hz + WT * 0.5;
    }

    const footBandMin = wallBottom + 0.01;
    const footBandMax = wallBottom + 0.09;
    const bakedHits = overlapsFootBand(stages.baked, probeX, probeZ, footBandMin, footBandMax);
    const openedHits = overlapsFootBand(stages.opened, probeX, probeZ, footBandMin, footBandMax);
    const runtimeHits = overlapsFootBand(stages.runtime, probeX, probeZ, footBandMin, footBandMax);

    if (gap > 0.02 || runtimeHits.length > 0) {
      console.log(
        [
          `${spec.id} storey=${i + 1} scope=${authoringScope} face=${resolvedDoor.face}`,
          `gap=${gap.toFixed(3)}m`,
          `probe=(${probeX.toFixed(3)}, ${probeZ.toFixed(3)})`,
          `hits baked/opened/runtime=${bakedHits.length}/${openedHits.length}/${runtimeHits.length}`,
        ].join(" | "),
      );
      for (const [stageName, hits] of [
        ["baked", bakedHits],
        ["opened", openedHits],
        ["runtime", runtimeHits],
      ] as const) {
        for (const hit of hits.slice(0, 3)) {
          console.log(
            `  ${stageName} aabb x=[${hit.min[0].toFixed(3)},${hit.max[0].toFixed(3)}] y=[${hit.min[1].toFixed(3)},${hit.max[1].toFixed(3)}] z=[${hit.min[2].toFixed(3)},${hit.max[2].toFixed(3)}]`,
          );
        }
      }
    }
  }
}
