import { useSyncExternalStore, type CSSProperties } from "react";
import type { DbConnection } from "../module_bindings";
import {
  closeFpSleepConfirm,
  getFpSleepConfirmState,
  subscribeFpSleepConfirm,
} from "../game/fpApartment/fpSleepConfirmState";
import { exitFpSit } from "../game/fpApartment/fpSitSession";
import {
  THEME_CARD_BG,
  THEME_CARD_BORDER,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";

type Props = {
  conn: DbConnection | null;
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 160,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(4, 6, 10, 0.72)",
  backdropFilter: "blur(3px)",
  padding: 24,
};

const panelStyle: CSSProperties = {
  width: "min(92vw, 420px)",
  padding: "22px 24px",
  borderRadius: 14,
  border: `1px solid ${THEME_CARD_BORDER}`,
  background: THEME_CARD_BG,
  color: THEME_TEXT_PRIMARY,
  fontFamily: UI_FONT_SANS,
  boxShadow: "0 18px 48px rgba(0,0,0,0.55)",
};

const btnBase: CSSProperties = {
  flex: 1,
  padding: "11px 14px",
  borderRadius: 10,
  border: "1px solid transparent",
  cursor: "pointer",
  fontFamily: UI_FONT_SANS,
  fontSize: 14,
  fontWeight: 650,
};

export function MammothSleepConfirmHud({ conn }: Props) {
  const pending = useSyncExternalStore(
    subscribeFpSleepConfirm,
    getFpSleepConfirmState,
    getFpSleepConfirmState,
  );

  if (!conn || !pending) return null;

  const runSleep = () => {
    closeFpSleepConfirm();
    exitFpSit();
    void document.exitPointerLock?.();
    void conn.reducers.sleepInBed({ unitKey: pending.unitKey });
  };

  return (
    <div style={overlayStyle} onClick={() => closeFpSleepConfirm()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mammoth-sleep-title"
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div id="mammoth-sleep-title" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          Sleep through the night?
        </div>
        <p style={{ margin: "0 0 16px", color: THEME_TEXT_MUTED, lineHeight: 1.5, fontSize: 14 }}>
          Time skips forward. You wake with full health, food, and water. Balcony crops advance one
          day; tray substrate in stash feeds all growing slots overnight.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            style={{
              ...btnBase,
              background: "rgba(255,255,255,0.06)",
              borderColor: THEME_CARD_BORDER,
              color: THEME_TEXT_PRIMARY,
            }}
            onClick={() => closeFpSleepConfirm()}
          >
            Stay awake
          </button>
          <button
            type="button"
            style={{
              ...btnBase,
              background: "linear-gradient(180deg, #cbe8b4 0%, #5cb86a 45%, #2d6b38 100%)",
              color: "#061004",
            }}
            onClick={runSleep}
          >
            Sleep
          </button>
        </div>
      </div>
    </div>
  );
}
