# Vertical slice — Day 1 storage run

**Status:** Authoring target for first playable extraction loop  
**Goal:** Prove the core fantasy — *leave home → descend → get one thing → come back relieved* — without boiler room (−1), militia combat, or farm shifts.  
**Floor to author:** **Elevator 13 — Storage** (`levelIndex` **14** in `mammoth.json`)

Related: [building-floors.md](building-floors.md) (floor 13 profile), [core-game-loop.md](core-game-loop.md) (run design philosophy).

---

## Quest pacing (not day-locked)

**Do not tie quests to calendar days.** World days advance when the player sleeps — and players will **skip days on purpose** (grow-op harvests, balcony timers, fridge rot, waiting on passive processing). Locking story beats to “Day 2 only” fights that loop and is brittle to implement.

### Three phases (new save → endgame)

| Phase | What | Linear? | Day-locked? |
|-------|------|---------|-------------|
| **1 — Tutorial extraction** | This slice: storage run (floor **13**) — radio, elevator, fetch, home | **Scripted** (once per save) | No |
| **2 — Orientation** | Introduce the three hubs every runner must know: **farm (18)**, **boiler room (−1)**, **militia (17)** | **Scripted order** — finish one to unlock the next offer | No |
| **3 — Open loop** | Extraction on **remaining abandoned floors (16→1)** + routine hub jobs | **Random pools** (plus gated lore / hardcore later) | No |

**Slot discipline (all phases):** one active work order at a time. Finish it → next offer appears. Nobody tracks how many in-game days it took.

### Phase 1 — Tutorial extraction (this doc)

First morning on a new save: maintenance net fires the **fuse-wire / storage closet** job. Teaches the **extraction shape** before any hub tour.

### Phase 2 — Orientation (scripted, not random)

After storage turn-in, **do not** roll random floor jobs yet. Walk the player through the building’s **social and survival infrastructure** in a fixed sequence (exact copy TBD per beat; order below is default):

| Step | Hub | Elevator / access | Teaches |
|------|-----|-------------------|---------|
| **O1** | Communal fungal farm | **18** | Shift labor, rations, grow bays — balcony is not enough |
| **O2** | Kotlovnica (boiler hall) | PR → service stairs **−1** | Official job, gauges/valves, heat keeps everyone alive |
| **O3** | Red Belt / militia | **17** | Frontier tone, contracts, danger below sixteen — not free looting |

Each orientation beat is a **short authored visit** (task + NPC or radio + one POI), not a full random extract. Player may sleep fifty days between O1 and O2; only **completion** gates the next orientation step.

When **O3 completes**, set `orientation_complete` → phase 3 unlocks.

### Phase 3 — Random extraction (the rest of the stack)

**Abandoned decks 16 down to 1** enter the **routine extraction pool** — archive UV bulb, school iodine, flooded valve, patrol lamp from six, etc. ([building-floors.md](building-floors.md) per-floor profiles). Hub maintenance jobs (farm supply, basement part) also roll from pools, weighted by trust and building state.

| Pool tier | Typical job | How offered |
|-----------|-------------|-------------|
| **Routine extraction** | Floor *X* (16…1), retrieve *item* / *POI* | Random among unlocked floors **after orientation** |
| **Routine hub** | Farm / basement / militia fetch | Random among unlocked hubs |
| **Lore / hardcore** | Multi-step story, investigation, sealed zone | **Gated** by progression milestones (**TBD**) — not in everyday rotation |

### World day vs quests

| World day | Work orders |
|-----------|-------------|
| Grow stages, rot, rations, NPC schedules | **Not** day-number gates |
| Player skips days freely | Phase uses **flags** (`tutorial_*`, `orientation_step`, `orientation_complete`), not `world_day == N` |

Implementation sketch: `active_quest_id` + `orientation_step` (0…3) + `orientation_complete` + **pool tables** for phase 3. This slice implements phase 1 only; orientation beats get their own quest ids when authored.

---

## Why this floor

