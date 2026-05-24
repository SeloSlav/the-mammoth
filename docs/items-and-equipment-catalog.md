# Items, weapons, and equipment catalog

**Status:** Living inventory as of 2026-05-24  
**Source of truth (implemented):** `content/items/catalog/*.json` → merged by `apps/server/src/items_catalog/`  
**Visual resolution:** `packages/assets/src/catalogGlb.ts`, `packages/assets/src/droppedWorldVisual.ts`  
**Concept refs:** `content/references/meshy/` (PNG → Meshy → GLB)

This document lists **everything in the live catalog**, what has **3D coverage**, and **planned gaps** — especially wearables/armor. It is meant to prevent asset sprawl: add items only when a system needs them.

---

## Executive summary

| Area | In catalog | Shipped GLB | Notes |
|------|------------|-------------|-------|
| **Melee weapons** | 5 | 5 | Complete |
| **Ranged weapons** | 2 | 2 | Complete |
| **Tools** | 2 | 2 | Complete |
| **Ammo / craft materials** | 5 | 5 | Complete |
| **Consumables (general)** | 7 | 4 + fallbacks | 4 survival consumables have hooks but often use crowbar fallback until GLBs land |
| **Placeables** | 8 | 3 + fallbacks | Workshop anchors + survival rigs; several refs new, GLB pipeline catching up |
| **Balcony grow-op** | 15 | Shared stage meshes | Seeds/harvests share `grow-stage-*.glb`; individual seed-packet meshes optional |
| **Armor / clothing** | **0** | **0** | **Not implemented** — design calls for a **single fungal suit slot** (Rust rad-suit model), not armor sets |
| **Extraction-only props** | Partial | Partial | Many maintenance/loot props exist as concept art only; not yet catalog ids |

**Weapons:** Nothing missing for current combat. All seven weapons appear in combat-sim loadout (`apps/server/src/combat_sim.rs`).

**Armor:** Defer “normal clothes” and slot-per-piece armor. Plan one **`fungal-suit`** wearable that occupies the entire equipment layer for spore zones, with **tier upgrades** (filter/cartridge durability), not separate helmet/chest/legs.

---

## Inventory model (today)

| Layer | Count | Notes |
|-------|-------|-------|
| Hotbar | 6 slots | Active tool/weapon/consumable |
| Backpack | 8 → 12 planned | General carry |
| Apartment stashes | footlocker, wardrobe, fridge, stove, water tank, fish tank, grow tray | See `packages/schemas/src/apartmentStashRules.ts` |

**Wardrobe** today stores **weapons, ammo, tools, utility** — not clothing. The furniture exists; a `wearable` category does not.

---

## Catalog inventory (44 items)

### Melee weapons (`melee_weapons.json`)

| `def_id` | Display | Craft | GLB | Meshy ref |
|----------|---------|-------|-----|-----------|
| `knife` | Knife | scrap ×3 | `weapons/knife.glb` | yes |
| `crowbar` | Crowbar | scrap ×6 | `weapons/crowbar.glb` | yes |
| `srbosjek` | Šrbosjek | scrap ×6, chemical ×2 | `weapons/srbosjek.glb` | yes |
| `baseball-bat` | Baseball bat | scrap ×8 | `weapons/baseball-bat.glb` | yes |
| `screwdriver` | Screwdriver | scrap ×6 | `weapons/screwdriver.glb` | yes |

Starter loadout: hotbar slot 0 = `screwdriver`.

### Ranged weapons (`ranged_weapons.json`)

| `def_id` | Display | Ammo | GLB | Meshy ref |
|----------|---------|------|-----|-----------|
| `pistol` | Sidearm | loose `ammo-9mm` | `weapons/pistol.glb` | yes |
| `shotgun-coach` | Coach shotgun | loose `ammo-shotgun-shell` | `weapons/shotgun-coach.glb` | yes |

No magazines in catalog — chamber + inventory stacks only.

### Tools (`tools.json`)

| `def_id` | Display | GLB | Meshy ref |
|----------|---------|-----|-----------|
| `multimeter` | Multimeter | `objects/multimeter.glb` | yes |
| `water-bottle` | Water bottle | `consumables/water-bottle.glb` | yes |

### Materials, ammo, utility (`materials.json`)

| `def_id` | Category | GLB | Meshy ref |
|----------|----------|-----|-----------|
| `scrap-metal` | resource | `items/scrap-metal.glb` | yes |
| `chemical-stock` | resource | `items/chemical-stock.glb` | yes |
| `ammo-9mm` | ammo | `items/9-mm-round.glb` | yes (`9-mm-round`) |
| `ammo-shotgun-shell` | ammo | `items/shotgun-shell.glb` | yes |
| `door-lock` | utility | `items/door-lock.glb` | yes |

### Consumables (`consumables.json` + balcony harvest rows)

