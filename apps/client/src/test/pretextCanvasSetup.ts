import { createCanvas } from "@napi-rs/canvas";

/** Pretext needs OffscreenCanvas 2D — polyfill for vitest/node. */
class PretextOffscreenCanvas {
  private readonly canvas;

  constructor(width: number, height: number) {
    this.canvas = createCanvas(width, height);
  }

  getContext(type: string) {
    if (type !== "2d") return null;
    return this.canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  }
}

globalThis.OffscreenCanvas = PretextOffscreenCanvas as unknown as typeof OffscreenCanvas;
