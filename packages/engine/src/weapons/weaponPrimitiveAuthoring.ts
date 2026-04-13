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

/** Optional first-person GLB layout (melee weapon + hand); only `firstPerson` is read at runtime today. */
export type FpViewmodelAuthoringDoc = {
  /**
   * Rest pose of the whole hand+weapon rig under `fpRoot` (head pitch space) — primary control for
   * where the viewmodel sits on the gameplay camera. Omitted → built-in shoulder default.
   */
  rigRoot?: {
    positionM: WeaponAuthorVec3;
    eulerRad?: WeaponAuthorVec3;
    scaleM?: WeaponAuthorVec3;
  };
  gripAnchorPositionM?: WeaponAuthorVec3;
  hand?: {
    positionM: WeaponAuthorVec3;
    eulerRad: WeaponAuthorVec3;
    scale: WeaponAuthorVec3;
  };
  /** Local scale on weapon GLB visual after max-edge normalize. */
  weaponVisualScale?: WeaponAuthorVec3;
};

export type PrimitiveRolePresentation = {
  mount: {
    positionM: WeaponAuthorVec3;
    eulerRad: WeaponAuthorVec3;
    /** Local XYZ scale on the weapon root (vs parent). Omitted in older files → treated as 1,1,1. */
    scaleM?: WeaponAuthorVec3;
  };
  meleeSwing: PrimitiveSwingKeyframe[];
  fpViewmodel?: FpViewmodelAuthoringDoc;
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

function assertVec3(label: string, v: unknown): asserts v is WeaponAuthorVec3 {
  if (!v || typeof v !== "object") throw new Error(`${label}: expected object`);
  const o = v as Record<string, unknown>;
  if (typeof o.x !== "number" || typeof o.y !== "number" || typeof o.z !== "number") {
    throw new Error(`${label}: expected { x, y, z } numbers`);
  }
}

/**
 * Max absolute component for `gripAnchorPositionM` in **hand-root local space** (meters).
 * Scaled-down hand GLBs often need larger local numbers than the world-space offset suggests;
 * this bound only rejects absurd slips (e.g. multi-meter typos).
 */
export const FP_GRIP_ANCHOR_MAX_ABS_M = 2.5;

/**
 * Max absolute component for `mount.scaleM` on primitive weapons (local scale vs parent).
 * High enough for intentional non-uniform crowbar-in-hand squash/stretch; still rejects typos
 * on the order of 1e2+.
 */
export const WEAPON_MOUNT_SCALE_MAX_ABS = 16;

/**
 * `rigRoot.positionM` lives in **fpRoot local space** (meters). A symmetric ±cube allowed
 * `y ≈ −1.35`, which places the hand at **shin / ground** height in world — reject with a
 * shoulder-only axis-aligned box instead.
 */
export const FP_RIG_ROOT_XZ_MAX_ABS_M = 0.62;
export const FP_RIG_ROOT_Y_MIN_M = -0.68;
export const FP_RIG_ROOT_Y_MAX_M = 0.42;

/** Legacy single limit — max half-extent of the authoring box above (for callers/tests). */
export const FP_RIG_ROOT_MAX_ABS_M = Math.max(
  FP_RIG_ROOT_XZ_MAX_ABS_M,
  Math.abs(FP_RIG_ROOT_Y_MIN_M),
  FP_RIG_ROOT_Y_MAX_M,
);

export function isFpRigRootPositionAuthorable(p: WeaponAuthorVec3): boolean {
  return (
    Math.abs(p.x) <= FP_RIG_ROOT_XZ_MAX_ABS_M &&
    Math.abs(p.z) <= FP_RIG_ROOT_XZ_MAX_ABS_M &&
    p.y >= FP_RIG_ROOT_Y_MIN_M &&
    p.y <= FP_RIG_ROOT_Y_MAX_M
  );
}

/** Hard clamp for runtime / framing so bad vectors never persist in memory. */
export function clampFpRigRootPositionInPlace(rest: { x: number; y: number; z: number }): void {
  const cap = FP_RIG_ROOT_XZ_MAX_ABS_M * 0.999;
  rest.x = Math.max(-cap, Math.min(cap, rest.x));
  rest.z = Math.max(-cap, Math.min(cap, rest.z));
  rest.y = Math.max(FP_RIG_ROOT_Y_MIN_M, Math.min(FP_RIG_ROOT_Y_MAX_M, rest.y));
}

function assertGripAnchorInHandSpace(label: string, g: WeaponAuthorVec3): void {
  const lim = FP_GRIP_ANCHOR_MAX_ABS_M;
  if (
    Math.abs(g.x) > lim ||
    Math.abs(g.y) > lim ||
    Math.abs(g.z) > lim
  ) {
    throw new Error(
      `${label} out of ±${lim}m per axis (hand-root local space). Got x=${g.x}, y=${g.y}, z=${g.z}`,
    );
  }
}

function parseOptionalFpViewmodel(raw: unknown): FpViewmodelAuthoringDoc | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") {
    throw new Error("weapon presentation: firstPerson.fpViewmodel must be an object");
  }
  const o = raw as Record<string, unknown>;
  const out: FpViewmodelAuthoringDoc = {};
  if ("rigRoot" in o && o.rigRoot !== undefined) {
    if (typeof o.rigRoot !== "object" || !o.rigRoot) {
      throw new Error("weapon presentation: firstPerson.fpViewmodel.rigRoot must be an object");
    }
    const rr = o.rigRoot as Record<string, unknown>;
    assertVec3("firstPerson.fpViewmodel.rigRoot.positionM", rr.positionM);
    const rigPos = rr.positionM as WeaponAuthorVec3;
    if (!isFpRigRootPositionAuthorable(rigPos)) {
      // Corrupt / clamp-pinned JSON: omit rigRoot so runtime uses built-in shoulder default.
    } else {
      const rigRoot: NonNullable<FpViewmodelAuthoringDoc["rigRoot"]> = {
        positionM: rigPos,
      };
      if ("eulerRad" in rr && rr.eulerRad !== undefined) {
        assertVec3("firstPerson.fpViewmodel.rigRoot.eulerRad", rr.eulerRad);
        rigRoot.eulerRad = rr.eulerRad;
      }
      if ("scaleM" in rr && rr.scaleM !== undefined) {
        assertVec3("firstPerson.fpViewmodel.rigRoot.scaleM", rr.scaleM);
        rigRoot.scaleM = rr.scaleM;
      }
      out.rigRoot = rigRoot;
    }
  }
  if ("gripAnchorPositionM" in o && o.gripAnchorPositionM !== undefined) {
    assertVec3("firstPerson.fpViewmodel.gripAnchorPositionM", o.gripAnchorPositionM);
    assertGripAnchorInHandSpace("firstPerson.fpViewmodel.gripAnchorPositionM", o.gripAnchorPositionM);
    out.gripAnchorPositionM = o.gripAnchorPositionM;
  }
  if ("weaponVisualScale" in o && o.weaponVisualScale !== undefined) {
    assertVec3("firstPerson.fpViewmodel.weaponVisualScale", o.weaponVisualScale);
    out.weaponVisualScale = o.weaponVisualScale;
  } else if ("crowbarVisualScale" in o && o.crowbarVisualScale !== undefined) {
    assertVec3("firstPerson.fpViewmodel.crowbarVisualScale (legacy)", o.crowbarVisualScale);
    out.weaponVisualScale = o.crowbarVisualScale;
  }
  if ("hand" in o && o.hand !== undefined) {
    if (typeof o.hand !== "object" || !o.hand) {
      throw new Error("weapon presentation: firstPerson.fpViewmodel.hand must be an object");
    }
    const h = o.hand as Record<string, unknown>;
    assertVec3("firstPerson.fpViewmodel.hand.positionM", h.positionM);
    assertVec3("firstPerson.fpViewmodel.hand.eulerRad", h.eulerRad);
    assertVec3("firstPerson.fpViewmodel.hand.scale", h.scale);
    out.hand = {
      positionM: h.positionM,
      eulerRad: h.eulerRad,
      scale: h.scale,
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
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

/**
 * Canonical first-person melee swing used as the shared baseline (crowbar / baseball bat JSON;
 * unarmed fallback in {@link LocalFirstPersonPresenter}). Editor “reset to default” clones this.
 */
export const DEFAULT_FP_MELEE_SWING_KEYFRAMES: readonly PrimitiveSwingKeyframe[] = [
  {
    t: 0,
    rotationRad: { x: 0, y: 0, z: 0 },
    translationM: { x: 0, y: 0, z: 0 },
  },
  {
    t: 0.12,
    rotationRad: { x: 0.18, y: 0, z: 0.02 },
    translationM: { x: 0, y: 0.02, z: 0.05 },
  },
  {
    t: 0.38,
    rotationRad: { x: -1.55, y: -0.04, z: -0.06 },
    translationM: { x: 0.05, y: -0.34, z: -0.58 },
  },
  {
    t: 0.62,
    rotationRad: { x: -0.45, y: 0, z: -0.02 },
    translationM: { x: 0.02, y: -0.14, z: -0.22 },
  },
  {
    t: 1,
    rotationRad: { x: 0, y: 0, z: 0 },
    translationM: { x: 0, y: 0, z: 0 },
  },
];

export function cloneDefaultFpMeleeSwingKeyframes(): PrimitiveSwingKeyframe[] {
  return DEFAULT_FP_MELEE_SWING_KEYFRAMES.map((k) => ({
    t: k.t,
    rotationRad: { ...k.rotationRad },
    translationM: { ...k.translationM },
  }));
}

function assertMountScaleMComponents(label: string, v: WeaponAuthorVec3): void {
  const lim = WEAPON_MOUNT_SCALE_MAX_ABS;
  if (Math.abs(v.x) > lim || Math.abs(v.y) > lim || Math.abs(v.z) > lim) {
    throw new Error(
      `${label}: each abs component must be ≤ ${lim} (got x=${v.x}, y=${v.y}, z=${v.z})`,
    );
  }
}

function assertOptionalMountScaleM(mount: unknown, label: string): void {
  if (!mount || typeof mount !== "object") return;
  const m = (mount as Record<string, unknown>).scaleM;
  if (m !== undefined) {
    assertVec3(`${label}.mount.scaleM`, m);
    assertMountScaleMComponents(`${label}.mount.scaleM`, m);
  }
}

/** Runtime validation for imported JSON. */
export function parseWeaponPrimitivePresentationDoc(
  raw: unknown,
): WeaponPrimitivePresentationDoc {
  const d = raw as WeaponPrimitivePresentationDoc & {
    firstPerson: PrimitiveRolePresentation & { fpViewmodel?: unknown };
  };
  if (d.version !== 1) throw new Error(`weapon presentation: unsupported version ${d.version}`);
  assertOptionalMountScaleM(d.firstPerson.mount, "firstPerson");
  assertOptionalMountScaleM(d.thirdPerson.mount, "thirdPerson");
  assertSortedKeyframes(d.firstPerson.meleeSwing);
  assertSortedKeyframes(d.thirdPerson.meleeSwing);
  const rawFirst = d.firstPerson;
  const fpViewmodel = parseOptionalFpViewmodel(rawFirst.fpViewmodel);
  const { fpViewmodel: _stripRawFp, ...firstPersonRest } = rawFirst;
  const firstPerson: PrimitiveRolePresentation =
    fpViewmodel !== undefined
      ? { ...firstPersonRest, fpViewmodel }
      : { ...firstPersonRest };
  return {
    version: d.version,
    firstPerson,
    thirdPerson: { ...d.thirdPerson },
  };
}