| `def_id` | Display | Consume hook | GLB | Meshy ref |
|----------|---------|--------------|-----|-----------|
| `field-rations` | Field rations | TBD | fallback | yes (new) |
| `iodine-tablets` | Iodine tablets | TBD | fallback | yes (new) |
| `bandage-roll` | Bandage roll | TBD | fallback | yes (new) |
| `caffeine-gum` | Caffeine gum | TBD | fallback | yes (new) |
| `apple` | Apple | hunger +24 | `consumables/apple.glb` | yes |
| `rakija` | Rakija | hydration −24 | `consumables/rakija.glb` | yes |
| `cigarettes` | Cigarettes | hunger/hydration | `items/cigarette.glb` | yes |
| `fresh-parsley` … `scented-geranium-leaves` | Balcony harvest (7) | hunger/hydration | shared grow preview | yes (harvest refs) |

Fish-tank feed whitelist (`packages/schemas/src/apartmentFishTank.ts`): `apple`, `fresh-*` harvests, **not** bandage/iodine/caffeine.

### Placeables (`placeables.json`)

| `def_id` | Source | Craft | GLB | Meshy ref |
|----------|--------|-------|-----|-----------|
| `brick-oven` | World loot anchor | — | fallback | yes (new) |
| `reloading-press` | World loot anchor | — | fallback | yes (new) |
| `gunsmith-workbench` | World loot anchor | — | fallback | yes (new) |
| `improvised-cook-fire` | Craft | scrap ×8, chemical ×3 | `objects/improvised-cook-fire.glb` | yes |
| `trench-candle` | Craft | scrap ×4, chemical ×5 | `objects/trench-candle.glb` | yes |
| `bulkhead-drip-runner` | Craft | scrap ×10, chemical ×4 | fallback | yes (new) |
| `heat-retention-brick` | Craft | scrap ×5, substrate ×4 | fallback | yes (new) |
| `snap-rat-trap` | Craft | scrap ×4, substrate ×1, chemical ×2 | fallback | yes |

### Balcony grow-op (`balcony_grow_op.json`)

| Kind | `def_id`s | Visual |
|------|-----------|--------|
| Fertilizer | `balcony-grow-substrate` | `objects/compost.glb` |
| Seed / cutting (7) | `parsley-seeds`, `dill-seeds`, `paprika-seedlings`, `green-onion-sets`, `radish-sprout-seeds`, `oyster-mushroom-spore`, `scented-geranium-cuttings` | Shared `grow-stage-sapling.glb` in inventory; tray runtime uses `grow-stage-{seed,sapling,mid,mature}.glb` |
| Harvest (7) | `fresh-parsley`, `fresh-dill`, `fresh-paprika`, `fresh-green-onion`, `radish-sprouts`, `fresh-oyster-mushroom`, `scented-geranium-leaves` | Shared grow preview + harvest meshy refs |

Starter footlocker pack: substrate ×3, seeds/cuttings (see `apps/server/src/inventory/starting_item.rs`).

---

## Armor and wearables

### Implemented

**None.** No `def_id`, no equipment slot, no presenter hook.

### Design direction (recommended)

**One slot: `fungal-suit`** — Rust-style rad suit:

- Equipping fills the **entire wearable layer** (blocks normal clothes until those matter).
- Required to enter **spore-heavy zones** (fungal forest edge, farm quarantine corridors, contaminated stairwells).
- **Upgrades = suit tier or filter cartridge**, not separate chest/helmet meshes:
  - Tier 0: scav sealed coveralls + taped seams (short duration)
  - Tier 1: farm-issued suit + replaceable filter canister (`fungal-suit-filter` consumable)
  - Tier 2: reinforced suit (longer duration / faster move) — same mesh family, material swap or single upgraded GLB
- FPOV: mostly **hands + suit edge at bottom of view**; full-body mesh matters for future TP/remotes and inventory inspect, not priority for solo FP.

**Defer:** street clothes, armor plates, helmets as separate slots. Wardrobe can later accept `wearable` when civilian disguise or cold weather matters.

### Planned catalog rows (not yet added)

| Proposed `def_id` | Role |
|-------------------|------|
| `fungal-suit` | Equippable; zone gate; monolithic slot |
| `fungal-suit-filter` | Consumable; restores suit durability / spore resistance |
| `fungal-armor-fiber` | Resource; farm output → craft higher tier (from `core-game-loop.md`) |

---

## Extraction loot philosophy

From `docs/core-game-loop.md`: extractions are **choose what to carry** — food, medicine, maintenance, militia gear, comfort trade goods. Avoid vacuum looting and duplicate silhouettes.

### Tier A — Already in catalog (prioritize GLB shipping)

Items players can already pick up in code; ship meshes before adding new ids:

