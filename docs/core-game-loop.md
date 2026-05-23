# The Mammoth — Core Game Loop Design

Design brief for the core player fantasy, daily structure, floors, orders, extraction, apartment life, and progression. **Single-player, client-authoritative** for now; co-op may come later — do not design around co-op yet.

**Design anchor:** *The Mammoth is about keeping a tiny island of civilization alive inside a sealed socialist megablock by descending into the dead floors below, retrieving what still matters, and returning home before the building takes more than you can carry.*

---

## Project context

The Mammoth is a WebGPU-only Three.js game using SpacetimeDB as the simulation backbone.

The game is set almost entirely inside a late Yugoslav socialist megablock inspired by Zagreb’s Mamutica. The building is called The Mammoth.

The outside world has been overtaken by a global fungal outbreak. Looking out the apartment windows reveals a massive fungal forest surrounding the building. The game world is the building itself.

The Mammoth has:

- 20 main floors total
- A top inhabited civilian floor
- A fungal farm / communal agriculture floor below it
- A militia / security floor below that
- Many abandoned hostile residential and converted floors below
- Basement geothermal / boiler / generator levels underneath the building

The player lives on the top inhabited floor in a corner apartment.

The game is a first-person immersive survival extraction roguelike with farming, maintenance, apartment survival, NPC routines, quests, and building simulation.

The core fantasy:

> You are a utility runner and maintenance worker living in a sealed megablock civilization. You descend into the dead lower floors to recover parts, food, tools, medicine, and materials needed to keep yourself and the building alive.

The player is not a chosen hero.

The player is employed.

They are one of the younger, mobile, technically useful people trusted to move between the inhabited civic layer, the fungal farm, the militia frontier, and the utility systems below.

---

## Core design pillar

The building is not a dungeon to conquer.

The building is a hostile vertical ecosystem that people survive through routine, labor, knowledge, and risk.

The player does not permanently reclaim or improve the lower floors.

Progression happens through:

- knowledge
- access
- equipment
- trust
- apartment stability
- better tools
- better carrying capacity
- better survival preparation
- deeper familiarity with floor layouts
- stronger relationships with NPCs
- better ability to choose which risks are worth taking

The lower floors remain dangerous. They do not become safe zones over time.

**The player improves, not the dungeon.**

---

## Core loop summary

The basic loop:

1. Wake up in the apartment
2. Prepare for the day
3. Check food, water, storage, equipment, and apartment systems
4. Receive possible orders, rumors, or work requests
5. Choose what kind of day to have
6. Descend by elevator or stairs
7. Complete a targeted run, shift, repair, or quest
8. Extract with whatever can be carried
9. Return to apartment
10. Store, cook, process, repair, trade, or prepare items
11. Sleep to advance the day
12. Building state updates

The key loop is not:

> clear floor → loot everything → repeat

The key loop is:

> prepare → descend with intention → retrieve what matters → survive the return → process and recover at home

---

## Daily structure

Each day should allow several different player choices.

The player should not always be forced into combat or deep runs.

### Safe productive day

- Work a maintenance shift
- Help on the fungal farm
- Cook food
- Organize storage
- Repair gear
- Trade with NPCs
- Process materials
- Sleep early

### Medium-risk scavenging day

- Visit a known floor
- Target one or two rooms
- Retrieve needed materials
- Avoid enemies
- Return before night or exhaustion

### Quest day

- Fulfill an NPC request
- Retrieve a specific object
- Investigate a rumor
- Repair a known system
- Explore a newly accessible area

### Deep expedition day

- Pack food, water, medicine, light, filters, tools, weapons
- Descend farther than usual
- Target valuable infrastructure, rare materials, weapons, medicine, or lore
- Risk losing supplies or dying

### Recovery day

- Stay mostly upstairs
- Eat
- Sleep
- Clean up
- Work light tasks
- Let passive apartment processing finish
- Avoid pushing exhaustion

---

## Player role

The player should be a **Utility Runner**.

This role combines:

