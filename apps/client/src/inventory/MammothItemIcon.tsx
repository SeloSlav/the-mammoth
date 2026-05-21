import type { CSSProperties } from "react";
import { THEME_TEXT_FAINT } from "@the-mammoth/ui-theme";
import type { MammothItemDef } from "./mammothItemCatalogTypes";

type MammothItemIconProps = {
  def: Pick<MammothItemDef, "iconUrl" | "displayName">;
  size?: number;
  style?: CSSProperties;
};

/** HUD slot icon — skips `<img>` when catalog has no `?url` icon (avoids React empty-`src` warning). */
export function MammothItemIcon({ def, size = 44, style }: MammothItemIconProps) {
  const base: CSSProperties = {
    width: size,
    height: size,
    display: "block",
    margin: "auto",
    pointerEvents: "none",
    userSelect: "none",
    ...style,
  };

  if (def.iconUrl) {
    return (
      <img
        src={def.iconUrl}
        alt={def.displayName}
        draggable={false}
        style={{ ...base, objectFit: "contain" }}
      />
    );
  }

  const abbr = def.displayName.trim().slice(0, 2) || "—";
  return (
    <span
      aria-hidden
      style={{
        ...base,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.max(9, Math.floor(size * 0.22)),
        fontWeight: 600,
        color: THEME_TEXT_FAINT,
        textTransform: "uppercase",
        letterSpacing: "0.02em",
      }}
    >
      {abbr}
    </span>
  );
}
