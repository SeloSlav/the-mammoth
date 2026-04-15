---
name: WebGPU-only Three migration
overview: Replace `THREE.WebGLRenderer` with `THREE.WebGPURenderer`, standardize on the `three/webgpu` entry so the bundle uses the WebGPU-first Three build, and enforce WebGPU-only at runtime (no silent WebGL2 fallback). Address async `init()`, material/addon compatibility (notably `Sky`), and shared Vite/Vitest resolution so workspace packages do not pull two different Three builds.
todos:
  - id: alias-three-webgpu
    content: Add Vite resolve.alias `three` -> `three/webgpu` (client + editor) and align Vitest resolution for workspace Three imports
    status: completed
  - id: renderer-fp-editor
    content: Swap WebGLRenderer for WebGPURenderer in mountFpSession + editorSceneRuntime; await init(); assert WebGPU backend; add navigator.gpu gate + error UI
    status: completed
  - id: types-env-pmrem-perf
    content: Retype fpSessionEnvironment, editorSceneEnvironment, fpSessionPerfDebug; fix PMREM/WebGLRenderTarget typings for WebGPU path
    status: completed
  - id: compat-spike
    content: Validate Sky + Lambert ground + PMREM + TransformControls on WebGPU; port or replace any incompatible addon/material
    status: completed
  - id: manual-qa
    content: "Manual pass: FP gameplay loop, editor gizmos/environment toggle, GLTF loading, perf debug overlay copy"
    status: completed
isProject: false
---

# WebGPU-only rendering (no WebGL fallback)

## Reality check (scope)

The game is **already a Three.js scene graph** (heavy use in [`packages/world`](c:\WebProjects\the-mammoth\packages\world), [`packages/engine`](c:\WebProjects\the-mammoth\packages\engine), client/editor). There are **no custom `ShaderMaterial` / `onBeforeCompile` paths** in-repo—good for WebGPU.

**“WebGPU native” here means:** WebGPU is the **only** graphics API used at runtime (no WebGL1/2 canvas context, no Three WebGL2 backend). It does **not** mean rewriting the engine in raw WGSL—that would be a different product.

