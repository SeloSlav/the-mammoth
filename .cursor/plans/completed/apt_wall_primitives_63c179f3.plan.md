---
name: apt wall primitives
overview: Add owned-apartment wall-slab primitives that can be translated, rotated, non-uniformly scaled, and textured with the same available PBR texture set used elsewhere in the editor. The plan keeps this scoped to the owned-apartment authoring/runtime path rather than the general floor editor.
todos:
  - id: schema-wall-items
    content: Add owned-apartment wall slab schema and material slot schema to ownedApartmentBuiltins
    status: completed
  - id: editor-wall-mount
    content: Add owned-apartment wall slab selection, preview meshes, clamp logic, and transform persistence
    status: completed
  - id: editor-wall-material-ui
    content: Reuse/extract material slot picker UI for selected wall slabs in EditorChromeMyApartment
    status: completed
  - id: client-wall-runtime
    content: Project wall slab items into apartment runtime fallback meshes with matching PBR material application
    status: completed
  - id: tests-verify
    content: Add focused schema/editor/client tests and run typechecks/manual verification
    status: completed
isProject: false
---

# Owned Apartment Wall Slabs

## Goal
Add a new owned-apartment authoring primitive: a thin box wall slab for bathrooms/bedrooms/partitions. It should:
- live in [`content/apartment/owned_apartment_builtins.json`](content/apartment/owned_apartment_builtins.json)
- be selectable in `my_apartment_layout`
- support translate / rotate / non-uniform scale
- support one shared PBR material slot using the same available texture catalog the editor already exposes
- render both in the apartment editor preview and in the client fallback content path for claimed apartments

## Proposed Data Shape
Keep existing imported-model decor intact, and add a parallel wall primitive collection instead of overloading `decorItems`.

In [`packages/schemas/src/ownedApartmentBuiltins.ts`](packages/schemas/src/ownedApartmentBuiltins.ts):
- add `OwnedApartmentWallItemSchema`
- add `wallItems: z.array(OwnedApartmentWallItemSchema).default([])`
- include:
  - `id`
  - `fx`, `fz`, `dy`
  - `yawRad`, `pitchRad`
  - explicit dimensions like `sizeX`, `sizeY`, `sizeZ` instead of `uniformScale`
  - `material` object shaped like the editor PBR slot (`mapUrl`, `normalMapUrl`, `roughnessMapUrl`, `metalnessMapUrl`, `bumpMapUrl`, `roughness`, `metalness`, `useMetalnessMap`, `useHeightMap`)

Why this shape:
- [`decorItems`](packages/schemas/src/ownedApartmentBuiltins.ts) currently assume `modelRelPath` + `uniformScale`, which fits imported meshes but not authored primitives.
- explicit dimensions let the gizmo persist real wall thickness / height / length instead of collapsing scale back to a single scalar.

## Editor Integration
### Selection / IDs
Extend the owned-apartment selection helpers so wall slabs have their own selectable IDs alongside furniture and decor:
- [`apps/editor/src/editor/myApartment/editorMyApartmentSelection.ts`](apps/editor/src/editor/myApartment/editorMyApartmentSelection.ts)
- [`apps/editor/src/editor/myApartment/editorMyApartmentPointerResolve.ts`](apps/editor/src/editor/myApartment/editorMyApartmentPointerResolve.ts)

### Mesh Mount + Constraints
Extend the owned-apartment mount path in:
- [`apps/editor/src/editor/myApartment/editorMyApartmentMeshes.ts`](apps/editor/src/editor/myApartment/editorMyApartmentMeshes.ts)
- [`apps/editor/src/editor/myApartment/editorSceneMyApartmentLifecycle.ts`](apps/editor/src/editor/myApartment/editorSceneMyApartmentLifecycle.ts)

Plan:
- keep current imported-model decor flow (`placeDecorGroup`) as-is
- add a `placeWallGroup` path that builds a unit `BoxGeometry` thin slab, applies `sizeX/sizeY/sizeZ` via root scale or mesh scale, and uses the same floor/ceiling clamp logic as decor
- reuse the current `YXZ` yaw/pitch handling from decor
- add wall groups into `selectionGroups`
- preserve bottom-on-floor semantics by continuing to save `dy` from `bbox.min.y - slabTopY`

