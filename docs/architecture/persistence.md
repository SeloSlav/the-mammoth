# Persistence: disk, SpaceTimeDB, and document types

**Blunt summary:** SpaceTimeDB should be the **main runtime system** for multiplayer and live world state. **Disk** should remain the **source of truth for authored baseline** (diffable, branchable, recoverable). That is not “two databases”; it is **content tooling + runtime**.

Do **not** store the entire authored city as one giant blob in a single DB row. Do **not** let dynamic state overwrite authored layout in the same files.

---

## What lives on disk (`content/` + `static/`)

| Artifact | Role |
|----------|------|
| **Asset registry** | ids → models, materials, collider hints, tags |
| **Prefab definitions** | reusable assemblies referencing assets + child transforms |
| **Cell documents** | placements, decals, portals, metadata for one grid cell |
| **Interior documents** | enterable spaces (lobby, stairwell, apartment floor, basement utility) |
| **Megablock chunks** (optional / parallel) | `FloorDoc`, `SectionDoc`, `UnitDoc`, etc., for vertical authoring aligned to the same world frame |
| **District / biome configs** | atmosphere, audio rules, high-level metadata (not necessarily one file per cell) |
| **Materials / nav / spawns** | as needed |

Formats: JSON today; same shapes validated in `packages/schemas` (e.g. Zod).

---

## What lives in SpaceTimeDB

**Yes — default home for:**

- Player state, presence, sessions
- Inventory, equipment, stash
- Quest / faction / encounter state that must be authoritative
- **Dynamic world overlay:** doors, locks, depleted loot, temporary props, damage, apartment claims, etc.
- Optional **cached copies** of authored cells or prefabs for **serving** live clients and editor playtests

**Still keep on disk as canonical authored source:**

- Asset and prefab **definitions**
- **Baseline** cell and interior layouts
- Large migrations and procedural generation **inputs**

**Flow that scales:** author on disk → validate (`packages/tools`) → optionally **import or publish** into SpaceTimeDB → clients subscribe/query. Git always has a sane baseline.

---

## Core document types (names)

Implementations evolve in `packages/schemas`; names are stable targets.

| Type | Purpose |
|------|---------|
| `AssetDef` | Single importable asset + collision/light/tags |
| `PrefabDef` | Composed object, child placements, sockets |
| `CellDoc` | One exterior (or horizontal) cell: placements, decals, portals, metadata |
| `InteriorDoc` | One interior stream: rooms, stairs, props, portals back to world |
| `PortalDef` | Often embedded in cell/interior docs; links world position ↔ interior id + spawn |
| `PlacedObject` | Instance in a cell or interior: id, prefab or asset ref, transform, overrides |
| `DynamicCellState` / **overlay** | Runtime-only or DB-backed; not the sole copy of static layout |

Existing Mammoth types (`FloorDoc`, `UnitDoc`, `ExteriorZoneDoc`, …) remain valid where they describe the **megablock** more naturally than a square cell; treat them as **another family of baseline chunks** in the same coordinate system (see [world-streaming.md](world-streaming.md)).

---

## Example cell document (illustrative)

Checked-in reference: **`content/cells/cell_0_0.json`**. Validated by `CellDocSchema` in `packages/schemas`.

```json
{
  "id": "cell_12_08",
  "version": 1,
  "district": "courtyard_east",
  "coord": [12, 8],
  "placements": [
    {
      "entityId": "e_001",
      "prefabId": "kiosk_a",
      "position": [14.2, 0, 33.8],
      "rotation": [0, 0, 0, 1],
      "scale": [1, 1, 1],
      "overrides": { "signVariant": "faded" }
    }
  ],
  "portals": [
    {
      "id": "portal_block_a_lobby",
      "position": [15, 0, 31],
      "interiorId": "lobby_central",
      "entrySpawn": [15.2, 0.1, 33],
      "entryRotation": [0, 0, 0, 1]
    }
  ],
  "decals": [
    {
      "id": "decal_01",
      "type": "oil_stain_large",
      "position": [22.1, 0.01, 17.8],
      "rotation": [0, 1.2, 0],
      "scale": [2.1, 1, 1.6]
    }
  ]
}
```

Authoring quality matters more than the exact first JSON shape; **schemas + validators** lock it down.

---

## Runtime loop (client)

1. From player position, **compute current cell** (and interior if inside a loaded pocket).
2. Decide **nearby cells / interiors** to load or keep warm.
3. Resolve **AssetDef** / **PrefabDef** for each placement.
4. Instantiate render + collider + interactables.
5. **Apply dynamic overlay** from SpaceTimeDB (locks, loot, claims).
6. **Unload** distant chunks and release GPU resources.

The editor uses the same resolution path where possible, plus **write** paths for the active document.
