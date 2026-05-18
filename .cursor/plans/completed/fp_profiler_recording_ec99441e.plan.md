---
name: fp profiler recording
overview: Add a Record-based profiler capture flow that preserves changing values over time and visualizes rotation-related spikes with timeline data. Extend the existing ring-buffer profiler rather than replacing it, keeping hot-path overhead low while making captures actionable.
todos:
  - id: perf-store-timeline
    content: Add timeline/capture read APIs and yaw support in fpSessionPerfStore
    status: completed
  - id: perf-sample-yaw
    content: Feed camera yaw into per-frame profiler samples from the FP session render loop
    status: completed
  - id: hud-record-ui
    content: Add Record controls and captured-state UX to MammothFpsHud
    status: completed
  - id: hud-timeline-chart
    content: Render lightweight recorded timelines for timings, counts, draw calls, triangles, and yaw
    status: completed
  - id: perf-export-tests
    content: Add targeted tests for ring-buffer timeline extraction, capture freezing, and export output
    status: completed
isProject: false
---

# FP Profiler Recording Plan

## What Exists Today
The current profiler in [apps/client/src/game/fpSession/fpSessionPerfStore.ts](apps/client/src/game/fpSession/fpSessionPerfStore.ts) already stores per-frame samples in a 1,800-slot typed-array ring buffer (`_ts`, `_total`, `_renderThree`, `_frustumUnitInteriorMeshes`, etc.). The HUD in [apps/client/src/ui/MammothFpsHud.tsx](apps/client/src/ui/MammothFpsHud.tsx) only exposes rolling-window aggregates (`computeFpPerfStats(...)`), a histogram, and the latest renderer counters via `getLastRendererInfo()`.

## Goal
Add an explicit **Record** workflow that captures a bounded slice of profiler history and shows/export a timeline of:
- frame/render section timings
- scene visible/frustum counts
- draw calls and triangles
- camera yaw per sample

This will let you correlate "turn in place" hitches with orientation and visibility churn instead of relying on averages.

## Proposed Changes

### 1. Extend the Perf Store with Capture-Friendly Read APIs
Update [apps/client/src/game/fpSession/fpSessionPerfStore.ts](apps/client/src/game/fpSession/fpSessionPerfStore.ts) to expose readonly timeline data from the existing ring buffer rather than only summary stats.

Add:
- a `getFpPerfTimeline(nowMs, windowSec)`-style selector that returns ordered samples for the current window
- sample fields for camera yaw (and optionally pitch later)
- a small capture state machine for `idle -> recording -> captured`
- helpers to freeze/export the currently selected recording window without mutating the hot-path arrays

Keep the hot path zero-allocation by continuing to write into typed arrays in `pushFpPerfFrame(...)`.

### 2. Feed Camera Orientation into Samples
Update the perf push site in [apps/client/src/game/fpSession/fpSessionMainRafFrame.ts](apps/client/src/game/fpSession/fpSessionMainRafFrame.ts) and/or [apps/client/src/game/mountFpSession.ts](apps/client/src/game/mountFpSession.ts) so each sample includes the current camera yaw.

Capture at minimum:
- yaw in radians or degrees
- existing renderer info already passed into `pushFpPerfFrame(...)`

This is the key missing signal for your "north vs south / turning in place" investigation.

### 3. Add Record Controls to the HUD
Update [apps/client/src/ui/MammothFpsHud.tsx](apps/client/src/ui/MammothFpsHud.tsx) to add:
- a `Record` button
- recording duration selector (sensible default: 5s)
- capture status text (`idle`, `recording`, `captured`)
- `Copy` / `Export` behavior for captured data

Keep the existing rolling-window view, but make the captured view primary when a recording exists.

### 4. Add a Timeline Visualization
In [apps/client/src/ui/MammothFpsHud.tsx](apps/client/src/ui/MammothFpsHud.tsx), render a compact timeline for the recorded slice.

First-pass tracks:
- total frame ms
- render / three.js ms
- frustum unit-interior count
- frustum apartment-prop count
- draw calls / triangles
- yaw overlay or per-sample yaw readout

Prefer a lightweight inline SVG/canvas chart over a heavy charting dependency.

### 5. Improve Export Format
Extend `exportFpPerfReport(...)` in [apps/client/src/game/fpSession/fpSessionPerfStore.ts](apps/client/src/game/fpSession/fpSessionPerfStore.ts) or add a sibling export function so captured recordings can be copied as:
- summary block (today's format)
- plus a compact per-sample timeline dump for the captured slice

That makes chat/debug sharing useful without requiring screenshots.

### 6. Add Focused Tests
Update/add tests near [apps/client/src/game/fpSession/fpSessionPerfStore.test.ts](apps/client/src/game/fpSession/fpSessionPerfStore.test.ts) to cover:
- ordered timeline extraction from the wrapped ring buffer
- capture window freezing semantics
- yaw/sample alignment
- export formatting for a captured recording

## Key Design Choice
Use the existing rolling ring buffer as the source of truth, and layer recording on top of it. That keeps runtime overhead low and avoids introducing a second profiler pipeline.

## Expected Outcome
After this change, you should be able to:
- click `Record`
- rotate in place for 5 seconds
- inspect a timeline showing exactly when frame time rises
- confirm whether spikes line up with yaw direction, rising frustum counts, or draw-call churn