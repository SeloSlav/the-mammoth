# FP session: building mesh visibility and unit interiors

First-person `mountFpSession` toggles large chunks of the static building for performance. Two decisions look similar (“is the player inside the building?”) but **must use different tests**. Reusing one for the other caused façade apartments to **lose all plaster `shell_wall_*` geometry** when approaching windows.

---

## What gets toggled

1. **Floor plates** — `buildingRoot` children tagged with `userData.mammothPlateLevelIndex`. Visibility is a storey band around the player (and sometimes the full stack).
2. **Unit interior shells** — meshes collected at mount with `userData.mammothUnitInterior === true` (only `shell_wall_*` inside hollow unit rooms). Tagged in `packages/world/src/floorPlaceholderMeshes.ts` when building floor placeholders.

Exterior concrete cladding and merged window glass are **not** in the interior list; they stay visible when unit plaster is hidden.

---

## Rule 1: Floor band vs full stack (uses a **footprint inset**)

`fpBuildingExteriorViewShouldRevealFullStack` in `apps/client/src/game/fpBuildingFloorPlateVisibilityBand.ts` returns “exterior / near-perimeter mode” when the camera’s XZ position is **outside** a rectangle shrunk from the building world AABB by **6 m per side** (default `interiorCullInsetM`).

That mode forces the **full vertical stack** of floor plates to stay visible so façades and shaft-adjacent geometry do not pop when you stand near the edge of the footprint.

**Intent:** stability for **vertical** culling and distant views — not a literal “player is outside the building” flag for gameplay.

---

## Rule 2: Unit plaster visibility (uses **raw footprint XZ**)

Unit interior walls must stay visible whenever the player is still **inside the slab outline**, including shallow **perimeter units** whose XZ lies entirely in that outer 6 m ring relative to the global building AABB.

Use `fpCameraOrFeetInsideBuildingFootprintXZ` (same module as above): treat as inside if **either** the camera **or** the feet (`pos`) lie inside the **full** world XZ bounds (small epsilon for edge stability).

**Intent:** hide plaster only when both samples are clearly **outside** the building’s axis-aligned footprint — e.g. true exterior shots where cladding + glass are enough.

---

## Pitfall (fixed): one heuristic for both

Previously, `unitInteriorVisible` was derived as `!fpBuildingExteriorViewShouldRevealFullStack(...)`. Any camera in the inset’s “exterior” ring — including deep inside a façade apartment — flipped all unit plaster off, so only concrete cladding read through the window gap.

**Do not** tie `mammothUnitInterior` mesh `.visible` to the inset-based function again unless you also change world tagging so perimeter units are excluded (likely not worth it).

---

## Where to change this

| Concern | Location |
|--------|----------|
| Inset full-stack test | `fpBuildingExteriorViewShouldRevealFullStack` |
| Raw footprint test for plaster | `fpCameraOrFeetInsideBuildingFootprintXZ` |
| Wiring + mesh collection | `apps/client/src/game/mountFpSession.ts` (`syncBuildingFloorPlateVisibility`, `unitInteriorMeshes`) |
| Which meshes are “unit interior” | `packages/world/src/floorPlaceholderMeshes.ts` (`mammothUnitInterior`, `mammothSkipFloorGeometryMerge`) |

Tests for the footprint helper live in `apps/client/src/game/fpBuildingFloorPlateVisibilityBand.test.ts`.
