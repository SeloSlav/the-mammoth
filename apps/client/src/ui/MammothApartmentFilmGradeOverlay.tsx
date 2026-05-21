import type { CSSProperties } from "react";

const grainSvg =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.88' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='table' tableValues='0 .42'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='96' height='96' filter='url(%23n)' opacity='.56'/%3E%3C/svg%3E\")";

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 3,
  pointerEvents: "none",
  backgroundImage: [
    "radial-gradient(ellipse at 56% 42%, transparent 0%, transparent 42%, rgba(8, 5, 4, 0.1) 74%, rgba(3, 2, 2, 0.28) 100%)",
    "linear-gradient(180deg, rgba(5, 4, 3, 0.18) 0%, transparent 32%, transparent 68%, rgba(5, 3, 2, 0.2) 100%)",
    "linear-gradient(90deg, rgba(4, 3, 3, 0.2) 0%, transparent 24%, transparent 76%, rgba(4, 3, 3, 0.16) 100%)",
    grainSvg,
  ].join(", "),
  backgroundSize: "100% 100%, 100% 100%, 100% 100%, 96px 96px",
  backgroundPosition: "center, center, center, 0 0",
  mixBlendMode: "multiply",
  opacity: 0.42,
};

/**
 * Lightweight film-grade layer over the WebGPU canvas. It gives the apartment a dirtier,
 * warmer CRT-era read without taking over the renderer's WebGPU post-processing path.
 */
export function MammothApartmentFilmGradeOverlay() {
  return <div aria-hidden="true" style={overlayStyle} />;
}
