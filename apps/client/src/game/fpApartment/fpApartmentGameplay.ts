/**
 * MVP apartment claim / reinforcement / stash proximity — mirrors server bbox tests in {@link ApartmentUnit}.
 */
import type { Identity } from "spacetimedb";
import type { ApartmentDoor, ApartmentUnit } from "../../module_bindings/types";
import type { DbConnection } from "../../module_bindings";

export const UNIT_STATE_UNCLAIMED = 0;
export const UNIT_STATE_CLAIMED = 1;
export const UNIT_STATE_BROKEN = 2;

/** Must match `CLAIM_FULL_SECS` in `apps/server/src/apartments.rs`. */
export const APARTMENT_CLAIM_FULL_SECS = 42;

export function residentUnitKeyFromParts(floorDocId: string, level: number, templateId: string): string {
  const uid = templateId.split("|")[0] ?? "";
  return `${floorDocId}|${level}|${uid}`;
}

export function residentUnitKeyFromDoor(d: ApartmentDoor): string {
  return residentUnitKeyFromParts(d.floorDocId, d.level, d.templateId);
}

/** Human-facing label — keep in sync with `format_apartment_public_label` in `apartments.rs`. */
export function formatApartmentPublicLabel(u: Pick<ApartmentUnit, "level" | "unitId">): string {
  const { level, unitId } = u;
  if (unitId.startsWith("unit_w_")) {
    const n = Number.parseInt(unitId.slice("unit_w_".length), 10);
    if (!Number.isNaN(n)) return `Floor ${level}, West ${n}`;
  }
  if (unitId.startsWith("unit_e_")) {
    const n = Number.parseInt(unitId.slice("unit_e_".length), 10);
    if (!Number.isNaN(n)) return `Floor ${level}, East ${n}`;
  }
  return `Floor ${level}, ${unitId}`;
}

export function apartmentDoorGameplayBreached(conn: DbConnection, rowKey: string): boolean {
  for (const row of conn.db.apartment_door_gameplay) {
    if (row.rowKey === rowKey && row.breached !== 0) return true;
  }
  return false;
}

/**
 * Client mirror of `player_may_toggle_door` for HUD + input — must stay aligned with server.
 */
export function clientMayToggleApartmentDoor(
  conn: DbConnection,
  identity: Identity | undefined,
  slot: { rowKey: string; floorDocId: string; level: number; templateId: string },
): boolean {
  if (!identity) return false;
  if (apartmentDoorGameplayBreached(conn, slot.rowKey)) return false;
  if (!slot.templateId.includes("unit_")) {
    return true;
  }
  const uk = residentUnitKeyFromParts(slot.floorDocId, slot.level, slot.templateId);
  let unit: ApartmentUnit | null = null;
  for (const row of conn.db.apartment_unit) {
    if (row.unitKey === uk) {
      unit = row as ApartmentUnit;
      break;
    }
  }
  if (!unit) return true;
  if (unit.state === UNIT_STATE_UNCLAIMED) return false;
  if (unit.state === UNIT_STATE_BROKEN) return false;
  if (unit.state === UNIT_STATE_CLAIMED) {
    return unit.owner != null && unit.owner.isEqual(identity);
  }
  return false;
}

function feetInsideUnit(u: ApartmentUnit, x: number, y: number, z: number): boolean {
  return (
    x >= u.boundMinX &&
    x <= u.boundMaxX &&
    z >= u.boundMinZ &&
    z <= u.boundMaxZ &&
    y >= u.boundMinY - 0.05 &&
    y <= u.boundMaxY + 2.45
  );
}

/** Nearest residential unit hull the feet position is inside, if any. */
export function apartmentUnitContainingFeet(
  conn: DbConnection,
  x: number,
  y: number,
  z: number,
): ApartmentUnit | null {
  let best: ApartmentUnit | null = null;
  let bestD = Infinity;
  for (const row of conn.db.apartment_unit) {
    const u = row as ApartmentUnit;
    if (!feetInsideUnit(u, x, y, z)) continue;
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

function playerOwnsDoorLock(conn: DbConnection, id: Identity): boolean {
  for (const row of conn.db.inventory_item) {
    const loc = row.location;
    if (loc.tag !== "Inventory" && loc.tag !== "Hotbar") continue;
    const o = loc.value.ownerId;
    if (!o.isEqual(id)) continue;
    if (row.defId === "door_lock" && row.quantity >= 1) return true;
  }
  return false;
}

function playerOwnsScrewdriver(conn: DbConnection, id: Identity): boolean {
  for (const row of conn.db.inventory_item) {
    const loc = row.location;
    if (loc.tag !== "Inventory" && loc.tag !== "Hotbar") continue;
    const o = loc.value.ownerId;
    if (!o.isEqual(id)) continue;
    if (row.defId === "screwdriver" && row.quantity >= 1) return true;
  }
  return false;
}

export type ApartmentClaimPrompt = {
  kind: "apartment_claim";
  unitKey: string;
};

export type ApartmentReinforcePrompt = {
  kind: "apartment_reinforce";
  doorRowKey: string;
};

export type ApartmentStashPrompt = {
  kind: "apartment_stash";
  unitKey: string;
};

/** Footlocker ≈ server's foot_x/y/z stash anchor (within ~2.8 m xz). */
function nearFootlocker(u: ApartmentUnit, x: number, y: number, z: number): boolean {
  const dx = x - u.footX;
  const dz = z - u.footZ;
  const dy = y - (u.footY + 0.85);
  return dx * dx + dy * dy + dz * dz <= 2.85 * 2.85;
}

/**
 * Highest-priority apartment prompt for FP HUD (excluding world loot — handled separately).
 */
export function getApartmentSystemPrompt(
  conn: DbConnection,
  pose: { x: number; y: number; z: number },
): ApartmentClaimPrompt | ApartmentReinforcePrompt | ApartmentStashPrompt | null {
  const id = conn.identity;
  if (!id) return null;
  const u = apartmentUnitContainingFeet(conn, pose.x, pose.y, pose.z);
  if (!u) return null;

  if (u.state === UNIT_STATE_UNCLAIMED && playerOwnsDoorLock(conn, id) && playerOwnsScrewdriver(conn, id)) {
    return { kind: "apartment_claim", unitKey: u.unitKey };
  }

  if (u.state === UNIT_STATE_CLAIMED && u.owner?.isEqual(id) && nearFootlocker(u, pose.x, pose.y, pose.z)) {
    return { kind: "apartment_stash", unitKey: u.unitKey };
  }

  if (u.state === UNIT_STATE_CLAIMED && u.owner?.isEqual(id) && u.reinforced === 0) {
    let bestKey: string | null = null;
    let bestD = Infinity;
    for (const row of conn.db.apartment_door) {
      const ad = row as ApartmentDoor;
      if (!ad.templateId.includes("unit_")) continue;
      if (residentUnitKeyFromDoor(ad) !== u.unitKey) continue;
      const dx = pose.x - ad.hingeX;
      const dz = pose.z - ad.hingeZ;
      const d = dx * dx + dz * dz;
      if (d < bestD && d <= 7.5 * 7.5) {
        bestD = d;
        bestKey = ad.rowKey;
      }
    }
    if (bestKey) {
      return { kind: "apartment_reinforce", doorRowKey: bestKey };
    }
  }

  return null;
}
