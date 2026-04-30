import {
  THEME_CARD_BG,
  THEME_CARD_BORDER,
  THEME_CHAT_NAME_PEER,
  THEME_CHAT_NAME_SELF,
  THEME_FOCUS_RING,
  THEME_INPUT_BG,
  THEME_INPUT_BORDER,
  THEME_TEXT_FAINT,
  THEME_TEXT_PRIMARY,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { DbConnection } from "../module_bindings";
import { isTextInputFocused } from "../game/isTextInputFocused.js";
import { readOptionalString } from "../spacetime/username";

type Props = { conn: DbConnection; localDisplayName: string };

const MAX_ROWS = 10;

function mammothInventoryOpen() {
  return document.querySelector('[data-mammoth-inventory="open"]') !== null;
}

/** Bottom-left global chat: Enter toggles focus; game keys ignored while the input is focused. */
export function MammothChatHud({ conn, localDisplayName }: Props) {
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selfName = localDisplayName.trim();

  const bump = useCallback(() => setTick((v) => v + 1), []);

  useEffect(() => {
    conn.db.chat_message.onInsert(bump);
    return () => {
      conn.db.chat_message.removeOnInsert(bump);
    };
  }, [conn, bump]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Enter" || e.repeat) return;
      if (isTextInputFocused()) return;
      if (mammothInventoryOpen()) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const rows = useMemo(() => {
    void tick;
    const out: { id: bigint; sender?: string; body: string }[] = [];
    for (const r of conn.db.chat_message) {
      const id = typeof r.id === "bigint" ? r.id : BigInt(r.id as number);
      const sender = readOptionalString(r.sender);
      out.push({ id, sender, body: r.body });
    }
    out.sort((a, b) => Number(a.id - b.id));
    return out.slice(Math.max(0, out.length - MAX_ROWS));
  }, [conn, tick]);

  const closeChat = useCallback(() => {
    setOpen(false);
    setDraft("");
    inputRef.current?.blur();
  }, []);

  const submitOrClose = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0) {
      closeChat();
      return;
    }
    try {
      void conn.reducers.sendChat({ body: text });
    } catch (err) {
      console.warn("[MammothChatHud] sendChat failed", err);
    }
    closeChat();
  }, [conn.reducers, draft, closeChat]);

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.code === "Enter") {
      e.preventDefault();
      submitOrClose();
      return;
    }
    if (e.code === "Escape") {
      e.preventDefault();
      closeChat();
    }
  };

  const bottomOffset = "max(88px, calc(env(safe-area-inset-bottom, 0px) + 72px))";

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: 12,
        bottom: bottomOffset,
        zIndex: 55,
        maxWidth: "min(92vw, 420px)",
        fontFamily: UI_FONT_SANS,
        pointerEvents: open ? "auto" : "none",
      }}
      data-testid="mammoth-chat-hud"
    >
      {(rows.length > 0 || open) && (
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.38,
            color: THEME_TEXT_PRIMARY,
            background: THEME_CARD_BG,
            border: `1px solid ${THEME_CARD_BORDER}`,
            marginBottom: open ? 6 : 0,
          }}
        >
          {rows.map((r) => (
            <ChatLine key={String(r.id)} selfName={selfName} sender={r.sender} body={r.body} />
          ))}
          {rows.length === 0 && open ? (
            <div style={{ color: THEME_TEXT_FAINT, fontSize: 11 }}>No messages yet.</div>
          ) : null}
        </div>
      )}
      {open ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          maxLength={220}
          placeholder="Message… Enter send · Esc cancel"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onInputKeyDown}
          onBlur={() => {
            queueMicrotask(() => {
              const root = panelRef.current;
              const ae = document.activeElement;
              if (root && ae instanceof Node && root.contains(ae)) return;
              setOpen(false);
              setDraft("");
            });
          }}
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontSize: 13,
            padding: "8px 10px",
            borderRadius: 8,
            border: `1px solid ${THEME_INPUT_BORDER}`,
            background: THEME_INPUT_BG,
            color: THEME_TEXT_PRIMARY,
            outline: "none",
            boxShadow: `0 0 0 2px ${THEME_FOCUS_RING}`,
          }}
        />
      ) : null}
    </div>
  );
}

function ChatLine({
  selfName,
  sender,
  body,
}: {
  selfName: string;
  sender?: string;
  body: string;
}) {
  if (!sender) {
    return <div style={{ color: THEME_TEXT_FAINT }}>{body}</div>;
  }
  const isSelf = sender === selfName;
  const nameColor = isSelf ? THEME_CHAT_NAME_SELF : THEME_CHAT_NAME_PEER;
  return (
    <div>
      <span style={{ fontWeight: 600, color: nameColor }}>{sender}</span>
      <span style={{ color: THEME_TEXT_FAINT }}>{": "}</span>
      <span>{body}</span>
    </div>
  );
}
