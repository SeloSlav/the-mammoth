import * as THREE from "three";
import type {
  HollowShellOpts,
  PlaceholderKind,
} from "./floorPlaceholderMeshTypes.js";
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
  hollowShellXZRectsWithShaftCutouts,
  punchElevatorHolesInShellRects,
  type RectXZ,
} from "./shaftPlanformClip.js";
import { applyShellFloorPlanarTopUV } from "./floorSlabPlaceholder.js";
import { floorPlaceholderMeshMaterials as mat } from "./floorPlaceholderMeshMaterials.js";
import { matsFor } from "./floorPlaceholderPrefabKind.js";
import { addKoncarElevatorSignMeshes } from "./floorCorridorPlateSignage.js";
import { addOppositeCorridorKatSignMeshes } from "./elevatorLandingKatSign.js";
import { addStairwellCorridorSignMeshes } from "./stairwellCorridorSign.js";
/**
 * Ground storey corridor / lobby: **double-door frame bays** (m clear).
 * Panels/doors are not modeled yet — openings + trim only.
 */
const LOBBY_DOUBLE_DOOR_W = 1.84;
const LOBBY_DOUBLE_DOOR_H = 2.16;
const LOBBY_DOOR_SILL = 0.04;
/** Minimum centre-to-centre spacing so adjacent double frames read as separate bays. */
const LOBBY_DOUBLE_DOOR_BAY_SPACING = LOBBY_DOUBLE_DOOR_W + 0.56;
/** Unit / corridor hollow shells (`wt` = 0.11 in {@link addHollowRoomShell}). */
export const HOLLOW_SHELL_WT_M = 0.11;