### Transform Commit
Update [`apps/editor/src/editor/scene/editorSceneCommitAttachedTransform.ts`](apps/editor/src/editor/scene/editorSceneCommitAttachedTransform.ts) so owned-apartment wall slabs persist:
- `fx`, `fz`, `dy`
- `yawRad`, `pitchRad`
- `sizeX`, `sizeY`, `sizeZ`

Important distinction:
- imported decor should continue using averaged `uniformScale`
- wall slabs should persist full axis scale/dimensions

### Chrome UI
Extend [`apps/editor/src/ui/EditorChromeMyApartment.tsx`](apps/editor/src/ui/EditorChromeMyApartment.tsx) to add:
- `Add wall slab`
- list of wall slabs
- clone/delete actions
- material editing for the selected wall slab

To avoid duplicating the PBR picker UI, extract and reuse the existing material-slot widgets from [`apps/editor/src/ui/EditorChromeSelectedMaterialPanel.tsx`](apps/editor/src/ui/EditorChromeSelectedMaterialPanel.tsx), especially:
- `MaterialSlotEditor`
- `OptionalTextureMapRow`
- `filterMaterialTextureUrls`

Use `contentIndex.materialTextureUrls` as the source for available textures, filtered similarly to other editor material panels.

## Material Application
### Editor Preview
Add a small owned-apartment material applicator that mirrors the current floor-placement editor override logic in [`apps/editor/src/editor/content/applyEditorMaterials.ts`](apps/editor/src/editor/content/applyEditorMaterials.ts), but reads the new wall item `material` payload directly.

This should:
- create a `MeshStandardMaterial`
- load repeat-wrapped texture maps
- apply normal/roughness/metalness/bump maps when present
- optionally set wall-like texture repeat so the slab tiles like architectural walls instead of stretching across the whole mesh

### Texture Tiling
Reuse the same world-scale intuition as architectural walls by borrowing constants/logic from:
- [`packages/world/src/wallWithDoorCutout.ts`](packages/world/src/wallWithDoorCutout.ts)
- [`packages/world/src/floorPlaceholderMeshMaterials.ts`](packages/world/src/floorPlaceholderMeshMaterials.ts)

The goal is not to literally reuse shell materials, but to make a wall slab texture tile in meters instead of looking UV-stretched.

## Client Runtime Rendering
Extend the owned-apartment fallback content path so these wall slabs appear in-game for the claimed apartment view.

Touch:
- [`apps/client/src/game/fpApartment/fpOwnedApartmentBuiltinsFromContent.ts`](apps/client/src/game/fpApartment/fpOwnedApartmentBuiltinsFromContent.ts)
- [`apps/client/src/game/fpApartment/fpApartmentDecorMeshes.ts`](apps/client/src/game/fpApartment/fpApartmentDecorMeshes.ts) or a nearby new runtime helper if splitting becomes cleaner

Plan:
- add `resolveApartmentWallPoses(...)`
- project `wallItems` from normalized unit fractions into world-space
- create runtime `THREE.Mesh` box slabs with the stored dimensions/material
- apply the same yaw/pitch and XZ boundary clamp pattern already used for authored decor fallback
- keep this content-driven only; no Spacetime reducer/schema work is needed for wall slabs in this first pass

## Why This Scope
This stays inside the owned-apartment content pipeline already used by:
- editor preview mount in [`apps/editor/src/editor/myApartment/editorSceneMyApartmentLifecycle.ts`](apps/editor/src/editor/myApartment/editorSceneMyApartmentLifecycle.ts)
- client content fallback in [`apps/client/src/game/fpApartment/fpApartmentDecorMeshes.ts`](apps/client/src/game/fpApartment/fpApartmentDecorMeshes.ts)

That gives you buildable partition walls for bathrooms/bedrooms without dragging the general floor editor/runtime object system into the change.

## Verification
After implementation:
- schema parse/serialize check for `owned_apartment_builtins.json`
- editor test coverage for wall clamp + transform persistence
- client test coverage for normalized `wallItems` world-space projection
- manual verify in editor:
  - add wall slab
  - move / rotate / pitch / scale it
  - assign PBR textures
  - save / reload and confirm persistence
- manual verify in client:
  - claimed apartment shows the same wall slabs and textures in the right place