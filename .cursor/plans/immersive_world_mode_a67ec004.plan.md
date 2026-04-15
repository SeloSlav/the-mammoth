---
name: immersive world mode
overview: "Convert editor `world` mode into a single in-world first-person editing experience that reuses gameplay/runtime movement and world-building code, while leaving `cab`, `landing`, and `stairwell` as specialized authoring modes. First pass edits existing objects only: select/highlight, gizmo transform, and basic material/texture overrides with automatic save-target resolution."
todos:
  - id: define-world-mode-shape
    content: Collapse `world` UX into one immersive mode while preserving specialized `cab` / `landing` / `stairwell` workspaces and their current behavior.
    status: pending
  - id: extract-runtime-seam
    content: Reuse shared FP locomotion/collision/world-mount code via an editor-local runtime seam instead of duplicating gameplay logic or importing the whole networked client session.
    status: pending
  - id: unify-selection-routing
    content: Resolve picked runtime objects to their owning doc/record and use that single resolution path for highlight, gizmo attachment, inspector state, and save routing.
    status: pending
  - id: add-material-authoring
    content: Expose basic color/texture import + material override editing for selected world objects using the existing `metadata.editorMaterial` path.
    status: pending
  - id: trim-world-ui
    content: Replace current `world` scope buttons and mode-specific inspector/outliner assumptions with a simpler immersive-world panel and status HUD.
    status: pending
isProject: false
---

# Immersive World Mode Plan

## Goal
Make `world` mode feel like playing the game inside the editor: real first-person movement, pointer lock, shared collision/world assembly, pink selection outline, transform gizmos, and basic texture/material authoring for existing objects. Keep `cab`, `landing`, and `stairwell` unchanged as fine-grained specialized authoring modes.

## Core Architecture
Use a gameplay-backed local runtime for `world`, but do not import the full game client session.

- Reuse locomotion/collision/world assembly from:
  - [packages/engine/src/fpLocomotion.ts](packages/engine/src/fpLocomotion.ts)
  - [apps/client/src/game/fpPlayerCollision.ts](apps/client/src/game/fpPlayerCollision.ts)
  - [apps/client/src/game/fpSessionWorldMount.ts](apps/client/src/game/fpSessionWorldMount.ts)
  - [packages/world/src/index.ts](packages/world/src/index.ts)
