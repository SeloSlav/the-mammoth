/**
 * Potentially-visible-set for corridor / hallway and in-unit views on one storey.
 *
 * Every residential unit on the player's storey within {@link APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M}
 * of the camera is eligible (same-storey slab rendering). Open entry doors add units whose doors are
 * farther than that radius but still admit a peek.
 */

/** Replicated `swing_open_01` at/above this admits corridor PVS into a unit interior. */
export const APARTMENT_DOOR_PVS_INTERIOR_PEEK_OPEN_01 = 0.15;
/**
 * Horizontal radius (m) around the camera for **open doorway** PVS (door hinge must admit peek).
 * Cached client queries may conservatively pad this radius by their local visibility-volume radius.
 */
export const APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M = 9.5;

export type BuildingCorridorPvsDoorEntry = {
  unitKey: string;
  unitId: string;
  level: number;
  open01: number;
  /** Per-unit apartment entry doors only — excludes stair / manual corridor doors. */
  isResidentialUnitDoor: boolean;
  /** World-space hinge + closed panel span; optional for old callers/tests that only need level PVS. */
  hingeX?: number;
  hingeZ?: number;
  tangentX?: number;
  tangentZ?: number;
  panelWidthM?: number;
};

export type BuildOpenDoorUnitKeysByLevelOpts = {
  cameraX?: number;
  cameraZ?: number;
  /** Override the default camera-distance budget, for conservative cached visibility queries. */
  maxDistM?: number;
  /** Ignored — kept so callers can pass view direction without churn. */
  viewDirX?: number;
  viewDirZ?: number;
};

export function apartmentDoorAdmitsCorridorInteriorPeek(open01: number): boolean {
  return open01 >= APARTMENT_DOOR_PVS_INTERIOR_PEEK_OPEN_01;
}

function apartmentDoorPassesCorridorCameraPvs(
  door: BuildingCorridorPvsDoorEntry,
  opts?: BuildOpenDoorUnitKeysByLevelOpts,
): boolean {
  if (opts?.cameraX === undefined || opts?.cameraZ === undefined) return true;
  if (
    door.hingeX === undefined ||
    door.hingeZ === undefined ||
    door.tangentX === undefined ||
    door.tangentZ === undefined ||
    door.panelWidthM === undefined
  ) {
    return true;
  }

  const cx = door.hingeX + door.tangentX * door.panelWidthM * 0.5;
  const cz = door.hingeZ + door.tangentZ * door.panelWidthM * 0.5;
  const dx = cx - opts.cameraX;
  const dz = cz - opts.cameraZ;
  const maxDistM = opts.maxDistM ?? APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M;
  return dx * dx + dz * dz <= maxDistM ** 2;
}

export function buildOpenDoorUnitKeysByLevel(
  doors: readonly BuildingCorridorPvsDoorEntry[],
  opts?: BuildOpenDoorUnitKeysByLevelOpts,
): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i]!;
    if (!d.isResidentialUnitDoor) continue;
    if (!apartmentDoorAdmitsCorridorInteriorPeek(d.open01)) continue;
    if (!apartmentDoorPassesCorridorCameraPvs(d, opts)) continue;
    let set = out.get(d.level);
    if (!set) {
      set = new Set<string>();
      out.set(d.level, set);
    }
    set.add(d.unitKey);
  }
  return out;
}

export type BuildingStoreyUnitBoundsEntry = {
  unitKey: string;
  unitId: string;
  level: number;
  /** Hull center XZ - fallback for old callers that do not provide bounds. */
  centerX: number;
  centerZ: number;
  /** World-space hull bounds - used so large units are admitted when their near edge is visible. */
  minX?: number;
  maxX?: number;
  minZ?: number;
  maxZ?: number;
};

