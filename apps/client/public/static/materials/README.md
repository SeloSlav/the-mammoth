Place authorable texture maps here for use in editor `mapUrl` material slots.

Supported URL extensions: `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`, `.ktx2` (BasisU / KTX2 — see `PBR_PIPELINE.md`).

Use URLs like:

- `/static/materials/cab/metal-panel.png`
- `/static/materials/stairwell/concrete.webp`

**Default PBR rule:** basecolor + normal + roughness for most architecture; height and metalness maps are opt-in only. See `PBR_PIPELINE.md`.
