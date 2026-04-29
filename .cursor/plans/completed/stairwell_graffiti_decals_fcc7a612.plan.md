---
name: Stairwell graffiti decals
overview: Add a small decal subsystem under `apps/client/src/rendering/decals/` using `DecalGeometry` for projected paint and `PlaneGeometry` for flat paper/stickers, wired once after the FP static world is built. Stairwell authoring will use deterministic, low-count placements per shaft segment, reusing one transparent graffiti asset as a manifest placeholder until more art exists.
todos:
  - id: decal-module
    content: Add apps/client/src/rendering/decals/* (types, manifest with blok47 placeholders, material factory, DecalManager with DecalGeometry + Plane paths, texture/material caching)
    status: completed
  - id: stair-resolve
    content: Implement stair segment mesh collection + raycast target resolution for post-merge merged meshes; deterministic placement generator (3 decals/segment, jitter, placeholder id variety)
    status: completed
  - id: wire-fp-session
    content: Instantiate DecalManager in mountFpSession after buildingRoot added; preload; load stairwell placements; dispose on session teardown
    status: completed
  - id: assets-public
    content: Add public folder structure + copy/export alpha-clean blok47.webp/png; optional grime_01 placeholder later
    status: completed
  - id: tests
    content: Add small vitest coverage for placement/segment resolution + RNG stability
    status: completed
isProject: false
---

# Stairwell graffiti / decal system (runtime-first)

## Constraints from your codebase

- **Renderer:** FP uses `WebGPURenderer` in [`apps/client/src/game/mountFpSession.ts`](c:\WebProjects\the-mammoth\apps\client\src\game\mountFpSession.ts), not `WebGLRenderer`. The `DecalManager` constructor should accept `THREE.WebGPURenderer | THREE.WebGLRenderer` (same `capabilities.getMaxAnisotropy()` API).
- **Merged geometry:** [`mergeStaticFloorGeometries`](c:\WebProjects\the-mammoth\apps\client\src\game\fpSessionWorldMount.ts) replaces stair-segment subtrees with **unnamed merged `Mesh` instances per material** (see `mergeGroupDescendantsByMaterial`). Pre-merge names like `shaft_wall` from [`stairElevatorPlaceholders.ts`](c:\WebProjects\the-mammoth\packages\world\src\stairElevatorPlaceholders.ts) are **not reliable placement keys** after merge.
- **Hierarchy to target:** Stair shafts are grouped under `buildingRoot` children with `userData.mammothStairColumnRoot === true`, named `stair_shaft:${spec.id}` (see [`addBuildingStairShaftColumnsToRoot`](c:\WebProjects\the-mammoth\packages\world\src\buildingStairShafts.ts)). Each storey segment is a child group named `stair_shaft_segment_${i}` carrying `userData.mammothPlateLevelIndex`.

## Implementation layout (matches your requested modules)

Create under **`apps/client/src/rendering/decals/`** (not repo-root `src/`):

| File | Role |
|------|------|
| [`decalTypes.ts`](apps/client/src/rendering/decals/decalTypes.ts) | `DecalCategory`, manifest entry type, serializable `DecalPlacement`, options types |
| [`decalManifest.ts`](apps/client/src/rendering/decals/decalManifest.ts) | `DECAL_MANIFEST` + **placeholder duplication**: several `graffiti` ids (`blok47_a`, `blok47_b`, …) all pointing at the **same** URL until you add more files |
| [`createDecalMaterial.ts`](apps/client/src/rendering/decals/createDecalMaterial.ts) | `MeshStandardMaterial` factory: maps `colorSpace`, `anisotropy`, wrap, `transparent` / `alphaTest`, `depthWrite`, `polygonOffset`, roughness/metalness; material cache keyed by `(id, opacity variant, flags)` |
| [`DecalManager.ts`](apps/client/src/rendering/decals/DecalManager.ts) | `preloadManifest`, `spawnProjectedDecal`, `spawnFlatDecal`, `removeDecal`, `clear`, `spawnFromPlacement`, `serializeDecal`, `loadPlacements`; scene group `"Decals"` |
| [`decalPlacementResolve.ts`](apps/client/src/rendering/decals/decalPlacementResolve.ts) | **Stairwell-aware helpers**: given `buildingRoot` + shaft id + `mammothPlateLevelIndex`, return candidate `THREE.Mesh[]` under that segment; short raycast along `-normal` from `position + normal * ε` to pick the hit mesh for `DecalGeometry` |
| [`DecalPlacementTool.ts`](apps/client/src/rendering/decals/DecalPlacementTool.ts) | **Stub** or minimal `Raycaster`-based “pick wall + dump JSON” only if you want editor parity later; otherwise omit heavy UI and keep a `console.debug` helper behind `import.meta.env.DEV` |

## Core behavior

### 1) Projected decals (graffiti / “paint”)

- Use `DecalGeometry` from `three/examples/jsm/geometries/DecalGeometry.js`.
- **Target mesh acquisition (post-merge safe):** resolve with `Raycaster` against meshes in the **stair segment subtree** (or fall back to all meshes under the segment if ray miss — then skip or log once).
- Orientation: build `THREE.Euler` / `THREE.Quaternion` from provided **outward** `normal` + optional `rotation` around normal.
- Depth fighting: `depthWrite: false`, `polygonOffset: true`, negative `polygonOffsetFactor` as specified; `transparent` + small `alphaTest` for graffiti.

### 2) Flat decals (posters / stickers later)

- `PlaneGeometry(width, height)`, basis from `normal`, offset `position + normal * 0.002`.
- Stickers: higher `alphaTest` (~0.45) when transparent.

### 3) Texture pipeline

- `THREE.TextureLoader` + cache by **URL** (not id) so duplicate manifest ids sharing one file still load once.
- `texture.colorSpace = THREE.SRGBColorSpace`
- `texture.anisotropy = renderer.capabilities.getMaxAnisotropy()`
- `ClampToEdgeWrapping` on S/T
- Reuse materials; clone only when `opacity` / per-instance flags differ.

### 4) Instance tagging / performance

- Parent group `scene.getObjectByName("Decals")` or create once.
- Each decal mesh: `userData.isDecal = true` (and optionally `userData.decalPlacement` for serialize).
- **No per-frame updates.** Frustum culling stays on (`true`).
- Do not add decals to collision/analytic indices (they must not affect physics).

### 5) Grime hook (lightweight)

- If `grime: true` and `/assets/decals/grime/grime_01.webp` exists, spawn a **second** projected or flat layer: slightly larger scale, slightly offset along normal, lower opacity, same material policy (multiply-like look is approximated via dark transparent albedo; no custom shader unless needed).

## Stairwell rollout (your current goal)

### Asset

- Add the **alpha-clean** graffiti as `apps/client/public/assets/decals/graffiti/blok47.webp` (or `.png`).  
- Until you export WebP/PNG with real alpha, keep a known-good placeholder file; the “gray field” version will read as a rectangle — your note is correct.

### Manifest placeholders

- Define ~6–10 manifest entries (different `id`s) all pointing at the same `url` so placement code can vary id **without** duplicating binary assets.
- Categories: only `graffiti` used now; keep `posters`, `stickers`, `grime` entries minimal or empty with TODO.

### Placement data (recommended shape for this project)

Extend your proposed `DecalPlacement` with optional **shaft scoping** (works with merged meshes):

```ts
type DecalPlacement = {
  id: string;
  category: "graffiti" | "poster" | "sticker";
  mode: "projected" | "flat";
  // Prefer these for stairwells in merged geometry:
  stairShaftId?: string;        // matches BuildingStairShaftSpec.id
  storeyLevelIndex?: number;     // matches userdata.mammothPlateLevelIndex on segment
  // Legacy / optional:
  targetMeshName?: string;       // best-effort pre-merge only; raycast preferred at runtime
  position: [number, number, number];
  normal: [number, number, number];
 rotation?: number;
  size?: [number, number, number];
  width?: number;
  height?: number;
  opacity?: number;
  grime?: boolean;
};
```

### Variation + count

- **Deterministic RNG** (mulberry32 or hash of `shaftId:level:slot`) to choose among placeholder graffiti ids, jitter `rotation` ±0.12 rad, `size` ±10%, and nudge `position` a few cm along tangent **within the same wall hemisphere**.
- **Budget:** ~**3 projected tags per stair segment** (not per floor of whole building): e.g. one near landing mid-height, one lower “corner grime” zone, one near rail height — skip duplicates if raycast misses.

### Wire-in point

- After [`createFpSessionStaticWorld()`](c:\WebProjects\the-mammoth\apps\client\src\game\fpSessionWorldMount.ts) returns and **`scene.add(buildingRoot)`** in [`mountFpSession.ts`](c:\WebProjects\the-mammoth\apps\client\src\game\mountFpSession.ts):
  - `const decals = new DecalManager(scene, renderer)`
  - `await decals.preloadManifest(DECAL_MANIFEST)`
  - `decals.loadPlacements(generateStairwellDecalPlacements(buildingRoot, stairSpecs), meshResolver)`
  - Store `decals` on teardown and `decals.clear()` in session dispose.

Initial placements can live either in:
- a small TS module [`stairwellDecalPlacements.ts`](apps/client/src/rendering/decals/stairwellDecalPlacements.ts) that builds placements from `stairSpecs` at runtime (fastest), **or**
- [`content/cells/cell_0_0.json`](content/cells/cell_0_0.json) once the JSON loader path exists (future).

## Compatibility / risk checks

- Verify `DecalGeometry` works with merged buffer geometry (it should; watch for non-indexed meshes — merged output is typically indexed/nonindexed consistently per bucket).
- WebGPU path: if any decal artifact appears, fallback is `spawnFlatDecal` for graffiti (still acceptable visually).

## Tests (light)

- Unit-test pure helpers in `decalPlacementResolve.ts`: segment lookup by `stairShaftId` + `mammothPlateLevelIndex`, deterministic RNG produces stable transforms given seed.

## Deliverables checklist

- New folders under `apps/client/public/assets/decals/{graffiti,posters,stickers,grime}/` (**grime art optional**).
- Decal module under `apps/client/src/rendering/decals/`.
- Example usage wired in `mountFpSession` after world mount.
- No changes to server/sim; rendering-only.
