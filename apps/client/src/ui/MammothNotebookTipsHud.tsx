import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
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
  buildNotebookSpreads,
  NOTEBOOK_CONTENT_LINES_PER_PAGE,
  NOTEBOOK_OWNER,
  NOTEBOOK_RULE_STEP_PX,
  type NotebookLayoutBlock,
  type NotebookSpread,
} from "./playerNotebookLayout";

const MARGIN_X_PX = 56;
const NOTEBOOK_HEIGHT_PX = 680;
const FOOTER_HEIGHT_PX = 56;
const CONTENT_HEIGHT_PX = NOTEBOOK_CONTENT_LINES_PER_PAGE * NOTEBOOK_RULE_STEP_PX;

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
  height: NOTEBOOK_HEIGHT_PX,
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
    transparent ${NOTEBOOK_RULE_STEP_PX - 1}px,
    ${THEME_NOTEBOOK_RULE} ${NOTEBOOK_RULE_STEP_PX - 1}px,
    ${THEME_NOTEBOOK_RULE} ${NOTEBOOK_RULE_STEP_PX}px
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

const contentPaneStyle: CSSProperties = {
  height: CONTENT_HEIGHT_PX,
  overflow: "hidden",
  padding: `4px 28px 0 ${MARGIN_X_PX + 8}px`,
  backgroundImage: ruledPaperBackground,
  boxSizing: "border-box",
};

const navBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  padding: "4px 8px",
  color: THEME_NOTEBOOK_INK,
  cursor: "pointer",
  fontFamily: UI_FONT_NOTEBOOK,
  fontSize: 20,
  lineHeight: 1.2,
};

const navBtnDisabledStyle: CSSProperties = {
  ...navBtnStyle,
  color: THEME_NOTEBOOK_INK_FAINT,
  cursor: "default",
  textDecoration: "none",
};

const closeBtnStyle: CSSProperties = {
  ...navBtnStyle,
  textDecoration: "underline",
  textDecorationThickness: 1.5,
  textUnderlineOffset: 5,
  marginLeft: 12,
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

function blockKey(block: NotebookLayoutBlock, index: number): string {
  return `${block.type}:${index}:${"text" in block ? block.text : ""}`;
}

const ruledRowStyle: CSSProperties = {
  height: NOTEBOOK_RULE_STEP_PX,
  minHeight: NOTEBOOK_RULE_STEP_PX,
  maxHeight: NOTEBOOK_RULE_STEP_PX,
  overflow: "hidden",
  lineHeight: `${NOTEBOOK_RULE_STEP_PX}px`,
  boxSizing: "border-box",
};

function NotebookCoverPage() {
  return (
    <div
      style={{
        ...contentPaneStyle,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        paddingLeft: MARGIN_X_PX + 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          lineHeight: `${NOTEBOOK_RULE_STEP_PX}px`,
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
          margin: "4px 0 0",
          fontSize: 22,
          lineHeight: `${NOTEBOOK_RULE_STEP_PX}px`,
          color: THEME_NOTEBOOK_INK,
        }}
      >
        {NOTEBOOK_OWNER.dateLabel}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 20,
          lineHeight: `${NOTEBOOK_RULE_STEP_PX}px`,
          color: THEME_NOTEBOOK_INK_FAINT,
          maxWidth: "92%",
        }}
      >
        {NOTEBOOK_OWNER.dateNote}
      </p>
      <p
        style={{
          marginTop: NOTEBOOK_RULE_STEP_PX,
          fontSize: 18,
          lineHeight: `${NOTEBOOK_RULE_STEP_PX}px`,
          color: THEME_NOTEBOOK_INK_FAINT,
        }}
      >
        Next → or arrow keys to turn the page.
      </p>
    </div>
  );
}

