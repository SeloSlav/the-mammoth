// index.ts - Updated for production deployment
/**
 * OpenAuth issuer + Hono server with password UI and custom OIDC code/token flow.
 * Now using database storage and environment-based JWT keys.
 */
import dotenv from 'dotenv';

// Load environment variables from .env file in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/** Dynamic lookup so container builders (e.g. Railpack) do not treat this as a required build secret. */
function runtimeEnv(name: string): string | undefined {
  return process.env[name];
}

/** OIDC issuer and OG base must be absolute URLs with a scheme (host-only breaks crawlers). */
function normalizeHttpOrigin(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

// Environment-based configuration
const config = {
  isDevelopment: process.env.NODE_ENV !== 'production',
  port: parseInt(process.env.PORT || '4001'),
  issuerUrl: normalizeHttpOrigin(
    process.env.ISSUER_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://the-mammoth-production.up.railway.app'
        : 'http://localhost:4001'),
  ),
  databaseUrl: process.env.DATABASE_URL,
  jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
  jwtPublicKey: process.env.JWT_PUBLIC_KEY,
  saltRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
  corsAllowedOrigins: (runtimeEnv('CORS_ALLOWED_ORIGINS') || '')
    .split(',')
    .map(origin => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
};

const defaultCorsAllowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5176',
  'http://127.0.0.1:5176',
  'https://the-mammoth-production.up.railway.app',
  'https://themammoth.com',
];
/** In dev, union env origins with defaults so a prod-only CORS_ALLOWED_ORIGINS does not break local Vite. */
const corsAllowedOrigins = config.isDevelopment
  ? [...new Set([...defaultCorsAllowedOrigins, ...config.corsAllowedOrigins])]
  : config.corsAllowedOrigins.length > 0
    ? config.corsAllowedOrigins
    : defaultCorsAllowedOrigins;

const devLocalOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function resolveCorsOrigin(originHeader: string): string | null {
  if (corsAllowedOrigins.includes(originHeader)) return originHeader;
  if (config.isDevelopment && devLocalOriginPattern.test(originHeader)) return originHeader;
  return null;
}

