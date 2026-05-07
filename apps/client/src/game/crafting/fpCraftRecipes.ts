/**
 * HUD toast kinds from server `HudToastEvent` (`apps/server/src/crafting.rs`).
 * Recipe data lives on catalog items (`construction`); do not duplicate here.
 */

export const HUD_TOAST_KIND_ITEM_RECEIVED = 0;
export const HUD_TOAST_KIND_CRAFT_COMPLETE = 1;
/** Plain-text notices (apartment claims, system strings) — `def_id` holds the message. */
export const HUD_TOAST_KIND_NOTICE = 2;
