# Building floors — vertical stack & extraction loot

**Status:** Locked design reference as of 2026-05-24  
**Canonical elevator labels:** `apps/client/src/ui/playerNotebookTipsContent.ts` (Floor ledger diary)  
**Building index:** `content/building/mammoth.json` (`levelIndex` 1 = PR … 20 = top)  
**Item ids:** [items-and-equipment-catalog.md](items-and-equipment-catalog.md)

This document locks **every floor under the militia frontier down through PR**, plus PR itself and the four basement service levels. Each abandoned deck gets a **theme**, **mood/hazard**, and **primary recoverable profile** (1–3 unique carry ids per floor; everything else reuses shared pool items).

---

## Naming convention

| Term | Meaning |
|------|---------|
| **Elevator label** | What the passenger panel shows: `19` … `1`, plus `PR` |
| **`levelIndex`** | `mammoth.json` stack index: `20` = top … `1` = PR |
| **Mapping** | Elevator `N` = `levelIndex` `N + 1` for decks 1–19. **PR** = `levelIndex` **1** only. |

Passenger lift **does not** stop at basement levels (−1 … −4). Those use **PR service stairs** and boot-card landings.

---

## Full vertical stack (top → deep)

| Elevator | `levelIndex` | Layer | Extraction? |
|----------|--------------|-------|-------------|
| **19** | 20 | Civilian residential (player home) | No — inhabited |
| **18** | 19 | Communal fungal farm | Shift work + limited carry loot |
| **17** | 18 | Red Belt / militia frontier | Contracts, not open looting |
| **16** … **1** | 17 … 2 | **16 abandoned extraction decks** | **Yes** — targeted runs |
| **PR** | 1 | Ground podium / lobby hub | No — safe hub |
| **−1** | *(service doc)* | Kotlovnica — boiler hall | Work orders, escorted tutorial |
| **−2** | *(service doc)* | Pumparna — pumps & switchgear | Escorted maintenance |
| **−3** | *(service doc)* | Geotermalna dvorana | Supervised plant work |
| **−4** | *(service doc)* | Galerija — deep intake | Late-game council band |

