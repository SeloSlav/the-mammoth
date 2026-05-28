/**
 * Potentially-visible-set for corridor / hallway and in-unit views on one storey.
 *
 * Every residential unit on the player's storey within {@link APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M}
 * of the camera is eligible (same-time slab rendering). Open entry doors add units whose doors are
 * farther than that radius but still admit a peek.
 */

/** Replicated `swing_open_01` at/above this admits corridor PVS into a unit interior. */
export const APARTMENT_DOOR_PVS_INTERIOR_PEEK_OPEN_01 = 0.15;
/**
 * Horizontal radius (m) around the camera: every open residential doorway on the current storey
 * inside this circle may submit unit plaster + decor. Omnidirectional so quick 180° turns do not
 * flash bare shells across the hall.
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
  return dx * dx + dz * dz <= APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M ** 2;
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
  /** Hull center XZ — used for camera-distance culling on the active storey. */
  centerX: number;
  centerZ: number;
};

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
    const dx = u.centerX - input.cameraX;
    const dz = u.centerZ - input.cameraZ;
    if (dx * dx + dz * dz <= maxDistSq) {
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
