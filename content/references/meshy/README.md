# Meshy / image-gen reference prompts

Reference PNGs in this folder (kebab-case `.png` files, e.g. `crowbar.png`) are used as visual targets for **text-to-3D** or **image-to-3D** tools (e.g. Meshy). Prompts are built in **two parts**:

1. **Shared style prefix** — identical for every weapon / prop / hand reference in this project.
2. **Subject line** — describes only the object, pose, and constraints for that asset.

**Final prompt** = style prefix + blank line + subject line (paste as one block into the tool).

---

## 1. Shared style prefix (always use first)

Copy this **verbatim** before the subject for every reference in this directory:

```
stylized low-poly brutalist realism, grounded Eastern European aesthetic, PS2-era texture grit with modern lighting sensibility, clean topology, game-ready asset, strong readable silhouette, slightly simplified geometry, no micro detail noise, muted industrial color palette (concrete gray, faded green, dirty beige, rust red), subtle wear and grime, soft roughness variation, non-photoreal but believable materials, consistent scale, centered composition, orthographic feel, neutral studio lighting, soft shadows, no background environment, pure white background, no text, no UI, no watermark
```

---
 
## 2. Subject lines (one per asset)

Append **one** of the following after the shared prefix (separated by a blank line).

### Hand (`fist.png`)

```
right human hand in relaxed closed grip pose, designed to hold melee weapons, slightly stylized proportions, visible knuckles, subtle skin texture, no weapon included, clean topology for animation, wrist included, centered and fully visible
```

### Crowbar (`crowbar.png`)

```
worn industrial crowbar, slightly stylized but grounded proportions, chipped red paint with exposed metal edges, mild rust near joints, simple geometry optimized for game use, clean silhouette, no excessive detail, realistic weight and thickness, centered and fully visible
```

### Knife (`knife.png`)

```
simple 1980s Yugoslav utility knife, straight narrow blade with slight taper, worn stainless steel with faint scratches, modest wooden or dark plastic handle with visible rivets, practical non-tactical design, slightly rounded edges from use, subtle discoloration and age, no branding or modern features, believable household or worker tool, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Baseball bat (`baseball-bat.png`)

```
wood baseball bat, faceted low-poly barrel tapering to a tape-wrapped handle and a simple octagonal knob, flat barrel end, weathered pale wood with dark reddish dried-stain streaks and scattered scuffs, dirty beige athletic tape with visible overlap bands, small weathered red star accent near the grip, abstract worn red painted bands along the barrel (no legible lettering), grounded improvised melee prop, clean game-ready silhouette, centered and fully visible
```

### Srbosjek (`srbosjek.png`)

```
right-hand heavy leather work glove with palm open toward camera, thick weathered brown leather, dull olive drab metal palm and wrist plate bolted flat to the glove, rusty L-shaped outer bracket on the pinky side, short thick single-edged blade mounted vertical along the outer edge parallel to the fingers, curved cutting edge and flat spine, blade and bracket show rust and scuffs, grounded industrial improvised look, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Male body A-pose (`male-body-apose.png`)

```
adult Slavic male character in neutral A-pose, average build with slight softness and natural proportions, not athletic or exaggerated, subtle asymmetry in posture, light body hair on arms and chest, slightly tired facial features, short practical haircut, wearing simple worn boxer briefs in muted color, no branding, relaxed hands and neutral expression, clean topology suitable for rigging, evenly distributed edge flow, realistic human proportions adapted to slightly stylized form, no extreme detail, centered and fully visible
```

### Female body A-pose (`female-body-apose.png`)

```
adult Slavic female character in neutral A-pose, average build with natural proportions and slight softness, not exaggerated or stylized, subtle asymmetry in posture, realistic anatomy with modest curves, short or tied-back practical hairstyle, slightly tired facial features, wearing simple sports bra and basic underwear in muted color, no branding, practical everyday appearance, relaxed hands and neutral expression, clean topology suitable for rigging, evenly distributed edge flow, realistic human proportions adapted to slightly stylized form, no extreme detail, centered and fully visible
```

### Wardrobe closet — closed (`wardrobe-closet.png`)

