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
      "Sleep also ticks balcony crops + dries tray water. Plan before you crash.",
    ],
  },
  {
    kind: "reference",
    heading: "This flat",
    lines: [
      "Footlocker = junk/tools. Wardrobe = clothes/wearables. Fridge = food that rots. Stove = cook stash.",
      "Everything opens with E when you're close enough — same dock as your pockets.",
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
      "Crops worth the trouble: peršin/dill garnish, feferoni slow but real, pelargonija for čaj.",
    ],
  },
  {
    kind: "reference",
    heading: "Moving around the block",
    lines: [
      "Elevator: aim floor panel, click. Corridor doors = E. Apartment doors (stairwell / hallway / unit) = E.",
      "Stairs when the lift is dead or you want to avoid Red Belt eyes.",
      "Dropped loot on the floor: E to pick up. World spawns say 'collect' — same key.",
    ],
  },
  {
    kind: "reference",
    heading: "Utility runs (below residential)",
    lines: [
      "We're pipe rats — not heroes. Descend, grab what the floor needs, come back alive.",
      "Lower decks get worse: mold, darkness, things that don't knock.",
      "Boiler rota: two weeks on, two weeks off. Off-shift still feels like house arrest when they weld a stairwell.",
    ],
  },
  {
    kind: "diary",
    heading: "The photograph",
    dateLabel: "godina nestala — ranije",
    lines: [
      "Marta and the kids on the desk. Summer light on the balcony rail — I remember the year we took it, but I won't write it. Writing years is how you lie to yourself.",
      "Iva's grin. Dario holding the toy crane I welded from scrap. Marta squinting because the sun was honest then.",
      "They are not in the block. Not on my floor, not in the farm queues, not in the chapel ledger I've checked until the clerks stopped looking at me.",
      "I keep the frame faced toward the wall when the Red Belts do corridor counts. Not because I'm ashamed. Because if they see it they'll ask questions I can't answer without breaking.",
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
      "Two weeks in the belly, two weeks in the flat. Generous on paper. The block eats the other half with waiting.",
    ],
  },
  {
    kind: "diary",
    heading: "How the mammoth stacks",
    dateLabel: "veljača — floor numbers only",
    lines: [
      "Top — us. Residential decks. Diffusers fake dawn. Neighbors die quietly and the furnaces keep humming.",
      "Below that — the farm decks. Hydroponics, algae tanks, fungal beds the Council counts like prayer beads. Every leaf and broth powder sack passes Sonja's ledger before it reaches our teeth.",
      "Below that — Red Belt country. Patrols, welded shutters, rifles kept polite until they're not. Justice for food chalked on wet plaster. I don't linger.",
      "Lower still — abandoned. Lights dead or lying. Doors sealed from inside or out. We run salvage there when clearance comes through. It never comes through often enough.",
      "Then the boiler rooms — my rota. Brine, ceramic, heat banked for the whole slab. The air tastes of iron and bleach.",
      "Under us — council-only. Deep wells, intake galleries, things the matrons call 'structural.' Crew talk says even Milica's keys don't go that far. I believe it. Some doors have no handles on our side.",
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
      "If they come back — Marta with her keys, Iva loud, Dario underfoot — this flat should feel lived-in, not like a camp.",
      "If they don't — I'll still bleed the tanks on rota, mark what I can't remember, and turn the photo to the wall when boots pass.",
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
    ],
  },
];

/** @deprecated Use {@link PLAYER_NOTEBOOK_PAGES}. */
export const PLAYER_NOTEBOOK_TIPS = PLAYER_NOTEBOOK_PAGES.filter((s) => s.kind === "reference");
