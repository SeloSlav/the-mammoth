/**
 * MVP apartment claim / reinforcement / stash proximity — mirrors server bbox tests in {@link ApartmentUnit}.
 */
import * as THREE from "three";
import type { Identity } from "spacetimedb";
import type { ApartmentDoor, ApartmentUnit, ApartmentUnitDecor } from "../../module_bindings/types";
import type { DbConnection } from "../../module_bindings";
import { APARTMENT_CLAIM_FAST_FOR_TESTING, APARTMENT_CLAIM_UI_ENABLED } from "../../featureFlags";
import {
  APARTMENT_UNIT_DECOR_ITEM_KIND_FOOTLOCKER,
  APARTMENT_UNIT_DECOR_ITEM_KIND_FRIDGE,
  APARTMENT_UNIT_DECOR_ITEM_KIND_STOVE,
  APARTMENT_UNIT_DECOR_ITEM_KIND_WARDROBE,
  APARTMENT_UNIT_DECOR_ITEM_KIND_WATER_TANK,
  APARTMENT_UNIT_DECOR_ITEM_KIND_FISH_TANK,
  APARTMENT_UNIT_DECOR_ITEM_KIND_FISH_TANK_FILTER,
  effectiveOwnedApartmentPlacedKind,
} from "@the-mammoth/schemas";
import {
  resolveBalconyGrowTrayAnchorXZ,
  BALCONY_GROW_TRAY_INTERACT_RADIUS_M,
} from "../fpBalconyGrow/fpBalconyGrowTrayAnchor.js";
import { apartmentStashKindForPlacedKind } from "./fpApartmentStashResolve.js";
import {
  apartmentStashKey,
  apartmentStashKeyDecor,
  apartmentStashLabel,
  APARTMENT_STASH_KIND_FOOTLOCKER,
  APARTMENT_STASH_KIND_FRIDGE,
  APARTMENT_STASH_KIND_GROW_TRAY,
  APARTMENT_STASH_KIND_STOVE,
  APARTMENT_STASH_KIND_WARDROBE,
  APARTMENT_STASH_KIND_WATER_TANK,
  APARTMENT_STASH_KIND_FISH_TANK,
  APARTMENT_STASH_KIND_FISH_TANK_FILTER,
  parseApartmentStashKeyFull,
  type ApartmentStashKind,
} from "./fpApartmentStashKey";
import {
  peekApartmentUnitLayoutProfilesDoc,
  peekOwnedApartmentBuiltinsDoc,
  resolveApartmentStashAnchorXZ,
} from "./fpOwnedApartmentBuiltinsFromContent.js";
import type { FpApartmentStashRayOcclusion } from "./fpApartmentStashRayOcclusion.js";

/**
 * Extra horizontal reach (m) beyond approximate visible mesh half-span so prompts still fire when
 * standing at the GLB’s apparent edge. Keep numeric agreement with `stash_interact_radius_sq` in
 * `apps/server/src/apartments.rs`.
 */
const APARTMENT_BUILTIN_STASH_REACH_PAD_M = 0.72;

/** ~XZ half-span from replicated anchor to furthest edge of each preview GLB at default vis scales. */
const APARTMENT_BUILTIN_STASH_MODEL_HALF_EXTENT_BY_KIND: Record<ApartmentStashKind, number> = {
  [APARTMENT_STASH_KIND_WARDROBE]: 0.55,
  [APARTMENT_STASH_KIND_FOOTLOCKER]: 0.38,
  [APARTMENT_STASH_KIND_STOVE]: 0.42,
  [APARTMENT_STASH_KIND_FRIDGE]: 0.58,
  [APARTMENT_STASH_KIND_WATER_TANK]: 0.36,
  /** ~half of `FISH_TANK_SWIM_AABB` max X (0.76) at default vis scale — tank is wider than 0.45 m. */
  [APARTMENT_STASH_KIND_FISH_TANK]: 0.78,
  [APARTMENT_STASH_KIND_FISH_TANK_FILTER]: 0.48,
  [APARTMENT_STASH_KIND_GROW_TRAY]: 0.38,
};

