/**
 * **Rectangular stair shaft** — racetrack: four wall runs + corner landings every lap.
 * Short perimeter runs (few treads) fold into the next leg in climb order with **one** continuous
 * landing slab on that wall (east/west and south/north), so stub flights do not sit between pads.
 * Mega shafts use **the same lap** (same tread count, rise, corners) repeated **floor-by-floor**
 * so the climb reads as one orderly system.
 *
 * Must match `DEFAULT_BUILDING_FLOOR_SPACING_M` / `STOREY_SPACING_M` in generator.
 */
/** Matches `DEFAULT_BUILDING_FLOOR_SPACING_M` / building stack spacing. */
export const STOREY_SPACING_M = 60 / 19;

export const STAIR_RUN = 0.28;
export const STAIR_RISE = 0.165;
const STAIR_WT = 0.11;

export type SwitchbackStairOpts = {
  climbFullShaft?: boolean;
};

export type StairTreadSpec = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  halfAlong: number;
  riseHalf: number;
  halfAcross: number;
};

export type StairCornerLanding = {
  x: number;
  y: number;
  z: number;
  halfW: number;
  halfD: number;
  thicknessHalf: number;
};

export type StairSwitchbackLayout = {
  treads: readonly StairTreadSpec[];
  cornerLandings: readonly StairCornerLanding[];
  hx: number;
  hy: number;
  hz: number;
  ix0: number;
  ix1: number;
  iz0: number;
  iz1: number;
  innerWallH: number;
  wallCenterY: number;
  /** Inner racetrack anchors (same frame as corner landings on E/W/N/S runs). */
  racetrack: { xE: number; xW: number; zN: number; zS: number };
};

/** Local +X / −X / +Z / −Z wall of the shaft (same convention as `wallWithDoorCutout`). */
export type StairShaftCardinalFace = "e" | "w" | "n" | "s";

type Vec3Box = {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
};

