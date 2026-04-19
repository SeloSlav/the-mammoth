# First-person prediction “hitching” and view smoothing

This note explains why movement could feel like micro-stuttering despite good average FPS, what we tried that did **not** reliably fix the *feel*, and what **did** help: softer reconcile display correction plus a **view-only** exponential ease on the local player rig.

## Context: client prediction vs 20 Hz authority

- The server advances the player on a fixed **~20 Hz** physics tick (`TICK_DT ≈ 50 ms` in `apps/server/src/movement.rs`).
- The client runs **every animation frame** (~60+ Hz) with a real frame `dt` and sends move intents on a cadence aligned to that tick (`NET_INTERVAL_MS` in `apps/client/src/game/mountFpSession.ts`).
- When replicated `player_pose` updates arrive, the client **replays** pending intents from the last authoritative state (`reconcileLocalPredictionToServer`) and corrects local `pos` when replay disagrees with prediction.

Velocity and drag use exponential-style damping (`THREE.MathUtils.damp` on the client; the same idea on the server). That integration is **not linear in `dt`**: one damp at 50 ms is not the same curve as several damps that sum to 50 ms. So **small, repeating** prediction errors vs replay are normal unless client and server use *identical* integration grouping—which would imply a larger physics/networking redesign.

## What was *not* the durable fix

We briefly split both the main loop and reconcile replay into multiple **sub-steps per frame / per intent** to make damping curves closer. In practice:

- The **server** still applies **one** horizontal damp pass per tick at `h = TICK_DT`.
- Extra client sub-steps change how often damping runs relative to that authority model and did not consistently shrink reconcile error; it could even **diverge** further from the server’s single-tick integration.
- That experiment was **reverted** in favor of a single `simulatePredictedPlayerStep` per frame (real `dt`) and one replay step per pending intent (`NET_DT_SEC`), matching the original design intent.

So the “hitch” users felt was often **not** fixed by only reshaping physics sub-steps without also matching server integration exactly.

## What *did* improve the feel (last change)

The remaining discomfort was largely **visible**: frequent small corrections to physics `pos`, plus `_displayOffset` smoothing, still produced a camera/rig motion that read as jitter because:

1. **`_displayOffset` decay was fairly aggressive** (`DISPLAY_OFFSET_DAMP` previously ~12), so the **visual** error hidden behind `pos + _displayOffset` relaxed quickly and could emphasize each 20 Hz reconcile event.
2. The **rig** was snapped every frame to that target with no extra filtering—so any residual noise in the combined target showed up directly in the view.

The fix that subjectively “landed”:

1. **Softer decay of `_displayOffset`** — lower `DISPLAY_OFFSET_DAMP` (e.g. toward ~5) so the correction vector eases out over a slightly longer window instead of snapping back toward zero aggressively each frame.
2. **View-only exponential ease** — `playerRig` follows `pos + _displayOffset` through a separate scratch vector with `PLAYER_RIG_VIEW_LERP_PER_S` (~14 1/s), while **physics, collision, and interaction** still use authoritative `pos`. Large separation (> ~2.5 m) still hard-snaps the smoothed rig (teleports / big corrections).

So we did **not** claim bit-exact client/server simulation; we reduced how much **unavoidable** small reconcile noise reaches the player’s eyes.

## Operational notes

- To **disable** rig easing for A/B testing, set `PLAYER_RIG_VIEW_LERP_PER_S` to `0` in `mountFpSession.ts` (rig follows the target exactly again).
- Heavy **console** logging (e.g. `__mmDoorDebug`) and **DevTools** can themselves cause multi-ms frame spikes; profile with tooling closed when judging motion.
- For deep alignment of **physics** with the server (beyond feel), the next step would be a shared integration schedule or generated shared step—not just more client-side sub-stepping.
