---
name: Three.js level editor
overview: "Turn `apps/editor` from a passive viewer into a minimal authoring tool: edit one or more `FloorDoc` instances in memory, raycast-select objects, move them with gizmos or numeric fields, persist JSON compatible with AI/programmatic generation, and reload the scene in dev without restarting the app. Lighting/texture polish follows once the edit loop is solid."
todos:
  - id: scene-refactor
    content: "Refactor apps/editor App.tsx: scene host + rebuildFromFloorDoc + userData id mapping"
    status: pending
  - id: editor-state
    content: Add editor state (active floor, FloorDoc map, selectedId, dirty) + wire to UI
    status: pending
  - id: select-inspector
    content: Raycast selection + EditorChrome inspector fields (position/scale/rotation/prefabId)
    status: pending
  - id: save-persist
    content: Serialize FloorDoc; download button + optional Vite POST save to content/building/floors
    status: pending
  - id: fetch-hot-reload
    content: Switch active floor load to fetch + reload button / watch-friendly flow
    status: pending
  - id: transform-gizmos
    content: Add TransformControls sync to PlacedObject transforms
    status: pending
  - id: prefab-palette
    content: Add object / duplicate / delete + prefab id palette + free-text
    status: pending
  - id: lighting-textures
    content: Editor-only env map + optional metadata-driven texture overrides on meshes
    status: pending
isProject: false
---

# Level editor (React + Three) on existing stack

## Context (current state)

- [`apps/editor/src/App.tsx`](apps/editor/src/App.tsx): creates a `THREE.Scene`, calls [`instantiateBuildingFloorStack`](packages/world/src/index.ts) + `parseFloorDoc` via eager `import.meta.glob` on [`content/building/floors/*.json`](content/building/floors/).
- [`apps/editor/src/ui/EditorChrome.tsx`](apps/editor/src/ui/EditorChrome.tsx): static placeholder panel only.
- Authored shape is already ideal for hand + AI: [`PlacedObject`](packages/schemas/src/floor.ts) (`id`, `prefabId`, `position`, optional `rotation`/`scale`/`metadata`). [`buildFloorMeshes`](packages/world/src/floorPlaceholderMeshes.ts) turns each object into a `THREE.Group` named `obj.id` (room group) — a stable key for selection mapping.

## Design principles

1. **Single source of truth**: a working copy of `FloorDoc` (per edited floor) in editor state; the Three scene is derived and rebuilt (or patched) from that state. This keeps round-trips with AI-generated JSON trivial (parse → validate → assign).
2. **No second engine**: stay on `three` (same as client). Use `TransformControls` from `three/examples/jsm/controls/TransformControls.js` when you add gizmos.
3. **Persistence in dev**: browsers cannot silently write arbitrary repo paths. Plan for **(A)** a small **Vite dev-server middleware** with an allowlisted path under `content/building/floors/` (POST body = JSON), plus **(B)** “Download JSON” as a zero-config fallback. Production builds can omit the middleware.
4. **Hot reload**: eager glob makes HMR on edited JSON unreliable. Move the **active floor** load in the editor to **`fetch()` + `parseFloorDoc`** (same JSON paths, dev server serves `content/`). Then **Vite watches** `content/**` and a **“Reload”** (or debounced auto-reload) refetches and rebuilds the scene. AI or external editors saving files will show up after reload.
5. **Interior apartments later**: keep editor core **doc-agnostic** where possible (interface: `id`, `objects[]`, `parse`/`serialize`). v1 implements `FloorDoc` end-to-end; v2 swaps or adds `InteriorDoc` + [`buildInteriorMeshes`](packages/world/src/index.ts) without redoing selection/save UI.

## Architecture (mermaid)

```mermaid
flowchart LR
  subgraph editor [apps/editor]
    State[EditorState_FloorDoc]
    UI[React panels]
    View[Three scene]
    Persist[Save API or download]
  end
  subgraph content [content/building/floors]
    JSON[floor_*.json]
  end
  subgraph world [@the-mammoth/world]
    Parse[parseFloorDoc]
    Build[buildFloorMeshes]
  end
  JSON -->|fetch dev| State
  State --> Parse
  Parse --> Build
  Build --> View
  UI --> State
  State --> Persist
  Persist -->|POST allowlisted| JSON
```

## Implementation phases

### Phase 1 — Edit loop (usable “move things” + save)

