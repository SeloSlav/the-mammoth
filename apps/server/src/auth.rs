//! Username validation and “registered before gameplay” checks for The Mammoth.

use spacetimedb::ReducerContext;

use crate::accounts::{user, User};

const USERNAME_MIN_LEN: usize = 3;
const USERNAME_MAX_LEN: usize = 24;

pub(crate) fn is_valid_username(s: &str) -> Result<(), String> {
    let char_count = s.chars().count();
    if char_count < USERNAME_MIN_LEN {
        return Err(format!(
            "Username must be at least {} characters.",
            USERNAME_MIN_LEN
        ));
    }
    if char_count > USERNAME_MAX_LEN {
        return Err(format!(
            "Username must be at most {} characters.",
            USERNAME_MAX_LEN
        ));
    }
    let valid = s
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '-');
    if !valid {
        return Err(
            "Username may only contain letters, numbers, underscores, and hyphens.".to_string(),
        );
    }
    Ok(())
}

/// True once the player has chosen a display username (first-login gate).
pub(crate) fn has_completed_registration(user: &User) -> bool {
    user.username
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
}

/// Call at the start of reducers that require a finished login / username.
pub(crate) fn ensure_gameplay_unlocked(ctx: &ReducerContext) -> Result<(), String> {
    let user = ctx
        .db
        .user()
        .identity()
        .find(&ctx.sender())
        .ok_or("User not found")?;
    if !has_completed_registration(&user) {
        return Err("Choose a username before entering the world.".to_string());
    }
    Ok(())
}

/// True registered accounts connect with an OIDC JWT; anonymous guest tokens do not.
pub(crate) fn ensure_registered_account(ctx: &ReducerContext) -> Result<(), String> {
    ensure_gameplay_unlocked(ctx)?;
    if !ctx.sender_auth().has_jwt() {
        return Err("Apartment claims require a registered account.".to_string());
    }
    Ok(())
}

/// Chat / HUD display: prefer username, fall back to short identity string.
pub(crate) fn display_name_for(user: &User) -> String {
    user.username
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| user.identity.to_string())
}
