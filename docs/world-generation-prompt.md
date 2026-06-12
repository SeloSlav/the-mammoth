# The Mammoth world-generation prompt

Status: parked reference. Do not treat this as an active implementation plan yet.

This document adapts the attached LAAS-style procedural-world brief to The Mammoth. The original prompt aimed at a current-gen forest/alpine showcase. The Mammoth needs a different target: a sealed socialist megablock, its immediate neighborhood, and the fungal world pressing against the windows.

Use this later as a prompt for a coding agent or design pass when we are ready to build procedural world-detail systems.

---

## Prime directive

Build procedural world generation for **The Mammoth**, not a generic open-world forest.

The game is a browser-first first-person persistent survival game set in and around a giant Slavic apartment block inspired by Zagreb's Mamutica. The world is a hostile vertical ecosystem: inhabited top floors, communal fungal agriculture, militia frontier, abandoned residential and converted floors, basement utility systems, courtyard, service roads, shops, park edges, and the fungal forest beyond the sealed perimeter.

Procedural generation must make the authored world denser, more legible, more lived-in, and more replayable. It must not overwrite canon floor identities, authored quest targets, apartment anchors, or the single global coordinate system described in `docs/PROJECT.md`, `docs/core-game-loop.md`, and `docs/architecture/world-streaming.md`.

---

## Non-negotiable project fit

- The world is one continuous coordinate system.
- Baseline layout lives in versioned documents under `content/`.
- Dynamic state belongs in SpaceTimeDB overlays or runtime state, not as the only copy of static layout.
- The editor remains first-class and must be able to inspect, override, pin, or regenerate procedural output.
- The game loop is extraction, maintenance, apartment survival, and social trust, not clearing generated dungeons.
- Procedural systems must produce deterministic output from stable seeds: world seed, cell id, floor id, room id, and authored anchor ids.
- Generation must respect authored doors, portals, collision, walkable AABBs, room numbers, floor themes, quest markers, and saved player-owned apartment state.

---

## Visual bar

The target is not "pretty for a browser." The target is a dense, physical, contemporary first-person survival environment that can withstand close inspection:

- cracked concrete, patched paint, swollen doors, worn terrazzo, chipped tile, rust, condensation, taped plastic, grime trails, water staining, old signage, hand-written labels, religious objects, improvised barricades, cables, ducts, pipes, vents, fuse boxes, bags, buckets, storage crates, food jars, tools, damp cloth, mold, fungal mats, spore residue, and repair scars
- inhabited upper floors that feel cramped, warm, bureaucratic, and human
- farm floors that feel humid, earthy, chemical, productive, and precarious
- militia floors that feel fortified, political, tired, and dangerous
- abandoned floors that feel specific, persistent, decayed, and worth learning
- basements that feel industrial, sacred, hot, loud, professional, and mechanically dangerous
- exterior cells that feel like a sealed neighborhood slowly being consumed by fungal ecology

Do not use forest showcase goals as the center of gravity. Fungal exterior growth matters, but the building is the game world.

---

## Pillars

### A. Authored skeleton, procedural flesh

Authored documents define the building, floor themes, quest targets, portals, room identities, and global layout. Procedural generation fills the surfaces and volumes around those anchors with believable detail.

Examples:

- an authored storage closet can receive deterministic clutter, chalk labels, broken shelving, fuse boxes, cables, and dust
- an authored abandoned apartment can receive household traces, decay stage, loot containers, blocked paths, and fungal intrusion
- an authored courtyard cell can receive parked vehicles, concrete planters, trash, signage, barricades, puddles, and fungal growth patterns

Procedural generation must never make the player unable to complete an authored objective.

### B. Lived-in density

Empty corridors are failure. Every surface class should carry evidence of age, use, neglect, repair, or contamination.