- Survival consumables: `field-rations`, `iodine-tablets`, `bandage-roll`, `caffeine-gum`
- Craft materials: `scrap-metal`, `chemical-stock`, ammo stacks
- Workshop anchors: `brick-oven`, `reloading-press`, `gunsmith-workbench`
- Survival placeables: `bulkhead-drip-runner`, `heat-retention-brick`, `snap-rat-trap`

### Tier B — Concept art exists; not in catalog yet

Good **extraction return** candidates when systems land (maintenance tutorial, zone gear, apartment rituals). **Do not all become items** — pick 3–5:

| Prop / concept | Suggested use | Add to catalog? |
|----------------|---------------|-----------------|
| `flashlight` | Blackout stairs, basement work orders | **Yes** — tool |
| `ceramic-water-filter` | Water tank repair loop | **Yes** — utility/resource |
| `fish-food-tin` | Fish-tank ritual | **Yes** — consumable |
| `canned-soup-tin` | Generic food loot | Optional — overlaps `field-rations` |
| `ammo-tin` | Militia stash container (opens to ammo) | Optional — container mechanic |
| `fuse-wire-pack` | Basement tutorial / MEP repair | **Yes** — resource |
| `map-board` | Apartment planning prop | Decor only — **no catalog** unless interactable |
| `antifungal-spray` | Spore zone prep before suit tier 1 | **Yes** — consumable |
| `duct-tape-roll` | Generic repair craft input | **Yes** — resource |
| `weapon-cleaning-oil` | Weapon upkeep fluff | Low priority — cosmetic/durability hook |
| `spore-sample-jar` | Quest / farm turn-in | **Yes** — resource |
| Building props (`intercom`, `fuse-box`, `slop-bucket`, …) | World dressing | **No catalog** — static decor |

### Tier C — Design-doc extraction themes still uncovered

Minimal set worth **one mesh each** when extraction floors go live (not 20 variants):

| Theme | 1–2 props max | Notes |
|-------|---------------|-------|
| **Maintenance** | `pressure-gauge` (handheld), `valve-wheel` (small) | Basement tutorial from `core-game-loop.md` |
| **Farm / fungal** | `fungal-loaf`, `nutrient-puck` | Ration-grade food; ties farm floor to apartment fridge |
| **Medicine** | reuse `bandage-roll` + `iodine-tablets`; add `disinfectant-bottle` only if effect differs | Avoid pill variety |
| **Comfort trade** | reuse `cigarettes`, `rakija`, `pioneer-neckerchief` decor | Already covered |
| **Combat salvage** | reuse ammo + `ammo-tin`; **no new weapons** | Weapon parts as `scrap-metal` stack visually |

---

## Weapons — gap analysis

**Current catalog is complete.** All weapons have:

- Catalog shard entry with construction costs (where applicable)
- `weapons/*.glb`
- Meshy reference PNG
- Entry in `ModelAssetKey` / combat systems

**Do not add** parallel weapons (second pistol, axe, machete) until a **distinct role** exists in combat (reach, noise, breach, stamina). Possible **future** single additions — not art priorities now:

| If needed later | Role |
|-----------------|------|
| Pipe wrench / hatchet | Breach + slow melee (environment interaction) |
| Improvised spear | Long reach, low durability |

---

## Asset pipeline checklist

When adding or finishing an item:

1. Add or confirm row in `content/items/catalog/*.json`
2. Add `droppedWorldVisual` size in `packages/assets/src/droppedWorldVisual.ts` if it can be dropped
3. Add `MAMMOTH_CATALOG_GLB_PRIMARY_URI` override if filename ≠ `def_id`
4. Concept PNG in `content/references/meshy/<slug>.png` + subject in `content/references/meshy/README.md`
5. Ship GLB under `apps/client/public/static/models/{weapons,consumables,objects,items}/`
6. For equippables: weapon presentation JSON under `content/weapons/` or future wearable presenter

**Fallback behavior:** unknown or missing GLB resolves to `weapons/crowbar.glb` (`catalogGlb.ts`) — fix before players see loot in the wild.

---

## Recommended next steps (minimal variety)

1. **Ship GLBs** for Tier A catalog rows that still fallback (consumables + new placeables + extraction tools when cataloged).
2. **Add 3 catalog ids** when ready to implement systems:
   - `fungal-suit` (wearable)
   - `fungal-suit-filter` (consumable)
   - `flashlight` (tool)
3. **Add 2–3 extraction resources** when basement/maintenance loop ships: `fuse-wire-pack`, `ceramic-water-filter`, `spore-sample-jar` (or reuse as stack variants of existing materials).
4. **Hold** on: extra weapons, armor sets, seed-packet mesh per crop, duplicate food tins, map-board as item.

---

## Related docs

- [core-game-loop.md](core-game-loop.md) — extraction philosophy, apartment rituals, farm outputs
- [weapon-authoring.md](weapon-authoring.md) — FP/TP weapon presentation
- [content/references/meshy/README.md](../content/references/meshy/README.md) — concept prompt house style
