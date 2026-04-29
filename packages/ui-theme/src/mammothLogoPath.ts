/**
 * Public URL path for the official wordmark PNG. Served from:
 * - `apps/client/public` (Vite)
 * - `apps/auth` via {@link mountStaticImageRoutes} in `apps/auth/routes/staticAssets.ts`
 */
export const MAMMOTH_LOGO_PUBLIC_PATH = "/the-mammoth-logo.png" as const;
