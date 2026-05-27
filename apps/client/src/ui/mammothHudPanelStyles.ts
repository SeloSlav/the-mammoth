import type { CSSProperties } from "react";
import {
  THEME_CARD_BG,
  THEME_CARD_BORDER,
  THEME_TEXT_PRIMARY,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";

/** Shared compact HUD card — day clock, work orders, etc. in the FPS column. */
export const MAMMOTH_HUD_STACK_CARD_STYLE: CSSProperties = {
  marginTop: 6,
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 10px",
  borderRadius: 8,
  border: `1px solid ${THEME_CARD_BORDER}`,
  background: THEME_CARD_BG,
  color: THEME_TEXT_PRIMARY,
  fontFamily: UI_FONT_SANS,
  fontSize: 11,
  lineHeight: 1.35,
};
