# World editor

The editor is **first-class**: same renderer, same world loading stack, and same schemas as the game client. It is **not** a separate toy scene graph that drifts from production.

Think of it as: **the game runtime with edit powers** — different mode, gizmos, React side panels, save/load commands, and debug overlays.

---

## Scope: whole world, never whole world in RAM

**Conceptually** you author the entire city (and the megablock’s authored chunks).

**Technically** the editor:

- Keeps a **global** camera and coordinate frame (pan, fly, jump to district or coords).
- **Fully loads** the **active cell** (or active interior document) for editing.
- Loads **neighbor cells** (and relevant building shells) for **context** — placement alignment, sightlines, portal alignment.
- Uses **lightweight or empty placeholders** for far cells unless you explicitly request a preview.

So: **one editor, one world**, but **chunked load and chunk save** — never “load every cell at max detail.”

---

## Workflows (target)

These are the behaviors to grow toward; the current app may only implement a subset early.

### Navigation

- Fly through the world; optional snap-to-grid or snap-to-building.
- Jump to coordinates, cell id, district name, or bookmark.
- **Show cell boundaries** (grid overlay) and optional labels.

### Placement

- Pick asset or prefab from a palette.
- Place into the **active cell** (owner = pivot rule unless overridden).
- Move, rotate, scale, duplicate, delete; optional snapping.

### Painting (later)

- Decals, grime, road markings, ground masks.

### Portals

- Mark doorways / garage mouths / stair entries.
- Bind portal to **interior id** (and optional spawn point inside).

### Metadata

- District tags, loot density, ambience, NPC markers, quest hooks — keep in authored docs or small side tables as you define schemas.

### Save

- Serialize **only objects belonging to the active save unit** (usually one **cell** id, or one **interior** id).
- Write a **clean document** to disk under `content/` (see [monorepo.md](monorepo.md)).
- Optionally **import or sync** that document into SpaceTimeDB for multiplayer playtests — disk remains the **reviewable source** for baseline layout.

---

## Cross-boundary edits

If the user places content near a cell edge:

- Prefer **assigning owner cell by pivot** (see [world-streaming.md](world-streaming.md)).
- Optionally **warn** when geometry extends far into a neighbor (data still owned by one cell).

---

## Recommended build order (editor + runtime together)

Build client and editor in the **smallest loop**; do not finish a giant editor before anything runs.

1. **Shared schemas + `content/`** — `AssetDef`, `PrefabDef`, `CellDoc`, `InteriorDoc` (and keep existing megablock types like `FloorDoc` where useful).
2. **`packages/world`** — load **one** cell (or one floor doc) from disk → instantiate placeholders in Three.js.
3. **`apps/editor`** — select prefab, place, transform, delete, **save active cell (or interior) to disk**.
4. **Runtime streaming** — active + neighbor cells (and interior streaming via portals).
5. **Richer tools** — decals, paint, metadata panels, STDB sync for authored copies.

This matches “city in data” and “editor is production pipeline,” not a bolt-on later.
