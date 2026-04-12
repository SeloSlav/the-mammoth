import * as THREE from "three";
import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import { withoutElevatorsInStairwells } from "./floorCoreSanitize.js";
import { shaftPlanKey } from "./buildingStairShafts.js";
import {
  addElevatorShaftPlaceholder,
  addStairWellPlaceholder,
} from "./stairElevatorPlaceholders.js";
import {
  addDoorFrameTrimConstantX,
  addDoorFrameTrimConstantZ,
  addWallConstantXWithHoles,
  addWallConstantZWithHoles,
  pickFaceTowardPoint,
  type WallHoleXY,
  type WallHoleYZ,
} from "./wallWithDoorCutout.js";
import {
  collectShaftSlabHoles,
  hollowShellXZRectsWithShaftCutouts,
  mergeElevatorShaftSlabHolesFromFloorDocs,
  punchElevatorHolesInShellRects,
  subtractHolesFromRect,
  type RectXZ,
  type ShaftSlabHole,
} from "./shaftPlanformClip.js";
import { FP_OUTDOOR_GROUND_VISUAL_Y } from "./fpOutdoorGroundVisualY.js";

type PlaceholderKind = "corridor" | "unit" | "core" | "misc";

function classifyPrefab(prefabId: string): PlaceholderKind {
  const p = prefabId.toLowerCase();
  if (p.includes("corridor") || p.includes("lobby") || p.includes("hall"))
    return "corridor";
  if (p.includes("apartment") || p.includes("unit")) return "unit";
  if (p.includes("stair") || p.includes("elev") || p.includes("core"))
    return "core";
  return "misc";
}

/** Shared materials so massive generated floors do not allocate thousands of materials. */
const mat = {
  corridorFloor: new THREE.MeshStandardMaterial({
    color: 0xb8a898,
    roughness: 0.9,
    metalness: 0.02,
  }),
  corridorCeil: new THREE.MeshStandardMaterial({
    color: 0xcfc5b8,
    roughness: 0.88,
    metalness: 0.02,
    side: THREE.DoubleSide,
  }),
  corridorWall: new THREE.MeshStandardMaterial({
    color: 0xc2b6a6,
    roughness: 0.9,
    metalness: 0.02,
  }),
  unitFloor: new THREE.MeshStandardMaterial({
    color: 0xa3988c,
    roughness: 0.9,
    metalness: 0.03,
  }),
  unitCeil: new THREE.MeshStandardMaterial({
    color: 0xb5aa9e,
    roughness: 0.88,
    metalness: 0.03,
    side: THREE.DoubleSide,
  }),
  unitWall: new THREE.MeshStandardMaterial({
    color: 0xae9f92,
    roughness: 0.9,
    metalness: 0.03,
  }),
  coreFloor: new THREE.MeshStandardMaterial({
    color: 0x8f8a84,
    roughness: 0.9,
    metalness: 0.06,
  }),
  coreCeil: new THREE.MeshStandardMaterial({
    color: 0x9a9590,
    roughness: 0.88,
    metalness: 0.06,
    side: THREE.DoubleSide,
  }),
  coreWall: new THREE.MeshStandardMaterial({
    color: 0x928d87,
    roughness: 0.9,
    metalness: 0.08,
  }),
  miscFloor: new THREE.MeshStandardMaterial({
    color: 0xa8a098,
    roughness: 0.9,
    metalness: 0.03,
  }),
  miscCeil: new THREE.MeshStandardMaterial({
    color: 0xbab2aa,
    roughness: 0.88,
    metalness: 0.03,
    side: THREE.DoubleSide,
  }),
  miscWall: new THREE.MeshStandardMaterial({
    color: 0xb0a89e,
    roughness: 0.9,
    metalness: 0.03,
  }),
  slab: new THREE.MeshStandardMaterial({
    color: 0x6a6460,
    roughness: 0.93,
    metalness: 0.02,
    side: THREE.DoubleSide,
  }),
  lobbyDoorFrame: new THREE.MeshStandardMaterial({
    color: 0x4d4a48,
    roughness: 0.45,
    metalness: 0.48,
  }),
};

/**
 * Ground storey corridor / lobby: **double-door frame bays** (m clear).
 * Panels/doors are not modeled yet — openings + trim only.
 */
