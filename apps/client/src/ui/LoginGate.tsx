import { useState, type CSSProperties, type FormEvent } from "react";
import type { SpacetimeSession } from "../spacetime/SpacetimeProvider";
import { spacetimeDatabase, spacetimeUri } from "../spacetime/env";

type Props = {
  session: SpacetimeSession;
};

/**
 * Login / register username (SpaceTimeDB connection is owned by `useSpacetimeConnection` in App).
 */
export function LoginGate({ session }: Props) {
  const { phase, conn, errorMsg, submitUsername } = session;
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
          <p>Could not reach SpaceTimeDB.</p>
          <p style={hintStyle}>
            Trying <strong>{spacetimeUri()}</strong> · database{" "}
            <strong>{spacetimeDatabase()}</strong>
          </p>
          <pre style={preStyle}>{errorMsg}</pre>
          <p style={hintStyle}>
            The local node must be running (publishing the module does not start
            it). In one terminal:
          </p>
          <pre style={preStyle}>spacetime start</pre>
          <p style={hintStyle}>
            Then publish (name must match the database above), for example:
          </p>
          <pre style={preStyle}>
            spacetime publish mammoth-local --project-path apps/server
          </pre>
          <p style={hintStyle}>
            Dev defaults live in <code>apps/client/.env.development</code>; override
            with <code>apps/client/.env</code> or{" "}
            <code>apps/client/.env.development.local</code> if needed.
          </p>
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
