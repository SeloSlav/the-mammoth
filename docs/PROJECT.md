# The Mammoth — project specification

Browser-based **first-person persistent multiplayer survival** sandbox: one giant Slavic apartment block (~150 units) plus immediate neighborhood (courtyard, shops, park, church, etc.). Custom **Three.js + TypeScript** runtime; **React** only for UI; **SpaceTimeDB** for live state and sync.

**Documentation index:** [README.md](README.md) (links to architecture deep-dives). **Game design:** [core-game-loop.md](core-game-loop.md).

---

## Tech stack

| Layer | Choice |
|--------|--------|
| Monorepo | pnpm workspaces, Turbo |
| Language | TypeScript (strict) |
| Rendering / runtime | Three.js, `packages/engine` |
| UI | React (HUD, inventory, editor panels, terminals) |
| Backend / sync | SpaceTimeDB (no Supabase / separate cloud DB for now) |
| Authoring | Structured documents on disk under `content/` |

**Runtime versions:** React 19, Vite 8, Three.js ~0.183, Zod 4, Zustand 5, `spacetimedb` 2.x TS SDK. Rust module in `apps/server` may resolve a slightly newer `spacetimedb` crate; pin in `Cargo.toml` if you need strict parity.

**Root scripts:** `pnpm client:dev`, `pnpm editor:dev`, `pnpm client:generate`, `pnpm server:build`. SpaceTimeDB CLI on `PATH` for generate/build.

---

## Non-negotiable principles

1. **World is data** — baseline layout lives in versioned documents under `content/`, not hardcoded scenes.
2. **Editor is first-class** — same engine and world stack as the client; saves to disk; see [architecture/editor.md](architecture/editor.md).
3. **One world, chunked load** — single global coordinate system; **never** require loading the entire city at full detail. Cells + interiors + building docs are all valid chunk types; see [architecture/world-streaming.md](architecture/world-streaming.md).
4. **Separation of concerns** — `engine` · `world` · `game` · `ui` · `net` · `schemas` · `tools` (see [architecture/monorepo.md](architecture/monorepo.md)).
5. **React is not the game loop** — no simulation or rendering core in React components.
6. **Baseline vs dynamic** — authored baseline on **disk**; live gameplay overlay in **SpaceTimeDB**; see [architecture/persistence.md](architecture/persistence.md).

---

## Repository layout (summary)

```
apps/client, apps/editor, apps/server
packages/engine, world, game, ui, schemas, assets, net, tools
content/   — baseline authored world (cells, interiors, building chunks, prefabs, …)
static/    — models, textures, audio
scripts/   — automation
```

Starter `apps/web` and `apps/docs` may remain from the Turborepo template until removed.

---

## Content and schemas (summary)

Target document families include **`CellDoc`**, **`InteriorDoc`**, **`AssetDef`**, **`PrefabDef`**, **`PlacedObject`**, **`PortalDef`**, plus megablock-oriented types already in use (**`FloorDoc`**, **`UnitDoc`**, sections, service, exterior zones). **Dynamic overlays** (claims, locks, loot, doors) are not the sole copy of static layout.

Details and examples: [architecture/persistence.md](architecture/persistence.md).

Sample prefab ids: `stair_core_a`, `apartment_unit_small_a`, `corridor_segment_a`, `lobby_entry_a`, `kiosk_a`. Sample names: `lobby_central`, `floor_01_east`, `unit_03_12`, `basement_boiler_west`, `courtyard_main`, `kiosk_strip_north`.

---

## First vertical slice (scope)

- Lobby + one stair/elevator core + **3 floors** + **2–6 units per floor** + one basement pocket + one exterior strip + one terminal prop.
- First-person movement, simple collision, placeholder geometry.
- Multiplayer **presence**; **claim + lock** path; **inventory / stash** model + UI shell.
- Editor: load active chunk, transform objects, place from registry, **save to disk**, cell/grid overlay when cell pipeline exists.

---

## Next milestones

1. ~~Formalize **`CellDoc` / `InteriorDoc`** in `packages/schemas` + samples `content/cells/cell_0_0.json` and `content/interiors/lobby_central.json`.~~
2. **`packages/world`**: load active cell + neighbors; integrate with existing `FloorDoc` path where needed.
3. **Editor**: explicit active cell / active interior; save only that document.
4. **SpaceTimeDB**: presence, claims, overlay tables; optional import of authored cells for playtest.
5. **Decals / portals / validators** in `packages/tools`.
