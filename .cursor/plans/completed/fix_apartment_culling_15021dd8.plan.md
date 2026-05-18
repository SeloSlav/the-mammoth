---
name: fix apartment culling
overview: Tighten first-person apartment visibility so being inside a unit only renders the current storey and current unit’s interior/transparent geometry, while preserving legitimate shared or exterior views. Verify the fix against the profiler counters that exposed the regression.
todos:
  - id: inspect-unit-visibility-rules
    content: Tighten in-unit mesh visibility rules in fpSessionFloorPlateVisibility.ts and remove overly broad generic interior leaks
    status: completed
  - id: verify-mesh-ownership-tags
    content: Audit unit ownership / glass / shared-interior tagging in fpSessionUnitInteriorShellMeshes.ts and upstream static shell sources
    status: completed
  - id: validate-apartment-runtime
    content: Confirm furniture/decor visibility still behaves correctly for current unit only
    status: completed
  - id: add-regression-checks
    content: Add focused tests for current-unit vs other-unit visibility decisions and metadata resolution
    status: completed
  - id: profile-verify-fix
    content: Re-run apartment movement profiler captures and confirm unitInterior/transparent spikes are gone
    status: in_progress
isProject: false
---

# Fix Apartment Interior Visibility Leak

## Goal
Make first-person in-unit rendering obey the intended rule: while inside a residential unit, only the current unit and current storey should contribute interior/transparent render cost, unless a mesh is explicitly whitelisted as shared/common-space geometry.

## What the code already intends
- [c:\WebProjects\the-mammoth\apps\client\src\game\fpSession\fpSessionFloorPlateVisibility.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpSession\fpSessionFloorPlateVisibility.ts)
  - `fpApplyResidentialInteriorPlateBandOverride(...)` already clamps plates to a single storey when `insideResidentialUnit` is true.
  - `fpResolveUnitInteriorMeshVisible(...)` already tries to scope `apartmentUnitKey` / `residentialUnitId` meshes to the containing unit.
- [c:\WebProjects\the-mammoth\apps\client\src\game\fpSession\fpSessionUnitInteriorShellMeshes.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpSession\fpSessionUnitInteriorShellMeshes.ts)
  - `resolveUnitInteriorMeshEntry(...)` derives `apartmentUnitKey`, `residentialUnitId`, `mammothResidentialUnitExteriorGlass`, and `mammothGenericInteriorVisibleInResidentialUnit` from ancestor tags.
- [c:\WebProjects\the-mammoth\apps\client\src\game\fpApartment\fpApartmentFurniture.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpApartment\fpApartmentFurniture.ts)
  - Furniture is already merged per unit and hidden if `containingUnitKey !== unitKey`, so props are probably not the primary leak.

## Likely root causes to fix
- `fpResolveUnitInteriorMeshVisible(...)` still allows meshes flagged `mammothGenericInteriorVisibleInResidentialUnit` whenever you are inside any unit, even if they actually belong to neighboring units.
- Some static shell / glass meshes are likely missing or inheriting the wrong `apartmentUnitKey` / `residentialUnitId`, so they fall through to overly broad visibility branches.
- The top-floor shell fallback in [c:\WebProjects\the-mammoth\apps\client\src\game\fpSession\fpSessionFloorPlateVisibility.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpSession\fpSessionFloorPlateVisibility.ts) may still keep unrelated shells alive in cases where we should now be stricter.
- Perf counters in [c:\WebProjects\the-mammoth\apps\client\src\game\mountFpSession.ts](c:\WebProjects\the-mammoth\apps\client\src\game\mountFpSession.ts) should remain good enough to validate the fix, but we may need to keep in mind that they are approximate and sampled.

## Implementation plan
1. Audit and tighten the in-unit branch in [c:\WebProjects\the-mammoth\apps\client\src\game\fpSession\fpSessionFloorPlateVisibility.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpSession\fpSessionFloorPlateVisibility.ts):
   - treat `apartmentUnitKey` / `residentialUnitId` as hard ownership gates when inside a unit;
   - narrow or remove the broad `genericInteriorVisibleInResidentialUnit` allowance so only true shared/common-space meshes survive;
   - review the top-floor shell exception and keep it only if it is still required for silhouette correctness outside the unit.
2. Strengthen metadata resolution in [c:\WebProjects\the-mammoth\apps\client\src\game\fpSession\fpSessionUnitInteriorShellMeshes.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpSession\fpSessionUnitInteriorShellMeshes.ts):
   - verify ancestor walking correctly picks up unit ownership tags for merged/static shell and glass meshes;
   - if needed, add stricter classification helpers so “shared residential interior” is distinct from “unit-owned shell/glass”.
3. Inspect the static apartment shell / merge pipeline for bad tags at source:
   - likely around [c:\WebProjects\the-mammoth\apps\client\src\game\mountFpSession.ts](c:\WebProjects\the-mammoth\apps\client\src\game\mountFpSession.ts) refresh hooks and any interior/static merge code referenced by `collectFpSessionUnitInteriorMeshEntries(...)`.
   - ensure neighboring unit shells/glass cannot arrive as anonymous `mammothUnitInterior` meshes.
4. Keep furniture/decor behavior aligned but minimal:
   - verify [c:\WebProjects\the-mammoth\apps\client\src\game\fpApartment\fpApartmentFurniture.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpApartment\fpApartmentFurniture.ts) and related decor runtime still use per-unit visibility and do not regress hallway/exterior peeks.
5. Validate with focused checks:
   - in-apartment stationary turn: `unitInterior` and `transparent` counts should stay near the active unit, not jump to whole-floor values;
   - north/south apartment walk: no spikes to hundreds/thousands of interior meshes;
   - outside / doorway / top-floor views still show intended exterior glass / silhouette behavior.
6. Add or update targeted tests where practical:
   - pure visibility decision tests for `fpResolveUnitInteriorMeshVisible(...)` covering current-unit, other-unit, exterior-glass, and shared-generic cases;
   - if easy, add a regression-style test for metadata resolution in `resolveUnitInteriorMeshEntry(...)`.

## Success criteria
- Inside one apartment, profiler captures no longer show neighboring units/floors/glass entering the render set.
- `renderThreeMs` remains near normal walking/turning cost instead of jumping with `unitInterior` / `transparent` counts.
- Exterior and doorway visuals still look correct after tightening the cull rules.