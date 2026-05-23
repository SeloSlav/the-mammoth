# FP apartment interior performance (locked baseline)

**Status:** Accepted baseline as of **2026-05-20**  
**Primary unit under test:** `floor_mamutica_typical|20|unit_e_003` (furnished east wall, dense decor GLBs)  
**Related code:** `apps/client/src/game/fpApartment/fpApartmentInteriorPropVisibility.ts`, `fpApartmentDecorMeshes.ts`  
**Related architecture:** [fp-building-mesh-visibility.md](fp-building-mesh-visibility.md)

---

## Executive summary

First-person apartment performance is **solid** after interior prop visibility budgeting landed in commit **`621829ce`** (*add collision to interior apartment walls, and some other FPS fixes*, 2026-05-20). The remaining heavy cost — **~190–270k submitted triangles** when looking at a fully furnished wall — is expected and **stable** when the camera is not rapidly changing which decor groups are visible.

The old **hitch while turning** was not “this apartment is too heavy to run.” It was **per-frame visibility churn**: spinning in a small unit kept too many high-poly decor meshes in the frustum pass, then showed many of them in a single frame when yaw crossed the forward cone. That produced triangle spikes (~45k → ~270k), `renderMs` spikes with `renderThreeMs` still ~4 ms (present/GPU/compositor), and subjectively bad stutter.

**Holding the furnished east wall** is the easier case: visibility is steady, GPU state stays warm, and captures show **99% of frames in the 4–8 ms bucket** with **p99 ≈ 8.1 ms**.

---

## Root cause (why turning hurt, wall view did not)

### What was expensive

- **Apartment decor** (`apartmentDecor` groups) are merged GLB furniture per placed object; individual meshes can be **6k–22k triangles** each.
- While **inside your unit**, decor is demand-loaded and only groups for the **containing unit** are eligible (`containingUnitKey` match in `resolveApartmentInteriorPropGroupVisible`).
- Without in-unit culling, **spinning** keeps essentially **all** furnished props in the camera frustum. Internal comments and captures reference **~500k+ triangles** in that situation.
- A **fast 180° turn** can flip dozens of groups from hidden → visible in **one frame**, forcing WebGPU pipeline warm-up and a large submitted triangle count in a single frame.

### What was not the main story