function treadAabb3(tr: StairTreadSpec): Vec3Box {
  const cos = Math.cos(tr.yaw);
  const sin = Math.sin(tr.yaw);
  const ha = tr.halfAlong;
  const hac = tr.halfAcross;
  const hy = tr.riseHalf;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const lx of [-ha, ha]) {
    for (const lz of [-hac, hac]) {
      for (const ly of [-hy, hy]) {
        const wx = tr.x + lx * cos - lz * sin;
        const wz = tr.z + lx * sin + lz * cos;
        const wy = tr.y + ly;
        minX = Math.min(minX, wx);
        maxX = Math.max(maxX, wx);
        minY = Math.min(minY, wy);
        maxY = Math.max(maxY, wy);
        minZ = Math.min(minZ, wz);
        maxZ = Math.max(maxZ, wz);
      }
    }
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

function landingAabb3(cl: StairCornerLanding): Vec3Box {
  return {
    min: [
      cl.x - cl.halfW,
      cl.y - cl.thicknessHalf,
      cl.z - cl.halfD,
    ],
    max: [
      cl.x + cl.halfW,
      cl.y + cl.thicknessHalf,
      cl.z + cl.halfD,
    ],
  };
}

function aabbIntersects3(a: Vec3Box, b: Vec3Box): boolean {
  return (
    a.max[0] >= b.min[0] &&
    a.min[0] <= b.max[0] &&
    a.max[1] >= b.min[1] &&
    a.min[1] <= b.max[1] &&
    a.max[2] >= b.min[2] &&
    a.min[2] <= b.max[2]
  );
}

function countHits(slab: Vec3Box, boxes: readonly Vec3Box[]): number {
  let n = 0;
  for (const b of boxes) {
    if (aabbIntersects3(b, slab)) n += 1;
  }
  return n;
}

export type StairGroundDoorPlacement = {
  face: StairShaftCardinalFace;
  /**
   * E/W walls: added to the door hole centre along **+Z**. N/S walls: added along **+X**.
   * Must stay inside inner wall extents so the cutout stays on the plate.
   */
  tangentOffsetM: number;
};

/**
 * Picks wall face + along-wall offset for a ground stair entry by **3D** intersection tests between
 * tread / landing volumes and a thin slab extruded inward from the door opening (avoids stairs
 * visually clipping through the frame).
 */
export function pickStairShaftGroundDoorPlacement(
  L: StairSwitchbackLayout,
  params: {
    sx: number;
    sz: number;
    wallThickness: number;
    doorHalfWidthM: number;
    doorY0Local: number;
    doorY1Local: number;
    collisionYMaxLocal?: number;
    towardX: number;
    towardZ: number;
    shaftPx: number;
    shaftPz: number;
  },
): StairGroundDoorPlacement {
  const hx = params.sx * 0.5;
  const hz = params.sz * 0.5;
  const wt = params.wallThickness;
  const dw = params.doorHalfWidthM;
  const y0 = params.doorY0Local;
  const y1 = params.doorY1Local;
  const yMax = params.collisionYMaxLocal ?? Infinity;
  const pad = 0.07;
  const inward = Math.min(2.55, Math.max(hx, hz) * 0.92);

  const boxes: Vec3Box[] = [];
  for (const tr of L.treads) {
    if (tr.y - tr.riseHalf > yMax + 0.02) continue;
    if (tr.y + tr.riseHalf < y0 - 0.02 || tr.y - tr.riseHalf > y1 + 0.02) continue;
    boxes.push(treadAabb3(tr));
  }
  for (const cl of L.cornerLandings) {
    const lo = cl.y - cl.thicknessHalf;
    const hi = cl.y + cl.thicknessHalf;
    if (lo > yMax + 0.02) continue;
    if (hi < y0 - 0.02 || lo > y1 + 0.02) continue;
    boxes.push(landingAabb3(cl));
  }

  const vlenX = Math.max(params.sx - 2 * wt, 0.05);
  const vlenZ = Math.max(params.sz - 2 * wt, 0.05);
  const zHalf = Math.max(0, vlenZ * 0.5 - dw - 0.05);
  const xHalf = Math.max(0, vlenX * 0.5 - dw - 0.05);
  const zLo = -zHalf;
  const zHi = zHalf;
  const xLo = -xHalf;
  const xHi = xHalf;

  const samplesAlong = (lo: number, hi: number): number[] => {
    if (hi - lo < 1e-4) return [0];
    const steps = 23;
    const out: number[] = [];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      out.push(lo + (hi - lo) * t);
    }
    return out;
  };

  const slabEast = (tz: number): Vec3Box => {
    const xi = hx - wt;
    return {
      min: [xi - inward, y0, tz - dw - pad],
      max: [xi + 0.04, y1, tz + dw + pad],
    };
  };
  const slabWest = (tz: number): Vec3Box => {
    const xi = -hx + wt;
    return {
      min: [xi - 0.04, y0, tz - dw - pad],
      max: [xi + inward, y1, tz + dw + pad],
    };
  };
  const slabNorth = (tx: number): Vec3Box => {
    const zi = hz - wt;
    return {
      min: [tx - dw - pad, y0, zi - inward],
      max: [tx + dw + pad, y1, zi + 0.04],
    };
  };
  const slabSouth = (tx: number): Vec3Box => {
    const zi = -hz + wt;
    return {
      min: [tx - dw - pad, y0, zi - 0.04],
      max: [tx + dw + pad, y1, zi + inward],
    };
  };

  type Cand = { face: StairShaftCardinalFace; along: number; hits: number };
  const cands: Cand[] = [];

  for (const tz of samplesAlong(zLo, zHi)) {
    cands.push({ face: "e", along: tz, hits: countHits(slabEast(tz), boxes) });
    cands.push({ face: "w", along: tz, hits: countHits(slabWest(tz), boxes) });
  }
  for (const tx of samplesAlong(xLo, xHi)) {
    cands.push({ face: "n", along: tx, hits: countHits(slabNorth(tx), boxes) });
    cands.push({ face: "s", along: tx, hits: countHits(slabSouth(tx), boxes) });
  }

  const bestHits = Math.min(...cands.map((c) => c.hits));
  const tier0 = cands.filter((c) => c.hits === bestHits);

  const tx = params.towardX - params.shaftPx;
  const tz = params.towardZ - params.shaftPz;
  const len = Math.hypot(tx, tz);
  const ux = len > 1e-6 ? tx / len : 0;
  const uz = len > 1e-6 ? tz / len : 1;
  const faceDot = (f: StairShaftCardinalFace): number => {
    if (f === "e") return ux;
    if (f === "w") return -ux;
    if (f === "n") return uz;
    return -uz;
  };

  let pick = tier0[0]!;
  let bestDot = -Infinity;
  let bestAbsAlong = Infinity;
  for (const c of tier0) {
    const d = faceDot(c.face);
    const a = Math.abs(c.along);
    if (d > bestDot + 1e-6 || (Math.abs(d - bestDot) < 1e-6 && a < bestAbsAlong)) {
      bestDot = d;
      bestAbsAlong = a;
      pick = c;
    }
  }

  return { face: pick.face, tangentOffsetM: pick.along };
}

