/**
 * OpenAuth issuer + Hono server with password UI and custom OIDC code/token flow.
 * Loads env from `./config.js` (imported for side effects via `index.ts` or here).
 */
import { PORT, ISSUER_URL, SALT_ROUNDS, resolveCorsOrigin } from "./config.js";
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { issuer } from '@openauthjs/openauth';
import { PasswordProvider } from '@openauthjs/openauth/provider/password';
import { PasswordUI } from '@openauthjs/openauth/ui/password';
import { MemoryStorage } from '@openauthjs/openauth/storage/memory';
import { Select } from '@openauthjs/openauth/ui/select';
import { subjects } from './subjects.js';

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { cors } from 'hono/cors';
import { db, type UserRecord, type AuthCodeData, type PasswordResetToken } from './database.js';
import { initializeKeys, getPublicJWK, keyId } from './jwt-keys.js';
import { Resend } from 'resend';
import { mountStaticImageRoutes } from './routes/staticAssets.js';
import { mountTokenEndpoint } from './routes/tokenEndpoint.js';
import { mammothAuthPage } from './mammothAuthHtml.js';
import {
  THEME_ACCENT,
  THEME_ACCENT_ON,
  THEME_CARD_BG,
  THEME_PAGE_BG_EDGE,
  THEME_PAGE_BG_MID,
  THEME_TEXT_FAINT,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
} from '@the-mammoth/ui-theme';

const CLIENT_ID = process.env.OIDC_CLIENT_ID || 'the-mammoth-client';
const PASSWORD_RESET_EXPIRY_MINUTES = 15;

// Initialize Resend for email sending
const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

if (!resendApiKey) {
  console.warn('[Config] RESEND_API_KEY not set - password reset emails will be logged to console only');
} else {
  console.log('[Config] Resend email service configured');
}

/* -------------------------------------------------------------------------- */
/* Core Password Logic Handlers (Updated for database)                       */
/* -------------------------------------------------------------------------- */

async function _handlePasswordRegisterSimple(email: string, password?: string): Promise<{ id: string; email: string } | null> {
  email = email.toLowerCase();
  const existing = await db.getUserByEmail(email);
  if (existing) {
    console.warn(`[RegisterHandler] Email already taken: ${email}`);
    return null; 
  }
  if (!password) {
    console.error(`[RegisterHandler] Password missing for: ${email}`);
    return null;
  }
  const userId = uuidv4();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const newUser: UserRecord = { userId, email, passwordHash };
  const success = await db.createUser(newUser);
  if (!success) {
    console.warn(`[RegisterHandler] Failed to create user: ${email}`);
    return null;
  }
  console.info(`[RegisterHandler] New user registered: ${email} -> ${userId}`);
  return { id: userId, email };
}

async function _handlePasswordLoginSimple(email: string, password?: string): Promise<{ id: string; email: string } | null> {
  email = email.toLowerCase();
  const user = await db.getUserByEmail(email);
  if (!user || !password) {
    console.warn(`[LoginHandler] User not found or password missing for: ${email}`);
    return null;
  }
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    console.warn(`[LoginHandler] Incorrect password for: ${email}`);
    return null;
  }
  console.info(`[LoginHandler] User logged in: ${email} -> ${user.userId}`);
  return { id: user.userId, email };
}

async function _handlePasswordChangeSimple(userId: string, newPassword?: string): Promise<boolean> {
  if (!newPassword) return false;
  const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const success = await db.updateUserPassword(userId, newPasswordHash);
  if (success) {
    console.info(`[ChangeHandler] Password changed for userId: ${userId}`);
  }
  return success;
}

// Placeholder sendCode function
async function handlePasswordSendCode(email: string, code: string): Promise<void> { 
  console.info(`[SendCodeHandler] Code for ${email}: ${code} (Manual Flow)`);
}

/* -------------------------------------------------------------------------- */
/* Provider Handler Wrappers (Match expected signatures)                      */
/* -------------------------------------------------------------------------- */

