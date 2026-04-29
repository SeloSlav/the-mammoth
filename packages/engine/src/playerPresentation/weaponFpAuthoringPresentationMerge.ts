import * as THREE from "three";

/** Same shape as {@link FpAuthoringPick}; kept local so this module doesn't import circular deps. */
type FpPick = { id: string; label?: string; object: THREE.Object3D };

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

export type WeaponMountAuthorMerge = {
  positionM: { x: number; y: number; z: number };
  eulerRad: { x: number; y: number; z: number };
  scaleM: { x: number; y: number; z: number };
};

export type WeaponFirstPersonAuthoringPresentationMerge = {
  mount: WeaponMountAuthorMerge | null;
  fpViewmodel: Record<string, unknown> | null;
};

/** Live scene refs not represented in the simplified 3-mode pick list (`grip`, weapon mesh scale). */
export type WeaponFirstPersonPersistRefs = {
  gripAnchor?: THREE.Object3D;
  weaponVisual?: THREE.Object3D;
};

/**
 * Reads authored transforms for save / dev export. Supports the simplified pick ids (`weapon`
 * mounts the gizmo on `weapon.root`; grip + visual meshes are merged from `persistRefs` when passed).
 */
export function buildWeaponFirstPersonPresentationMergeFromPickList(
  picks: readonly FpPick[],
  persistRefs?: WeaponFirstPersonPersistRefs,
): WeaponFirstPersonAuthoringPresentationMerge {
  const byId = new Map(picks.map((p) => [p.id, p.object]));

  const rig = byId.get("rigRoot");
  const grip = persistRefs?.gripAnchor ?? byId.get("gripAnchor");
  const hand = byId.get("hand");
  const wRoot =
    byId.get("weapon") ??
    byId.get("weaponRoot");
  const wVis = persistRefs?.weaponVisual ?? byId.get("weaponVisual");

  const mountEuler = wRoot?.rotation;
  const mount: WeaponMountAuthorMerge | null =
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
