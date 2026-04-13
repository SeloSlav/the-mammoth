/**
 * Validates `content/weapons/*.presentation.json` before the dev middleware writes it.
 * Intentionally **does not** import `@the-mammoth/engine` — Vite loads this file while
 * resolving `vite.config.ts`; pulling the engine package entry hits Node ESM `.js` → `.ts`
 * resolution failures (`fpLocomotion.js` etc.). Keep in sync with
 * `packages/engine/src/weapons/weaponPrimitiveAuthoring.ts` `parseWeaponPrimitivePresentationDoc`.
 */

type Vec3 = { x: number; y: number; z: number };

type SwingKeyframe = {
  t: number;
  rotationRad: Vec3;
  translationM: Vec3;
};

function assertSortedKeyframes(keys: SwingKeyframe[], label: string): void {
  for (let i = 1; i < keys.length; i++) {
    if (keys[i]!.t < keys[i - 1]!.t) {
      throw new Error(`${label}: meleeSwing keyframes must be sorted by t ascending`);
    }
  }
}

function assertVec3(path: string, v: unknown): asserts v is Vec3 {
  if (!v || typeof v !== "object") throw new Error(`${path}: expected object`);
  const o = v as Record<string, unknown>;
  if (typeof o.x !== "number" || typeof o.y !== "number" || typeof o.z !== "number") {
    throw new Error(`${path}: expected { x, y, z } numbers`);
  }
}

/** Keep in sync with `weaponPrimitiveAuthoring.ts` `FP_GRIP_ANCHOR_MAX_ABS_M`. */
const FP_GRIP_ANCHOR_MAX_ABS_M = 2.5;

/** Keep in sync with `weaponPrimitiveAuthoring.ts` FP rig root bounds (asymmetric Y). */
const FP_RIG_ROOT_XZ_MAX_ABS_M = 0.62;
const FP_RIG_ROOT_Y_MIN_M = -0.68;
const FP_RIG_ROOT_Y_MAX_M = 0.42;

/** Keep in sync with `weaponPrimitiveAuthoring.ts` `WEAPON_MOUNT_SCALE_MAX_ABS`. */
const WEAPON_MOUNT_SCALE_MAX_ABS = 16;

function assertGripAnchorInHandSpace(path: string, v: Vec3): void {
  const lim = FP_GRIP_ANCHOR_MAX_ABS_M;
  if (Math.abs(v.x) > lim || Math.abs(v.y) > lim || Math.abs(v.z) > lim) {
    throw new Error(
      `${path} out of ±${lim}m per axis (hand-root local space). Got x=${v.x}, y=${v.y}, z=${v.z}`,
    );
  }
}

function assertRigRootPositionInViewSpace(path: string, v: Vec3): void {
  if (
    Math.abs(v.x) > FP_RIG_ROOT_XZ_MAX_ABS_M ||
    Math.abs(v.z) > FP_RIG_ROOT_XZ_MAX_ABS_M ||
    v.y < FP_RIG_ROOT_Y_MIN_M ||
    v.y > FP_RIG_ROOT_Y_MAX_M
  ) {
    throw new Error(
      `${path} out of FP rig box (|x|,|z|≤${FP_RIG_ROOT_XZ_MAX_ABS_M}m, y∈[${FP_RIG_ROOT_Y_MIN_M},${FP_RIG_ROOT_Y_MAX_M}]). Got x=${v.x}, y=${v.y}, z=${v.z}`,
    );
  }
}

