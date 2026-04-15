# Editor workspaces

The level editor (`apps/editor`) is organized around three **workspaces** — not document-type tabs:

| Workspace | Scene | Primary save targets |
|-----------|--------|----------------------|
| **Cab** | Shared cab car preview (`buildElevatorCabCarPreviewRoot`) from the first shaft layout in `mammoth.json` | **Shared** `content/elevator/cab.json` → `ElevatorCabDef` |
| **Landing** | Door kit preview (`buildLandingDoorPreviewRoot`) or streamed docs (interior / cell / prefab / floor override) | **Shared** `content/elevator/landing_kit.json` when editing the kit (`partTransforms.landing_glass_lite` for the glass pane); otherwise **local** JSON under `content/` |
| **World** | Building floor stack + active exterior **cell** in one group (`workspace === "world"` + `mode === "floor"` or `floor_override`) | **Local** floor / override / interior / cell / prefab docs; elevator **visual** edits still route to the shared elevator JSON when you switch to Cab/Landing |

## Hot reload & collision

- Saving authored JSON with `EDITOR_SAVE=1` updates `content/**`.
- Shared elevator defs are included in the world collision source fingerprint (see `scripts/worldCollisionArtifacts.ts`); after changing cab, landing, or stairwell JSON, run `pnpm content:gen-walk-aabbs` from the repo root so server walk/collision artifacts stay aligned. The editor reports stale vs in-sync status, but does not trigger the full rebuild.
- Gameplay shaft dimensions and server elevator logic remain authoritative in `apps/server` and client constants; `ElevatorCabDef` / `LandingKitDef` are **appearance-first**.

## Implementation map

- Store: `EditorWorkspace`, `LandingDocKind`, `elevatorCabDef`, `landingKitDef` in `apps/editor/src/state/editorStoreTypes.ts`.
- Scene mount: `buildEditorStructuralRoot` in `apps/editor/src/editor/editorBuildingContentMount.ts`.
- Picking / gizmo: `apps/editor/src/editor/editorSceneRuntime.ts` (cab part ids, landing kit root, world wrap + cell sync).
- Save-target copy: `describeEditorSaveTarget` in `apps/editor/src/editor/editorOwnershipResolve.ts`.
- Dev saves: `POST /__editor/save-elevator-cab`, `POST /__editor/save-landing-kit` in `apps/editor/src/vite/editorDevMiddleware.ts`.