| Candidate | Verdict |
|-----------|---------|
| **13 — Storage** | **Pick.** Distinct from the player’s home deck; maintenance errand fits `fuse-wire-pack`; “utility closet numbers” is diegetic navigation; one corridor + shelf maze is enough to author; still only three elevator stops from home (19→13). |
| 16 — Abandoned residential | Too visually close to floor 19 for a first “descent” read; better as a later comfort-trade run. |
| 7 — Maintenance utility | Live MEP hazard + elevator-fault lore — save for when basement loop exists. |
| 6 — Failed militia outpost | Patrol-lamp style jobs — militia **pool** entry once that hub unlocks (progression TBD). |

---

## Slice scope (in / out)

### In scope

- Wake in apartment (floor 19)
- **First-morning** radio call while **off rotation** (narrative flavor — not a day-lock)
- Passenger elevator **19 → 13**
- One authored extraction deck (storage theme on typical plate)
- Single quest objective: **`fuse-wire-pack`** from **utility closet 13-E-4**
- Return **13 → 19**, stash item, radio acknowledgment
- Optional: one opportunistic pickup (`duct-tape-roll`) on the route
- Optional: sleep to advance world day (farming / rot / schedules — **not** required to complete this quest)

### Out of scope (defer)

- Kotlovnica / PR service stairs (−1 … −4)
- Militia checkpoint stop on 17 (panel is **pre-cleared** for this callout only)
- Combat enemies (rats / squatters = stretch goal)
- Farm floor, NPC hallway conversation, footlocker tutorial beyond “you have a screwdriver”
- Quest UI beyond radio text + notebook line (implementation can stub state)

---

## Narrative setup

