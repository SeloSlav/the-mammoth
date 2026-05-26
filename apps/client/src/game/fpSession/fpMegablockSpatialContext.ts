import type { DbConnection } from "../../module_bindings";
import type { ApartmentUnit, DroppedItem } from "../../module_bindings/types";
import {
  buildWalkSurfaceSpatialIndex,
  filterWalkSurfaceAabbsByStoreyBand,
  WALK_SURFACE_STOREY_BAND_DISABLED,
  type SampleWalkGroundOpts,
  type WalkSurfaceAabb,
  type WalkSurfaceStoreyFilterOpts,
} from "@the-mammoth/world";
import {
  createApartmentUnitSpatialIndex,
  type ApartmentUnitFeetSlackOpts,
  type ApartmentUnitSpatialIndex,
} from "./fpApartmentUnitSpatialIndex.js";
import {
  createDroppedItemHudSpatialIndex,
  type DroppedItemHudSpatialIndex,
} from "./fpDroppedItemHudSpatialIndex.js";
import {
  sampleMegablockWalkTopBase,
  type FpStairShaftInteriorLightBounds,
} from "./fpSessionWorldMount.js";

export type FpMegablockSpatialContextOpts = {
  conn: DbConnection;
  walkAabbsFull: readonly WalkSurfaceAabb[];
  walkFootprint: { minX: number; maxX: number; minZ: number; maxZ: number };
  stairWalkSupportSurfaces: Parameters<typeof sampleMegablockWalkTopBase>[2];
  storeyFilterBase: Omit<WalkSurfaceStoreyFilterOpts, "bandLo" | "bandHi">;
  stairShaftBounds: readonly FpStairShaftInteriorLightBounds[];
};

export type FpMegablockSpatialContext = {
  readonly units: ApartmentUnitSpatialIndex;
  readonly drops: DroppedItemHudSpatialIndex;
  syncUnitsFromDb: () => void;
  syncDropsFromDb: () => void;
  unitAtFeet: (x: number, y: number, z: number) => ApartmentUnit | null;
  unitAtFeetSlack: (
    x: number,
    y: number,
    z: number,
    opts?: ApartmentUnitFeetSlackOpts,
  ) => ApartmentUnit | null;
  setWalkSampleStoreyBand: (lo: number, hi: number) => void;
  sampleWalkTopBase: (
    worldX: number,
    worldZ: number,
    probeTopY: number,
    sampleOpts?: SampleWalkGroundOpts,
  ) => number;
  bindTableInvalidation: () => () => void;
};

function aabbOverlapsStairBounds(
  aabb: WalkSurfaceAabb,
  bounds: readonly FpStairShaftInteriorLightBounds[],
): boolean {
  const cx = (aabb.min[0] + aabb.max[0]) * 0.5;
  const cy = (aabb.min[1] + aabb.max[1]) * 0.5;
  const cz = (aabb.min[2] + aabb.max[2]) * 0.5;
  for (const b of bounds) {
    if (
      cx >= b.minX &&
      cx <= b.maxX &&
      cy >= b.minY &&
      cy <= b.maxY &&
      cz >= b.minZ &&
      cz <= b.maxZ
    ) {
      return true;
    }
  }
  return false;
}

export function createFpMegablockSpatialContext(
  opts: FpMegablockSpatialContextOpts,
): FpMegablockSpatialContext {
  const units = createApartmentUnitSpatialIndex();
  const drops = createDroppedItemHudSpatialIndex();

  const fullWalkIndex = buildWalkSurfaceSpatialIndex(opts.walkAabbsFull);
  let bandLo = WALK_SURFACE_STOREY_BAND_DISABLED;
  let bandHi = WALK_SURFACE_STOREY_BAND_DISABLED;
  let filteredWalkIndex = fullWalkIndex;
  let lastFilteredBandKey = "";

  const alwaysInclude = (aabb: WalkSurfaceAabb): boolean =>
    aabbOverlapsStairBounds(aabb, opts.stairShaftBounds);

  const rebuildWalkIndex = (): void => {
    const key = `${bandLo}:${bandHi}`;
    if (key === lastFilteredBandKey) return;
    lastFilteredBandKey = key;
    if (bandLo <= WALK_SURFACE_STOREY_BAND_DISABLED) {
      filteredWalkIndex = fullWalkIndex;
      return;
    }
    const subset = filterWalkSurfaceAabbsByStoreyBand(opts.walkAabbsFull, {
      ...opts.storeyFilterBase,
      bandLo,
      bandHi,
      alwaysInclude,
    });
    filteredWalkIndex = buildWalkSurfaceSpatialIndex(subset);
  };

  const syncUnitsFromDb = (): void => {
    const list: ApartmentUnit[] = [];
    for (const row of opts.conn.db.apartment_unit) {
      list.push(row as ApartmentUnit);
    }
    units.rebuild(list);
  };

  const syncDropsFromDb = (): void => {
    const list: DroppedItem[] = [];
    for (const row of opts.conn.db.dropped_item) {
      list.push(row as DroppedItem);
    }
    drops.rebuild(list);
  };

  syncUnitsFromDb();
  syncDropsFromDb();

  const sampleWithIndex = (
    index: ReturnType<typeof buildWalkSurfaceSpatialIndex>,
    worldX: number,
    worldZ: number,
    probeTopY: number,
    sampleOpts?: SampleWalkGroundOpts,
  ): number =>
    sampleMegablockWalkTopBase(
      index,
      opts.walkFootprint,
      opts.stairWalkSupportSurfaces,
      worldX,
      worldZ,
      probeTopY,
      sampleOpts,
    );

  return {
    units,
    drops,
    syncUnitsFromDb,
    syncDropsFromDb,
    unitAtFeet: (x, y, z) => units.unitAtFeet(x, y, z),
    unitAtFeetSlack: (x, y, z, slack) => units.unitAtFeetSlack(x, y, z, slack),
    setWalkSampleStoreyBand(lo, hi) {
      bandLo = lo;
      bandHi = hi;
      rebuildWalkIndex();
    },
    sampleWalkTopBase(worldX, worldZ, probeTopY, sampleOpts) {
      const filtered = sampleWithIndex(
        filteredWalkIndex,
        worldX,
        worldZ,
        probeTopY,
        sampleOpts,
      );
      if (Number.isFinite(filtered)) return filtered;
      return sampleWithIndex(fullWalkIndex, worldX, worldZ, probeTopY, sampleOpts);
    },
    bindTableInvalidation() {
      const { conn } = opts;
      const bumpUnits = () => syncUnitsFromDb();
      const bumpDrops = () => syncDropsFromDb();
      conn.db.apartment_unit.onInsert(bumpUnits);
      conn.db.apartment_unit.onUpdate(bumpUnits);
      conn.db.apartment_unit.onDelete(bumpUnits);
      conn.db.dropped_item.onInsert(bumpDrops);
      conn.db.dropped_item.onUpdate(bumpDrops);
      conn.db.dropped_item.onDelete(bumpDrops);
      return () => {};
    },
  };
}
