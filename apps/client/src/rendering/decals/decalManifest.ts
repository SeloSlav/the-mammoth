import type { DecalManifest } from "./decalTypes.js";

const BLOK47_URL = "/assets/decals/graffiti/blok47.png";

/**
 * Several ids share one URL so placement variety does not duplicate binaries.
 * Grime URL is optional — {@link DecalManager} skips missing grime assets quietly.
 */
export const DECAL_MANIFEST: DecalManifest = [
  ...(["blok47_a", "blok47_b", "blok47_c", "blok47_d", "blok47_e", "blok47_f", "blok47_g", "blok47_h"] as const).map(
    (id) =>
      ({
        id,
        category: "graffiti",
        url: BLOK47_URL,
        defaultSize: [0.95, 0.95, 0.35] as const,
        roughness: 0.92,
        metalness: 0,
      }) as const,
  ),
  {
    id: "grime_01",
    category: "grime",
    url: "/assets/decals/grime/grime_01.webp",
    defaultSize: [1.15, 1.15, 0.4],
    roughness: 1,
    metalness: 0,
  },
];