async function handlePasswordRegister(ctx: any, state: any, form?: FormData): Promise<Response> {
    const email = form?.get('email') as string | undefined;
    const password = form?.get('password') as string | undefined;
    if (!email || !password) {
        return ctx.fail ? ctx.fail({ error: 'invalid_request' }) : new Response('Missing email or password', { status: 400 });
    }
    const result = await _handlePasswordRegisterSimple(email, password);
    if (!result) {
        return ctx.fail ? ctx.fail({ error: 'registration_failed' }) : new Response('Registration failed', { status: 400 });
    }
    return ctx.success ? ctx.success({ user: result }) : new Response(JSON.stringify(result), { status: 200 });
}

async function handlePasswordLogin(ctx: any, form?: FormData): Promise<Response> {
    const email = form?.get('email') as string | undefined;
    const password = form?.get('password') as string | undefined;
     if (!email || !password) {
        return ctx.fail ? ctx.fail({ error: 'invalid_request' }) : new Response('Missing email or password', { status: 400 });
    }
    const result = await _handlePasswordLoginSimple(email, password);
    if (!result) {
        return ctx.fail ? ctx.fail({ error: 'invalid_credentials' }) : new Response('Login failed', { status: 401 });
    }
    return ctx.success ? ctx.success({ user: result }) : new Response(JSON.stringify(result), { status: 200 });
}

async function handlePasswordChange(ctx: any, state: any, form?: FormData): Promise<Response> {
    const userId = state?.userId;
    const newPassword = form?.get('password') as string | undefined;
    if (!userId || !newPassword) {
       return ctx.fail ? ctx.fail({ error: 'invalid_request' }) : new Response('Missing user context or new password', { status: 400 });
    }
    const success = await _handlePasswordChangeSimple(userId, newPassword);
    if (!success) {
        return ctx.fail ? ctx.fail({ error: 'change_failed' }) : new Response('Password change failed', { status: 400 });
    }
    return ctx.success ? ctx.success({}) : new Response('Password changed', { status: 200 }); 
}

/* -------------------------------------------------------------------------- */
/* Provider Setup                                                             */
/* -------------------------------------------------------------------------- */
const password = PasswordProvider({
  register: handlePasswordRegister,
  login: handlePasswordLogin,
  change: handlePasswordChange,
  sendCode: handlePasswordSendCode,
});

/* -------------------------------------------------------------------------- */
/* Success callback                                                           */
/* -------------------------------------------------------------------------- */
async function success(ctx: any, value: any): Promise<Response> { 
  console.log("[IssuerSuccess] Flow completed. Provider:", value?.provider, "Value:", value);
  if (ctx && ctx.res) {
      return ctx.res;
  }
  return new Response('Issuer Success OK', { status: 200 });
}

/* -------------------------------------------------------------------------- */
/* Helper Functions for Password Reset Pages                                   */
/* -------------------------------------------------------------------------- */
function renderForgotPasswordPage(opts: { error?: string; success?: string } = {}): string {
  const { error, success } = opts;
  const main = success
    ? `
          <h1 class="form-title">Forgot Password</h1>
          <div class="success-message">${success}</div>
          `
    : `
          <h1 class="form-title">Forgot Password</h1>
          <p class="form-description">Enter your email address and we'll send you a link to reset your password.</p>
          ${error ? `<div class="error-message">${error}</div>` : ""}
          <form method="post">
              <div class="form-group">
                  <label for="email">Email Address</label>
                  <input id="email" name="email" type="email" autocomplete="email" required placeholder="Enter your email">
              </div>
              <button type="submit" class="submit-button">Send Reset Link</button>
          </form>
          `;
  const footer = `
          <div class="divider"></div>
          <p class="form-link">Remember your password? <a href="/auth/password/login">Sign In</a></p>`;
  return mammothAuthPage("Forgot Password - The Mammoth", main + footer);
}