type Leg = { ax: number; az: number; bx: number; bz: number; count: number };

function buildLegTreads(
  leg: Leg,
  y0: number,
  rise: number,
  startIndex: number,
  out: StairTreadSpec[],
  halfAcross: number,
): number {
  const { ax, az, bx, bz, count } = leg;
  const yaw = Math.atan2(bz - az, bx - ax);
  const dx = bx - ax;
  const dz = bz - az;
  const legLen = Math.hypot(dx, dz);
  const stepPitch = legLen / Math.max(count, 1);
  const halfAlong = Math.max(0.09, stepPitch * 0.5);
  const riseHalf = rise * 0.5;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const x = ax + dx * t;
    const z = az + dz * t;
    const y = y0 + (startIndex + i + 0.5) * rise;
    out.push({ x, y, z, yaw, halfAlong, riseHalf, halfAcross });
  }
  return startIndex + count;
}

/**
 * Perimeter circulating stair: **repeated identical laps** on full-shaft climbs.
 */
export function computeSwitchbackStairLayout(
  sx: number,
  sy: number,
  sz: number,
  opts?: SwitchbackStairOpts,
): StairSwitchbackLayout {
  const climbFull = opts?.climbFullShaft ?? false;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;

  const inset = climbFull
    ? Math.max(0.1, Math.min(hx, hz) * 0.018)
    : Math.max(0.22, Math.min(hx, hz) * 0.038);
  const ix0 = -hx + inset;
  const ix1 = hx - inset;
  const iz0 = -hz + inset;
  const iz1 = hz - inset;
  const Lx = Math.max(ix1 - ix0, 0.35);
  const Lz = Math.max(iz1 - iz0, 0.35);

  /** Reserved void between opposing runs — slightly larger = wider well, slightly narrower strips. */
  const gapMid = 0.15;
  const strip = Math.max(0.28, (Math.min(Lx, Lz) - gapMid) * 0.5);
  /** Tread width across the run (narrower boards read as more shaft gap). */
  const halfAcross = strip * 0.42;

  const zS = iz0 + strip * 0.5;
  const zN = iz1 - strip * 0.5;
  const xE = ix1 - strip * 0.5;
  const xW = ix0 + strip * 0.5;

  const southLen = Math.max(Lx - 2 * strip, 0.35);
  const eastLen = Math.max(Lz - 2 * strip, 0.35);
  const northLen = southLen;
  const westLen = eastLen;
  const per = southLen + eastLen + northLen + westLen;

  const pitGap = 0.032;
  const yLow = -hy + STAIR_WT + 0.1;
  /** Extra void under the top treads = more headroom in the open shaft. */
  const yLastCenter = climbFull
    ? hy - STAIR_WT - 0.38
    : STOREY_SPACING_M - hy + STAIR_WT - 0.06;
  const verticalSpan = Math.max(yLastCenter - yLow, 0.22);
  const runStart = yLow + pitGap;
  const fullClimb = Math.max(0.14, yLastCenter - runStart);

  /** Steeper service stairs (still within common code max rise). */
  const riseMax = climbFull ? 0.198 : 0.168;
  const riseMin = 0.07;
  const maxTreadsPerLap = climbFull ? 240 : 44;

  /** One lap ≈ one storey on mega shafts; vertical pitch of each lap is `advance = nTotal * rise`. */
  const storeyClimb = STOREY_SPACING_M - 0.065;
  const lapInner = climbFull ? storeyClimb : Math.max(0.16, verticalSpan - 2 * pitGap);

  let nTotal = Math.max(10, Math.ceil(lapInner / riseMax + 0.5));
  nTotal = Math.min(maxTreadsPerLap, nTotal);
  let rise = lapInner / Math.max(nTotal - 0.5, 1);
  while (rise > riseMax && nTotal < maxTreadsPerLap) {
    nTotal += 1;
    rise = lapInner / Math.max(nTotal - 0.5, 1);
  }
  while (rise < riseMin && nTotal > 8) {
    nTotal -= 1;
    rise = lapInner / Math.max(nTotal - 0.5, 1);
  }
  rise = Math.max(riseMin, Math.min(riseMax, rise));

  const landTh = Math.max(0.085, Math.min(rise * 0.92, 0.15));
  const lh = strip * 0.5;

  let n1 = Math.max(2, Math.round((nTotal * southLen) / per));
  let n2 = Math.max(2, Math.round((nTotal * eastLen) / per));
  let n3 = Math.max(2, Math.round((nTotal * northLen) / per));
  let n4 = nTotal - n1 - n2 - n3;
  let guard = 0;
  while (n4 < 2 && guard < 40) {
    guard += 1;
    if (n1 > 2) n1 -= 1;
    else if (n2 > 2) n2 -= 1;
    else if (n3 > 2) n3 -= 1;
    else break;
    n4 = nTotal - n1 - n2 - n3;
  }

  /**
   * Short runs (few treads) read as two corner pads + a stub flight. Fold into the **next** leg
   * in climb order and replace with one flat landing along that wall. Wide shallow shafts (large
   * `sz`) often clamp `southLen`/`northLen` → tiny `n1`/`n3`; long narrow shafts clamp `eastLen` →
   * tiny `n2`/`n4`.
   */
  const SHORT_LEG_MERGE_MAX = 3;
  let eastRunMerged = false;
  let westRunMerged = false;
  let southRunMerged = false;
  let northRunMerged = false;
  let southAbsorbed = 0;
  let northAbsorbed = 0;

  if (n2 <= SHORT_LEG_MERGE_MAX) {
    n1 += n2;
    n2 = 0;
    eastRunMerged = true;
  }
  if (n4 <= SHORT_LEG_MERGE_MAX) {
    n3 += n4;
    n4 = 0;
    westRunMerged = true;
  }
  if (n1 <= SHORT_LEG_MERGE_MAX) {
    southAbsorbed = n1;
    n2 += n1;
    n1 = 0;
    southRunMerged = true;
  }
  if (n3 <= SHORT_LEG_MERGE_MAX) {
    northAbsorbed = n3;
    n4 += n3;
    n3 = 0;
    northRunMerged = true;
  }

  const sxLo = ix0 + strip;
  const sxHi = ix1 - strip;
  const sxHalfW = Math.max(lh, (sxHi - sxLo) * 0.5 + 0.02);

  const ezLo = iz0 + strip;
  const ezHi = iz1 - strip;
  const ezMid = (ezLo + ezHi) * 0.5;
  const ezHalfD = Math.max(lh, (ezHi - ezLo) * 0.5 + 0.02);

  const wzHi = iz1 - strip;
  const wzLo = iz0 + strip;
  const wzMid = (wzLo + wzHi) * 0.5;
  const wzHalfD = Math.max(lh, Math.abs(wzHi - wzLo) * 0.5 + 0.02);

  /**
   * Merged pads: **long axis along the wall** (halfW on south/north = X; halfD on east/west = Z),
   * **short axis** `BoxGeometry` half into the racetrack void so they slot against the wall like a
   * board turned 90° from “deep plate” into “strip along the run”.
   */
  const xRunGap = xE - xW;
  const racetrackXMid = (sxLo + sxHi) * 0.5;
  /** South/north wall runs ±X: long in X (`halfW`), thin hugging zS/zN (`halfD`). */
  const southNorthAlongWall = Math.min(
    (ix1 - ix0) * 0.5 - STAIR_WT - 0.012,
    Math.max(sxHalfW + strip * 0.42, xRunGap * 0.56 + lh * 0.34),
  );
  const southNorthWallHug = Math.max(lh * 1.08, strip * 0.48);
  /** East/west wall runs ±Z: long in Z (`halfD`), thin hugging xE/xW (`halfW`). */
  const eastWestAlongWall = Math.min(
    (iz1 - iz0) * 0.5 - STAIR_WT - 0.012,
    Math.max(ezHalfD + strip * 0.34, (ezHi - ezLo) * 0.5 + 0.08),
  );
  const eastWestWallHug = Math.max(lh * 1.14, xRunGap * 0.3);

  const legs: Leg[] = [
    { ax: ix0 + strip, az: zS, bx: ix1 - strip, bz: zS, count: n1 },
    { ax: xE, az: ezLo, bx: xE, bz: ezHi, count: n2 },
    { ax: ix1 - strip, az: zN, bx: ix0 + strip, bz: zN, count: n3 },
    { ax: xW, az: wzHi, bx: xW, bz: wzLo, count: n4 },
  ];

  const advance = nTotal * rise;
  const numLaps = climbFull
    ? Math.max(1, Math.min(120, Math.floor(fullClimb / advance)))
    : 1;

  const treads: StairTreadSpec[] = [];
  const cornerLandings: StairCornerLanding[] = [];

  for (let lap = 0; lap < numLaps; lap++) {
    const runBase = runStart + lap * advance;
    let idx = 0;
    for (const leg of legs) {
      idx = buildLegTreads(leg, runBase, rise, idx, treads, halfAcross);
    }

    const th = landTh * 0.5;

    if (southRunMerged) {
      cornerLandings.push({
        x: racetrackXMid,
        y: runBase + southAbsorbed * 0.5 * rise,
        z: zS,
        halfW: southNorthAlongWall,
        halfD: southNorthWallHug,
        thicknessHalf: th,
      });
    }

    if (eastRunMerged) {
      cornerLandings.push({
        x: xE - eastWestWallHug,
        y: runBase + n1 * rise,
        z: ezMid,
        halfW: eastWestWallHug,
        halfD: eastWestAlongWall,
        thicknessHalf: th,
      });
    } else {
      if (!southRunMerged) {
        cornerLandings.push({
          x: xE,
          y: runBase + n1 * rise,
          z: zS,
          halfW: lh,
          halfD: lh,
          thicknessHalf: th,
        });
      }
      if (!northRunMerged) {
        cornerLandings.push({
          x: xE,
          y: runBase + (n1 + n2) * rise,
          z: zN,
          halfW: lh,
          halfD: lh,
          thicknessHalf: th,
        });
      }
    }

    if (northRunMerged) {
      const yNorth = runBase + (n1 + n2 + northAbsorbed * 0.5) * rise;
      cornerLandings.push({
        x: racetrackXMid,
        y: yNorth,
        z: zN,
        halfW: southNorthAlongWall,
        halfD: southNorthWallHug,
        thicknessHalf: th,
      });
    }

    if (westRunMerged) {
      cornerLandings.push({
        x: xW + eastWestWallHug,
        y: runBase + (n1 + n3) * rise,
        z: ezMid,
        halfW: eastWestWallHug,
        halfD: eastWestAlongWall,
        thicknessHalf: th,
      });
    } else {
      if (!northRunMerged) {
        cornerLandings.push({
          x: xW,
          y: runBase + (n1 + n2 + n3) * rise,
          z: zN,
          halfW: lh,
          halfD: lh,
          thicknessHalf: th,
        });
      }
      if (!southRunMerged) {
        cornerLandings.push({
          x: xW,
          y: runBase + nTotal * rise,
          z: zS,
          halfW: lh,
          halfD: lh,
          thicknessHalf: th,
        });
      }
    }
  }

  const innerWallH = Math.max(sy - 2 * STAIR_WT, 0.08);
  const wallCenterY = (-hy + STAIR_WT) + innerWallH * 0.5;

  return {
    treads,
    cornerLandings,
    hx,
    hy,
    hz,
    ix0,
    ix1,
    iz0,
    iz1,
    innerWallH,
    wallCenterY,
    racetrack: { xE, xW, zN, zS },
  };
}