**When:** First morning of a new save (**phase 1 — tutorial extraction**).  
**Player status:** **Off duty** — rest day after induction week. Chit taped inside fridge door: *“Rotacija: slobodno / Off rotation.”* The radio call happens anyway; completing the run is **not** tied to how many days pass before or after. **After turn-in:** **phase 2 orientation** begins (farm → boiler → militia) — not random extracts yet. See [Quest pacing](#quest-pacing-not-day-locked).

**Who calls:** **Rada** — kotlovnica crew chief. Player knows her voice from training shifts not yet playable. She uses the **building maintenance net** (hard-wired radio channel, not militia band).

**Why today:** East riser fuse bank on **13** still has a **spare wire kit** in closet **13-E-4**. Overnight telemetry showed a pre-fault on the elevator tie-in for deck seven; engineering wants the kit **on hand at kotlovnica** before the morning shift — but the player is the only runner whose **elevator access is already logged** for storage closets, and the on-duty runner is pinned at a pump alarm on −2 (foreshadow basement; player does not go there yet).

**Player-facing fantasy:** You were going to stay home. The building does not care.

---

## Quest: `work_order_fuse_wire_13e4`

| Field | Value |
|-------|--------|
| **Kind** | Scripted tutorial (hard-coded; not pool random) |
| **Display title** | Fuse kit — closet 13-E-4 |
| **Issuer** | Rada (maintenance net) |
| **Target floor** | Elevator **13** (storage) |
| **Objective item** | `fuse-wire-pack` ×1 |
| **Delivery** | Player apartment **footlocker** (defer hand-in at kotlovnica until basement slice) |
| **Failure** | None for v0 — no timer, no death fail state required |

### Success conditions (implementation)

1. Quest active after radio segment completes.
2. Player picks up **`fuse-wire-pack`** from authored interactable at closet **13-E-4**.
3. Player returns to apartment on floor **19**.
4. Player places `fuse-wire-pack` in **footlocker** (or any apartment stash flagged `maintenance_turn_in` later).
5. Trigger closing radio line; mark quest complete.

### Rewards (v0)

- Notebook diary line unlocked
- **`duct-tape-roll`** if picked up — kept as bonus loot
- No currency yet; emotional reward = Rada’s “rest your rotation” + logged chit for later basement trust

---

## Beat-by-beat flow

### 1 — Apartment morning (floor 19)

**Environment:** Radiator tick, weak daylight through forest glow. Fridge chit: off rotation.

**Minimum interactions:**

- Get out of bed (optional tutorial)
- Notice radio already on low static (kitchen / shelf — same prop family as notebook “radio low”)

**No forced NPC meet.** Hallway can be empty or one distant door sound.

---

### 2 — Radio call (auto after ~30 s idle or on `Use` radio)

Play as **subtitle + audio** (VO optional later). Static between lines.

```
[MAINT NET — auto relay]
[static]

RADA:
Runner — you on nineteen? Pick up.

[static]

RADA:
You're off rotation. I see it. I don't care.
East riser on thirteen threw a warning bit overnight.
Elevator seven tie-in. You know what that means.

[static]

RADA:
Closet thirteen-E-four. Fuse wire kit — the yellow banded pack, not the copper reel.
Panel's cleared for you straight down. Don't stop at seventeen.
Don't improvise.

[static]

RADA:
Bring it home. Stash it. I'll send Miloš for it when shift turns.
Copy?

[static — line open; no response needed]

RADA:
...Good. Thirteen-E-four. Chalk on the door if the lights lie.
```

**Notebook unlock (after call):** Diary → *“First call on a day off. Thirteen-E-four. Fuse wire. Home, not kotlovnica — not yet.”*

**Quest state:** Active. Objective string: *Retrieve fuse wire kit from closet 13-E-4.*

---

### 3 — Elevator descent (19 → 13)

**Panel behavior:** Floors **1–18** selectable; **PR** visible but not required. Highlight **13** optional.

**Ride tone:** Longer silence than player expects. Cab light flickers once at **17** (militia deck passing — audio thump of distant boots, no stop).

**On arrival at 13:** Doors open to **dim corridor**. Emergency strips only; one fluorescent buzzes. Temperature cooler than 19.

---

### 4 — Floor 13 — storage deck (authoring target)

**Theme recap:** Mixed salvage, collapsed shelving, utility closet numbers worth memorizing. See [building-floors.md — Floor 13](building-floors.md#13--storage).

#### Layout intent (use typical plate, re-dress)

Start from `floor_mamutica_typical.json` geometry. **Do not** author 1169 apartments — author **one playable spine**:

| Zone | Authoring notes |
|------|-----------------|
| **A — Elevator landing** | West core landing (consistent with mammoth typical). Toppled cardboard, pallet jack frozen rusted, **chalk arrow** on wall: `13-E-4 →` |
| **B — Main corridor** | Partially blocked **collapsed shelving** — forces **10 m detour** through a gap (squeeze or crouch not required; walk around) |
| **C — Side aisle (east wing)** | Narrower service aisle; **utility chase** behind dead units — MEP props: `fuse-box`, `slop-bucket`, pipe runs |
| **D — Closet 13-E-4** | Metal utility door, **chalk stenciled** `13-E-4`, dull yellow hazard stripe band. Interact → spawn **`fuse-wire-pack`** in player inventory or world pickup |
| **E — Optional bonus loot** | **`duct-tape-roll`** on a shelf near zone B collapse — visible but off direct line if player rushes objective |

#### Hazards (v0)

| Hazard | Implementation |
|--------|----------------|
| **Darkness** | Low light; no flashlight required if emergency strips guide the route |
| **Navigation** | One detour — test “I know where I’m going” vs panic |
| **Noise** | Optional metal creak when passing collapse — no enemy response yet |
| **Rats** | Stretch: one `snap-rat-trap` prop sprung nearby; no combat |

#### What not to author yet

- Militia bodies, spore haze, flooded sections, full unit interiors
- Gun loot, run stations (`reloading-press`, etc.)

#### Primary loot table (this slice)

| Spawn | `def_id` | Count | Required |
|-------|----------|-------|----------|
| Closet 13-E-4 interact | `fuse-wire-pack` | 1 | **Yes** |
| Collapsed shelf (zone B) | `duct-tape-roll` | 1 | No |
| Random floor debris | `scrap-metal` | 0–2 | No |

---

### 5 — Return ride (13 → 19)

Doors close. Cab ascends. Optional one line of player internal monologue (subtitle only):

> *Still grease and vinegar on thirteen. Nineteen smells like cabbage. Good.*

---

### 6 — Apartment delivery

**Objective update:** *Stash fuse wire kit in footlocker.*

On stash:

```
[MAINT NET]

RADA:
Marked received on nineteen. Good.
Rest your rotation — for real this time.
Miloš picks it up on morning shift.

[click]
```

**Quest complete.**

---

### 7 — After the quest (optional)

Sleep whenever the player wants — advances **world day** for grow-op, rot, etc. **Next work order** after turn-in is **orientation O1 (farm)**, not a random floor roll. Random extraction on decks **16…1** unlocks only after orientation **O3 (militia)** completes.

---

## Authoring checklist

### Content files

1. **New floor document:** `content/building/floors/floor_mamutica_storage_13.json`  
   - Fork typical plate OR reference typical + storage-specific `objects[]` props  
   - Tag in metadata: `"theme": "storage"`, `"elevatorLabel": "13"`, `"verticalSlice": "day1_fuse_wire"`

2. **Wire mammoth.json** — `levelIndex` **14**:
   ```json
   {
     "levelIndex": 14,
     "floorDocId": "floor_mamutica_storage_13",
     "displayLabel": "Floor 13",
     "shortLabel": "13"
   }
   ```

3. **Loot / interact** — when quest system exists, bind closet id `storage_closet_13e4` to `fuse-wire-pack` spawn. Until then: static world pickup at closet transform.

4. **Run walk collision:** `pnpm content:gen-walk-aabbs` after floor JSON lands ([content-building.md](content-building.md)).

### POI ids (stable for code + editor)

| Id | Purpose |
|----|---------|
| `storage_13_elevator_landing_w` | Player spawn on extract arrival |
| `storage_13_corridor_collapse` | Blocker mesh + detour nav |
| `storage_closet_13e4` | Quest interact / loot |
| `storage_13_duct_tape_optional` | Bonus pickup |
| `storage_13_chalk_arrow_e4` | Decal or sign prop |

### Dressing props (existing Meshy / catalog family)

- `fuse-box`, shelving pallets, cardboard stacks, `slop-bucket`, pipe runs  
- **Not** full apartment furniture in corridor spine  
- Chalk text as decal or texture-only — **no legible UI fonts in world**, stencil blocks OK

### Radio trigger (client stub)

- Event: `tutorial_radio_fuse_wire` on **first morning after spawn** (new save)
- Condition: `!tutorial_fuse_wire_complete` && no other active work order — **not** `world_day == 1`
- Source: apartment radio prop interact or auto timer after idle
- On complete: set `tutorial_fuse_wire_complete`; queue **orientation O1 (farm)** — do not enable random extraction pools yet

---

## Fun hypotheses (what this slice tests)

After playtesting, answer honestly:

1. **Commitment** — Does taking the elevator down feel like leaving safety?
2. **Target clarity** — Is `13-E-4` findable without a minimap?
3. **Tension curve** — Is one detour enough friction, or too empty?
4. **Return relief** — Does nineteen feel warmer when doors open?
5. **Item discipline** — Does one required pack + one optional tape feel better than scatter loot?
6. **Radio as quest board** — Does Rada’s call feel better than a UI marker?

If 1–4 land, the loop is worth building out. If not, fix floor 13 navigation/lighting before adding combat or basement.

---

## What comes next (not this slice)

**Phase 2 — orientation** (scripted, one at a time; player-paced):

| Step | Hub | Draft beat (author later) |
|------|-----|---------------------------|
| **O1** | Farm **18** | Sonja shift — substrate bay, ration counter, “balcony is garnish” |
| **O2** | Kotlovnica **−1** | Rada hand-off — fuse wire pickup, bleed a valve, read a gauge |
| **O3** | Militia **17** | Checkpoint walk-through — contracts exist, sixteen is hostile, no looting |

**Phase 3 — after `orientation_complete`:** random extraction pool on floors **16…1** (patrol lamp, UV bulb, flooded valve, etc.) plus hub maintenance rolls. Lore / hardcore arcs gated separately (**TBD**).

---

## Related docs

- [building-floors.md](building-floors.md) — floor 13 loot profile  
- [items-and-equipment-catalog.md](items-and-equipment-catalog.md) — `fuse-wire-pack`, `duct-tape-roll`  
- [content/references/meshy/README.md](../content/references/meshy/README.md) — prop prompts  
- [content-building.md](content-building.md) — collision regen after floor edit
