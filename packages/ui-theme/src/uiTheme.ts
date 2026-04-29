/**
 * Shared UI tokens for The Mammoth (React inline styles, emails, server-rendered HTML).
 * CSS variables for `var(--ui-*)` are emitted by {@link uiRootStyleBlock}.
 */

export const THEME_TEXT_PRIMARY = "#e8e8ee";
export const THEME_TEXT_MUTED = "rgba(232, 232, 238, 0.75)";
export const THEME_TEXT_FAINT = "rgba(232, 232, 238, 0.52)";

export const THEME_ACCENT = "#6b8cae";
export const THEME_ACCENT_HOVER = "#7c9cbb";
export const THEME_ACCENT_ON = "#0f1218";

export const THEME_PAGE_BG_MID = "#2a2a38";
export const THEME_PAGE_BG_EDGE = "#121218";

export const THEME_CARD_BG = "rgba(0, 0, 0, 0.55)";
export const THEME_CARD_BORDER = "rgba(255, 255, 255, 0.08)";
export const THEME_CARD_BG_STRONG = "rgba(8, 10, 14, 0.78)";
export const THEME_CARD_BORDER_STRONG = "rgba(255, 255, 255, 0.16)";
export const THEME_PANEL_SHADOW = "0 26px 90px rgba(0, 0, 0, 0.52)";
export const THEME_DIVIDER = "rgba(255, 255, 255, 0.12)";

export const THEME_INPUT_BG = "#1a1a22";
export const THEME_INPUT_BORDER = "#3a3a48";

export const THEME_ERROR = "#e87878";
export const THEME_ERROR_BG = "rgba(232, 120, 120, 0.12)";
export const THEME_ERROR_BORDER = "rgba(232, 120, 120, 0.35)";
export const THEME_SUCCESS = "#7bcf9a";
export const THEME_SUCCESS_BG = "rgba(123, 207, 154, 0.1)";
export const THEME_SUCCESS_BORDER = "rgba(123, 207, 154, 0.35)";

export const THEME_SECONDARY_BG = "#4a4a58";
export const THEME_SECONDARY_TEXT = "#dddddd";

export const THEME_FOCUS_RING = "rgba(107, 140, 174, 0.35)";
export const THEME_BACKDROP_SCRIM = "rgba(9, 11, 16, 0.46)";
export const THEME_BACKDROP_VIGNETTE = "rgba(0, 0, 0, 0.64)";

export const UI_FONT_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Helvetica Neue", sans-serif';

/** Optional monospace for diagnostics / code in UI. */
export const UI_FONT_MONO = 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, monospace';

/**
 * Inject into `<style>` or prepend to a stylesheet so `var(--ui-*)` resolves app-wide.
 */
export function uiRootStyleBlock(): string {
  return `:root {
  color-scheme: dark;
  --ui-text-primary: ${THEME_TEXT_PRIMARY};
  --ui-text-muted: ${THEME_TEXT_MUTED};
  --ui-text-faint: ${THEME_TEXT_FAINT};
  --ui-accent: ${THEME_ACCENT};
  --ui-accent-hover: ${THEME_ACCENT_HOVER};
  --ui-accent-on: ${THEME_ACCENT_ON};
  --ui-page-bg-mid: ${THEME_PAGE_BG_MID};
  --ui-page-bg-edge: ${THEME_PAGE_BG_EDGE};
  --ui-card-bg: ${THEME_CARD_BG};
  --ui-card-border: ${THEME_CARD_BORDER};
  --ui-card-bg-strong: ${THEME_CARD_BG_STRONG};
  --ui-card-border-strong: ${THEME_CARD_BORDER_STRONG};
  --ui-panel-shadow: ${THEME_PANEL_SHADOW};
  --ui-divider: ${THEME_DIVIDER};
  --ui-input-bg: ${THEME_INPUT_BG};
  --ui-input-border: ${THEME_INPUT_BORDER};
  --ui-error: ${THEME_ERROR};
  --ui-error-bg: ${THEME_ERROR_BG};
  --ui-error-border: ${THEME_ERROR_BORDER};
  --ui-success: ${THEME_SUCCESS};
  --ui-success-bg: ${THEME_SUCCESS_BG};
  --ui-success-border: ${THEME_SUCCESS_BORDER};
  --ui-secondary-bg: ${THEME_SECONDARY_BG};
  --ui-secondary-text: ${THEME_SECONDARY_TEXT};
  --ui-focus-ring: ${THEME_FOCUS_RING};
  --ui-backdrop-scrim: ${THEME_BACKDROP_SCRIM};
  --ui-backdrop-vignette: ${THEME_BACKDROP_VIGNETTE};
}`;
}
