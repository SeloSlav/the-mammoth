---
name: Unit exterior windows
overview: Add deterministic, seeded facade windows on each apartment unit’s true exterior wall(s) by extending the existing hollow-shell / holed-wall pipeline in `@the-mammoth/world`, reusing `WallHoleYZ` / `WallHoleXY` and `MeshPhysicalMaterial` glass like elevator/apartment doors.
todos:
  - id: module-windows
    content: "Add unitExteriorWindows.ts: hash/mulberry32, per-face segment + tint planning, glass helper + material cache"
    status: completed
  - id: integrate-shell
    content: "Update floorPlaceholderMeshes: merge window holes into inner walls; window-only cladding for units; holed-branch gate; add glass meshes; keep door trims on cw only"
    status: completed
  - id: seed-plumb
    content: Add facadeSalt to BuildFloorMeshesOptions + InstantiateBuildingFloorStackOptions with default constant
    status: completed
  - id: tests
    content: "Vitest: determinism + optional buildFloorMeshes smoke for holed exterior wall"
    status: completed
isProject: false
---

# Deterministic exterior windows for apartment units

## Context (current behavior)

- [`packages/world/src/floorPlaceholderMeshes.ts`](packages/world/src/floorPlaceholderMeshes.ts) builds each placed object shell in `buildFloorMeshes`. For axis-aligned units it computes **exterior faces** by comparing the room AABB to the plate AABB (`roomExteriorFaces`: `e`/`w`/`n`/`s` when touching `max.x` / `min.x` / `max.z` / `min.z` within `exteriorFaceTol`).
- **Exterior cladding** is a thin, no-collision layer via [`addExteriorWallCladding`](packages/world/src/floorPlaceholderMeshes.ts) (uses the same holed-wall helpers as interior shells).
- **Problem for windows:** when a unit has **no** corridor/door holes (`stairHoleCount === 0`), the code takes the **solid** four-wall branch and passes **no** hole list to cladding — so there is no hook for openings today. Any implementation must **either** merge window holes into that path or **broaden** the condition for the holed-wall branch to include “has exterior window holes”.

## Design

### 1) New module: layout + RNG

Add [`packages/world/src/unitExteriorWindows.ts`](packages/world/src/unitExteriorWindows.ts) (name can be adjusted) containing:

- **`hash32` / `mulberry32`** (or equivalent): 32-bit seed mixer from inputs: `facadeSalt` (number), `storyLevelIndex`, `floorDoc.id`, `placedObject.id`, and **`face`** (`e|w|n|s`). Same inputs ⇒ same layout until `facadeSalt` or ids change.
- **`planUnitExteriorWindowsForFace`**: for one exterior face of one unit, returns:
  - **`count`**: 1, 2, or 3 (weighted or uniform via deterministic draw).
  - **`segments`**: tangent-aligned intervals along the wall (Z for `e`/`w`, X for `n`/`s`) with shared **sill/head** in room-local Y (e.g. sill ~0.55 m above `yLo`, head ~2.2–2.35 m), **edge inset** (~0.35 m) and **mullion gap** (~0.12 m). One segment = one “long” window; two/three = split the usable tangent span fairly with jitter bounded by the RNG stream.
  - **`tintId`**: small integer 0..K−1 mapping to a **preset** `{ color, transmission?, roughness? }` for glass.

Keep math conservative so segments stay inside `[zMin,zMax]` or `[xMin,xMax]` derived from the same `vlenX`/`vlenZ` already used in `addHollowRoomShell` (after wall thickness inset).

### 2) Geometry integration (units only)

In [`buildFloorMeshes`](packages/world/src/floorPlaceholderMeshes.ts), for `kind === "unit"` and each face in `roomExteriorFaces`:

1. Call the planner to get `WallHoleYZ[]` or `WallHoleXY[]` for that face.
2. Build a **`CorridorShellWallHoles`-shaped** structure **only for mesh merging** (or a parallel `exteriorWindowHoles` field on `HollowShellOpts` — see below).

**Inner shell walls:** merge holes per face:

- `innerHoles[face] = mergeHoleLists(corridorWallHoles?.[face] ?? [], exteriorWindowHoles[face])`

Use the existing merge semantics implied by [`addWallConstantXWithHoles`](packages/world/src/wallWithDoorCutout.ts) (multiple holes already supported).

**Important:** do **not** feed window holes into [`addResidenceEntryDoorFrameTrimsForUnit`](packages/world/src/floorPlaceholderMeshes.ts) — trims must keep using **only** `corridorWallHoles` (entry doors).

