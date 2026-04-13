import { useSyncExternalStore } from "react";

function subscribe(cb: () => void): () => void {
  document.addEventListener("pointerlockchange", cb);
  return () => document.removeEventListener("pointerlockchange", cb);
}

function fpCanvasLocked(): boolean {
  if (document.querySelector('[data-mammoth-inventory="open"]')) return false;
  const el = document.pointerLockElement;
  return el instanceof HTMLCanvasElement && el.dataset.mammothFpCanvas === "1";
}

/**
 * Center-screen reticule while the gameplay canvas has pointer lock (weapon / interact aim).
 */
export function MammothFpReticule() {
  const locked = useSyncExternalStore(subscribe, fpCanvasLocked, () => false);

  if (!locked) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: "50%",
        top: "50%",
        width: 22,
        height: 22,
        marginLeft: -11,
        marginTop: -11,
        zIndex: 120,
        pointerEvents: "none",
        mixBlendMode: "normal",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 22 22">
        <line
          x1="11"
          y1="2"
          x2="11"
          y2="8"
          stroke="rgba(255,255,255,0.92)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="11"
          y1="14"
          x2="11"
          y2="20"
          stroke="rgba(255,255,255,0.92)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="2"
          y1="11"
          x2="8"
          y2="11"
          stroke="rgba(255,255,255,0.92)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="14"
          y1="11"
          x2="20"
          y2="11"
          stroke="rgba(255,255,255,0.92)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="11" cy="11" r="1.2" fill="rgba(255,255,255,0.35)" />
      </svg>
    </div>
  );
}