```
freestanding double-door wardrobe closet with doors fully closed, late Soviet / Eastern European apartment furniture proportions, tall rectangular cabinet on a short plain base or simple feet, two vertical panel doors meeting in the center with small dull metal hinges and modest round or bar handles, faint seam between doors, subdued wood veneer or painted MDF in dirty beige or faded gray-brown, chipped edges and sun-faded bands, no mirror, no branding, no interior visible, practical storage prop, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Bed (`bed.png`)

```
simple Eastern European apartment bed, modest twin or full width, low plain painted metal tube frame or scuffed wood headboard and footboard with minimal detail, thin mattress with sag in the middle visible as gentle shape only, faded floral or dull stripe bedspread in muted dirty beige or gray-blue, one flat pillow with worn case, bedding slightly rumpled but made, no people, no bedside tables, practical residential prop, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Cigarette pack (`cigarette-pack.png`)

```
upright flip-top cigarette pack, heavily weathered dirty beige cardboard with creases crushed corners peel at the lid edge brown water staining along seams, three diagonal parallel stripes rendered as chunky pixel-graphic blocks muted forest green dull brick red dark charcoal brown, thin brushed silver foil strip visible under the flap line, grounded street clutter prop matched to PS2 gritty reference, strong readable silhouette, centered and fully visible
```

### Empty beer bottle (`empty-beer-bottle.png`)

```
upright empty longneck beer bottle facet-cut low-poly body and tapered neck dull olive green translucent glass with crown rim and no cap, fine scratches dull grime bottom interior dried residue ring torn rectangular paper label with abstract muted green tan reddish-brown blotches only no legible branding, grounded bar litter prop matched to gritty reference silhouette, centered and fully visible
```

**Run stations — militia / workshop (world-spawned, interact on a run).** Fixed floor props with readable mass and chunky silhouettes; not inventory placeables.

### Brick oven (`brick-oven.png`)

```
heavy retained-heat bread oven chamber, squat rectangular brick cavity with soot-blackened mouth and chipped arch lintel, dingy beige firebrick tones with patches of rust-brown scaling and spilled ash near the sill, welded scrap angle feet or squat concrete pad base suggesting permanent install, soot streaks upward from the firing opening, grounded Eastern European communal kitchen scale, prop read as anchored not portable, clean low-poly silhouette, centered and fully visible
```

### Reloading press (`reloading-press.png`)

```
cast-iron reloading press bolted flat to industrial bench plate, chunky C-frame linkage with tarnished crank handle olive drab chipped paint exposing bare metal casting, faint oil stains and grime in recesses, small spent brass catcher tray or drip ledge hinted at simplified geometry only, militarized surplus workshop clutter, grounded ballistics tooling no loose accessories, readable mechanical silhouette optimized for placement on a tabletop, centered and fully visible
```

### Gunsmith workbench (`gunsmith-workbench.png`)

```
sturdy battered gunsmith pine-topped bench with steel corner brackets and chipped gray-green legs, underside cross-bracing hinted with simple planks, tabletop holds fixed steel bench vise on one corner and shallow loose-tray gouges only suggesting tool use, gouged wood edges oil rings and grime no loose tools included, militarized improvised workshop centerpiece, tabletop reads flat for future prop attachment, centered and fully visible
```

**Placeables — improvised stack survival.** Portable lower-floor rigs; handheld-to-suitcase scale, corrugated or scrap-built where noted.

### Improvised cook fire (`improvised-cook-fire.png`)

```
improvised cook fire kit as separate prop not lit, perforated steel barrel skirt halves or scrap plating forming a squat wind collar with rusty tie wire lashing, welded angle-iron grate sitting above ashes bed optional cold charcoal lumps as simple low-poly shapes, dribbled chemical-stain grime on underside plates, scavenged bunker cooking rig for stairwell squatters, burnt metal patina chipped paint no open flame no smoke FX, handheld camp scale not full drum height, centered and fully visible
```

### Trench candle (`trench-candle.png`)

```
small trench candle improvised from shallow dented tuna-tin reservoir dull steel with grime lip, chunky off-white scav wax mound with softened edges and dark char ring hint at melted pool only, twisted natural fiber wick standing upright centered unlit blunt tip slightly blackened tip only, blackout landing emergency light tabletop scale comparable to fist sized, grounded PS2 grime prop centered and fully visible
```

