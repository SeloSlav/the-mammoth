# FP session: building mesh visibility

## Floor plates

`syncBuildingFloorPlateVisibility` toggles `buildingRoot` children with `mammothPlateLevelIndex` using a storey band from the elevator world helper.

- Ordinary apartments, hallways, and perimeter corridors use the current storey band.
- Pitch lookahead is suppressed while camera or feet remain inside the raw building footprint.
- Stairwells retain their authored local multi-floor band.
- Elevator cabs and hoistways retain the local landing/shaft context required by open sightlines.
- The full vertical stack is reserved for a true exterior view: the camera is outside the inset core **and** feet are outside the raw building footprint.

---

## Tagged interiors (`mammothUnitInterior`)

`mammothUnitInterior` is still set on unit hollow shells and corridor `shell_*` meshes in `floorPlaceholderMeshes.ts` for tooling and consistency. FP visibility is driven by the active floor band and authored corridor PVS, not by a broad building-footprint toggle.

Residential unit shells, glass, decor, and sector batches are eligible only when their unit is:

- the containing or retained unit;
- inside the conservative same-storey camera volume; or
- admitted by an open apartment-door portal on the active storey.

This keeps distant apartment sectors out of scene traversal while preserving doorway and nearby corridor sightlines.

---

## Corridor PVS volumes

`fpSessionCorridorPvs.ts` resolves unit keys and ids from the existing authored unit bounds and apartment-door portals.

- Snapshots are reused while the camera stays inside a 0.75 m XZ volume.
- Door and same-storey queries are padded by the cache radius, preventing late reveals.
- Door entries are recollected only when PVS eligibility or authored door geometry changes.
- Unit bounds are recollected when the existing apartment-unit spatial index rebuilds.
- Event-driven mesh visibility is reapplied when apartment interiors rebuild, even if mesh count is unchanged.
- The same PVS drives unit hollow shells, apartment decor placement roots, and sector-aware instanced batches.
- Stash/grow interaction occlusion traverses blockers in the target apartment volume plus same-floor shared swing doors, with a global fallback when authored scope is unavailable.

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
| `fpBuildingExteriorViewShouldRevealFullStack` | Inset test used as one half of the true-exterior gate |
| `fpCameraOrFeetInsideBuildingFootprintXZ` | Raw footprint gate for perimeter corridors and pitch lookahead |
| `fpCameraOrFeetNearBuildingFootprintXZ` | Expanded footprint (still used by helpers / tests; not used for interior shell visibility toggling in FP mount) |

Tests: `apps/client/src/game/fpBuildingFloorPlateVisibilityBand.test.ts`.

---

## Performance reference

| Document | What it covers |
|----------|----------------|
| **[fp-apartment-interior-performance.md](fp-apartment-interior-performance.md)** | **Locked baseline (2026-05-20):** why spin hitched, why the furnished wall is fine, capture evidence, regression checklist |

Commit **`75e72a2c`** (*Refactor apartment render isolation and remove furniture references*, 2026-05-19) remains a useful comparison point for render-isolation changes.

Commit **`621829ce`** (*add collision to interior apartment walls, and some other FPS fixes*, 2026-05-20) is the **hitch-while-turning fix** baseline: in-unit decor forward cone, hysteresis, and per-frame show budget (`fpApartmentInteriorPropVisibility.ts`). Do not regress without re-measuring spin + static wall holds in a dense unit (e.g. `unit_e_003`).
