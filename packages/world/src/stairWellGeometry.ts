/**
 * **Rectangular stair shaft** — racetrack: four wall runs + **four corner landings** every lap.
 * Mega shafts use **the same lap** (same tread count, rise, corners) repeated **floor-by-floor**
 * so the climb reads as one orderly system.
 *
 * Must match `DEFAULT_BUILDING_FLOOR_SPACING_M` / `STOREY_SPACING_M` in generator.
 */
const STOREY_SPACING_M = 60 / 19;

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
};

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

  const legs: Leg[] = [
    { ax: ix0 + strip, az: zS, bx: ix1 - strip, bz: zS, count: n1 },
    { ax: xE, az: iz0 + strip, bx: xE, bz: iz1 - strip, count: n2 },
    { ax: ix1 - strip, az: zN, bx: ix0 + strip, bz: zN, count: n3 },
    { ax: xW, az: iz1 - strip, bx: xW, bz: iz0 + strip, count: n4 },
  ];

  const advance = nTotal * rise;
  const numLaps = climbFull
    ? Math.max(1, Math.min(120, Math.floor(fullClimb / advance)))
    : 1;

  const landTh = Math.max(0.085, Math.min(rise * 0.92, 0.15));
  const lh = strip * 0.5;

  const treads: StairTreadSpec[] = [];
  const cornerLandings: StairCornerLanding[] = [];

  for (let lap = 0; lap < numLaps; lap++) {
    const runBase = runStart + lap * advance;
    let idx = 0;
    for (const leg of legs) {
      idx = buildLegTreads(leg, runBase, rise, idx, treads, halfAcross);
    }

    /** Four corners every lap (SW was missing before). */
    cornerLandings.push(
      {
        x: xE,
        y: runBase + n1 * rise,
        z: zS,
        halfW: lh,
        halfD: lh,
        thicknessHalf: landTh * 0.5,
      },
      {
        x: xE,
        y: runBase + (n1 + n2) * rise,
        z: zN,
        halfW: lh,
        halfD: lh,
        thicknessHalf: landTh * 0.5,
      },
      {
        x: xW,
        y: runBase + (n1 + n2 + n3) * rise,
        z: zN,
        halfW: lh,
        halfD: lh,
        thicknessHalf: landTh * 0.5,
      },
      {
        x: xW,
        y: runBase + nTotal * rise,
        z: zS,
        halfW: lh,
        halfD: lh,
        thicknessHalf: landTh * 0.5,
      },
    );
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
  };
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
