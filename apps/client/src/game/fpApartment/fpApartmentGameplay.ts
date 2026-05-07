/**
 * MVP apartment claim / reinforcement / stash proximity — mirrors server bbox tests in {@link ApartmentUnit}.
 */
import type { Identity } from "spacetimedb";
import type { ApartmentDoor, ApartmentUnit } from "../../module_bindings/types";
import type { DbConnection } from "../../module_bindings";
import { APARTMENT_CLAIM_FAST_FOR_TESTING } from "../../featureFlags";

/** Horizontal radius (m); must match server `STASH_INTERACT_SQ = 3.5 * 3.5` (`apartments.rs`). */
export const APARTMENT_FURNITURE_INTERACT_R_M = 3.5;

/** Feet height slack vs `unit.footY` — keep aligned with server `INTERACT_FEET_Y_*_SLACK_M`. */
const INTERACT_FEET_Y_BELOW_SLACK_M = 0.55;
const INTERACT_FEET_Y_ABOVE_SLACK_M = 2.85;

export const UNIT_STATE_UNCLAIMED = 0;
export const UNIT_STATE_CLAIMED = 1;
export const UNIT_STATE_BROKEN = 2;
/** NPC façade on the rooftop residential slab — mirrors server `UNIT_STATE_SHELL_OCCUPIED`. */
export const UNIT_STATE_SHELL_OCCUPIED = 4;

/** First building `levelIndex` of the inhabited top band (`floor_mamutica_typical` 18..max). Mirrors `elevator_layout::RESIDENTIAL_BAND_MIN_LEVEL` on the module. */
export const RESIDENTIAL_BAND_MIN_LEVEL = 18;

/** Seconds of hold progress to complete claim (30 production, 1 when testing flag matches server). */
export const APARTMENT_CLAIM_FULL_SECS = APARTMENT_CLAIM_FAST_FOR_TESTING ? 1 : 30;

/** Must match `CLAIM_MIN_DEPTH_FROM_ENTRY_DOOR_M` in `apps/server/src/apartments.rs`. */
export const CLAIM_MIN_DEPTH_FROM_ENTRY_DOOR_M = 2.35;

/** Match server `SwingDoorFace`: N=0, S=1, E=2, W=3 */
const SWING_FACE_N = 0;
const SWING_FACE_S = 1;
const SWING_FACE_E = 2;
const SWING_FACE_W = 3;

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
  const floorLabel = Math.max(1, level - 1);
  if (unitId.startsWith("unit_w_")) {
    const n = Number.parseInt(unitId.slice("unit_w_".length), 10);
    if (!Number.isNaN(n)) return `Floor ${floorLabel}, West ${n}`;
  }
  if (unitId.startsWith("unit_e_")) {
    const n = Number.parseInt(unitId.slice("unit_e_".length), 10);
    if (!Number.isNaN(n)) return `Floor ${floorLabel}, East ${n}`;
  }
  return `Floor ${level}, ${unitId}`;
}

export function apartmentDoorGameplayBreached(conn: DbConnection, rowKey: string): boolean {
  for (const row of conn.db.apartment_door_gameplay) {
    if (row.rowKey === rowKey && row.breached !== 0) return true;
  }
  return false;
}

function sameIdentity(a: Identity | null | undefined, b: Identity | null | undefined): boolean {
  if (!a || !b) return false;
  return a.isEqual(b) || b.isEqual(a);
}

/** Compare replicated `owner` columns so furniture subscribers don't thrash when identity refs differ for the same key. */
export function apartmentUnitOwnerEqual(
  a: ApartmentUnit["owner"],
  b: ApartmentUnit["owner"],
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.isEqual(b);
}

/**
 * Whether wardrobe / bed / footlocker **meshes** should exist for `u` when viewed by `conn`'s identity.
 *
 * Below {@link RESIDENTIAL_BAND_MIN_LEVEL}: abandoned stack — replicate full props on unclaimed units.
 * On the top residential slab: shells, vacant penthouse stubs, or other people's units stay **empty**;
 * **only YOUR {@link UNIT_STATE_CLAIMED} apartment** renders furniture so neighbor apartments read as inhabited shells.
 */
export function residentInteriorPropsVisibleForViewer(
  conn: DbConnection | null | undefined,
  u: ApartmentUnit,
): boolean {
  if ((u.level as number) < RESIDENTIAL_BAND_MIN_LEVEL) return true;
  const identity = conn?.identity;
  if (!identity) return false;
  return u.state === UNIT_STATE_CLAIMED && sameIdentity(u.owner, identity);
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
  if (unit.state === UNIT_STATE_SHELL_OCCUPIED) return false;
  if (unit.state === UNIT_STATE_CLAIMED) {
    return sameIdentity(unit.owner, identity);
  }
  return false;
}

function feetInsideUnitHull(u: ApartmentUnit, x: number, y: number, z: number): boolean {
  return (
    x >= u.boundMinX &&
    x <= u.boundMaxX &&
    z >= u.boundMinZ &&
    z <= u.boundMaxZ &&
    y >= u.boundMinY - 0.05 &&
    y <= u.boundMaxY + 2.45
  );
}

