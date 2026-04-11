import { useState, type CSSProperties, type FormEvent } from "react";
import { authIssuerUrl } from "../auth/env";
import type { SpacetimeSession } from "../spacetime/SpacetimeProvider";
import { spacetimeDatabase, spacetimeUri } from "../spacetime/env";

type Props = {
  session: SpacetimeSession;
};

/**
 * Account gate: OpenAuth (`apps/auth`) first, then in-game display name on SpacetimeDB.
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
          <h1 style={{ marginTop: 0 }}>The Mammoth</h1>
          <p style={{ lineHeight: 1.5 }}>
            Sign in with your account (email + password). The game uses your auth server —
            not anonymous browser profiles.
          </p>
          {errorMsg ? <p style={{ color: "#f88", marginTop: 12 }}>{errorMsg}</p> : null}
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
          <h1 style={{ marginTop: 0 }}>The Mammoth</h1>
          <p>Connecting to SpaceTimeDB…</p>
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
          <h1 style={{ marginTop: 0 }}>The Mammoth</h1>
          <p>Could not connect to SpaceTimeDB with your login.</p>
          <p style={hintStyle}>
            Trying <strong>{spacetimeUri()}</strong> · database{" "}
            <strong>{spacetimeDatabase()}</strong>
          </p>
          <pre style={preStyle}>{errorMsg}</pre>
          <p style={hintStyle}>
            Ensure <code>spacetime start</code> is running, the module is published, and the
            node trusts JWTs from <strong>{authIssuerUrl()}</strong> (see{" "}
            <code>apps/client/.env.example</code>).
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
        <h1 style={{ marginTop: 0 }}>The Mammoth</h1>
        <p>
          Choose a display name (3–24 characters: letters, numbers, _ and -).
        </p>
        {errorMsg ? <p style={{ color: "#f88" }}>{errorMsg}</p> : null}
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
          style={{ ...buttonStyle, marginTop: 10, background: "#4a4a58", color: "#ddd" }}
          onClick={() => signOut()}
        >
          Use a different account
        </button>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "radial-gradient(ellipse at center, #2a2a38 0%, #121218 70%)",
  color: "#e8e8ee",
};

const cardStyle: CSSProperties = {
  width: "min(420px, 92vw)",
  padding: "28px 24px",
  borderRadius: 12,
  background: "rgba(0,0,0,0.55)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxSizing: "border-box",
};

const hintStyle: CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
};

const preStyle: CSSProperties = {
  fontSize: 12,
  textAlign: "left",
  overflow: "auto",
  padding: 10,
  background: "rgba(0,0,0,0.35)",
  borderRadius: 8,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  marginBottom: 12,
  borderRadius: 8,
  border: "1px solid #444",
  background: "#1a1a22",
  color: "#eee",
  fontSize: 16,
};

const buttonStyle: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 8,
  border: "none",
  background: "#6b8cae",
  color: "#111",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
};
