//! Account row per connected identity — used for login / display name before gameplay.

use spacetimedb::Identity;

#[spacetimedb::table(public, accessor = user)]
pub struct User {
    #[primary_key]
    pub identity: Identity,
    pub username: Option<String>,
    /// `0` = male body mesh, `1` = female — single-player profile only (see `set_avatar_body`).
    pub avatar_body: u8,
}