console.log(`[Config] Environment: ${config.isDevelopment ? 'development' : 'production'}`);
console.log(`[Config] Port: ${config.port}`);
console.log(`[Config] Issuer URL: ${config.issuerUrl}`);
console.log(`[Config] Database: ${config.databaseUrl ? 'PostgreSQL' : 'In-memory'}`);
console.log(`[Config] CORS allowed origins: ${corsAllowedOrigins.join(', ')}`);

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
import jwt from 'jsonwebtoken';
import { Buffer } from 'buffer'; // Needed for PKCE base64
import crypto from 'crypto'; // Needed for PKCE hash
import { cors } from 'hono/cors';
import fs from 'fs';
import path from 'path';
// Import our new modules
import { db, type UserRecord, type AuthCodeData, type PasswordResetToken } from './database.js';
import { initializeKeys, getPrivateKey, getPublicJWK, keyId } from './jwt-keys.js';
import { Resend } from 'resend';

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */
const PORT        = config.port;
const ISSUER_URL  = config.issuerUrl;
const SALT_ROUNDS = config.saltRounds;
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
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="icon" type="image/png" href="/favicon.png">
      <title>Forgot Password - The Mammoth</title>
      <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
              min-height: 100vh;
              background-image: url('/login_background.png');
              background-size: cover;
              background-position: top center;
              background-repeat: no-repeat;
              font-family: system-ui, -apple-system, sans-serif;
              color: white;
              display: flex;
              justify-content: center;
              align-items: center;
          }
          .container {
              background: rgba(0, 0, 0, 0.75);
              backdrop-filter: blur(12px);
              border: 2px solid rgba(255, 255, 255, 0.3);
              border-radius: 16px;
              padding: 60px 40px;
              width: 90%;
              max-width: 450px;
              text-align: center;
          }
          .game-title { height: 90px; margin-bottom: 20px; }
          .game-subtitle {
              font-size: 14px;
              color: rgba(255, 255, 255, 0.8);
              margin-bottom: 40px;
              letter-spacing: 2px;
              text-transform: uppercase;
          }
          .form-title { font-size: 24px; font-weight: 600; margin-bottom: 15px; }
          .form-description {
              font-size: 14px;
              color: rgba(255, 255, 255, 0.7);
              margin-bottom: 30px;
              line-height: 1.5;
          }
          .form-group { margin-bottom: 25px; text-align: left; }
          label {
              display: block;
              margin-bottom: 8px;
              font-size: 13px;
              color: rgba(255, 255, 255, 0.9);
              font-weight: 500;
          }
          input[type="email"] {
              width: 100%;
              padding: 16px 20px;
              background: rgba(255, 255, 255, 0.1);
              border: 2px solid rgba(255, 255, 255, 0.3);
              border-radius: 12px;
              color: white;
              font-size: 16px;
          }
          input[type="email"]:focus {
              outline: none;
              border-color: #ff8c00;
              background: rgba(255, 255, 255, 0.15);
          }
          input[type="email"]::placeholder { color: rgba(255, 255, 255, 0.5); }
          .submit-button {
              width: 100%;
              padding: 18px 20px;
              background: linear-gradient(135deg, #ff8c00 0%, #e67700 100%);
              border: none;
              border-radius: 12px;
              color: white;
              font-size: 16px;
              font-weight: 600;
              cursor: pointer;
              margin-bottom: 30px;
              text-transform: uppercase;
              letter-spacing: 1px;
          }
          .submit-button:hover {
              background: linear-gradient(135deg, #ffaa33 0%, #ff8c00 100%);
          }
          .divider {
              height: 1px;
              background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%);
              margin: 30px 0;
          }
          .form-link {
              font-size: 14px;
              color: rgba(255, 255, 255, 0.8);
          }
          .form-link a {
              color: #ff8c00;
              text-decoration: none;
              font-weight: 500;
          }
          .form-link a:hover { color: #ffaa33; text-decoration: underline; }
          .error-message {
              background: rgba(220, 53, 69, 0.15);
              border: 1px solid rgba(220, 53, 69, 0.4);
              border-radius: 8px;
              padding: 12px;
              margin-bottom: 20px;
              font-size: 14px;
              color: #ff6b6b;
          }
          .success-message {
              background: rgba(40, 167, 69, 0.15);
              border: 1px solid rgba(40, 167, 69, 0.4);
              border-radius: 8px;
              padding: 12px;
              margin-bottom: 20px;
              font-size: 14px;
              color: #5cb85c;
              line-height: 1.5;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="game-title">
              <img src="/logo_alt.png" alt="The Mammoth Logo" style="height: 100%; width: auto;">
          </div>
          <h1 class="form-title">Forgot Password</h1>
          ${success ? `<div class="success-message">${success}</div>` : `
          <p class="form-description">Enter your email address and we'll send you a link to reset your password.</p>
          ${error ? `<div class="error-message">${error}</div>` : ''}
          <form method="post">
              <div class="form-group">
                  <label for="email">Email Address</label>
                  <input id="email" name="email" type="email" autocomplete="email" required placeholder="Enter your email">
              </div>
              <button type="submit" class="submit-button">Send Reset Link</button>
          </form>
          `}
          <div class="divider"></div>
          <p class="form-link">Remember your password? <a href="/auth/password/login">Sign In</a></p>
      </div>
  </body>
  </html>
  `;
}

function renderResetPasswordPage(opts: { token?: string; email?: string; error?: string } = {}): string {
  const { token, email, error } = opts;
  const showForm = token && !error?.includes('Invalid') && !error?.includes('expired') && !error?.includes('already been used');
  
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="icon" type="image/png" href="/favicon.png">
      <title>Reset Password - The Mammoth</title>
      <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
              min-height: 100vh;
              background-image: url('/login_background.png');
              background-size: cover;
              background-position: top center;
              font-family: system-ui, -apple-system, sans-serif;
              color: white;
              display: flex;
              justify-content: center;
              align-items: center;
          }
          .container {
              background: rgba(0, 0, 0, 0.75);
              backdrop-filter: blur(12px);
              border: 2px solid rgba(255, 255, 255, 0.3);
              border-radius: 16px;
              padding: 60px 40px;
              width: 90%;
              max-width: 450px;
              text-align: center;
          }
          .game-title { height: 90px; margin-bottom: 20px; }
          .game-subtitle {
              font-size: 14px;
              color: rgba(255, 255, 255, 0.8);
              margin-bottom: 40px;
              letter-spacing: 2px;
              text-transform: uppercase;
          }
          .form-title { font-size: 24px; font-weight: 600; margin-bottom: 15px; }
          .form-description {
              font-size: 14px;
              color: rgba(255, 255, 255, 0.7);
              margin-bottom: 30px;
              line-height: 1.5;
          }
          .form-group { margin-bottom: 25px; text-align: left; }
          label {
              display: block;
              margin-bottom: 8px;
              font-size: 13px;
              color: rgba(255, 255, 255, 0.9);
              font-weight: 500;
          }
          input[type="password"], input[type="email"] {
              width: 100%;
              padding: 16px 20px;
              background: rgba(255, 255, 255, 0.1);
              border: 2px solid rgba(255, 255, 255, 0.3);
              border-radius: 12px;
              color: white;
              font-size: 16px;
          }
          input:focus {
              outline: none;
              border-color: #ff8c00;
              background: rgba(255, 255, 255, 0.15);
          }
          input::placeholder { color: rgba(255, 255, 255, 0.5); }
          input:disabled {
              background: rgba(255, 255, 255, 0.05);
              color: rgba(255, 255, 255, 0.5);
          }
          .submit-button {
              width: 100%;
              padding: 18px 20px;
              background: linear-gradient(135deg, #ff8c00 0%, #e67700 100%);
              border: none;
              border-radius: 12px;
              color: white;
              font-size: 16px;
              font-weight: 600;
              cursor: pointer;
              margin-bottom: 30px;
              text-transform: uppercase;
              letter-spacing: 1px;
          }
          .submit-button:hover {
              background: linear-gradient(135deg, #ffaa33 0%, #ff8c00 100%);
          }
          .divider {
              height: 1px;
              background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%);
              margin: 30px 0;
          }
          .form-link {
              font-size: 14px;
              color: rgba(255, 255, 255, 0.8);
          }
          .form-link a {
              color: #ff8c00;
              text-decoration: none;
              font-weight: 500;
          }
          .form-link a:hover { color: #ffaa33; text-decoration: underline; }
          .error-message {
              background: rgba(220, 53, 69, 0.15);
              border: 1px solid rgba(220, 53, 69, 0.4);
              border-radius: 8px;
              padding: 12px;
              margin-bottom: 20px;
              font-size: 14px;
              color: #ff6b6b;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="game-title">
              <img src="/logo_alt.png" alt="The Mammoth Logo" style="height: 100%; width: auto;">
          </div>
          <h1 class="form-title">Reset Password</h1>
          ${error ? `<div class="error-message">${error}</div>` : ''}
          ${showForm ? `
          <p class="form-description">Enter a new password for <strong>${email}</strong></p>
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
          ` : ''}
          <div class="divider"></div>
          <p class="form-link"><a href="/auth/password/forgot">Request New Reset Link</a> | <a href="/auth/password/login">Sign In</a></p>
      </div>
  </body>
  </html>
  `;
}

/* -------------------------------------------------------------------------- */
/* Server                                                                     */
/* -------------------------------------------------------------------------- */
(async () => {
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

  // --- Static File Serving for favicon ---
  app.get('/favicon.png', async (c) => {
    try {
      const imagePath = path.join(process.cwd(), 'favicon.png');
      const imageBuffer = fs.readFileSync(imagePath);
      c.header('Content-Type', 'image/png');
      c.header('Cache-Control', 'public, max-age=86400');
      return c.body(imageBuffer);
    } catch (error) {
      console.error('[Static] Failed to serve favicon.png:', error);
      return c.text('Not found', 404);
    }
  });

  app.get('/favicon.ico', async (c) => {
    try {
      const imagePath = path.join(process.cwd(), 'favicon.png');
      const imageBuffer = fs.readFileSync(imagePath);
      c.header('Content-Type', 'image/png');
      c.header('Cache-Control', 'public, max-age=86400');
      return c.body(imageBuffer);
    } catch (error) {
      return c.text('Not found', 404);
    }
  });

  app.get('/og-social.png', async (c) => {
    try {
      const imagePath = path.join(process.cwd(), 'og-social.png');
      const imageBuffer = fs.readFileSync(imagePath);
      c.header('Content-Type', 'image/png');
      c.header('Cache-Control', 'public, max-age=86400');
      return c.body(imageBuffer);
    } catch (error) {
      console.error('[Static] Failed to serve og-social.png:', error);
      return c.text('Not found', 404);
    }
  });

  // --- Static File Serving for logo_alt.png ---
  app.get('/logo_alt.png', async (c) => {
    try {
      const imagePath = path.join(process.cwd(), 'logo_alt.png');
      const imageBuffer = fs.readFileSync(imagePath);
      return new Response(new Uint8Array(imageBuffer), { headers: { 'Content-Type': 'image/png' } });
    } catch (error) {
      console.error('[Static] Failed to serve logo_alt.png:', error);
      return new Response('Image not found', { status: 404 });
    }
  });

  app.get('/auth/password/logo_alt.png', async (c) => {
    try {
      const imagePath = path.join(process.cwd(), 'logo_alt.png');
      const imageBuffer = fs.readFileSync(imagePath);
      return new Response(new Uint8Array(imageBuffer), { headers: { 'Content-Type': 'image/png' } });
    } catch (error) {
      console.error('[Static] Failed to serve logo_alt.png:', error);
      return new Response('Image not found', { status: 404 });
    }
  });

  // --- Static File Serving for login_background.png ---
  app.get('/login_background.png', async (c) => {
    try {
      const imagePath = path.join(process.cwd(), 'login_background.png');
      const imageBuffer = fs.readFileSync(imagePath);
      c.header('Content-Type', 'image/png');
      c.header('Cache-Control', 'public, max-age=3600');
      return c.body(imageBuffer);
    } catch (error) {
      console.error('[Static] Failed to serve login_background.png:', error);
      return c.text('Image not found', 404);
    }
  });

  // --- Also serve at the wrong path to fix current issue ---
  app.get('/auth/password/login_background.png', async (c) => {
    try {
      const imagePath = path.join(process.cwd(), 'login_background.png');
      const imageBuffer = fs.readFileSync(imagePath);
      c.header('Content-Type', 'image/png');
      c.header('Cache-Control', 'public, max-age=3600');
      return c.body(imageBuffer);
    } catch (error) {
      console.error('[Static] Failed to serve login_background.png:', error);
      return c.text('Image not found', 404);
    }
  });

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
  <title>The Mammoth - 3D Balkan Farming Game</title>
  <meta name="description" content="The Mammoth is a 3D multiplayer farming game built with Three.js and SpacetimeDB. Like Farmville meets Balkan village life. Till your land, plant crops, and build your homestead in a shared persistent world." />
  <meta name="keywords" content="The Mammoth, farming game, Balkan, multiplayer, 3D, Three.js, SpacetimeDB, village simulation, Farmville" />
  <meta name="author" content="The Mammoth" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${baseUrl}/document" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="The Mammoth - 3D Balkan Farming Game" />
  <meta property="og:description" content="A 3D multiplayer farming game. Like Farmville meets Balkan village life. Till your land, plant crops, and build your homestead in a shared persistent world." />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:url" content="${baseUrl}/document" />
  <meta property="og:site_name" content="The Mammoth" />
  <meta property="og:locale" content="en_US" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="The Mammoth - 3D Balkan Farming Game" />
  <meta name="twitter:description" content="A 3D multiplayer farming game. Like Farmville meets Balkan village life." />
  <meta name="twitter:image" content="${ogImage}" />
  <meta name="twitter:image:alt" content="The Mammoth - 3D Balkan farming game logo" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #1a1a2e; color: #fff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; text-align: center; }
    h1 { font-size: 2rem; margin-bottom: 1rem; color: #ff8c00; }
    p { max-width: 500px; line-height: 1.6; margin-bottom: 1.5rem; color: rgba(255,255,255,0.9); }
    a { color: #ff8c00; text-decoration: none; font-weight: 600; padding: 0.5rem 1rem; border: 2px solid #ff8c00; border-radius: 8px; display: inline-block; margin-top: 1rem; }
    a:hover { background: rgba(255,140,0,0.2); }
  </style>
</head>
<body>
  <h1>The Mammoth</h1>
  <p>A 3D multiplayer farming game built with Three.js and SpacetimeDB. Like Farmville meets Balkan village life.</p>
  <p>Till your land, plant crops, and build your homestead in a shared persistent world.</p>
  <a href="https://github.com/SeloSlav/selo-empire">GitHub</a>
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

    return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="icon" type="image/png" href="/favicon.png">
        <title>Create Account - The Mammoth</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                min-height: 100vh;
                width: 100%;
                background-image: url('login_background.png');
                background-size: cover;
                background-position: top center;
                background-repeat: no-repeat;
                background-attachment: fixed;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                color: white;
                display: flex;
                justify-content: center;
                align-items: center;
                position: relative;
                overflow-x: hidden;
            }
            
            .container {
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(12px);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 16px;
                padding: 60px 40px;
                width: 90%;
                max-width: 450px;
                position: relative;
                z-index: 2;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                text-align: center;
            }
            
            .game-title {
                height: 90px;
                margin-bottom: 20px;
                object-fit: contain;
                filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.8));
            }
            
            .game-subtitle {
                font-size: 14px;
                color: rgba(255, 255, 255, 0.8);
                margin-bottom: 40px;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                font-weight: 400;
                letter-spacing: 2px;
                text-transform: uppercase;
            }
            
            .form-title {
                font-size: 24px;
                font-weight: 600;
                color: white;
                margin-bottom: 30px;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            }
            
            .form-group {
                margin-bottom: 25px;
                text-align: left;
            }
            
            label {
                display: block;
                margin-bottom: 8px;
                font-size: 13px;
                color: rgba(255, 255, 255, 0.9);
                font-weight: 500;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                letter-spacing: 0.5px;
            }
            
            input[type="email"], 
            input[type="password"] {
                width: 100%;
                padding: 16px 20px;
                background: rgba(255, 255, 255, 0.1);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 12px;
                color: white;
                font-size: 16px;
                font-family: inherit;
                backdrop-filter: blur(8px);
                transition: all 0.3s ease;
                box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
            }
            
            input[type="email"]:focus, 
            input[type="password"]:focus {
                outline: none;
                border-color: #ff8c00;
                background: rgba(255, 255, 255, 0.15);
                box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2), 0 0 0 3px rgba(255, 140, 0, 0.2);
            }
            
            input[type="email"]::placeholder,
            input[type="password"]::placeholder {
                color: rgba(255, 255, 255, 0.5);
            }
            
            .submit-button {
                width: 100%;
                padding: 18px 20px;
                background: linear-gradient(135deg, #ff8c00 0%, #e67700 100%);
                border: none;
                border-radius: 12px;
                color: white;
                font-size: 16px;
                font-weight: 600;
                font-family: inherit;
                cursor: pointer;
                transition: all 0.3s ease;
                margin-bottom: 30px;
                box-shadow: 0 4px 15px rgba(255, 140, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            
            .submit-button:hover {
                background: linear-gradient(135deg, #ffaa33 0%, #ff8c00 100%);
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(255, 140, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
            }
            
            .submit-button:active {
                transform: translateY(0);
                box-shadow: 0 2px 8px rgba(255, 140, 0, 0.3);
            }
            
            .divider {
                height: 1px;
                background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%);
                margin: 30px 0;
            }
            
            .form-link {
                font-size: 14px;
                color: rgba(255, 255, 255, 0.8);
                line-height: 1.6;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            }
            
            .form-link a {
                color: #ff8c00;
                text-decoration: none;
                font-weight: 500;
                transition: color 0.3s ease;
            }
            
            .form-link a:hover {
                color: #ffaa33;
                text-decoration: underline;
            }
            
            .error-message {
                background: rgba(220, 53, 69, 0.15);
                border: 1px solid rgba(220, 53, 69, 0.4);
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 20px;
                font-size: 14px;
                color: #ff6b6b;
                backdrop-filter: blur(8px);
                text-shadow: none;
            }
            
            @media (max-width: 480px) {
                .container {
                    padding: 40px 30px;
                    margin: 20px;
                }
                
                .game-title {
                    height: 60px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="game-title">
                <img src="logo_alt.png" alt="The Mammoth Logo" style="height: 100%; width: auto;">
            </div>
            
            <h1 class="form-title">Create Account</h1>
            
            <form method="post">
                <input type="hidden" name="redirect_uri" value="${encodeURIComponent(redirect_uri)}">
                <input type="hidden" name="state" value="${state || ''}">
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
        </div>
    </body>
    </html>
    `);
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
        // Return error page with form
        return c.html(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Register</title>
            <style>/* Same styles as GET */</style>
        </head>
        <body>
            <div class="container">
                <div class="logo-text">Vibe Survival</div>
                <h1>Create Account</h1>
                <p style="color: red; margin-bottom: 15px;">Registration failed. That email might already be taken.</p>
                <form method="post">
                     <input type="hidden" name="redirect_uri" value="${redirect_uri_from_form}">
                     <input type="hidden" name="state" value="${state || ''}">
                     <input type="hidden" name="code_challenge" value="${code_challenge}">
                     <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">
                     <input type="hidden" name="client_id" value="${client_id}">
                     <div><label for="email">Email:</label><input id="email" name="email" type="email" value="${email || ''}" required></div>
                     <div><label for="password">Password:</label><input id="password" name="password" type="password" autocomplete="new-password" required></div>
                     <button type="submit">Register</button>
                </form>
            </div>
        </body>
        </html>
        `);
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

    return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="icon" type="image/png" href="/favicon.png">
        <title>Sign In - The Mammoth</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                min-height: 100vh;
                width: 100%;
                background-image: url('login_background.png');
                background-size: cover;
                background-position: top center;
                background-repeat: no-repeat;
                background-attachment: fixed;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                color: white;
                display: flex;
                justify-content: center;
                align-items: center;
                position: relative;
                overflow-x: hidden;
            }
            
            .container {
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(12px);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 16px;
                padding: 60px 40px;
                width: 90%;
                max-width: 450px;
                position: relative;
                z-index: 2;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                text-align: center;
            }
            
            .game-title {
                height: 90px;
                margin-bottom: 20px;
                object-fit: contain;
                filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.8));
            }
            
            .game-subtitle {
                font-size: 14px;
                color: rgba(255, 255, 255, 0.8);
                margin-bottom: 40px;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                font-weight: 400;
                letter-spacing: 2px;
                text-transform: uppercase;
            }
            
            .form-title {
                font-size: 24px;
                font-weight: 600;
                color: white;
                margin-bottom: 20px;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            }
            
            .error-message {
                background: rgba(220, 53, 69, 0.15);
                border: 1px solid rgba(220, 53, 69, 0.4);
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 25px;
                font-size: 14px;
                color: #ff6b6b;
                backdrop-filter: blur(8px);
                text-shadow: none;
            }
            
            .form-group {
                margin-bottom: 25px;
                text-align: left;
            }
            
            label {
                display: block;
                margin-bottom: 8px;
                font-size: 13px;
                color: rgba(255, 255, 255, 0.9);
                font-weight: 500;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                letter-spacing: 0.5px;
            }
            
            input[type="email"], 
            input[type="password"] {
                width: 100%;
                padding: 16px 20px;
                background: rgba(255, 255, 255, 0.1);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 12px;
                color: white;
                font-size: 16px;
                font-family: inherit;
                backdrop-filter: blur(8px);
                transition: all 0.3s ease;
                box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
            }
            
            input[type="email"]:focus, 
            input[type="password"]:focus {
                outline: none;
                border-color: #ff8c00;
                background: rgba(255, 255, 255, 0.15);
                box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2), 0 0 0 3px rgba(255, 140, 0, 0.2);
            }
            
            .submit-button {
                width: 100%;
                padding: 18px 20px;
                background: linear-gradient(135deg, #ff8c00 0%, #e67700 100%);
                border: none;
                border-radius: 12px;
                color: white;
                font-size: 16px;
                font-weight: 600;
                font-family: inherit;
                cursor: pointer;
                transition: all 0.3s ease;
                margin-bottom: 30px;
                box-shadow: 0 4px 15px rgba(255, 140, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            
            .submit-button:hover {
                background: linear-gradient(135deg, #ffaa33 0%, #ff8c00 100%);
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(255, 140, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
            }
            
            .divider {
                height: 1px;
                background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%);
                margin: 30px 0;
            }
            
            .form-link {
                font-size: 14px;
                color: rgba(255, 255, 255, 0.8);
                line-height: 1.6;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            }
            
            .form-link a {
                color: #ff8c00;
                text-decoration: none;
                font-weight: 500;
                transition: color 0.3s ease;
            }
            
            .form-link a:hover {
                color: #ffaa33;
                text-decoration: underline;
            }
            
            @media (max-width: 480px) {
                .container {
                    padding: 40px 30px;
                    margin: 20px;
                }
                
                .game-title {
                    height: 40px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="game-title">
                <img src="logo_alt.png" alt="The Mammoth Logo" style="height: 100%; width: auto;">
            </div>
            
            <h1 class="form-title">Sign In</h1>
            
            <form method="post">
                <input type="hidden" name="redirect_uri" value="${encodeURIComponent(redirect_uri)}">
                <input type="hidden" name="state" value="${state || ''}">
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
                
                <p class="form-link" style="margin-top: -15px; margin-bottom: 0;"><a href="/auth/password/forgot">Forgot Password?</a></p>
            </form>
            
            <div class="divider"></div>
            
            <p class="form-link">Don't have an account? <a href="/auth/password/register?${queryString}">Create Account</a></p>
        </div>
    </body>
    </html>
    `);
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
              
          return c.html(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="icon" type="image/png" href="/favicon.png">
                <title>Sign In - The Mammoth</title>
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    body {
                        min-height: 100vh;
                        width: 100%;
                        background-image: url('login_background.png');
                        background-size: cover;
                        background-position: top center;
                        background-repeat: no-repeat;
                        background-attachment: fixed;
                        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                        color: white;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        position: relative;
                        overflow-x: hidden;
                    }
                    
                    .container {
                        background: rgba(0, 0, 0, 0.75);
                        backdrop-filter: blur(12px);
                        border: 2px solid rgba(255, 255, 255, 0.3);
                        border-radius: 16px;
                        padding: 60px 40px;
                        width: 90%;
                        max-width: 450px;
                        position: relative;
                        z-index: 2;
                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                        text-align: center;
                    }
                    
                    .game-title {
                        height: 60px;
                        margin-bottom: 15px;
                        object-fit: contain;
                        filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.8));
                    }
                    
                    .game-subtitle {
                        font-size: 14px;
                        color: rgba(255, 255, 255, 0.8);
                        margin-bottom: 40px;
                        text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                        font-weight: 400;
                        letter-spacing: 2px;
                        text-transform: uppercase;
                    }
                    
                    .form-title {
                        font-size: 24px;
                        font-weight: 600;
                        color: white;
                        margin-bottom: 20px;
                        text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                    }
                    
                    .error-message {
                        background: rgba(220, 53, 69, 0.15);
                        border: 1px solid rgba(220, 53, 69, 0.4);
                        border-radius: 8px;
                        padding: 12px;
                        margin-bottom: 25px;
                        font-size: 14px;
                        color: #ff6b6b;
                        backdrop-filter: blur(8px);
                        text-shadow: none;
                    }
                    
                    .form-group {
                        margin-bottom: 25px;
                        text-align: left;
                    }
                    
                    label {
                        display: block;
                        margin-bottom: 8px;
                        font-size: 13px;
                        color: rgba(255, 255, 255, 0.9);
                        font-weight: 500;
                        text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                        letter-spacing: 0.5px;
                    }
                    
                    input[type="email"], 
                    input[type="password"] {
                        width: 100%;
                        padding: 16px 20px;
                        background: rgba(255, 255, 255, 0.1);
                        border: 2px solid rgba(255, 255, 255, 0.3);
                        border-radius: 12px;
                        color: white;
                        font-size: 16px;
                        font-family: inherit;
                        backdrop-filter: blur(8px);
                        transition: all 0.3s ease;
                        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
                    }
                    
                    input[type="email"]:focus, 
                    input[type="password"]:focus {
                        outline: none;
                        border-color: #ff8c00;
                        background: rgba(255, 255, 255, 0.15);
                        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2), 0 0 0 3px rgba(255, 140, 0, 0.2);
                    }
                    
                    .submit-button {
                        width: 100%;
                        padding: 18px 20px;
                        background: linear-gradient(135deg, #ff8c00 0%, #e67700 100%);
                        border: none;
                        border-radius: 12px;
                        color: white;
                        font-size: 16px;
                        font-weight: 600;
                        font-family: inherit;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        margin-bottom: 30px;
                        box-shadow: 0 4px 15px rgba(255, 140, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    }
                    
                    .submit-button:hover {
                        background: linear-gradient(135deg, #ffaa33 0%, #ff8c00 100%);
                        transform: translateY(-2px);
                        box-shadow: 0 6px 20px rgba(255, 140, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
                    }
                    
                    .divider {
                        height: 1px;
                        background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%);
                        margin: 30px 0;
                    }
                    
                    .form-link {
                        font-size: 14px;
                        color: rgba(255, 255, 255, 0.8);
                        line-height: 1.6;
                        text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                    }
                    
                    .form-link a {
                        color: #ff8c00;
                        text-decoration: none;
                        font-weight: 500;
                        transition: color 0.3s ease;
                    }
                    
                    .form-link a:hover {
                        color: #ffaa33;
                        text-decoration: underline;
                    }
                    
                    @media (max-width: 480px) {
                        .container {
                            padding: 40px 30px;
                            margin: 20px;
                        }
                        
                        .game-title {
                            height: 40px;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="game-title">
                        <img src="logo_alt.png" alt="The Mammoth Logo" style="height: 100%; width: auto;">
                    </div>
                    <h1 class="form-title">Sign In</h1>
                    <p class="error-message">Invalid email or password. Please try again.</p>
                    <form method="post">
                        <input type="hidden" name="redirect_uri" value="${redirect_uri_from_form}">
                        <input type="hidden" name="state" value="${state || ''}">
                        <input type="hidden" name="code_challenge" value="${code_challenge}">
                        <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">
                        <input type="hidden" name="client_id" value="${client_id}">
                        <div class="form-group">
                            <label for="email">Email Address</label>
                            <input id="email" name="email" type="email" value="${email || ''}" required placeholder="Enter your email">
                        </div>
                        <div class="form-group">
                            <label for="password">Password</label>
                            <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Enter your password">
                        </div>
                        <button type="submit" class="submit-button">Sign In</button>
                        
                        <p class="form-link" style="margin-top: -15px; margin-bottom: 0;"><a href="/auth/password/forgot">Forgot Password?</a></p>
                    </form>
                    <div class="divider"></div>
                    <p class="form-link">Don't have an account? <a href="/auth/password/register?${queryString}">Create Account</a></p>
                </div>
            </body>
            </html>
          `);
      }
  });

  // --- Forgot Password Flow ---
  app.get('/auth/password/forgot', (c) => {
    return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="icon" type="image/png" href="/favicon.png">
        <title>Forgot Password - The Mammoth</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                min-height: 100vh;
                width: 100%;
                background-image: url('login_background.png');
                background-size: cover;
                background-position: top center;
                background-repeat: no-repeat;
                background-attachment: fixed;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                color: white;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .container {
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(12px);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 16px;
                padding: 60px 40px;
                width: 90%;
                max-width: 450px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                text-align: center;
            }
            .game-title { height: 90px; margin-bottom: 20px; }
            .game-subtitle {
                font-size: 14px;
                color: rgba(255, 255, 255, 0.8);
                margin-bottom: 40px;
                letter-spacing: 2px;
                text-transform: uppercase;
            }
            .form-title {
                font-size: 24px;
                font-weight: 600;
                margin-bottom: 15px;
            }
            .form-description {
                font-size: 14px;
                color: rgba(255, 255, 255, 0.7);
                margin-bottom: 30px;
                line-height: 1.5;
            }
            .form-group { margin-bottom: 25px; text-align: left; }
            label {
                display: block;
                margin-bottom: 8px;
                font-size: 13px;
                color: rgba(255, 255, 255, 0.9);
                font-weight: 500;
            }
            input[type="email"] {
                width: 100%;
                padding: 16px 20px;
                background: rgba(255, 255, 255, 0.1);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 12px;
                color: white;
                font-size: 16px;
                transition: all 0.3s ease;
            }
            input[type="email"]:focus {
                outline: none;
                border-color: #ff8c00;
                background: rgba(255, 255, 255, 0.15);
            }
            input[type="email"]::placeholder { color: rgba(255, 255, 255, 0.5); }
            .submit-button {
                width: 100%;
                padding: 18px 20px;
                background: linear-gradient(135deg, #ff8c00 0%, #e67700 100%);
                border: none;
                border-radius: 12px;
                color: white;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                margin-bottom: 30px;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .submit-button:hover {
                background: linear-gradient(135deg, #ffaa33 0%, #ff8c00 100%);
                transform: translateY(-2px);
            }
            .divider {
                height: 1px;
                background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%);
                margin: 30px 0;
            }
            .form-link {
                font-size: 14px;
                color: rgba(255, 255, 255, 0.8);
            }
            .form-link a {
                color: #ff8c00;
                text-decoration: none;
                font-weight: 500;
            }
            .form-link a:hover { color: #ffaa33; text-decoration: underline; }
            .error-message {
                background: rgba(220, 53, 69, 0.15);
                border: 1px solid rgba(220, 53, 69, 0.4);
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 20px;
                font-size: 14px;
                color: #ff6b6b;
            }
            .success-message {
                background: rgba(40, 167, 69, 0.15);
                border: 1px solid rgba(40, 167, 69, 0.4);
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 20px;
                font-size: 14px;
                color: #5cb85c;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="game-title">
                <img src="logo_alt.png" alt="The Mammoth Logo" style="height: 100%; width: auto;">
            </div>
            <h1 class="form-title">Forgot Password</h1>
            <p class="form-description">Enter your email address and we'll send you a link to reset your password.</p>
            <form method="post">
                <div class="form-group">
                    <label for="email">Email Address</label>
                    <input id="email" name="email" type="email" autocomplete="email" required placeholder="Enter your email">
                </div>
                <button type="submit" class="submit-button">Send Reset Link</button>
            </form>
            <div class="divider"></div>
            <p class="form-link">Remember your password? <a href="/auth/password/login">Sign In</a></p>
        </div>
    </body>
    </html>
    `);
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
          from: 'The Mammoth <noreply@brothandbullets.com>',
          to: email,
          subject: 'Reset your The Mammoth password',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: system-ui, -apple-system, sans-serif; background-color: #1a1a2e; color: #ffffff; padding: 40px 20px; margin: 0;">
              <div style="max-width: 500px; margin: 0 auto; background: rgba(40, 40, 60, 0.95); border-radius: 16px; padding: 40px; border: 2px solid rgba(255, 140, 0, 0.3);">
                <h1 style="color: #ff8c00; margin-bottom: 20px; font-size: 24px;">Reset Your Password</h1>
                <p style="color: rgba(255, 255, 255, 0.8); line-height: 1.6; margin-bottom: 30px;">
                  You requested a password reset for your The Mammoth account. Click the button below to set a new password:
                </p>
                <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #ff8c00 0%, #e67700 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                  Reset Password
                </a>
                <p style="color: rgba(255, 255, 255, 0.5); font-size: 13px; margin-top: 30px; line-height: 1.5;">
                  This link will expire in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes.<br><br>
                  If you didn't request this reset, you can safely ignore this email.
                </p>
                <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 30px 0;">
                <p style="color: rgba(255, 255, 255, 0.4); font-size: 12px;">
                  The Mammoth - Balkan Farming Sim
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

    // Show success page
    return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="icon" type="image/png" href="/favicon.png">
        <title>Password Reset - The Mammoth</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                min-height: 100vh;
                background-image: url('/login_background.png');
                background-size: cover;
                background-position: top center;
                font-family: system-ui, -apple-system, sans-serif;
                color: white;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .container {
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(12px);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 16px;
                padding: 60px 40px;
                width: 90%;
                max-width: 450px;
                text-align: center;
            }
            .game-title { height: 90px; margin-bottom: 20px; }
            .success-icon {
                font-size: 64px;
                margin-bottom: 20px;
            }
            .form-title { font-size: 24px; font-weight: 600; margin-bottom: 15px; color: #5cb85c; }
            .form-description {
                font-size: 14px;
                color: rgba(255, 255, 255, 0.7);
                margin-bottom: 30px;
                line-height: 1.5;
            }
            .submit-button {
                display: inline-block;
                padding: 18px 40px;
                background: linear-gradient(135deg, #ff8c00 0%, #e67700 100%);
                border: none;
                border-radius: 12px;
                color: white;
                font-size: 16px;
                font-weight: 600;
                text-decoration: none;
                text-transform: uppercase;
                letter-spacing: 1px;
                transition: all 0.3s ease;
            }
            .submit-button:hover {
                background: linear-gradient(135deg, #ffaa33 0%, #ff8c00 100%);
                transform: translateY(-2px);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="game-title">
                <img src="/logo_alt.png" alt="The Mammoth Logo" style="height: 100%; width: auto;">
            </div>
            <div class="success-icon">✓</div>
            <h1 class="form-title">Password Reset Successful!</h1>
            <p class="form-description">Your password has been successfully updated. You can now sign in with your new password.</p>
            <a href="/auth/password/login" class="submit-button">Sign In</a>
        </div>
    </body>
    </html>
    `);
  });

  // Token endpoint - Updated for environment keys
  app.post('/token', async c => {
    const form = await c.req.formData();
    const grantType = form.get('grant_type');
    const code = form.get('code');
    const redirectUriForm = form.get('redirect_uri');
    const clientIdForm = form.get('client_id');
    const codeVerifier = form.get('code_verifier');

    if (grantType !== 'authorization_code' || typeof code !== 'string' || typeof codeVerifier !== 'string' || typeof clientIdForm !== 'string') {
        return c.text('invalid_request', 400);
    }

    const codeData = await db.getAuthCode(code);
    if (!codeData) {
        console.error(`[AuthServer] /token: Code ${code} not found.`);
        return c.text('invalid_grant', 400); 
    }

    // PKCE Verification
    let calculatedChallenge: string;
    if (codeData.codeChallengeMethod === 'S256') {
        const hash = crypto.createHash('sha256').update(codeVerifier).digest();
        calculatedChallenge = Buffer.from(hash).toString('base64url');
    } else {
        calculatedChallenge = codeVerifier;
        if(codeData.codeChallengeMethod !== 'plain') {
             console.error(`[AuthServer] /token: Unsupported code_challenge_method: ${codeData.codeChallengeMethod}`);
             return c.text('invalid_request', 400); 
        }
    }

    if (calculatedChallenge !== codeData.codeChallenge) {
        console.error(`[AuthServer] /token: PKCE verification failed. Expected ${codeData.codeChallenge}, got ${calculatedChallenge}`);
        await db.deleteAuthCode(code);
        return c.text('invalid_grant', 400); 
    }

    if (clientIdForm !== codeData.clientId) {
         console.error(`[AuthServer] /token: Client ID mismatch.`);
         await db.deleteAuthCode(code);
         return c.text('invalid_grant', 400); 
    }

    const userId = codeData.userId;
    await db.deleteAuthCode(code);

    console.log('[Token Endpoint] Code verified. Generating JWT...');
    
    // Look up user to get email for token
    const user = await db.getUserById(userId);
    const userEmail = user?.email;
    
    const payload = {
        iss: ISSUER_URL,
        sub: userId,
        aud: clientIdForm,
        iat: Math.floor(Date.now() / 1000),
        email: userEmail, // Include email in token
    };

    const signOptions: jwt.SignOptions = {
        algorithm: 'RS256',
        expiresIn: '4h',
        keyid: keyId,
    };

    const privateKey = getPrivateKey();
    const idToken = jwt.sign(payload, privateKey, signOptions);
    const accessToken = idToken; 

    const expiresInSeconds = 4 * 60 * 60;

    return c.json({
        access_token: accessToken, 
        id_token: idToken, 
        token_type: 'Bearer', 
        expires_in: expiresInSeconds 
    });
  });

  // Mount the OpenAuth issuer routes
  app.route('/', auth);
  app.get('/health', c => c.text('OK'));

  console.log(`🚀 Auth server → ${ISSUER_URL}`);
  serve({ fetch: app.fetch, port: PORT });
})(); 