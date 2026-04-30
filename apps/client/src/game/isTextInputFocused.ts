/** True when keyboard typing should go to the browser, not the FP session key state. */
export function isTextInputFocused(): boolean {
  const el = document.activeElement;
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