const LOBBY_DOUBLE_DOOR_W = 1.84;
const LOBBY_DOUBLE_DOOR_H = 2.16;
const LOBBY_DOOR_SILL = 0.04;
/** Minimum centre-to-centre spacing so adjacent double frames read as separate bays. */
const LOBBY_DOUBLE_DOOR_BAY_SPACING = LOBBY_DOUBLE_DOOR_W + 0.56;

function matsFor(kind: PlaceholderKind): {
  floor: THREE.MeshStandardMaterial;
  ceil: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
} {
  switch (kind) {
    case "corridor":
      return { floor: mat.corridorFloor, ceil: mat.corridorCeil, wall: mat.corridorWall };
    case "unit":
      return { floor: mat.unitFloor, ceil: mat.unitCeil, wall: mat.unitWall };
    case "core":
      return { floor: mat.coreFloor, ceil: mat.coreCeil, wall: mat.coreWall };
    default:
      return { floor: mat.miscFloor, ceil: mat.miscCeil, wall: mat.miscWall };
  }
}

type HollowShellOpts = {
  shaftHolesPlate: readonly ShaftSlabHole[];
  roomPx: number;
  roomPz: number;
  /** When set (e.g. room has rotation), use solid floor/ceiling plates — cutouts are axis-only. */
  skipShaftCutouts: boolean;
  /** 1-based storey; level 1 gets lobby-style openings on corridor shells. */
  storyLevelIndex?: number;
  /** Elevator-only union (plate-space); second cut on shell floor/ceiling so flanking plates do not cap hoistways. */
  shaftElevatorsMerged?: readonly ShaftSlabHole[];
};

function addShellFloorCeilingPieces(
  group: THREE.Group,
  rects: readonly RectXZ[],
  wt: number,
  hy: number,
  floorM: THREE.MeshStandardMaterial,
  ceilM: THREE.MeshStandardMaterial,
): void {
  let fi = 0;
  let ci = 0;
  for (const r of rects) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) * 0.5;
    const cz = (r.z0 + r.z1) * 0.5;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, wt, d), floorM);
    floor.name = rects.length > 1 ? `shell_floor_${fi}` : "shell_floor";
    fi += 1;
    floor.position.set(cx, -hy + wt * 0.5, cz);
    group.add(floor);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(w, wt, d), ceilM);
    ceiling.name = rects.length > 1 ? `shell_ceiling_${ci}` : "shell_ceiling";
    ci += 1;
    ceiling.position.set(cx, hy - wt * 0.5, cz);
    group.add(ceiling);
  }
}

function lobbyDoorCentersAlong(usableSpan: number): number[] {
  if (usableSpan < LOBBY_DOUBLE_DOOR_W + 0.28) return [0];
  const n = Math.max(
    1,
    Math.min(4, Math.floor(usableSpan / LOBBY_DOUBLE_DOOR_BAY_SPACING)),
  );
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    out.push((t - 0.5) * usableSpan * 0.94);
  }
  return out;
}

/**
 * Hollow shell: floor + ceiling plates (with shaft cutouts when `opts` provided), four thin walls.
 * Same on every storey, including the ground floor perimeter.
 */