function distanceSqToStoreyUnitBoundsXZ(
  unit: BuildingStoreyUnitBoundsEntry,
  cameraX: number,
  cameraZ: number,
): number {
  if (
    unit.minX !== undefined &&
    unit.maxX !== undefined &&
    unit.minZ !== undefined &&
    unit.maxZ !== undefined
  ) {
    const dx =
      cameraX < unit.minX
        ? unit.minX - cameraX
        : cameraX > unit.maxX
          ? cameraX - unit.maxX
          : 0;
    const dz =
      cameraZ < unit.minZ
        ? unit.minZ - cameraZ
        : cameraZ > unit.maxZ
          ? cameraZ - unit.maxZ
          : 0;
    return dx * dx + dz * dz;
  }
  const dx = unit.centerX - cameraX;
  const dz = unit.centerZ - cameraZ;
  return dx * dx + dz * dz;
}

export function buildStoreyRadiusVisibleUnitKeys(
  units: readonly BuildingStoreyUnitBoundsEntry[],
  input: {
    storeyLevel: number;
    cameraX: number;
    cameraZ: number;
    maxDistM?: number;
  },
): Set<string> {
  const maxDistSq =
    (input.maxDistM ?? APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M) ** 2;
  const out = new Set<string>();
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (u.level !== input.storeyLevel) continue;
    if (distanceSqToStoreyUnitBoundsXZ(u, input.cameraX, input.cameraZ) <= maxDistSq) {
      out.add(u.unitKey);
    }
  }
  return out;
}

export type ResolveCorridorPvsVisibleUnitsInput = {
  playerLevel: number;
  insideResidentialUnit: boolean;
  insideApartmentInteriorLightingZone: boolean;
  containingUnitKey: string | null;
  retainedUnitKey: string | null;
  openDoorUnitKeysByLevel: ReadonlyMap<number, ReadonlySet<string>>;
  /** All units on {@link playerLevel} within the interior peek radius (omnidirectional). */
  storeyRadiusVisibleUnitKeys?: ReadonlySet<string>;
  unitIdForKey: (unitKey: string) => string | null;
};

export type CorridorPvsVisibleUnits = {
  unitKeys: ReadonlySet<string>;
  unitIds: ReadonlySet<string>;
};

export function resolveCorridorPvsVisibleUnits(
  input: ResolveCorridorPvsVisibleUnitsInput,
): CorridorPvsVisibleUnits {
  const unitKeys = new Set<string>();
  const unitIds = new Set<string>();

  const addKey = (key: string | null | undefined): void => {
    if (!key) return;
    unitKeys.add(key);
    const id = input.unitIdForKey(key);
    if (id) unitIds.add(id);
  };

  const addStoreyRadiusKeys = (): void => {
    const radiusKeys = input.storeyRadiusVisibleUnitKeys;
    if (!radiusKeys) return;
    for (const key of radiusKeys) addKey(key);
  };

  if (input.insideResidentialUnit) {
    addKey(input.containingUnitKey);
    addKey(input.retainedUnitKey);
    addStoreyRadiusKeys();
    return { unitKeys, unitIds };
  }

  if (!input.insideApartmentInteriorLightingZone) {
    return { unitKeys, unitIds };
  }

  addKey(input.containingUnitKey);
  addKey(input.retainedUnitKey);
  addStoreyRadiusKeys();

  const openOnLevel = input.openDoorUnitKeysByLevel.get(input.playerLevel);
  if (openOnLevel) {
    for (const key of openOnLevel) addKey(key);
  }

  return { unitKeys, unitIds };
}

export function unitInteriorVisibleViaCorridorPvs(input: {
  residentialUnitId: string | null;
  corridorPvsVisibleUnitIds: ReadonlySet<string>;
  isResidentialShellPlaster: boolean;
}): boolean {
  if (!input.residentialUnitId) return false;
  if (!input.corridorPvsVisibleUnitIds.has(input.residentialUnitId)) return false;
  return input.isResidentialShellPlaster;
}

export function apartmentDecorUnitVisibleViaPvs(input: {
  groupUnitKey: string | undefined;
  visibleUnitKeys: ReadonlySet<string> | null;
}): boolean {
  if (!input.visibleUnitKeys || input.visibleUnitKeys.size === 0) return false;
  if (input.groupUnitKey === undefined) return false;
  return input.visibleUnitKeys.has(input.groupUnitKey);
}
