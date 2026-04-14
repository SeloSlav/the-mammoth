---
name: hard-pivot-editor
overview: "Replace the current doc-centric editor UX with three game-native workspaces: `Cab`, `Landing`, and `World`. Reuse the existing scene/gizmo/save infrastructure, but route each workspace through the actual runtime rendering path and hide document ownership behind intuitive selection and save-target rules."
todos:
  - id: workspace-shell
    content: Replace the editor’s top-level UX with Cab, Landing, and World workspaces while keeping existing runtime/store plumbing temporarily behind the scenes.
    status: completed
  - id: shared-cab-def
    content: Define and wire a shared ElevatorCabDef save unit backed by the real elevator cab visual code.
    status: completed
  - id: shared-landing-def
    content: Define and wire a shared LandingKitDef save unit backed by the real landing visual code.
    status: completed
  - id: world-runtime-mode
    content: Mount the actual runtime world composition path in editor World mode and layer authoring selection/gizmos on top.
    status: completed
  - id: ownership-adapters
    content: Build runtime-object ownership adapters that map visible clicked objects to shared or local authored save targets.
    status: completed
  - id: ux-rewrite
    content: Rewrite the outliner and inspector so they communicate intuitive save targets and editable subparts instead of document types.
    status: completed
  - id: compatibility-checks
    content: Keep hot reload, collision rebuild, and server-compatible elevator behavior aligned through focused tests and workflow docs.
    status: completed
isProject: false
---

# Hard Pivot Editor Plan
## Goal
Make `apps/editor` feel like a real in-game authoring tool instead of a JSON/document editor.

The shipped UX becomes:
- `Cab`: edit the real elevator cab as it appears in-game; save to one shared cab definition.
- `Landing`: edit one real landing slice as it appears in-game; save to one shared landing definition.
- `World`: mount the real runtime world, move through it like the game, click anything visible, edit it intuitively, and save back to authored content.

## Ground Truth To Reuse
- Full world/static building path already exists through `instantiateBuildingFloorStack` in [c:\WebProjects\the-mammoth\packages\world\src\buildingFloorStack.ts](c:\WebProjects\the-mammoth\packages\world\src\buildingFloorStack.ts) and is used by both client and editor.
- Actual FP session/world composition lives in [c:\WebProjects\the-mammoth\apps\client\src\game\mountFpSession.ts](c:\WebProjects\the-mammoth\apps\client\src\game\mountFpSession.ts) and [c:\WebProjects\the-mammoth\apps\client\src\game\fpSessionWorldMount.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpSessionWorldMount.ts).
- Real elevator visuals already exist in [c:\WebProjects\the-mammoth\apps\client\src\game\fpElevatorWorld.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpElevatorShaftVisual.ts) and [c:\WebProjects\the-mammoth\apps\client\src\game\fpElevatorLandingDoorVisual.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpElevatorLandingDoorVisual.ts).
- The editor should keep the useful internals: [c:\WebProjects\the-mammoth\apps\editor\src\editor\editorSceneRuntime.ts](c:\WebProjects\the-mammoth\apps\editor\src\editor\editorSceneRuntime.ts), [c:\WebProjects\the-mammoth\apps\editor\src\editor\editorBootstrap.ts](c:\WebProjects\the-mammoth\apps\editor\src\editor\editorBootstrap.ts), [c:\WebProjects\the-mammoth\apps\editor\src\state\editorStore.ts](c:\WebProjects\the-mammoth\apps\editor\src\state\editorStore.ts), and [c:\WebProjects\the-mammoth\apps\editor\src\vite\editorDevMiddleware.ts](c:\WebProjects\the-mammoth\apps\editor\src\vite\editorDevMiddleware.ts).

## Product Pivot
### 1. Replace top-level UX with three workspaces
Rewrite [c:\WebProjects\the-mammoth\apps\editor\src\ui\EditorChrome.tsx](c:\WebProjects\the-mammoth\apps\editor\src\ui\EditorChrome.tsx) so the user only sees:
- `Cab`
- `Landing`
- `World`

Document types (`floor`, `prefab`, `override`, `cell`, `interior`) become internal routing details, not first-class buttons.

### 2. Add shared visual save units for elevator authoring
Introduce explicit shared visual definitions for:
- `ElevatorCabDef`
- `LandingKitDef`

These should be the primary save targets for `Cab` and `Landing` workspaces, instead of overloading raw floor placement metadata for everything.

