import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

/** Dynamic lookup so container builders (e.g. Railpack) do not treat this as a required build secret. */
function runtimeEnv(name: string): string | undefined {
  return process.env[name];
}

/** OIDC issuer and OG base must be absolute URLs with a scheme (host-only breaks crawlers). */
function normalizeHttpOrigin(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

const config = {
  isDevelopment: process.env.NODE_ENV !== "production",
  port: parseInt(process.env.PORT || "4001"),
  issuerUrl: normalizeHttpOrigin(
    process.env.ISSUER_URL ||
      (process.env.NODE_ENV === "production"
        ? "https://the-mammoth-production.up.railway.app"
        : "http://localhost:4001"),
  ),
  databaseUrl: process.env.DATABASE_URL,
  jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
  jwtPublicKey: process.env.JWT_PUBLIC_KEY,
  saltRounds: parseInt(process.env.BCRYPT_ROUNDS || "12"),
  corsAllowedOrigins: (runtimeEnv("CORS_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
};

const defaultCorsAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5175",
  "http://127.0.0.1:5175",
  "http://localhost:5176",
  "http://127.0.0.1:5176",
  "https://the-mammoth-production.up.railway.app",
  "https://themammoth.com",
];

/** In dev, union env origins with defaults so a prod-only CORS_ALLOWED_ORIGINS does not break local Vite. */
export const corsAllowedOrigins = config.isDevelopment
  ? [...new Set([...defaultCorsAllowedOrigins, ...config.corsAllowedOrigins])]
  : config.corsAllowedOrigins.length > 0
    ? config.corsAllowedOrigins
    : defaultCorsAllowedOrigins;

const devLocalOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function resolveCorsOrigin(originHeader: string): string | null {
  if (corsAllowedOrigins.includes(originHeader)) return originHeader;
  if (config.isDevelopment && devLocalOriginPattern.test(originHeader)) return originHeader;
  return null;
}

export const PORT = config.port;
export const ISSUER_URL = config.issuerUrl;
export const SALT_ROUNDS = config.saltRounds;

export { config as authConfig };

console.log(`[Config] Environment: ${config.isDevelopment ? "development" : "production"}`);
console.log(`[Config] Port: ${config.port}`);
console.log(`[Config] Issuer URL: ${config.issuerUrl}`);
console.log(`[Config] Database: ${config.databaseUrl ? "PostgreSQL" : "In-memory"}`);
console.log(`[Config] CORS allowed origins: ${corsAllowedOrigins.join(", ")}`);