function renderResetPasswordPage(opts: { token?: string; email?: string; error?: string } = {}): string {
  const { token, email, error } = opts;
  const showForm =
    Boolean(token) &&
    !error?.includes("Invalid") &&
    !error?.includes("expired") &&
    !error?.includes("already been used");

  const formBlock =
    showForm && token
      ? `
          <p class="form-description">Enter a new password for <strong>${email ?? ""}</strong></p>
          <form method="post">
              <input type="hidden" name="token" value="${token}">
              <div class="form-group">
                  <label for="password">New Password</label>
                  <input id="password" name="password" type="password" autocomplete="new-password" required placeholder="Enter new password" minlength="6">
              </div>
              <div class="form-group">
                  <label for="confirm_password">Confirm Password</label>
                  <input id="confirm_password" name="confirm_password" type="password" autocomplete="new-password" required placeholder="Confirm new password" minlength="6">
              </div>
              <button type="submit" class="submit-button">Reset Password</button>
          </form>
          `
      : "";

  const inner = `
    <h1 class="form-title">Reset Password</h1>
    ${error ? `<div class="error-message">${error}</div>` : ""}
    ${formBlock}
    <div class="divider"></div>
    <p class="form-link"><a href="/auth/password/forgot">Request New Reset Link</a> · <a href="/auth/password/login">Sign In</a></p>`;

  return mammothAuthPage("Reset Password - The Mammoth", inner);
}

