import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { getFpPickupPrompt, subscribeFpPickupPrompt } from "../game/fpPickupPrompt";

function mammothInventoryOpen(): boolean {
  return document.querySelector('[data-mammoth-inventory="open"]') !== null;
}

const frameBase: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: "max(22%, calc(env(safe-area-inset-bottom, 0px) + 140px))",
  transform: "translateX(-50%)",
  zIndex: 124,
  pointerEvents: "none",
  maxWidth: "min(92vw, 420px)",
  padding: "14px 22px",
  borderRadius: 14,
  background: "linear-gradient(165deg, rgba(18,22,34,0.96) 0%, rgba(10,12,20,0.98) 100%)",
  color: "#c8d4e8",
  fontSize: 15,
  lineHeight: 1.45,
  textAlign: "center",
  fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
};

function FpBottomInteractPromptFrame(props: {
  borderRgb: string;
  glowRgb: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        ...frameBase,
        border: `1px solid ${props.borderRgb}`,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.06) inset, 0 12px 40px rgba(0,0,0,0.55), 0 0 28px ${props.glowRgb}`,
      }}
    >
      {props.children}
    </div>
  );
}

function InteractKeyE(props: {
  kbdGradient: string;
  kbdBorderRgb: string;
  kbdShadowRgb: string;
  kbdText: string;
}) {
  return (
    <kbd
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        margin: "0 6px",
        padding: "4px 12px",
        borderRadius: 8,
        border: `1px solid ${props.kbdBorderRgb}`,
        background: props.kbdGradient,
        color: props.kbdText,
        fontWeight: 800,
        fontSize: 16,
        fontFamily: "inherit",
        lineHeight: 1.1,
        boxShadow: `0 2px 12px ${props.kbdShadowRgb}, 0 1px 0 rgba(255,255,255,0.35) inset`,
        textShadow: "0 1px 0 rgba(255,255,255,0.25)",
      }}
    >
      E
    </kbd>
  );
}

/**
 * Shown when the FP loop reports a droppable within pickup range or an elevator exterior door
 * (see `mountFpSession` + `fpPickupPrompt`).
 */
export function MammothPickupPromptHud() {
  const prompt = useSyncExternalStore(subscribeFpPickupPrompt, getFpPickupPrompt, getFpPickupPrompt);
  if (!prompt || mammothInventoryOpen()) return null;

  if (prompt.kind === "dropped_item") {
    return (
      <FpBottomInteractPromptFrame
        borderRgb="rgba(120,200,255,0.45)"
        glowRgb="rgba(92,200,255,0.18)"
      >
        <span style={{ opacity: 0.92 }}>Press </span>
        <InteractKeyE
          kbdGradient="linear-gradient(180deg, #6ad0ff 0%, #2a9fd6 45%, #1a7cb0 100%)"
          kbdBorderRgb="rgba(180,230,255,0.55)"
          kbdShadowRgb="rgba(92,200,255,0.45)"
          kbdText="#031018"
        />
        <span style={{ opacity: 0.92 }}> to pick up </span>
        <strong style={{ color: "#f0f6ff", fontWeight: 700 }}>{prompt.displayName}</strong>
      </FpBottomInteractPromptFrame>
    );
  }

  return (
    <FpBottomInteractPromptFrame
      borderRgb="rgba(255,120,120,0.45)"
      glowRgb="rgba(255,100,100,0.15)"
    >
      <span style={{ opacity: 0.92 }}>Press </span>
      <InteractKeyE
        kbdGradient="linear-gradient(180deg, #ff8a7a 0%, #d6453c 45%, #a82822 100%)"
        kbdBorderRgb="rgba(255,180,180,0.55)"
        kbdShadowRgb="rgba(255,90,70,0.35)"
        kbdText="#1a0604"
      />
      <span style={{ opacity: 0.92 }}>
        {prompt.willClose ? " to close corridor door — " : " to open corridor door — "}
      </span>
      <strong style={{ color: "#f0f6ff", fontWeight: 700 }}>{prompt.floorLabel}</strong>
    </FpBottomInteractPromptFrame>
  );
}