- maintenance worker
- courier
- scavenger
- repair technician
- expedition laborer
- community worker

The player is trusted enough to access building systems, but still junior or expendable enough to be sent into danger.

The player’s work sits between several factions:

- engineers / utility workers
- fungal farm maintainers
- militia / security floor
- civilian residents
- personal NPC relationships

This gives natural access to quests, work orders, rumors, and trade.

---

## Floor structure

### Top floor: civilian layer

The only fully inhabited residential floor.

This is where the player lives.

This floor contains:

- player apartment
- NPC apartments
- social routines
- trade
- gossip
- personal quests
- community politics
- food distribution
- interpersonal tension
- civilian life

This floor should feel safe, cramped, warm, tense, and human.

Not perfect.

But civilized.

It is the emotional anchor of the game.

### Floor below top: fungal farm layer

The communal agriculture floor.

This is not the player’s private farm.

It is a shared food-production system built into a former apartment floor.

Walls have been knocked through. Apartments have been converted into:

- grow chambers
- substrate rooms
- spore storage
- misting corridors
- drying racks
- compost bays
- water tanks
- sterile prep rooms
- nutrient mixing areas
- quarantine areas
- tool cages
- ration counters

Everyone is expected to contribute somehow.

The player may have an assigned grow bay or work section, but this is stewardship, not private ownership.

