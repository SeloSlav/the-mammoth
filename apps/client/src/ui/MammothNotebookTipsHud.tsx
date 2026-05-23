import { useEffect, useSyncExternalStore, type CSSProperties } from "react";
import {
  THEME_NOTEBOOK_INK,
  THEME_NOTEBOOK_INK_FAINT,
  THEME_NOTEBOOK_INK_MUTED,
  THEME_NOTEBOOK_MARGIN,
  THEME_NOTEBOOK_OVERLAY,
  THEME_NOTEBOOK_PAPER,
  THEME_NOTEBOOK_PAPER_SHADOW,
  THEME_NOTEBOOK_RULE,
  THEME_NOTEBOOK_SPINE,
  THEME_NOTEBOOK_SPIRAL,
  THEME_NOTEBOOK_SPIRAL_HIGHLIGHT,
  UI_FONT_NOTEBOOK,
} from "@the-mammoth/ui-theme";
import {
  closeFpNotebookTipsPanel,
  isFpNotebookTipsPanelOpen,
  subscribeFpNotebookTipsPanel,
} from "../game/fpApartment/fpNotebookTipsPanelState";
import {
  NOTEBOOK_OWNER,
  PLAYER_NOTEBOOK_PAGES,
  type PlayerNotebookSection,
} from "./playerNotebookTipsContent";

const RULE_STEP_PX = 32;
const MARGIN_X_PX = 56;

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 165,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: THEME_NOTEBOOK_OVERLAY,
  backdropFilter: "blur(2px)",
};

const notebookShellStyle: CSSProperties = {
  width: "min(92vw, 540px)",
  maxHeight: "min(84vh, 680px)",
  display: "flex",
  transform: "rotate(-0.65deg)",
  filter: "drop-shadow(0 22px 38px rgba(0, 0, 0, 0.42)) drop-shadow(0 2px 0 rgba(255, 255, 255, 0.18))",
};

const ruledPaperBackground = `
  linear-gradient(to right, transparent ${MARGIN_X_PX - 2}px, ${THEME_NOTEBOOK_MARGIN} ${MARGIN_X_PX - 2}px, ${THEME_NOTEBOOK_MARGIN} ${MARGIN_X_PX}px, transparent ${MARGIN_X_PX}px),
  repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent ${RULE_STEP_PX - 1}px,
    ${THEME_NOTEBOOK_RULE} ${RULE_STEP_PX - 1}px,
    ${THEME_NOTEBOOK_RULE} ${RULE_STEP_PX}px
  ),
  linear-gradient(180deg, rgba(255, 255, 255, 0.34) 0%, transparent 18%),
  ${THEME_NOTEBOOK_PAPER}
`;

const pageStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  background: THEME_NOTEBOOK_PAPER,
  backgroundImage: ruledPaperBackground,
  border: `1px solid ${THEME_NOTEBOOK_PAPER_SHADOW}`,
  borderLeft: "none",
  borderRadius: "0 8px 8px 0",
  color: THEME_NOTEBOOK_INK,
  fontFamily: UI_FONT_NOTEBOOK,
  overflow: "hidden",
};

const scrollStyle: CSSProperties = {
  overflowY: "auto",
  flex: 1,
  padding: `8px 28px 12px ${MARGIN_X_PX + 8}px`,
  backgroundImage: ruledPaperBackground,
};

const closeBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  padding: "4px 2px",
  color: THEME_NOTEBOOK_INK,
  cursor: "pointer",
  fontFamily: UI_FONT_NOTEBOOK,
  fontSize: 22,
  lineHeight: 1,
  textDecoration: "underline",
  textDecorationThickness: 1.5,
  textUnderlineOffset: 5,
};

const SPIRAL_COUNT = 12;
const SPIRAL_TOP_OFFSET = 34;
const SPIRAL_GAP = 44;

function NotebookSpine() {
  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width: 38,
        flexShrink: 0,
        background: `linear-gradient(90deg, #2f343a 0%, ${THEME_NOTEBOOK_SPINE} 42%, #4a5058 100%)`,
        borderRadius: "8px 0 0 8px",
        boxShadow: "inset -4px 0 10px rgba(0, 0, 0, 0.28)",
      }}
    >
      {Array.from({ length: SPIRAL_COUNT }, (_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 14,
            top: SPIRAL_TOP_OFFSET + i * SPIRAL_GAP,
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: `3px solid ${THEME_NOTEBOOK_SPIRAL}`,
            boxShadow: `inset 0 1px 2px rgba(0,0,0,0.35), 0 0 0 1px ${THEME_NOTEBOOK_SPIRAL_HIGHLIGHT}`,
            background: "transparent",
          }}
        />
      ))}
    </div>
  );
}

function sectionKey(section: PlayerNotebookSection): string {
  return `${section.kind}:${section.dateLabel ?? ""}:${section.heading}`;
}

