import { useSyncExternalStore, type CSSProperties } from "react";
import {
  getGameplayErrorBarMessage,
  subscribeGameplayErrorBar,
} from "./gameplayErrorBar";

const barStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  top: "max(12px, env(safe-area-inset-top, 0px))",
  transform: "translateX(-50%)",
  zIndex: 130,
  pointerEvents: "none",
  maxWidth: "min(92vw, 520px)",
  padding: "12px 20px",
  borderRadius: 8,
  background: "linear-gradient(180deg, #c62828 0%, #9b1c1c 100%)",
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.4,
  textAlign: "center",
  fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
  boxShadow: "0 6px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.12) inset",
};

/** Red bar, white text — shared gameplay error surface (inventory, stash, …). */
export function MammothGameplayErrorBarHud() {
  const text = useSyncExternalStore(
    subscribeGameplayErrorBar,
    getGameplayErrorBarMessage,
    () => null,
  );
  if (!text) return null;
  return (
    <div role="alert" data-testid="mammoth-gameplay-error-bar" style={barStyle}>
      {text}
    </div>
  );
}
