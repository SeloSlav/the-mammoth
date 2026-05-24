import { useSyncExternalStore } from "react";
import {
  isFpSessionCombatAiming,
  subscribeFpSessionCombatAiming,
} from "../game/fpSession/fpSessionCombatAim.js";

function subscribe(cb: () => void): () => void {
  document.addEventListener("pointerlockchange", cb);
  const unsubAim = subscribeFpSessionCombatAiming(cb);
  return () => {
    document.removeEventListener("pointerlockchange", cb);
    unsubAim();
  };
}

function fpCanvasLocked(): boolean {
  if (document.querySelector('[data-mammoth-inventory="open"]')) return false;
  const el = document.pointerLockElement;
  return el instanceof HTMLCanvasElement && el.dataset.mammothFpCanvas === "1";
}

/**
 * Center-screen reticule while the gameplay canvas has pointer lock (weapon / interact aim).
 * Tightens while holding RMB with a ranged weapon (ADS).
 */
export function MammothFpReticule() {
  const locked = useSyncExternalStore(subscribe, fpCanvasLocked, () => false);
  const aiming = useSyncExternalStore(subscribeFpSessionCombatAiming, isFpSessionCombatAiming, () => false);

  if (!locked) return null;

  const arm = aiming ? 5 : 8;
  const stroke = aiming ? "rgba(255,220,180,0.95)" : "rgba(255,255,255,0.92)";
  const dotFill = aiming ? "rgba(255,220,180,0.55)" : "rgba(255,255,255,0.35)";

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
          y2={11 - arm}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="11"
          y1={11 + arm}
          x2="11"
          y2="20"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="2"
          y1="11"
          x2={11 - arm}
          y2="11"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1={11 + arm}
          y1="11"
          x2="20"
          y2="11"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="11" cy="11" r={aiming ? 1.4 : 1.2} fill={dotFill} />
      </svg>
    </div>
  );
}
