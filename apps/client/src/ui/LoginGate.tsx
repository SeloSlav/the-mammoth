import { useState, type CSSProperties, type FormEvent } from "react";
import type { SpacetimeSession } from "../spacetime/SpacetimeProvider";
import {
  THEME_ACCENT,
  THEME_ACCENT_ON,
  THEME_CARD_BG,
  THEME_CARD_BORDER,
  THEME_ERROR,
  THEME_INPUT_BG,
  THEME_INPUT_BORDER,
  THEME_PAGE_BG_EDGE,
  THEME_PAGE_BG_MID,
  THEME_SECONDARY_BG,
  THEME_SECONDARY_TEXT,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";

type Props = {
  session: SpacetimeSession;
};

/**
 * Account gate: OpenAuth (`apps/auth`) first, then in-game display name.
 */
export function LoginGate({ session }: Props) {
  const {
    phase,
    conn,
    errorMsg,
    submitUsername,
    startPasswordSignIn,
    signOut,
  } = session;
  const [nameInput, setNameInput] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!conn) return;
    setBusy(true);
    try {
      await submitUsername(nameInput);
    } finally {
      setBusy(false);
    }
  };

  if (phase === "needs_auth") {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>The Mammoth</h1>
          <p style={{ lineHeight: 1.5, color: THEME_TEXT_MUTED }}>
            Sign in with your account (email and password) to continue.
          </p>
          {errorMsg ? <p style={{ color: THEME_ERROR, marginTop: 12 }}>{errorMsg}</p> : null}
          <button
            type="button"
            style={buttonStyle}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await startPasswordSignIn();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Redirecting…" : "Sign in"}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "connecting" && !errorMsg) {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>The Mammoth</h1>
          <p style={{ color: THEME_TEXT_PRIMARY }}>Connecting…</p>
          <p style={hintStyle}>Checking you in with the building.</p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>The Mammoth</h1>
          <p style={{ color: THEME_TEXT_PRIMARY, lineHeight: 1.5 }}>
            The tower wouldn&apos;t open a line for you — your key reached the front desk, but the building
            didn&apos;t clear it.
          </p>
          <p style={{ ...hintStyle, lineHeight: 1.5 }}>{connectionErrorPlayerMessage(errorMsg)}</p>
          <p style={hintStyle}>
            If this keeps happening, try again in a few minutes or sign in from the lobby.
          </p>
          <button type="button" style={buttonStyle} onClick={() => signOut()}>
            Return to the lobby
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>The Mammoth</h1>
        <p style={{ color: THEME_TEXT_MUTED }}>
          Choose a display name (3–24 characters: letters, numbers, _ and -).
        </p>
        {errorMsg ? <p style={{ color: THEME_ERROR }}>{errorMsg}</p> : null}
        <form onSubmit={onSubmit}>
          <input
            autoFocus
            value={nameInput}
            onChange={(ev) => setNameInput(ev.target.value)}
            placeholder="username"
            style={inputStyle}
            disabled={busy || !conn}
            maxLength={24}
            autoComplete="username"
          />
          <button type="submit" style={buttonStyle} disabled={busy || !conn}>
            {busy ? "Saving…" : "Enter"}
          </button>
        </form>
        <button
          type="button"
          style={{ ...buttonStyle, marginTop: 10, background: THEME_SECONDARY_BG, color: THEME_SECONDARY_TEXT }}
          onClick={() => signOut()}
        >
          Use a different account
        </button>
      </div>
    </div>
  );
}

/** Player-facing only — never echo server responses or infrastructure details. */
function connectionErrorPlayerMessage(raw: string | null): string {
  if (!raw?.trim()) {
    return "The line went quiet before anyone explained why.";
  }
  const lower = raw.toLowerCase();
  if (lower.includes("verify token") || lower.includes("unauthorized")) {
    return "Security didn't recognize your access. Signing in again from the lobby sometimes clears it.";
  }
  if (lower.includes("websocket")) {
    return "We couldn't reach the building just now — check your connection, then try again.";
  }
  return "Something interrupted check-in before the doors could unlock.";
}

const titleStyle: CSSProperties = {
  marginTop: 0,
  color: THEME_ACCENT,
  fontWeight: 700,
  letterSpacing: "0.02em",
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: `radial-gradient(ellipse at center, ${THEME_PAGE_BG_MID} 0%, ${THEME_PAGE_BG_EDGE} 70%)`,
  color: THEME_TEXT_PRIMARY,
  fontFamily: UI_FONT_SANS,
};

const cardStyle: CSSProperties = {
  width: "min(420px, 92vw)",
  padding: "28px 24px",
  borderRadius: 12,
  background: THEME_CARD_BG,
  border: `1px solid ${THEME_CARD_BORDER}`,
  boxSizing: "border-box",
};

const hintStyle: CSSProperties = {
  fontSize: 12,
  color: THEME_TEXT_MUTED,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  marginBottom: 12,
  borderRadius: 8,
  border: `1px solid ${THEME_INPUT_BORDER}`,
  background: THEME_INPUT_BG,
  color: THEME_TEXT_PRIMARY,
  fontSize: 16,
};

const buttonStyle: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 8,
  border: "none",
  background: THEME_ACCENT,
  color: THEME_ACCENT_ON,
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
};
