# Meshy / image-gen reference prompts

Reference PNGs in this folder (`*-lowpoly-reference.png`) are used as visual targets for **text-to-3D** or **image-to-3D** tools (e.g. Meshy). Prompts are built in **two parts**:

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

### Hand (`fist-lowpoly-reference.png`)

```
right human hand in relaxed closed grip pose, designed to hold melee weapons, slightly stylized proportions, visible knuckles, subtle skin texture, no weapon included, clean topology for animation, wrist included, centered and fully visible
```

### Crowbar (`crowbar-lowpoly-reference.png`)

```
worn industrial crowbar, slightly stylized but grounded proportions, chipped red paint with exposed metal edges, mild rust near joints, simple geometry optimized for game use, clean silhouette, no excessive detail, realistic weight and thickness, centered and fully visible
```

### Knife (`knife-lowpoly-reference.png`)

```
simple 1980s Yugoslav utility knife, straight narrow blade with slight taper, worn stainless steel with faint scratches, modest wooden or dark plastic handle with visible rivets, practical non-tactical design, slightly rounded edges from use, subtle discoloration and age, no branding or modern features, believable household or worker tool, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Baseball bat (`baseball-bat-lowpoly-reference.png`)

```
wood baseball bat, faceted low-poly barrel tapering to a tape-wrapped handle and a simple octagonal knob, flat barrel end, weathered pale wood with dark reddish dried-stain streaks and scattered scuffs, dirty beige athletic tape with visible overlap bands, small weathered red star accent near the grip, abstract worn red painted bands along the barrel (no legible lettering), grounded improvised melee prop, clean game-ready silhouette, centered and fully visible
```

### Srbosjek (`srbosjek-lowpoly-reference.png`)

```
right-hand heavy leather work glove with palm open toward camera, thick weathered brown leather, dull olive drab metal palm and wrist plate bolted flat to the glove, rusty L-shaped outer bracket on the pinky side, short thick single-edged blade mounted vertical along the outer edge parallel to the fingers, curved cutting edge and flat spine, blade and bracket show rust and scuffs, grounded industrial improvised look, clean low-poly geometry optimized for game use, strong readable silhouette, centered and fully visible
```

### Male body A-pose (`male-body-apose-lowpoly-reference.png`)

```
adult Slavic male character in neutral A-pose, average build with slight softness and natural proportions, not athletic or exaggerated, subtle asymmetry in posture, light body hair on arms and chest, slightly tired facial features, short practical haircut, wearing simple worn boxer briefs in muted color, no branding, relaxed hands and neutral expression, clean topology suitable for rigging, evenly distributed edge flow, realistic human proportions adapted to slightly stylized form, no extreme detail, centered and fully visible
```

---

## 3. Adding a new reference

1. Add `your-asset-lowpoly-reference.png` next to the others.
2. Reuse the **same shared style prefix** (section 1).
3. Write a new **subject line** only: object era/role, materials, wear, silhouette, “centered and fully visible”, no environment/UI/watermark (those are already in the prefix—do not repeat unless the tool needs reinforcement).
4. Document the new subject block in section 2 above.

---

## 4. Checklist before generating

- [ ] Style prefix is unchanged (keeps all Mammoth references visually consistent).
- [ ] Subject describes **one** clear asset, orthographic-friendly, full object in frame.
- [ ] Output matches pipeline needs: **low-poly**, **game-ready**, **white background** for easy keying / texture authoring.
