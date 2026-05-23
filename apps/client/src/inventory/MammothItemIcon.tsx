import { useState, type CSSProperties } from "react";
import { THEME_TEXT_FAINT } from "@the-mammoth/ui-theme";
import type { MammothItemDef } from "./mammothItemCatalogTypes";

type MammothItemIconProps = {
  def: Pick<MammothItemDef, "iconUrl" | "displayName">;
  size?: number;
  style?: CSSProperties;
};

function MammothItemIconTextFallback({
  displayName,
  size,
  style,
}: {
  displayName: string;
  size: number;
  style?: CSSProperties;
}) {
  const abbr = displayName.trim().slice(0, 2) || "—";
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "auto",
        pointerEvents: "none",
        userSelect: "none",
        fontSize: Math.max(9, Math.floor(size * 0.22)),
        fontWeight: 600,
        color: THEME_TEXT_FAINT,
        textTransform: "uppercase",
        letterSpacing: "0.02em",
        ...style,
      }}
    >
      {abbr}
    </span>
  );
}

/** HUD slot icon — skips `<img>` when catalog has no `?url` icon (avoids React empty-`src` warning). */
export function MammothItemIcon({ def, size = 44, style }: MammothItemIconProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const base: CSSProperties = {
    width: size,
    height: size,
    display: "block",
    margin: "auto",
    pointerEvents: "none",
    userSelect: "none",
    ...style,
  };

  if (def.iconUrl && !imgFailed) {
    return (
      <img
        src={def.iconUrl}
        alt={def.displayName}
        draggable={false}
        onError={() => setImgFailed(true)}
        style={{ ...base, objectFit: "contain" }}
      />
    );
  }

  return <MammothItemIconTextFallback displayName={def.displayName} size={size} style={style} />;
}
