# FP session: building mesh visibility

## Floor plates

`syncBuildingFloorPlateVisibility` toggles `buildingRoot` children with `mammothPlateLevelIndex` using a storey band from the elevator world helper. When `fpBuildingExteriorViewShouldRevealFullStack` is true (camera XZ outside the **6 m inset** “core” of the building AABB), the band widens to the **full vertical stack** so façades do not pop.

---

## Tagged interiors (`mammothUnitInterior`)

`mammothUnitInterior` is still set on unit hollow shells and corridor `shell_*` meshes in `floorPlaceholderMeshes.ts` for tooling and consistency. **FP no longer toggles** those meshes off by building footprint (that path hid plaster incorrectly and fought pose / bounds edge cases).

---

## Unit hollow shells: merge safety (`fpSessionWorldMount.ts`)

After `mergeGroupDescendantsByMaterial`, `mergeUnitPreservedShellsByPlacedObject` merges preserved unit `shell_*` meshes that share a material (fewer draws per apartment).

**Critical:** `mergeGeometries` can return `null` if buffer layouts do not combine. The merge pass must **only** `removeFromParent` / `dispose` source meshes **after** a non-null merged geometry exists. Doing the opposite removed every unit shell while window glass (different merge path) remained—**only glass visible**.

---

## Apartment façade vs plaster depth (`floorPlaceholderMeshes.ts`)

Unit `shell_exterior_cladding_*` uses the same holed exterior PBR as other façades. It must not sit **coplanar** with the plaster hollow shell or WebGPU depth can show concrete from inside the unit.

For `kind === "unit"`, `addExteriorWallCladding` is called with a small **`outwardBiasAlongNormalM`** (currently **0.05 m**) so cladding sits slightly outside the shell plane.

---

## Helpers (`fpBuildingFloorPlateVisibilityBand.ts`)

| Function | Role |
|----------|------|
| `fpBuildingExteriorViewShouldRevealFullStack` | Inset test → widen floor plate band |
| `fpCameraOrFeetInsideBuildingFootprintXZ` | Strict raw footprint (tests / strict checks) |
| `fpCameraOrFeetNearBuildingFootprintXZ` | Expanded footprint (still used by helpers / tests; not used for interior shell visibility toggling in FP mount) |

Tests: `apps/client/src/game/fpBuildingFloorPlateVisibilityBand.test.ts`.

---

## Performance reference (informal)

Commit **`75e72a2cbbe10bbedc340060b57f52d4c0a5e9b9`** (*Refactor apartment render isolation and remove furniture references*, 2026-05-19) is the best first-person FPS we've seen on the current client build so far. Keep it as a regression comparison point when touching apartment visibility, decor, or render-isolation—not a guaranteed floor on every machine.
