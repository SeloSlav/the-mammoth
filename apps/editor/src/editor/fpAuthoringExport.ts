import * as THREE from "three";
import type { FpAuthoringPick } from "@the-mammoth/engine";
function r4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function vec3(v: { x: number; y: number; z: number }) {
  return { x: r4(v.x), y: r4(v.y), z: r4(v.z) };
}

/** Grip socket offset in hand-root space (matches runtime: anchor is parented under the hand). */
function gripAnchorPositionMForExport(grip: THREE.Object3D, hand: THREE.Object3D | undefined) {
  if (!hand) return vec3(grip.position);
  const w = new THREE.Vector3();
  grip.getWorldPosition(w);
  hand.worldToLocal(w);
  return vec3(w);
}

export type WeaponMountAuthoring = {
  positionM: { x: number; y: number; z: number };
  eulerRad: { x: number; y: number; z: number };
  scaleM: { x: number; y: number; z: number };
};

/**
 * Partial `firstPerson` data read from the live scene (gizmo targets). Used only to merge into the
 * on-disk presentation file on save.
 */
export type WeaponFirstPersonAuthoringMerge = {
  mount: WeaponMountAuthoring | null;
  fpViewmodel: Record<string, unknown> | null;
};

/**
 * Merges an authoring patch into the existing on-disk `firstPerson.fpViewmodel`.
 * {@link buildWeaponFirstPersonMergeFromPicks} only includes keys for picks that exist, so a naive
 * `fpViewmodel: patch ?? prev` would drop e.g. `gripAnchorPositionM` when the patch only
 * carried `hand` — the game would then fall back to defaults and no longer match the editor.
 */
export function mergeWeaponFpViewmodelForSave(
  prev: unknown,
  patch: Record<string, unknown> | null,
): unknown {
  if (patch == null) return prev;
  const base =
    prev && typeof prev === "object"
      ? { ...(prev as Record<string, unknown>) }
      : ({} as Record<string, unknown>);
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    if (key === "hand") {
      const bh = base.hand;
      if (bh && typeof bh === "object" && pv && typeof pv === "object") {
        out.hand = { ...(bh as Record<string, unknown>), ...(pv as Record<string, unknown>) };
      } else {
        out.hand = pv;
      }
    } else if (key === "rigRoot") {
      const br = base.rigRoot;
      if (br && typeof br === "object" && pv && typeof pv === "object") {
        out.rigRoot = { ...(br as Record<string, unknown>), ...(pv as Record<string, unknown>) };
      } else {
        out.rigRoot = pv;
      }
    } else {
      out[key] = pv;
    }
  }
  return out;
}

/** Reads current hand / grip / weapon transforms from the FP authoring picks. */
export function buildWeaponFirstPersonMergeFromPicks(
  picks: FpAuthoringPick[],
): WeaponFirstPersonAuthoringMerge {
  const byId = new Map(picks.map((p) => [p.id, p.object]));

  const rig = byId.get("rigRoot");
  const grip = byId.get("gripAnchor");
  const hand = byId.get("hand");
  const wRoot = byId.get("weaponRoot");
  const wVis = byId.get("weaponVisual");

  const mountEuler = wRoot?.rotation;
  const mount: WeaponMountAuthoring | null =
    wRoot && mountEuler
      ? {
          positionM: vec3(wRoot.position),
          eulerRad: { x: r4(mountEuler.x), y: r4(mountEuler.y), z: r4(mountEuler.z) },
          scaleM: vec3(wRoot.scale),
        }
      : null;

  const fpViewmodel: Record<string, unknown> = {};
  if (rig) {
    const re = rig.rotation;
    fpViewmodel.rigRoot = {
      positionM: vec3(rig.position),
      eulerRad: { x: r4(re.x), y: r4(re.y), z: r4(re.z) },
      scaleM: vec3(rig.scale),
    };
  }
  if (grip) fpViewmodel.gripAnchorPositionM = gripAnchorPositionMForExport(grip, hand);
  if (hand) {
    fpViewmodel.hand = {
      positionM: vec3(hand.position),
      eulerRad: { x: r4(hand.rotation.x), y: r4(hand.rotation.y), z: r4(hand.rotation.z) },
      scale: vec3(hand.scale),
    };
  }
  if (wVis) fpViewmodel.weaponVisualScale = vec3(wVis.scale);

  return {
    mount,
    fpViewmodel: Object.keys(fpViewmodel).length > 0 ? fpViewmodel : null,
  };
}