- Do not pull in the networked gameplay monolith from [apps/client/src/game/mountFpSession.ts](apps/client/src/game/mountFpSession.ts). Instead, import (don't extract or mirror) only the local simulation seam: input -> locomotion -> walk sampling -> collision -> camera/rig update.
- Build the editor world from live editor docs, not bundled gameplay JSON. The editor-local world mount should accept `building`, `floorDocs`, `cellDocs`, `floorOverrideDocs`, and `stairWellDef` from the store, then return:
  - scene roots
  - static collision index
  - walk-surface sampler
  - optional future hook for local dynamic support

## World Mode Product Shape
Replace the current `world` UX that forces document-scoped submodes.

Current UX to remove for `world`:
- [apps/editor/src/ui/EditorChrome.tsx](apps/editor/src/ui/EditorChrome.tsx) currently exposes `floor`, `interior`, `cell`, `prefab`, and `floor_override` buttons under `World scope`.
- [apps/editor/src/editor/editorSceneRuntime.ts](apps/editor/src/editor/editorSceneRuntime.ts) currently routes picks, gizmos, framing, and commits primarily by `mode`.

New UX:
- `world` enters one immersive FP runtime mode.
- Click canvas to pointer-lock and walk with gameplay controls.
- Toggle edit cursor mode without leaving `world` so the user can point/select/gizmo objects.
- Keep top-level save/dirty/history controls.
- Keep specialized workspaces separate:
  - `cab` -> shared elevator-car authoring
  - `landing` -> shared landing-kit authoring
  - `stairwell` -> shared stairwell authoring

## Store And Mode Changes
Refactor the editor state so `world` no longer relies on visible submodes for authoring.

Files:
- [apps/editor/src/state/editorStoreTypes.ts](apps/editor/src/state/editorStoreTypes.ts)
- [apps/editor/src/state/editorStore.ts](apps/editor/src/state/editorStore.ts)
- [apps/editor/src/state/editorWorkspaceMap.ts](apps/editor/src/state/editorWorkspaceMap.ts)

Changes:
- Introduce one dedicated immersive world editor mode, or keep internal routing fields but remove the user-facing `world` submode model.
- Add a resolved world-selection structure to store enough information for one picked object:
  - target kind: `floor | interior | cell | prefab | floor_override`
  - owning doc id
  - entity/object/component id
  - transform root object key
  - material-edit capability
- Preserve existing `active*DocId` fields for save ownership/history and fallbacks, but stop making the user choose among them before they can edit.

## Runtime Integration
Create an editor-local immersive runtime path inside [apps/editor/src/editor/editorSceneRuntime.ts](apps/editor/src/editor/editorSceneRuntime.ts).

Implementation steps:
- Add a dedicated world-runtime controller alongside the existing orbit/fly and FP-viewmodel authoring logic.
- Replace `FlyControls` behavior in `world` with gameplay-style FP locomotion backed by shared engine/world code.
- Mount the same structural world content used by the game, but from the editor store instead of static imports.
- Preserve editor-only overlays:
  - selection outline
  - transform controls
  - optional helper HUD
- Keep `cab`, `landing`, and `stairwell` on their current editor camera/control path.

Likely new helper modules near [apps/editor/src/editor](apps/editor/src/editor):
- `editorWorldRuntimeMount.ts` for local world assembly + collision/walk sampler
- `editorWorldLocomotion.ts` or extracted shared helper for the per-frame local simulation step
- `editorWorldSelection.ts` for runtime-object -> owning-doc resolution

## Selection, Highlight, And Save Routing
Unify object resolution so one hit-test result drives everything.

Files:
- [apps/editor/src/editor/editorSceneRuntime.ts](apps/editor/src/editor/editorSceneRuntime.ts)
- [apps/editor/src/editor/editorPlacementKeys.ts](apps/editor/src/editor/editorPlacementKeys.ts)
- [apps/editor/src/ui/EditorChromeInspector.tsx](apps/editor/src/ui/EditorChromeInspector.tsx)
- [apps/editor/src/ui/editorChromeSelectors.ts](apps/editor/src/ui/editorChromeSelectors.ts)
- any current selection-meta hook used by chrome

Changes:
- Replace the current mode-dispatched selection/commit logic with a single resolver that inspects runtime object metadata and returns the owning edit target.
- Use that resolver for:
  - pink outline/highlight
  - transform gizmo attachment
  - inspector fields
  - precise save-target display
  - transform commits back into `updatePlacedObject`, `updateInteriorPlacement`, `updateCellPlacement`, `updatePrefabComponent`, or `updateFloorOverrideObjectPatch`
- Keep `focusedStoryLevelIndex` only as a navigation/filter aid for world framing, not as the primary authoring mode switch.

## Material And Texture Authoring
Build the first-pass material workflow on the existing metadata path instead of inventing a new storage format.

Existing hook to reuse:
- [apps/editor/src/editor/applyEditorMaterials.ts](apps/editor/src/editor/applyEditorMaterials.ts) already reads `metadata.editorMaterial.mapUrl`, `roughness`, and `metalness` and applies them to floor placements.

Plan:
- Generalize that path so world-selected objects with material-capable ownership can expose:
  - color picker
  - texture URL/import path
  - roughness
  - metalness
- Standardize on `metadata.editorMaterial` for first pass.
- Extend material application beyond the current floor-placement-only path where practical, but do not block the feature on perfect parity across every object class.
- Keep texture import basic in first pass: choose/import an image and write its resolved path into the same metadata field the runtime reads.

## UI Changes
Simplify `world` chrome around immersion instead of document categories.

Files:
- [apps/editor/src/ui/EditorChrome.tsx](apps/editor/src/ui/EditorChrome.tsx)
- [apps/editor/src/ui/EditorChromeInspector.tsx](apps/editor/src/ui/EditorChromeInspector.tsx)
- [apps/editor/src/ui/EditorChromeOutliner.tsx](apps/editor/src/ui/EditorChromeOutliner.tsx)

Changes:
- Remove `World scope` buttons.
- Add a compact `world` HUD showing:
  - play/edit toggle hint
  - selected object label/id
  - resolved save target
  - transform mode/snap
- Rework inspector so it is driven by resolved world selection rather than the current `selectedFloorObj` / `selectedInteriorPl` / `selectedCellPl` precedence chain.
- Keep outliner useful, but make it selection/navigation support rather than the primary way to understand which JSON bucket you are editing.

## Testing And Verification
Add focused tests around the new seams, not broad UI snapshot noise.

- Unit test the runtime-object ownership resolver with fixtures covering `floor`, `interior`, `cell`, `prefab`, and `floor_override` routing.
- Add coverage for any extracted local world-mount helper that derives collision/walk samplers from editor docs.
- Manual verification checklist:
  - enter `world` and move with gameplay controls
  - collision/walk feel matches gameplay path
  - click object in edit mode -> pink outline
  - gizmo translate/rotate/scale persists to correct backing doc
  - inspector save-target matches actual write destination
  - color/texture override persists and re-applies after rebuild
  - switching to `cab`, `landing`, `stairwell` still behaves exactly as before

## Delivery Order
1. Collapse `world` UX to one immersive mode in store + chrome.
2. Introduce editor-local runtime-backed world mount and gameplay-style locomotion/collision.
3. Unify selection/save-target routing from runtime object metadata.
4. Rewire gizmo commit + inspector to the resolved world target.
5. Add pink highlight and first-pass material/texture authoring.
6. Add focused tests and do regression checks on specialized workspaces.