**Exterior cladding:** for `kind === "unit"`, pass **window-only** holes into `addExteriorWallCladding` for each exterior face (do **not** reuse `cw` on that face, so a mis-authored door on an exterior face would not punch the facade). Corridors/lobbies keep today’s behavior (`cw` holes on cladding).

**Holed vs solid branch:** replace the gate `stairHoleCount === 0` with something like `totalMergedHoles === 0` where `totalMergedHoles` counts merged inner holes on all four faces, so units with **only** windows still use the holed wall path.

Extend [`HollowShellOpts`](packages/world/src/floorPlaceholderMeshes.ts) with optional `exteriorWindowHoles` **or** pre-merge in `buildFloorMeshes` and pass the merged arrays only to wall builders — either is fine as long as door trims stay isolated.

### 3) Glass panes + tints

- After the shell group is built for that unit, add **thin `PlaneGeometry` meshes** (or very thin boxes) slightly **outside** the inner wall plane (and consistent with cladding offset ~0.035 m) so they sit in the opening, not z-fighting with concrete.
- Use **`MeshPhysicalMaterial`** consistent with [`createSwingDoorMaterials`](packages/world/src/swingDoorMesh.ts) / apartment kit: `transmission`, `transparent`, `depthWrite: false`, `ior` ~1.45.
- **Material cache:** module-level `Map<string, MeshPhysicalMaterial>` keyed by tint preset id to avoid thousands of duplicate materials.
- Mark glass `userData.mammothNoCollision = true` (match cladding pattern via [`markNewChildrenNoCollision`](packages/world/src/floorPlaceholderMeshes.ts)).

### 4) Seed plumbing

- Add **`facadeSalt?: number`** to [`BuildFloorMeshesOptions`](packages/world/src/elevatorDoorFacesFromGroundFloorDoc.ts) and thread from [`InstantiateBuildingFloorStackOptions`](packages/world/src/buildingFloorStack.ts) → `buildFloorMeshes`.
- Default: a **named constant** in [`buildingFloorStack.ts`](packages/world/src/buildingFloorStack.ts) (e.g. `DEFAULT_EXTERIOR_FACADE_SALT = 1`) so changing one value reshuffles all facades; callers can override later (editor, server-driven config) without touching floor JSON.

### 5) Tests

- New [`packages/world/src/unitExteriorWindows.test.ts`](packages/world/src/unitExteriorWindows.test.ts): same inputs ⇒ identical segments/tintId; different `facadeSalt` or `obj.id` ⇒ (likely) different layout.
- Optional snapshot-style test calling `buildFloorMeshes` with a tiny synthetic `FloorDoc` (one corridor + one east-edge unit) and asserting the exterior face mesh names include holed fragments (`shell_wall_e_y_*` / `_z_*`) instead of a single `_solid` when windows are enabled.

### 6) Scope notes (no extra ask needed)

- **Corner units** with two entries in `roomExteriorFaces` get independent plans per face (same seed stream keyed by face) — matches “every outside-facing wall.”
- **Ground vs typical:** only `classifyPrefab === "unit"` receives windows; ground podium units (if any) follow the same rule automatically.
- **Server / collision:** box-derived collision from shell fragments will exclude window openings; glass is no-collision. No Rust changes unless you later add exterior openings to generated walk surfaces (out of scope unless you see regressions).

## Files to touch

| File | Change |
|------|--------|
| [`packages/world/src/unitExteriorWindows.ts`](packages/world/src/unitExteriorWindows.ts) | New: hash, RNG, planning, tint presets, optional glass mesh helper |
| [`packages/world/src/floorPlaceholderMeshes.ts`](packages/world/src/floorPlaceholderMeshes.ts) | Wire planner for units; merge holes; fix solid vs holed gate; cladding holes; add glass |
| [`packages/world/src/elevatorDoorFacesFromGroundFloorDoc.ts`](packages/world/src/elevatorDoorFacesFromGroundFloorDoc.ts) | Add `facadeSalt?` to options type |
| [`packages/world/src/buildingFloorStack.ts`](packages/world/src/buildingFloorStack.ts) | Pass `facadeSalt`; export default constant |
| [`packages/world/src/index.ts`](packages/world/src/index.ts) | Re-export new symbols if useful for tooling |
| [`packages/world/src/unitExteriorWindows.test.ts`](packages/world/src/unitExteriorWindows.test.ts) | Determinism tests |
