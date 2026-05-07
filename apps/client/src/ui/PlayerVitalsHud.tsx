import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { DbConnection } from "../module_bindings";
import type { PlayerVitals } from "../module_bindings/types";

const VITAL_MAX = 100;
/** Aligned with Broth & Bullets low-need UX on a 0–100 scale. */
const LOW_NEED = 20;

/** Shared with toast HUD: distance from viewport bottom to this panel’s bottom edge (safe area + pad). */
export const BOTTOM_RIGHT_FP_HUD_INSET = "max(20px, calc(env(safe-area-inset-bottom, 0px) + 14px))";

/** Vertical gap between the vitals card and the next stacked HUD row (craft strip / toasts). */
export const FP_HUD_VITALS_TO_STACK_GAP_PX = 10;

/**
 * Approximate outer height for stacking pick-up / craft toasts above vitals.
 * Bump if bars, padding, or title block change.
 */
export const PLAYER_VITALS_HUD_LAYOUT_HEIGHT_PX = 128;

/**
 * Reserved vertical space for {@link MammothCraftQueueStrip} so toasts stack above it.
 * Includes padding, two text lines, border, plus a small buffer for font metrics.
 */
export const CRAFT_QUEUE_STRIP_BLOCK_HEIGHT_PX = 62;

/** Gap between the craft queue strip and the bottom of the toast stack. */
export const CRAFT_QUEUE_STRIP_TO_TOAST_GAP_PX = 8;

const NO_SELECT: CSSProperties = {
  userSelect: "none",
  WebkitUserSelect: "none",
  pointerEvents: "none",
};

type BarProps = {
  label: string;
  emoji: string;
  value: number;
  max: number;
  lowIsBad: boolean;
  gradient: string;
  lowGradient: string;
  glowColor: string;
};

function VitalBar({ label, emoji, value, max, lowIsBad, gradient, lowGradient, glowColor }: BarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const low = lowIsBad ? value < LOW_NEED : false;
  const fill = low ? lowGradient : gradient;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 6,
        height: 22,
      }}
    >
      <span style={{ fontSize: 14, width: 22, textAlign: "center" }} aria-hidden>
        {emoji}
      </span>
      <div
        style={{
          flex: 1,
          position: "relative",
          height: 11,
          borderRadius: 3,
          background: "rgba(0,0,0,0.45)",
          border: "1px solid rgba(255,255,255,0.12)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: fill,
            transition: "width 0.35s ease-out, box-shadow 0.25s ease",
            boxShadow: low ? `0 0 10px 1px ${glowColor}` : undefined,
            animation: low ? `mammothVitalPulse 1.4s ease-in-out infinite` : undefined,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.14) 50%, transparent 100%)",
            animation: "mammothVitalScan 2.8s linear infinite",
            opacity: 0.35,
            pointerEvents: "none",
          }}
        />
      </div>
      <span
        style={{
          minWidth: 34,
          textAlign: "right",
          fontSize: 12,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: low ? "#ffb0b0" : "#e8f0ff",
          textShadow: low ? `0 0 8px ${glowColor}` : "0 0 6px rgba(120,180,255,0.35)",
        }}
      >
        {Math.round(value)}
      </span>
      <span style={{ fontSize: 9, opacity: 0.55, width: 28, color: "#9aa8bc" }}>{label}</span>
    </div>
  );
}

type Props = { conn: DbConnection };

export function PlayerVitalsHud({ conn }: Props) {
  const [ver, setVer] = useState(0);
  useEffect(() => {
    const bump = () => setVer((v) => v + 1);
    conn.db.player_vitals.onInsert(bump);
    conn.db.player_vitals.onUpdate(bump);
    conn.db.player_vitals.onDelete(bump);
    return () => {
      conn.db.player_vitals.removeOnInsert(bump);
      conn.db.player_vitals.removeOnUpdate(bump);
      conn.db.player_vitals.removeOnDelete(bump);
    };
  }, [conn]);

  const row = useMemo((): PlayerVitals | null => {
    void ver;
    const id = conn.identity;
    if (!id) return null;
    return (conn.db.player_vitals.identity.find(id) as PlayerVitals | undefined) ?? null;
  }, [conn, ver]);

  if (!row) {
    return null;
  }

  const bottom = BOTTOM_RIGHT_FP_HUD_INSET;
  const right = "max(16px, calc(env(safe-area-inset-right, 0px) + 10px))";

  return (
    <div
      style={{
        position: "fixed",
        bottom,
        right,
        zIndex: 118,
        minWidth: 236,
        padding: "12px 14px 10px",
        borderRadius: 10,
        background: "linear-gradient(145deg, rgba(18,22,34,0.94), rgba(10,12,20,0.97))",
        border: "1px solid rgba(100,170,255,0.38)",
        boxShadow:
          "0 0 22px rgba(60,140,255,0.22), inset 0 0 20px rgba(40,100,200,0.06), 0 8px 28px rgba(0,0,0,0.5)",
        ...NO_SELECT,
      }}
    >
      <style>{`
        @keyframes mammothVitalScan {
          0% { transform: translateX(-60%); }
          100% { transform: translateX(60%); }
        }
        @keyframes mammothVitalPulse {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.12); }
        }
      `}</style>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "rgba(160,200,255,0.75)",
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        Vitals
      </div>
      <VitalBar
        label="HP"
        emoji="❤"
        value={row.health}
        max={VITAL_MAX}
        lowIsBad
        gradient="linear-gradient(90deg, #9a3038, #e04850)"
        lowGradient="linear-gradient(90deg, #ff2028, #ff5860)"
        glowColor="rgba(255,80,90,0.65)"
      />
      <VitalBar
        label="Water"
        emoji="💧"
        value={row.hydration}
        max={VITAL_MAX}
        lowIsBad
        gradient="linear-gradient(90deg, #2060a0, #38a0e8)"
        lowGradient="linear-gradient(90deg, #2090ff, #58c8ff)"
        glowColor="rgba(80,180,255,0.55)"
      />
      <VitalBar
        label="Food"
        emoji="🍖"
        value={row.hunger}
        max={VITAL_MAX}
        lowIsBad
        gradient="linear-gradient(90deg, #a06020, #e89840)"
        lowGradient="linear-gradient(90deg, #ff8020, #ffb060)"
        glowColor="rgba(255,160,80,0.55)"
      />
    </div>
  );
}
