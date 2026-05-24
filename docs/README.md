# The Mammoth — documentation index

| Document | What it covers |
|----------|----------------|
| [PROJECT.md](PROJECT.md) | Product vision, tech stack, repo map, vertical slice, milestones |
| [core-game-loop.md](core-game-loop.md) | Core loop, floors, orders, extraction, apartment life, progression, tone |
| [building-floors.md](building-floors.md) | Locked vertical stack: PR, 16 abandoned decks, per-floor recoverables |
| [vertical-slice-day1-storage-run.md](vertical-slice-day1-storage-run.md) | **First playable loop:** Day 1 radio quest → floor 13 → fuse wire → home |
| [items-and-equipment-catalog.md](items-and-equipment-catalog.md) | Live item/weapon inventory, asset coverage, armor plan, extraction gaps |
| [architecture/world-streaming.md](architecture/world-streaming.md) | One world coordinate system; cells vs building/interior chunks; what loads when |
| [architecture/editor.md](architecture/editor.md) | Editor role, loading policy, workflows, save behavior |
| [architecture/persistence.md](architecture/persistence.md) | Disk vs SpaceTimeDB; baseline vs dynamic; document types |
| [architecture/monorepo.md](architecture/monorepo.md) | Where code, authored data, and binaries belong |
| [architecture/fp-prediction-view-smoothing.md](architecture/fp-prediction-view-smoothing.md) | Why FP motion can feel “hitchy” under 20 Hz reconcile; what helped (display + view ease vs physics sub-steps) |
| [architecture/elevator-runtime-sync.md](architecture/elevator-runtime-sync.md) | Elevator authority, SpaceTimeDB reducers/tables, client replica timing, and why moving rides no longer hitch |
| [architecture/fp-building-mesh-visibility.md](architecture/fp-building-mesh-visibility.md) | FP floor-plate band + inset full stack; tagged interiors only within expanded XZ “near” margin |
| [architecture/fp-apartment-interior-performance.md](architecture/fp-apartment-interior-performance.md) | Locked FP perf baseline: spin hitch vs furnished wall; prop visibility budget; capture interpretation |
| [content-building.md](content-building.md) | After floor/building JSON edits: run `pnpm content:gen-walk-aabbs` so server walk collision stays in sync |
| [apps/client/README.md](../apps/client/README.md) | Vite dev, optional second port, multiplayer (two browsers / tabs) |

Start with **PROJECT.md**, then read **world-streaming** and **persistence** if you are touching world data or the database.