/* -------------------------------------------------------------------------- */
/* Server                                                                     */
/* -------------------------------------------------------------------------- */
export async function startAuthServer(): Promise<void> {
  // Initialize database and keys
  await db.init();
  await initializeKeys();

  const storage = MemoryStorage();
  const auth = issuer({ 
    providers: { password }, 
    subjects, 
    storage, 
    success,
  });
  const app  = new Hono();

  // CORS first so every route (including /token) gets consistent headers.
  app.use('*', cors({
    origin: (origin) => resolveCorsOrigin(origin),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    // Client token exchange uses fetch() without credentials; false avoids reflect-origin strictness with credentialed cookies.
    credentials: false,
  }));

  mountStaticImageRoutes(app);

  // --- Server-rendered document page with full SEO/OG meta ---
  app.get('/document', (c) => {
    const baseUrl = ISSUER_URL;
    const ogImage = `${baseUrl}/og-social.png`;
    return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/png" href="/favicon.png" />
  <title>The Mammoth</title>
  <meta name="description" content="The Mammoth — multiplayer survival in a frozen megastructure." />
  <meta name="keywords" content="The Mammoth, multiplayer, survival game, 3D" />
  <meta name="author" content="The Mammoth" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${baseUrl}/document" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="The Mammoth" />
  <meta property="og:description" content="Multiplayer survival in a frozen megastructure." />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:url" content="${baseUrl}/document" />
  <meta property="og:site_name" content="The Mammoth" />
  <meta property="og:locale" content="en_US" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="The Mammoth" />
  <meta name="twitter:description" content="Multiplayer survival in a frozen megastructure." />
  <meta name="twitter:image" content="${ogImage}" />
  <meta name="twitter:image:alt" content="The Mammoth" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      text-align: center;
      color: ${THEME_TEXT_PRIMARY};
      background: radial-gradient(ellipse at center, ${THEME_PAGE_BG_MID} 0%, ${THEME_PAGE_BG_EDGE} 72%);
    }
    h1 { font-size: 2rem; margin-bottom: 1rem; color: ${THEME_ACCENT}; letter-spacing: 0.02em; }
    p { max-width: 500px; line-height: 1.6; margin-bottom: 1.5rem; color: ${THEME_TEXT_MUTED}; }
    a {
      color: ${THEME_ACCENT_ON};
      background: ${THEME_ACCENT};
      text-decoration: none;
      font-weight: 600;
      padding: 0.55rem 1.25rem;
      border-radius: 8px;
      display: inline-block;
      margin-top: 0.5rem;
    }
    a:hover { filter: brightness(1.08); }
  </style>
</head>
<body>
  <h1>The Mammoth</h1>
  <p>Multiplayer survival in a frozen megastructure.</p>
  <a href="https://github.com/the-mammoth/the-mammoth">GitHub</a>
</body>
</html>
    `);
  });

  // --- OIDC Discovery Endpoint --- 
  app.get('/.well-known/openid-configuration', (c) => {
      console.log('[OIDC Discovery] Serving configuration');
      return c.json({
          issuer: ISSUER_URL,
          authorization_endpoint: `${ISSUER_URL}/authorize`,
          token_endpoint: `${ISSUER_URL}/token`,
          jwks_uri: `${ISSUER_URL}/.well-known/jwks.json`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
      });
  });

  // --- JWKS Endpoint --- 
  app.get('/.well-known/jwks.json', (c) => {
      console.log('[JWKS] Serving JWKS endpoint');
      const publicJWK = getPublicJWK();
      return c.json({ 
          keys: [
              {
                  ...publicJWK,
                  kid: keyId,
                  use: 'sig',
                  alg: 'RS256'
              }
          ]
      });
  });

  // --- Custom Authorize Interceptor --- 
  app.get('/authorize', async (c, next) => {
      const query = c.req.query();
      const acrValues = query['acr_values'];

      if (acrValues === 'pwd') {
          console.log('[AuthServer] Intercepting /authorize for password flow (acr_values=pwd). Redirecting to /auth/password/login');
          
          const loginUrl = new URL('/auth/password/login', ISSUER_URL); 
          Object.keys(query).forEach(key => {
              loginUrl.searchParams.set(key, query[key]);
          });
          
          return c.redirect(loginUrl.toString(), 302);
      } else {
          console.log('[AuthServer] /authorize request is not for password flow (acr_values != \'pwd\') or acr_values missing. Passing to issuer.');
          await next(); 
          if (!c.res.bodyUsed) {
              console.warn('[AuthServer] /authorize interceptor: next() called but no response generated. Potential issue with issuer routing.');
          }
      }
  });

  // --- Manual Password Routes --- 
  app.get('/auth/password/register', (c) => {
    const query = c.req.query();
    const queryString = Object.entries(query)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
    
    const redirect_uri = query['redirect_uri'] || '';
    const state = query['state'] || '';
    const code_challenge = query['code_challenge'] || '';
    const code_challenge_method = query['code_challenge_method'] || 'S256';
    const client_id = query['client_id'] || CLIENT_ID; 

    return c.html(
      mammothAuthPage(
        "Create Account - The Mammoth",
        `
            <h1 class="form-title">Create Account</h1>
            <form method="post">
                <input type="hidden" name="redirect_uri" value="${encodeURIComponent(redirect_uri)}">
                <input type="hidden" name="state" value="${state || ""}">
                <input type="hidden" name="code_challenge" value="${code_challenge}">
                <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">
                <input type="hidden" name="client_id" value="${client_id}">
                <div class="form-group">
                    <label for="email">Email Address</label>
                    <input id="email" name="email" type="email" autocomplete="email" required placeholder="Enter your email">
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input id="password" name="password" type="password" autocomplete="new-password" required placeholder="Create a password">
                </div>
                <button type="submit" class="submit-button">Create Account</button>
            </form>
            <div class="divider"></div>
            <p class="form-link">Already have an account? <a href="/auth/password/login?${queryString}">Sign In</a></p>
        `,
      ),
    );
  });

  app.post('/auth/password/register', async (c) => {
    const form = await c.req.formData();
    const email = form.get('email') as string | undefined;
    const password = form.get('password') as string | undefined;
    const redirect_uri_from_form = form.get('redirect_uri') as string | undefined;
    const state = form.get('state') as string | undefined;
    const code_challenge = form.get('code_challenge') as string | undefined;
    const code_challenge_method = form.get('code_challenge_method') as string | undefined;
    const client_id = form.get('client_id') as string | undefined;

    if (!email || !password || !redirect_uri_from_form || !code_challenge || !code_challenge_method || !client_id) {
         console.error('[AuthServer] POST Register: Missing form data.');
         return c.text('Missing required form fields.', 400);
    }

    const userResult = await _handlePasswordRegisterSimple(email, password);

    if (userResult) {
        const userId = userResult.id;
        const code = uuidv4();
        let redirect_uri: string;
        try {
            const decoded_once = decodeURIComponent(redirect_uri_from_form);
            redirect_uri = decodeURIComponent(decoded_once);
            console.log(`[AuthServer] POST Register: Decoded redirect_uri: ${redirect_uri}`);
        } catch (e) {
            console.error('[AuthServer] POST Register: Failed to double-decode redirect_uri:', redirect_uri_from_form, e);
            return c.text('Invalid redirect URI encoding.', 400);
        }
        await db.storeAuthCode(code, { userId, codeChallenge: code_challenge, codeChallengeMethod: code_challenge_method, clientId: client_id, redirectUri: redirect_uri });
        try {
            const redirect = new URL(redirect_uri);
            redirect.searchParams.set('code', code);
            if (state) redirect.searchParams.set('state', state);
            console.log(`[AuthServer] POST Register Success: Redirecting to ${redirect.toString()}`);
            return c.redirect(redirect.toString(), 302);
        } catch (e) {
            console.error('[AuthServer] POST Register: Failed to construct redirect URL with double-decoded URI:', redirect_uri, e);
            return c.text('Invalid redirect URI provided.', 500);
        }
    } else {
        console.warn(`[AuthServer] POST Register Failed for email: ${email} (Email likely taken)`);
        return c.html(
          mammothAuthPage(
            "Create Account - The Mammoth",
            `
            <h1 class="form-title">Create Account</h1>
            <div class="error-message">Registration failed. That email might already be taken.</div>
            <form method="post">
                <input type="hidden" name="redirect_uri" value="${redirect_uri_from_form}">
                <input type="hidden" name="state" value="${state || ""}">
                <input type="hidden" name="code_challenge" value="${code_challenge}">
                <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">
                <input type="hidden" name="client_id" value="${client_id}">
                <div class="form-group">
                    <label for="email">Email Address</label>
                    <input id="email" name="email" type="email" value="${email || ""}" autocomplete="email" required placeholder="Enter your email">
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input id="password" name="password" type="password" autocomplete="new-password" required placeholder="Create a password">
                </div>
                <button type="submit" class="submit-button">Create Account</button>
            </form>
            `,
          ),
        );
    }
  });

  app.get('/auth/password/login', (c) => {
    const query = c.req.query();
    const queryString = Object.entries(query)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
    
    const redirect_uri = query['redirect_uri'] || '';
    const state = query['state'] || '';
    const code_challenge = query['code_challenge'] || '';
    const code_challenge_method = query['code_challenge_method'] || 'S256';
    const client_id = query['client_id'] || CLIENT_ID; 

    return c.html(
      mammothAuthPage(
        "Sign In - The Mammoth",
        `
            <h1 class="form-title">Sign In</h1>
            <form method="post">
                <input type="hidden" name="redirect_uri" value="${encodeURIComponent(redirect_uri)}">
                <input type="hidden" name="state" value="${state || ""}">
                <input type="hidden" name="code_challenge" value="${code_challenge}">
                <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">
                <input type="hidden" name="client_id" value="${client_id}">
                <div class="form-group">
                    <label for="email">Email Address</label>
                    <input id="email" name="email" type="email" autocomplete="email" required placeholder="Enter your email">
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Enter your password">
                </div>
                <button type="submit" class="submit-button">Sign In</button>
                <p class="form-link" style="margin-top: -8px; margin-bottom: 0;"><a href="/auth/password/forgot">Forgot password?</a></p>
            </form>
            <div class="divider"></div>
            <p class="form-link">Need an account? <a href="/auth/password/register?${queryString}">Create account</a></p>
        `,
      ),
    );
  });

  app.post('/auth/password/login', async (c) => {
      const form = await c.req.formData();
      const email = form.get('email') as string | undefined;
      const password = form.get('password') as string | undefined;
      const redirect_uri_from_form = form.get('redirect_uri') as string | undefined;
      const state = form.get('state') as string | undefined;
      const code_challenge = form.get('code_challenge') as string | undefined;
      const code_challenge_method = form.get('code_challenge_method') as string | undefined;
      const client_id = form.get('client_id') as string | undefined;

      if (!email || !password || !redirect_uri_from_form || !code_challenge || !code_challenge_method || !client_id) {
           console.error('[AuthServer] POST Login: Missing form data.');
           return c.text('Missing required form fields.', 400);
      }

      const userResult = await _handlePasswordLoginSimple(email, password);

      if (userResult) {
          const userId = userResult.id;
          const code = uuidv4();
          let redirect_uri: string;
          try {
              const decoded_once = decodeURIComponent(redirect_uri_from_form);
              redirect_uri = decodeURIComponent(decoded_once);
              console.log(`[AuthServer] POST Login: Decoded redirect_uri: ${redirect_uri}`);
          } catch (e) {
              console.error('[AuthServer] POST Login: Failed to double-decode redirect_uri:', redirect_uri_from_form, e);
              return c.text('Invalid redirect URI encoding.', 400);
          }
          await db.storeAuthCode(code, { userId, codeChallenge: code_challenge, codeChallengeMethod: code_challenge_method, clientId: client_id, redirectUri: redirect_uri });
          try {
              const redirect = new URL(redirect_uri);
              redirect.searchParams.set('code', code);
              if (state) redirect.searchParams.set('state', state);
              console.log(`[AuthServer] POST Login Success: Redirecting to ${redirect.toString()}`);
              return c.redirect(redirect.toString(), 302);
          } catch (e) {
              console.error('[AuthServer] POST Login: Failed to construct redirect URL with double-decoded URI:', redirect_uri, e);
              return c.text('Invalid redirect URI provided.', 500);
          }
      } else {
          console.warn(`[AuthServer] POST Login Failed for email: ${email}`);
          const query = { redirect_uri: redirect_uri_from_form, state, code_challenge, code_challenge_method, client_id };
          const queryString = Object.entries(query)
              .filter(([_, value]) => value != null)
              .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`)
              .join('&');
              
          return c.html(
            mammothAuthPage(
              "Sign In - The Mammoth",
              `
                    <h1 class="form-title">Sign In</h1>
                    <div class="error-message">Invalid email or password. Please try again.</div>
                    <form method="post">
                        <input type="hidden" name="redirect_uri" value="${redirect_uri_from_form}">
                        <input type="hidden" name="state" value="${state || ""}">
                        <input type="hidden" name="code_challenge" value="${code_challenge}">
                        <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">
                        <input type="hidden" name="client_id" value="${client_id}">
                        <div class="form-group">
                            <label for="email">Email Address</label>
                            <input id="email" name="email" type="email" value="${email || ""}" autocomplete="email" required placeholder="Enter your email">
                        </div>
                        <div class="form-group">
                            <label for="password">Password</label>
                            <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Enter your password">
                        </div>
                        <button type="submit" class="submit-button">Sign In</button>
                        <p class="form-link" style="margin-top: -8px; margin-bottom: 0;"><a href="/auth/password/forgot">Forgot password?</a></p>
                    </form>
                    <div class="divider"></div>
                    <p class="form-link">Need an account? <a href="/auth/password/register?${queryString}">Create account</a></p>
              `,
            ),
          );
      }
  });

  // --- Forgot Password Flow ---
  app.get("/auth/password/forgot", (c) => {
    return c.html(renderForgotPasswordPage());
  });

  app.post('/auth/password/forgot', async (c) => {
    const form = await c.req.formData();
    const email = (form.get('email') as string)?.toLowerCase()?.trim();

    if (!email) {
      return c.html(renderForgotPasswordPage({ error: 'Please enter your email address.' }));
    }

    // Check if user exists
    const user = await db.getUserByEmail(email);
    
    // Always show success message to prevent email enumeration attacks
    const successHtml = renderForgotPasswordPage({ 
      success: 'If an account with that email exists, we\'ve sent a password reset link. Please check your inbox and spam folder.' 
    });

    if (!user) {
      console.log(`[ForgotPassword] No user found for email: ${email}`);
      return c.html(successHtml);
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);

    // Store token
    await db.storePasswordResetToken(token, user.userId, email, expiresAt);

    // Build reset link
    const resetLink = `${ISSUER_URL}/auth/password/reset?token=${token}`;

    // Send email
    if (resend) {
      try {
        await resend.emails.send({
          from: 'The Mammoth <noreply@themammoth.com>',
          to: email,
          subject: 'Reset your The Mammoth password',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: system-ui, -apple-system, sans-serif; background: radial-gradient(ellipse at center, ${THEME_PAGE_BG_MID} 0%, ${THEME_PAGE_BG_EDGE} 72%); color: ${THEME_TEXT_PRIMARY}; padding: 40px 20px; margin: 0;">
              <div style="max-width: 500px; margin: 0 auto; background: ${THEME_CARD_BG}; border-radius: 14px; padding: 36px 28px; border: 1px solid rgba(255,255,255,0.1);">
                <h1 style="color: ${THEME_ACCENT}; margin-bottom: 18px; font-size: 22px;">Reset your password</h1>
                <p style="color: ${THEME_TEXT_MUTED}; line-height: 1.6; margin-bottom: 26px;">
                  You requested a password reset for your The Mammoth account. Use the button below to choose a new password.
                </p>
                <a href="${resetLink}" style="display: inline-block; background: ${THEME_ACCENT}; color: ${THEME_ACCENT_ON}; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                  Reset password
                </a>
                <p style="color: ${THEME_TEXT_MUTED}; font-size: 13px; margin-top: 28px; line-height: 1.5;">
                  This link will expire in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes.<br><br>
                  If you didn't request this reset, you can safely ignore this email.
                </p>
                <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 28px 0;">
                <p style="color: ${THEME_TEXT_FAINT}; font-size: 12px;">
                  The Mammoth
                </p>
              </div>
            </body>
            </html>
          `
        });
        console.log(`[ForgotPassword] Reset email sent to: ${email}`);
      } catch (err) {
        console.error('[ForgotPassword] Failed to send email:', err);
        // Still show success to user to prevent enumeration
      }
    } else {
      // Development: Log the reset link to console
      console.log(`[ForgotPassword] DEV MODE - Reset link for ${email}: ${resetLink}`);
    }

    return c.html(successHtml);
  });

  app.get('/auth/password/reset', async (c) => {
    const token = c.req.query('token');

    if (!token) {
      return c.html(renderResetPasswordPage({ error: 'Invalid or missing reset token.' }));
    }

    // Validate token
    const resetToken = await db.getPasswordResetToken(token);
    
    if (!resetToken) {
      return c.html(renderResetPasswordPage({ error: 'Invalid reset link. Please request a new one.' }));
    }

    if (resetToken.used) {
      return c.html(renderResetPasswordPage({ error: 'This reset link has already been used. Please request a new one.' }));
    }

    if (new Date() > resetToken.expiresAt) {
      return c.html(renderResetPasswordPage({ error: 'This reset link has expired. Please request a new one.' }));
    }

    return c.html(renderResetPasswordPage({ token, email: resetToken.email }));
  });

  app.post('/auth/password/reset', async (c) => {
    const form = await c.req.formData();
    const token = form.get('token') as string;
    const password = form.get('password') as string;
    const confirmPassword = form.get('confirm_password') as string;

    if (!token) {
      return c.html(renderResetPasswordPage({ error: 'Invalid reset token.' }));
    }

    // Validate token
    const resetToken = await db.getPasswordResetToken(token);
    
    if (!resetToken || resetToken.used || new Date() > resetToken.expiresAt) {
      return c.html(renderResetPasswordPage({ error: 'Invalid or expired reset link. Please request a new one.' }));
    }

    // Validate password
    if (!password || password.length < 6) {
      return c.html(renderResetPasswordPage({ 
        token, 
        email: resetToken.email, 
        error: 'Password must be at least 6 characters long.' 
      }));
    }

    if (password !== confirmPassword) {
      return c.html(renderResetPasswordPage({ 
        token, 
        email: resetToken.email, 
        error: 'Passwords do not match.' 
      }));
    }

    // Update password
    const newPasswordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const updated = await db.updateUserPassword(resetToken.userId, newPasswordHash);

    if (!updated) {
      return c.html(renderResetPasswordPage({ 
        token, 
        email: resetToken.email, 
        error: 'Failed to update password. Please try again.' 
      }));
    }

    // Mark token as used
    await db.markPasswordResetTokenUsed(token);

    console.log(`[ResetPassword] Password successfully reset for user: ${resetToken.userId}`);

    return c.html(
      mammothAuthPage(
        "Password updated - The Mammoth",
        `
            <div class="success-icon">✓</div>
            <h1 class="form-title success-title">Password updated</h1>
            <p class="form-description">Your password was saved. You can sign in with your new password.</p>
            <a href="/auth/password/login" class="submit-button">Sign in</a>
        `,
      ),
    );
  });

  mountTokenEndpoint(app);

  // Mount the OpenAuth issuer routes
  app.route('/', auth);
  app.get('/health', c => c.text('OK'));

  console.log(`🚀 Auth server → ${ISSUER_URL}`);
  serve({ fetch: app.fetch, port: PORT });
}