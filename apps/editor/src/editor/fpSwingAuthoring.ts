import * as THREE from "three";
import {
  getWeaponDefinition,
  type LocalFirstPersonPresenter,
  type PrimitiveSwingKeyframe,
} from "@the-mammoth/engine";
import type { FpAuthorWeaponId } from "./weaponPresentationDiskSave.js";

export const SWING_KEYFRAME_T_EPS = 0.025;

function r4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function cloneMeleeSwingTrack(track: readonly PrimitiveSwingKeyframe[]): PrimitiveSwingKeyframe[] {
  return track.map((k) => ({
    t: k.t,
    rotationRad: { ...k.rotationRad },
    translationM: { ...k.translationM },
  }));
}

export function upsertSwingKeyframeAtT(
  keys: readonly PrimitiveSwingKeyframe[],
  t: number,
  frame: Pick<PrimitiveSwingKeyframe, "rotationRad" | "translationM">,
): PrimitiveSwingKeyframe[] {
  const clampedT = Math.max(0, Math.min(1, t));
  const next = cloneMeleeSwingTrack(keys);
  const i = next.findIndex((k) => Math.abs(k.t - clampedT) < SWING_KEYFRAME_T_EPS);
  let entryT = clampedT;
  if (i >= 0) {
    const prevT = next[i]!.t;
    if (Math.abs(prevT) < SWING_KEYFRAME_T_EPS) entryT = 0;
    else if (Math.abs(prevT - 1) < SWING_KEYFRAME_T_EPS) entryT = 1;
  }
  const entry: PrimitiveSwingKeyframe = { t: entryT, ...frame };
  if (i >= 0) next[i] = entry;
  else next.push(entry);
  next.sort((a, b) => a.t - b.t);
  return next;
}

export function rigDeltaFromRest(
  rig: THREE.Object3D,
  restPos: THREE.Vector3,
  restEuler: THREE.Euler,
): Pick<PrimitiveSwingKeyframe, "rotationRad" | "translationM"> {
  return {
    translationM: {
      x: r4(rig.position.x - restPos.x),
      y: r4(rig.position.y - restPos.y),
      z: r4(rig.position.z - restPos.z),
    },
    rotationRad: {
      x: r4(rig.rotation.x - restEuler.x),
      y: r4(rig.rotation.y - restEuler.y),
      z: r4(rig.rotation.z - restEuler.z),
    },
  };
}

export function buildNextSwingKeyframesAfterCapture(
  pres: LocalFirstPersonPresenter,
  weaponId: FpAuthorWeaponId,
  scrubPhase01: number,
  previousDraft: PrimitiveSwingKeyframe[] | null,
): PrimitiveSwingKeyframe[] {
  const def = getWeaponDefinition(weaponId);
  const track = def?.primitivePresentation?.firstPerson?.meleeSwing;
  if (!track || track.length === 0) {
    throw new Error("Weapon has no firstPerson.meleeSwing track in its definition.");
  }
  const base = previousDraft ? cloneMeleeSwingTrack(previousDraft) : cloneMeleeSwingTrack(track);
  const rest = pres.getFpRigRestLocal();
  const delta = rigDeltaFromRest(pres.getFpSwingRigObject(), rest.position, rest.euler);
  return upsertSwingKeyframeAtT(base, scrubPhase01, delta);
}
