/**
 * Door-aware potentially-visible-set for corridor / hallway views.
 *
 * Units stay culled until their entry door opens enough to admit an interior peek — avoids
 * submitting neighbor furnished GLBs and plaster through closed doors while still allowing
 * doorway sightlines when doors are open.
 */

/** Replicated `swing_open_01` at/above this admits corridor PVS into a unit interior. */
export const APARTMENT_DOOR_PVS_INTERIOR_PEEK_OPEN_01 = 0.15;
/** Corridor door interiors are expensive; only nearby/open doorways participate in hallway PVS. */
export const APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M = 9.5;
/** Very close doorways remain visible even while the player looks sideways across the threshold. */
export const APARTMENT_DOOR_PVS_INTERIOR_PEEK_NEAR_DIST_M = 2.75;
/** Beyond the near radius, the doorway must be at least slightly ahead of the camera. */
export const APARTMENT_DOOR_PVS_INTERIOR_PEEK_MIN_FORWARD_M = 0.35;

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
  if (
    opts?.cameraX === undefined ||
    opts.cameraZ === undefined ||
    opts.viewDirX === undefined ||
    opts.viewDirZ === undefined ||
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
  const distSq = dx * dx + dz * dz;
  if (distSq > APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M ** 2) return false;
  if (distSq <= APARTMENT_DOOR_PVS_INTERIOR_PEEK_NEAR_DIST_M ** 2) return true;

  const dirLen = Math.hypot(opts.viewDirX, opts.viewDirZ);
  if (dirLen < 1e-4) return true;
  const forward = (dx * opts.viewDirX + dz * opts.viewDirZ) / dirLen;
  return forward >= APARTMENT_DOOR_PVS_INTERIOR_PEEK_MIN_FORWARD_M;
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

export type ResolveCorridorPvsVisibleUnitsInput = {
  playerLevel: number;
  insideResidentialUnit: boolean;
  insideApartmentInteriorLightingZone: boolean;
  containingUnitKey: string | null;
  retainedUnitKey: string | null;
  openDoorUnitKeysByLevel: ReadonlyMap<number, ReadonlySet<string>>;
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

  if (input.insideResidentialUnit) {
    addKey(input.containingUnitKey);
    return { unitKeys, unitIds };
  }

  if (!input.insideApartmentInteriorLightingZone) {
    return { unitKeys, unitIds };
  }

  addKey(input.containingUnitKey);
  addKey(input.retainedUnitKey);

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
