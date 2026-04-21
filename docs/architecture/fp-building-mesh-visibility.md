# FP session: building mesh visibility

## Floor plates

`syncBuildingFloorPlateVisibility` toggles `buildingRoot` children with `mammothPlateLevelIndex` using a storey band from the elevator world helper. When `fpBuildingExteriorViewShouldRevealFullStack` is true (camera XZ outside the **6 m inset** “core” of the building AABB), the band widens to the **full vertical stack** so façades do not pop.

---

## Tagged interiors (`mammothUnitInterior`) — near footprint only

Unit hollow shells and corridor `shell_*` (see `floorPlaceholderMeshes.ts`) are collected once at FP mount. Each frame, `fpCameraOrFeetNearBuildingFootprintXZ` runs with an **outward margin** on the building world XZ AABB (see `FP_INTERIOR_SHELL_NEAR_MARGIN_M` in `mountFpSession.ts`; currently **16 m** per side so ground-floor interiors read from further out).

| Situation | Meshes |
|-----------|--------|
| Camera **or** feet inside expanded XZ slab | `.visible = true` — interiors, perimeter, door/window peeks |
| **Both** outside expanded slab | `.visible = false` — distant exterior views skip ~1M+ interior triangles |

Top-storey `shell_ceiling_*` that reads as the roof silhouette is **not** in the toggled list (same exclusion as before).

Tighten or widen behaviour by changing `FP_INTERIOR_SHELL_NEAR_MARGIN_M` in `mountFpSession.ts`.

---

## Helpers (`fpBuildingFloorPlateVisibilityBand.ts`)

| Function | Role |
|----------|------|
| `fpBuildingExteriorViewShouldRevealFullStack` | Inset test → widen floor plate band |
| `fpCameraOrFeetInsideBuildingFootprintXZ` | Strict raw footprint (tests / strict checks) |
| `fpCameraOrFeetNearBuildingFootprintXZ` | Expanded footprint → interior shell visibility |

Tests: `apps/client/src/game/fpBuildingFloorPlateVisibilityBand.test.ts`.
