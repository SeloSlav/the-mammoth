# World model and streaming

This project is **one continuous world in one global coordinate system**. Players and editors never depend on multiple unrelated “scenes” with disconnected origins unless we explicitly introduce instanced pockets (e.g. isolated test maps).

That does **not** mean one monolithic file or one fully loaded scene in memory.

---

## Two ideas at once (not a contradiction)

**Horizontal city / neighborhood fabric** — streets, courtyards, parking, plazas — is easiest to author, save, and stream as **grid cells**: fixed-size regions in the XZ plane, each with its own document.

**The apartment megastructure** (stair cores, floors, units, service zones) is easier to reason about as **vertical and structural documents** (floors, sections, units, lobby, basement) because gameplay and layout are “building-shaped,” not arbitrary squares.

Both can coexist:

- Same **origin and axes** everywhere.
- A **cell** might contain only the exterior shell and portals into a **floor** or **interior** document.
- A **floor** document might span the footprint of several cells, or align to one cell column—implementation detail, as long as **transforms are expressed in world space** and ownership rules are clear.

So: **not only square city cells** (per project principles), but **cells are still the right default unit for large exterior expanses** and for streaming around the block at street level.

---

## Cells (exterior / city fabric)

Treat each cell roughly as:

- Placed objects (prefabs and loose props)
- Decals and ground stamps (when you add them)
- Portals (doors, garages, metro stubs, entries into interiors)
- Metadata (district id, tags, ambience hooks)

**Suggested starting size:** about **128 m × 128 m** per cell for dense urban context—small enough to stream and diff cleanly, large enough for meaningful street blocks. Adjust after playtest.

**Cell identity:** stable id derived from grid coordinates, e.g. `cell_12_08` for grid `(12, 8)`, plus optional human labels (`courtyard_main` remains a *logical* name in metadata, not a second coordinate system).

---

## What loads in the runtime (and editor)

| Tier | Role |
|------|------|
| **Active cell** | Full detail, full interaction, authoritative edits in the editor |
| **Neighbor cells** | Full or high detail for continuity; colliders and visuals as needed |
| **Ring beyond neighbors** | Lightweight proxies, bounds only, or unloaded |
| **Interiors** | Separate documents; load when entering via portal or explicit editor open |

The editor should **feel** like flying through one city; under the hood it **never** loads the entire authored dataset at full fidelity.

---

## Cross-cell objects

Large meshes (long walls, roads, bridges) will straddle cell boundaries.

**Default policy (recommended first):**

1. **Owner cell** — each authored object belongs to exactly one cell (or one interior document).
2. **Pivot rule** — owner cell = cell containing the object’s **origin / pivot** in XZ (simple, predictable).
3. **Visual overlap** allowed — geometry may extend into neighbors; neighbors render it as part of read-only context or via shared instancing rules as you optimize later.

**Later options:** split mega-assets into sub-pieces per cell, or special-case “spanning” types with explicit multi-cell metadata—only when pivot rule breaks down.

---

## Interiors

**Do not** fold full apartment simulations into the same document as the street cell if you can avoid it.

- **Exterior cell:** building shell, entrances, signage, props, **portal** records pointing at interior ids.
- **Interior document:** lobby, stairwell, floor plate, unit shell, props—authored and streamed on demand.

Stairwells and stacked floors can be one interior doc or several (e.g. per floor); choose based on memory and collaboration, not dogma.

---

## Dynamic state (not in baseline cell files)

Doors open/closed, loot depleted, damage, faction scratch, **player-owned apartment state**, etc. belong in **runtime overlays** (SpaceTimeDB and/or in-memory sync), not as the only copy of the static city layout.

See [persistence.md](persistence.md).

---

## Summary

- **One world, one coordinate system.**
- **Save and stream in chunks** — cells for horizontal fabric; interiors (and megablock floor/section/unit docs) for vertical and enterable structure.
- **Editor and client** both respect the same loading tiers; the editor additionally writes baseline documents back to disk (and may sync into the DB for playtests—see persistence doc).
