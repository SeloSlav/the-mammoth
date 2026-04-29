//! Minimal global transcript for MVP (claim broadcasts + player-free chat).

use spacetimedb::{ReducerContext, Table, Timestamp};

use crate::auth;

const CHAT_BODY_MAX_CHARS: usize = 220;

#[spacetimedb::table(public, accessor = chat_message)]
pub struct ChatMessage {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub body: String,
    #[index(btree)]
    pub created_at: Timestamp,
}

/// Inserts without auth — callers must be trusted reducers (`claim_apartment_pulse`, scheduled jobs).
pub(crate) fn post_system_message(ctx: &ReducerContext, body: String) {
    let text = sanitize_body(body);
    if text.is_empty() {
        return;
    }
    let _ = ctx.db.chat_message().insert(ChatMessage {
        id: 0,
        body: text,
        created_at: ctx.timestamp,
    });
}

fn sanitize_body(body: String) -> String {
    let trimmed = body.trim();
    let cut: String = trimmed.chars().take(CHAT_BODY_MAX_CHARS).collect();
    cut
}

#[spacetimedb::reducer]
pub fn send_chat(ctx: &ReducerContext, body: String) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("send_chat blocked: {e}");
        return;
    }
    post_system_message(ctx, body);
}
