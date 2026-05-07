import { afterEach, describe, expect, it, vi } from "vitest";
import { requestGameFullscreenFromUserGesture } from "./requestGameFullscreen";

describe("requestGameFullscreenFromUserGesture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when document is missing", () => {
    vi.stubGlobal("document", undefined);
    expect(() => requestGameFullscreenFromUserGesture()).not.toThrow();
  });

  it("skips when already fullscreen", () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    vi.stubGlobal("document", {
      fullscreenElement: {},
      documentElement: { requestFullscreen },
    });
    requestGameFullscreenFromUserGesture();
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it("calls documentElement.requestFullscreen when available", () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    vi.stubGlobal("document", {
      fullscreenElement: null,
      documentElement: { requestFullscreen },
    });
    requestGameFullscreenFromUserGesture();
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it("falls back to webkitRequestFullscreen", () => {
    const webkitRequestFullscreen = vi.fn(() => Promise.resolve());
    vi.stubGlobal("document", {
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: undefined,
        webkitRequestFullscreen,
      },
    });
    requestGameFullscreenFromUserGesture();
    expect(webkitRequestFullscreen).toHaveBeenCalledOnce();
  });

  it("swallows rejection from requestFullscreen", async () => {
    const requestFullscreen = vi.fn(() => Promise.reject(new Error("denied")));
    vi.stubGlobal("document", {
      fullscreenElement: null,
      documentElement: { requestFullscreen },
    });
    requestGameFullscreenFromUserGesture();
    await vi.waitFor(() => expect(requestFullscreen).toHaveBeenCalled());
    await Promise.resolve();
  });
});
