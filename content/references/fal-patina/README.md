# fal.ai PATINA — PBR material prompts (Mammoth house style)

Reference for text-to-PBR generation with **[fal-ai/patina/material](https://fal.ai/models/fal-ai/patina/material)** (tiling basecolor + normal, roughness, metalness, height).

## Token budget (this matters more than wording tricks)

Patina follows **whatever gets the most concrete nouns**. If Yugoslav / apartment / housing / panel / institutional copy is **long**, it can outweigh the material and become a **building render**.

**Target ratio for a single `prompt` string:**

| Share of prompt | Content |
|-------------------|---------|
| **~70–85%** | **Parts B + C** — physical substance: minerals, coatings, rubber, metal oxides, grout, glass defects, scratch directions, pore sizes, gloss level, micro-geometry words a texture artist would use |
| **~10–20%** | **Part A** — flat swatch / orthographic / edge-to-edge surface lock-in |
| **~5–10% max** | **Part D** — **one short clause** at the very end: Yugoslav-era apartment-block **only** as a **palette and patina steer**, not a place, not a building description |

If you still get façades, **delete part D** for a run (material-only), then add back the **shortest** tail below. Keep **`enable_prompt_expansion: false`** while iterating.

---

## Why “Yugoslav apartment complex exterior” appears

Words like **mass-housing, panel-era, institutional look, residential, exterior, complex, block** (in long chains) are strongly associated with **reference photos of whole buildings**. The model completes that prior.

**Part D should not restate weathering** that you already wrote in B–C (that doubles “environment story” tokens). Put **rain, grime, heating-season** detail in **B–C**; keep **D** to **color / stain family** only.

---

## 1. Prompt structure (order: A → B → C → D)

| Part | Length | Role |
|------|--------|------|
| **A** | Short | Lock to **material board / swatch**: seamless, orthographic, edge-to-edge surface |
| **B** | Long | **What it is** — chemistry and layers of the material |
| **C** | Medium | **How it wears** — scratches, oils, efflorescence, pollution, chips |
| **D** | **One short clause, end only** | **Yugoslav-era apartment-block** as **palette + patina steer** (see below) |

### A — Flatbed lock-in (start every prompt; keep compact)

```
Physical seamless PBR material swatch, orthographic macro photograph, camera square to the surface, even diffuse studio light, the entire image is one continuous expanse of this substance edge to edge, laboratory material-board framing,
```

### D — Mammoth era tail (**one line, end only**; do not lengthen)

Copy **exactly** this at the **very end** of the string (after all material detail):

```
Very light Yugoslav-era apartment-block palette and patina steer for stains and chalk tones only.
```

If that **still** pulls buildings, use this **even shorter** variant (drops “apartment”):

```
Very light Yugoslav-era Balkan brutalist maintenance palette steer for stains and chalk only.
```

If problems persist, **omit D** entirely — the material description should stand alone.

### Words that belong almost only in B–C (not in D)

Aggregate, binder, porosity, spall, efflorescence, silicone, spandrel, brushed grain, rubber vulcanizate, glaze crawl, grout recession, specular breakup, oxide, patina, micro-scratch, stud wear, bitumen granule, etc.

### Scene-trigger words — keep out of B–C and keep D minimal

| Avoid in B–C | Why |
|--------------|-----|
| apartment complex, housing estate, building, façade, tower, elevation, windows, balconies | Scene completion |
| shaft, lobby, cab, room | Interior scene |
| mass-housing, panel block, panel-era, institutional look | Stock photo of blocks |

---

## 2. Endpoint reminders

- **Model:** [`fal-ai/patina/material`](https://fal.ai/models/fal-ai/patina/material).
- **Tiling:** `tiling_mode: "vertical"` for vertical glass/metal banding if you see horizontal seam bands; else `"both"`.
- **`enable_prompt_expansion: false`** while dialing prompts (expansion often adds architecture).

---

## 3. Paste-ready prompts (heavy B+C, short A, one-line D)

Each block is one `prompt`. **Material clauses are intentionally long**; Yugoslav appears **once**, **last**, **brief**.

### Precast concrete

```
Physical seamless PBR material swatch, orthographic macro photograph, camera square to the surface, even diffuse studio light, the entire image is one continuous expanse of this substance edge to edge, laboratory material-board framing, rough Portland-cement-rich cast concrete, visible sand and coarse aggregate breakouts, subtle shutter-skin ghost lines, capillary pores and frost micro-pitting, hairline map cracking, vertical hydrostatic wash faintly lightening highs, cold gray-beige albedo drift, dusty microfilm in recesses, matte to satin specular breakup, Very light Yugoslav-era apartment-block palette and patina steer for stains and chalk tones only.
```

### Chalky cement render / stucco

```
Physical seamless PBR material swatch, orthographic macro photograph, camera square to the surface, even diffuse studio light, the entire image is one continuous expanse of this substance edge to edge, laboratory material-board framing, thick chalky cement-lime render skin, trowel skip and roller overlap ghosts, patch laminates in mismatched off-white and sand beige, soft efflorescence bloom in lows, micro crazing under chalk skin, algae-green haze only as a bottom-weighted tone smear, matte powder absorbency look, Very light Yugoslav-era apartment-block palette and patina steer for stains and chalk tones only.
```

### Painted weathered steel (institutional green)

```
Physical seamless PBR material swatch, orthographic macro photograph, camera square to the surface, even diffuse studio light, the entire image is one continuous expanse of this substance edge to edge, laboratory material-board framing, cold-rolled steel substrate under alkyd enamel, dull institutional green with chalky UV fade, chipped corners exposing dark gray steel oxide, directional maintenance scratches, pollen and road dust lodged in scratch valleys, satin metal micro-specular where burnished, Very light Yugoslav-era apartment-block palette and patina steer for stains and chalk tones only.
```

### Elevator exterior (shaft cladding: smoked glass + matte gunmetal spandrel bands)

```
Physical seamless PBR material swatch, orthographic macro photograph, camera square to the surface, even diffuse studio light, the entire image is one continuous expanse of this substance edge to edge, laboratory material-board framing, repeating vertical bands at texture scale only: smoked tempered safety glass with airborne dust pitting, windborne grit micro-arc scratches, and greasy vertical smear lanes, alternating with narrow matte gunmetal enamel on steel flats with salt-fog micro-pitting and UV chalk at enamel highs, specular on glass broken into soft gray noise and smear, diffuse abstract reflection field, chalky silicone fillet beads and blackened gasket squeeze-out as thin linear inclusions, edge mineral bloom where glass meets metal, cold gray-green neutral density, Very light Yugoslav-era apartment-block palette and patina steer for stains and chalk tones only.
```

### Elevator interior walls (cab lining: brushed stainless + maintenance wear)

```
Physical seamless PBR material swatch, orthographic macro photograph, camera square to the surface, even diffuse studio light, the entire image is one continuous expanse of this substance edge to edge, laboratory material-board framing, AISI 304 brushed sheet, long uniform grind lines, intermittent narrow panel lap seams as shallow brightness discontinuities, stamped rivet bumps as tiny circular highlights, fingerprint lipid sheen as blotchy low-contrast oil film, random micro-dent population from impact, families of fine horizontal abrasion lines from cart and luggage contact superimposed on grain, soft institutional specular lobes, Very light Yugoslav-era apartment-block palette and patina steer for stains and chalk tones only.
```

### Elevator interior floor (cab: charcoal studded rubber mat)

```
Physical seamless PBR material swatch, orthographic macro photograph, camera square to the surface, even diffuse studio light, the entire image is one continuous expanse of this substance edge to edge, laboratory material-board framing, vulcanized SBR rubber mat compound in charcoal gray, dense small cylindrical studs on square pitch, stud crowns worn flat with matte polish paths, inter-stud valleys packed with compacted dust and grit, micro UV chalking as a faint purple-gray veil, rubber tear nicks at random stud bases, dark mineral oil and hydraulic fluid diffuse halos wicking into rubber as low-contrast blotches, embedded fine quartz sparkle in compound, Very light Yugoslav-era apartment-block palette and patina steer for stains and chalk tones only.
```

### Smoked glass + matte gunmetal spandrel bands (generic vertical glazing stack texture)

```
Physical seamless PBR material swatch, orthographic macro photograph, camera square to the surface, even diffuse studio light, the entire image is one continuous expanse of this substance edge to edge, laboratory material-board framing, repeating vertical bands at texture scale only: smoked tempered safety glass with airborne dust pitting and greasy vertical smear lanes, alternating with narrow matte gunmetal enamel on steel flats, specular on glass broken into soft gray noise and smear, diffuse abstract reflection field, chalky silicone fillet beads and blackened gasket squeeze-out as thin linear inclusions, edge mineral bloom where glass meets metal, cold gray-green neutral density, Very light Yugoslav-era apartment-block palette and patina steer for stains and chalk tones only.
```

### Concrete + ferric drip staining

```
Physical seamless PBR material swatch, orthographic macro photograph, camera square to the surface, even diffuse studio light, the entire image is one continuous expanse of this substance edge to edge, laboratory material-board framing, coarse crushed-stone concrete matrix, open capillary pores, dark ferric hydroxide drip ribbons following gravity microchannels, manganese staining interleaved, pale calcium leach halos, rain splash micro-roughening on highs, dry powder silt in pits, Very light Yugoslav-era apartment-block palette and patina steer for stains and chalk tones only.
```

### Small glazed ceramic wall tile + grout

```
Physical seamless PBR material swatch, orthographic macro photograph, camera square to the surface, even diffuse studio light, the entire image is one continuous expanse of this substance edge to edge, laboratory material-board framing, small square sanitary glaze tiles in pale olive and dirty cream, crazing in glaze film, yellowed cementitious grout joints with recession and micro-cracking, soap-fat haze as thin wax bloom, random edge chips exposing biscuit body, slightly irregular joint spacing within tolerance, Very light Yugoslav-era apartment-block palette and patina steer for stains and chalk tones only.
```

### Terrazzo

```
Physical seamless PBR material swatch, orthographic macro photograph, camera square to the surface, even diffuse studio light, the entire image is one continuous expanse of this substance edge to edge, laboratory material-board framing, epoxy-cement terrazzo matrix in mid gray, embedded marble and limestone chips in beige rust and charcoal, progressive honing wear exposing fresh chip faces, fine random scuff arcs, semi-matte polish with broken specular specks, Very light Yugoslav-era apartment-block palette and patina steer for stains and chalk tones only.
```

### Bitumen roll roofing

```
Physical seamless PBR material swatch, orthographic macro photograph, camera square to the surface, even diffuse studio light, the entire image is one continuous expanse of this substance edge to edge, laboratory material-board framing, oxidized SBS-modified bitumen cap sheet, embedded color granules with partial loss, alligator micro-check cracking, dust film and pollen speckle, lap seam ghost as a faint thickness ridge, ultra-low sheen, Very light Yugoslav-era apartment-block palette and patina steer for stains and chalk tones only.
```

### Perforated painted steel sheet

```
Physical seamless PBR material swatch, orthographic macro photograph, camera square to the surface, even diffuse studio light, the entire image is one continuous expanse of this substance edge to edge, laboratory material-board framing, cold-rolled steel perforated by round punch grid, olive drab powdercoat with UV chalk and edge chip exposing bright steel, directional shipping scratches across lands between holes, stamping draw-in relief around perforations, Very light Yugoslav-era apartment-block palette and patina steer for stains and chalk tones only.
```

---

## 4. After generation

- Check tile seams; tune `tiling_mode`, `tile_size`, `tile_stride` per [fal PATINA material docs](https://fal.ai/models/fal-ai/patina/material).
- For continuity with existing assets, use **image-to-image** with `image_url` and moderate `strength`.

---

## 5. Adding new entries

1. Write **B + C first** in a scratch line — aim for **most of the tokens** there.
2. Prepend **A**, append **D** as the **single** short line from section 1 (or omit D on first test).
3. Do not put Yugoslav, apartment, Balkan, or era words anywhere except **D**, unless you are naming a **material system** (e.g. “Portland cement”) with zero building association.
