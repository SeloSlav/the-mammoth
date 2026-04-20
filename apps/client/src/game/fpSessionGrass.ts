import * as THREE from "three";
import { FP_OUTDOOR_GROUND_VISUAL_Y } from "@the-mammoth/world";
import { seedCursor } from "weft-sdk/core";
import {
  buildGrassStateSurface,
  createGrassEffect,
  DEFAULT_GRASS_FIELD_PARAMS,
  type PresetLayoutViewCull,
} from "weft-sdk/three";

/** Half-extent in X/Z for Weft grass layout — inside the 6000×6000 FP ground plane. */
const FP_GRASS_FIELD_HALF_EXTENT = 2800;

/**
 * Playground uses ~3.84 on a ~56 m field; scale up sublinearly for a km-scale field so cover stays
 * thick near the player without pushing the instanced cap everywhere at once.
 */
const FP_GRASS_LAYOUT_DENSITY =
  16 * 0.24 * Math.sqrt(FP_GRASS_FIELD_HALF_EXTENT / 28);

const GRASS_VIEW_CULL_RADIUS = 68;
const GRASS_VIEW_CULL_PADDING = 18;

export type FpSessionGrassHandle = {
  readonly group: THREE.Group;
  /** Wall-clock seconds for wind animation (same contract as Weft demos). */
  tick(camera: THREE.Camera, elapsedSec: number): void;
  dispose(): void;
};

/**
 * GPU grass for the outdoor FP ground: fills the authored field except under the building footprint
 * (expanded slightly so edges do not leak through façades).
 */
export function createFpSessionGrass(
  buildingFootprintWorld: THREE.Box3,
): FpSessionGrassHandle {
  const paddedFootprint = buildingFootprintWorld.clone();
  paddedFootprint.expandByScalar(4);

  const excludeAtXZ = (x: number, z: number): boolean => {
    return (
      x >= paddedFootprint.min.x &&
      x <= paddedFootprint.max.x &&
      z >= paddedFootprint.min.z &&
      z <= paddedFootprint.max.z
    );
  };

  const grassEffect = createGrassEffect({
    surface: buildGrassStateSurface(DEFAULT_GRASS_FIELD_PARAMS.state),
    seedCursor,
    initialParams: {
      ...DEFAULT_GRASS_FIELD_PARAMS,
      layoutDensity: FP_GRASS_LAYOUT_DENSITY,
      colorSeason: "summer",
    },
    placementMask: {
      bounds: {
        minX: -FP_GRASS_FIELD_HALF_EXTENT,
        maxX: FP_GRASS_FIELD_HALF_EXTENT,
        minZ: -FP_GRASS_FIELD_HALF_EXTENT,
        maxZ: FP_GRASS_FIELD_HALF_EXTENT,
      },
      excludeAtXZ,
    },
    terrainRelief: null,
  });

  grassEffect.group.position.y = FP_OUTDOOR_GROUND_VISUAL_Y;

  const grassViewCull: PresetLayoutViewCull = {
    cameraWorld: new THREE.Vector3(),
    radius: GRASS_VIEW_CULL_RADIUS,
    padding: GRASS_VIEW_CULL_PADDING,
  };
  const projScreenMatrix = new THREE.Matrix4();
  const frustum = new THREE.Frustum();

  return {
    group: grassEffect.group,
    tick(camera: THREE.Camera, elapsedSec: number) {
      grassViewCull.cameraWorld.copy(camera.position);
      projScreenMatrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      frustum.setFromProjectionMatrix(projScreenMatrix);
      grassViewCull.frustum = frustum;
      grassEffect.update(elapsedSec, grassViewCull);
    },
    dispose() {
      grassEffect.dispose();
    },
  };
}