- **Refactor [`App.tsx`](apps/editor/src/App.tsx)** into a small module boundary: create scene/camera/renderer once; expose `rebuildFromFloorDoc(doc: FloorDoc)` that clears previous building root, runs `buildFloorMeshes(doc, { storyLevelIndex: … })` (minimal opts), adds root to scene, and registers **`object.userData.placedObjectId = obj.id`** on the top-level group for each placement (already `room.name = obj.id`).
- **Editor state** (Zustand store or plain React context in `apps/editor/src/state/`): `activeFloorDocId`, `documents: Map<string, FloorDoc>`, `selectedId`, `dirty`.
- **Raycast selection** on pointer down: `Raycaster` against building root’s meshes; walk `object.parent` until `userData.placedObjectId` or `name === id`; set `selectedId`.
- **Inspector** in [`EditorChrome`](apps/editor/src/ui/EditorChrome.tsx): show `prefabId`, `position`, `scale`, `rotation` (euler or quaternion fields); edits update state and **sync transform** on the selected `Object3D`.
- **Save**:
  - Serialize with `FloorDocSchema.parse` / `JSON.stringify` (pretty) to guarantee schema-valid output.
  - **Download** button (always works).
  - **Optional `vite.config.ts` plugin**: `configureServer` middleware `POST /__editor/save-floor` that writes only if `floorDocId` matches `^floor_[a-z0-9_]+$` and resolves under `content/building/floors/{id}.json` (reject path traversal). Guard with env `EDITOR_SAVE=1` if you want extra safety.

### Phase 2 — Gizmos + prefab authoring

- Add **`TransformControls`** bound to selected group; on `dragging-changed` / `change`, write back `position` (+ `rotation` quaternion from `object.quaternion` if you enable rotate mode).
- **Prefab palette**: static list derived from known `prefabId` strings in repo (grep `content/building/floors`) + free-text field for new ids (matches AI workflow). “Add object” generates a new `id` (`crypto.randomUUID()` or `nanoid`) and default `position` in front of camera.
- **Delete / duplicate** selected object in the `FloorDoc.objects` array.

### Phase 3 — Hot reload + multi-floor (optional but high value)

- Replace eager glob for **editor** with `fetch(\`/content/building/floors/${id}.json\`)` (requires `public` copy or Vite static `server.fs.allow` already present — [`apps/editor/vite.config.ts`](apps/editor/vite.config.ts) already allows repo root; ensure `content` is reachable via URL, e.g. `server.fs.allow` + `appType` or symlink `public/content` — verify one approach in implementation).
- **Floor picker** dropdown: list `building.floorRefs` from [`mammoth.json`](content/building/mammoth.json) and load the corresponding floor doc into state; rebuild scene with correct `storyLevelIndex` for `buildFloorMeshes` opts if needed for ground slab behavior.

### Phase 4 — “Nice looking” lighting and textures (after interaction works)

- **Lighting**: add `DirectionalLight` + soft `HemisphereLight`, enable `renderer.shadowMap` selectively on a few meshes if perf allows; optional **EXR/RGBE** env via `RGBELoader` + `PMREMGenerator` (editor-only dependency acceptable).
- **Textures**: prefer **metadata-driven** overrides without breaking AI JSON: e.g. `metadata.editorMaterial` `{ mapUrl, roughness }` on `PlacedObject` (still `z.record` compatible) and a small editor helper that applies `MeshStandardMaterial` + `TextureLoader` to that room’s meshes after `buildFloorMeshes`. Long-term, migrate repeated presets into shared constants in `@the-mammoth/world` only if the game client should match.

## Files likely touched

| Area | Files |
|------|--------|
| Editor shell | [`apps/editor/src/App.tsx`](apps/editor/src/App.tsx), new `apps/editor/src/editor/SceneHost.ts` (or `.tsx`), [`apps/editor/src/ui/EditorChrome.tsx`](apps/editor/src/ui/EditorChrome.tsx), new `apps/editor/src/state/editorStore.ts` |
| Persistence | [`apps/editor/vite.config.ts`](apps/editor/vite.config.ts), optional `apps/editor/server/saveFloorMiddleware.ts` |
| World (minimal) | Possibly export a thin helper from [`packages/world/src/index.ts`](packages/world/src/index.ts) if you want `buildFloorMeshes` + parse re-exported for editor-only ergonomics (optional) |

## Out of scope for first ship (explicit)

- Full ECS, undo stack, multiplayer editing, binary GLTF apartment furniture (can be Phase 5).
- Changing the **game client** bundle for HDR unless you want parity; keep HDR editor-only initially.

## Success criteria

- Select a lobby/corridor/unit box in the 3D view, move it, **Save** produces valid `FloorDoc` JSON that still loads in [`instantiateBuildingFloorStack`](packages/world/src/index.ts) / client.
- External edit (AI) to the same JSON file + **Reload** updates the editor scene without hand-editing TypeScript.
