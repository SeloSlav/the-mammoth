import {
  MAMMOTH_AUTH_PASSWORD_SHELL_CSS,
  MAMMOTH_LOGO_PUBLIC_PATH,
  mammothIssuerSocialMetaHead,
} from "@the-mammoth/ui-theme";

const brandHeader = `
<div class="mammoth-brand-lockup">
  <img class="mammoth-logo-full" src="${MAMMOTH_LOGO_PUBLIC_PATH}" width="320" alt="The Mammoth" decoding="async" fetchpriority="high" />
</div>
<p class="mammoth-tagline">Late-socialist Balkan megablock survival</p>`;

export type MammothAuthPageSocial = {
  issuerOrigin: string;
  canonicalPath: string;
};

function escHtmlTitle(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

/**
 * Full HTML document for password auth flows, using shared monorepo theme CSS.
 * Pass `social` so link previews (Facebook, X, Slack, Discord, LinkedIn) resolve OG/Twitter tags.
 */
export function mammothAuthPage(
  title: string,
  innerAfterBrand: string,
  social?: MammothAuthPageSocial,
): string {
  const socialHead =
    social != null
      ? mammothIssuerSocialMetaHead({
          issuerOrigin: social.issuerOrigin,
          canonicalPath: social.canonicalPath,
          htmlTitle: title,
        })
      : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/png" href="/favicon.png">
  <title>${escHtmlTitle(title)}</title>
  ${socialHead}
  <style>${MAMMOTH_AUTH_PASSWORD_SHELL_CSS}</style>
</head>
<body>
  <div class="container">
    ${brandHeader}
    ${innerAfterBrand}
  </div>
</body>
</html>`;
}
