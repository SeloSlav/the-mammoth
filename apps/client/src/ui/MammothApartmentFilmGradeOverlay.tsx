import type { CSSProperties } from "react";

const grainSvg =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.88' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='table' tableValues='0 .42'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='96' height='96' filter='url(%23n)' opacity='.56'/%3E%3C/svg%3E\")";

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 3,
  pointerEvents: "none",
  backgroundImage: [
    "radial-gradient(ellipse at 50% 44%, transparent 0%, rgba(16, 10, 7, 0.06) 72%, rgba(4, 3, 3, 0.14) 100%)",
    grainSvg,
  ].join(", "),
  backgroundSize: "100% 100%, 96px 96px",
  backgroundPosition: "center, 0 0",
  mixBlendMode: "soft-light",
  opacity: 0.28,
};

/**
 * Lightweight film-grade layer over the WebGPU canvas. It gives the apartment a dirtier,
 * warmer CRT-era read without taking over the renderer's WebGPU post-processing path.
 */
export function MammothApartmentFilmGradeOverlay() {
  return <div aria-hidden="true" style={overlayStyle} />;
}