Concrete has stains, cracks, patches, water marks, exposed aggregate, old drill holes, flaking paint, and grime at contact points. Doors have scuffs, labels, locks, seals, pry marks, and apartment-specific traces. Utility rooms have cable bundles, conduit, tags, spare parts, spill marks, and warning labels. Farm rooms have misting lines, substrate bins, condensation, drains, UV rigs, plastic sheeting, and contamination zones.

### C. Readable survival

Generated detail must support gameplay reading:

- where people still live
- which paths are maintained
- where water, heat, power, spores, or enemies are likely
- what is safe, risky, sealed, official, improvised, abandoned, or recently disturbed
- what objects are loot, what objects are cover, what objects are noise hazards, and what objects are only dressing

Density is not visual confetti. It should teach the player how the building works.

### D. Vertical identity

The Mammoth is not a flat map. Floor identity is the core world-generation problem.

Each floor band needs its own procedural grammar:

- civilian layer: routines, warmth, signs of rationing, social objects, apartment personalization
- farm layer: grow beds, humidity, substrate flow, contamination control, work stations
- militia layer: barricades, patrol marks, ammo discipline, observation posts, lockups
- abandoned floors: themed decay, blocked routes, scavenging traces, hazards, enemy pressure
- basement levels: heat, pressure, power, pumps, valves, locked professional spaces
- exterior cells: courtyard, service paths, perimeter barricades, fungus beyond the sealed edge

### E. Light, air, and damp

Lighting should carry the mood of each layer:

- warm but weak apartment light
- greenish farm bounce through plastic and mycelium
- harsh militia work lights and shadowed barricades
- dead lower-floor emergency lighting, flashlight cones, blown fixtures
- sodium exterior spill, overcast daylight, fungal forest glow through windows
- hot basement industrial lamps, steam haze, warning strobes

No black ambient holes. Shadowed interiors should pick up colored bounce from walls, mold, sky, lamps, screens, emergency signs, or fungal growth.

### F. The world changes by day

Procedural state should support the sleep/day loop:

- puddles dry or spread
- fungal blooms advance or recede
- farm trays grow
- trash moves after NPC routines
- doors, barricades, and lights reflect temporary conditions
- lower-floor hazards shift without permanently making the floor safe
- apartment neglect appears visually over multiple days

The building should feel one sleep away from a new problem.

---

## Procedural systems to ask for later

When this prompt becomes active, ask the agent to implement systems in small verified slices. Prefer data-backed generation that can be saved, inspected, debugged, and overridden in the editor.

1. **Deterministic scatter grammar**
   - Inputs: cell/floor/interior document, room tags, floor theme, surface tags, seed.
   - Outputs: placed props, decals, stains, clutter clusters, blockers, loot container candidates, ambient objects.
   - Requirements: stable ids, editor visibility, collision policy, gameplay tags, regeneration diff.

2. **Surface dressing**
   - Concrete, tile, paint, metal, wood, glass, plastic, fabric, soil/substrate, fungal matter.
   - Macro/meso/micro rule: shape variation, decal/stain layer, material roughness/normal variation.
   - Dressing follows moisture, traffic, airflow, light exposure, age, and maintenance status.

3. **Room and corridor identity**
   - Every generated room should answer: who used this, what happened here, what can the player infer?
   - Avoid uniform apartment repeats. Variation comes from resident type, floor history, damage, looting, contamination, and current condition.

4. **Hazard and condition overlays**
   - Power state, water leak, steam leak, spore density, blocked path, barricade state, noise source, temporary shortcut.
   - These overlays should be separate from baseline layout and compatible with SpaceTimeDB.

5. **Exterior cell generation**
   - Courtyard and immediate neighborhood only at first.
   - Generate service paths, planters, kiosks, refuse zones, parked vehicle shells, perimeter barriers, signage, fungal encroachment, puddles, and sightlines to the outside growth.
   - The exterior supports the megablock fantasy. It is not a separate wilderness game.

