import { useSyncExternalStore } from "react";
import {
  getFpSessionDisplayedFps,
  subscribeFpSessionDisplayedFps,
} from "../game/fpSessionFpsDisplay";

/**
 * Rolling FPS from the FP GPU render loop (see `mountFpSession` + `fpSessionFpsDisplay`).
 */
export function MammothFpsHud() {
  const fps = useSyncExternalStore(
    subscribeFpSessionDisplayedFps,
    getFpSessionDisplayedFps,
    getFpSessionDisplayedFps,
  );

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        right: "max(12px, env(safe-area-inset-right, 0px))",
        top: "max(12px, env(safe-area-inset-top, 0px))",
        zIndex: 50,
        padding: "8px 12px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.45)",
        color: "#e8e8ee",
        fontSize: 13,
        fontVariantNumeric: "tabular-nums",
        pointerEvents: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
      }}
    >
      {fps === null ? "…" : `${fps} FPS`}
    </div>
  );
}
