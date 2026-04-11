# Monorepo layout — code vs authored world vs binaries

**Rule of thumb:** code lives under `apps/` and `packages/`; **authored** world data under `content/`; **large binaries** under `static/`. Nothing authoritative about the city layout should live “hidden” only inside `packages/engine` or only inside the client bundle.

---

## Apps

| App | Responsibility |
|-----|------------------|
| `apps/client` | Ship build: boot engine, connect SpaceTimeDB, stream world, game loop, mount React HUD |
| `apps/editor` | Same engine + world stack; edit mode, tools, gizmos, React panels; **writes `content/`** |
| `apps/server` | SpaceTimeDB module, reducers, tables; optional seed/import from disk |

The editor is **not** a second-class fork: shared packages prevent two divergent scene systems.

### Local dev URLs (Vite defaults)

| Command | App | URL |
|--------|-----|-----|
| `npm run dev` or `pnpm dev` (repo root) | **Game client** (login + scene) | [http://localhost:5173](http://localhost:5173) |
| `npm run editor:dev` / `pnpm editor:dev` | **Editor** (authoring stub) | [http://localhost:5174](http://localhost:5174) |
| `npm run dev:all` / `pnpm dev:all` | All packages that define `dev` (client, editor, web, docs, auth, …) | several ports |

Use **`dev`** for the playable client; use **`dev:all`** only when you need the full stack in parallel.

---

## Packages (long-term sanity)

| Package | Responsibility |
|---------|----------------|
| `engine` | Renderer, frame loop, camera rigs, input, culling hooks, pooling, debug draw |
| `world` | Load cell / interior / floor docs, prefab resolution, streaming, portals, instantiation |
| `game` | Rules: inventory, claims, combat scaffolding, interactions |
| `ui` | React-only: HUD, inventory, editor chrome |
| `schemas` | Zod + TS types for **disk documents** and **wire formats** |
| `assets` | Code-side registries and lookups (ids used by content) |
| `net` | DB connection, subscriptions, adapters between runtime and SpaceTimeDB |
| `tools` | Validators, migrations, codegen, content CLI |

---

## Content directory (`content/`)

Use **directories on disk from day one** so the editor has a real save target.

**Horizontal / city fabric**

- `content/cells/` — one file (or split layers later) per **cell id**
- `content/districts/` — district-level config (bounds, ambience, defaults)
- `content/exterior/` — optional legacy or **non-grid** exterior zones (e.g. named courtyard strips) until everything is migrated to cells

**Vertical / megablock (The Mammoth)**

- `content/building/` — floors, sections, units, lobby, service (existing layout)
- Same global coordinates; portals link **cell** shells to **building** interiors

**Shared definitions**

- `content/prefabs/`, `content/materials/`, `content/nav/`, `content/spawns/`

**Interiors**

- `content/interiors/` — one document per streamable interior (lobby, stairwell, unit interior, basement)

Authoring can start in **either** cell-centric or building-centric docs; **portals** connect them. Prefer **not** duplicating full interior meshes inside every street cell file.

---

## Static assets (`static/`)

GLBs, textures, audio — referenced by id/path from `AssetDef` and friends. Versioned with the repo or LFS as sizes grow.

---

## Scripts (`scripts/`)

Repo-level automation: batch validate `content/`, import to local DB, release packaging.

---

## Minimal mental model

```txt
apps/client          → play
apps/editor          → author → writes content/*
apps/server          → authoritative live state
packages/world       → interprets content/* + streaming
packages/schemas     → truth for shapes
content/*            → baseline city (cells, interiors, building chunks)
static/*             → binary payloads
```

If a new system does not have an obvious home, ask: **is it code, authored data, or runtime state?** Then place it in `packages/*`, `content/*`, or SpaceTimeDB respectively.
