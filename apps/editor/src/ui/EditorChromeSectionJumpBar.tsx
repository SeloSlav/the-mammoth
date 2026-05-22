import { useCallback, useState, type CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export type EditorChromeJumpBarItem = {
  id: string;
  label: string;
  icon: IconDefinition;
};

const jumpBtn: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  padding: 0,
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(235,240,248,0.92)",
  cursor: "pointer",
  outline: "none",
  flexShrink: 0,
};

const jumpBtnHover: CSSProperties = {
  ...jumpBtn,
  background: "rgba(60,100,180,0.35)",
  borderColor: "rgba(120,170,255,0.42)",
};

const tipBase: CSSProperties = {
  position: "absolute",
  right: "100%",
  top: "50%",
  transform: "translateY(-50%)",
  marginRight: 8,
  padding: "5px 9px",
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.03em",
  color: "#f1f5fb",
  background: "linear-gradient(145deg, #1e2940 0%, #161a28 55%, #121422 100%)",
  border: "1px solid rgba(108,148,216,0.45)",
  boxShadow:
    "0 4px 14px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
  whiteSpace: "nowrap",
  pointerEvents: "none",
  zIndex: 5,
  opacity: 0,
  transition: "opacity 0.12s ease",
};

export function EditorChromeSectionJumpBar(props: {
  items: readonly EditorChromeJumpBarItem[];
}) {
  const { items } = props;
  const [activeId, setActiveId] = useState<string | null>(null);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="Jump to sidebar section"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 5,
        rowGap: 5,
      }}
    >
      {items.map((item) => {
        const showTip = activeId === item.id;
        return (
          <div
            key={item.id}
            style={{ position: "relative", display: "flex", alignItems: "center" }}
            onMouseEnter={() => setActiveId(item.id)}
            onMouseLeave={() => setActiveId((cur) => (cur === item.id ? null : cur))}
          >
            <span
              style={{
                ...tipBase,
                opacity: showTip ? 1 : 0,
                visibility: showTip ? "visible" : "hidden",
              }}
              aria-hidden
            >
              {item.label}
            </span>
            <button
              type="button"
              style={showTip ? jumpBtnHover : jumpBtn}
              onClick={() => scrollTo(item.id)}
              onFocus={() => setActiveId(item.id)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setActiveId((cur) => (cur === item.id ? null : cur));
                }
              }}
              aria-label={`Jump to ${item.label}`}
            >
              <FontAwesomeIcon icon={item.icon} style={{ fontSize: "0.88rem" }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
