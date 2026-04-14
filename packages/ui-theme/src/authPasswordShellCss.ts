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
  background: radial-gradient(ellipse at center, var(--ui-page-bg-mid) 0%, var(--ui-page-bg-edge) 72%);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px 16px;
}

.container {
  width: 100%;
  max-width: 440px;
  padding: 28px 24px;
  border-radius: 12px;
  background: var(--ui-card-bg);
  border: 1px solid var(--ui-card-border);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.45);
  text-align: center;
}

.mammoth-brand {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--ui-text-primary);
  margin-bottom: 4px;
}

.mammoth-tagline {
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
  margin-bottom: 22px;
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
input[type="password"] {
  width: 100%;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--ui-input-border);
  background: var(--ui-input-bg);
  color: var(--ui-text-primary);
  font-size: 1rem;
  font-family: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

input[type="email"]:focus,
input[type="password"]:focus {
  outline: none;
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-focus-ring);
}

input[type="email"]::placeholder,
input[type="password"]::placeholder {
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
  border-radius: 8px;
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
    rgba(255, 255, 255, 0.12) 50%,
    transparent 100%
  );
  margin: 18px 0;
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
  background: rgba(232, 120, 120, 0.12);
  border: 1px solid rgba(232, 120, 120, 0.35);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 16px;
  font-size: 0.875rem;
  color: var(--ui-error);
  text-align: left;
}

.success-message {
  background: rgba(123, 207, 154, 0.1);
  border: 1px solid rgba(123, 207, 154, 0.35);
  border-radius: 8px;
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