### Heat retention brick (`heat-retention-brick.png`)

```
heat retention sleeper bundle reclaimed firebrick slabs or heavy clay pavers stacked shallow two or three high lashed horizontally with rusty steel band strap and scav baling wire, outer wrap of dirty frayed beige-gray burlap or felt strip tucked under the bands soot smudges on corners from prior heating not glowing not emissive cracked edges and grime, improvised cold-stack bed warmer handheld bundle silhouette not a masonry wall centered and fully visible
```

### Snap rat trap (`snap-rat-trap.png`)

```
classic sprung snap-bar rat trap single traditional wooden plank base chipped gray-brown varnish with grain read as low-poly faceting, rusty steel bait pedal trip plate hinged spring arm and snapping kill bar wire loop at free end restrained in cocked-ready pose with visible coil spring block, petite dull brass finish bait cleat spike center line with tiny abstract crumb lure only no readable labels, gouged chew marks at wood corners, gritty Eastern European basement vermin gear readable silhouette from slight three-quarter angle full trap in frame handheld scale centered and fully visible
```

**Wearables / run maintenance.**

### Fungal suit (`fungal-suit.png`)

```
full-body sealed spore-protection coveralls in neutral A-pose arms slightly out from body legs straight feet shoulder-width, Eastern European farm or maintenance issue hazmat-style one-piece suit not glossy modern NBC, dull olive drab or gray-green rubberized fabric and taped seam bands at ankles wrists and zipper flap, integrated hood and helmet up over head with scuffed clear visor panel or taped face seal rim and dull rubber neck gasket, chest-mounted filter socket port with blank cap plate no hose, scuffed knees and spore dust smudges on thighs, thick rubber boot covers over simple work shoes, clean topology suitable for rigging, realistic human proportions under suit slightly stylized, no weapon no backpack, centered and fully visible
```

### Fungal suit filter (`fungal-suit-filter.png`)

```
replaceable fungal suit filter canister cartridge for chest or back mount, short squat cylinder with threaded neck and bayonet twist-lock base plate, olive drab metal end caps and pleated HEPA-style filter band as simple low-poly rings not micro mesh, faint spore grime on intake face, small rubber gasket lip, consumable spare part scale about one forearm long and fist diameter, no full suit no hose assembly, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Pressure gauge (`pressure-gauge.png`)

```
industrial pressure gauge for basement MEP checks, round dial face with scratched glass lens and rusty bezel, single pipe stub or sweat coupling on the back or bottom suggesting panel mount, needle frozen at mid scale as abstract tick marks only no legible numbers, dingy beige or gray metal case with oil smudge, handheld maintenance prop scale about palm wide, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Valve wheel (`valve-wheel.png`)

```
manual pipe valve wheel for geothermal or riser shutoff, circular cast-iron or brass handwheel with four spokes and worn knurl rim, short valve body stub with threaded pipe ends capped simple cylinders only, mineral scale and rust streaks on the body, practical Soviet-era plumbing look not modern chrome, maintenance tutorial prop scale about two palms across the wheel, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

**Melee — improvised / found (future catalog).**

### Metal pipe (`metal-pipe.png`)

```
short galvanized steel pipe club improvised melee weapon, thick plumbing pipe segment about forearm length with one end crushed flat or capped with welded plate and the other end rough cut burr, dull zinc-gray with rust freckles and dried stain streaks, no tape wrap no chain, stairwell scavenger blunt weapon readable silhouette heavier than a knife lighter than a bat, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Improvised spear (`improvised-spear.png`)

```
improvised spear assembled from rebar or sharpened flat steel on a pipe handle, long narrow total length about two forearms with tapered rusty spike head and electrical tape or wire lashing at the socket joint, chipped olive drab duct tape bands not bright silver, wobble in the head alignment slightly bent from prying use, low-tier reach weapon for stairwell militia not a proper bayonet, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

**Fungal farm floor — recoverable outputs (communal grow beds; not balcony crops).**

### Fungal loaf (`fungal-loaf.png`)

```
dense ration-grade fungal loaf for communal farm output, squat rectangular mycelium bread block with cracked gray-beige crust and darker damp crumb visible at one torn corner, wrapped in wax paper or thin cellulose sheet with grease stains and fold creases, no bakery branding no slice exposed, heavy calorie brick scale about two palms long and one palm thick, distinct from military field-rations foil brick, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Fungal armor fiber (`fungal-armor-fiber.png`)