function addHollowRoomShell(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  kind: PlaceholderKind,
  opts: HollowShellOpts,
): void {
  const wt = 0.12;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const { floor: floorM, ceil: ceilM, wall: wallM } = matsFor(kind);
  const vh = Math.max(sy - 2 * wt, 0.05);
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const vlenZ = Math.max(sz - 2 * wt, 0.05);

  let rects: RectXZ[] = opts.skipShaftCutouts
    ? [{ x0: -hx, x1: hx, z0: -hz, z1: hz }]
    : hollowShellXZRectsWithShaftCutouts(sx, sz, opts.roomPx, opts.roomPz, opts.shaftHolesPlate);
  if (!opts.skipShaftCutouts && opts.shaftElevatorsMerged?.length) {
    rects = punchElevatorHolesInShellRects(
      rects,
      opts.roomPx,
      opts.roomPz,
      opts.shaftElevatorsMerged,
    );
  }
  addShellFloorCeilingPieces(group, rects, wt, hy, floorM, ceilM);

  const yLo = -vh * 0.5;
  const yHi = vh * 0.5;
  const yDoor0 = yLo + LOBBY_DOOR_SILL;
  const yDoor1 = Math.min(yHi - 0.05, yDoor0 + LOBBY_DOUBLE_DOOR_H);
  const halfDoor = LOBBY_DOUBLE_DOOR_W * 0.5;

  const groundLobby =
    (opts.storyLevelIndex ?? 99) === 1 &&
    kind === "corridor" &&
    !opts.skipShaftCutouts;

  if (!groundLobby) {
    const east = new THREE.Mesh(new THREE.BoxGeometry(wt, vh, vlenZ), wallM);
    east.name = "shell_wall_e";
    east.position.set(hx - wt * 0.5, 0, 0);
    group.add(east);

    const west = new THREE.Mesh(new THREE.BoxGeometry(wt, vh, vlenZ), wallM);
    west.name = "shell_wall_w";
    west.position.set(-hx + wt * 0.5, 0, 0);
    group.add(west);

    const north = new THREE.Mesh(new THREE.BoxGeometry(vlenX, vh, wt), wallM);
    north.name = "shell_wall_n";
    north.position.set(0, 0, hz - wt * 0.5);
    group.add(north);

    const south = new THREE.Mesh(new THREE.BoxGeometry(vlenX, vh, wt), wallM);
    south.name = "shell_wall_s";
    south.position.set(0, 0, -hz + wt * 0.5);
    group.add(south);
    return;
  }

  const usableZ = vlenZ - 0.14;
  const usableX = vlenX - 0.14;
  const czList = lobbyDoorCentersAlong(usableZ);
  const cxList = lobbyDoorCentersAlong(usableX);

  const holesEw: WallHoleYZ[] = czList.map((zc) => ({
    z0: zc - halfDoor,
    z1: zc + halfDoor,
    y0: yDoor0,
    y1: yDoor1,
  }));
  const holesNs: WallHoleXY[] = cxList.map((xc) => ({
    x0: xc - halfDoor,
    x1: xc + halfDoor,
    y0: yDoor0,
    y1: yDoor1,
  }));

  const xE = hx - wt * 0.5;
  const xW = -hx + wt * 0.5;
  const zN = hz - wt * 0.5;
  const zS = -hz + wt * 0.5;
  const zMin = -vlenZ * 0.5;
  const zMax = vlenZ * 0.5;
  const xMin = -vlenX * 0.5;
  const xMax = vlenX * 0.5;

  addWallConstantXWithHoles(
    group,
    wallM,
    xE,
    wt,
    zMin,
    zMax,
    yLo,
    yHi,
    holesEw,
    "shell_wall_e",
  );
  addWallConstantXWithHoles(
    group,
    wallM,
    xW,
    wt,
    zMin,
    zMax,
    yLo,
    yHi,
    holesEw,
    "shell_wall_w",
  );
  addWallConstantZWithHoles(
    group,
    wallM,
    zN,
    wt,
    xMin,
    xMax,
    yLo,
    yHi,
    holesNs,
    "shell_wall_n",
  );
  addWallConstantZWithHoles(
    group,
    wallM,
    zS,
    wt,
    xMin,
    xMax,
    yLo,
    yHi,
    holesNs,
    "shell_wall_s",
  );

  const frameM = mat.lobbyDoorFrame;
  let fi = 0;
  for (const zc of czList) {
    const z0 = zc - halfDoor;
    const z1 = zc + halfDoor;
    addDoorFrameTrimConstantX(
      group,
      frameM,
      hx - wt,
      -1,
      z0,
      z1,
      yDoor0,
      yDoor1,
      `shell_lobby_frame_e_${fi}`,
    );
    addDoorFrameTrimConstantX(
      group,
      frameM,
      -hx + wt,
      1,
      z0,
      z1,
      yDoor0,
      yDoor1,
      `shell_lobby_frame_w_${fi}`,
    );
    fi += 1;
  }
  let fj = 0;
  for (const xc of cxList) {
    const x0 = xc - halfDoor;
    const x1 = xc + halfDoor;
    addDoorFrameTrimConstantZ(
      group,
      frameM,
      hz - wt,
      -1,
      x0,
      x1,
      yDoor0,
      yDoor1,
      `shell_lobby_frame_n_${fj}`,
    );
    addDoorFrameTrimConstantZ(
      group,
      frameM,
      -hz + wt,
      1,
      x0,
      x1,
      yDoor0,
      yDoor1,
      `shell_lobby_frame_s_${fj}`,
    );
    fj += 1;
  }
}