const FACE_ANCHOR_TOL = 0.42;

function landingNearRacetrackAnchor(
  L: StairSwitchbackLayout,
  cl: StairCornerLanding,
  face: StairShaftCardinalFace,
): boolean {
  const { xE, xW, zN, zS } = L.racetrack;
  switch (face) {
    case "e":
      return Math.abs(cl.x - xE) < FACE_ANCHOR_TOL;
    case "w":
      return Math.abs(cl.x - xW) < FACE_ANCHOR_TOL;
    case "n":
      return Math.abs(cl.z - zN) < FACE_ANCHOR_TOL;
    case "s":
      return Math.abs(cl.z - zS) < FACE_ANCHOR_TOL;
    default:
      return false;
  }
}

/** Along-wall span: +Z for E/W faces, +X for N/S (shaft interior convention). */
function landingAlongSpan(
  cl: StairCornerLanding,
  face: StairShaftCardinalFace,
): readonly [number, number] {
  if (face === "e" || face === "w") {
    return [cl.z - cl.halfD, cl.z + cl.halfD];
  }
  return [cl.x - cl.halfW, cl.x + cl.halfW];
}

/**
 * Corner landing that hosts a corridor door on `face` near `tangentAlongWall`, closest in Y to
 * `targetY` among pads whose along-wall footprint overlaps the door width.
 */
