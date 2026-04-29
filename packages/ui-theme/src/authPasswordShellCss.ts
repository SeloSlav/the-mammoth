import { uiRootStyleBlock } from "./uiTheme.js";

/**
 * Self-contained styles for password auth pages served by `apps/auth` (login, register, reset).
 * Includes `:root` variables plus layout and form rules.
 */
export const MAMMOTH_AUTH_PASSWORD_SHELL_CSS = `${uiRootStyleBlock()}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  width: 100%;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, sans-serif;
  color: var(--ui-text-primary);
  background:
    radial-gradient(circle at 16% 12%, var(--ui-page-bg-mid) 0, transparent 34vw),
    radial-gradient(circle at 82% 18%, var(--ui-accent) 0, transparent 22vw),
    linear-gradient(145deg, var(--ui-page-bg-edge), var(--ui-page-bg-mid) 52%, var(--ui-page-bg-edge));
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px 16px;
  overflow-x: hidden;
}

body::before,
body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
}

body::before {
  opacity: 0.28;
  background:
    linear-gradient(90deg, transparent 0 12%, var(--ui-divider) 12.1% 12.35%, transparent 12.45% 100%),
    repeating-linear-gradient(0deg, transparent 0 38px, var(--ui-card-border) 39px 40px);
  mask-image: linear-gradient(90deg, transparent, black 16%, black 72%, transparent);
}

body::after {
  background:
    radial-gradient(ellipse at center, transparent 0 35%, var(--ui-backdrop-vignette) 100%),
    linear-gradient(90deg, var(--ui-backdrop-scrim), transparent 48%, var(--ui-backdrop-scrim));
}

.container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 460px;
  padding: 30px 26px;
  border-radius: 22px;
  background: var(--ui-card-bg-strong);
  border: 1px solid var(--ui-card-border-strong);
  box-shadow: var(--ui-panel-shadow);
  text-align: center;
  backdrop-filter: blur(18px);
}

.mammoth-brand-lockup {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 0;
  margin-bottom: 6px;
}

.mammoth-logo-full {
  display: block;
  margin: 0 auto;
  max-width: min(100%, 340px);
  width: 100%;
  height: auto;
  max-height: 118px;
  object-fit: contain;
}

.mammoth-tagline {
  font-size: 0.7rem;
  color: var(--ui-text-faint);
  letter-spacing: 0.18em;
  margin-bottom: 24px;
  text-transform: uppercase;
}

.form-title {
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--ui-text-primary);
  margin-bottom: 18px;
}

.form-description {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  margin-bottom: 22px;
  line-height: 1.5;
  text-align: left;
}

.form-group {
  margin-bottom: 18px;
  text-align: left;
}

label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
  font-weight: 500;
}

input[type="email"],
input[type="password"],
input[type="text"] {
  width: 100%;
  padding: 13px 14px;
  border-radius: 12px;
  border: 1px solid var(--ui-input-border);
  background: var(--ui-input-bg);
  color: var(--ui-text-primary);
  font-size: 1rem;
  font-family: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

input[type="email"]:focus,
input[type="password"]:focus,
input[type="text"]:focus {
  outline: none;
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-focus-ring);
}

input[type="email"]::placeholder,
input[type="password"]::placeholder,
input[type="text"]::placeholder {
  color: var(--ui-text-faint);
}

input:disabled {
  opacity: 0.55;
}

.submit-button {
  display: block;
  width: 100%;
  padding: 12px 14px;
  margin-top: 4px;
  margin-bottom: 18px;
  border: none;
  border-radius: 12px;
  background: var(--ui-accent);
  color: var(--ui-accent-on);
  font-size: 0.9375rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  text-decoration: none;
  text-align: center;
  transition: background 0.15s ease, transform 0.1s ease;
}

.submit-button:hover {
  background: var(--ui-accent-hover);
}

.submit-button:active {
  transform: translateY(1px);
}

.divider {
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--ui-divider) 50%,
    transparent 100%
  );
  margin: 18px 0;
}

.form-link-tight {
  margin-top: -8px;
  margin-bottom: 0;
}

.form-link {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  line-height: 1.55;
}

.form-link a {
  color: var(--ui-accent);
  text-decoration: none;
  font-weight: 500;
}

.form-link a:hover {
  color: var(--ui-accent-hover);
  text-decoration: underline;
}

.error-message {
  background: var(--ui-error-bg);
  border: 1px solid var(--ui-error-border);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 16px;
  font-size: 0.875rem;
  color: var(--ui-error);
  text-align: left;
}

.success-message {
  background: var(--ui-success-bg);
  border: 1px solid var(--ui-success-border);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 16px;
  font-size: 0.875rem;
  color: var(--ui-success);
  line-height: 1.45;
  text-align: left;
}

.success-title {
  color: var(--ui-success);
}

.success-icon {
  font-size: 2.5rem;
  margin-bottom: 12px;
  line-height: 1;
}

@media (max-width: 480px) {
  .container {
    padding: 22px 18px;
  }
}
`;
