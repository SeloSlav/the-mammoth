import { useSyncExternalStore } from "react";
import { getFpElevatorHudView, subscribeFpElevatorHud } from "../game/fpElevatorHud";

function mammothInventoryOpen(): boolean {
  return document.querySelector('[data-mammoth-inventory="open"]') !== null;
}

/**
 * Landing call prompt only — in-car floors use 3D wall buttons + center-screen raycast.
 * Exterior swing-door prompts use {@link MammothPickupPromptHud} via `fpPickupPrompt`.
 */
export function MammothElevatorHud() {
  const view = useSyncExternalStore(subscribeFpElevatorHud, getFpElevatorHudView, getFpElevatorHudView);

  if (mammothInventoryOpen() || view.kind !== "call") return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: "max(14%, calc(env(safe-area-inset-bottom, 0px) + 100px))",
        transform: "translateX(-50%)",
        zIndex: 123,
        pointerEvents: "none",
        maxWidth: "min(92vw, 440px)",
        padding: "14px 22px",
        borderRadius: 14,
        background:
          "linear-gradient(165deg, rgba(18,22,34,0.96) 0%, rgba(10,12,20,0.98) 100%)",
        border: "1px solid rgba(120,200,255,0.45)",
        boxShadow:
          "0 0 0 1px rgba(255,255,255,0.06) inset, 0 12px 40px rgba(0,0,0,0.55), 0 0 28px rgba(92,200,255,0.18)",
        color: "#c8d4e8",
        fontSize: 15,
        lineHeight: 1.45,
        textAlign: "center",
        fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
      }}
    >
      <span style={{ opacity: 0.92 }}>Press </span>
      <kbd
        style={{
          display: "inline-block",
          verticalAlign: "middle",
          margin: "0 6px",
          padding: "4px 12px",
          borderRadius: 8,
          border: "1px solid rgba(180,230,255,0.55)",
          background: "linear-gradient(180deg, #6ad0ff 0%, #2a9fd6 45%, #1a7cb0 100%)",
          color: "#031018",
          fontWeight: 800,
          fontSize: 16,
          fontFamily: "inherit",
          lineHeight: 1.1,
          boxShadow: "0 2px 12px rgba(92,200,255,0.45), 0 1px 0 rgba(255,255,255,0.35) inset",
          textShadow: "0 1px 0 rgba(255,255,255,0.25)",
        }}
      >
        E
      </kbd>
      <span style={{ opacity: 0.92 }}> to call elevator — </span>
      <strong style={{ color: "#f0f6ff", fontWeight: 700 }}>{view.floorLabel}</strong>
    </div>
  );
}