function expandBoxForPlacedObject(
  min: THREE.Vector3,
  max: THREE.Vector3,
  obj: PlacedObject,
): void {
  const [px, py, pz] = obj.position;
  const sx = obj.scale?.[0] ?? 1;
  const sy = obj.scale?.[1] ?? 1;
  const sz = obj.scale?.[2] ?? 1;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  min.x = Math.min(min.x, px - hx);
  min.y = Math.min(min.y, py - hy);
  min.z = Math.min(min.z, pz - hz);
  max.x = Math.max(max.x, px + hx);
  max.y = Math.max(max.y, py + hy);
  max.z = Math.max(max.z, pz + hz);
}

/** Matches {@link addConcreteSlabWithOptionalShaftHoles} call on the ground storey. */
const GROUND_SLAB_MARGIN_XZ = 0.8;
const GROUND_SLAB_THICKNESS_M = 0.16;

/**
 * Solid slab under the holed structural pad so shaft / lobby cutouts do not show the outdoor
 * grass plane (`FP_OUTDOOR_GROUND_VISUAL_Y` in world space). Skipped when the plate sits far
 * above ground (no sensible column to the backdrop plane).
 */
function addGroundFootprintGrassOccluder(
  root: THREE.Group,
  min: THREE.Vector3,
  max: THREE.Vector3,
  plateWorldOriginY: number,
): void {
  const x0 = min.x - GROUND_SLAB_MARGIN_XZ;
  const x1 = max.x + GROUND_SLAB_MARGIN_XZ;
  const z0 = min.z - GROUND_SLAB_MARGIN_XZ;
  const z1 = max.z + GROUND_SLAB_MARGIN_XZ;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) * 0.5;
  const cz = (z0 + z1) * 0.5;

  const yLow = min.y - GROUND_SLAB_THICKNESS_M - 0.006;
  const yHigh =
    FP_OUTDOOR_GROUND_VISUAL_Y + 0.012 - plateWorldOriginY;
  if (yHigh <= yLow + 1e-4) return;

  const h = yHigh - yLow;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.slab);
  mesh.name = "ground_footprint_grass_occluder";
  mesh.position.set(cx, yLow + h * 0.5, cz);
  root.add(mesh);
}

function addConcreteSlabWithOptionalShaftHoles(
  root: THREE.Group,
  min: THREE.Vector3,
  max: THREE.Vector3,
  marginXZ: number,
  thickness: number,
  holes: readonly ShaftSlabHole[],
): void {
  const x0 = min.x - marginXZ;
  const x1 = max.x + marginXZ;
  const z0 = min.z - marginXZ;
  const z1 = max.z + marginXZ;
  const bottom = min.y - thickness * 0.5;
  const slabRect: RectXZ = { x0, x1, z0, z1 };
  let pieces =
    holes.length > 0 ? subtractHolesFromRect(slabRect, holes) : [slabRect];
  if (pieces.length === 0 && holes.length > 0) {
    pieces = subtractHolesFromRect(slabRect, holes, 0.001);
  }
  let i = 0;
  for (const p of pieces) {
    const w = p.x1 - p.x0;
    const d = p.z1 - p.z0;
    const cx = (p.x0 + p.x1) * 0.5;
    const cz = (p.z0 + p.z1) * 0.5;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w, thickness, d),
      mat.slab,
    );
    slab.name = holes.length > 0 ? `floor_slab_piece_${i}` : "floor_slab_placeholder";
    i += 1;
    slab.position.set(cx, bottom, cz);
    root.add(slab);
  }
}

export type BuildFloorMeshesOptions = {
  /**
   * Skip per-plate stair geometry for columns that are drawn once as full-height shafts
   * (`shaftPlanKey` from `obj.position` XZ).
   */
  stairShaftSkipKeys?: ReadonlySet<string>;
  /** 1-based; level 1 enables ground shaft doors + lobby corridor openings. */
  storyLevelIndex?: number;
  /**
   * When stacking plates, union of all shaft/stair holes (plate-space XZ). Passed from
   * {@link instantiateBuildingFloorStack} so upper slabs/shells never cap another storey’s hoistway.
   */
  shaftHolesPlateMerged?: readonly ShaftSlabHole[];
  /** Elevator-only merged holes (plate-space); extra punch on hollow shell floor/ceiling. */
  shaftElevatorsMerged?: readonly ShaftSlabHole[];
  /**
   * World-space Y of this plate’s origin (building `worldOrigin[1]` + storey offset). Used so
   * the ground-storey grass occluder lines up with {@link FP_OUTDOOR_GROUND_VISUAL_Y}.
   */
  plateWorldOriginY?: number;
};

