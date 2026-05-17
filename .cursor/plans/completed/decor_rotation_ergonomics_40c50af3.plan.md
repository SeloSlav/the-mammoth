---
name: Decor rotation ergonomics
overview: Add true 3-axis decor rotation and make the apartment editor’s rotation interaction predictable by removing the current drag-time fight between TransformControls and pose clamping/snapping.
todos:
  - id: add-roll-field
    content: Add decor-only `rollRad` through schema, server reducers/table row, generated client bindings, runtime replay, and layout authoring update/add flows.
    status: completed
  - id: fix-editor-rotation
    content: Refactor apartment decor rotation handling so TransformControls uses stable 3-axis behavior without drag-time quaternion rewrites or hidden always-on snapping.
    status: completed
  - id: update-tests-and-copy
    content: Update focused tests and editor help text to match full 3-axis decor rotation and the new interaction model.
    status: completed
isProject: false
---

# Decor Rotation Ergonomics Plan

## Goal
Make apartment decor support full 3-axis authored rotation (`yaw`, `pitch`, `roll`) and make viewport rotation feel natural: the gizmo should follow stable world/screen expectations instead of changing behavior based on the object’s current orientation.

## What To Change

- Extend decor rotation data end-to-end, decor only:
  - Add `rollRad` to decor item schemas in [packages/schemas/src/ownedApartmentBuiltins.ts](packages/schemas/src/ownedApartmentBuiltins.ts).
  - Extend server-side apartment decor rows / reducers / clamp path in [apps/server/src/apartments.rs](apps/server/src/apartments.rs).
  - Regenerate and thread the new field through client bindings and layout authoring flows that currently only send `yawRad` / `pitchRad`.

- Fix editor rotation ergonomics at the source:
  - In [apps/editor/src/editor/editorScene/editorSceneRuntime.ts](apps/editor/src/editor/editorScene/editorSceneRuntime.ts), stop using the current decor rotate setup that combines local-space handles with drag-time snapping/rewrite. Switch decor rotation to a stable 3-axis mode with all axes visible and no hidden re-quantization while dragging.
  - In [apps/editor/src/editor/myApartment/editorMyApartmentMeshes.ts](apps/editor/src/editor/myApartment/editorMyApartmentMeshes.ts), replace the current `YXZ`/`z = 0` assumptions with full 3-axis decor pose handling, and separate hard validity constraints from optional snapping so the gizmo does not fight the user.
  - In [apps/editor/src/ui/EditorChrome.tsx](apps/editor/src/ui/EditorChrome.tsx), update the my-apartment help text to match the actual controls; today it still describes Y-only 45 degree rotation.

- Persist and replay full decor rotation everywhere:
  - In [apps/editor/src/editor/scene/editorSceneCommitAttachedTransform.ts](apps/editor/src/editor/scene/editorSceneCommitAttachedTransform.ts), commit `rollRad` alongside `yawRad` / `pitchRad`.
  - In [apps/client/src/game/fpApartment/fpApartmentLayoutAuthoring.ts](apps/client/src/game/fpApartment/fpApartmentLayoutAuthoring.ts), send `rollRad` on add/update reducers.
  - In [apps/client/src/game/fpApartment/fpApartmentDecorMeshes.ts](apps/client/src/game/fpApartment/fpApartmentDecorMeshes.ts), replay roll instead of forcing `rotation.z = 0`.

## Implementation Notes

- Keep this pass scoped to decor only; wall rotation remains unchanged.
- Preserve the existing Euler convention where practical, but stop discarding the third component. If `YXZ` remains the persistence format, write/read all three components consistently.
- Do not snap/normalize the decor quaternion on every `objectChange`. Apply optional snapping only when explicitly enabled, and do it in a way that matches the visible gizmo behavior.
- Prefer world-stable rotation behavior for decor so dragging an axis keeps the same meaning even after previous rotations.

## Verification

- Update targeted tests around decor pose serialization / commit paths and content resolution.
- Add or adjust editor-focused tests for committing full 3-axis decor rotation.
- Manually verify in the apartment editor that:
  - decor exposes X/Y/Z rotation handles,
  - dragging does not jump or fight the mouse,
  - repeated rotations remain predictable after prior rotations,
  - saved decor keeps its roll when reloaded in editor and client runtime.

## Key Existing Seams

- [apps/editor/src/editor/editorScene/editorSceneRuntime.ts](apps/editor/src/editor/editorScene/editorSceneRuntime.ts): `syncTransformAttachment`
- [apps/editor/src/editor/myApartment/editorMyApartmentMeshes.ts](apps/editor/src/editor/myApartment/editorMyApartmentMeshes.ts): `constrainMyApartmentDecorRootPose`, `snapOwnedApartmentDecorYawRad`, `snapOwnedApartmentDecorPitchRad`
- [apps/editor/src/editor/scene/editorSceneCommitAttachedTransform.ts](apps/editor/src/editor/scene/editorSceneCommitAttachedTransform.ts): decor commit path from quaternion to authored fields
- [apps/client/src/game/fpApartment/fpApartmentDecorMeshes.ts](apps/client/src/game/fpApartment/fpApartmentDecorMeshes.ts): current runtime replay still does `rotation.z = 0`
- [apps/server/src/apartments.rs](apps/server/src/apartments.rs): `ApartmentUnitDecor`, `clamp_decor_pose`, `add_apartment_unit_decor`, `update_apartment_unit_decor`