- **Stationary view of the heaviest wall** (~195k tris, yaw ~154°–179°): cost is high but **flat frame-to-frame**. No mass visibility toggle, no triangle count swing.
- **HUD “130+ FPS”** vs profiler **cadence ~100–120**: different metrics (see [How to read captures](#how-to-read-captures)); both can be true on the same session.
- **Decor mesh count / layout unchanged**: fixes are runtime visibility and show budgeting, not content removal.

---

## Mitigations (why it stays solid now)

Implemented in `fpApartmentInteriorPropVisibility.ts` and applied from `fpApartmentDecorMeshes.ts` when syncing decor visibility.

| Mechanism | Constant / behavior | Effect |
|-----------|---------------------|--------|
| **Behind-camera cull (in-unit)** | `APARTMENT_INTERIOR_PROP_BEHIND_CAMERA_DOT_MAX = 0` | Props clearly behind the viewer are not drawn while inside the unit. |
| **Entry warm-up burst** | `APARTMENT_INTERIOR_PROP_WARMUP_MAX_SHOWS_PER_FRAME = 32` | On unit entry, all decor groups ramp visible quickly (camera cone ignored) so WebGPU pipelines compile up front instead of during turns. |
| **Steady-state immediate apply** | After warm-up per decor key | No per-frame show budget or forward-cone hysteresis while turning — only behind-camera + frustum. |
| **Partition / mirror bypass** | `skipInteriorForwardCone` | Low-poly structural props do not participate in decor warm-up. |
| **Frustum + bounds** | `APARTMENT_PROP_FRUSTUM_MARGIN_M = 1.5` | Standard frustum test on expanded decor bounds. |

**Design intent:** pay pipeline compilation once on entry, then keep rotation visibility transitions immediate so triangle count does not ramp over many frames during spins.

Tests: `apps/client/src/game/fpApartment/fpApartmentInteriorPropVisibility.test.ts`.

---

## Evidence (2026-05-20 captures, same build, same unit)

All three sessions are in **`unit_e_003`** with no decor content changes between captures. Differences are **camera motion** and **session/GPU state**, not apartment layout.

### Summary table

| Capture | Time (UTC) | Motion | Cadence FPS | Avg frame | p95 / p99 | 4–8 ms bucket | 8–16 ms bucket | Worst frame | Notes |
|---------|------------|--------|-------------|-----------|-----------|---------------|----------------|-------------|-------|
| Pre-fix spin | ~16:02 | Spin / furnished wall yaw ~90–103° | ~123.5 | 5.8 ms | 9.5 / 10.7 ms | 86% | 14% | 11.9 ms | Heavy-mesh peaks ~274k @ ~103°; visible hitch feel |
| Pre-fix spin | ~16:08 | Spin | ~108.7 | 6.6 ms | 9.5 / 10.7 ms | 86% | 14% | 11.9 ms | Similar peaks; higher `present` avg |
| Post-fix spin | ~17:15 | Spin / wall yaw ~68° | ~120.5 | 5.6 ms | 8.0 / 9.9 ms | **95%** | 5% | 13.3 ms | Peaks ~267k; subjectively smooth |
| **East wall hold** | **~17:17** | **Fixed ~176°, heaviest wall** | **~99.3** | **5.3 ms** | **6.4 / 8.1 ms** | **99%** | **1%** | **9.5 ms** | **~195k tris stable**; no heavy-mesh peak list |

### Interpretation

1. **Post-fix spin** improves the **histogram** (95% vs 86% in 4–8 ms) and cuts worst-case multi-frame stutter vs the earlier spin captures, even when peak triangles are still ~267k at ~68° yaw.
2. **East wall hold** is the **strictest static stress test** in these logs: high `frUI` (~97), high `frProps` (~37), ~195k tris — yet **tightest** latency distribution (p99 8.1 ms, only 13 frames outside 8 ms in 10 s).
3. **Cadence FPS ~99** on the wall hold with **avg 5.3 ms** is not a contradiction: sample count and compositor pacing differ; trust **frame ms percentiles** for hitch feel.

### Typical bad frame signature (pre-fix hitch)

From timeline rows during spin at ~274k tris:

- `totalMs` ~7–11 ms  
- `renderMs` ~7–10 ms  
- `renderThreeMs` ~4 ms  

So the spike was often **not** Three.js CPU doubling; it was **render/present/GPU finish** on frames where triangle load stepped up.

### Typical good frame signature (post-fix)

- Spin: mostly **5–6 ms** total with brief **8–10 ms** at wall glances.  
- Wall hold: **4.7–6.5 ms** for long stretches; short **8–9 ms** blips at end of one 10 s window (1% of frames).

---

## How to read captures

The client perf export (`fpSessionPerfStore`) reports two throughput numbers:

| Line | Meaning |
|------|---------|
| **FPS (cadence)** | Profiler ring samples per second ≈ completed frame count in the window. Includes all pacing and occasional slow frames. **Use this for hitch feel.** |
| **CPU (avg frame)** | `1000 / avgTotalMs`. “If every frame took the average length.” Often **higher** than cadence FPS; matches HUD-style rolling averages (~180+ when avg ≈ 5.3 ms). |

**Scene counters (per frame):**

- `kTri` — submitted triangles (correlates with furnished wall / spin angle).  
- `frProps` / `frUI` — frustum-visible apartment props / unit interior meshes.  
- `vis*` — visibility flags (`.visible`), not identical to frustum submission.

**Heavy mesh list:** peaks when a single mesh is frustum-visible during high-`kTri` frames. Empty list on a **static** heavy wall hold is normal: no threshold crossing while parked in the expensive view.

---

## Regression checklist

When touching apartment decor, visibility, or FP mount:

1. **Spin in `unit_e_003`** (or any dense furnished unit) for 10 s with `?fpdebug=1` or perf ring export. Expect:
   - No sustained **>16 ms** frames in normal play.
   - **≥90%** of frames in 4–8 ms bucket on a mid-range discrete GPU after warm-up.
   - Subjective: no hitch train while rotating in place.

2. **Hold furnished east wall** (yaw ~170°, `unit_e_003`) for 10 s. Expect:
   - `kTri` roughly **150k–200k** stable.
   - p99 **< 10 ms**, worst **< 12 ms** on the same class of hardware.

3. **Code constants** unchanged unless intentionally retuning:
   - `APARTMENT_INTERIOR_PROP_MAX_SHOWS_PER_FRAME` (default **6**)
   - Forward cone dots **0.1** / **-0.15**

4. Compare against earlier baseline commit **`75e72a2c`** (*Refactor apartment render isolation…*, 2026-05-19) only when changing isolation strategy — not the same issue as spin budgeting.

---

## Enabling perf capture in dev

- URL: `?fpdebug=1` or `localStorage.setItem("mammothFpDebug","1")`  
- GPU timestamp split (optional): adapter `timestamp-query`; disable with `?fpgpuoff=1`  
- Implementation: `fpSessionPerfStore.ts`, `fpSessionPerfDebug.ts`

Copy the 10 s window report from the overlay/export after reproducing the two scenarios above and attach to PRs that touch apartment FP rendering.

---

## Related commits (chronological)

| Commit | Note |
|--------|------|
| `75e72a2c` | Render isolation refactor; informal “best FPS so far” reference in [fp-building-mesh-visibility.md](fp-building-mesh-visibility.md). |
| `621829ce` | Interior wall collision + **FPS fixes** (prop visibility budgeting, floor-plate / mount related work in same window). **Treat as the hitch fix baseline.** |
| Earlier (`692c13d7`, `2dbd3d89`, `087d7caf`) | Prop visibility by camera direction — foundation for in-unit rules. |

---

## Takeaway for future work

- **Do not** treat “274k triangles on one frame” as a failure if rotation no longer hitches: that peak can still happen for a **single** wall glance; the win is **not doing it every frame during a spin**.
- **Do** treat regressions as: triangle **sawtooth** while rotating in place, rising **8–16 ms** bucket %, or `renderMs >> renderThreeMs` on most frames during slow yaw changes.
- Content-side reductions (lower-poly decor, fewer placed props) remain valid optimizations but are **not required** for the current “solid” baseline documented here.

### Decor GLB pipeline (2026-05-23)

Safe batch pass (no decimation): `pnpm content:optimize-glbs` / `content:optimize-glbs:apply` — meshopt index reorder + WebP textures at 1024–2048. Audits: `pnpm content:audit-apartment-tris`. Backups: `content/models/glb-source-backups/`.

**KTX2 for decor:** intentionally skipped for now — see [models glb-source-backups README](../../content/models/glb-source-backups/README.md). Building shells already use KTX2; decor stays on embedded WebP until texture-bound or a shared loader exists.

**Procedural decor:** only `window-shutter.glb` (no disk asset). Fish tank uses `static/models/objects/fish-tank.glb`.