/**
 * Turns each `FloorDoc` volume into a hollow shell (floor + ceiling + four walls).
 */
export function buildFloorMeshes(
  doc: FloorDoc,
  opts?: BuildFloorMeshesOptions,
): THREE.Group {
  const floor = withoutElevatorsInStairwells(doc);
  const root = new THREE.Group();
  root.name = `floor:${floor.id}`;

  const shaftHolesPlate =
    opts?.shaftHolesPlateMerged ?? collectShaftSlabHoles(floor);
  const shaftElevatorsMerged =
    opts?.shaftElevatorsMerged ??
    mergeElevatorShaftSlabHolesFromFloorDocs([floor]);

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  let hasBounds = false;

  let plateCx = 0;
  let plateCz = 0;
  let plateN = 0;
  for (const o of floor.objects) {
    plateCx += o.position[0];
    plateCz += o.position[2];
    plateN += 1;
  }
  if (plateN > 0) {
    plateCx /= plateN;
    plateCz /= plateN;
  }

  const story = opts?.storyLevelIndex ?? 99;
  const groundShaftDoors = story === 1;

  for (const obj of floor.objects) {
    expandBoxForPlacedObject(min, max, obj);
    hasBounds = true;

    const kind = classifyPrefab(obj.prefabId);
    const sx = obj.scale?.[0] ?? 1;
    const sy = obj.scale?.[1] ?? 1;
    const sz = obj.scale?.[2] ?? 1;

    const room = new THREE.Group();
    room.name = obj.id;
    room.position.set(obj.position[0], obj.position[1], obj.position[2]);
    if (obj.rotation)
      room.quaternion.set(
        obj.rotation[0],
        obj.rotation[1],
        obj.rotation[2],
        obj.rotation[3] ?? 1,
      );

    const pid = obj.prefabId.toLowerCase();
    if (pid.includes("elevator")) {
      const doorFace = pickFaceTowardPoint(
        obj.position[0],
        obj.position[2],
        plateCx,
        plateCz,
      );
      /** Pit slab only on ground plate; `99` = legacy default when no `storyLevelIndex` (single-plate). */
      const elevatorPitSlab = story === 1 || story === 99;
      addElevatorShaftPlaceholder(room, sx, sy, sz, {
        groundDoor: groundShaftDoors
          ? { face: doorFace, bandHeightM: sy }
          : null,
        includePitFloor: elevatorPitSlab,
      });
    } else if (pid.includes("stair_well") || pid.includes("stairwell")) {
      const sk = shaftPlanKey(obj.position[0], obj.position[2]);
      if (!opts?.stairShaftSkipKeys?.has(sk)) {
        addStairWellPlaceholder(room, sx, sy, sz, {
          groundDoor: groundShaftDoors
            ? {
                bandHeightM: sy,
                towardPlateXZ: [plateCx, plateCz],
                shaftPlateXZ: [obj.position[0], obj.position[2]],
              }
            : null,
        });
      }
    } else {
      const skipShaftCutouts = Boolean(obj.rotation);
      addHollowRoomShell(room, sx, sy, sz, kind, {
        shaftHolesPlate: shaftHolesPlate,
        roomPx: obj.position[0],
        roomPz: obj.position[2],
        skipShaftCutouts,
        storyLevelIndex: opts?.storyLevelIndex,
        shaftElevatorsMerged,
      });
    }
    root.add(room);
  }

  if (hasBounds) {
    addConcreteSlabWithOptionalShaftHoles(
      root,
      min,
      max,
      GROUND_SLAB_MARGIN_XZ,
      GROUND_SLAB_THICKNESS_M,
      shaftHolesPlate,
    );
    const plateWy = opts?.plateWorldOriginY ?? 0;
    if (story === 1 || story === 99) {
      addGroundFootprintGrassOccluder(root, min, max, plateWy);
    }
  }

  return root;
}