export function pickCornerLandingNearDoorBand(
  L: StairSwitchbackLayout,
  face: StairShaftCardinalFace,
  tangentAlongWall: number,
  doorHalfWidthM: number,
  targetY: number,
): StairCornerLanding | undefined {
  const margin = 0.1;
  const t0 = tangentAlongWall - doorHalfWidthM - margin;
  const t1 = tangentAlongWall + doorHalfWidthM + margin;
  let best: StairCornerLanding | undefined;
  let bestDy = Infinity;
  for (const cl of L.cornerLandings) {
    if (!landingNearRacetrackAnchor(L, cl, face)) continue;
    const [a0, a1] = landingAlongSpan(cl, face);
    if (Math.min(t1, a1) - Math.max(t0, a0) < 0.06) continue;
    const dy = Math.abs(cl.y - targetY);
    if (dy < bestDy) {
      bestDy = dy;
      best = cl;
    }
  }
  return best;
}

/**
 * Recentres the door along the wall tangent so the opening sits on the **corner landing pad**
 * (not only collision-free from treads), clamped to both shaft interior and landing along-wall
 * extents — keeps corridor and stairwell cutouts aligned on the same landing plane.
 */
export function snapStairDoorTangentAlongWallToLanding(
  land: StairCornerLanding,
  face: StairShaftCardinalFace,
  doorHalfWidthM: number,
  sx: number,
  sz: number,
  wallThickness = 0.11,
): number {
  const vlenZ = Math.max(sz - 2 * wallThickness, 0.05);
  const vlenX = Math.max(sx - 2 * wallThickness, 0.05);
  const m = 0.02;
  const dw = doorHalfWidthM;
  if (face === "e" || face === "w") {
    const hzIn = vlenZ * 0.5;
    const shaftLo = -hzIn + dw + m;
    const shaftHi = hzIn - dw - m;
    const landLo = land.z - land.halfD + dw + m;
    const landHi = land.z + land.halfD - dw - m;
    const cMin = Math.max(shaftLo, landLo);
    const cMax = Math.min(shaftHi, landHi);
    if (cMax >= cMin - 1e-5) {
      return Math.min(Math.max(land.z, cMin), cMax);
    }
    return Math.min(Math.max(land.z, shaftLo), shaftHi);
  }
  const hxIn = vlenX * 0.5;
  const shaftLo = -hxIn + dw + m;
  const shaftHi = hxIn - dw - m;
  const landLo = land.x - land.halfW + dw + m;
  const landHi = land.x + land.halfW - dw - m;
  const cMin = Math.max(shaftLo, landLo);
  const cMax = Math.min(shaftHi, landHi);
  if (cMax >= cMin - 1e-5) {
    return Math.min(Math.max(land.x, cMin), cMax);
  }
  return Math.min(Math.max(land.x, shaftLo), shaftHi);
}

