import * as THREE from "three";
import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import { withoutElevatorsInStairwells } from "./floorCoreSanitize.js";
import {
  shaftPlanKey,
  STOREY_SPACING_M,
  type BuildingStairShaftSpec,
} from "./buildingStairShafts.js";
import {
  addElevatorShaftPlaceholder,
  addStairWellPlaceholder,
  computeStairDoorSnapForPlaceholder,
  elevatorGroundDoorOpeningLocals,
  resolveStairGroundDoorCutoutMeta,
  SHAFT_DOUBLE_DOOR_H,
  stairShaftDoorTangentSpanShaftLocal,
} from "./stairElevatorPlaceholders.js";
import { pickCornerLandingNearDoorBand } from "./stairWellGeometry.js";
import {
  addDoorFrameTrimConstantX,
  addDoorFrameTrimConstantZ,
  addWallConstantXWithHoles,
  addWallConstantZWithHoles,
  type CardinalFace,
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
import {
  corridorFlushGapForShaftDoor,
  elevatorDoorFaceFromFloorCorridors,
  firstCorridorOrLobbyFromFloor,
} from "./shaftCorridorFlush.js";

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

/**
 * Shared materials so massive generated floors do not allocate thousands of materials.
 * Palette: matte off-white / cast-in-place concrete (mass-panel housing), not warm plaster beige.
 */
const mat = {
  corridorFloor: new THREE.MeshStandardMaterial({
    color: 0xc4c1bc,
    roughness: 0.93,
    metalness: 0.02,
  }),
  corridorCeil: new THREE.MeshStandardMaterial({
    color: 0xe6e4e0,
    roughness: 0.9,
    metalness: 0.02,
    side: THREE.DoubleSide,
  }),
  corridorWall: new THREE.MeshStandardMaterial({
    color: 0xeae8e4,
    roughness: 0.96,
    metalness: 0.015,
  }),
  unitFloor: new THREE.MeshStandardMaterial({
    color: 0xb9b6b1,
    roughness: 0.93,
    metalness: 0.025,
  }),
  unitCeil: new THREE.MeshStandardMaterial({
    color: 0xe4e2de,
    roughness: 0.9,
    metalness: 0.025,
    side: THREE.DoubleSide,
  }),
  unitWall: new THREE.MeshStandardMaterial({
    color: 0xe6e4e0,
    roughness: 0.96,
    metalness: 0.02,
  }),
  coreFloor: new THREE.MeshStandardMaterial({
    color: 0xaeaba8,
    roughness: 0.93,
    metalness: 0.04,
  }),
  coreCeil: new THREE.MeshStandardMaterial({
    color: 0xdad8d4,
    roughness: 0.9,
    metalness: 0.04,
    side: THREE.DoubleSide,
  }),
  coreWall: new THREE.MeshStandardMaterial({
    color: 0xdad8d4,
    roughness: 0.96,
    metalness: 0.03,
  }),
  miscFloor: new THREE.MeshStandardMaterial({
    color: 0xbfbcb7,
    roughness: 0.93,
    metalness: 0.025,
  }),
  miscCeil: new THREE.MeshStandardMaterial({
    color: 0xe2e0dc,
    roughness: 0.9,
    metalness: 0.025,
    side: THREE.DoubleSide,
  }),
  miscWall: new THREE.MeshStandardMaterial({
    color: 0xe4e2de,
    roughness: 0.96,
    metalness: 0.02,
  }),
  slab: new THREE.MeshStandardMaterial({
    color: 0xa5a29e,
    roughness: 0.95,
    metalness: 0.02,
    side: THREE.DoubleSide,
  }),
  lobbyDoorFrame: new THREE.MeshStandardMaterial({
    color: 0x5a5856,
    roughness: 0.5,
    metalness: 0.42,
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

/** Room-local holes on corridor perimeter walls (aligned with adjacent stair / elevator doors). */
type CorridorShellWallHoles = {
  e: WallHoleYZ[];
  w: WallHoleYZ[];
  n: WallHoleXY[];
  s: WallHoleXY[];
};

/** Room-local data to place a sign above an elevator door on a corridor wall. */
type ElevatorCorridorSignPlacement = {
  corridorWall: CardinalFace;
  /** Top of door opening (room-local Y). */
  yDoorTop: number;
  zMid: number;
  xMid: number;
};

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
  /** Cuts through corridor walls opposite stair doors (room-local coordinates). */
  corridorWallHoles?: CorridorShellWallHoles;
  /** Elevator door heads on this corridor shell — room-local; used for manufacturer signage. */
  elevatorSignPlacements?: readonly ElevatorCorridorSignPlacement[];
};

type PlateStairCorridorDoorPunch = {
  /** Door wall on the stair/elevator shaft (same convention as {@link addShaftShell}). */
  stairFace: CardinalFace;
  tangentLocal: number;
  doorHalfW: number;
  y0Local: number;
  y1Local: number;
  spx: number;
  spz: number;
  spy: number;
  shx: number;
  shz: number;
  /**
   * Mega stacked shaft: door band Y in **floor-doc / plate layout space** (same axis as
   * `corridor.position[1]`). When set, overrides `spy + y*Local` so holes match
   * {@link addBuildingStairShaftColumnsToRoot}.
   */
  yDoorPlateFrame0?: number;
  yDoorPlateFrame1?: number;
  /** When true, a manufacturer sign is placed on the adjacent corridor wall above this door. */
  isElevator?: boolean;
};

const STAIR_CORRIDOR_TOUCH_M = 0.55;

function isStairWellPrefabId(prefabId: string): boolean {
  const p = prefabId.toLowerCase();
  return p.includes("stair_well") || p.includes("stairwell");
}

/**
 * Corridor punch aligned with the full-height stair column for this storey (not per-plate `sy`).
 */
function buildMegaStairCorridorDoorPunchForPlate(
  spec: BuildingStairShaftSpec,
  sortedRefs: readonly { levelIndex: number; floorDocId: string }[],
  getFloorDoc: (floorDocId: string) => FloorDoc,
  spacing: number,
  levelIndex: number,
  plateCx: number,
  plateCz: number,
): PlateStairCorridorDoorPunch | undefined {
  const ref = sortedRefs.find((r) => r.levelIndex === levelIndex);
  if (!ref) return undefined;
  const doc = getFloorDoc(ref.floorDocId);
  const stair = doc.objects.find(
    (o) =>
      isStairWellPrefabId(o.prefabId) &&
      shaftPlanKey(o.position[0], o.position[2]) === spec.planKey,
  );
  if (!stair) return undefined;

  const climbFull = spec.megaSy > STOREY_SPACING_M * 1.25;
  const layoutOpts = { climbFullShaft: climbFull };
  const groundDoor = {
    bandHeightM: spec.megaSy,
    towardPlateXZ: [plateCx, plateCz] as const,
    shaftPlateXZ: [spec.px, spec.pz] as const,
  };
  const meta = resolveStairGroundDoorCutoutMeta(
    spec.sx,
    spec.megaSy,
    spec.sz,
    groundDoor,
    layoutOpts,
  );
  const plateY = (ref.levelIndex - 1) * spacing;
  const targetY = plateY + stair.position[1] - spec.centerY;
  const land = pickCornerLandingNearDoorBand(
    meta.L,
    meta.face,
    meta.tangentOffsetAlongWall,
    meta.doorHalfW,
    targetY,
  );
  const mid = land ? land.y : targetY;
  const halfOpen = SHAFT_DOUBLE_DOOR_H * 0.5 + 0.12;
  const bandY0 = mid - halfOpen;
  const bandY1 = mid + halfOpen;

  const wt = 0.11;
  const hy = spec.megaSy * 0.5;
  const innerWallH = Math.max(spec.megaSy - 2 * wt, 0.08);
  const wallCenterY = (-hy + wt) + innerWallH * 0.5;
  const yWB = wallCenterY - innerWallH * 0.5;
  const yWT = wallCenterY + innerWallH * 0.5;
  const y0c = Math.max(yWB + 0.03, Math.min(bandY0, bandY1));
  const y1c = Math.min(yWT - 0.04, Math.max(bandY0, bandY1));

  const plateOffsetY = (levelIndex - 1) * spacing;
  const yDoorPlateFrame0 = spec.centerY - plateOffsetY + y0c;
  const yDoorPlateFrame1 = spec.centerY - plateOffsetY + y1c;

  return {
    stairFace: meta.face,
    tangentLocal: meta.tangentOffsetAlongWall,
    doorHalfW: meta.doorHalfW,
    y0Local: meta.yDoor0,
    y1Local: meta.yHoleTop,
    spx: spec.px,
    spz: spec.pz,
    spy: stair.position[1],
    shx: spec.sx * 0.5,
    shz: spec.sz * 0.5,
    yDoorPlateFrame0,
    yDoorPlateFrame1,
  };
}

function corridorWallReceivingStairDoor(stairFace: CardinalFace): CardinalFace {
  switch (stairFace) {
    case "e":
      return "w";
    case "w":
      return "e";
    case "n":
      return "s";
    case "s":
      return "n";
  }
}

type CorridorShaftDoorContact = {
  punch: PlateStairCorridorDoorPunch;
  corridorWall: CardinalFace;
  y0r: number;
  y1r: number;
  z0r: number;
  z1r: number;
  x0r: number;
  x1r: number;
  holeAlongZ: boolean;
};

function resolveCorridorShaftDoorContacts(
  corridor: PlacedObject,
  sx: number,
  sy: number,
  sz: number,
  kind: PlaceholderKind,
  punches: readonly PlateStairCorridorDoorPunch[],
): CorridorShaftDoorContact[] {
  if (kind !== "corridor" || punches.length === 0) return [];

  const cpx = corridor.position[0];
  const cpz = corridor.position[2];
  const cpy = corridor.position[1];
  const chx = sx * 0.5;
  const chz = sz * 0.5;
  /** Match stair/elevator shaft shells (`addShaftShell`) so corridor holes share the same sill and tangent span. */
  const wt = 0.11;
  const vh = Math.max(sy - 2 * wt, 0.05);
  const yLo = -vh * 0.5;
  const yHi = vh * 0.5;
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const zMin = -vlenZ * 0.5;
  const zMax = vlenZ * 0.5;
  const xMin = -vlenX * 0.5;
  const xMax = vlenX * 0.5;

  const contacts: CorridorShaftDoorContact[] = [];

  for (const p of punches) {
    const cw = corridorWallReceivingStairDoor(p.stairFace);
    const { spx, spz, spy, shx, shz, stairFace } = p;
    const sxShaft = 2 * shx;
    const szShaft = 2 * shz;
    const span = stairShaftDoorTangentSpanShaftLocal(
      sxShaft,
      szShaft,
      stairFace,
      p.tangentLocal,
      p.doorHalfW,
    );
    let z0p: number;
    let z1p: number;
    let x0p: number;
    let x1p: number;
    if (stairFace === "e" || stairFace === "w") {
      const s = span as { z0: number; z1: number };
      z0p = spz + s.z0;
      z1p = spz + s.z1;
      x0p = spx + p.tangentLocal - p.doorHalfW;
      x1p = spx + p.tangentLocal + p.doorHalfW;
    } else {
      const s = span as { x0: number; x1: number };
      x0p = spx + s.x0;
      x1p = spx + s.x1;
      z0p = spz + p.tangentLocal - p.doorHalfW;
      z1p = spz + p.tangentLocal + p.doorHalfW;
    }

    let adjacent = false;
    if (stairFace === "e") {
      adjacent =
        Math.abs(cpx - chx - (spx + shx)) < STAIR_CORRIDOR_TOUCH_M && cpx > spx - 0.02;
    } else if (stairFace === "w") {
      adjacent =
        Math.abs(cpx + chx - (spx - shx)) < STAIR_CORRIDOR_TOUCH_M && cpx < spx + 0.02;
    } else if (stairFace === "n") {
      adjacent =
        Math.abs(cpz - chz - (spz + shz)) < STAIR_CORRIDOR_TOUCH_M && cpz > spz - 0.02;
    } else {
      adjacent =
        Math.abs(cpz + chz - (spz - shz)) < STAIR_CORRIDOR_TOUCH_M && cpz < spz + 0.02;
    }
    if (!adjacent) continue;

    const overlap =
      stairFace === "e" || stairFace === "w"
        ? Math.min(cpz + chz, z1p) - Math.max(cpz - chz, z0p)
        : Math.min(cpx + chx, x1p) - Math.max(cpx - chx, x0p);
    if (overlap < 0.14) continue;

    let y0r: number;
    let y1r: number;
    if (
      p.yDoorPlateFrame0 != null &&
      p.yDoorPlateFrame1 != null &&
      Number.isFinite(p.yDoorPlateFrame0) &&
      Number.isFinite(p.yDoorPlateFrame1)
    ) {
      const y0w =
        Math.min(p.yDoorPlateFrame0, p.yDoorPlateFrame1) - cpy;
      const y1w =
        Math.max(p.yDoorPlateFrame0, p.yDoorPlateFrame1) - cpy;
      y0r = Math.min(y0w, y1w);
      y1r = Math.max(y0w, y1w);
    } else {
      const ya = Math.min(p.y0Local, p.y1Local);
      const yb = Math.max(p.y0Local, p.y1Local);
      /** Stair door Y is shaft-interior local; convert to corridor room-local Y (same as lobby holes). */
      const y0w = spy + ya - cpy;
      const y1w = spy + yb - cpy;
      y0r = Math.min(y0w, y1w);
      y1r = Math.max(y0w, y1w);
    }
    /** Light clamp only — avoid lifting the sill above the stair opening (was yLo+0.04 and caused a lip). */
    y0r = Math.max(yLo + 0.008, y0r);
    y1r = Math.min(yHi - 0.008, y1r);

    if (cw === "e" || cw === "w") {
      const z0r = Math.max(zMin, Math.min(z0p, z1p) - cpz);
      const z1r = Math.min(zMax, Math.max(z0p, z1p) - cpz);
      if (z1r < z0r + 0.1 || y1r < y0r + 0.45) continue;
      contacts.push({
        punch: p,
        corridorWall: cw,
        y0r,
        y1r,
        z0r,
        z1r,
        x0r: 0,
        x1r: 0,
        holeAlongZ: true,
      });
    } else {
      const x0r = Math.max(xMin, Math.min(x0p, x1p) - cpx);
      const x1r = Math.min(xMax, Math.max(x0p, x1p) - cpx);
      if (x1r < x0r + 0.1 || y1r < y0r + 0.45) continue;
      contacts.push({
        punch: p,
        corridorWall: cw,
        y0r,
        y1r,
        z0r: 0,
        z1r: 0,
        x0r,
        x1r,
        holeAlongZ: false,
      });
    }
  }

  return contacts;
}

function corridorShellHolesFromStairPunches(
  corridor: PlacedObject,
  sx: number,
  sy: number,
  sz: number,
  kind: PlaceholderKind,
  punches: readonly PlateStairCorridorDoorPunch[],
): CorridorShellWallHoles | undefined {
  const contacts = resolveCorridorShaftDoorContacts(
    corridor,
    sx,
    sy,
    sz,
    kind,
    punches,
  );
  if (contacts.length === 0) return undefined;

  const out: CorridorShellWallHoles = { e: [], w: [], n: [], s: [] };
  for (const c of contacts) {
    const cw = c.corridorWall;
    if (c.holeAlongZ) {
      (out[cw] as WallHoleYZ[]).push({
        z0: c.z0r,
        z1: c.z1r,
        y0: c.y0r,
        y1: c.y1r,
      });
    } else {
      (out[cw] as WallHoleXY[]).push({
        x0: c.x0r,
        x1: c.x1r,
        y0: c.y0r,
        y1: c.y1r,
      });
    }
  }

  return out;
}

function elevatorCorridorSignPlacementsFromPunches(
  corridor: PlacedObject,
  sx: number,
  sy: number,
  sz: number,
  elevatorPunches: readonly PlateStairCorridorDoorPunch[],
): ElevatorCorridorSignPlacement[] {
  const contacts = resolveCorridorShaftDoorContacts(
    corridor,
    sx,
    sy,
    sz,
    "corridor",
    elevatorPunches,
  );
  const out: ElevatorCorridorSignPlacement[] = [];
  for (const c of contacts) {
    if (!c.punch.isElevator) continue;
    out.push({
      corridorWall: c.corridorWall,
      yDoorTop: Math.max(c.y0r, c.y1r),
      zMid: (c.z0r + c.z1r) * 0.5,
      xMid: (c.x0r + c.x1r) * 0.5,
    });
  }
  return out;
}

const KONCAR_SIGN_W = 1.32;
const KONCAR_SIGN_H = 0.24;
const KONCAR_SIGN_TEXT = "KONČAR 300kg 4 👤";

function createKoncarElevatorSignMaterial(): THREE.MeshBasicMaterial | null {
  let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = 896;
    c.height = 176;
    canvas = c;
  } else if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(896, 176);
  }
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx || !("fillRect" in ctx)) return null;

  ctx.fillStyle = "#f2f0ec";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#2a2826";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.fillStyle = "#1a1918";
  ctx.font =
    '600 52px system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(KONCAR_SIGN_TEXT, canvas.width * 0.5, canvas.height * 0.5);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

function addKoncarElevatorSignMeshes(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  placements: readonly ElevatorCorridorSignPlacement[],
): void {
  if (placements.length === 0) return;
  const mat = createKoncarElevatorSignMaterial();
  if (!mat) return;

  const wt = 0.11;
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  const geo = new THREE.PlaneGeometry(KONCAR_SIGN_W, KONCAR_SIGN_H);
  const inset = 0.014;
  const lookDepth = 2.5;

  let i = 0;
  for (const pl of placements) {
    const y = pl.yDoorTop + 0.07 + KONCAR_SIGN_H * 0.5;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `elevator_sign_koncar_${i++}`;

    if (pl.corridorWall === "e") {
      const x = hx - wt - inset;
      mesh.position.set(x, y, pl.zMid);
      mesh.lookAt(x - lookDepth, y, pl.zMid);
    } else if (pl.corridorWall === "w") {
      const x = -hx + wt + inset;
      mesh.position.set(x, y, pl.zMid);
      mesh.lookAt(x + lookDepth, y, pl.zMid);
    } else if (pl.corridorWall === "n") {
      const z = hz - wt - inset;
      mesh.position.set(pl.xMid, y, z);
      mesh.lookAt(pl.xMid, y, z - lookDepth);
    } else {
      const z = -hz + wt + inset;
      mesh.position.set(pl.xMid, y, z);
      mesh.lookAt(pl.xMid, y, z + lookDepth);
    }
    group.add(mesh);
  }
}

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
  /** Match shaft placeholder shells so adjacent stair/elev doors meet flush (was 0.12 vs 0.11). */
  const wt = 0.11;
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

  const cw = opts.corridorWallHoles;
  const stairHoleCount =
    (cw?.e?.length ?? 0) +
    (cw?.w?.length ?? 0) +
    (cw?.n?.length ?? 0) +
    (cw?.s?.length ?? 0);

  if (!groundLobby) {
    if (stairHoleCount === 0) {
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

    const zMin = -vlenZ * 0.5;
    const zMax = vlenZ * 0.5;
    const xMin = -vlenX * 0.5;
    const xMax = vlenX * 0.5;
    const xE = hx - wt * 0.5;
    const xW = -hx + wt * 0.5;
    const zN = hz - wt * 0.5;
    const zS = -hz + wt * 0.5;

    addWallConstantXWithHoles(
      group,
      wallM,
      xE,
      wt,
      zMin,
      zMax,
      yLo,
      yHi,
      cw?.e ?? [],
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
      cw?.w ?? [],
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
      cw?.n ?? [],
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
      cw?.s ?? [],
      "shell_wall_s",
    );
    addKoncarElevatorSignMeshes(
      group,
      sx,
      sy,
      sz,
      opts.elevatorSignPlacements ?? [],
    );
    return;
  }

  const usableZ = vlenZ - 0.14;
  const usableX = vlenX - 0.14;
  const czList = lobbyDoorCentersAlong(usableZ);
  const cxList = lobbyDoorCentersAlong(usableX);

  const lobbyHolesEw: WallHoleYZ[] = czList.map((zc) => ({
    z0: zc - halfDoor,
    z1: zc + halfDoor,
    y0: yDoor0,
    y1: yDoor1,
  }));
  const lobbyHolesNs: WallHoleXY[] = cxList.map((xc) => ({
    x0: xc - halfDoor,
    x1: xc + halfDoor,
    y0: yDoor0,
    y1: yDoor1,
  }));

  const holesWallE: WallHoleYZ[] = [...lobbyHolesEw, ...(cw?.e ?? [])];
  const holesWallW: WallHoleYZ[] = [...lobbyHolesEw, ...(cw?.w ?? [])];
  const holesWallN: WallHoleXY[] = [...lobbyHolesNs, ...(cw?.n ?? [])];
  const holesWallS: WallHoleXY[] = [...lobbyHolesNs, ...(cw?.s ?? [])];

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
    holesWallE,
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
    holesWallW,
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
    holesWallN,
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
    holesWallS,
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

  addKoncarElevatorSignMeshes(
    group,
    sx,
    sy,
    sz,
    opts.elevatorSignPlacements ?? [],
  );
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
  /** 1-based storey index (elevator pit / grass occluder / lobby shell use this). */
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
  /**
   * Per {@link shaftPlanKey}, door wall face chosen on **story 1** of a stacked building.
   * Passed from {@link instantiateBuildingFloorStack} so upper storeys match the ground door side.
   */
  elevatorDoorFaceByShaftKey?: ReadonlyMap<string, CardinalFace>;
  /**
   * When {@link stairShaftSkipKeys} replaces per-plate shafts with {@link addBuildingStairShaftColumnsToRoot},
   * corridor wall holes must use the same mega-shaft door bands and tangent math as that column.
   */
  megaStairCorridorPunchContext?: {
    specs: readonly BuildingStairShaftSpec[];
    sortedRefs: readonly { levelIndex: number; floorDocId: string }[];
    getFloorDoc: (floorDocId: string) => FloorDoc;
    spacing: number;
  };
};

/**
 * Ground-storey elevator door faces (plate-space), keyed by {@link shaftPlanKey} at each car’s XZ.
 */
export function elevatorDoorFacesFromGroundFloorDoc(doc: FloorDoc): Map<string, CardinalFace> {
  const floor = withoutElevatorsInStairwells(doc);
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
  const out = new Map<string, CardinalFace>();
  for (const o of floor.objects) {
    if (!o.prefabId.toLowerCase().includes("elevator")) continue;
    const k = shaftPlanKey(o.position[0], o.position[2]);
    out.set(
      k,
      elevatorDoorFaceFromFloorCorridors(
        o.position[0],
        o.position[2],
        floor,
        plateCx,
        plateCz,
      ),
    );
  }
  return out;
}

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
  const corridorFootprint = firstCorridorOrLobbyFromFloor(floor);

  /** Same flush gap as {@link addStairWellPlaceholder} so corridor punches align with the shaft opening. */
  const stairFlushByPlanKey = new Map<string, number | undefined>();
  const stairDoorPunchesPlate: PlateStairCorridorDoorPunch[] = [];
  for (const o of floor.objects) {
    const pid0 = o.prefabId.toLowerCase();
    if (!(pid0.includes("stair_well") || pid0.includes("stairwell"))) continue;
    const sxi = o.scale?.[0] ?? 1;
    const syi = o.scale?.[1] ?? 1;
    const szi = o.scale?.[2] ?? 1;
    const sk0 = shaftPlanKey(o.position[0], o.position[2]);
    if (opts?.stairShaftSkipKeys?.has(sk0)) {
      /** Per-plate stair mesh is skipped; punches come from {@link megaStairCorridorPunchContext}. */
      continue;
    }
    const snap = computeStairDoorSnapForPlaceholder(
      sxi,
      syi,
      szi,
      {
        bandHeightM: syi,
        towardPlateXZ: [plateCx, plateCz],
        shaftPlateXZ: [o.position[0], o.position[2]],
      },
      { climbFullShaft: false },
    );
    let stairFlush: number | undefined;
    if (corridorFootprint) {
      const shx0 = sxi * 0.5;
      const shz0 = szi * 0.5;
      const g = corridorFlushGapForShaftDoor(
        snap.face,
        o.position[0],
        o.position[2],
        shx0,
        shz0,
        corridorFootprint,
      );
      if (g > 1e-4) stairFlush = Math.min(0.35, g);
    }
    stairFlushByPlanKey.set(sk0, stairFlush);
    const y0 = snap.resolvedShellDoor.doorHoleY0Local;
    const y1 = snap.resolvedShellDoor.doorHoleY1Local;
    if (y0 == null || y1 == null) continue;
    stairDoorPunchesPlate.push({
      stairFace: snap.face,
      tangentLocal: snap.tangentOffsetAlongWall,
      doorHalfW: snap.doorHalfW,
      y0Local: y0,
      y1Local: y1,
      spx: o.position[0],
      spz: o.position[2],
      spy: o.position[1],
      shx: sxi * 0.5,
      shz: szi * 0.5,
    });
  }

  const megaCtx = opts?.megaStairCorridorPunchContext;
  if (megaCtx && opts?.stairShaftSkipKeys && opts.storyLevelIndex != null) {
    for (const spec of megaCtx.specs) {
      if (!opts.stairShaftSkipKeys.has(spec.planKey)) continue;
      const megaPunch = buildMegaStairCorridorDoorPunchForPlate(
        spec,
        megaCtx.sortedRefs,
        megaCtx.getFloorDoc,
        megaCtx.spacing,
        opts.storyLevelIndex,
        plateCx,
        plateCz,
      );
      if (megaPunch) stairDoorPunchesPlate.push(megaPunch);
    }
  }

  const elevatorDoorPunchesPlate: PlateStairCorridorDoorPunch[] = [];
  for (const o of floor.objects) {
    if (!o.prefabId.toLowerCase().includes("elevator")) continue;
    const ex = o.scale?.[0] ?? 1;
    const ey = o.scale?.[1] ?? 1;
    const ez = o.scale?.[2] ?? 1;
    const skE = shaftPlanKey(o.position[0], o.position[2]);
    const elevFace =
      opts?.elevatorDoorFaceByShaftKey?.get(skE) ??
      elevatorDoorFaceFromFloorCorridors(
        o.position[0],
        o.position[2],
        floor,
        plateCx,
        plateCz,
      );
    const loc = elevatorGroundDoorOpeningLocals(ex, ey, ez, elevFace, 0);
    elevatorDoorPunchesPlate.push({
      stairFace: loc.face,
      tangentLocal: loc.tangentOffsetAlongWall,
      doorHalfW: loc.doorHalfW,
      y0Local: loc.y0Local,
      y1Local: loc.y1Local,
      spx: o.position[0],
      spz: o.position[2],
      spy: o.position[1],
      shx: ex * 0.5,
      shz: ez * 0.5,
      isElevator: true,
    });
  }

  const corridorShaftDoorPunchesPlate: readonly PlateStairCorridorDoorPunch[] =
    [...stairDoorPunchesPlate, ...elevatorDoorPunchesPlate];

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
      const sk = shaftPlanKey(obj.position[0], obj.position[2]);
      const doorFace =
        opts?.elevatorDoorFaceByShaftKey?.get(sk) ??
        elevatorDoorFaceFromFloorCorridors(
          obj.position[0],
          obj.position[2],
          floor,
          plateCx,
          plateCz,
        );
      /** Pit slab only on ground plate; `99` = legacy default when no `storyLevelIndex` (single-plate). */
      const elevatorPitSlab = story === 1 || story === 99;
      const halfX = sx * 0.5;
      const halfZ = sz * 0.5;
      let elevFlush: number | undefined;
      if (corridorFootprint) {
        const g = corridorFlushGapForShaftDoor(
          doorFace,
          obj.position[0],
          obj.position[2],
          halfX,
          halfZ,
          corridorFootprint,
        );
        if (g > 1e-4) elevFlush = Math.min(0.35, g);
      }
      addElevatorShaftPlaceholder(room, sx, sy, sz, {
        groundDoor: { face: doorFace, bandHeightM: sy },
        includePitFloor: elevatorPitSlab,
        corridorFlushGapM: elevFlush,
      });
    } else if (pid.includes("stair_well") || pid.includes("stairwell")) {
      const sk = shaftPlanKey(obj.position[0], obj.position[2]);
      if (!opts?.stairShaftSkipKeys?.has(sk)) {
        addStairWellPlaceholder(room, sx, sy, sz, {
          groundDoor: {
            bandHeightM: sy,
            towardPlateXZ: [plateCx, plateCz],
            shaftPlateXZ: [obj.position[0], obj.position[2]],
          },
          corridorFlushGapM: stairFlushByPlanKey.get(sk),
          omitGroundStoreyCornerLandings: story === 1 || story === 99,
        });
      }
    } else {
      const skipShaftCutouts = Boolean(obj.rotation);
      const corridorWallHoles = skipShaftCutouts
        ? undefined
        : corridorShellHolesFromStairPunches(
            obj,
            sx,
            sy,
            sz,
            kind,
            corridorShaftDoorPunchesPlate,
          );
      const elevatorSignPlacements =
        kind === "corridor" && !skipShaftCutouts
          ? elevatorCorridorSignPlacementsFromPunches(
              obj,
              sx,
              sy,
              sz,
              elevatorDoorPunchesPlate,
            )
          : [];
      addHollowRoomShell(room, sx, sy, sz, kind, {
        shaftHolesPlate: shaftHolesPlate,
        roomPx: obj.position[0],
        roomPz: obj.position[2],
        skipShaftCutouts,
        storyLevelIndex: opts?.storyLevelIndex,
        shaftElevatorsMerged,
        corridorWallHoles,
        elevatorSignPlacements,
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