/**
 * Horizontal cylinder radius (m) for wardrobe / footlocker / stove: model extent + small pad so the
 * player must be beside the piece, not across the room.
 */
export function apartmentBuiltinStashInteractRadiusM(stashKind: ApartmentStashKind): number {
  return APARTMENT_BUILTIN_STASH_MODEL_HALF_EXTENT_BY_KIND[stashKind] + APARTMENT_BUILTIN_STASH_REACH_PAD_M;
}

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
 * Whether wardrobe / bed / footlocker **meshes** (and subscriber decor) should spawn for `u` for `conn`'s identity.
 *
 * Only **YOUR** {@link UNIT_STATE_CLAIMED} apartment — any level. Every other apartment stays empty shells
 * (no seeded props); per-unit authoring is not shipped yet — see wardrobe proxy raycasting in FP furniture
 * for unclaimed claims.
 */
export function residentInteriorPropsVisibleForViewer(
  conn: DbConnection | null | undefined,
  u: ApartmentUnit,
): boolean {
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
    z >= u.boundMinZ - slackXZ &&
    z <= u.boundMaxZ + slackXZ &&
    y >= u.boundMinY - slackYBelow &&
    y <= u.boundMaxY + slackYAbove
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

/** Residential unit hull containing an arbitrary world position (drops, loot anchors), if any. */
export function apartmentUnitKeyContainingWorldPoint(
  conn: DbConnection,
  x: number,
  y: number,
  z: number,
): string | null {
  return apartmentUnitContainingFeet(conn, x, y, z)?.unitKey ?? null;
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

/**
 * Same as {@link apartmentUnitContainingFeet}, but with a slightly expanded hull around **feet only**.
 * Used for FP apartment lighting so thresholds do not flicker at walls/windows.
 *
 * Does **not** use the camera — peeking into a unit from the hallway keeps corridor/global lighting,
 * so interiors viewed through an open door are not switched into the in-unit rig.
 */
export function apartmentUnitContainingFeetSlack(
  conn: DbConnection,
  x: number,
  y: number,
  z: number,
  opts?: { slackXZ?: number; slackYBelow?: number; slackYAbove?: number },
): ApartmentUnit | null {
  const slackXZ = opts?.slackXZ ?? 0.28;
  const slackYBelow = opts?.slackYBelow ?? 0.12;
  const slackYAbove = opts?.slackYAbove ?? 0.35;
  let best: ApartmentUnit | null = null;
  let bestD = Infinity;
  for (const row of conn.db.apartment_unit) {
    const u = row as ApartmentUnit;
    if (!feetInsideUnitHullSlack(u, x, y, z, slackXZ, slackYBelow, slackYAbove)) continue;
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

function decorItemKindToClientStashKind(itemKind: number): ApartmentStashKind | null {
  switch (itemKind) {
    case APARTMENT_UNIT_DECOR_ITEM_KIND_WARDROBE:
      return APARTMENT_STASH_KIND_WARDROBE;
    case APARTMENT_UNIT_DECOR_ITEM_KIND_FOOTLOCKER:
      return APARTMENT_STASH_KIND_FOOTLOCKER;
    case APARTMENT_UNIT_DECOR_ITEM_KIND_STOVE:
      return APARTMENT_STASH_KIND_STOVE;
    case APARTMENT_UNIT_DECOR_ITEM_KIND_FRIDGE:
      return APARTMENT_STASH_KIND_FRIDGE;
    case APARTMENT_UNIT_DECOR_ITEM_KIND_WATER_TANK:
      return APARTMENT_STASH_KIND_WATER_TANK;
    case APARTMENT_UNIT_DECOR_ITEM_KIND_FISH_TANK:
      return APARTMENT_STASH_KIND_FISH_TANK;
    case APARTMENT_UNIT_DECOR_ITEM_KIND_FISH_TANK_FILTER:
      return APARTMENT_STASH_KIND_FISH_TANK_FILTER;
    default:
      return null;
  }
}

/** Stash interact kind for a décor replica row (uses model path when `item_kind` is stale). */
export function apartmentDecorRowClientStashKind(decor: {
  itemKind: number;
  modelRelPath: string;
}): ApartmentStashKind | null {
  const placed = effectiveOwnedApartmentPlacedKind(decor.itemKind, decor.modelRelPath);
  return apartmentStashKindForPlacedKind(placed);
}

function unitHasDecorStashKind(
  conn: DbConnection,
  unitKey: string,
  kind: ApartmentStashKind,
): boolean {
  for (const row of conn.db.apartment_unit_decor) {
    if (row.unitKey !== unitKey) continue;
    if (apartmentDecorRowClientStashKind(row) === kind) return true;
  }
  return false;
}

/** Horizontal stash cylinder around an explicit world XZ anchor. */
function nearPointStashCylinder(
  u: ApartmentUnit,
  ax: number,
  az: number,
  stashKind: ApartmentStashKind,
  x: number,
  y: number,
  z: number,
): boolean {
  const r = apartmentBuiltinStashInteractRadiusM(stashKind);
  const dx = x - ax;
  const dz = z - az;
  if (dx * dx + dz * dz > r * r) return false;
  return feetVerticalOkForInteract(u.footY, y);
}

/** True when `identity` owns a claimed apartment with this `unitKey`. */
export function clientOwnsClaimedApartmentUnit(
  conn: DbConnection,
  identity: Identity | undefined,
  unitKey: string,
): boolean {
  if (!identity) return false;
  for (const row of conn.db.apartment_unit) {
    const u = row as ApartmentUnit;
    if (u.unitKey !== unitKey) continue;
    return u.state === UNIT_STATE_CLAIMED && sameIdentity(u.owner, identity);
  }
  return false;
}

export function clientMayUseApartmentStash(
  conn: DbConnection,
  owner: Identity | undefined,
  stashKey: string,
  pose: { x: number; y: number; z: number },
  opts?: { growTrayAnchorXZ?: { x: number; z: number } },
): boolean {
  if (!owner) return false;
  const full = parseApartmentStashKeyFull(stashKey);
  if (full.tag === "grow_tray") {
    /** Balcony trays sit at negative layout fz — outside strict unit AABB without slack. */
    const hullSlackXz = 4.0;
    const radiusSq = BALCONY_GROW_TRAY_INTERACT_RADIUS_M * BALCONY_GROW_TRAY_INTERACT_RADIUS_M;
    for (const row of conn.db.apartment_unit) {
      const u = row as ApartmentUnit;
      if (u.unitKey !== full.unitKey) continue;
      if (u.state !== UNIT_STATE_CLAIMED) return false;
      if (!sameIdentity(u.owner, owner)) return false;
      if (
        !feetInsideUnitHullSlack(
          u,
          pose.x,
          pose.y,
          pose.z,
          hullSlackXz,
          INTERACT_FEET_Y_BELOW_SLACK_M,
          INTERACT_FEET_Y_ABOVE_SLACK_M,
        )
      ) {
        return false;
      }
      const anchor =
        opts?.growTrayAnchorXZ ?? resolveBalconyGrowTrayAnchorXZ(conn, u, full.trayId);
      if (!anchor) return false;
      const dx = pose.x - anchor.x;
      const dz = pose.z - anchor.z;
      if (dx * dx + dz * dz > radiusSq) return false;
      return feetVerticalOkForInteract(u.footY, pose.y);
    }
    return false;
  }
  if (full.tag === "decor") {
    let decor: ApartmentUnitDecor | null = null;
    for (const row of conn.db.apartment_unit_decor) {
      if (row.decorId === full.decorId && row.unitKey === full.unitKey) {
        decor = row as ApartmentUnitDecor;
        break;
      }
    }
    if (!decor) return false;
    const sk = apartmentDecorRowClientStashKind(decor);
    if (!sk) return false;
    for (const row of conn.db.apartment_unit) {
      const u = row as ApartmentUnit;
      if (u.unitKey !== full.unitKey) continue;
      if (u.state !== UNIT_STATE_CLAIMED) return false;
      if (!sameIdentity(u.owner, owner)) return false;
      const r = apartmentBuiltinStashInteractRadiusM(sk);
      const r2 = r * r;
      const dx = pose.x - decor.posX;
      const dz = pose.z - decor.posZ;
      if (dx * dx + dz * dz > r2) return false;
      return (
        pose.y >= u.footY - INTERACT_FEET_Y_BELOW_SLACK_M &&
        pose.y <= u.footY + INTERACT_FEET_Y_ABOVE_SLACK_M
      );
    }
    return false;
  }

  const unitKey = full.unitKey;
  const stashKind: ApartmentStashKind =
    full.tag === "legacy" ? full.stashKind : APARTMENT_STASH_KIND_FOOTLOCKER;
  for (const row of conn.db.apartment_unit) {
    const u = row as ApartmentUnit;
    if (u.unitKey !== unitKey) continue;
    if (u.state !== UNIT_STATE_CLAIMED) return false;
    if (!sameIdentity(u.owner, owner)) return false;
    if (!feetInsideUnitHull(u, pose.x, pose.y, pose.z)) return false;
    return nearApartmentStashAnchor(u, stashKind, pose.x, pose.y, pose.z);
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
  stashKey: string;
  unitKey: string;
  stashKind: ApartmentStashKind;
  stashLabel: string;
};

/** Ray-hit fridge/fish tank/etc. beats balcony grow-tray fallback prompts. */
export function aimedApartmentStashBlocksGrowTrayPrompt(
  lookedAtStash: Pick<ApartmentStashPrompt, "stashKind"> | null,
): boolean {
  return lookedAtStash !== null && lookedAtStash.stashKind !== APARTMENT_STASH_KIND_GROW_TRAY;
}

export type ApartmentSystemPrompt =
  | ApartmentClaimPrompt
  | ApartmentClaimBlockedGearPrompt
  | ApartmentClaimBlockedGuestPrompt
  | ApartmentStashPrompt;

/** Claim HUD should beat overlapping residential door prompts because claiming is a hold action. */
/**
 * Viewer may sit on furniture in their own claimed unit when feet are in the hull and near the seat anchor.
 */
export function clientMayUseApartmentSittable(
  conn: DbConnection,
  identity: Identity,
  unitKey: string,
  pose: { x: number; y: number; z: number },
  anchorX: number,
  anchorZ: number,
  interactRadiusM: number,
): boolean {
  for (const row of conn.db.apartment_unit) {
    const u = row as ApartmentUnit;
    if (u.unitKey !== unitKey) continue;
    if (!residentInteriorPropsVisibleForViewer(conn, u)) return false;
    if (!feetInsideUnitHull(u, pose.x, pose.y, pose.z)) return false;
    const dx = pose.x - anchorX;
    const dz = pose.z - anchorZ;
    if (dx * dx + dz * dz > interactRadiusM * interactRadiusM) return false;
    return feetVerticalOkForInteract(u.footY, pose.y);
  }
  return false;
}

/** Claim / wardrobe prompts win over the unit-door hold when both are in range. */
export function apartmentClaimInteriorsPreferOverUnitDoor(p: ApartmentSystemPrompt | null): boolean {
  return (
    p?.kind === "apartment_claim" ||
    p?.kind === "apartment_claim_blocked_gear" ||
    p?.kind === "apartment_claim_blocked_guest"
  );
}

function feetVerticalOkForInteract(unitFloorY: number, y: number): boolean {
  return y >= unitFloorY - INTERACT_FEET_Y_BELOW_SLACK_M && y <= unitFloorY + INTERACT_FEET_Y_ABOVE_SLACK_M;
}

function stashInteractAnchorXZ(u: ApartmentUnit, stashKind: ApartmentStashKind): { x: number; z: number } {
  return resolveApartmentStashAnchorXZ(
    u,
    peekOwnedApartmentBuiltinsDoc(),
    stashKind,
    peekApartmentUnitLayoutProfilesDoc(),
  );
}

/** Horizontal cylinder around stash anchor — matches server `pose_near_horizontal_marker` + vertical slab. */
function nearApartmentStashAnchor(
  u: ApartmentUnit,
  stashKind: ApartmentStashKind,
  x: number,
  y: number,
  z: number,
): boolean {
  const r = apartmentBuiltinStashInteractRadiusM(stashKind);
  const r2 = r * r;
  const { x: ax, z: az } = stashInteractAnchorXZ(u, stashKind);
  const dx = x - ax;
  const dz = z - az;
  if (dx * dx + dz * dz > r2) return false;
  return feetVerticalOkForInteract(u.footY, y);
}

/** Horizontal cylinder around wardrobe column + vertical slab — matches `claim_apartment_pulse` on server. */
function nearWardrobe(u: ApartmentUnit, x: number, y: number, z: number): boolean {
  return nearApartmentStashAnchor(u, APARTMENT_STASH_KIND_WARDROBE, x, y, z);
}

/**
 * Claim UI / hold-E eligibility when the player is aiming at this unit's wardrobe pick mesh —
 * gated by `APARTMENT_CLAIM_UI_ENABLED` ({@link ../../featureFlags}). Requires hull + replicated wardrobe proximity.
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

    let near = false;
    if (!unitHasDecorStashKind(conn, unitKey, APARTMENT_STASH_KIND_WARDROBE)) {
      near = nearWardrobe(u, x, y, z);
    }
    if (!near) {
      for (const drow of conn.db.apartment_unit_decor) {
        if (drow.unitKey !== unitKey) continue;
        if (drow.itemKind !== APARTMENT_UNIT_DECOR_ITEM_KIND_WARDROBE) continue;
        if (
          nearPointStashCylinder(
            u,
            drow.posX,
            drow.posZ,
            APARTMENT_STASH_KIND_WARDROBE,
            x,
            y,
            z,
          )
        ) {
          near = true;
          break;
        }
      }
    }
    if (!near) return null;
    return u;
  }
  return null;
}

/** `foot_x/z` — matches horizontal stash cylinder on server (`pose_near_horizontal_marker` + foot anchor). */
function nearFootlocker(u: ApartmentUnit, x: number, y: number, z: number): boolean {
  return nearApartmentStashAnchor(u, APARTMENT_STASH_KIND_FOOTLOCKER, x, y, z);
}

function apartmentStashPromptFor(
  unitKey: string,
  stashKind: ApartmentStashKind,
): ApartmentStashPrompt {
  return {
    kind: "apartment_stash",
    stashKey: apartmentStashKey(unitKey, stashKind),
    unitKey,
    stashKind,
    stashLabel: apartmentStashLabel(stashKind),
  };
}

function stashAnchorDistSqWithinInteract(
  u: ApartmentUnit,
  stashKind: ApartmentStashKind,
  x: number,
  y: number,
  z: number,
): number | null {
  if (!nearApartmentStashAnchor(u, stashKind, x, y, z)) return null;
  const { x: ax, z: az } = stashInteractAnchorXZ(u, stashKind);
  const dx = x - ax;
  const dz = z - az;
  return dx * dx + dz * dz;
}

function nearestOwnedClaimedApartmentStash(
  conn: DbConnection,
  owner: Identity,
  x: number,
  y: number,
  z: number,
): ApartmentStashPrompt | null {
  let best: ApartmentStashPrompt | null = null;
  let bestD = Infinity;
  for (const row of conn.db.apartment_unit) {
    const u = row as ApartmentUnit;
    if (u.state !== UNIT_STATE_CLAIMED) continue;
    if (!sameIdentity(u.owner, owner)) continue;

    for (const drow of conn.db.apartment_unit_decor) {
      if (drow.unitKey !== u.unitKey) continue;
      const sk = apartmentDecorRowClientStashKind(drow);
      if (!sk) continue;
      if (!nearPointStashCylinder(u, drow.posX, drow.posZ, sk, x, y, z)) continue;
      const dx = x - drow.posX;
      const dz = z - drow.posZ;
      const decorD = dx * dx + dz * dz;
      if (decorD < bestD) {
        bestD = decorD;
        best = {
          kind: "apartment_stash",
          stashKey: apartmentStashKeyDecor(u.unitKey, drow.decorId),
          unitKey: u.unitKey,
          stashKind: sk,
          stashLabel: apartmentStashLabel(sk),
        };
      }
    }

    if (!feetInsideUnitHull(u, x, y, z)) continue;

    const tryLegacy = (kind: ApartmentStashKind): void => {
      if (unitHasDecorStashKind(conn, u.unitKey, kind)) return;
      const d = stashAnchorDistSqWithinInteract(u, kind, x, y, z);
      if (d !== null && d < bestD) {
        bestD = d;
        best = apartmentStashPromptFor(u.unitKey, kind);
      }
    };
    tryLegacy(APARTMENT_STASH_KIND_FOOTLOCKER);
    tryLegacy(APARTMENT_STASH_KIND_WARDROBE);
    tryLegacy(APARTMENT_STASH_KIND_STOVE);
    tryLegacy(APARTMENT_STASH_KIND_FRIDGE);
    tryLegacy(APARTMENT_STASH_KIND_WATER_TANK);
  }
  return best;
}

const _apartmentStashWorldTargetScratch = new THREE.Vector3();

/** Chest-height world point used for stash line-of-sight checks (proximity + ray hits). */
export function resolveApartmentStashWorldTarget(
  conn: DbConnection,
  stashKey: string,
): THREE.Vector3 | null {
  const full = parseApartmentStashKeyFull(stashKey);
  let unit: ApartmentUnit | null = null;
  for (const row of conn.db.apartment_unit) {
    if (row.unitKey === full.unitKey) {
      unit = row as ApartmentUnit;
      break;
    }
  }
  if (!unit) return null;

  if (full.tag === "decor") {
    for (const row of conn.db.apartment_unit_decor) {
      if (row.decorId === full.decorId && row.unitKey === full.unitKey) {
        _apartmentStashWorldTargetScratch.set(row.posX, row.posY + 0.55, row.posZ);
        return _apartmentStashWorldTargetScratch;
      }
    }
    return null;
  }
  if (full.tag === "grow_tray") {
    const anchor = resolveBalconyGrowTrayAnchorXZ(conn, unit, full.trayId);
    if (!anchor) return null;
    _apartmentStashWorldTargetScratch.set(anchor.x, unit.footY + 0.45, anchor.z);
    return _apartmentStashWorldTargetScratch;
  }
  const stashKind: ApartmentStashKind =
    full.tag === "legacy" ? full.stashKind : APARTMENT_STASH_KIND_FOOTLOCKER;
  const { x, z } = resolveApartmentStashAnchorXZ(
    unit,
    peekOwnedApartmentBuiltinsDoc(),
    stashKind,
    peekApartmentUnitLayoutProfilesDoc(),
  );
  _apartmentStashWorldTargetScratch.set(x, unit.footY + 0.55, z);
  return _apartmentStashWorldTargetScratch;
}

export function apartmentStashPromptOccludedFromCamera(
  conn: DbConnection,
  prompt: ApartmentStashPrompt,
  camera: THREE.PerspectiveCamera,
  stashRayOcclusion: FpApartmentStashRayOcclusion,
): boolean {
  const target = resolveApartmentStashWorldTarget(conn, prompt.stashKey);
  if (!target) return false;
  return stashRayOcclusion.targetOccludedFromCamera(camera, target);
}

function finalizeApartmentStashPrompt(
  conn: DbConnection,
  prompt: ApartmentStashPrompt | null,
  opts: {
    stashLos?: {
      camera: THREE.PerspectiveCamera;
      stashRayOcclusion: FpApartmentStashRayOcclusion;
    };
  },
): ApartmentStashPrompt | null {
  if (!prompt || !opts.stashLos) return prompt;
  const full = parseApartmentStashKeyFull(prompt.stashKey);
  // Decor / grow-tray stashes use replicated anchors; ray hits already wall-test in getStashPrompt.
  // LOS to a fixed anchor falsely suppresses wide props (fish tank) on the proximity path.
  if (full.tag === "decor" || full.tag === "grow_tray") return prompt;
  if (
    apartmentStashPromptOccludedFromCamera(
      conn,
      prompt,
      opts.stashLos.camera,
      opts.stashLos.stashRayOcclusion,
    )
  ) {
    return null;
  }
  return prompt;
}

/**
 * Highest-priority apartment prompt for FP HUD (excluding world loot — handled separately).
 */
export function getApartmentSystemPrompt(
  conn: DbConnection,
  pose: { x: number; y: number; z: number },
  opts: {
    apartmentClaimsAllowed?: boolean;
    /** Ray-hit stash object. Omit when none so wardrobe/footlocker proximity can still offer stash. Pass explicit null to suppress stash entirely. */
    lookedAtStashKey?: string | null;
    /** Center-screen ray hit on wardrobe pick mesh (`null` / omitted = no claim prompts). */
    lookedAtWardrobeUnitKey?: string | null;
    /** When set, proximity and ray-hit stash prompts require clear line-of-sight from the camera. */
    stashLos?: {
      camera: THREE.PerspectiveCamera;
      stashRayOcclusion: FpApartmentStashRayOcclusion;
    };
  } = {},
):
  | ApartmentClaimPrompt
  | ApartmentClaimBlockedGearPrompt
  | ApartmentClaimBlockedGuestPrompt
  | ApartmentStashPrompt
  | null {
  const id = conn.identity;
  if (!id) return null;

  const aimedWardrobeKey =
    APARTMENT_CLAIM_UI_ENABLED ? (opts.lookedAtWardrobeUnitKey ?? null) : null;
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

  /**
   * Explicit `lookedAtStashKey: null` means “do not offer stash from FP” (used when callers want
   * look-at-only UX). **Omit** the property when the reticle missed picks so proximity to wardrobe /
   * footlocker / stove can still offer stash (`mountFpSession` / RAF).
   */
  if (opts.lookedAtStashKey === null) return null;

  if (opts.lookedAtStashKey !== undefined) {
    const full = parseApartmentStashKeyFull(opts.lookedAtStashKey);
    if (full.tag === "grow_tray") {
      if (!clientOwnsClaimedApartmentUnit(conn, id, full.unitKey)) return null;
      if (!clientMayUseApartmentStash(conn, id, opts.lookedAtStashKey, pose)) return null;
      return finalizeApartmentStashPrompt(
        conn,
        {
          kind: "apartment_stash",
          stashKey: opts.lookedAtStashKey,
          unitKey: full.unitKey,
          stashKind: APARTMENT_STASH_KIND_GROW_TRAY,
          stashLabel: apartmentStashLabel(APARTMENT_STASH_KIND_GROW_TRAY),
        },
        opts,
      );
    }
    if (!clientMayUseApartmentStash(conn, id, opts.lookedAtStashKey, pose)) return null;
    if (full.tag === "decor") {
      let decorRow: ApartmentUnitDecor | null = null;
      for (const row of conn.db.apartment_unit_decor) {
        if (row.decorId === full.decorId && row.unitKey === full.unitKey) {
          decorRow = row as ApartmentUnitDecor;
          break;
        }
      }
      const sk = decorRow ? apartmentDecorRowClientStashKind(decorRow) : null;
      if (!sk) return null;
      return finalizeApartmentStashPrompt(
        conn,
        {
          kind: "apartment_stash",
          stashKey: opts.lookedAtStashKey,
          unitKey: full.unitKey,
          stashKind: sk,
          stashLabel: apartmentStashLabel(sk),
        },
        opts,
      );
    }
    const stashKind: ApartmentStashKind =
      full.tag === "legacy" ? full.stashKind : APARTMENT_STASH_KIND_FOOTLOCKER;
    return finalizeApartmentStashPrompt(
      conn,
      apartmentStashPromptFor(full.unitKey, stashKind),
      opts,
    );
  }

  return finalizeApartmentStashPrompt(
    conn,
    nearestOwnedClaimedApartmentStash(conn, id, pose.x, pose.y, pose.z),
    opts,
  );
}