function assertOptionalFpViewmodel(raw: unknown): void {
  if (raw === undefined || raw === null) return;
  if (typeof raw !== "object") {
    throw new Error("weapon presentation: firstPerson.fpViewmodel must be an object");
  }
  const o = raw as Record<string, unknown>;
  if ("gripAnchorPositionM" in o && o.gripAnchorPositionM !== undefined) {
    assertVec3("firstPerson.fpViewmodel.gripAnchorPositionM", o.gripAnchorPositionM);
    assertGripAnchorInHandSpace(
      "firstPerson.fpViewmodel.gripAnchorPositionM",
      o.gripAnchorPositionM as Vec3,
    );
  }
  if ("weaponVisualScale" in o && o.weaponVisualScale !== undefined) {
    assertVec3("firstPerson.fpViewmodel.weaponVisualScale", o.weaponVisualScale);
  }
  if ("crowbarVisualScale" in o && o.crowbarVisualScale !== undefined) {
    assertVec3("firstPerson.fpViewmodel.crowbarVisualScale (legacy)", o.crowbarVisualScale);
  }
  if ("hand" in o && o.hand !== undefined) {
    if (typeof o.hand !== "object" || !o.hand) {
      throw new Error("weapon presentation: firstPerson.fpViewmodel.hand must be an object");
    }
    const h = o.hand as Record<string, unknown>;
    assertVec3("firstPerson.fpViewmodel.hand.positionM", h.positionM);
    assertVec3("firstPerson.fpViewmodel.hand.eulerRad", h.eulerRad);
    assertVec3("firstPerson.fpViewmodel.hand.scale", h.scale);
  }
  if ("rigRoot" in o && o.rigRoot !== undefined) {
    if (typeof o.rigRoot !== "object" || !o.rigRoot) {
      throw new Error("weapon presentation: firstPerson.fpViewmodel.rigRoot must be an object");
    }
    const rr = o.rigRoot as Record<string, unknown>;
    assertVec3("firstPerson.fpViewmodel.rigRoot.positionM", rr.positionM);
    assertRigRootPositionInViewSpace(
      "firstPerson.fpViewmodel.rigRoot.positionM",
      rr.positionM as Vec3,
    );
    if ("eulerRad" in rr && rr.eulerRad !== undefined) {
      assertVec3("firstPerson.fpViewmodel.rigRoot.eulerRad", rr.eulerRad);
    }
    if ("scaleM" in rr && rr.scaleM !== undefined) {
      assertVec3("firstPerson.fpViewmodel.rigRoot.scaleM", rr.scaleM);
    }
  }
}

function assertRolePresentation(r: unknown, label: string): void {
  if (!r || typeof r !== "object") throw new Error(`${label}: expected object`);
  const o = r as Record<string, unknown>;
  const mount = o.mount;
  if (!mount || typeof mount !== "object") throw new Error(`${label}.mount required`);
  const m = mount as Record<string, unknown>;
  assertVec3(`${label}.mount.positionM`, m.positionM);
  assertVec3(`${label}.mount.eulerRad`, m.eulerRad);
  if ("scaleM" in m && m.scaleM !== undefined) {
    assertVec3(`${label}.mount.scaleM`, m.scaleM);
    const s = m.scaleM as Vec3;
    const lim = WEAPON_MOUNT_SCALE_MAX_ABS;
    if (Math.abs(s.x) > lim || Math.abs(s.y) > lim || Math.abs(s.z) > lim) {
      throw new Error(
        `${label}.mount.scaleM: each abs component must be ≤ ${lim} (got x=${s.x}, y=${s.y}, z=${s.z})`,
      );
    }
  }
  const swing = o.meleeSwing;
  if (!Array.isArray(swing)) throw new Error(`${label}.meleeSwing must be an array`);
  for (const k of swing) {
    if (!k || typeof k !== "object") throw new Error(`${label}.meleeSwing: bad keyframe`);
    const kk = k as Record<string, unknown>;
    if (typeof kk.t !== "number") throw new Error(`${label}.meleeSwing: keyframe t must be number`);
    assertVec3(`${label}.meleeSwing.rotationRad`, kk.rotationRad);
    assertVec3(`${label}.meleeSwing.translationM`, kk.translationM);
  }
  assertSortedKeyframes(swing as SwingKeyframe[], `${label}.meleeSwing`);
}

/** Throws with a useful message if `parsed` is not a valid weapon presentation document. */
export function assertValidWeaponPresentationJson(parsed: unknown): void {
  if (!parsed || typeof parsed !== "object") throw new Error("presentation: expected root object");
  const d = parsed as Record<string, unknown>;
  if (d.version !== 1) throw new Error(`presentation: unsupported version ${String(d.version)}`);
  assertRolePresentation(d.firstPerson, "firstPerson");
  assertRolePresentation(d.thirdPerson, "thirdPerson");
  const fp = (d.firstPerson as Record<string, unknown>).fpViewmodel;
  assertOptionalFpViewmodel(fp);
}
