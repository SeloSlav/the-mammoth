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
    "The calendar in the hall has been stuck on 1988 since I moved in, and there's a receipt in one of the wardrobe coats that agrees with it. I keep my own days in my head and on the side of my thumb, which is as honest as the paper around here gets.",
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
      "Photograph on the desk. Marta and the kids out on the balcony rail in summer light, before any of this. I know the year well enough but I'm not putting it down on paper, because once it's written I'd have to start believing my own arithmetic.",
      "Iva is grinning at something just off the frame, probably the neighbour's cat she was always trying to coax over. Dario has the toy crane I welded for him from yard scrap, holding it the way he held everything important then, with both hands. Marta is squinting because the light was honest in those years and she never bothered to look away from it.",
      "They aren't in the block. I have walked nineteen and waited in the farm queues and read the chapel ledger until Ljubica's clerks pretended not to see me at the counter, and there is nothing of them anywhere.",
      "When the Red Belts do corridor counts I turn the frame toward the wall. It isn't shame. It's that if they noticed it they would ask, and I cannot answer a question about my own family without something inside me coming loose where I can't fix it.",
      "Some nights, after the diffusers dim, I turn it back. The forest glows green through the corner glass and doesn't care who any of us used to be, which on a bad night is almost a kindness.",
    ],
  },
  {
    kind: "diary",
    heading: "Before the boilers",
    dateLabel: "siječanj? — 1988 na kutiji alata",
    lines: [
      "I was a mechanic before, that's the word people used and the word I'd have used about myself if anyone asked. Garages in the old city when I was younger, and the county vehicle pool later, when fuel still meant something outside and the dispatcher would shout my name across the yard if a pump truck wouldn't start.",
      "My father Ivan was the one who could read. He'd sit at the kitchen table after supper with his manuals open, going through thermal buffers and brine loops and words he had to spell out for himself, while I learned which wrench fit which valve in the workshop behind the house. He worked with paper, I worked with my hands, and neither of us ever pretended the other one had the easier job.",
      "When the seal came down on Mamutica they weren't looking for men who could explain anything. They wanted men who could bleed a tank without losing a thumb. I put my name on the geothermal list because the list was short and the pay was bread you could eat without it arguing back at you, which was already more than the militia was offering that month.",
      "Two weeks down on rota, two weeks up in the flat. It looks generous when it's written like that. In practice the block eats the second half — farm call-ups Sonja phrases as requests, a militia errand someone has decided you owe them, the neighbour from six whose fuse box has been sparking since the last cold snap and who keeps catching you in the corridor.",
      "So I'm a utility runner now, if you need a single word for it. Some days a courier when a job is too embarrassing to do under your own name, some days a scavenger because somebody's ledger needs a number filled in, some days an actual technician when a gauge is lying to a crew that hasn't slept. Nothing more romantic than that, and the pay matches the description.",
    ],
  },
  {
    kind: "diary",
    heading: "Floor ledger",
    dateLabel: "veljača — copied from lift panel & crew chalk",
    lines: [
      "I keep the lift labels straight in my head because stepping out on the wrong floor will get you shot or get you spored, and neither one is the kind of mistake you make twice. Top down, the way the panel reads:",
      "19 — us. The last residential deck still inhabited, where the diffusers fake the dawn and the radiators tick all night. People die quietly here and the furnaces keep going on schedule. My corner flat is east wing, end of the hall.",
      "18 — the farm deck, with the walls knocked through into one long misting corridor. Substrate bays, drying racks, quarantine cages, and Sonja's ration counter at the end of all of it. Humid enough to rot the soles off your boots if you forget them. Everyone takes a shift or quietly loses priority on the next ration list, which she never has to say out loud.",
      "17 — Red Belt. Welded shutters, the bunks, ammo benches along the windows, observation posts at the stairwells. There's justice chalked on damp plaster up there in a hand that doesn't ask. I don't linger if my name isn't on the order.",
      "16 — the last of the regular apartments before the belt floor. Dark now, picked over more than once, though you can still smell cooking grease through some of the sealed doors if you stand close enough.",
      "15 — the black-market floor that burned out two winters back. Mostly ash and softened plastic along the spine corridor where the stalls used to be.",
      "14 — quarantine paint on the doors, sealed units, the warnings written in three different hands and signed by nobody. You don't open anything up there unless a chit tells you to.",
      "13 — storage. Mixed salvage, shelving that's collapsed in on itself, but good copper for anyone who knows which utility closet numbers are still worth a visit.",
      "12 — the archive floor. Paper stacks and that old-fire smell that won't leave the wood. Slow work for slow pay, though every now and then a map turns up that's worth more than a week of food.",
      "11 — laundry and textile. Mostly drum rot now, but the cloth rolls are intact where the floods never reached them.",
      "10 — the workshop deck. Dead lathes, bench vises still bolted down, metal stock cut in lengths people will trade something for.",
      "9 — the religious floor, and the elderly that stayed near it. Icons in the corridors, candle stubs burned down into puddles on the saucers, names on doors nobody crosses off anymore.",
      "8 — partly collapsed at the south end, so you detour around the bad rooms and trust the chalk arrows. Not a floor to be carrying anything heavy through.",
      "7 — heavy on maintenance. Fuse boxes, pipe rooms, riser closets behind the maid panels. A lot of the orders I get on −1 send me up here for one fitting and back.",
      "6 — a militia outpost that didn't hold. The barricade is still in the corridor, half-rotted now, with spent brass in the grout. Crossed quickly.",
      "5 — grocery and ration storage from the old days. Empty freezers, the vinegar smell that won't leave the walls, sometimes coolant still in the lines if nobody's drained them.",
      "4 — the clinic floor. Cabinets stripped a long time ago, but antibiotics still turn up if your luck and your flashlight both hold out.",
      "3 — school and daycare. Tiny desks, chalk on the boards, and on a good day alcohol in the science-room cupboards if nobody else has been through.",
      "2 — flooded residential. Knee-deep in the worst spots, quiet splashes when you move, radiator valves worth pulling if you can stand the cold long enough.",
      "1 — fungal-bloom frontier. Spore density is worst near the ground vents along the lobby side, so you wear the mask or you regret it for a week.",
      "PR — ground podium. Lobby spine, the kiosks long gone, the elevator hub. Service stairs go down from here, but the passenger panel doesn't stop on them.",
      "−1, kotlovnica — my floor on rota. Boiler hall, ceramic buffers along the wall, the riser manifolds feeding everything above us. Steam that will bite through gloves if you stop paying attention. Rada's chalk on everything that matters. It's safe enough if you've been trained, and tastes of iron and bleach by the end of a shift.",
      "−2, pumparna — circulation pumps, the backup generators, elevator switchgear. I've carried impellers down here under escort, and only that. Flood trays in the floor and arc-flash signs on every cabinet. Not a floor I'm cleared to be on alone, and not one I'm in a hurry to clear.",
      "−3, dvorana — brine loops, heat exchangers the size of bus shells, the turbine humming the way the inside of a church hums when you stand at the back. Supervised work only. The gauges down there are where my father's manuals finally line up with metal I can put my hand on.",
      "−4, galerija — the deep intake, the wellheads, the pre-seal council doors. I've never been past the last hatch. The late-shift talk says wet stone and wrong air and something that sounds like it's breathing inside the rock, which I record without comment. Maybe Milica's keys open it. Mine certainly don't, and not yet.",
    ],
  },
  {
    kind: "diary",
    heading: "Dawn on nineteen",
    dateLabel: "17. ožujka — godina?",
    lines: [
      "Wake up to the radiator knocking and the forest glowing green through the corner glass, which is beautiful in a way you can only enjoy as long as you don't think about what it would do to your lungs in the open.",
      "Bare feet on the rug while I work out what kind of day it is. Fridge first to see what's left and what's started to turn since yesterday, then the stove stays cold until I bother to feed it. Footlocker for whatever today's job actually needs — the crowbar if the lift is reported dead on five, electrical tape if Rada's chit says fittings, the half-sandwich I put together the night before for the kind of pride that gets you up six flights of stairs.",
      "The work coveralls in the wardrobe still smell of boiler bleach from the last rota, so I hang them back up and leave the good shirt on the hook for the corridor in case Sonja stops me about a bay strip on her way past.",
      "Out on the balcony to walk the trays and check the LEDs and see whether the soil is still honest or whether it's gone dry overnight. If the kitchen tank read honest when I filled a bottle, I pour where it's needed. Fish tank gets a crust of kopar at the feed slot, just enough to make them dart out from under the castle. If there's compost sitting in the slot from yesterday I move it into the tray stash before I forget about it again.",
      "The water tank glugs the way old tanks glug when you draw from them. Map board by the door has an engineer's chit for a gauge on seven that's been there two days, and a neighbour's room number I've underlined twice and keep meaning to deal with.",
      "Radio is on low. Farm wants UV bulbs again, the militia channel is talking about something on sixteen in a tone I don't like, and seven has another elevator fault. None of it asks for me by name today, so I leave it alone.",
      "Lock up. The hall smells of cabbage and someone's cigarettes, the same as most mornings. Another day of helping this island stay an island a little longer.",
    ],
  },
  {
    kind: "diary",
    heading: "Farm shift",
    dateLabel: "ožujak — Sonja counted my hours",
    lines: [
      "Eighteen isn't my balcony, and the scale of it hits you the moment you step off the lift. Walls knocked through the whole length of the deck, mist on your lenses before you've taken ten steps, and that substrate smell that sits somewhere between wet cardboard and something living.",
      "They put me on a bay strip after I'd hauled compost buckets for three shifts without complaining about it. Sonja made clear it isn't ownership, only stewardship, which is a word she gets a lot of mileage out of. If I miss quota, someone else eats my ration credit for the week and the strip gets reassigned without ceremony.",
      "Mornings are scraping spent mycelium and reading the humidity gauges, and yesterday I swapped out a dead UV tube someone had scavenged off eleven and donated to the bay next to mine. Afternoons are nutrient mix with gloves that stick to your fingers, and the quarantine cage where the knock from inside means log it and walk past, never open it.",
      "Sonja's ledger is the real kitchen of this block. The fungal loaves and the bandage fiber and the cultures they grow for armor padding don't come off a balcony tray on nineteen, no matter how seriously I tend mine.",
      "Came home with ration chits in one pocket and a paper bag of spore sample for the medic on my hall in the other. Shoes stayed on the mat. The flat still smelled like the flat and not like the farm by the time I'd washed, which is harder to manage than it sounds.",
      "What I grow on my balcony is garnish, and I've stopped pretending that what gets grown on eighteen is the same kind of work.",
    ],
  },
  {
    kind: "diary",
    heading: "Red Belt hallway",
    dateLabel: "veljača — contract, not friendship",
    lines: [
      "Seventeen smells of gun oil and whatever stew the bunk kitchens have going that morning, and the floor is always boots on linoleum, never anything quieter. You hear someone coming a long time before they're there.",
      "Nobody at the checkpoint asked my name. They asked what I was carrying, and whether I'd been anywhere below sixteen without an escort in the last week. I said no to the second question and showed them the first, and that was the whole of the conversation.",
      "There was a contract chalked on the board for scouting the stairwell on fifteen and bringing back a patrol lamp from a locker they already knew was still there. Pay was a small box of nine-millimeter and a stamped chit that kept your name at the front of the farm priority list for a week.",
      "I left it for someone else. A runner I half-know from the radiator queue picked it up, and two days later I saw him on nineteen buying pelargonija seeds off a stall like someone who'd suddenly been paid in time he hadn't expected to have.",
      "Milica's voice came over the corridor PA while I was waiting at the checkpoint, the usual lines about discipline and faith and keeping the lungs of the building above fifty-five degrees. The rifles racked along the wall didn't need to nod at any of it. They were already the agreement she was making.",
      "Violence on seventeen is mostly a political instrument, the way fuel used to be a political instrument outside. It's useful enough when you've already run out of better options, and expensive in ways the ammo box doesn't tell you about when you haven't.",
    ],
  },
  {
    kind: "diary",
    heading: "Below the hatch",
    dateLabel: "tjedan u roti — PR service stairs",
    lines: [
      "The passenger lift stops at PR, and that's where most of the residents think the building stops with it. The actual machinery only begins once you know which service door hisses on the right side of the corridor and which matron has put her initials on your boot card for the rota.",
      "Minus one is kotlovnica, my floor. Painted pipes overhead with the colour codes faded out of them, the ceramic buffers ranged along the wall, and the riser manifolds feeding every radiator above us up to nineteen. Steam that bites straight through gloves if you stop paying it attention. Rada's crew move the way surgeons move when they haven't slept properly in a week, which is most of the time.",
      "My work down there is small enough. Reading a gauge that's lying by two bars, bleeding a tank, swapping a relay panel that someone on −2 wrote up an order for, carrying copper tubing to a man at the end of the corridor who only grunts when you set it down. The heat takes your stamina before you notice you've lost it. What kotlovnica doesn't have is any mould against the pipes or any knocking inside the walls, which is the whole point of putting a crew on the floor at all.",
      "I've been on minus two twice now. Pump-hall echo, the generator smell that gets into your hair, elevator switchgear panels that quietly decide who's riding today and who's walking. Escort only, and they meant it. I carried the impeller in both hands and kept my eyes on the floor grating, because dropping anything down those gaps ends a shift in the kind of paperwork you don't want.",
      "Minus three once, and only because the supervisor signed off on it personally. Brine smell, turbine hum coming up through the soles of your boots, heat exchangers the size of bus shells laid sideways. My father's words at the kitchen table finally attached themselves to actual metal there. I wasn't frightened. I felt small, which is different.",
      "Minus four I know only from chalk arrows that stop short, and a hatch with no handle on our side. The crews call it galerija. The council calls it structural. The late-shift talk says wet stone and wrong air and something that sounds like it's breathing inside the rock, which I write down in the rota log as neutral and don't repeat anywhere boots might be passing.",
    ],
  },
  {
    kind: "diary",
    heading: "Four under PR",
    dateLabel: "veljača — copied from crew landing signs",
    lines: [
      "The service stairs don't lie the way the elevator panel sometimes does. Four landings under the podium, and the pattern Rada teaches new runners is that heat rises through the building while trouble tends to sink under it.",
      "On −1 what the deep earth gives gets distributed back through the block — hot water out to the radiators above, sterilizer loops sent up toward eighteen for the farm, elevator hydraulics on the lines that are still running clean. It's the floor where runners like me learn what we know about the building's lower half, mostly through gauges and valves and the kind of burns you deserve for being careless near a riser.",
      "On −2 they move what −3 makes. Circulation pumps complaining in different keys depending on the load, backup generation that comes online when the forest has eaten another line, switchgear capable of orphaning a wing without consulting anyone in advance. Orders that send me down to −2 come with an escort attached and a part number written by someone who isn't interested in a conversation about it. The danger on −2 is mechanical and not biological, which is its own kind of relief.",
      "On −3 the heat is actually made. Brine pulled up out of the wells, exchangers, turbine load, and the noise underneath all of it that means nineteen still has light when the diffusers come on at evening. Senior technicians' territory. I listen there more than I touch anything, and when the supervisor takes me through I try to keep up with what he's pointing at.",
      "−4 is where any of this begins. Intake gallery, bore records from before the seal, council doors the current matrons inherited from women they never met. They tell us that floor opens late, if it ever opens at all, and only when something has already gone wrong with containment or something has gone right with trust. The fungus on −4 is in the bedrock itself rather than in any of our hallways, and a breach down there wouldn't be a Mamutica problem so much as the end of the idea that Mamutica is an island.",
      "I work −1 with my own name on the rota. I've been on −2 and −3 under escort and under supervision. −4 is a story I haven't earned the right to read yet, and on most days I'm content with that.",
    ],
  },
  {
    kind: "diary",
    heading: "A run to six",
    dateLabel: "ožujak — order #44",
    lines: [
      "Order had me at the fuse box in the utility closet on seven, with a note in Rada's hand saying take the copper wire off storage on thirteen if the rest of my carry permitted. It permitted until quite suddenly it didn't.",
      "Took the lift up to ten and the stairs from there down, which is the way Red Belts prefer it when they're going to catch you on a checkpoint with metal on your back. Past nine the spine corridor goes dark in a way the diffusers never reach, and there are still candle stubs burning on a few of the apartment doors as if the dead had quietly kept paying their rent.",
      "On six there's the old militia line that didn't hold — barricade teeth across the corridor, spent brass worked into the grout under your boots, a wall locker someone hadn't bothered to lift the patrol lamp out of. I took the lamp. The box of ammunition next to it I left behind, because shells in a metal box make exactly the kind of noise on a stairwell I couldn't afford carrying with me.",
      "On thirteen the spool of copper was where the order said it would be, and there was a child's shoe by itself on the carpet outside one of the sealed doors. I didn't pick up the shoe. Weight on a stair is a series of decisions you make in a hurry, and that wasn't a decision I was going to make for someone else's child.",
      "Back on nineteen before the diffusers had dimmed, footlocker full, hands shaking from the stairs more than from anything else I'd seen. The fear comes later, usually in the flat after I've eaten something, when the apartment is quiet enough for me to notice it has shown up.",
      "Jelena from maintenance has a line about all this — that the whole job is preparing properly, going down with one thing in mind, taking what matters and bringing yourself home. She isn't wrong about it, though it's a sentence you don't fully understand until you've stood on a dark landing trying to decide between two things that would both fit if you had a third shoulder.",
    ],
  },
  {
    kind: "diary",
    heading: "Plijesn",
    dateLabel: "ožujak — week lost",
    lines: [
      "Plijesn isn't the mildew in your bathroom grout, however much it would like you to confuse the two. It's the other kind. Spores that ride a heat duct quietly for days and tell you nothing at all until your lungs start to argue with you halfway up a stairwell.",
      "We suit up at the yellow lockers, with that locker stink that doesn't come out of anything you bring home with you. Visors fogging if you breathe wrong, filters tasting of old sweat and disinfectant. The maintenance crew always goes in first by arrangement, and behind us the Red Belts seal the hatch and log the body, if there's a body to log by the end.",
      "An old woman on six went through a stairwell door someone had left open during the last bloom. I wasn't on the run that found her — I was on a shift two landings below — but the radio carried the shape of the morning over to us, and you knew before anyone said it what the next day's bulletin was going to say.",
      "They welded entire runs of corridor shut while the bloom was active, and afterwards too. Baskets on ropes to send bread up to families on the wrong side. People counting cups of water the way you'd count breaths. The Red Belts called it containment, which is the word you use when you want a problem to sit still long enough to become someone else's, and the mould wasn't reading the bulletins they were posting about it.",
      "I scrub until my knuckles split open at the joints, and the film of the work stays anyway. By the end of a contamination week it's on everything I own and in how I smell to my own neighbours in the corridor.",
      "The lower decks of this building don't become safer because I keep learning them. They stay hostile in exactly the same ways they were hostile last month. All I'm really earning over time is the habit of not being stupid in the same place a second time, which on a good week is enough.",
    ],
  },
  {
    kind: "diary",
    heading: "This flat",
    dateLabel: "17. ožujka — godina?",
    lines: [
      "There was a coat in the wardrobe when I moved in with a transit tag still safety-pinned to its lapel, the printer's blue faded into pink under the storage light. It looked as though the building had simply forgotten to update itself somewhere along the way, the year the world outside finally went quiet on us.",
      "The footlocker tools fit my hands well enough, even the ones I didn't bring with me. The fridge has that smell old cold gets when it has been running without a real load for too long, and the stove discs heat slowly and never get to where gas used to take you in half the time. Nothing like the paprikaš Marta used to start in the afternoon and let go until evening on a low flame.",
      "I planted the balcony because idle soil is what makes me think too much, and the thinking takes me places I'd rather not visit in a quiet flat. The fish tank is mostly for the noise, because in this block silence in your apartment is the first thing they notice on inspection days. The notebook is so I'm not talking to the wall in a voice the neighbours can hear through the radiator pipes.",
      "There's a drying rack by the window for mushrooms and herbs, and a shirt now and then when the radiator is being shy about its job. If I set the day up honestly the sleep does most of the work I'm too tired to manage conscious.",
      "If they come back — Marta with her keys in the lock, Iva loud the way she was loud, Dario stepping on heels the way he used to do without noticing — then I want the flat to feel like somewhere people have actually been living, and not like a man camping in a unit he doesn't expect to keep.",
      "If they don't come back, I'll still bleed the tanks when the rota says so, mark down on paper the things I'm starting to lose to memory, and turn the photograph to face the wall when boots pass along the corridor outside.",
      "Coming back here at the end of a shift has started to feel like a reward, which surprised me when I noticed it. I haven't fully decided whether I trust the feeling yet, but I haven't told it to leave either.",
    ],
  },
  {
    kind: "diary",
    heading: "Council voice",
    dateLabel: "noć — broadcast",
    lines: [
      "Four matrons on the broadcast tonight, the way it goes most weeks. Rada with her valves and her gauges and the work orders that will fall onto my rota tomorrow. Milica with the rifles racked behind her and the line about lungs holding above fifty-five degrees, which she's been saying long enough that some of the children on nineteen can mouth along. Sonja with her ledger of grain and substrate and ration counts. Ljubica reading the names of the dead and the dying off a list that gets longer most weeks rather than shorter.",
      "They promise that the lungs of the building will hold. They promise discipline of the kind the militia can enforce, and a faith of the kind they need the rest of us to keep practising in public, in a voice you only really hear in people who have stopped being able to afford doubt out loud.",
      "I usually watch with the sound turned down to where the radiator drowns most of it. Jelena from maintenance brought bread over to my flat one broadcast night and cried on my shoulder over a woman from the chapel ledger she had never actually met. I didn't have the heart to tell her that the whole block performs its grief on schedule now, on broadcast nights, because that's what's left over when the actual grieving has become too dangerous to be honest about in your own kitchen.",
      "Something is off about the last breach Milica described, and the way she described it. Doors of that kind do not forget themselves. Crews get blamed in the column the council reads from so that the belts can tighten on the floors they were already planning to tighten on. I write the column down neutral in the rota log, I lock the valve I was told to lock, and I don't say any of this where her people might be listening for it.",
      "This building isn't a dungeon you fight your way through, the way some of the younger militia recruits sometimes talk about it. It's more like an ecosystem stood up on its end, and you stay alive inside it by your rota and your work, by what you happen to know and who you happen to know it from, and by what risks you're willing to spend on the days when the spending has to be done.",
    ],
  },
];

/** @deprecated Use {@link PLAYER_NOTEBOOK_PAGES}. */
export const PLAYER_NOTEBOOK_TIPS = PLAYER_NOTEBOOK_PAGES.filter((s) => s.kind === "reference");