function NotebookContentPage({ blocks }: { blocks: readonly NotebookLayoutBlock[] }) {
  return (
    <div style={contentPaneStyle}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "ref-heading":
            return (
              <h2
                key={blockKey(block, index)}
                style={{
                  ...ruledRowStyle,
                  margin: 0,
                  paddingTop: index === 0 ? 2 : 0,
                  fontSize: 24,
                  fontWeight: 400,
                  color: THEME_NOTEBOOK_INK,
                }}
              >
                {block.text}
              </h2>
            );
          case "ref-heading-rule":
            return (
              <div
                key={blockKey(block, index)}
                aria-hidden
                style={{
                  ...ruledRowStyle,
                  borderBottom: `1.5px solid ${THEME_NOTEBOOK_INK_MUTED}`,
                }}
              />
            );
          case "ref-bullet":
            return (
              <div
                key={blockKey(block, index)}
                style={{
                  ...ruledRowStyle,
                  position: "relative",
                  paddingLeft: 18,
                  fontSize: 20,
                  color: THEME_NOTEBOOK_INK_MUTED,
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
                {block.text}
              </div>
            );
          case "diary-divider-bar":
            return (
              <div
                key={blockKey(block, index)}
                aria-hidden
                style={{
                  ...ruledRowStyle,
                  borderTop: `2px double ${THEME_NOTEBOOK_INK_FAINT}`,
                }}
              />
            );
          case "diary-divider-label":
            return (
              <div
                key={blockKey(block, index)}
                aria-hidden
                style={{
                  ...ruledRowStyle,
                  color: THEME_NOTEBOOK_INK_FAINT,
                  fontSize: 20,
                  letterSpacing: "0.06em",
                }}
              >
                {block.text}
              </div>
            );
          case "diary-date":
            return (
              <div
                key={blockKey(block, index)}
                style={{
                  ...ruledRowStyle,
                  fontSize: 18,
                  color: THEME_NOTEBOOK_INK_FAINT,
                }}
              >
                {block.text}
              </div>
            );
          case "diary-heading":
            return (
              <h2
                key={blockKey(block, index)}
                style={{
                  ...ruledRowStyle,
                  margin: 0,
                  fontSize: 26,
                  fontWeight: 400,
                  color: THEME_NOTEBOOK_INK,
                }}
              >
                {block.text}
              </h2>
            );
          case "diary-line":
            return (
              <p
                key={blockKey(block, index)}
                style={{
                  ...ruledRowStyle,
                  margin: 0,
                  fontSize: 20,
                  color: THEME_NOTEBOOK_INK_MUTED,
                }}
              >
                {block.text || "\u00A0"}
              </p>
            );
        }
      })}
    </div>
  );
}

function renderSpread(spread: NotebookSpread) {
  if (spread.cover) return <NotebookCoverPage />;
  return <NotebookContentPage blocks={spread.blocks} />;
}

export function MammothNotebookTipsHud() {
  const open = useSyncExternalStore(
    subscribeFpNotebookTipsPanel,
    isFpNotebookTipsPanelOpen,
    isFpNotebookTipsPanelOpen,
  );
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const spreads = useMemo(() => buildNotebookSpreads(), [layoutEpoch]);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    if (typeof document === "undefined") return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) setLayoutEpoch((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (open) setPageIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeFpNotebookTipsPanel();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        setPageIndex((i) => Math.min(i + 1, spreads.length - 1));
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setPageIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, spreads.length]);

  if (!open) return null;

  const pageCount = spreads.length;
  const atStart = pageIndex <= 0;
  const atEnd = pageIndex >= pageCount - 1;
  const spread = spreads[pageIndex]!;

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
          {renderSpread(spread)}

          <footer
            style={{
              height: FOOTER_HEIGHT_PX,
              boxSizing: "border-box",
              padding: `8px 22px 12px ${MARGIN_X_PX + 8}px`,
              borderTop: `1px solid ${THEME_NOTEBOOK_RULE}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              style={atStart ? navBtnDisabledStyle : navBtnStyle}
              disabled={atStart}
              onClick={() => setPageIndex((i) => Math.max(i - 1, 0))}
            >
              ← Back
            </button>
            <span
              style={{
                fontSize: 18,
                color: THEME_NOTEBOOK_INK_FAINT,
                lineHeight: 1.2,
                userSelect: "none",
              }}
            >
              {pageIndex + 1} / {pageCount}
            </span>
            <div style={{ display: "flex", alignItems: "center" }}>
              <button
                type="button"
                style={atEnd ? navBtnDisabledStyle : navBtnStyle}
                disabled={atEnd}
                onClick={() => setPageIndex((i) => Math.min(i + 1, pageCount - 1))}
              >
                Next →
              </button>
              <button type="button" autoFocus style={closeBtnStyle} onClick={() => closeFpNotebookTipsPanel()}>
                Close
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