Likely implementation homes:
- schemas in [c:\WebProjects\the-mammoth\packages\schemas\src](c:\WebProjects\the-mammoth\packages\schemas\src)
- runtime parse/export in [c:\WebProjects\the-mammoth\packages\world\src\index.ts](c:\WebProjects\the-mammoth\packages\world\src\index.ts)
- editor persistence in [c:\WebProjects\the-mammoth\apps\editor\src\vite\editorDevMiddleware.ts](c:\WebProjects\the-mammoth\apps\editor\src\vite\editorDevMiddleware.ts)

### 3. Mount game-native visuals in each workspace
- `Cab`: mount a real `FpElevatorShaftVisual`-derived cab scene without requiring the whole world loop.
- `Landing`: mount one resolved landing slice using the same landing door/runtime geometry used by the game.
- `World`: mount the real runtime world composition path, then add an editor overlay for picking, gizmos, and save-target display.

## Architecture Changes
### Workspace layer over existing editor state
Extend [c:\WebProjects\the-mammoth\apps\editor\src\state\editorStoreTypes.ts](c:\WebProjects\the-mammoth\apps\editor\src\state\editorStoreTypes.ts) and [c:\WebProjects\the-mammoth\apps\editor\src\state\editorStore.ts](c:\WebProjects\the-mammoth\apps\editor\src\state\editorStore.ts) with a user-facing workspace enum:
- `cab`
- `landing`
- `world`

Keep the existing lower-level modes temporarily as implementation details during migration.

### Runtime-backed selection adapters
Add a new selection/save-target layer in `apps/editor/src/editor` that answers:
- what runtime object was clicked
- what authored save unit owns it
- whether the edit is `shared` or `local`
- which transform/material knobs are legal

This adapter is the key to making `World` intuitive while still saving into authored docs.

### Dedicated scene builders
Split the current monolithic content builder in [c:\WebProjects\the-mammoth\apps\editor\src\editor\editorBuildingContentMount.ts](c:\WebProjects\the-mammoth\apps\editor\src\editor\editorBuildingContentMount.ts) into workspace-specific builders:
- `buildCabWorkspaceScene()`
- `buildLandingWorkspaceScene()`
- `buildWorldWorkspaceScene()`

Each builder should mount real runtime visuals first, then attach editor tagging metadata for selection.

## Save Model
### Cab
Shared-default save target:
- one `ElevatorCabDef` referenced by all shaft visuals
- fields for subpart transforms, material slots, door/window composition, and scalable pieces

Client runtime hook point:
- [c:\WebProjects\the-mammoth\apps\client\src\game\fpElevatorShaftVisual.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpElevatorShaftVisual.ts)

### Landing
Shared-default save target:
- one `LandingKitDef` referenced by every landing generated by the elevator system
- fields for door surround, glass, trims, signage anchors, wall panel proportions, and materials

Client runtime hook point:
- [c:\WebProjects\the-mammoth\apps\client\src\game\fpElevatorLandingDoorVisual.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpElevatorLandingDoorVisual.ts)

### World
World mode must support `anything visible in runtime`, but the first implementation should do that through ownership adapters:
- static structural things save to floor/building/prefab/override docs
- cab/landing pieces route to the new shared defs
- runtime-only things with no authored backing should be visible/selectable but marked `not yet editable` until they get a save adapter

That preserves the requested UX without lying about saveability.

## UX Rules
- No placeholder-centric top-level workflows.
- Camera and movement in `World` should feel like gameplay first, editor second.
- Inspector must always show `Save target: Shared` or `Save target: Local` prominently.
- Selection should prefer the visible thing the user clicked, then resolve ownership internally.
- `Cab` and `Landing` should open already framed on the editable subject with a small curated outliner of real subparts.

## Migration Sequence
1. Build the new workspace shell and route all current editor entry points through `cab | landing | world`.
2. Implement shared `ElevatorCabDef` and wire `Cab` mode to real elevator cab visuals.
3. Implement shared `LandingKitDef` and wire `Landing` mode to real landing visuals.
4. Replace current `World` placeholder/editor build path with the actual runtime world composition path from the client.
5. Add runtime-object ownership adapters so clicks in `World` resolve to authored save units.
6. Rewrite inspector/outliner around save targets and editable subparts instead of raw doc types.
7. Keep save/reload/hot-reload/collision rebuild infrastructure, but surface it behind the new workspaces.
8. Remove or hide the old doc-centric UI once all three workspaces cover the required workflows.

## Highest-Risk Areas
- `World` mode requires a robust runtime-object-to-authored-owner mapping layer.
- Elevator dimensions that affect gameplay collision must remain compatible with [c:\WebProjects\the-mammoth\apps\server\src\elevator.rs](c:\WebProjects\the-mammoth\apps\server\src\elevator.rs) and related client constants.
- The pivot should avoid duplicating rendering logic; editor and client should share scene builders wherever possible.