/**
 * Authoring for placeholder weapons (mount + procedural swing).
 * Loaded from `content/weapons/*.presentation.json` — tune in an editor or by hand;
 * later the same shapes can be exported from Blender / clip metadata.
 */

export type WeaponAuthorVec3 = { x: number; y: number; z: number };

export type PrimitiveSwingKeyframe = {
  /** Normalized time along the swing, 0 = rest → 1 = rest (include wind-up + strike + follow-through). */
  t: number;
  /** Local euler (radians), XYZ order matches Three `rotation.set(x,y,z)`. */
  rotationRad: WeaponAuthorVec3;
  /** Local translation (meters) relative to visual root at bind pose. */
  translationM: WeaponAuthorVec3;
};

export type PrimitiveRolePresentation = {
  mount: {
    positionM: WeaponAuthorVec3;
    eulerRad: WeaponAuthorVec3;
  };
  meleeSwing: PrimitiveSwingKeyframe[];
};

export type WeaponPrimitivePresentationDoc = {
  version: number;
  firstPerson: PrimitiveRolePresentation;
  thirdPerson: PrimitiveRolePresentation;
};

function assertSortedKeyframes(keys: PrimitiveSwingKeyframe[]): void {
  for (let i = 1; i < keys.length; i++) {
    if (keys[i]!.t < keys[i - 1]!.t) {
      throw new Error("weaponPrimitiveAuthoring: meleeSwing keyframes must be sorted by t ascending");
    }
  }
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpVec3(a: WeaponAuthorVec3, b: WeaponAuthorVec3, u: number): WeaponAuthorVec3 {
  return {
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
    z: lerp(a.z, b.z, u),
  };
}

/**
 * Linear attack phase in [0,1] (one pass per swing). Use for tooling / coupled bones.
 */
export function primitiveMeleeSwingTrackT(phase01: number): number {
  return Math.max(0, Math.min(1, phase01));
}

/** Sample swing pose at linear `phase01` in [0,1] along authored keyframe `t` values. */
export function samplePrimitiveMeleeSwing(
  keyframes: PrimitiveSwingKeyframe[],
  phase01: number,
): { rotationRad: WeaponAuthorVec3; translationM: WeaponAuthorVec3 } {
  if (keyframes.length === 0) {
    return {
      rotationRad: { x: 0, y: 0, z: 0 },
      translationM: { x: 0, y: 0, z: 0 },
    };
  }
  const trackT = primitiveMeleeSwingTrackT(phase01);
  if (trackT <= keyframes[0]!.t) {
    return {
      rotationRad: { ...keyframes[0]!.rotationRad },
      translationM: { ...keyframes[0]!.translationM },
    };
  }
  const last = keyframes[keyframes.length - 1]!;
  if (trackT >= last.t) {
    return { rotationRad: { ...last.rotationRad }, translationM: { ...last.translationM } };
  }
  let i = 0;
  while (i < keyframes.length - 1 && keyframes[i + 1]!.t < trackT) i++;
  const k0 = keyframes[i]!;
  const k1 = keyframes[i + 1]!;
  const span = k1.t - k0.t;
  const u = span > 1e-8 ? (trackT - k0.t) / span : 0;
  return {
    rotationRad: lerpVec3(k0.rotationRad, k1.rotationRad, u),
    translationM: lerpVec3(k0.translationM, k1.translationM, u),
  };
}

/** Runtime validation for imported JSON. */
export function parseWeaponPrimitivePresentationDoc(
  raw: unknown,
): WeaponPrimitivePresentationDoc {
  const d = raw as WeaponPrimitivePresentationDoc;
  if (d.version !== 1) throw new Error(`weapon presentation: unsupported version ${d.version}`);
  assertSortedKeyframes(d.firstPerson.meleeSwing);
  assertSortedKeyframes(d.thirdPerson.meleeSwing);
  return d;
}