```
bundle of cultivated fungal armor fiber sheets for suit reinforcement crafting, two or three layered pale gray mycelium-leather strips with fibrous edge read as low-poly fringe, lashed with twine or rubber band, faint spore dust on surfaces, farm quarantine lab output not animal hide, handheld bundle scale about forearm length, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Nutrient puck (`nutrient-puck.png`)

```
dry nutrient puck for bulk mycelium bed feeding, compressed brown-green disk cake with chalky surface and chipped edge exposing darker core, stacked two high optional second puck offset, faint chemical salt crust, farm input prop scale about fist diameter and two fingers thick, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Mycelium harvest block (`mycelium-harvest-block.png`)

```
raw mycelium harvest block cut from communal grow bed, irregular chunky slab of pale gray-white fungal mass with torn underside showing stringy root-like strands simplified as low-poly planes, damp sheen not glowing not emissive, bits of substrate grit clinging to the base, farm floor resource loot scale about two fists wide, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Quarantine spore culture (`quarantine-spore-culture.png`)

```
sealed quarantine spore culture vessel from farm sterile prep room, small rigid plastic bio box or metal canister with amber viewing window and red-white hazard stripe blocks only no legible text, rubber gasket lid clamped shut, faint condensation inside, distinct from field sample jar by heavier lab packaging and square profile, handheld loot scale about one forearm tall, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

**Extraction run recoverables.**

### Disinfectant bottle (`disinfectant-bottle.png`)

```
plastic disinfectant bottle for field wound cleaning and surface wipe-down, squat amber or cloudy white bottle with screw cap and narrow neck, peeling paper label as abstract green-gray smudge blocks only no legible text, dried splash residue on the shoulders, distinct from iodine tablet strips and bandage roll, handheld med loot scale about palm tall, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Pump impeller (`pump-impeller.png`)

```
small centrifugal pump impeller spare part for basement MEP maintenance, bronze or dull brass curved vane wheel with central keyed bore and chipped leading edges, light oil staining in the hub recess, no full pump housing no motor, maintenance salvage loot scale about fist diameter, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Battery 4-pack (`battery-4-pack.png`)

```
blister pack of four cylindrical batteries for blackout flashlights and radios, clear or yellowed plastic blister on faded cardboard backing with abstract red-black print blocks only no legible brand, four AA-scale cells visible through the blister two rows of two, corners dog-eared and dusty, utility loot scale about two palms wide, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Patrol lamp (`patrol-lamp.png`)

```
heavy militia patrol lantern for dark stairwell and checkpoint sweeps, squat rectangular metal body in chipped olive drab or faded gray-green with dented corner plates and rusty screw feet, front wire safety cage around a frosted glass or yellowed plastic lens panel not glowing not emissive, top bail handle plus side pistol-grip stub for one-hand carry, short rubberized power cable coiled and zip-tied to the back with frayed insulation at the plug end cap only no wall socket, abstract red-white hazard stripe blocks on one side panel no legible stencils, belt clip hook on the rear bracket, distinct from slim personal flashlight and from improvised trench candle tin, institutional Red Belt gear about two palms tall and one palm deep, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

---

## 3. Adding a new reference

1. Add `your-asset.png` next to the others (kebab-case slug).
2. Reuse the **same shared style prefix** (section 1).
3. Write a new **subject line** only: object era/role, materials, wear, silhouette, “centered and fully visible”, no environment/UI/watermark (those are already in the prefix—do not repeat unless the tool needs reinforcement).
4. Document the new subject block in section 2 above.

---

## 4. Checklist before generating

- [ ] Style prefix is unchanged (keeps all Mammoth references visually consistent).
- [ ] Subject describes **one** clear asset, orthographic-friendly, full object in frame.
- [ ] Output matches pipeline needs: **low-poly**, **game-ready**, **white background** for easy keying / texture authoring.