**Plot progression:** the player’s corner flat includes a small **balcony grow-op** (see [Player apartment](#player-apartment)) — enough to learn planting, cover garnish and soup extras, and buffer bad days. It is **not** a substitute for the farm floor. After contributing labor and earning farm trust (or trading work chits / food vouchers), the player can **rent or buy a grow-bay plot** on the communal floor — significantly higher yield, access to bulk substrate and spore stock, and tie-in to ration quotas. The balcony stays useful for fast herbs and emergency greens; the farm plot is where real food security comes from.

This layer supports:

- food production
- fungal materials
- medicinal cultures
- bandages
- armor materials
- crafting materials
- ration systems
- community labor

This floor should feel warm, humid, earthy, chemical, and precarious.

It should not feel cute or cozy.

It is survival agriculture.

### Floor below fungal farm: militia / security layer

This is the security frontier.

It contains:

- barricaded apartments
- weapons storage
- militia bunks
- shooting practice areas
- observation posts
- ammo benches
- captured infected holding room, optional
- medical station
- patrol planning room
- stairwell checkpoints
- elevator security

This layer introduces combat, weapons, and dangerous contracts.

The militia is not necessarily evil, but they control violence.

They may become politically tense over time.

The player can receive optional higher-risk jobs here:

- recover ammo
- scout lower floors
- check barricades
- retrieve patrol gear
- restore comms
- escort someone
- investigate movement
- recover a weapon cache

The militia is not the player’s main employer.

They are a dangerous source of opportunity.

### Abandoned floors

These are the main extraction zones.

They include roughly 16 floors between the security frontier and the ground level.

They are not all identical apartment floors.

Some are residential. Others were converted during the sealed-building civilization period.

Potential floor themes:

- abandoned residential floor
- flooded residential floor
- school / daycare floor
- clinic / medical floor
- grocery / ration storage floor
- failed militia outpost
- maintenance-heavy utility floor
- collapsed floor
- religious / elderly resident floor
- workshop floor
- laundry / textile floor
- archive / records floor
- storage floor
- quarantine floor
- black-market floor
- fungus-bloom floor

Each floor should have its own identity, mood, navigation problem, loot profile, and hazard style.

The player should not be expected to clear entire floors.

Runs should target specific rooms, systems, or objects.

### Basement geothermal / boiler / generator levels

These levels are part of the player’s work life and the building’s lore.

**Important clarification:** The geothermal / boiler / generator levels are **not** combat dungeons, especially not early.

They are maintained, defended, and contained.

They do not initially have fungal infestation or enemies.

The player works there.

These levels explain why the building still has:

- electricity
- heat
- working radiators
- elevators
- water circulation
- grow lights
- ventilation
- sterilization systems

The atmosphere should be:

- industrial
- sacred
- professional
- loud
- warm
- old
- procedural
- dangerous in a mechanical way

Not overrun.

Threats here are mechanical, not monster-based:

- steam leaks
- pressure instability
- electrical faults
- valve failures
- turbine load issues
- flooding
- toxic gas
- power routing problems
- elevator diagnostics
- pump failures

The engineers here should feel like a professional caste. Practical, tired, and essential.

They provide:

- formal work orders
- tutorials
- maintenance tasks
- lore
- access keys
- utility permissions
- elevator override knowledge
- building schematics
- repair training

Late in the game, fungal contamination or sabotage could threaten these levels, but that should feel like a major escalation because the player has learned these areas are supposed to be safe and protected.

---

## Where orders come from

Do not use a generic quest board as the main interface.

Orders should come from social and physical hubs.

### 1. Maintenance / geothermal hub

Formal work orders.

Examples:

- replace a relay
- retrieve copper tubing
- inspect a pressure fault
- bring back insulation foam
- diagnose elevator routing
- find replacement fuses
- recover tools from lower utility rooms
- repair a broken pump
- check a sensor cable
- restore power to a lower section temporarily

These orders support:

- heat
- power
- water
- elevators
- ventilation
- building stability

This is the player’s official job.

### 2. Fungal farm hub

Communal food and material tasks.

Examples:

- collect substrate
- find UV bulbs
- retrieve clean containers
- bring alcohol or sterilizer
- find replacement tubing
- recover grow lamps
- locate old nutrient bags
- gather paper/cardboard/wood/fiber
- collect fungal samples
- repair humidifier units
- process harvested material

These support:

- food
- medicine
- bandages
- fungal leather
- armor materials
- trade goods
- rations

### 3. Militia floor

Optional combat/security contracts.

Examples:

- scout a floor
- recover patrol gear
- retrieve ammo
- secure a stairwell temporarily
- investigate noise
- find a missing guard
- escort a worker
- recover a radio component
- bring back weapon parts

These should pay better but carry more danger.

Rewards may include:

- ammunition
- weapon access
- armor
- security permissions
- information
- militia trust

### 4. NPC apartments

Personal quests.

Examples:

- retrieve a family object
- find medicine from an old apartment
- recover a VHS tape
- check a sealed room
- find a missing person’s note
- bring back religious items
- recover photos
- retrieve old tools
- locate pet/fish supplies
- investigate a rumor

These deepen the world and relationships.

They should not always have the best material reward.

Their value is emotional, social, or narrative.

### 5. Radio / TV / rumors

Soft leads.

Examples:

- strange signal from a lower floor
- old broadcast repeating
- militia chatter
- farm warning
- engineer callout
- elevator fault alert
- someone heard knocking
- a floor light came back on
- outside signal from the fungal forest

These create exploration hooks.

---

## Run design

A run should have a concrete target.

Examples:

- retrieve a fish tank pump
- recover antibiotics
- bring back a motor
- find a pressure gauge
- get copper wire
- gather substrate
- locate old canned food
- recover a dead patrol’s key
- search a school science room
- get batteries
- find VHS tapes
- bring back an intact radiator valve
- retrieve clean cloth
- get ammo
- collect fungal sample
- restore temporary power
- open a sealed utility closet

The run should not require clearing every room.

The player should be able to go in, complete the objective, grab opportunistic loot, and leave.

---

## Extraction mechanics

Extraction should be about logistics.

The player cannot carry everything.

Use limitations such as:

- weight
- inventory slots
- item bulk
- two-hand carry
- stamina drain
- noise from carried items
- reduced weapon access while carrying large items
- slower movement
- limited backpack space
- need for carts or bags later
- elevator dependency for heavy objects

This creates decisions.

Example:

The player finds:

- a motor
- medicine case
- ammo box
- grow light

They cannot safely bring all of it home.

They must choose.

**That choice is the heart of extraction.**

---

## Inventory philosophy

Avoid vacuum-looting.

Items should feel physical and valuable.

### Food

- ration packs
- fungal loaves
- dried mushrooms
- canned goods
- fish
- soup ingredients
- tea
- sugar
- salt

### Water

- bottles
- filter cartridges
- ceramic filters
- water tank parts
- tubing
- canisters

### Medicine

- bandages
- alcohol
- antibiotics
- painkillers
- antifungal medication
- splints
- inhalers
- disinfectant

### Maintenance

- fuses
- wire
- copper tubing
- valves
- pressure gauges
- pump parts
- fan motors
- sealant
- insulation foam
- batteries
- bulbs
- filters

### Farm materials

- substrate
- clean containers
- UV bulbs
- nutrient powder
- spore samples
- fungal cultures
- compost matter
- drying mesh
- grow trays

### Combat

- ammunition
- knives
- pistols
- blunt weapons
- weapon parts
- armor plates
- fungal armor material
- helmets
- masks

### Domestic

- kettle
- lamp
- aquarium parts
- fish food
- books
- rugs
- curtains
- photos
- VHS tapes
- tools
- dishes

---

## Player apartment

The apartment is the player’s home base.

It is not heavy customization.

It is a dense, functional, authored survival space.

The player should not freely place furniture like The Sims.

Instead, the apartment contains fixed stations and storage zones that become familiar through use.

The apartment is where the player:

- wakes up
- sleeps
- respawns
- stores items
- cooks
- eats
- drinks
- changes clothes
- checks equipment
- recovers
- processes small materials
- tends the balcony grow-op
- watches TV
- listens to radio
- looks out at the fungal forest
- prepares for runs
- returns after runs
- unloads loot
- advances the day

The apartment should feel like returning to safety.

**Returning home is itself a reward.**

### Existing apartment objects

Already authored:

- bed
- footlocker
- wardrobe
- stove
- bathroom
- toilet
- laundry
- sink
- radiator
- wall rug
- floor rug
- sofa
- TV
- TV cabinet
- family portrait
- dining table
- ashtray
- used cigarettes
- old bottle of rakija
- empty cigarette cartons
- kitchen cabinets
- fridge
- **balcony grow-op** — eight grow trays on the corner balcony, lit by two hanging LED panels (`grow-tray.glb`, `light-grow-op.glb`; already authored in the owned apartment template)
- drying rack

The fridge stores perishables and temperature-sensitive items:

- cooked food
- fish
- medicine
- fungal cultures, possibly
- ration ingredients

The footlocker stores miscellaneous general items.

The wardrobe stores clothing and wearable gear.

The bed allows:

- sleep
- respawn
- advancing to next day
- recovering stamina/health depending on food, warmth, and condition

### Recommended additional apartment stations

#### Water tank / ceramic filter

Stores drinkable water.

Can be filled from building water systems or manually.

Supports:

- drinking
- cooking
- cleaning
- fish tank
- balcony grow trays
- medicine prep

Possible states:

- full
- low
- dirty
- filtered
- contaminated
- broken filter

#### Aquarium / fish tank

A small domestic ecosystem.

The player can:

- feed fish
- clean water
- collect fish waste
- maintain pump/filter
- breed small fish slowly
- use fish waste as fertilizer

Purpose:

- food, rarely
- fertilizer
- emotional attachment
- apartment life
- trade with fish-keeping NPC
- visible decay if neglected

No explicit happiness meter.

If neglected:

- water clouds
- fish slow down
- algae grows
- pump fails
- fish die eventually

#### Balcony grow-op

The player’s **private starter farm** — not a separate floor, not a menu screen. Eight fixed grow trays on the corner balcony, under two cool-white LED panels. Visible from the living room; part of the flat’s identity.

**Role in progression**

- **Early game:** learn planting, watering, light cycles, harvest, and spoilage without leaving home.
- **Mid game:** supplements meals and crafting (herbs for soup, tea, bandage prep) while the player earns access to a **communal grow-bay plot** downstairs.
- **Late game:** balcony stays worth tending for fast-turn crops and backup greens; the farm plot carries bulk production and ration credit.

**Yield (design target)**

Balcony output should feel **meaningful but modest** — roughly an order of magnitude below a tended communal grow bay. A full balcony might cover garnish, occasional soup boosts, and small hunger relief, not reliable daily calories. Neglect wilts trays quickly; good care returns a steady trickle, not a harvest festival.

**Tray inputs**

- water (apartment filter / canteen)
- light (authored panels; optional battery-bank tie-in later)
- substrate (compost bucket, fish waste, scavenged fiber — low-grade is fine)
- seeds, cuttings, or culture spores (scavenged, traded, or issued by the farm)

**Plantable crops (starter catalog)**

Each tray holds one crop at a time. Growth times are in in-game days; sleep advances trays (see [Sleep / day advancement](#sleep--day-advancement)). All **`def_id`** values live in `content/items/catalog/balcony_grow_op.json` (server + client catalog).

| Crop (Balkan) | Plant `def_id` | Harvest `def_id` | Days | Primary use |
|---------------|----------------|------------------|------|-------------|
| **Parsley** (peršin) | `parsley-seeds` | `fresh-parsley` | 4–5 | garnish, soup, civilian trade |
| **Dill** (kopar) | `dill-seeds` | `fresh-dill` | 5–6 | fish, pickles, potato soup |
| **Paprika** (feferoni) | `paprika-seedlings` | `fresh-paprika` | 7–9 | ajvar and stew; modest eat raw |
| **Green onion** (mladi luk) | `green-onion-sets` | `fresh-green-onion` | 4–5 | soup and ćevap garnish |
| **Radish sprouts** (klica repe) | `radish-sprout-seeds` | `radish-sprouts` | 2–3 | fast emergency greens |
| **Oyster mushroom** (bukovačica) | `oyster-mushroom-spore` | `fresh-oyster-mushroom` | 7–10 | cook fresh for soup |
| **Scented geranium** (pelargonija) | `scented-geranium-cuttings` | `scented-geranium-leaves` | 6–8 | **čaj** — balcony tea herb |

Tray substrate item: `balcony-grow-substrate` (compost bucket / fish waste / scavenged fiber).

**Starter footlocker pack** (granted once on first connect): normal footlocker stash rows (`ItemLocation::Stash` on the footlocker's decor stash key) — 6× substrate, plus seed packets for parsley, dill, radish sprouts, green onion, and scented geranium.

**Not on the balcony (farm floor only):** bulk mycelium beds, ration-grade fungal loaves, armor-fiber cultures, spore quarantine strains, and anything that needs misting corridors or sterile prep rooms.

**Outputs tie to existing inventory buckets:** soup ingredients, tea (pelargonija čaj), and fridge/stove consumables — not a parallel item taxonomy.

This supports the player but does not replace the communal fungal farm.

#### Drying rack

Used for:

- drying mushrooms
- drying herbs
- drying cloth
- drying bandages
- drying fungal leather strips
- drying clothes

Works overnight.

Sleep advances processing.

#### Compost bucket

Turns organic waste into substrate.

Inputs:

- spoiled food
- paper
- fungus scraps
- plant matter
- fish waste
- cardboard

Outputs:

- low-grade substrate
- fertilizer material

If neglected:

- smell
- flies
- contamination risk

#### Tool wall / workbench

Small apartment repair station.

Used for:

- repairing tools
- repairing flashlights
- repairing small electronics
- preparing filters
- assembling simple items
- maintaining weapons lightly
- sorting parts

Do not make this replace the bigger engineering/farm systems.

Apartment crafting should be small-scale.

Industrial crafting belongs to work areas.

#### Medical shelf / drawer

Stores:

- bandages
- disinfectant
- antibiotics
- painkillers
- antifungal medication
- inhalers
- splints

Can be visually stocked.

#### Pantry shelf

Stores non-perishable food.

Examples:

- ration packs
- dried mushrooms
- crackers
- canned goods
- salt
- tea
- sugar
- preserved fish

#### Ammo tin / weapon locker

Separate weapons from miscellaneous storage if possible.

Stores:

- ammunition
- pistol
- knife
- baton
- crowbar
- weapon parts
- cleaning kit

This makes the apartment feel more grounded than putting everything into one footlocker.

#### Key hook / map board

Near the door.

Used for:

- keys
- access cards
- notes
- floor map
- work orders
- marked objectives
- rumors
- NPC requests

Good for making the apartment feel connected to the wider building.

#### Battery bank

Optional upgrade.

Stores electricity for:

- fridge
- radio
- aquarium pump
- grow light
- apartment lamp
- emergency light

Could be charged through building power or scavenged batteries.

#### Radio

Very important.

Used for:

- work calls
- engineer chatter
- militia chatter
- farm announcements
- rumors
- weather/static
- story events
- strange signals later

Should be diegetic.

No floating notifications if avoidable.

#### Curtains / window shutters

Two large corner windows matter a lot.

The player can:

- open curtains
- close curtains
- look outside
- watch fungal forest
- see weather/light changes
- see distant movement
- smoke by the window
- use windows as emotional tone anchor

Closing curtains can be mostly atmospheric, but may also reduce night light, drafts, or stress-like effects without showing a meter.

---

## Apartment rituals

Daily apartment interactions should be small, physical, and repeatable.

Examples:

- wake up
- check fridge
- eat food
- drink water
- glance at balcony trays (optional first harvest tutorial hook)
- fill canteen
- check footlocker
- equip clothing from wardrobe
- take weapon from locker
- load ammo
- pack bag
- check map board
- listen to radio
- cook soup
- boil water
- feed fish
- clean fish tank
- collect fish waste
- water balcony grow trays
- harvest peršin / klica repe / bukovačica
- start drying mushrooms or herbs
- empty compost
- repair flashlight
- store loot
- place medicine in fridge
- watch TV/VHS
- close curtains
- sleep

These rituals are the emotional spine of the game.

The apartment should not be a menu.

**It should be a place.**

---

## Apartment decay without meters

There should be no visible apartment happiness bar.

The player notices the apartment improving or decaying visually.

If neglected for days:

- fish tank water clouds
- fish die eventually
- balcony grow trays wilt
- compost smells
- flies appear
- fridge contents spoil if power fails
- dirty dishes accumulate
- windows fog
- filters darken
- air feels damp
- bed looks damp
- curtains flap from draft
- mold appears near vent
- radio signal weakens
- food runs low
- clutter becomes disorderly

Do not make this brutally punishing day-to-day.

The player should feel encouraged to progress, not harassed by chores.

Only total negligence over multiple days should cause major decline.

Possible soft failure state:

If the player ignores food, water, apartment stability, and work obligations for too long, the day update can eventually imply collapse:

- sickness
- starvation
- fungal contamination
- forced intervention by NPCs
- death in sleep
- building emergency

But this should be rare and avoidable.

---

## Sleep / day advancement

Sleeping advances the game state.

When the player sleeps:

- stamina recovers
- health may recover depending on food/warmth
- passive processing completes
- balcony grow trays advance
- fish produce waste
- drying rack progresses
- compost progresses
- fridge preserves or spoils items depending on power
- NPC schedules advance
- building systems update
- work orders update
- rumors change
- active crises may worsen if ignored
- weather/light changes
- some floor conditions update

This is similar to Stardew Valley structurally, but grounded in a first-person survival setting.

The player can stay up late, but fatigue and stamina penalties should matter.

---

## Player stats

The player has:

- health
- thirst
- stamina

Possible additional hidden or soft systems:

- exhaustion
- contamination exposure
- cold/warmth
- hunger/food quality
- sickness risk

Avoid too many visible meters.

Health, thirst, and stamina are enough for core play.

Stamina declines from:

- running
- combat
- carrying weight
- heavy extraction items
- repair tasks
- farming tasks
- climbing stairs
- working late
- poor sleep

Stamina recovers through:

- sleep
- food
- water
- warmth
- rest
- better bed
- cooked meals
- tea/coffee/stimulants, if included

Maximum stamina may improve through progression, food quality, equipment, or story milestones.

---

## Currency / economy

Avoid clean modern money.

Possible currency systems:

### Ration credits

Issued by food/farm administration.

Used for food, farm materials, and community goods.

### Ammunition

Used as practical barter, especially with militia.

### Work chits

Stamped proof of labor contribution.

Used for:

- food priority
- equipment requests
- access permissions
- repair favors

### Barter

Direct item exchange.

Examples:

- medicine for filters
- cigarettes for information
- batteries for food
- fish for cloth
- ammo for tools

**Best approach:** Use a mixed economy.

Different groups value different things.

Engineers value parts.

Farmers value substrate and sterilizer.

Militia values ammo and weapons.

Civilians value food, medicine, cigarettes, comfort objects.

---

## Fungal farm gameplay

The fungal farm floor is where real farming and biological production happen.

The player can:

- work shifts
- plant fungal cultures
- maintain grow beds
- adjust humidity
- process substrate
- harvest mycelium
- dry materials
- make bandage fibers
- grow armor material
- grow medicinal cultures
- fulfill ration quotas
- experiment with strains
- accept farm tasks

Farm outputs:

- food
- ration packs
- fungal leather
- bandage material
- medicinal compounds
- armor padding
- trade goods
- compost
- spores
- adhesives
- insulation material

Inputs:

- substrate
- water
- heat
- clean containers
- spores
- UV bulbs
- sterilizer
- tubing
- nutrient powder
- tools

The fungal farm is productive but communal.

The player’s **balcony grow-op** is personal, fixed (eight trays), and low-yield — a tutorial and supplement, not food security.

The farm floor is social, large-scale, and tied to the building economy. **Grow-bay plot access** (rent or purchase with work chits / farm trust) is the step up from balcony gardening.

---

## Basement / maintenance gameplay

The player’s official work comes from the geothermal and maintenance division.

Early game tutorial tasks should happen here.

Possible tutorial tasks:

- check a pressure gauge
- replace a fuse
- close/open a valve
- carry a tool to an engineer
- repair a small pump
- inspect a generator panel
- reroute power to elevator
- read a maintenance log
- descend through safe service corridor
- learn how work orders function

No enemies early.

Use this space to teach:

- interaction system
- carrying items
- repair mechanics
- stamina cost of work
- inventory
- access control
- elevators
- day schedule
- orders
- building dependency

The basement is safe because people work hard to keep it safe.

Late-game threat to basement should feel catastrophic.

---

## Lower floor gameplay

The abandoned floors are not linear clearable levels.

They are authored hostile environments used for repeated targeted runs.

Each floor can contain:

- long hallway
- apartment units on both sides
- locked doors
- collapsed passages
- utility rooms
- stairwell access
- elevator access
- shortcuts
- hazards
- themed rooms
- enemies
- loot clusters
- secrets
- quest targets

Avoid requiring the player to go door-to-door clearing everything.

Instead, use:

- work orders
- rumors
- maps
- keys
- known room numbers
- environmental clues
- NPC hints

to send them to specific targets.

Examples:

- apartment 1206 has an old pump
- school science room has alcohol
- grocery freezer has coolant
- clinic storage has antibiotics
- utility closet 9B has copper wire
- old militia outpost has ammunition
- flooded floor has intact radiators
- tenant apartment has family item
- collapsed laundry has cloth rolls

---

## Floor conditions

The lower floors are persistent and authored, but daily conditions can change.

Do not permanently improve floors.

Do use temporary conditions.

Examples:

- power on/off
- hallway flooded
- elevator unavailable
- stairwell blocked
- fungal bloom active
- spore density high
- militia patrol present
- infected migration
- door jammed
- lights flickering
- gas leak
- steam leak
- water level changed
- noise source attracting enemies
- temporary shortcut open
- temporary hazard active

This keeps floors alive without turning them into procedural dungeons.

---

## Enemy philosophy

Enemies are pressure, not the main reward.

Avoid making combat the dominant loop.

The player should often avoid, distract, trap, or bypass enemies.

Combat should be:

- loud
- risky
- stamina-costly
- resource-costly
- sometimes necessary
- sometimes foolish

Enemies should create extraction tension.

The question should be:

> Can I get the thing and get back alive?

Not:

> How many enemies can I farm?

---

## Linear hallway problem

Because the building is a long corridor with units on both sides, avoid turning every floor into a straight sweep.

Use layout variation:

- locked midpoint doors
- collapsed sections
- blocked hallways
- apartments connected through broken walls
- balconies or exterior ledges
- utility shafts
- service corridors
- stairwell detours
- elevator lobby choke points
- maintenance closets
- alternate routes through bathrooms/kitchens
- flooded sections forcing route choices
- darkness hiding side paths
- noise hazards
- doors that can be barricaded behind the player

Use objective placement to avoid full hallway clearing.

Target one side, one room, one utility area, one shortcut, one clue.

---

## Progression

Progression should not be floor clearing.

Progression should be:

### Knowledge

- floor layout memory
- safe routes
- dangerous rooms
- enemy habits
- loot tendencies
- shortcuts
- hidden access

### Access

- keys
- badges
- codes
- elevator permissions
- stairwell permissions
- maintenance shafts
- locked utility rooms
- militia clearance

### Equipment

- better backpack
- better flashlight
- gas mask
- filters
- weapons
- armor
- tools
- boots
- gloves
- crowbar
- lockpick
- repair kit

### Apartment capability

- fridge stocked
- water tank full
- fish tank producing fertilizer
- balcony grow-op producing herbs / sprouts / mushrooms
- drying rack processing materials
- storage organized
- weapon locker stocked
- medical shelf stocked
- battery bank charged

### Social trust

- engineer trust
- farm trust
- militia trust
- civilian trust
- NPC relationship quests

### Physical capacity

- stamina
- carrying capacity
- sleep recovery
- food quality
- tool efficiency

The player becomes more capable without the building becoming safe.

---

## First hour suggested flow

### Day 1

Wake in apartment.

Tutorial apartment interactions:

- get out of bed
- open footlocker
- check wardrobe
- check fridge
- eat/drink
- check stove
- leave apartment

Meet hallway NPC.

Go to maintenance shift in basement/geothermal level.

Tutorial maintenance:

- replace fuse
- inspect valve
- carry part
- talk to engineer
- learn building depends on geothermal systems

Receive first low-risk work order:

- retrieve small part from a nearby upper abandoned floor or storage area

Return home.

Store item.

Cook simple meal.

Sleep.

Day advances.

### Day 2

Wake.

Radio mentions fungal farm needs help.

Go to fungal farm floor.

Learn:

- food ration system
- communal labor
- substrate
- grow beds and **grow-bay plot rental**
- drying racks
- farm requests

Receive first scavenging run:

- retrieve clean containers / paper substrate / UV bulb from an abandoned floor

Player chooses whether to do it immediately.

### Day 3

Militia floor introduction.

Learn:

- combat basics
- danger below
- weapons are expensive
- ammunition matters
- violence is political

Receive optional combat-adjacent task.

---

## Tone

The game should feel:

- grounded
- damp
- lived-in
- post-collapse but organized
- Eastern European
- late socialist
- industrial
- fungal
- domestic
- oppressive
- human

Avoid:

- generic zombie shooter tone
- clean sci-fi UI
- cartoon farming
- heroic base reclamation
- MMO quest board feel
- endless random loot
- rooms that exist only as combat arenas

---

## Core player feeling

The player should feel:

- attached to their apartment
- responsible for work
- uneasy about the lower floors
- curious about the building’s past
- dependent on NPCs
- useful but vulnerable
- increasingly competent
- never fully safe
- relieved to return home
