/**
 * Use the REAL FpCharacterController to sweep a player through each apartment doorway.
 * Reports any door where the character cannot reach a point deep inside the unit when the
 * door is fully open (swing_open_01 = 1.0).
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
  buildCollisionSpatialIndex,
  buildStairOpeningCollisionOverlayForBuilding,
  buildStairRuntimeOverlayForBuilding,
  parseBuildingDoc,
  parseFloorDoc,
  parseStairWellDef,
  resolveFpCharacterCollisions,
  swingDoorOpenSideNormal,
  swingDoorParkedLeafAabb,
  swingDoorTangentRest,
} from "../packages/world/src/index.ts";
const FP_PLAYER_COLLISION_RADIUS_M = 0.22;
const FP_PLAYER_COLLISION_HEIGHT_STAND_M = 1.78;
import type {
  SwingDoorFace,
  CollisionAabb,
} from "../packages/world/src/index.ts";

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

/** Walk the player from `startCorridor` TOWARD `targetInside` using the real character controller.
 *  Returns the final position after N frames of 60 Hz input toward the target. */
function walkToward(
  startX: number,
  startZ: number,
  feetY: number,
  targetX: number,
  targetZ: number,
  staticIdx: ReturnType<typeof buildCollisionSpatialIndex>,
  leafAabb: CollisionAabb,
): { finalX: number; finalZ: number; traveled: number } {
  const speed = 4.0; // m/s walk
  const dt = 1 / 60;
  const pos = { x: startX, y: feetY, z: startZ };
  const vel = { x: 0, y: 0, z: 0 };
  const prev = { x: startX, y: feetY, z: startZ };
  const dynamic = {
    visitAabbsInXZ: (
      x0: number,
      x1: number,
      z0: number,
      z1: number,
      visit: (a: CollisionAabb) => void,
    ): void => {
      if (leafAabb.max[0] < x0 || leafAabb.min[0] > x1) return;
      if (leafAabb.max[2] < z0 || leafAabb.min[2] > z1) return;
      visit(leafAabb);
    },
  };
  let bestDist = Math.hypot(targetX - startX, targetZ - startZ);
  const maxFrames = 240;
  for (let f = 0; f < maxFrames; f++) {
    const dx = targetX - pos.x;
    const dz = targetZ - pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.08) break;
    const ux = dx / len;
    const uz = dz / len;
    prev.x = pos.x;
    prev.z = pos.z;
    vel.x = ux * speed;
    vel.z = uz * speed;
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    resolveFpCharacterCollisions({
      pos,
      prevPos: prev,
      vel,
      bodyHeight: FP_PLAYER_COLLISION_HEIGHT_STAND_M,
      radius: FP_PLAYER_COLLISION_RADIUS_M,
      stepUpMargin: 0.42,
      stepUpProbeM: 0.21,
      staticIndex: staticIdx,
      dynamicSource: dynamic,
      grounded: true,
    });
    const cur = Math.hypot(targetX - pos.x, targetZ - pos.z);
    if (cur < bestDist) bestDist = cur;
  }
  return {
    finalX: pos.x,
    finalZ: pos.z,
    traveled: Math.hypot(pos.x - startX, pos.z - startZ),
  };
}

let reached = 0;
let stuck = 0;
const stuckDoors: string[] = [];
for (let levelIndex = 0; levelIndex < building.floorRefs.length; levelIndex++) {
  const ref = building.floorRefs[levelIndex]!;
  const tpls = templatesByFloorDoc.get(ref.floorDocId) ?? [];
  const floorY = levelIndex * DEFAULT_BUILDING_FLOOR_SPACING_M;
  for (const t of tpls) {
    const face = t.face as SwingDoorFace;
    const feetY = floorY + t.feetYOffset;
    const norm = swingDoorOpenSideNormal(face);
    const tan = swingDoorTangentRest(face);
    const leaf = swingDoorParkedLeafAabb({
      face,
      hingeX: t.hingeX,
      hingeZ: t.hingeZ,
      feetY,
      panelWidthM: t.panelWidthM,
      panelHeightM: t.panelHeightM,
      swingInward: true,
    });
    const staticIdx = buildCollisionSpatialIndex(statics);

    // Try 7 lateral approach positions along the corridor-side of the doorway.
    let anyReached = false;
    const attempts: { lat: number; dotInto: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const lat = t.panelWidthM * (i / 6); // 0..panelW from hinge-end
      // Position: in corridor (1.0m out along -norm), at tangent `lat` past hinge.
      const baseX = t.hingeX + tan.x * lat;
      const baseZ = t.hingeZ + tan.z * lat;
      const startX = baseX - norm.x * 1.0;
      const startZ = baseZ - norm.z * 1.0;
      // Target: deep inside the unit directly opposite start.
      const targetX = baseX + norm.x * 1.5;
      const targetZ = baseZ + norm.z * 1.5;
      const res = walkToward(startX, startZ, feetY + 0.01, targetX, targetZ, staticIdx, leaf);
      const dotInto = (res.finalX - baseX) * norm.x + (res.finalZ - baseZ) * norm.z;
      attempts.push({ lat, dotInto });
      // Success = got at least 1.0m past the wall plane (well inside the unit, past any
      // leaf thickness). "Stuck at threshold" behavior would trap the player at dotInto
      // values < ~0.3, so this tighter threshold catches the user's reported issue.
      if (dotInto > 1.0) anyReached = true;
    }
    if (anyReached) {
      reached++;
    } else {
      stuck++;
      const summary = attempts
        .map((a) => `lat=${a.lat.toFixed(2)}:d=${a.dotInto.toFixed(2)}`)
        .join(" ");
      stuckDoors.push(`${t.templateId} L${levelIndex} face=${face} ${summary}`);
    }
  }
}

console.log(`REAL-CONTROLLER WALKTHROUGH: reached=${reached}  stuck=${stuck}`);
for (const d of stuckDoors.slice(0, 20)) console.log("  STUCK", d);
