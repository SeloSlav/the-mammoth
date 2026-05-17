import type { ApartmentDoorInteractPromptKind } from "@the-mammoth/world";
import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { getFpPickupPrompt, subscribeFpPickupPrompt } from "../game/fpInteraction/fpPickupPrompt";

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

/** Bottom interact bar — elevators, pickups, Balkan MVP apartment flows. */
export function MammothPickupPromptHud() {
  const prompt = useSyncExternalStore(subscribeFpPickupPrompt, getFpPickupPrompt, getFpPickupPrompt);
  if (!prompt || mammothInventoryOpen()) return null;

  const doorNoun: Record<ApartmentDoorInteractPromptKind, string> = {
    stairwell: "stairwell door",
    hallway: "hallway door",
    unit: "apartment door",
  };

  if (prompt.kind === "elevator_exterior_door") {
    return (
      <FpBottomInteractPromptFrame borderRgb="rgba(255,120,120,0.45)" glowRgb="rgba(255,100,100,0.15)">
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

  if (prompt.kind === "dropped_item") {
    const isWorld = prompt.worldAnchorSpawn === true;
    return (
      <FpBottomInteractPromptFrame borderRgb="rgba(120,200,255,0.45)" glowRgb="rgba(92,200,255,0.18)">
        <span style={{ opacity: 0.92 }}>Press </span>
        <InteractKeyE
          kbdGradient="linear-gradient(180deg, #6ad0ff 0%, #2a9fd6 45%, #1a7cb0 100%)"
          kbdBorderRgb="rgba(180,230,255,0.55)"
          kbdShadowRgb="rgba(92,200,255,0.45)"
          kbdText="#031018"
        />
        <span style={{ opacity: 0.92 }}>{isWorld ? " to collect " : " to pick up "}</span>
        <strong style={{ color: "#f0f6ff", fontWeight: 700 }}>{prompt.displayName}</strong>
      </FpBottomInteractPromptFrame>
    );
  }

  if (prompt.kind === "apartment_door") {
    const openClose = prompt.willClose ? "close" : "open";
    return (
      <FpBottomInteractPromptFrame borderRgb="rgba(210,170,110,0.45)" glowRgb="rgba(210,160,90,0.18)">
        <span style={{ opacity: 0.92 }}>Press </span>
        <InteractKeyE
          kbdGradient="linear-gradient(180deg, #e9c285 0%, #b98645 45%, #855f2d 100%)"
          kbdBorderRgb="rgba(240,210,160,0.55)"
          kbdShadowRgb="rgba(210,160,90,0.35)"
          kbdText="#180e04"
        />
        <span style={{ opacity: 0.92 }}>
          {` to ${openClose} ${doorNoun[prompt.promptKind]}`}
        </span>
      </FpBottomInteractPromptFrame>
    );
  }

  if (prompt.kind === "apartment_claim_blocked_gear") {
    const msg =
      prompt.missingDoorLock && prompt.missingScrewdriver
        ? "You need a door lock plus a screwdriver in inventory/hotbar. Craft the lock with 5× scrap metal (B opens crafting — tool not consumed)."
        : prompt.missingDoorLock
          ? "Door lock missing — craft one from 5× scrap metal in the B crafting panel (keep a screwdriver in inventory or hotbar)."
          : "You need a screwdriver (inventory or hotbar) to install the lock when claiming.";
    return (
      <FpBottomInteractPromptFrame borderRgb="rgba(255,110,110,0.55)" glowRgb="rgba(255,70,70,0.18)">
        <div style={{ marginBottom: 8, fontWeight: 700, color: "#ffb8b8" }}>{prompt.displayLabel}</div>
        <div style={{ color: "#ff8a8a", fontWeight: 600 }}>{msg}</div>
        <div style={{ opacity: 0.82, marginTop: 6, fontSize: 12 }}>
          Face this apartment&apos;s wardrobe (center of screen) from inside the unit.
        </div>
      </FpBottomInteractPromptFrame>
    );
  }

  if (prompt.kind === "apartment_claim_blocked_guest") {
    return (
      <FpBottomInteractPromptFrame borderRgb="rgba(255,150,90,0.55)" glowRgb="rgba(255,100,40,0.16)">
        <div style={{ marginBottom: 8, fontWeight: 700, color: "#ffd0b0" }}>{prompt.displayLabel}</div>
        <div style={{ color: "#ffad82", fontWeight: 650 }}>Guests cannot claim apartments.</div>
        <div style={{ opacity: 0.82, marginTop: 6, fontSize: 12 }}>
          Sign in with an account to own a door. Guests are here to scavenge and fight.
        </div>
      </FpBottomInteractPromptFrame>
    );
  }

  if (prompt.kind === "apartment_claim") {
    const remain = Math.max(0, prompt.claimFullSecs - prompt.claimProgressSecs);
    const pct = Math.min(1, Math.max(0, prompt.claimProgressSecs / prompt.claimFullSecs));
    const secUi = remain >= 10 ? remain.toFixed(0) : remain.toFixed(1);
    return (
      <FpBottomInteractPromptFrame borderRgb="rgba(200,230,170,0.45)" glowRgb="rgba(120,200,100,0.16)">
        <div style={{ marginBottom: 10, fontWeight: 700, color: "#e8f4dc" }}>{prompt.displayLabel}</div>
        <div
          style={{
            height: 5,
            borderRadius: 3,
            background: "rgba(255,255,255,0.08)",
            marginBottom: 10,
            overflow: "hidden",
          }}
        >
          <div style={{ width: `${pct * 100}%`, height: "100%", background: "linear-gradient(90deg, #6a9a52, #a8d878)" }} />
        </div>
        <span style={{ opacity: 0.92 }}>Hold </span>
        <InteractKeyE
          kbdGradient="linear-gradient(180deg, #cbe8b4 0%, #82b06a 45%, #4d743a 100%)"
          kbdBorderRgb="rgba(220,255,210,0.45)"
          kbdShadowRgb="rgba(140,210,110,0.28)"
          kbdText="#061004"
        />
        <span style={{ opacity: 0.92 }}>
          {` to claim — ~${secUi}s left (keep the wardrobe centered; uses door lock + screwdriver).`}
        </span>
      </FpBottomInteractPromptFrame>
    );
  }

  if (prompt.kind === "apartment_stash") {
    const stashTitle =
      prompt.stashLabel.length === 0
        ? ""
        : `${prompt.stashLabel[0]!.toUpperCase()}${prompt.stashLabel.slice(1)}`;
    return (
      <FpBottomInteractPromptFrame borderRgb="rgba(255,200,140,0.38)" glowRgb="rgba(255,180,100,0.14)">
        <span style={{ opacity: 0.92 }}>Press </span>
        <InteractKeyE
          kbdGradient="linear-gradient(180deg, #ffd8b0 0%, #da9a55 45%, #8a5822 100%)"
          kbdBorderRgb="rgba(255,220,170,0.5)"
          kbdShadowRgb="rgba(255,160,70,0.28)"
          kbdText="#120802"
        />
        <span style={{ opacity: 0.92 }}> — </span>
        <strong style={{ color: "#f0f6ff", fontWeight: 700 }}>{stashTitle === "" ? "Stash" : `Open ${stashTitle}`}</strong>
      </FpBottomInteractPromptFrame>
    );
  }

  const _never: never = prompt;
  return _never;
}