See [core-game-loop.md — Floor structure](core-game-loop.md#floor-structure) for narrative tone on civilian, farm, militia, and basement bands.

---

## PR — ground podium (`levelIndex` 1)

**Diegetic name:** PR (prizemlje — ground level).

**What it is:** The building’s **lobby spine**, not a residential deck. Elevator hub, dead kiosk ghosts, boot-card readers, and the **service-stair door** that drops to kotlovnica (−1). Passenger lift **stops here**; it does **not** open into the abandoned stack below the panel’s “1” label — fungus-bloom (elevator **1**) is still a **passenger floor** one level above PR in the shaft, not the lobby itself.

**Gameplay role:**

- Safe traversal between elevator, exterior podium, and service stairs
- Zero combat, zero spore density
- **Not** an extraction zone — no floor loot tables
- Tutorial hand-off: first basement work orders start from PR landings

**Recoverables:** None (props only: intercom shells, fuse-box decor, slop buckets — no catalog ids).

**Basement recoverables** (work-order driven, any of −1 … −2 early):

| `def_id` | Role |
|----------|------|
| `fuse-wire-pack` | MEP repair |
| `pressure-gauge` | Gauge swap quests |
| `valve-wheel` | Valve replacement |
| `pump-impeller` | −2 pump hall escorts |
| `multimeter` | Already in catalog; issued or found on −1 |

---

## Inhabited layers (above abandoned stack)

Brief loot context — full farm roster in [items catalog — Fungal farm](items-and-equipment-catalog.md#fungal-farm-catalog-planned-v1).

### 19 — Civilian top (`levelIndex` 20)

Inhabited apartments, trade, gossip, player flat. **No extraction loot.** Balcony grow-op harvest ids only (`fresh-*`, seeds, substrate).

### 18 — Fungal farm (`levelIndex` 19)

Communal bays, misting corridors, Sonja’s ration counter. **Carry loot (farm-issued / shift reward):**

| Primary | Secondary |
|---------|-----------|
| `fungal-loaf` | `nutrient-puck` (input — rarely worth hauling out) |
| `mycelium-harvest-block` | `fungal-armor-fiber` (low rate) |
| `quarantine-spore-culture` | `spore-sample-jar` (turn-in from field) |

**Run stations (world):** drying racks, misting controls, sterilizer props — not inventory ids.

**Wear:** `fungal-suit`, `fungal-suit-filter` issued or bought here before deep spore runs.

### 17 — Red Belt / militia (`levelIndex` 18)

Checkpoints, bunks, ammo benches, contract board. **Not** a free-loot floor.

| Source | Items |
|--------|-------|
| Contract rewards | `ammo-9mm`, `ammo-shotgun-shell`, work chits (currency, not `def_id`) |
| Run stations | `reloading-press`, `gunsmith-workbench` |
| Scavenging (risky) | `scrap-metal`, occasional `pistol` / `shotgun-coach` world spawns |

---

## Abandoned extraction decks (16 → 1)

**Design rules:**

- Runs target **rooms / systems**, not full-floor clears ([core-game-loop.md](core-game-loop.md)).
- **Primary** = 1–2 ids that justify the trip; **secondary** = shared pool at low rate.
- **Shared pool** (any abandoned deck): `scrap-metal`, `chemical-stock`, `cigarettes`, `door-lock`, improvised weapons (`crowbar`, `screwdriver`, `metal-pipe`, `improvised-spear`).
- **Depth:** 16 = safest / picked-over; 1 = highest spore pressure near ground vents.
- Items marked **planned** are in Meshy refs / design doc but not yet in `content/items/catalog/`.

### Summary table

| Elevator | Theme | Hazard emphasis | Primary recoverables | Secondary |
|----------|-------|-----------------|----------------------|-----------|
| **16** | Abandoned residential | Dark units, grease smell, feral rats | `cigarettes`, `rakija` | `heat-retention-brick`, `snap-rat-trap` |
| **15** | Black-market | Burned stalls, ash spine, ambush corners | `ammo-9mm`, `rakija` | `ammo-tin` *(planned)*, `cigarettes` |
| **14** | Quarantine | Sealed units, warning paint, spore pockets | `spore-sample-jar`, `disinfectant-bottle` *(planned)* | `iodine-tablets`, `antifungal-spray` *(planned)* |
| **13** | Storage | Collapsed shelving, copper closets | `scrap-metal`, `fuse-wire-pack` *(planned)* | `field-rations`, `duct-tape-roll` *(planned)* |
| **12** | Archive / records | Paper stacks, fire smell, slow search | `caffeine-gum` | `scrap-metal` (low) |
| **11** | Laundry / textile | Drum rot, flood stains, mildew | `chemical-stock`, `bandage-roll` | `heat-retention-brick` |
| **10** | Workshop | Dead lathes, bench vices, metal stock | `scrap-metal`, `metal-pipe` *(planned)* | `screwdriver`, `reloading-press` *(station)* |
| **9** | Religious / elderly | Icons, candle stubs, named doors | `cigarettes`, `bandage-roll` | `trench-candle` craft inputs (`chemical-stock`) |
| **8** | Collapsed | Detours, breath dust, bad carry weight | `metal-pipe` *(planned)*, `improvised-spear` *(planned)* | `flashlight` *(planned)*, `scrap-metal` |
| **7** | Maintenance-heavy utility | Fuse rooms, pipe chase, elevator fault rumors | `fuse-wire-pack` *(planned)*, `valve-wheel` *(planned)* | `multimeter`, `pressure-gauge` *(planned)* |
| **6** | Failed militia outpost | Rot barricades, spent shells, guilt | `ammo-9mm`, `patrol-lamp` *(planned)* | `ammo-shotgun-shell`, `gunsmith-workbench` *(station)* |
| **5** | Grocery / ration storage | Empty freezers, vinegar smell | `field-rations` | `fish-food-tin` *(planned)*, `apple` |
| **4** | Clinic / medical | Stripped cabinets, low light | `bandage-roll`, `iodine-tablets` | `disinfectant-bottle` *(planned)*, `caffeine-gum` |
| **3** | School / daycare | Tiny desks, chalk dust, science room | `iodine-tablets`, `caffeine-gum` | `field-rations` (low), `fish-food-tin` *(planned)* |
| **2** | Flooded residential | Knee water, cold, quiet splashes | `ceramic-water-filter` *(planned)*, `valve-wheel` *(planned)* | `water-bottle`, `scrap-metal` |
| **1** | Fungus-bloom frontier | Highest spore density near ground vents | `fungal-suit-filter`, `mycelium-harvest-block` | `spore-sample-jar`, `antifungal-spray` *(planned)* |

---

## Per-floor detail

### 16 — Abandoned residential

Last normal apartments before the Red Belt. Doors sealed, cooking grease behind plaster, picked clean but still **comfort trade** territory. First “real” abandoned deck for runners who slipped past militia scrutiny.

- **Navigation:** Standard corridor + unit grid; some welded shut
- **Hazard:** Darkness, rats, occasional squatters (future NPC)
- **Run station:** None
- **Why go:** `cigarettes` / `rakija` for neighbor trade; `heat-retention-brick` from radiator strips

### 15 — Black-market

Burned-out stalls along the corridor spine; melted plastic and ash. Former informal economy floor.

- **Navigation:** Choke points at stall frames
- **Hazard:** Ambush lines, unstable flooring over burned-through units
- **Contract hook:** Militia board — scout stairwell on **15**, return **patrol-lamp** from **6**
- **Why go:** Ammo stashes, comfort goods, black-market premium rates at home

### 14 — Quarantine

Sealed units, triplicate warnings, medic authority only. Do not breach without order.

- **Navigation:** Half the corridor blocked by weld plates
- **Hazard:** Spore pockets behind bad seals; suit recommended not mandatory
- **Why go:** Field samples for farm medic (`spore-sample-jar`); disinfectant distinct from bandage/iodine

### 13 — Storage

Mixed salvage, collapsed shelving, **utility closet numbers worth memorizing** (copper, fuse stock).

- **Navigation:** Shelf mazes, toppled pallets
- **Hazard:** Collapse noise attracts attention
- **Why go:** Bulk `scrap-metal`, `fuse-wire-pack`, generic repair (`duct-tape-roll`)

### 12 — Archive / records

Paper stacks, slow search, fire smell. Maps and names matter more than calories.

- **Navigation:** Narrow aisles between shelves
- **Hazard:** Smoke inhalation debuff zones (future); fire-damaged sections
- **Why go:** `caffeine-gum` for long search shifts; quest hooks for map lore (props, not items yet)
- **Gap:** No unique archive id — intentional; lore via interactables

### 11 — Laundry / textile

Drum rot, cloth rolls if floods have not reached them. Soap and bleach chemistry.

- **Navigation:** Wet floor in back rooms
- **Hazard:** Mildew / slip; chemical fumes
- **Why go:** `bandage-roll` (cloth supply), `chemical-stock`, insulation → `heat-retention-brick` chain
- **Gap:** No separate soap id — `chemical-stock` covers it

### 10 — Workshop

Dead lathes, bench vices, metal stock for trade.

- **Navigation:** Bench clutter narrows lanes
- **Hazard:** Sharp scrap, unstable racks
- **Run station:** `reloading-press` (size brass during run)
- **Why go:** High `scrap-metal`; found `metal-pipe`; craft input for placeables

### 9 — Religious / elderly resident

Icons, candle stubs, names on doors nobody collects.

- **Navigation:** Shrine niches in corridor alcoves
- **Hazard:** Low light; emotional weight, not mechanical
- **Why go:** Comfort trade (`cigarettes`), `bandage-roll`; `trench-candle` inputs from wax/stub props → `chemical-stock`

### 8 — Collapsed

Detours, breath dust, **not a place for heavy carry**.

- **Navigation:** Blocked spine; stairwell detours mandatory
- **Hazard:** Collapse zones; stamina tax on encumbered exits
- **Why go:** Improvised weapons (`metal-pipe`, `improvised-spear`); `flashlight` in rubble
- **Run station:** None

### 7 — Maintenance-heavy utility

Fuse boxes, pipe rooms, **elevator fault on seven** (notebook radio). Orders often point here.

- **Navigation:** Utility chase parallel to corridor
- **Hazard:** Live junctions (future shock); dark pipe rooms
- **Why go:** `fuse-wire-pack`, `valve-wheel`, `pressure-gauge`, `multimeter`
- **Tie-in:** Basement −1 work orders reference same part families

### 6 — Failed militia outpost

Half-rotted barricades, spent shells, bad memories. A forward position that failed.

- **Navigation:** Barricade zigzag
- **Hazard:** Trip hazards, line-of-sight fights
- **Run station:** `gunsmith-workbench`
- **Why go:** `ammo-9mm`, **`patrol-lamp`** (militia contract item), weapons salvage

### 5 — Grocery / ration storage

Empty freezers, vinegar smell, coolant sometimes intact.

- **Navigation:** Cold-room side passages
- **Hazard:** Slip on leaked coolant; darkness in walk-in units
- **Why go:** `field-rations` primary food extract; `fish-food-tin` for apartment tank ritual
- **Run station:** `brick-oven` in communal kitchen wing (bake during run)

### 4 — Clinic / medical

Stripped cabinets; antibiotics if luck and light hold.

- **Navigation:** Reception choke → treatment wing
- **Hazard:** Biohazard corners (low spore, pre-quarantine era)
- **Why go:** `bandage-roll`, `iodine-tablets`, `disinfectant-bottle`
- **Processing:** Farm `mycelium-harvest-block` → drying rack → `bandage-roll` supplements clinic loot

### 3 — School / daycare

Tiny desks, chalk, **science room alcohol** on good days.

- **Navigation:** Classroom grid; playground wing flooded off
- **Hazard:** Child-scale clutter (trip); fragile morale tone
- **Why go:** `iodine-tablets`, `caffeine-gum`; pet-room `fish-food-tin`
- **Gap:** No chalk/textbook id — props only

### 2 — Flooded residential

Knee water, quiet splashes, **radiator valves worth the cold**.

- **Navigation:** Wading lanes; some units submerged
- **Hazard:** Cold exposure, drowned stairwells
- **Why go:** `ceramic-water-filter` (apartment water tank repair), `valve-wheel`, `water-bottle` refills
- **Design note:** Intact radiators here feed heat-retention / valve quests tied to home warmth

### 1 — Fungus-bloom frontier

Highest spore density near **ground vents**; mask or regret.

- **Navigation:** Visible spore haze; fungal growth on walls
- **Hazard:** **Suit required** for sustained looting; filter consumption
- **Why go:** `fungal-suit-filter`, raw `mycelium-harvest-block`, rare field cultures
- **Adjacency:** Directly above PR in the shaft — thematic “ground breath” without being the lobby

---

## Basement service levels (−1 … −4)

Not on the passenger panel. **Maintained, not abandoned.** See [core-game-loop.md — Basement geothermal](core-game-loop.md#basement-geothermal--boiler--generator-levels).

| Level | Primary recoverables | Access |
|-------|---------------------|--------|
| **−1** Kotlovnica | `fuse-wire-pack`, `valve-wheel`, `pressure-gauge` | Player rota — daily work |
| **−2** Pumparna | `pump-impeller`, `battery-4-pack` *(planned)* | Escorted clearance |
| **−3** Dvorana | Gauges, lore schematics (quest props) | Supervised only |
| **−4** Galerija | Story keys; no early loot table | Council-sealed late game |

---

## Recoverable coverage audit

### All 16 themes assigned?

**Yes.** Every theme from [core-game-loop.md](core-game-loop.md) maps to exactly one elevator label (16 → 1). The assignment is **canonical** in the player notebook Floor ledger and reproduced in the summary table above.

### Planned `def_id`s not yet in catalog JSON

These appear in floor profiles and need catalog rows when extraction loot tables ship:

| `def_id` | Floors | Priority |
|----------|--------|----------|
| `flashlight` | 8, 7, basement | High — blackout navigation |
| `battery-4-pack` | −2, utility | High |
| `fuse-wire-pack` | 13, 7, −1 | High |
| `ceramic-water-filter` | 2 | High — water tank loop |
| `disinfectant-bottle` | 14, 4 | Medium |
| `fish-food-tin` | 5, 3 | Medium |
| `pump-impeller` | −2 | Medium |
| `pressure-gauge` | 7, −1 | Medium |
| `valve-wheel` | 7, 2 | Medium |
| `spore-sample-jar` | 14, 1, farm turn-in | Medium |
| `metal-pipe` | 8, 10 | Medium — improvised weapon |
| `improvised-spear` | 8 | Medium |
| `duct-tape-roll` | 13 | Low |
| `patrol-lamp` | **6** (contract from 15) | Medium — militia quest |
| `ammo-tin` | 15 | Low — optional container |
| `antifungal-spray` | 14, 1 | Defer until suit tiers |
| `fungal-suit` / `fungal-suit-filter` | 18 issue, 1 loot | Farm/wearable shard |

### Floors with no unique primary (by design)

| Floor | Resolution |
|-------|------------|
| **12** Archive | `caffeine-gum` + lore interactables |
| **9** Religious | Comfort pool + `bandage-roll` |
| **16** Residential | Comfort pool + placeable inputs |

Three floors sharing generic ids is acceptable — **navigation and hazard** differentiate them, not item sprawl.

---

## Implementation notes

1. **`mammoth.json`** today uses one typical floor doc for most `levelIndex` values — theme differentiation is **content/authored loot + dressing**, not separate floor doc ids yet. **Exception:** vertical slice targets `floor_mamutica_storage_13` at `levelIndex` 14 — see [vertical-slice-day1-storage-run.md](vertical-slice-day1-storage-run.md).
2. **Server loot tiers** (`apps/server/src/dropped_item.rs`) still use generic weapon/food pools — wire per-floor tables when interior authoring lands.
3. After changing floor metadata in JSON, run `pnpm content:gen-walk-aabbs` ([content-building.md](content-building.md)).

---

## Related docs

- [core-game-loop.md](core-game-loop.md) — extraction philosophy, floor tone, basement phases
- [items-and-equipment-catalog.md](items-and-equipment-catalog.md) — all `def_id`s, Meshy coverage, farm roster
- [content/references/meshy/README.md](../content/references/meshy/README.md) — concept prompts for recoverables
