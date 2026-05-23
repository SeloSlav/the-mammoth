/** Diegetic survival notes — player voice, scribbled in haste, mechanics-accurate. */

export type PlayerNotebookTipSection = {
  heading: string;
  lines: readonly string[];
};

export const PLAYER_NOTEBOOK_TIPS: readonly PlayerNotebookTipSection[] = [
  {
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
    heading: "Don't forget the basics",
    lines: [
      "E = use thing you're looking at. Tab = inventory + hotbar.",
      "Bed: lie down first, then E again to sleep. Skips the night, refills food/water/health.",
      "Sleep also ticks balcony crops + dries tray water. Plan before you crash.",
    ],
  },
  {
    heading: "This flat (if you claimed it)",
    lines: [
      "Unclaimed unit: hold E at the wardrobe with a door lock + screwdriver in inventory.",
      "Footlocker = junk/tools. Wardrobe = clothes/wearables. Fridge = food that rots. Stove = cook stash.",
      "Everything opens with E when you're close enough — same dock as your pockets.",
    ],
  },
  {
    heading: "Ceramic filter / water tank",
    lines: [
      "Tank in the kitchen refills on its own (~20 L max). Open tank stash with E, slot an empty water bottle, hit Fill bottle.",
      "Filled bottle on hotbar: drink from hotbar, or RMB-aim at balcony soil to pour (~0.35 L puddle).",
      "Trays drink from pours + keep water between sleeps. Dry trays wilt. Don't skip watering.",
    ],
  },
  {
    heading: "Fish tank → fertilizer (finally working)",
    lines: [
      "Feed the fish. Clean when water clouds. Pump/filter keeps them alive — neglect = dead fish, algae, shame.",
      "Scoop waste from the tank into tray compost. Same stuff as footlocker starter packs.",
      "Drop compost in a grow-tray stash before you sleep. One unit overnight feeds all four slots in that tray.",
    ],
  },
  {
    heading: "Balcony grow-op (8 trays, 4 slots each)",
    lines: [
      "LED panels must be ON or nothing grows when you sleep.",
      "Plant: seed on hotbar, aim a free tray slot, LMB. Harvest mature plants with E.",
      "Tray stash (center pick or E on tray): compost slot only. Water + compost before sleep.",
      "Good care = extra food/seeds at harvest (light + water + compost). Radish sprouts = emergency greens (~2–3 nights).",
      "Crops I actually use: peršin/dill garnish, libelek for soup, feferoni slow but real, pelargonija for čaj.",
    ],
  },
  {
    heading: "Moving around the block",
    lines: [
      "Elevator: aim floor panel, click. Corridor doors = E. Apartment doors (stairwell / hallway / unit) = E.",
      "Stairs work when lift is broken or you're avoiding militia eye contact.",
      "Dropped loot on the floor: E to pick up. World spawns say 'collect' — same key.",
    ],
  },
  {
    heading: "Why we're down here",
    lines: [
      "We're utility runners — not heroes. Descend, grab what the floor needs, come back alive.",
      "Lower floors stay hostile. You get smarter; they don't get safer.",
      "If this notebook is wrong, the engineer lied to me again. Update when you learn better.",
    ],
  },
];
