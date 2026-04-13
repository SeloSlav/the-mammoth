---
name: World editor scope detail
overview: Defines what “floors” mean in The Mammoth, expands the level editor to a full in-scope authoring surface for world JSON (floors, building, and path to interiors), and packs concrete UX, data, and implementation detail so you can comfortably author content after implementation—without mixing in unrelated scope (networking, gameplay sim, ECS).
todos:
  - id: glossary-doc
    content: Document FloorDoc vs storey vs slab in editor README or EditorChrome help strip (no new .md file unless user asks)
    status: completed
  - id: scene-store
    content: "SceneHost + zustand: active floorDocId, documents map, selectedId, dirty, storyLevelIndex for buildFloorMeshes"
    status: completed
  - id: pick-inspector
    content: Raycast + inspector (Euler UI, metadata JSON) + sync transforms
    status: completed
  - id: save-reload
    content: Vite /content middleware + fetch load + POST save + download + reload
    status: completed
  - id: gizmo-undo
    content: TransformControls + optional grid snap + undo/redo stack
    status: completed
  - id: outliner-crud
    content: Outliner list + add/duplicate/delete + prefab palette + spawn before camera
    status: completed
  - id: building-panel
    content: "Optional BuildingDoc panel: floorRefs, worldOrigin, save mammoth.json"
    status: completed
  - id: interior-phase
    content: "InteriorDoc mode: parse, buildInteriorMeshes, same pick/save pattern"
    status: completed
  - id: lighting-hdri
    content: HDR env + shadows toggle + metadata.editorMaterial texture apply
    status: completed
isProject: false
---

# World editor: expanded scope and “floors” glossary

## What we mean by “floors” (important)

In this codebase **“floor” is overloaded**. Use these terms consistently:

| Term | Meaning |
|------|--------|
| **Storey / level** | A **vertical slice** of the megablock: story 1 = ground, story 2 = first typical slab, etc. Indexed **`levelIndex`** (1-based) on [`BuildingFloorRef`](packages/schemas/src/building.ts). |
| **`FloorDoc` / “floor JSON”** | One **authored plate document**: [`FloorDoc`](packages/schemas/src/floor.ts) = `{ id, objects[] }` where each [`PlacedObject`](packages/schemas/src/floor.ts) has `prefabId`, `position`, optional `rotation`, `scale`, `metadata`. Files live under [`content/building/floors/*.json`](content/building/floors/). **This is what the placeholder mesher consumes** via [`buildFloorMeshes`](packages/world/src/floorPlaceholderMeshes.ts). |
| **Floor plate instance** | At runtime, [`instantiateBuildingFloorStack`](packages/world/src/index.ts) stacks one **parsed `FloorDoc` per `BuildingFloorRef`**, offset by `(levelIndex - 1) * spacing`. Many storeys can **reuse the same** `floorDocId` (e.g. `floor_mamutica_typical`). |
| **Floor slab (mesh)** | The **horizontal deck** inside a hollow shell (corridor/unit room), not the same as `FloorDoc`. |

So when the earlier plan said **“edit floors”**, it meant: **author and save `FloorDoc` JSON** (lobby shell, corridors, shafts, etc.) for each `floorDocId`, not “paint floor materials only.”

**Apartment / furnished unit** content today is primarily **[`InteriorDoc`](packages/schemas/src/interior.ts)** (`placements`, `portals`, `decals`) — different schema from `FloorDoc`. The expanded editor plan **includes a clear path** to author interiors in the same app after the `FloorDoc` loop is stable (shared selection/save patterns).

---

## In-scope: everything reasonable for “comfortably author the world”

All of the below stays **authoring + visualization + persistence + validation** for **content JSON** and **Three preview**. Explicit **out-of-scope** at the end (gameplay, netcode, etc.).

### A. Core edit loop (must-have)

- **Single active document** at a time for v1: working copy of **`FloorDoc`** in memory; scene is derived.
- **Floor / storey picker**: driven by [`BuildingDoc.floorRefs`](content/building/mammoth.json) — choose `floorDocId`; if two storeys share the same id, editor edits **one shared document** (show warning badge: “typical slab: changes affect N storeys”).
- **Load**: `fetch('/content/building/floors/{id}.json')` + `parseFloorDoc` (requires Vite middleware or `public` mapping so `/content/...` works in dev).
- **Rebuild scene** from doc: `buildFloorMeshes(doc, { storyLevelIndex, elevatorDoorFaceByShaftKey from ground floor if needed })` — match [`instantiateBuildingFloorStack`](packages/world/src/index.ts) options as closely as practical so **WYSIWYG vs game**.
- **Tagging for picking**: after build, walk direct children of `floor:*` root and set `userData.placedObjectId = child.name` (already equals `PlacedObject.id`).
- **Raycast select** (click): resolve to `placedObjectId`; support empty-space deselect.
- **Inspector**: `id`, `prefabId`, `position[x,y,z]`, `scale`, `rotation` (Euler **degrees** in UI, convert to quaternion for schema), optional **JSON metadata** textarea (validated as JSON object, merged into `metadata`).
- **Transform gizmo**: `TransformControls` (translate / rotate / scale modes); on drag end, write back to `PlacedObject` and mark `dirty`.
- **Save**: (1) **Download** pretty-printed JSON always. (2) **Dev POST** `POST /__editor/save-floor` with allowlisted `floorDocId` → write under `content/building/floors/{id}.json`, gated by `EDITOR_SAVE=1`.
- **Reload from disk**: button + optional debounce when dev server detects file change (or manual only v1).