/**
 * Along-wall shift (m) so the door moves **to the viewer’s right** when standing inside the shaft
 * facing the opening (Y up, +X/+Z “out” conventions match {@link pickStairShaftGroundDoorPlacement}).
 */
export const STAIR_DOOR_VIEWER_RIGHT_BIAS_M = 0.52;

function clampStairDoorTangentAlongInnerWall(
  face: StairShaftCardinalFace,
  tang: number,
  doorHalfWidthM: number,
  sx: number,
  sz: number,
  wallThickness: number,
): number {
  const vlenZ = Math.max(sz - 2 * wallThickness, 0.05);
  const vlenX = Math.max(sx - 2 * wallThickness, 0.05);
  const m = 0.02;
  const dw = doorHalfWidthM;
  if (face === "e" || face === "w") {
    const lo = -vlenZ * 0.5 + dw + m;
    const hi = vlenZ * 0.5 - dw - m;
    return Math.min(Math.max(tang, lo), hi);
  }
  const lo = -vlenX * 0.5 + dw + m;
  const hi = vlenX * 0.5 - dw - m;
  return Math.min(Math.max(tang, lo), hi);
}

/**
 * Nudges the door along the wall tangent **viewer-right from inside the shaft** (Y up). If that
 * direction is already hard against the inner-wall clamp (common on **west** doors at −Z),
 * nudges the **opposite** way so the opening still shifts on the pad instead of appearing frozen.
 */
export function shiftStairDoorTangentViewerRightFromInside(
  face: StairShaftCardinalFace,
  tang: number,
  doorHalfWidthM: number,
  sx: number,
  sz: number,
  wallThickness = 0.11,
): number {
  const b = STAIR_DOOR_VIEWER_RIGHT_BIAS_M;
  /** +Z when facing out +X (e); −Z when facing −X (w); −X when facing +Z (n); +X when facing −Z (s). */
  const sign = face === "e" || face === "s" ? 1 : -1;
  const tryShift = (delta: number): number =>
    clampStairDoorTangentAlongInnerWall(
      face,
      tang + delta,
      doorHalfWidthM,
      sx,
      sz,
      wallThickness,
    );
  const primary = tryShift(sign * b);
  if (Math.abs(primary - tang) > 1e-3) return primary;
  const fallback = tryShift(-sign * b);
  if (Math.abs(fallback - tang) > 1e-3) return fallback;
  return tang;
}

export function shaftFloorLocalTopY(sy: number): number {
  const hy = sy * 0.5;
  return -hy + STAIR_WT;
}

export function hollowShellFloorLocalTopY(sy: number): number {
  const hy = sy * 0.5;
  const wt = 0.12;
  return -hy + wt;
}