export function addShellFloorCeilingPieces(
  group: THREE.Group,
  rects: readonly RectXZ[],
  wt: number,
  hy: number,
  floorM: THREE.MeshStandardMaterial,
  ceilM: THREE.MeshStandardMaterial,
  roomHalfX: number,
  roomHalfZ: number,
  namePrefix?: string,
  slabs: { floor?: boolean; ceiling?: boolean } = {},
): void {
  const wantFloor = slabs.floor !== false;
  const wantCeil = slabs.ceiling !== false;
  let fi = 0;
  let ci = 0;
  for (const r of rects) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) * 0.5;
    const cz = (r.z0 + r.z1) * 0.5;
    if (wantFloor) {
      const floorGeom = new THREE.BoxGeometry(w, wt, d);
      applyShellFloorPlanarTopUV(floorGeom, wt, cx, cz, roomHalfX, roomHalfZ);
      const floor = new THREE.Mesh(floorGeom, floorM);
      const floorName = namePrefix
        ? `${namePrefix}_floor${rects.length > 1 ? `_${fi}` : ""}`
        : rects.length > 1
          ? `shell_floor_${fi}`
          : "shell_floor";
      floor.name = floorName;
      fi += 1;
      floor.position.set(cx, -hy + wt * 0.5, cz);
      group.add(floor);
    }
    if (wantCeil) {
      const ceilGeom = new THREE.BoxGeometry(w, wt, d);
      /** Match floor shell: default box UVs are 0..1 per piece and stretch badly on long corridors. */
      applyShellFloorPlanarTopUV(ceilGeom, wt, cx, cz, roomHalfX, roomHalfZ);
      const ceiling = new THREE.Mesh(ceilGeom, ceilM);
      ceiling.name = namePrefix
        ? `${namePrefix}_ceiling${rects.length > 1 ? `_${ci}` : ""}`
        : rects.length > 1
          ? `shell_ceiling_${ci}`
          : "shell_ceiling";
      ci += 1;
      ceiling.position.set(cx, hy - wt * 0.5, cz);
      group.add(ceiling);
    }
  }
}
function markNewChildrenNoCollision(
  group: THREE.Group,
  startIdx: number,
): void {
  for (let i = startIdx; i < group.children.length; i++) {
    group.children[i]!.userData.mammothNoCollision = true;
  }
}
export function addExteriorWallCladding(
  group: THREE.Group,
  hx: number,
  hz: number,
  vlenX: number,
  vlenZ: number,
  yLo: number,
  yHi: number,
  faces: readonly CardinalFace[],
  exteriorWallM: THREE.MeshStandardMaterial,
  holes?: Partial<
    Record<CardinalFace, readonly WallHoleYZ[] | readonly WallHoleXY[]>
  >,
  /** Push holed façade slabs outward (m) so they do not coplanar-z-fight unit plaster shells. */
  outwardBiasAlongNormalM = 0,
  claddingOpts?: { spanX?: { min: number; max: number } },
): void {
  if (faces.length === 0) return;
  const cladT = 0.035;
  const b = outwardBiasAlongNormalM;
  const zMin = -vlenZ * 0.5;
  const zMax = vlenZ * 0.5;
  const xMin = claddingOpts?.spanX?.min ?? -vlenX * 0.5;
  const xMax = claddingOpts?.spanX?.max ?? vlenX * 0.5;
  for (const face of faces) {
    if (face === "e") {
      const startIdx = group.children.length;
      addWallConstantXWithHoles(
        group,
        exteriorWallM,
        hx + cladT * 0.5 + b,
        cladT,
        zMin,
        zMax,
        yLo,
        yHi,
        (holes?.e as readonly WallHoleYZ[] | undefined) ?? [],
        "shell_exterior_cladding_e",
      );
      markNewChildrenNoCollision(group, startIdx);
    } else if (face === "w") {
      const startIdx = group.children.length;
      addWallConstantXWithHoles(
        group,
        exteriorWallM,
        -hx - cladT * 0.5 - b,
        cladT,
        zMin,
        zMax,
        yLo,
        yHi,
        (holes?.w as readonly WallHoleYZ[] | undefined) ?? [],
        "shell_exterior_cladding_w",
      );
      markNewChildrenNoCollision(group, startIdx);
    } else if (face === "n") {
      const startIdx = group.children.length;
      addWallConstantZWithHoles(
        group,
        exteriorWallM,
        hz + cladT * 0.5 + b,
        cladT,
        xMin,
        xMax,
        yLo,
        yHi,
        (holes?.n as readonly WallHoleXY[] | undefined) ?? [],
        "shell_exterior_cladding_n",
      );
      markNewChildrenNoCollision(group, startIdx);
    } else {
      const startIdx = group.children.length;
      addWallConstantZWithHoles(
        group,
        exteriorWallM,
        -hz - cladT * 0.5 - b,
        cladT,
        xMin,
        xMax,
        yLo,
        yHi,
        (holes?.s as readonly WallHoleXY[] | undefined) ?? [],
        "shell_exterior_cladding_s",
      );
      markNewChildrenNoCollision(group, startIdx);
    }
  }
}
/** @param maxBays upper cap (long E/W bar sides vs short N/S ends of the podium hall). */
function lobbyDoorCentersAlong(usableSpan: number, maxBays = 4): number[] {
  if (usableSpan < LOBBY_DOUBLE_DOOR_W + 0.28) return [0];
  const n = Math.max(
    1,
    Math.min(maxBays, Math.floor(usableSpan / LOBBY_DOUBLE_DOOR_BAY_SPACING)),
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
export function addHollowRoomShell(
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
  const {
    floor: floorM,
    ceil: defaultCeilM,
    wall: defaultWallM,
    exteriorWall: exteriorWallM,
  } = matsFor(kind, opts.storyLevelIndex);
  const story = opts.storyLevelIndex ?? 99;
  /** Match ceiling rule plus always-on ground / legacy plate corridors (incl. rotated shells). */
  const residentialCorridorWall =
    kind === "corridor" &&
    (Boolean(opts.useAuthoringCorridorCeiling) || story === 1 || story === 99);
  const wallM = residentialCorridorWall
    ? mat.groundLevelCorridorInteriorWall
    : defaultWallM;
  const ceilM =
    kind === "corridor" && opts.useAuthoringCorridorCeiling
      ? mat.buildingCorridorCeiling
      : defaultCeilM;
  const exteriorFaces = opts.exteriorFaces ?? [];
  /** Slight outward shift for apartment façades vs plaster shell (see {@link addExteriorWallCladding}). */
  const unitCladOutwardBiasM = kind === "unit" ? 0.05 : 0;
  const vh = Math.max(sy - 2 * wt, 0.05);
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  let rects: RectXZ[] = opts.skipShaftCutouts
    ? [{ x0: -hx, x1: hx, z0: -hz, z1: hz }]
    : hollowShellXZRectsWithShaftCutouts(
        sx,
        sz,
        opts.roomPx,
        opts.roomPz,
        opts.shaftHolesPlate,
      );
  if (!opts.skipShaftCutouts && opts.shaftElevatorsMerged?.length) {
    rects = punchElevatorHolesInShellRects(
      rects,
      opts.roomPx,
      opts.roomPz,
      opts.shaftElevatorsMerged,
    );
  }
  if (opts.balconyExtendMaxX != null || opts.balconyExtendMinX != null) {
    rects = rects.map((r) => ({
      ...r,
      x0: opts.balconyExtendMinX != null ? Math.min(r.x0, opts.balconyExtendMinX) : r.x0,
      x1: opts.balconyExtendMaxX != null ? Math.max(r.x1, opts.balconyExtendMaxX) : r.x1,
    }));
  }
  const shellHalfX = Math.max(
    hx,
    ...(opts.balconyExtendMaxX != null ? [Math.abs(opts.balconyExtendMaxX)] : []),
    ...(opts.balconyExtendMinX != null ? [Math.abs(opts.balconyExtendMinX)] : []),
  );
  const shellHalfZ = hz;
  addShellFloorCeilingPieces(group, rects, wt, hy, floorM, ceilM, shellHalfX, shellHalfZ, undefined, {
    floor: opts.shellFloorSlab !== false,
    ceiling: opts.shellCeilingSlab !== false,
  });
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
  const win = opts.exteriorWindowHoles;
  const stairHoleCount =
    (cw?.e?.length ?? 0) +
    (cw?.w?.length ?? 0) +
    (cw?.n?.length ?? 0) +
    (cw?.s?.length ?? 0);
  const windowHoleCount =
    (win?.e?.length ?? 0) +
    (win?.w?.length ?? 0) +
    (win?.n?.length ?? 0) +
    (win?.s?.length ?? 0);
  const totalWallCuts = stairHoleCount + windowHoleCount;
  const innerE = [...(cw?.e ?? []), ...(win?.e ?? [])];
  const innerW = [...(cw?.w ?? []), ...(win?.w ?? [])];
  const innerN = [...(cw?.n ?? []), ...(win?.n ?? [])];
  const innerS = [...(cw?.s ?? []), ...(win?.s ?? [])];
  const claddingE =
    exteriorFaces.includes("e") && kind === "unit"
      ? (win?.e ?? [])
      : (cw?.e ?? []);
  const claddingW =
    exteriorFaces.includes("w") && kind === "unit"
      ? (win?.w ?? [])
      : (cw?.w ?? []);
  const claddingN =
    exteriorFaces.includes("n") && kind === "unit"
      ? (win?.n ?? [])
      : (cw?.n ?? []);
  const claddingS =
    exteriorFaces.includes("s") && kind === "unit"
      ? (win?.s ?? [])
      : (cw?.s ?? []);
  const openInterior = new Set(opts.openInteriorFaces ?? []);
  const xMinWall = opts.wallSpanX?.min ?? -vlenX * 0.5;
  const xMaxWall = opts.wallSpanX?.max ?? vlenX * 0.5;
  if (!groundLobby) {
    if (totalWallCuts === 0) {
      if (!openInterior.has("e")) {
        const east = new THREE.Mesh(new THREE.BoxGeometry(wt, vh, vlenZ), wallM);
        east.name = "shell_wall_e";
        east.position.set(hx - wt * 0.5, 0, 0);
        group.add(east);
      }
      if (!openInterior.has("w")) {
        const west = new THREE.Mesh(new THREE.BoxGeometry(wt, vh, vlenZ), wallM);
        west.name = "shell_wall_w";
        west.position.set(-hx + wt * 0.5, 0, 0);
        group.add(west);
      }
      const spanX = xMaxWall - xMinWall;
      const north = new THREE.Mesh(new THREE.BoxGeometry(spanX, vh, wt), wallM);
      north.name = "shell_wall_n";
      north.position.set((xMinWall + xMaxWall) * 0.5, 0, hz - wt * 0.5);
      group.add(north);
      const south = new THREE.Mesh(new THREE.BoxGeometry(spanX, vh, wt), wallM);
      south.name = "shell_wall_s";
      south.position.set((xMinWall + xMaxWall) * 0.5, 0, -hz + wt * 0.5);
      group.add(south);
      const cladFaces = exteriorFaces.filter((f) => !openInterior.has(f));
      if (cladFaces.length > 0) {
        addExteriorWallCladding(
          group,
          hx,
          hz,
          vlenX,
          vlenZ,
          yLo,
          yHi,
          cladFaces,
          exteriorWallM,
          undefined,
          unitCladOutwardBiasM,
          opts.wallSpanX ? { spanX: opts.wallSpanX } : undefined,
        );
      }
      return;
    }
    const zMin = -vlenZ * 0.5;
    const zMax = vlenZ * 0.5;
    const xMin = xMinWall;
    const xMax = xMaxWall;
    const xE = hx - wt * 0.5;
    const xW = -hx + wt * 0.5;
    const zN = hz - wt * 0.5;
    const zS = -hz + wt * 0.5;
    if (!openInterior.has("e")) {
      addWallConstantXWithHoles(
        group,
        wallM,
        xE,
        wt,
        zMin,
        zMax,
        yLo,
        yHi,
        innerE,
        "shell_wall_e",
      );
    }
    if (!openInterior.has("w")) {
      addWallConstantXWithHoles(
        group,
        wallM,
        xW,
        wt,
        zMin,
        zMax,
        yLo,
        yHi,
        innerW,
        "shell_wall_w",
      );
    }
    addWallConstantZWithHoles(
      group,
      wallM,
      zN,
      wt,
      xMin,
      xMax,
      yLo,
      yHi,
      innerN,
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
      innerS,
      "shell_wall_s",
    );
    const cladFaces = exteriorFaces.filter((f) => !openInterior.has(f));
    if (cladFaces.length > 0) {
      addExteriorWallCladding(
        group,
        hx,
        hz,
        vlenX,
        vlenZ,
        yLo,
        yHi,
        cladFaces,
        exteriorWallM,
        {
          e: openInterior.has("e") ? [] : claddingE,
          w: openInterior.has("w") ? [] : claddingW,
          n: claddingN,
          s: claddingS,
        },
        unitCladOutwardBiasM,
        opts.wallSpanX ? { spanX: opts.wallSpanX } : undefined,
      );
    }
    addKoncarElevatorSignMeshes(
      group,
      sx,
      sy,
      sz,
      opts.elevatorSignPlacements ?? [],
    );
    addOppositeCorridorKatSignMeshes(
      group,
      sx,
      sy,
      sz,
      opts.storyLevelIndex ?? 99,
      opts.storyShortLabel,
      opts.elevatorSignPlacements ?? [],
    );
    addStairwellCorridorSignMeshes(
      group,
      sx,
      sy,
      sz,
      opts.stairSignPlacements ?? [],
    );
    return;
  }
  const usableZ = vlenZ - 0.14;
  const usableX = vlenX - 0.14;
  const czList = lobbyDoorCentersAlong(usableZ);
  /**
   * East ground façade shares the stairwell side of the plan. After trimming the far north/south
   * wings, the two outer lobby bays sit behind stairwell wall mass, so only keep the central pair.
   */
  const czListEast = czList.length > 2 ? czList.slice(1, -1) : czList;
  /** N/S façades are the narrow ends of the double-loaded bar — fewer bays than the long E/W spine. */
  const cxList = lobbyDoorCentersAlong(usableX, 2);
  const lobbyHolesE: WallHoleYZ[] = czListEast.map((zc) => ({
    z0: zc - halfDoor,
    z1: zc + halfDoor,
    y0: yDoor0,
    y1: yDoor1,
  }));
  const lobbyHolesW: WallHoleYZ[] = czList.map((zc) => ({
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
  const holesWallE: WallHoleYZ[] = [...lobbyHolesE, ...(cw?.e ?? [])];
  const holesWallW: WallHoleYZ[] = [...lobbyHolesW, ...(cw?.w ?? [])];
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
  addExteriorWallCladding(
    group,
    hx,
    hz,
    vlenX,
    vlenZ,
    yLo,
    yHi,
    exteriorFaces,
    exteriorWallM,
    {
      e: holesWallE,
      w: holesWallW,
      n: holesWallN,
      s: holesWallS,
    },
  );
  const frameM = mat.lobbyDoorFrame;
  const extE = exteriorFaces.includes("e");
  const extW = exteriorFaces.includes("w");
  const extN = exteriorFaces.includes("n");
  const extS = exteriorFaces.includes("s");
  let fi = 0;
  for (const zc of czListEast) {
    const z0 = zc - halfDoor;
    const z1 = zc + halfDoor;
    if (!extE) {
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
    }
    fi += 1;
  }
  let fwi = 0;
  for (const zc of czList) {
    const z0 = zc - halfDoor;
    const z1 = zc + halfDoor;
    if (!extW) {
      addDoorFrameTrimConstantX(
        group,
        frameM,
        -hx + wt,
        1,
        z0,
        z1,
        yDoor0,
        yDoor1,
        `shell_lobby_frame_w_${fwi}`,
      );
    }
    fwi += 1;
  }
  let fj = 0;
  for (const xc of cxList) {
    const x0 = xc - halfDoor;
    const x1 = xc + halfDoor;
    if (!extN) {
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
    }
    if (!extS) {
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
    }
    fj += 1;
  }
  /** Must match {@link addExteriorWallCladding} — frame sits flush with façade, slightly inset. */
  const lobbyExteriorCladT = 0.035;
  const extFrameM = mat.lobbyDoorFrameExterior;
  let fxi = 0;
  for (const zc of czListEast) {
    const z0 = zc - halfDoor;
    const z1 = zc + halfDoor;
    if (extE) {
      addDoorFrameTrimConstantX(
        group,
        extFrameM,
        hx + lobbyExteriorCladT,
        -1,
        z0,
        z1,
        yDoor0,
        yDoor1,
        `shell_lobby_frame_ext_e_${fxi}`,
      );
    }
    fxi += 1;
  }
  let fxwi = 0;
  for (const zc of czList) {
    const z0 = zc - halfDoor;
    const z1 = zc + halfDoor;
    if (extW) {
      addDoorFrameTrimConstantX(
        group,
        extFrameM,
        -hx - lobbyExteriorCladT,
        1,
        z0,
        z1,
        yDoor0,
        yDoor1,
        `shell_lobby_frame_ext_w_${fxwi}`,
      );
    }
    fxwi += 1;
  }
  let fxj = 0;
  for (const xc of cxList) {
    const x0 = xc - halfDoor;
    const x1 = xc + halfDoor;
    if (extN) {
      addDoorFrameTrimConstantZ(
        group,
        extFrameM,
        hz + lobbyExteriorCladT,
        -1,
        x0,
        x1,
        yDoor0,
        yDoor1,
        `shell_lobby_frame_ext_n_${fxj}`,
      );
    }
    if (extS) {
      addDoorFrameTrimConstantZ(
        group,
        extFrameM,
        -hz - lobbyExteriorCladT,
        1,
        x0,
        x1,
        yDoor0,
        yDoor1,
        `shell_lobby_frame_ext_s_${fxj}`,
      );
    }
    fxj += 1;
  }
  addKoncarElevatorSignMeshes(
    group,
    sx,
    sy,
    sz,
    opts.elevatorSignPlacements ?? [],
  );
  addOppositeCorridorKatSignMeshes(
    group,
    sx,
    sy,
    sz,
    opts.storyLevelIndex ?? 99,
    opts.storyShortLabel,
    opts.elevatorSignPlacements ?? [],
  );
  addStairwellCorridorSignMeshes(
    group,
    sx,
    sy,
    sz,
    opts.stairSignPlacements ?? [],
  );
}