### B. Authoring productivity (high value, still in-scope)

- **Add / duplicate / delete** objects; duplicate deep-copies `metadata`.
- **Prefab palette**: curated list (grep-derived from `content/building/floors`) + **free-text** `prefabId` for AI parity.
- **Spawn in front of camera** for new objects; sensible defaults `scale: [1,1,1]`, `position` from camera ray to a horizontal plane at `y=0` or median object Y.
- **Grid snap** optional (e.g. 0.05 m, 0.1 m) for translate; optional angle snap for rotate (15°).
- **Undo/redo stack** (in-memory, per session) for transform + add/delete — large QoL, still pure editor.
- **Keyboard shortcuts**: `W/E/R` gizmo modes, `F` frame selection, `Del` delete, `Ctrl+S` save (download or POST), `Ctrl+Z/Y` undo/redo.
- **Outliner / hierarchy** panel: list `objects` by `id` + `prefabId`; click to select; filter text box.
- **Validation on save**: `FloorDocSchema.safeParse`; surface Zod errors in UI; block save or “save anyway” for power users.
- **Dirty indicator** in chrome title strip; confirm on tab close / floor switch if dirty.

### C. Building-level authoring (in-scope, can follow FloorDoc v1)

- **Edit `BuildingDoc`** (e.g. [`mammoth.json`](content/building/mammoth.json)): `floorRefs` reorder, `displayLabel`, `worldOrigin`, `metadata` — **separate tab or panel** with JSON tree or minimal forms.
- **Save building** same pattern: download + optional POST to allowlisted `content/building/mammoth.json` (or chosen filename).
- **Open arbitrary floor file** by id picker only first; “add new floor ref + new empty FloorDoc” is a stretch goal.

### D. Interiors path (in-scope as phased, same app patterns)

- **Interior mode**: load `InteriorDoc` from `content/...` (path TBD from repo layout), [`buildInteriorMeshes`](packages/world/src/index.ts) preview, same selection/inspector/save pipeline adapted to `CellPlacement` / portals.
- **Link display**: show which `BuildingUnitRef` / templates reference which `interiorTemplateId` (read-only from `BuildingDoc` for context).

### E. Visual quality in editor (in-scope; game client unchanged until you want parity)

- **Lighting rig**: key + fill + hemisphere; optional **shadows** on a subset of meshes with perf toggle.
- **Environment**: `RGBELoader` + `PMREMGenerator` for neutral HDRI (editor-only asset under `apps/editor/public/` or served from `/content`).
- **Per-object material overrides** via `metadata.editorMaterial` (convention, still `record` in schema): e.g. `{ mapUrl, roughness, metalness }` applied after `buildFloorMeshes` by traversing meshes under that `PlacedObject` group — **no schema migration** required.
- **Section gizmo / grid** in scene (infinite grid helper, axes).

### F. Safety, repo hygiene, and AI workflow

- **No path traversal** in save middleware; strict regex on ids; max body size.
- **Pretty JSON** with stable key ordering optional (nice for git diffs).
- **“Merge from clipboard”**: paste JSON fragment for one `PlacedObject` or whole floor — validate then merge.
- **Comment in saved JSON** — JSON does not support comments; use `metadata._comment` if you need notes.

### G. Testing / acceptance you can run yourself

- Edit ground floor, move `lobby_main_ns`, save, run **client** [`instantiateBuildingFloorStack`](packages/world/src/index.ts) — layout matches.
- AI edits same file on disk → **Reload** in editor → scene matches.
- Undo after gizmo drag restores prior transform.

---

## Out of scope (do not bundle into this editor plan)

- **Gameplay**: SpacetimeDB reducers, FP locomotion, combat, audio logic.
- **Replacing Three with Babylon** or running dual engines.
- **Full Blender replacement**: UV unwrapping, skeletal animation editor, terrain sculpt.
- **Runtime streaming / LOD** decisions — only preview scale matters here.

---

## Implementation note (supersedes attachment density)

The attached [`three.js_level_editor_1fd1738d.plan.md`](.cursor/plans/three.js_level_editor_1fd1738d.plan.md) stays a **minimal phased skeleton**. This document is the **expanded single source** for scope and glossary. Implementation can still land in the same file order (scene host → store → pick → save → fetch → gizmos → palette → lighting) but tickets should reference **sections A–G** above so nothing implied by “author the world” is forgotten.
