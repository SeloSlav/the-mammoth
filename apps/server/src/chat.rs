//! Minimal global transcript for MVP (claim broadcasts + player-free chat).

use spacetimedb::{ReducerContext, Table, Timestamp};

use crate::accounts::user;
use crate::auth;

const CHAT_BODY_MAX_CHARS: usize = 220;

#[spacetimedb::table(public, accessor = chat_message)]
pub struct ChatMessage {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    /// `None` for system / server transcripts; `Some` for player-typed lines from `send_chat`.
    pub sender: Option<String>,
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
        sender: None,
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
    let Some(user) = ctx.db.user().identity().find(&ctx.sender()) else {
        log::debug!("send_chat: user row missing");
        return;
    };
    let text = sanitize_body(body);
    if text.is_empty() {
        return;
    }
    let dn = auth::display_name_for(&user);
    let _ = ctx.db.chat_message().insert(ChatMessage {
        id: 0,
        sender: Some(dn),
        body: text,
        created_at: ctx.timestamp,
    });
}
