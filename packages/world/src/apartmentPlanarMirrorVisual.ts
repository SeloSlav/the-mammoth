import * as THREE from "three";

/** Default width for a newly placed apartment mirror (m) — matches elevator cab mirror. */
export const APARTMENT_PLANAR_MIRROR_DEFAULT_WIDTH_M = 0.72;
/** Default height for a newly placed apartment mirror (m) — matches elevator cab mirror. */
export const APARTMENT_PLANAR_MIRROR_DEFAULT_HEIGHT_M = 1.28;
const MIRROR_FRAME_OVERHANG_M = 0.05;
const MIRROR_FRAME_THICKNESS_M = 0.024;

export const APARTMENT_MIRROR_SURFACE_USERDATA_KEY =
  "mammothApartmentMirrorSurface" as const;

/** Distinguishes apartment-authored mirrors from elevator cab mirrors in FP reflection gating. */
export const MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY =
  "mammothApartmentPlanarMirror" as const;

export type BuildApartmentPlanarMirrorVisualArgs = {
  widthM: number;
  heightM: number;
  /** Thin metal frame like the elevator cab mirror (default true). */
  includeFrame?: boolean;
};

/**
 * Rectangle planar mirror visual: reflective surface tagged {@link mammothCabMirror} for FP
 * {@link createFpPlanarMirrorFromPlaceholder}, optional frame bars for authoring readability.
 */
export function buildApartmentPlanarMirrorVisual(
  args: BuildApartmentPlanarMirrorVisualArgs,
): THREE.Group {
  const widthM = Math.max(0.05, args.widthM);
  const heightM = Math.max(0.05, args.heightM);
  const includeFrame = args.includeFrame !== false;

  const root = new THREE.Group();
  root.name = "apartment_planar_mirror";

  if (includeFrame) {
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xb8bec6,
      roughness: 0.24,
      metalness: 0.58,
    });
    const outerW = widthM + MIRROR_FRAME_OVERHANG_M * 2;
    const barW = MIRROR_FRAME_OVERHANG_M;
    const addBar = (name: string, sx: number, sy: number, x: number, y: number) => {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, MIRROR_FRAME_THICKNESS_M),
        frameMat,
      );
      bar.name = name;
      bar.position.set(x, y, -MIRROR_FRAME_THICKNESS_M * 0.5);
      bar.castShadow = false;
      bar.receiveShadow = false;
      root.add(bar);
    };
    addBar("apartment_mirror_frame_top", outerW, barW, 0, heightM + barW * 0.5);
    addBar("apartment_mirror_frame_bottom", outerW, barW, 0, -barW * 0.5);
    addBar(
      "apartment_mirror_frame_left",
      barW,
      heightM,
      -(widthM + barW) * 0.5,
      heightM * 0.5,
    );
    addBar(
      "apartment_mirror_frame_right",
      barW,
      heightM,
      (widthM + barW) * 0.5,
      heightM * 0.5,
    );
  }

  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({
      color: 0xdfe4ec,
      roughness: 0.04,
      metalness: 0.02,
    }),
  );
  surface.name = "apartment_mirror_surface";
  surface.scale.set(widthM, heightM, 1);
  surface.position.set(0, heightM / 2, 0);
  surface.castShadow = false;
  surface.receiveShadow = false;
  surface.frustumCulled = true;
  surface.userData.mammothCabMirror = true;
  surface.userData[APARTMENT_MIRROR_SURFACE_USERDATA_KEY] = true;
  surface.userData[MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY] = true;
  root.add(surface);

  return root;
}
