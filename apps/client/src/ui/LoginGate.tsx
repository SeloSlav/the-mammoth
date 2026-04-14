import { useState, type CSSProperties, type FormEvent } from "react";
import { authIssuerUrl } from "../auth/env";
import type { SpacetimeSession } from "../spacetime/SpacetimeProvider";
import { spacetimeDatabase, spacetimeUri } from "../spacetime/env";
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
            Sign in with your account (email and password). The game uses your auth server — not
            anonymous browser profiles.
          </p>
          {errorMsg ? <p style={{ color: THEME_ERROR, marginTop: 12 }}>{errorMsg}</p> : null}
          <p style={hintStyle}>
            Auth issuer: <strong>{authIssuerUrl()}</strong>
          </p>
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
          <p style={hintStyle}>
            {spacetimeUri()} · {spacetimeDatabase()}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>The Mammoth</h1>
          <p style={{ color: THEME_TEXT_PRIMARY }}>Could not connect to the game server with your login.</p>
          <p style={hintStyle}>
            Trying <strong>{spacetimeUri()}</strong> · database <strong>{spacetimeDatabase()}</strong>
          </p>
          <pre style={preStyle}>{errorMsg}</pre>
          <p style={hintStyle}>
            Ensure the game server is running, the module is published, and the node trusts JWTs from{" "}
            <strong>{authIssuerUrl()}</strong> (see <code>apps/client/.env.example</code>).
          </p>
          <button type="button" style={buttonStyle} onClick={() => signOut()}>
            Back to sign in
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

const preStyle: CSSProperties = {
  fontSize: 12,
  textAlign: "left",
  overflow: "auto",
  padding: 10,
  background: "rgba(0,0,0,0.35)",
  borderRadius: 8,
  color: THEME_TEXT_PRIMARY,
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
