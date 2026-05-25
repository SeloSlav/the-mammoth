/**
 * Door-aware potentially-visible-set for corridor / hallway views.
 *
 * Units stay culled until their entry door opens enough to admit an interior peek — avoids
 * submitting neighbor furnished GLBs and plaster through closed doors while still allowing
 * doorway sightlines when doors are open.
 */

/** Replicated `swing_open_01` at/above this admits corridor PVS into a unit interior. */
export const APARTMENT_DOOR_PVS_INTERIOR_PEEK_OPEN_01 = 0.15;

export type BuildingCorridorPvsDoorEntry = {
  unitKey: string;
  unitId: string;
  level: number;
  open01: number;
  /** Per-unit apartment entry doors only — excludes stair / manual corridor doors. */
  isResidentialUnitDoor: boolean;
};

export function apartmentDoorAdmitsCorridorInteriorPeek(open01: number): boolean {
  return open01 >= APARTMENT_DOOR_PVS_INTERIOR_PEEK_OPEN_01;
}

export function buildOpenDoorUnitKeysByLevel(
  doors: readonly BuildingCorridorPvsDoorEntry[],
): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i]!;
    if (!d.isResidentialUnitDoor) continue;
    if (!apartmentDoorAdmitsCorridorInteriorPeek(d.open01)) continue;
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
