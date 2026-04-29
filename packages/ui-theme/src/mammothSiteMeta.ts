import { THEME_PAGE_BG_EDGE } from "./uiTheme.js";

/** Primary brand string (no tagline). */
export const MAMMOTH_SITE_NAME = "The Mammoth" as const;

/** Default `<title>` / share title for marketing surfaces. */
export const MAMMOTH_DEFAULT_HTML_TITLE =
  `${MAMMOTH_SITE_NAME} — Balkan megablock survival` as const;

/**
 * Meta description (~155–165 chars) — keep aligned with `og:description` unless you intentionally
 * split editorial.
 */
export const MAMMOTH_META_DESCRIPTION =
  "Late-socialist Balkan megablock survival: brutalist tower, long corridors, thin luck. Multiplayer social survival with WebGPU — claim a flat and see how long you last in The Mammoth.";

export const MAMMOTH_OG_DESCRIPTION = MAMMOTH_META_DESCRIPTION;

export const MAMMOTH_KEYWORDS = [
  "The Mammoth",
  "survival game",
  "multiplayer",
  "Balkan",
  "megablock",
  "commie block",
  "brutalist",
  "late socialist",
  "social survival",
  "WebGPU",
  "online game",
].join(", ");

export const MAMMOTH_OG_IMAGE_PATH = "/og-social.jpg" as const;
export const MAMMOTH_OG_IMAGE_WIDTH = 1024;
export const MAMMOTH_OG_IMAGE_HEIGHT = 537;
export const MAMMOTH_OG_IMAGE_TYPE = "image/jpeg" as const;

export const MAMMOTH_OG_IMAGE_ALT =
  "The Mammoth — brutalist tower mark and THE MAMMOTH wordmark" as const;

export type MammothIssuerSocialHeadOpts = {
  issuerOrigin: string;
  /** Absolute path on this origin, e.g. `/document` — query strings are stripped. */
  canonicalPath: string;
  /** `<title>` and primary `og:title` / `twitter:title`. */
  htmlTitle: string;
};

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function normalizePath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return (p.split("?")[0] ?? p) || "/";
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Open Graph + Twitter (X) + baseline SEO tags for a page on a single origin (auth issuer or game site).
 */
export function mammothIssuerSocialMetaHead(opts: MammothIssuerSocialHeadOpts): string {
  const origin = normalizeOrigin(opts.issuerOrigin);
  const pathOnly = normalizePath(opts.canonicalPath);
  const canonicalUrl = `${origin}${pathOnly}`;
  const ogImageUrl = `${origin}${MAMMOTH_OG_IMAGE_PATH}`;

  return `
  <meta name="description" content="${escAttr(MAMMOTH_META_DESCRIPTION)}" />
  <meta name="keywords" content="${escAttr(MAMMOTH_KEYWORDS)}" />
  <meta name="author" content="${escAttr(MAMMOTH_SITE_NAME)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${escAttr(canonicalUrl)}" />
  <link rel="image_src" href="${escAttr(ogImageUrl)}" />
  <meta name="theme-color" content="${escAttr(THEME_PAGE_BG_EDGE)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escAttr(MAMMOTH_SITE_NAME)}" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:title" content="${escAttr(opts.htmlTitle)}" />
  <meta property="og:description" content="${escAttr(MAMMOTH_OG_DESCRIPTION)}" />
  <meta property="og:url" content="${escAttr(canonicalUrl)}" />
  <meta property="og:image" content="${escAttr(ogImageUrl)}" />
  <meta property="og:image:secure_url" content="${escAttr(ogImageUrl)}" />
  <meta property="og:image:type" content="${MAMMOTH_OG_IMAGE_TYPE}" />
  <meta property="og:image:width" content="${String(MAMMOTH_OG_IMAGE_WIDTH)}" />
  <meta property="og:image:height" content="${String(MAMMOTH_OG_IMAGE_HEIGHT)}" />
  <meta property="og:image:alt" content="${escAttr(MAMMOTH_OG_IMAGE_ALT)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(opts.htmlTitle)}" />
  <meta name="twitter:description" content="${escAttr(MAMMOTH_OG_DESCRIPTION)}" />
  <meta name="twitter:image" content="${escAttr(ogImageUrl)}" />
  <meta name="twitter:image:alt" content="${escAttr(MAMMOTH_OG_IMAGE_ALT)}" />
  `.trim();
}

/** Game client root (`/`) — same OG image, canonical on the game origin. */
export function mammothGameClientSocialMetaHead(siteOrigin: string): string {
  return mammothIssuerSocialMetaHead({
    issuerOrigin: siteOrigin,
    canonicalPath: "/",
    htmlTitle: MAMMOTH_DEFAULT_HTML_TITLE,
  });
}
