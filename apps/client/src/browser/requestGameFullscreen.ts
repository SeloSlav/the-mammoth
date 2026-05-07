type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
};

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
  mozRequestFullScreen?: () => void | Promise<void>;
  msRequestFullscreen?: () => void | Promise<void>;
};

function fullscreenElement(doc: Document): Element | null {
  const d = doc as FullscreenDoc;
  return (
    doc.fullscreenElement ??
    d.webkitFullscreenElement ??
    d.mozFullScreenElement ??
    d.msFullscreenElement ??
    null
  );
}

function swallowFullscreenPromise(result: void | Promise<void>): void {
  if (result && typeof (result as Promise<void>).catch === "function") {
    void (result as Promise<void>).catch(() => {});
  }
}

/**
 * Enter fullscreen using the Fullscreen API. Must be invoked **synchronously** from a user gesture
 * (e.g. submit / pointerdown). Does not `await` internally so callers can `await` network work afterward
 * without losing the activation that started fullscreen.
 */
export function requestGameFullscreenFromUserGesture(): void {
  if (typeof document === "undefined") return;
  if (fullscreenElement(document)) return;

  const root = document.documentElement as FullscreenCapableElement;

  try {
    if (typeof root.requestFullscreen === "function") {
      swallowFullscreenPromise(root.requestFullscreen.call(root));
      return;
    }
    if (typeof root.webkitRequestFullscreen === "function") {
      swallowFullscreenPromise(root.webkitRequestFullscreen());
      return;
    }
    if (typeof root.mozRequestFullScreen === "function") {
      swallowFullscreenPromise(root.mozRequestFullScreen());
      return;
    }
    if (typeof root.msRequestFullscreen === "function") {
      swallowFullscreenPromise(root.msRequestFullscreen());
      return;
    }
  } catch {
    // Unsupported, denied, or embed policy — gameplay still proceeds.
  }
}