export function primaryEntryDoorForUnit(conn: DbConnection, unit: ApartmentUnit): ApartmentDoor | null {
  for (const row of conn.db.apartment_door) {
    const d = row as ApartmentDoor;
    if (residentUnitKeyFromDoor(d) !== unit.unitKey) continue;
    if (!d.templateId.startsWith(unit.unitId)) continue;
    return d;
  }
  return null;
}

/** Exported for tests — parity with `feet_deep_enough_from_entry_door` on the server. */
export function feetDeepEnoughFromEntryDoor(door: ApartmentDoor, x: number, z: number): boolean {
  const minD = CLAIM_MIN_DEPTH_FROM_ENTRY_DOOR_M;
  switch (door.face) {
    case SWING_FACE_W:
      return door.hingeX - x >= minD;
    case SWING_FACE_E:
      return x - door.hingeX >= minD;
    case SWING_FACE_N:
      return door.hingeZ - z >= minD;
    case SWING_FACE_S:
      return z - door.hingeZ >= minD;
    default:
      return door.hingeX - x >= minD;
  }
}

/** Inside strict unit interior (same as server `feet_inside_unit`) AND deep enough past entry door. */
export function feetInClaimZone(conn: DbConnection, unit: ApartmentUnit, x: number, y: number, z: number): boolean {
  if (!feetInsideUnitHull(unit, x, y, z)) return false;
  const door = primaryEntryDoorForUnit(conn, unit);
  if (!door) return false;
  return feetDeepEnoughFromEntryDoor(door, x, z);
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
    if (!feetInsideUnitHull(u, x, y, z)) continue;
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

export function apartmentDoorMatchesContainingUnit(
  conn: DbConnection,
  pose: { x: number; y: number; z: number },
  slot: { floorDocId: string; level: number; templateId: string },
): boolean {
  const doorUk = residentUnitKeyFromParts(slot.floorDocId, slot.level, slot.templateId);
  const containingUnit = apartmentUnitContainingFeet(conn, pose.x, pose.y, pose.z);
  if (!containingUnit) return true;
  if (containingUnit.unitKey === doorUk) return true;
  for (const row of conn.db.apartment_unit) {
    const u = row as ApartmentUnit;
    if (u.unitKey !== doorUk) continue;
    return feetInsideUnitHull(u, pose.x, pose.y, pose.z);
  }
  return false;
}

export function playerOwnsDoorLock(conn: DbConnection, id: Identity): boolean {
  for (const row of conn.db.inventory_item) {
    const loc = row.location;
    if (loc.tag !== "Inventory" && loc.tag !== "Hotbar") continue;
    const o = loc.value.ownerId;
    if (!o.isEqual(id)) continue;
    if (row.defId === "door-lock" && row.quantity >= 1) return true;
  }
  return false;
}

export function playerOwnsScrewdriver(conn: DbConnection, id: Identity): boolean {
  for (const row of conn.db.inventory_item) {
    const loc = row.location;
    if (loc.tag !== "Inventory" && loc.tag !== "Hotbar") continue;
    const o = loc.value.ownerId;
    if (!o.isEqual(id)) continue;
    if (row.defId === "screwdriver" && row.quantity >= 1) return true;
  }
  return false;
}

export function clientMayUseApartmentStash(
  conn: DbConnection,
  owner: Identity | undefined,
  unitKey: string,
  pose: { x: number; y: number; z: number },
): boolean {
  if (!owner) return false;
  for (const row of conn.db.apartment_unit) {
    const u = row as ApartmentUnit;
    if (u.unitKey !== unitKey) continue;
    if (u.state !== UNIT_STATE_CLAIMED) return false;
    if (!sameIdentity(u.owner, owner)) return false;
    if (!feetInsideUnitHull(u, pose.x, pose.y, pose.z)) return false;
    return nearFootlocker(u, pose.x, pose.y, pose.z);
  }
  return false;
}

export type ApartmentClaimPrompt = {
  kind: "apartment_claim";
  unitKey: string;
};

export type ApartmentClaimBlockedGearPrompt = {
  kind: "apartment_claim_blocked_gear";
  unitKey: string;
};

export type ApartmentClaimBlockedGuestPrompt = {
  kind: "apartment_claim_blocked_guest";
  unitKey: string;
};

export type ApartmentStashPrompt = {
  kind: "apartment_stash";
  unitKey: string;
};

export type ApartmentSystemPrompt =
  | ApartmentClaimPrompt
  | ApartmentClaimBlockedGearPrompt
  | ApartmentClaimBlockedGuestPrompt
  | ApartmentStashPrompt;

/** Claim HUD should beat overlapping residential door prompts because claiming is a hold action. */
export function apartmentFurnitureInteriorsPreferOverUnitDoor(p: ApartmentSystemPrompt | null): boolean {
  return (
    p?.kind === "apartment_claim" ||
    p?.kind === "apartment_claim_blocked_gear" ||
    p?.kind === "apartment_claim_blocked_guest"
  );
}

function feetVerticalOkForInteract(unitFloorY: number, y: number): boolean {
  return y >= unitFloorY - INTERACT_FEET_Y_BELOW_SLACK_M && y <= unitFloorY + INTERACT_FEET_Y_ABOVE_SLACK_M;
}

/** Horizontal cylinder around wardrobe column + vertical slab — matches `claim_apartment_pulse` on server. */
function nearWardrobe(u: ApartmentUnit, x: number, y: number, z: number): boolean {
  const r = APARTMENT_FURNITURE_INTERACT_R_M;
  const r2 = r * r;
  const dx = x - u.wardrobeX;
  const dz = z - u.wardrobeZ;
  if (dx * dx + dz * dz > r2) return false;
  return feetVerticalOkForInteract(u.footY, y);
}

/**
 * Claim UI / hold-E eligibility when the player is aiming at this unit's wardrobe (see
 * {@link mountFpApartmentFurniture} wardrobe pick meshes) — still requires hull + wardrobe proximity.
 */
export function unclaimedUnitIfPlayerAimedAtWardrobe(
  conn: DbConnection,
  unitKey: string,
  x: number,
  y: number,
  z: number,
): ApartmentUnit | null {
  for (const row of conn.db.apartment_unit) {
    const u = row as ApartmentUnit;
    if (u.unitKey !== unitKey) continue;
    if (u.state !== UNIT_STATE_UNCLAIMED) return null;
    if (!feetInsideUnitHull(u, x, y, z)) return null;
    if (!nearWardrobe(u, x, y, z)) return null;
    return u;
  }
  return null;
}

/** `foot_x/z` stash anchor — matches `stash_push` / `stash_pull` range on server. */
function nearFootlocker(u: ApartmentUnit, x: number, y: number, z: number): boolean {
  const r = APARTMENT_FURNITURE_INTERACT_R_M;
  const r2 = r * r;
  const dx = x - u.footX;
  const dz = z - u.footZ;
  if (dx * dx + dz * dz > r2) return false;
  return feetVerticalOkForInteract(u.footY, y);
}

function nearestOwnedClaimedUnitNearFootlocker(
  conn: DbConnection,
  owner: Identity,
  x: number,
  y: number,
  z: number,
): ApartmentUnit | null {
  let best: ApartmentUnit | null = null;
  let bestD = Infinity;
  for (const row of conn.db.apartment_unit) {
    const u = row as ApartmentUnit;
    if (u.state !== UNIT_STATE_CLAIMED) continue;
    if (!sameIdentity(u.owner, owner)) continue;
    if (!feetInsideUnitHull(u, x, y, z)) continue;
    if (!nearFootlocker(u, x, y, z)) continue;
    const dx = x - u.footX;
    const dz = z - u.footZ;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

/**
 * Highest-priority apartment prompt for FP HUD (excluding world loot — handled separately).
 */
export function getApartmentSystemPrompt(
  conn: DbConnection,
  pose: { x: number; y: number; z: number },
  opts: {
    apartmentClaimsAllowed?: boolean;
    lookedAtStashUnitKey?: string | null;
    /** Center-screen ray hit on wardrobe pick mesh (`null` / omitted = no claim prompts). */
    lookedAtWardrobeUnitKey?: string | null;
  } = {},
):
  | ApartmentClaimPrompt
  | ApartmentClaimBlockedGearPrompt
  | ApartmentClaimBlockedGuestPrompt
  | ApartmentStashPrompt
  | null {
  const id = conn.identity;
  if (!id) return null;

  const aimedWardrobeKey = opts.lookedAtWardrobeUnitKey ?? null;
  if (aimedWardrobeKey) {
    const claimUnit = unclaimedUnitIfPlayerAimedAtWardrobe(conn, aimedWardrobeKey, pose.x, pose.y, pose.z);
    if (claimUnit) {
      if (opts.apartmentClaimsAllowed === false) {
        return { kind: "apartment_claim_blocked_guest", unitKey: claimUnit.unitKey };
      }
      if (playerOwnsDoorLock(conn, id) && playerOwnsScrewdriver(conn, id)) {
        return { kind: "apartment_claim", unitKey: claimUnit.unitKey };
      }
      return { kind: "apartment_claim_blocked_gear", unitKey: claimUnit.unitKey };
    }
  }

  if (opts.lookedAtStashUnitKey === null) return null;

  if (opts.lookedAtStashUnitKey !== undefined) {
    return clientMayUseApartmentStash(conn, id, opts.lookedAtStashUnitKey, pose)
      ? { kind: "apartment_stash", unitKey: opts.lookedAtStashUnitKey }
      : null;
  }

  const stashUnit = nearestOwnedClaimedUnitNearFootlocker(conn, id, pose.x, pose.y, pose.z);
  if (stashUnit) {
    return { kind: "apartment_stash", unitKey: stashUnit.unitKey };
  }

  const u = apartmentUnitContainingFeet(conn, pose.x, pose.y, pose.z);
  if (
    u &&
    u.state === UNIT_STATE_CLAIMED &&
    sameIdentity(u.owner, id) &&
    nearFootlocker(u, pose.x, pose.y, pose.z)
  ) {
    return { kind: "apartment_stash", unitKey: u.unitKey };
  }

  return null;
}
