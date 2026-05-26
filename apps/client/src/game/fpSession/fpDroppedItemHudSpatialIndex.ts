import type { DroppedItem } from "../../module_bindings/types";
import {
  droppedItemIsWorldAnchor,
  droppedPickupWithinServerVolume,
  MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M,
  MAMMOTH_PICKUP_RADIUS_M,
  tryNormalizeDroppedItemId,
  type MammothDroppedPickupBandOpts,
} from "../worldRuntime/droppedItemWorldRuntime.js";

export type NearestDroppedPickup = {
  droppedItemId: bigint;
  defId: string;
};

const HUD_CELL_M = 4;

export type DroppedItemHudSpatialIndex = {
  rebuild: (rows: readonly DroppedItem[]) => void;
  findNearest: (
    x: number,
    y: number,
    z: number,
    radiusM?: number,
    maxAbsDyM?: number,
    verticalBands?: MammothDroppedPickupBandOpts | null,
  ) => { worldAnchor: NearestDroppedPickup | null; plain: NearestDroppedPickup | null };
};

export function createDroppedItemHudSpatialIndex(): DroppedItemHudSpatialIndex {
  let rows: DroppedItem[] = [];
  let minX = 0;
  let minZ = 0;
  let cell = HUD_CELL_M;
  let nx = 1;
  let nz = 1;
  const cells: DroppedItem[][] = [];

  const cellIndex = (ix: number, iz: number) => ix + iz * nx;

  const rebuild = (next: readonly DroppedItem[]): void => {
    rows = [...next];
    if (rows.length === 0) {
      nx = 1;
      nz = 1;
      cells.length = 0;
      cells[0] = [];
      return;
    }
    minX = Infinity;
    let maxX = -Infinity;
    minZ = Infinity;
    let maxZ = -Infinity;
    for (const r of rows) {
      minX = Math.min(minX, r.x);
      maxX = Math.max(maxX, r.x);
      minZ = Math.min(minZ, r.z);
      maxZ = Math.max(maxZ, r.z);
    }
    const pad = radiusPad(MAMMOTH_PICKUP_RADIUS_M);
    minX -= pad;
    maxX += pad;
    minZ -= pad;
    maxZ += pad;
    const spanX = Math.max(maxX - minX, 1);
    const spanZ = Math.max(maxZ - minZ, 1);
    nx = Math.max(1, Math.ceil(spanX / cell));
    nz = Math.max(1, Math.ceil(spanZ / cell));
    cells.length = nx * nz;
    for (let i = 0; i < cells.length; i++) cells[i] = [];
    for (const r of rows) {
      const ix = Math.max(0, Math.min(nx - 1, Math.floor((r.x - minX) / cell)));
      const iz = Math.max(0, Math.min(nz - 1, Math.floor((r.z - minZ) / cell)));
      cells[cellIndex(ix, iz)]!.push(r);
    }
  };

  function radiusPad(radiusM: number): number {
    return radiusM + cell;
  }

  const collectNear = (x: number, z: number, radiusM: number): DroppedItem[] => {
    if (rows.length === 0) return [];
    const pad = radiusPad(radiusM);
    const x0 = x - pad;
    const x1 = x + pad;
    const z0 = z - pad;
    const z1 = z + pad;
    const ix0 = Math.max(0, Math.floor((x0 - minX) / cell));
    const ix1 = Math.min(nx - 1, Math.floor((x1 - minX) / cell));
    const iz0 = Math.max(0, Math.floor((z0 - minZ) / cell));
    const iz1 = Math.min(nz - 1, Math.floor((z1 - minZ) / cell));
    const out: DroppedItem[] = [];
    const seen = new Set<string>();
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        for (const r of cells[cellIndex(ix, iz)] ?? []) {
          const key = String(r.id);
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(r);
        }
      }
    }
    return out;
  };

  return {
    rebuild,
    findNearest(
      x,
      y,
      z,
      radiusM = MAMMOTH_PICKUP_RADIUS_M,
      maxAbsDyM = MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M,
      verticalBands = null,
    ) {
      let bestWorld: NearestDroppedPickup | null = null;
      let bestWorldDxz = Infinity;
      let bestPlain: NearestDroppedPickup | null = null;
      let bestPlainDxz = Infinity;
      for (const row of collectNear(x, z, radiusM)) {
        if (
          !droppedPickupWithinServerVolume(
            x,
            y,
            z,
            row.x,
            row.y,
            row.z,
            radiusM,
            maxAbsDyM,
            verticalBands,
          )
        ) {
          continue;
        }
        const dx = row.x - x;
        const dz = row.z - z;
        const dxz = dx * dx + dz * dz;
        const isWorld = droppedItemIsWorldAnchor(row);
        const nid = tryNormalizeDroppedItemId(row.id);
        if (nid === null) continue;
        const hit: NearestDroppedPickup = { droppedItemId: nid, defId: row.defId };
        if (isWorld) {
          if (dxz < bestWorldDxz) {
            bestWorldDxz = dxz;
            bestWorld = hit;
          }
        } else if (dxz < bestPlainDxz) {
          bestPlainDxz = dxz;
          bestPlain = hit;
        }
      }
      return { worldAnchor: bestWorld, plain: bestPlain };
    },
  };
}
