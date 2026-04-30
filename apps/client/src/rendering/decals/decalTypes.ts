import type * as THREE from "three";

export type DecalCategory = "graffiti" | "poster" | "sticker" | "grime";

export type DecalManifestEntry = {
  id: string;
  category: DecalCategory;
  url: string;
  /** Default physical size in meters (width, height, depth for projected; depth is projector thickness). */
  defaultSize: readonly [number, number, number];
  roughness?: number;
  metalness?: number;
  /**
   * Some shipped graffiti PNGs are **RGB-only** with a nominally-black matte.
   * Flood-fill outward from image borders within this luminance band and punch alpha → 0
   * so decals do not occlude underlying wall albedo while preserving interior blacks.
   */
  borderConnectedBackgroundRemoval?: {
    /** Max grayscale value (per channel clamp) treated as matte when connected to the border. */
    maxLuma: number;
  };
};

export type DecalPlacement = {
  id: string;
  category: "graffiti" | "poster" | "sticker";
  mode: "projected" | "flat";
  stairShaftId?: string;
  storeyLevelIndex?: number;
  targetMeshName?: string;
  position: readonly [number, number, number];
  normal: readonly [number, number, number];
  rotation?: number;
  size?: readonly [number, number, number];
  width?: number;
  height?: number;
  opacity?: number;
  grime?: boolean;
};

export type DecalManifest = readonly DecalManifestEntry[];

export type DecalMaterialOpts = {
  roughness: number;
  metalness: number;
  transparent: boolean;
  opacity: number;
  alphaTest: number;
  depthWrite: boolean;
  polygonOffset: boolean;
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
};

export type DecalMeshResolver = (
  placement: DecalPlacement,
  candidateMeshes: readonly THREE.Mesh[],
) => THREE.Mesh | undefined;