function ReferenceSection({ section }: { section: PlayerNotebookSection }) {
  return (
    <section style={{ marginBottom: 10 }}>
      <h2
        style={{
          margin: 0,
          paddingTop: 6,
          fontSize: 24,
          fontWeight: 400,
          lineHeight: `${RULE_STEP_PX}px`,
          color: THEME_NOTEBOOK_INK,
          borderBottom: `1.5px solid ${THEME_NOTEBOOK_INK_MUTED}`,
          display: "inline-block",
          paddingBottom: 2,
          marginBottom: 2,
        }}
      >
        {section.heading}
      </h2>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          fontSize: 20,
          lineHeight: `${RULE_STEP_PX}px`,
          color: THEME_NOTEBOOK_INK_MUTED,
        }}
      >
        {section.lines.map((line) => (
          <li
            key={line}
            style={{
              position: "relative",
              paddingLeft: 18,
              minHeight: RULE_STEP_PX,
            }}
          >
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                color: THEME_NOTEBOOK_INK_FAINT,
              }}
            >
              –
            </span>
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DiarySection({ section }: { section: PlayerNotebookSection }) {
  return (
    <section style={{ marginBottom: 16 }}>
      {section.dateLabel ? (
        <div
          style={{
            fontSize: 18,
            lineHeight: `${RULE_STEP_PX}px`,
            color: THEME_NOTEBOOK_INK_FAINT,
            marginBottom: 0,
          }}
        >
          {section.dateLabel}
        </div>
      ) : null}
      <h2
        style={{
          margin: 0,
          fontSize: 26,
          fontWeight: 400,
          lineHeight: `${RULE_STEP_PX}px`,
          color: THEME_NOTEBOOK_INK,
          fontStyle: "normal",
        }}
      >
        {section.heading}
      </h2>
      <div
        style={{
          fontSize: 20,
          lineHeight: `${RULE_STEP_PX}px`,
          color: THEME_NOTEBOOK_INK_MUTED,
        }}
      >
        {section.lines.map((line) => (
          <p key={line} style={{ margin: `0 0 ${RULE_STEP_PX}px`, minHeight: RULE_STEP_PX }}>
            {line}
          </p>
        ))}
      </div>
    </section>
  );
}

function DiaryDivider() {
  return (
    <div
      aria-hidden
      style={{
        margin: "18px 0 14px",
        paddingTop: 4,
        borderTop: `2px double ${THEME_NOTEBOOK_INK_FAINT}`,
        color: THEME_NOTEBOOK_INK_FAINT,
        fontSize: 20,
        lineHeight: `${RULE_STEP_PX}px`,
        letterSpacing: "0.06em",
      }}
    >
      private pages
    </div>
  );
}

export function MammothNotebookTipsHud() {
  const open = useSyncExternalStore(
    subscribeFpNotebookTipsPanel,
    isFpNotebookTipsPanelOpen,
    isFpNotebookTipsPanelOpen,
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFpNotebookTipsPanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div style={overlayStyle} onClick={() => closeFpNotebookTipsPanel()}>
      <div style={notebookShellStyle} onClick={(e) => e.stopPropagation()}>
        <NotebookSpine />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mammoth-notebook-title"
          style={pageStyle}
        >
          <header
            style={{
              padding: `18px 28px 6px ${MARGIN_X_PX + 8}px`,
              borderBottom: `1px solid ${THEME_NOTEBOOK_RULE}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                lineHeight: `${RULE_STEP_PX}px`,
              }}
            >
              <h1
                id="mammoth-notebook-title"
                style={{
                  margin: 0,
                  fontSize: 34,
                  fontWeight: 400,
                  letterSpacing: "0.02em",
                }}
              >
                {NOTEBOOK_OWNER.fullName}
              </h1>
              <span
                style={{
                  fontSize: 28,
                  color: THEME_NOTEBOOK_INK_FAINT,
                  letterSpacing: "0.12em",
                }}
              >
                {NOTEBOOK_OWNER.initials}
              </span>
            </div>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 20,
                lineHeight: `${RULE_STEP_PX}px`,
                color: THEME_NOTEBOOK_INK,
              }}
            >
              {NOTEBOOK_OWNER.dateLabel}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 18,
                lineHeight: `${RULE_STEP_PX}px`,
                color: THEME_NOTEBOOK_INK_FAINT,
              }}
            >
              {NOTEBOOK_OWNER.dateNote}
            </p>
          </header>

          <div style={scrollStyle}>
            {PLAYER_NOTEBOOK_PAGES.map((section, index) => {
              const prev = index > 0 ? PLAYER_NOTEBOOK_PAGES[index - 1] : null;
              const showDivider = section.kind === "diary" && prev?.kind === "reference";
              return (
                <div key={sectionKey(section)}>
                  {showDivider ? <DiaryDivider /> : null}
                  {section.kind === "diary" ? (
                    <DiarySection section={section} />
                  ) : (
                    <ReferenceSection section={section} />
                  )}
                </div>
              );
            })}
          </div>

          <footer
            style={{
              padding: `8px 28px 18px ${MARGIN_X_PX + 8}px`,
              display: "flex",
              justifyContent: "flex-end",
              borderTop: `1px solid ${THEME_NOTEBOOK_RULE}`,
            }}
          >
            <button type="button" autoFocus style={closeBtnStyle} onClick={() => closeFpNotebookTipsPanel()}>
              Close (Esc)
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
