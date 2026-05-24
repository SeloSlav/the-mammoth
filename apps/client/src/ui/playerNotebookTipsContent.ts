/** Diegetic notebook — mechanics-accurate reference pages + first-person diary (Andrija Ivanković). */

export type PlayerNotebookSectionKind = "reference" | "diary";

export type PlayerNotebookSection = {
  kind: PlayerNotebookSectionKind;
  heading: string;
  /** Diary stamp — deliberately vague; apartment ephemera still say 1988. */
  dateLabel?: string;
  lines: readonly string[];
};

export const NOTEBOOK_OWNER = {
  fullName: "Andrija Ivanković",
  initials: "A.I.",
  dateLabel: "17. ožujka — godina?",
  dateNote:
    "Hall calendar frozen on 1988. Receipt in the wardrobe pocket ditto. I mark days on my thumb, not on paper.",
} as const;

export const PLAYER_NOTEBOOK_PAGES: readonly PlayerNotebookSection[] = [
  {
    kind: "reference",
    heading: "Inventory & hotbar (Tab)",
    lines: [
      "Tab opens pockets + hotbar. Drag between slots, stash panels, and the world.",
      "With a stash open: hold H and sweep the mouse over slots — pockets/hotbar deposit, stash slots withdraw.",
      "LMB drag = whole stack. MMB drag = half stack (stackables only). RMB drag = one item.",
      "RMB click (no drag) = quick-transfer to hotbar or open stash.",
      "Drop same item onto same item = stacks merge up to the stack limit.",
      "Hotbar: click a slot to select. Click again on food/drink/smokes to use.",
    ],
  },
  {
    kind: "reference",
    heading: "Basics",
    lines: [
      "E = use what you're looking at. Tab = inventory + hotbar.",
      "Bed: lie down first, then E again to sleep. Skips the night, refills food/water/health.",
      "Sleep advances balcony crops one day, drains tray water, applies tray compost, and refills the kitchen tank (~20 L max).",
      "Plan water, compost, and grow lights before you crash.",
    ],
  },
  {
    kind: "reference",
    heading: "This flat",
    lines: [
      "Footlocker = junk/tools/weapons. Wardrobe = clothes/wearables only. Fridge = perishables. Stove = cook stash.",
      "Everything opens with E when you're close enough — same dock as your pockets.",
      "Balcony: eight trays (four slots each), two LED panels, drying rack, corner windows to the forest.",
    ],
  },
  {
    kind: "reference",
    heading: "Ceramic filter / water tank",
    lines: [
      "Tank in the kitchen refills when you sleep (~20 L max). Open tank stash with E, slot an empty water bottle, hit Fill bottle.",
      "Filled bottle on hotbar: drink from hotbar, or RMB-aim at balcony soil to pour (~0.35 L puddle).",
      "Trays drink from pours and lose ~0.5 L each night you sleep. Dry two nights in a row wilts crops (unless LEDs stay on).",
    ],
  },
  {
    kind: "reference",
    heading: "Fish filter → tank loop",
    lines: [
      "Look at the filter unit beside the tank and press E — same stash dock as the kitchen tank.",
      "Filter must be linked to your main fish tank in the apartment editor (one filter per tank).",
      "Top off tank water or rinse the filter using a water bottle on hotbar slot 1.",
      "Filter sponge cartridge in the maintenance slot restores filter health to full.",
      "Feed the main fish tank before sleep; compost yield scales with tank water and filter health.",
    ],
  },
  {
    kind: "reference",
    heading: "Fish tank → fertilizer",
    lines: [
      "Main tank (not castle/sand props): E opens the feed slot — drop any food item before you sleep.",
      "Overnight the fish digest scraps; you may find tray compost in the same slot. Take it out, then feed again.",
      "Better food tends to convert more reliably — fish love fresh kopar and mushroom scraps; rakija is a bad idea.",
      "Move compost to a grow-tray stash before the next sleep. One unit feeds all four slots in that tray.",
    ],
  },
  {
    kind: "reference",
    heading: "Balcony grow-op (8 trays, 4 slots each)",
    lines: [
      "LED panels must be ON or nothing grows when you sleep.",
      "Plant: seed on hotbar, aim a free tray slot, LMB. Harvest mature plants with E.",
      "Tray stash (center pick or E on tray): compost slot only. Water + compost before sleep.",
      "Good care = extra food/seeds at harvest (light + water + compost). Radish sprouts = emergency greens (~2–3 nights).",
      "Starter crops: peršin, kopar, feferoni, mladi luk, klica repe, bukovačica, pelargonija (čaj).",
      "Bulk mycelium, ration loaves, armor fiber — farm floor only, not the balcony.",
    ],
  },
  {
    kind: "reference",
    heading: "Moving around the block",
    lines: [
      "Elevator: aim floor panel, click. PR = ground podium. Floors 1–19 = residential labels on the panel.",
      "Corridor doors = E. Apartment doors (stairwell / hallway / unit) = E.",
      "Stairs when the lift is dead, when Red Belts lock a shaft, or when you want fewer eyes on your bag.",
      "Dropped loot on the floor: E to pick up. World spawns say 'collect' — same key.",
    ],
  },
  {
    kind: "reference",
    heading: "Building floors (elevator labels)",
    lines: [
      "19 — top civilian band. Your flat. NPC neighbors, ration line, gossip, trade.",
      "18 — communal fungal farm. Grow bays, substrate, misting corridors, ration counters.",
      "17 — Red Belt / militia frontier. Checkpoints, bunks, ammo benches, patrol contracts.",
      "16 down to 1 — abandoned extraction decks (see diary floor ledger). Hostile, dark, targeted runs only.",
      "PR — ground podium / lobby spine. Elevator hub; service stairs down (not a passenger panel stop).",
      "−1 — kotlovnica / boiler hall. Your rota. Heat distribution, risers, gauges, Rada's work orders.",
      "−2 — pump & switchgear. Circulation pumps, backup gens, elevator power routing. Escort clearance.",
      "−3 — geotermalna dvorana. Brine loops, heat exchangers, turbine hall. Supervised techs only.",
      "−4 — galerija / source intake. Deep wellheads, council-sealed. Late-story access; not early combat.",
    ],
  },
  {
    kind: "reference",
    heading: "Work & utility runs",
    lines: [
      "Official job: geothermal / maintenance — orders from engineers on −1 (fuses, valves, tubing, pumps).",
      "Farm floor: communal tasks — substrate, UV bulbs, containers, humidifiers, harvest help. Pays ration credit / work chits.",
      "Red Belt: optional contracts — scout, ammo, patrol gear, escort. Better pay, more danger, more politics.",
      "Neighbors: personal retrieval — medicine, photos, tools, family objects. Emotional pay, not always material.",
      "Radio / corridor talk: soft leads — faults, knocking, strange lights. Not a quest board; listen and decide.",
      "Run rule: one concrete target in, grab what fits, extract alive. You improve — the lower decks do not.",
    ],
  },
  {
    kind: "reference",
    heading: "Extraction & carry limits",
    lines: [
      "You cannot haul everything. Weight, slots, bulk, and stamina decide what comes home.",
      "Heavy items slow you, tire you, and tie up your hands — choose before you commit.",
      "Example tension: motor vs medicine vs ammo vs grow lamp — pick two, maybe three if you're lucky and quiet.",
      "Elevator helps heavy loads on cleared shafts; stairs when power or politics fail you.",
    ],
  },
  {
    kind: "diary",
    heading: "The photograph",
    dateLabel: "godina nestala — ranije",
    lines: [
      "Marta and the kids on the desk. Summer light on the balcony rail — I remember the year we took it, but I won't write it. Writing years is how you lie to yourself.",
      "Iva's grin. Dario holding the toy crane I welded from scrap. Marta squinting because the sun was honest then.",
      "They are not in the block. Not on nineteen, not in the farm queues, not in the chapel ledger I've checked until the clerks stopped looking at me.",
      "I keep the frame faced toward the wall when the Red Belts do corridor counts. Not because I'm ashamed. Because if they see it they'll ask questions I can't answer without breaking.",
      "Sometimes at night I turn it back. The fungal forest outside doesn't care who we were.",
    ],
  },
  {
    kind: "diary",
    heading: "Before the boilers",
    dateLabel: "siječanj? — 1988 na kutiji alata",
    lines: [
      "Mechanic. That was the word. Garages in the old city, then the county fleet when fuel still meant something outside.",
      "Hands, not proofs. My father Ivan read manuals aloud at the table — thermal buffers, brine loops, words I never spelled — while I learned which wrench turned which valve.",
      "When Mamutica sealed, they didn't want lecturers. They wanted men who could bleed a tank without losing a thumb. I volunteered for the geothermal crews because the list was shorter and the pay was bread that didn't argue.",
      "Two weeks in the belly, two weeks in the flat. Generous on paper. The block eats the other half with waiting — farm call-ups, militia errands, a neighbor who needs a fuse from six.",
      "I'm a utility runner now. Courier when someone's shy, scavenger when the ledger says so, technician when the gauge lies. Not a hero. Employed.",
    ],
  },
  {
    kind: "diary",
    heading: "Floor ledger",
    dateLabel: "veljača — copied from lift panel & crew chalk",
    lines: [
      "I keep elevator labels straight because wrong-floor exits get you shot or spored. Top down:",
      "19 — us. Last inhabited residential deck. Diffusers fake dawn. Radiators tick. Neighbors die quietly and the furnaces keep humming. My corner flat, east wing.",
      "18 — farm deck. Walls knocked through. Misting corridors, substrate bays, drying racks, quarantine cages, Sonja's ration counter. Humid enough to rot boots. Everyone pulls a shift or loses priority.",
      "17 — Red Belt. Welded shutters, militia bunks, ammo benches, observation posts, stairwell checkpoints. Justice chalked on wet plaster. I don't linger.",
      "16 — last normal apartments before the belt; dark, picked over, still smells like cooking grease behind sealed doors.",
      "15 — black-market stalls burned out; ash and melted plastic in the corridor spine.",
      "14 — quarantine paint, sealed units, warnings in three hands; don't open unless ordered.",
      "13 — storage floor; mixed salvage, collapsed shelving, good copper if you know the utility closet numbers.",
      "12 — archive / records; paper stacks, fire smell, slow work, sometimes maps worth more than food.",
      "11 — laundry / textile; drum rot, cloth rolls if floods haven't reached them.",
      "10 — workshop; dead lathes, bench vices, metal stock for trade.",
      "9 — religious / elderly deck; icons, candle stubs, names on doors nobody collects.",
      "8 — partially collapsed; detours, breath dust, not a place for heavy carry.",
      "7 — maintenance-heavy; fuse boxes, pipe rooms, orders often point here.",
      "6 — failed militia outpost; half-rotted barricades, spent shells, bad memories.",
      "5 — grocery / ration storage; empty freezers, vinegar smell, coolant sometimes intact.",
      "4 — clinic / medical; stripped cabinets, antibiotics if luck and light hold.",
      "3 — school / daycare; tiny desks, chalk, science room alcohol on good days.",
      "2 — flooded residential; knee water, quiet splashes, radiator valves worth the cold.",
      "1 — fungus-bloom frontier; spore density highest near ground vents; mask or regret.",
      "PR — ground podium. Lobby spine, kiosk ghosts, elevator hub. Service stairs down — not a passenger stop.",
      "−1 kotlovnica — my rota. Boiler hall, ceramic buffers, riser manifolds, steam that bites, Rada's chalk. Safe if you're trained. Iron and bleach taste.",
      "−2 pumparna — circulation pumps, backup gens, elevator switchgear. I've carried impellers down escorted. Flood trays and arc flash signs. Not solo clearance yet.",
      "−3 dvorana — brine loops, heat exchangers, turbine hum like a church. Supervised only. Father's manuals finally make sense on the gauges there.",
      "−4 galerija — deep intake, wellheads, pre-seal council doors. I've never passed the last hatch. Late shift rumor: wet stone, wrong air. Milica's keys maybe. Not mine. Not yet.",
    ],
  },
  {
    kind: "diary",
    heading: "Dawn on nineteen",
    dateLabel: "17. ožujka — godina?",
    lines: [
      "Wake to radiator knock and the forest glowing through the corner glass — green and wrong, beautiful if you don't breathe it.",
      "Bare feet on the rug. Fridge first: what's left, what's turning. Stove cold until I feed it. Footlocker for whatever today's run needs — crowbar, tape, half a sandwich of pride.",
      "Wardrobe: work coveralls smell of boiler bleach; I hang them back so the good shirt stays for hall gossip.",
      "Balcony pass — trays, LEDs, soil dark or dry. Pour from the bottle if the tank's honest. Fish tank: feed slot, a crust of kopar, watch them dart. Compost to tray stash before I forget.",
      "Water tank glug when I fill a bottle. Map board by the door — engineer chit for a gauge, neighbor's room number underlined twice.",
      "Radio low: farm needs UV bulbs, militia chatter about sixteen, elevator fault on seven. I don't answer unless my name's in it.",
      "Lock up. Hall smells of cabbage and cigarettes. Another day of keeping the island alive.",
    ],
  },
  {
    kind: "diary",
    heading: "Farm shift",
    dateLabel: "ožujak — Sonja counted my hours",
    lines: [
      "Eighteen is not my balcony. Scale hits you in the face — knocked-through walls, mist on the lenses, substrate smell like wet cardboard and life.",
      "They assigned me a bay strip after three shifts of hauling compost buckets. Not ownership — stewardship. If I miss quota, someone else eats my credit.",
      "Morning: scrape spent mycelium, check humidity gauges, swap a dead UV tube someone scavenged from eleven. Afternoon: nutrient mix with gloves that stick, quarantine knock — don't open, just log.",
      "Sonja's ledger is the real kitchen. Fungal loaves, bandage fiber, armor padding cultures — none of that grows on nineteen's ledge.",
      "I came home with ration chits and a paper bag of spore sample for the medic on my hall. Shoes stayed on the mat. The flat still smelled like home, not the farm.",
      "Balcony peršin is garnish. Eighteen is calories. I don't confuse them anymore.",
    ],
  },
  {
    kind: "diary",
    heading: "Red Belt hallway",
    dateLabel: "veljača — contract, not friendship",
    lines: [
      "Seventeen smells of gun oil and stew from the bunk kitchens. Boots on linoleum — always boots.",
      "They didn't ask my name at the checkpoint. They asked what I was carrying and whether I'd been below sixteen without escort.",
      "Contract on the board: scout stairwell on fifteen, bring back a patrol lamp. Pay in nine-millimeter and a stamped chit that keeps farm priority for a week.",
      "I didn't take it. Another runner did. I saw him two days later on nineteen buying pelargonija seeds like a man who'd been paid in time.",
      "Milica's voice on the PA once — discipline, faith, lungs above fifty-five degrees. The rifles on the wall didn't nod. They don't have to.",
      "Violence is political here. Useful if you're desperate. Expensive if you're not.",
    ],
  },
  {
    kind: "diary",
    heading: "Below the hatch",
    dateLabel: "tjedan u roti — PR service stairs",
    lines: [
      "Passenger lift stops at PR. The building's heart starts when you know which door hisses and which matron signed your boot card.",
      "Minus one — kotlovnica. My floor. Painted pipes, ceramic buffers, risers feeding every radiator above. Steam that bites through gloves. Rada's crew move like surgeons who haven't slept since the seal.",
      "My work — read a gauge that lied by two bars, bleed a tank, swap a relay, carry copper tubing to a man who only grunts thanks. Stamina goes quick; the heat steals it. No mold. No knocking. That's the point.",
      "Minus two I've seen twice: pump hall echo, generator smell, elevator switchgear panels that decide who rides and who walks. Escort only. Impeller in both hands, eyes on the floor grating.",
      "Minus three once, supervised — brine smell, turbine hum through the soles, heat exchangers big as bus shells. Father's words at the table finally attached to metal. I wasn't scared. I was small.",
      "Minus four I know only from chalk arrows that stop, and a hatch with no handle on our side. Crew call it galerija. Council call it structural. Late shift rumor: wet stone, wrong air, something breathing in the rock. I chalk neutral and don't say it aloud.",
    ],
  },
  {
    kind: "diary",
    heading: "Four under PR",
    dateLabel: "veljača — copied from crew landing signs",
    lines: [
      "Service stairs don't lie the way elevator panels do. Four landings under the podium. Heat rises; trouble sinks.",
      "−1 distributes what the deep earth gives — hot water to radiators, sterilizer loops toward eighteen, elevator hydraulics if the pumps behave. This is where runners learn. Gauges, valves, burns you deserve.",
      "−2 moves it — circulation pumps, backup generation when the forest eats a line, switchgear that can orphan a whole wing. Orders send me here with an escort and a part number. Mechanical danger, not monsters.",
      "−3 makes it — brine from the wells, exchangers, turbine load, the noise that means nineteen still has light. Senior tech territory. I listen more than I touch.",
      "−4 is where it starts — intake gallery, bore records from before the seal, doors the matrons inherited. Late game, they say. When containment fails or trust opens. Fungus in the bedrock, not the hallways. That breach would mean the island wasn't island anymore.",
      "I work −1. I've glimpsed −2 and −3. −4 is story I haven't earned.",
    ],
  },
  {
    kind: "diary",
    heading: "A run to six",
    dateLabel: "ožujak — order #44",
    lines: [
      "Order said fuse box in utility closet on seven; copper wire from storage on thirteen if I had room. I had room until I didn't.",
      "Elevator to ten, stairs down — Red Belts prefer it that way when someone's carrying metal. Dark past nine; candle stubs still burn on some doors like the dead pay rent.",
      "Six: barricade teeth, spent shells, a locker with patrol lamp still in it. Took the lamp. Left the ammo — noise I couldn't afford.",
      "On thirteen a spool of wire and a child's shoe in the hall. Didn't pick up the shoe. Weight is choices.",
      "Back on nineteen before the diffusers dimmed. Footlocker full. Hands shaking from stairs, not fear. Fear comes later, in the flat, when it's quiet.",
      "Prepare → descend with intention → retrieve what matters → survive the return. Jelena from maintenance says that's the whole game. She's not wrong.",
    ],
  },
  {
    kind: "diary",
    heading: "Plijesn",
    dateLabel: "ožujak — week lost",
    lines: [
      "Not mildew in the grout. The other kind. Spores that ride heat ducts and lie to you until your lungs argue.",
      "We suit up — yellow locker stink, visor fog, filters that taste of sweat and disinfectant. Always us first. Red Belts seal the hatch and log the body.",
      "Old woman on six fell through an open stairwell door. I didn't carry her — I was on shift below — but I heard the radio and I knew the shape of the day after.",
      "They welded whole runs shut. Baskets on ropes for bread. Families counting cups of water like air. Containment, they call it. The mold doesn't read bulletins.",
      "I scrub until my knuckles split. The film of work stays anyway.",
      "Lower decks don't get safer because I learn them. They stay hostile. I just stop being stupid in the same places.",
    ],
  },
  {
    kind: "diary",
    heading: "This flat",
    dateLabel: "17. ožujka — godina?",
    lines: [
      "Wardrobe still had a coat with a transit tag — 1988 faded to pink. Like the building forgot to update itself when the world stopped.",
      "Footlocker tools fit my hands. Fridge smells of old cold. Stove discs heat slow — nothing like gas, nothing like Marta's paprikaš.",
      "I planted the balcony because idle soil makes me think. Fish tank because noise is company. Notebook because talking to the wall is how they find you odd on inspection days.",
      "Drying rack by the window — mushrooms, herbs, a shirt when the radiator's shy. Sleep does the work if I set it up honest.",
      "If they come back — Marta with her keys, Iva loud, Dario underfoot — this flat should feel lived-in, not like a camp.",
      "If they don't — I'll still bleed the tanks on rota, mark what I can't remember, and turn the photo to the wall when boots pass.",
      "Returning here is the reward. I didn't expect that. I still don't trust it.",
    ],
  },
  {
    kind: "diary",
    heading: "Council voice",
    dateLabel: "noć — broadcast",
    lines: [
      "Four matrons on the screen. Rada counts valves. Milica counts rifles. Sonja counts beans. Ljubica counts souls.",
      "They promise lungs will hold above fifty-five degrees. They promise discipline. They promise faith.",
      "I watch with the sound low. Jelena from maintenance brought bread once and cried on my shoulder for a woman she'd never met. I didn't have the heart to tell her the whole block performs grief on schedule now.",
      "Something is wrong with the last breach. Doors don't forget themselves. Crews get blamed so belts can tighten. I chalk the column, lock the valve neutral, and don't say it aloud.",
      "The building is not a dungeon to conquer. It's a vertical ecosystem. We survive through routine, labor, knowledge, and risk.",
    ],
  },
];

/** @deprecated Use {@link PLAYER_NOTEBOOK_PAGES}. */
export const PLAYER_NOTEBOOK_TIPS = PLAYER_NOTEBOOK_PAGES.filter((s) => s.kind === "reference");
