import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DbConnection } from "../module_bindings";
import {
  THEME_CARD_BG,
  THEME_CARD_BORDER,
  THEME_TEXT_FAINT,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
  UI_FONT_MONO,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";
import {
  getFpSessionGameUiHidden,
  subscribeFpSessionGameUiHidden,
} from "../game/fpSession/fpSessionGameUiHidden";
import {
  displayGameClock,
  getGameTimeDisplayVersion,
  subscribeGameTimeDisplay,
} from "../game/fpSession/gameTimeDisplay";

type Props = {
  conn: DbConnection | null;
};

export function MammothWorldDayHud({ conn }: Props) {
  const gameUiHidden = useSyncExternalStore(
    subscribeFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
  );
  const clockVersion = useSyncExternalStore(
    subscribeGameTimeDisplay,
    getGameTimeDisplayVersion,
    getGameTimeDisplayVersion,
  );
  /** Bumps once per second while time is running for smooth interpolation. */
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setClockTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const clock = useMemo(() => {
    void clockVersion;
    void clockTick;
    return displayGameClock();
  }, [clockVersion, clockTick]);

  if (!conn || gameUiHidden) return null;

  return (
    <div
      style={{
        marginTop: 6,
        padding: "6px 10px",
        borderRadius: 8,
        border: `1px solid ${THEME_CARD_BORDER}`,
        background: THEME_CARD_BG,
        color: THEME_TEXT_PRIMARY,
        fontFamily: UI_FONT_SANS,
        fontSize: 11,
        lineHeight: 1.35,
        minWidth: 118,
      }}
      title="In-game day and time. Clock pauses while inventory or crafting is open."
    >
      {/* DEBUG: in-game clock — may remove later */}
      <div style={{ color: THEME_TEXT_FAINT, fontSize: 10, letterSpacing: "0.04em" }}>
        DAY
      </div>
      <div style={{ fontFamily: UI_FONT_MONO, fontSize: 15, fontWeight: 700 }}>{clock.day}</div>
      <div
        style={{
          fontFamily: UI_FONT_MONO,
          fontSize: 14,
          fontWeight: 650,
          marginTop: 4,
          color: THEME_TEXT_PRIMARY,
        }}
      >
        {clock.hhmm}
      </div>
      <div style={{ color: THEME_TEXT_MUTED, fontSize: 10, marginTop: 2 }}>block time</div>
    </div>
  );
}