6. **Fungal ecology**
   - Use fungal growth as an invasive system: moisture gradients, cracks, vents, dead organic matter, stale air, exterior pressure, farm quarantine logic.
   - Growth should explain hazards, materials, food systems, medicine, armor fibers, and contamination.

7. **Navigation-preserving blockage**
   - Generate partial collapses, barricades, locked doors, furniture piles, flooded zones, and detours.
   - Always preserve objective reachability and at least one readable return route unless a specific authored scenario says otherwise.

8. **Instrumentation and debug views**
   - Show generation seed, loaded chunks, scatter counts, prop categories, blocked paths, quest-safe zones, nav reachability, collision budget, triangle budget, and regeneration diffs.
   - Add debug modes for surface tags, room grammar, hazard overlays, loot candidates, and portal ownership.

---

## Browser and engine constraints

- TypeScript, strict mode.
- Three.js runtime with the existing engine/world packages.
- React only for HUD, menus, editor panels, and tools.
- SpaceTimeDB for live overlays and replicated state.
- Vite client.
- No WebGL fallback if the active runtime is WebGPU-only.
- Avoid CPU per-frame per-instance updates for dense generated detail.
- Use instancing, merged static geometry, chunk streaming, and LOD where appropriate.
- Generated output must be compatible with content documents and the editor.

The goal is not "zero external assets." The current project already has authored models, textures, and content. The goal is: use existing assets where they fit, generate variation around them, and only generate assets procedurally when that gives a real production advantage.

---

## Verification battery

Every active implementation slice should close with evidence:

1. Build/typecheck relevant packages.
2. Load the target scene in the client or editor.
3. Capture before/after screenshots from fixed bookmarks.
4. Verify objective reachability and no blocked critical portals.
5. Verify generated ids are stable across reload with the same seed.
6. Verify editor can inspect generated objects or at least their source anchors.
7. Verify collision and walk surfaces still match generated blockers.
8. Record the ten most important visual/gameplay deltas in a short `DELTA.md` or slice note.
9. Fix the top three issues before calling the slice done.

---

## Banned outcomes

- A random dungeon generator that ignores floor canon.
- A forest-first, terrain-first, or wilderness-first system.
- Corridors filled with clutter that blocks objectives or makes extraction unreadable.
- Repeated apartments that vary only by random prop rotation.
- Generic zombie-shooter dressing.
- Clean sci-fi UI or clean sci-fi environments.
- Loot everywhere with no physical or social logic.
- Visual density that has no gameplay readability.
- Procedural output that cannot be inspected, seeded, regenerated, or overridden.
- Generation that rewrites player-owned apartment state.
- One giant file or a hidden generator with no debug tooling.

---

## Prompt to use later

You are working in The Mammoth codebase. Build procedural world-generation support for a browser-first Three.js/TypeScript survival game set in a sealed socialist megablock and its immediate neighborhood.

Do not build a forest showcase. Do not replace the authored world. Use the authored content documents as the skeleton and generate deterministic, inspectable, editor-aware detail around them.

Read these files first:

- `docs/PROJECT.md`
- `docs/core-game-loop.md`
- `docs/building-floors.md`
- `docs/architecture/world-streaming.md`
- `docs/architecture/persistence.md`
- relevant `content/building`, `content/cells`, `content/interiors`, and `content/apartment` documents

Your task is to make The Mammoth feel denser, more physical, more lived-in, and more readable as a survival ecosystem. Prioritize:

- deterministic scatter grammar
- surface dressing
- floor-specific identity
- fungal ecology
- hazard overlays
- exterior courtyard generation
- editor/debug visibility
- objective-safe navigation

Work in vertical slices. For each slice, implement real code, run verification, capture before/after evidence, write visual/gameplay deltas, and fix the top three issues before moving on.

The player should feel they are keeping a tiny island of civilization alive inside a sealed megablock by descending into the dead floors below, retrieving what still matters, and returning home before the building takes more than they can carry.
