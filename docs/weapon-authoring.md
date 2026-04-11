# Weapon presentation authoring

## Why not build a full “animation editor” yet?

A **general-purpose keyframe / skeletal animation editor** inside The Mammoth is a large product (timeline UI, curve editors, retargeting, undo, asset IO). You already have an **editor app** in the monorepo; the pragmatic path is:

1. **Now — data-driven JSON** under `content/weapons/*.presentation.json` for placeholder mounts and procedural swings. Tune numbers in VS Code or any JSON editor; hot-reload in dev picks up changes.
2. **Soon — editor app “preview” tab** that loads the same JSON + a minimal Three preview so designers can iterate without touching TypeScript. Still not a full DCC; it’s a **viewer + property panel**.
3. **Ship-quality melee / firearms** — author **GLTF animation clips in Blender** (or similar), then map `AnimationActionName` → clip names in `WeaponDefinition.animationSet`. The JSON layer remains useful for offsets and attachment points until everything lives on bones.

So: **yes, you can specify placement and swing direction in an editor sense**, starting with **authored files**; a dedicated in-engine animation editor is optional and should grow out of the preview workflow, not replace Blender for hero animations.

## Crowbar (`content/weapons/crowbar.presentation.json`)

- **`firstPerson` / `thirdPerson`**: separate blocks so FP viewmodel and TP hand attach never fight each other.
- **`mount`**: rest pose of the weapon **root** under the parent (camera for FP, hand anchor for TP). `eulerRad` uses **XYZ radians** (same as `THREE.Object3D.rotation.set(x,y,z)`).
- **`meleeSwing`**: sorted keyframes with `t` in **[0, 1]**. Attack transient progress `phase01` (0→1) is **linear** along the clip — sample by interpolating keyframes at `trackT = clamp(phase01, 0, 1)` (see `primitiveMeleeSwingTrackT`). Author **wind-up → strike → follow-through → rest** explicitly in JSON (do not rely on a mirrored sine curve).
- **First-person translation space:** `translationM` / `rotationRad` from `meleeSwing` are applied to the **forearm rig** (`rightArmRig`): shoulder pivot in `fpRoot` space — same as “animate this bone”. The crowbar’s `WeaponPresenter.root` is **parented under that rig** with a fixed local grip (`attachToFpHand`), so the tool stays rigid in hand like a real weapon socket. (When GLB rigs land, the rig becomes an armature bone instead of a `THREE.Group`.)
- **Melee input:** use `pointerdown` only (not `mousedown` + `pointerdown`) and a short debounce on `PrimitiveAnimationDriver.triggerTransient` so one click cannot start two swings.

### Tuning the swing direction

Edit rotation/translation at the **mid keyframes** (around `t ≈ 0.45–0.55` on the sin curve, i.e. `t` in JSON around **0.3–0.7**). To invert a swing, flip the signs on the dominant axis (often **`rotationRad.y`** for a horizontal sweep in camera space).

## Types and code

- Types: `packages/engine/src/weapons/weaponPrimitiveAuthoring.ts`
- Loader + parse: `parseWeaponPrimitivePresentationDoc` (version check + keyframe order)
- Runtime sampling: `samplePrimitiveMeleeSwing`
- `WeaponPresenter` applies `mount` once. **FP + `attachToFpHand`:** swing keyframes drive the **parent rig** only; the weapon stays at the fixed hand-local grip. **Remote / no hand attach:** swing updates `root` + `visual` as before.

## Future: editor integration

When you add a preview in `apps/editor`, import the same JSON schema and write back to `content/weapons/`. Optional: add a JSON schema file (`crowbar.presentation.schema.json`) for autocomplete in the IDE.
