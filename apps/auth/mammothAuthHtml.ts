import { MAMMOTH_AUTH_PASSWORD_SHELL_CSS } from "@the-mammoth/ui-theme";

const brandHeader = `
<div class="mammoth-brand">The Mammoth</div>
<p class="mammoth-tagline">Account</p>`;

/**
 * Full HTML document for password auth flows, using shared monorepo theme CSS.
 */
export function mammothAuthPage(title: string, innerAfterBrand: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/png" href="/favicon.png">
  <title>${title}</title>
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