**Chosen approach:** Three.js **`WebGPURenderer`** + **`import * as THREE from 'three/webgpu'`** (per [Three’s WebGPURenderer manual](https://threejs.org/manual/en/webgpurenderer.html)).

**Critical Three.js behavior:** `WebGPURenderer` **defaults to WebGPU but can fall back to a WebGL2 backend** when WebGPU is unavailable ([docs](https://threejs.org/docs/pages/WebGPURenderer.html)). There is **no** `forceWebGPUOnly` flag. To meet “no WebGL fallback,” the app must:

1. **Pre-gate:** require `navigator.gpu` (and optionally `requestAdapter()` success) before constructing the renderer and show a **blocking UI** (existing route/shell—no new doc file unless you want release notes elsewhere).
2. **Post-gate:** after `await renderer.init()`, assert the active backend is **not** WebGL (Three exposes backend flags such as `renderer.backend.isWebGLBackend`—verify exact property names against **r183** typings/sources during implementation). If WebGL backend is selected, **fail closed** (dispose + error UI), even if rare.

Also pass **`forceWebGL: false`** explicitly in options for clarity (default is already false).

## Files that currently hardcode WebGL (direct edit list)

| Area | File |
|------|------|
| FP game | [`apps/client/src/game/mountFpSession.ts`](c:\WebProjects\the-mammoth\apps\client\src\game\mountFpSession.ts) (`new THREE.WebGLRenderer`, `renderer.render`) |
| Editor | [`apps/editor/src/editor/editorSceneRuntime.ts`](c:\WebProjects\the-mammoth\apps\editor\src\editor\editorSceneRuntime.ts) |
| FP env | [`apps/client/src/game/fpSessionEnvironment.ts`](c:\WebProjects\the-mammoth\apps\client\src\game\fpSessionEnvironment.ts) (types + tone mapping on renderer) |
| Editor PMREM | [`apps/editor/src/editor/editorSceneEnvironment.ts`](c:\WebProjects\the-mammoth\apps\editor\src\editor\editorSceneEnvironment.ts) (`WebGLRenderer`, `WebGLRenderTarget` typing from PMREM) |
| Perf debug | [`apps/client/src/game/fpSessionPerfDebug.ts`](c:\WebProjects\the-mammoth\apps\client\src\game\fpSessionPerfDebug.ts) (`WebGLRenderer` type) |

**Comments / HUD copy** mentioning WebGL (e.g. [`apps/client/src/ui/MammothFpsHud.tsx`](c:\WebProjects\the-mammoth\apps\client\src\ui\MammothFpsHud.tsx)) should be updated to neutral “GPU” wording.

## Build and module graph (avoid two Threes)

Use **one** Three entry everywhere the app bundles Three:

- Add Vite `resolve.alias` in **[`apps/client/vite.config.ts`](c:\WebProjects\the-mammoth\apps\client\vite.config.ts)** and **[`apps/editor/vite.config.ts`](c:\WebProjects\the-mammoth\apps\editor\vite.config.ts)**:

  - `three` → `three/webgpu`

This rewrites imports from linked workspace packages (`@the-mammoth/engine`, `@the-mammoth/world`) during client/editor builds so you do not accidentally ship **`three` + `three/webgpu`** twice.

Mirror the same alias in **Vitest** config blocks where packages import Three (client/editor `vite.config.ts` already has `test`; extend world/engine vitest configs if they bundle Three in tests—today most tests only use scene/math, but resolution should stay consistent).

## Renderer lifecycle changes

### Async initialization

Per Three docs, either:

- **`await renderer.init()`** before first use when using a manual `requestAnimationFrame` loop (current pattern in [`mountFpSession`](c:\WebProjects\the-mammoth\apps\client\src\game\mountFpSession.ts)), **or**
- Switch to **`renderer.setAnimationLoop(...)`** so init is ordered correctly.

**Recommendation:** keep your RAF structure if preferred, but **`await renderer.init()` immediately after** constructing the renderer and **before** `PlayerPresentationManager.create` / heavy GLTF work, so the first frame and asset upload paths see a live device.

### Construction

Replace:

```ts
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
```

with:

```ts
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: false });
await renderer.init();
```

(Exact `WebGPURenderer` import style: either `THREE.WebGPURenderer` from `three/webgpu` or explicit addon import—match Three r183’s public export surface.)

### Typing

Prefer **`THREE.WebGPURenderer`** (or Three’s shared **`Renderer`** base type if it cleanly covers `info.render` for perf debug) in:

- `attachFpSessionEnvironment`
- `createEditorPmremEnvironment`
- `createFpSessionPerfDebugPostRenderHook`

Update **`WebGLRenderTarget`** references in editor PMREM glue to whatever **`PMREMGenerator.fromScene`** returns under WebGPU in r183 (may still be typed as `WebGLRenderTarget` internally—verify and adjust types without changing behavior).

## Feature compatibility checklist (order of risk)

1. **`Sky` from `three/addons/objects/Sky.js`** in [`fpSessionEnvironment.ts`](c:\WebProjects\the-mammoth\apps\client\src\game\fpSessionEnvironment.ts): classic addon shaders are a common WebGPU pain point. **Spike first in FP session:** if it fails to compile/render, replace with a supported WebGPU path (e.g. simpler sky/fog-only backdrop, or a TSL/node-material sky from Three examples) while preserving the outdoor look as closely as practical.
2. **`MeshLambertMaterial`** on the infinite ground plane: validate under WebGPU; if unsupported or visually wrong, switch to **`MeshStandardMaterial`** (or node material equivalent) with minimal parameter tuning.
3. **Controls:** [`TransformControls`](c:\WebProjects\the-mammoth\apps\client\src\game\fpViewmodelAuthoringOverlay.ts) (canvas as DOM element) and editor [`TransformControls(camera, null)`](c:\WebProjects\the-mammoth\apps\editor\src\editor\editorSceneRuntime.ts) + pointer hack—retest drag/commit paths on WebGPU builds (pointer capture behavior should be unchanged, but verify).
4. **PMREM + `RoomEnvironment`** in editor: validate `PMREMGenerator` path on `WebGPURenderer`; this is the only explicit `WebGLRenderTarget` usage found.

## Runtime UX (WebGPU required)

Centralize a small helper (client + editor), e.g. `assertWebGpuAvailable(): Promise<GPUAdapter | null>`:

- If missing: show **hard stop** message (“WebGPU required—update Chrome/Edge, enable flags, or use supported OS/GPU drivers”).
- If `init()` or backend assertion fails: same UI, log structured error.

No silent degradation.

## Testing strategy

- **Automated:** existing Vitest suites mostly use Three as **data structures**, not GPU—should keep passing once module resolution is consistent.
- **Manual matrix:** Chrome/Edge stable with WebGPU enabled; verify FP session + editor: shadows toggle, environment toggle, FP outdoor scene, elevator world, GLTF weapons/dropped items, dev overlays.

## Optional follow-up (not required for “no WebGL”)

- Bump Three on a schedule while WebGPURenderer matures (perf regressions have been reported across minors—track release notes).
- Consider `setAnimationLoop` everywhere for canonical ordering with WebGPU/XR later.
