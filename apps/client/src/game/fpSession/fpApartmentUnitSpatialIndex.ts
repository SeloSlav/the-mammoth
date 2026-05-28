import type { ApartmentUnit } from "../../module_bindings/types";

export type ApartmentUnitFeetSlackOpts = {
  slackXZ?: number;
  slackYBelow?: number;
  slackYAbove?: number;
};

function feetInsideUnitHull(u: ApartmentUnit, x: number, y: number, z: number): boolean {
  return (
    x >= u.boundMinX &&
    x <= u.boundMaxX &&
    y >= u.boundMinY &&
    y <= u.boundMaxY &&
    z >= u.boundMinZ &&
    z <= u.boundMaxZ
  );
}

function feetInsideUnitHullSlack(
  u: ApartmentUnit,
  x: number,
  y: number,
  z: number,
  slackXZ: number,
  slackYBelow: number,
  slackYAbove: number,
): boolean {
  return (
    x >= u.boundMinX - slackXZ &&
    x <= u.boundMaxX + slackXZ &&
    y >= u.boundMinY - slackYBelow &&
    y <= u.boundMaxY + slackYAbove &&
    z >= u.boundMinZ - slackXZ &&
    z <= u.boundMaxZ + slackXZ
  );
}

function pickNearestUnit(
  candidates: readonly ApartmentUnit[],
  x: number,
  z: number,
): ApartmentUnit | null {
  let best: ApartmentUnit | null = null;
  let bestD = Infinity;
  for (const u of candidates) {
    const cx = (u.boundMinX + u.boundMaxX) * 0.5;
    const cz = (u.boundMinZ + u.boundMaxZ) * 0.5;
    const d = (x - cx) ** 2 + (z - cz) ** 2;
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

/**
 * XZ grid over apartment unit hulls — avoids per-frame linear scans over `conn.db.apartment_unit`.
 */
export type ApartmentUnitSpatialIndex = {
  rebuild: (units: readonly ApartmentUnit[]) => void;
  forEachUnit: (fn: (unit: ApartmentUnit) => void) => void;
  unitAtFeet: (x: number, y: number, z: number) => ApartmentUnit | null;
  unitAtFeetSlack: (
    x: number,
    y: number,
    z: number,
    opts?: ApartmentUnitFeetSlackOpts,
  ) => ApartmentUnit | null;
};

export function createApartmentUnitSpatialIndex(): ApartmentUnitSpatialIndex {
  let units: ApartmentUnit[] = [];
  let minX = 0;
  let maxX = 0;
  let minZ = 0;
  let maxZ = 0;
  let cell = 8;
  let nx = 1;
  let nz = 1;
  const cells: ApartmentUnit[][] = [];

  const cellIndex = (ix: number, iz: number) => ix + iz * nx;

  const rebuild = (next: readonly ApartmentUnit[]): void => {
    units = [...next];
    if (units.length === 0) {
      nx = 1;
      nz = 1;
      cell = 8;
      cells.length = 0;
      cells[0] = [];
      return;
    }
    minX = Infinity;
    maxX = -Infinity;
    minZ = Infinity;
    maxZ = -Infinity;
    for (const u of units) {
      minX = Math.min(minX, u.boundMinX);
      maxX = Math.max(maxX, u.boundMaxX);
      minZ = Math.min(minZ, u.boundMinZ);
      maxZ = Math.max(maxZ, u.boundMaxZ);
    }
    const pad = 1;
    minX -= pad;
    maxX += pad;
    minZ -= pad;
    maxZ += pad;
    const spanX = Math.max(maxX - minX, 1);
    const spanZ = Math.max(maxZ - minZ, 1);
    const target = 32;
    cell = Math.max(6, Math.max(spanX / target, spanZ / target));
    nx = Math.max(1, Math.ceil(spanX / cell));
    nz = Math.max(1, Math.ceil(spanZ / cell));
    cells.length = nx * nz;
    for (let i = 0; i < cells.length; i++) cells[i] = [];
    for (const u of units) {
      const ix0 = Math.max(0, Math.floor((u.boundMinX - minX) / cell));
      const ix1 = Math.min(nx - 1, Math.floor((u.boundMaxX - minX) / cell));
      const iz0 = Math.max(0, Math.floor((u.boundMinZ - minZ) / cell));
      const iz1 = Math.min(nz - 1, Math.floor((u.boundMaxZ - minZ) / cell));
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          cells[cellIndex(ix, iz)]!.push(u);
        }
      }
    }
  };

  const collectAt = (x: number, z: number): ApartmentUnit[] => {
    if (units.length === 0) return [];
    const ix = Math.max(0, Math.min(nx - 1, Math.floor((x - minX) / cell)));
    const iz = Math.max(0, Math.min(nz - 1, Math.floor((z - minZ) / cell)));
    return cells[cellIndex(ix, iz)] ?? [];
  };

  return {
    rebuild,
    forEachUnit(fn) {
      for (const u of units) fn(u);
    },
    unitAtFeet(x, y, z) {
      const hits: ApartmentUnit[] = [];
      for (const u of collectAt(x, z)) {
        if (feetInsideUnitHull(u, x, y, z)) hits.push(u);
      }
      return pickNearestUnit(hits, x, z);
    },
    unitAtFeetSlack(x, y, z, opts) {
      const slackXZ = opts?.slackXZ ?? 0.28;
      const slackYBelow = opts?.slackYBelow ?? 0.12;
      const slackYAbove = opts?.slackYAbove ?? 0.35;
      const hits: ApartmentUnit[] = [];
      for (const u of collectAt(x, z)) {
        if (feetInsideUnitHullSlack(u, x, y, z, slackXZ, slackYBelow, slackYAbove)) {
          hits.push(u);
        }
      }
      return pickNearestUnit(hits, x, z);
    },
  };
}
