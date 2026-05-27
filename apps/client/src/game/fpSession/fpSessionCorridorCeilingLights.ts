import * as THREE from "three";
import { resolveOwnedApartmentDecorRootScale } from "@the-mammoth/schemas";
import {
  ENABLE_CORRIDOR_CEILING_LIGHTS,
  ENABLE_RUNTIME_CORRIDOR_FIXTURE_PRACTICAL_LIGHTS,
  FLOOR_19_GAMEPLAY_LEVEL_INDEX,
} from "@the-mammoth/world";
import {
  resolveFpFloor19CorridorAuthoringContext,
  resolveFpFloor19CorridorDecorPlacements,
  type FpFloor19CorridorDecorPlacement,
} from "./fpFloor19CorridorBuiltinsFromContent.js";
import { disposeStaticWorldObjectTree } from "./fpSessionStaticWorldDispose.js";

export const FP_FLOOR_19_CORRIDOR_DECOR_ROOT_NAME = "fp_floor_19_corridor_decor";

/** Corridor proxies never enter the apartment decor / instancing / practical-light pipelines. */
export const MAMMOTH_CORRIDOR_CEILING_LIGHT_PROXY_UD = "mammothCorridorCeilingLightProxy";

const PROXY_RING_INNER = 0.82;
const PROXY_RING_OUTER = 1.18;
const PROXY_HOUSING_HEIGHT = 0.08;
/** Short neck between flush trim and hanging globe — matches light-ceiling-2 silhouette. */
const PROXY_SOCKET_HEIGHT = 0.14;
const PROXY_SOCKET_RADIUS = 0.34;
/** Unit-space globe before placement scale (~0.19 → ~10 cm radius in world). */
const PROXY_BULB_RADIUS = 0.54;
const PROXY_BULB_CENTER_Y =
  -PROXY_HOUSING_HEIGHT - PROXY_SOCKET_HEIGHT - PROXY_BULB_RADIUS;

let sharedProxyGeometries: {
  ring: THREE.RingGeometry;
  housing: THREE.CylinderGeometry;
  socket: THREE.CylinderGeometry;
  bulb: THREE.SphereGeometry;
} | null = null;

let sharedProxyMaterials: {
  housing: THREE.MeshStandardMaterial;
  socket: THREE.MeshStandardMaterial;
  bulb: THREE.MeshStandardMaterial;
} | null = null;

function corridorCeilingLightProxyAssets(): {
  geometries: NonNullable<typeof sharedProxyGeometries>;
  materials: NonNullable<typeof sharedProxyMaterials>;
} {
  if (!sharedProxyGeometries) {
    sharedProxyGeometries = {
      ring: new THREE.RingGeometry(PROXY_RING_INNER, PROXY_RING_OUTER, 12),
      housing: new THREE.CylinderGeometry(
        PROXY_RING_OUTER,
        PROXY_RING_OUTER,
        PROXY_HOUSING_HEIGHT,
        12,
      ),
      socket: new THREE.CylinderGeometry(
        PROXY_SOCKET_RADIUS,
        PROXY_SOCKET_RADIUS * 0.88,
        PROXY_SOCKET_HEIGHT,
        10,
      ),
      bulb: new THREE.SphereGeometry(PROXY_BULB_RADIUS, 12, 10),
    };
  }
  if (!sharedProxyMaterials) {
    sharedProxyMaterials = {
      housing: new THREE.MeshStandardMaterial({
        color: 0xd4d8dc,
        roughness: 0.86,
        metalness: 0.04,
      }),
      socket: new THREE.MeshStandardMaterial({
        color: 0x9aa0a8,
        roughness: 0.78,
        metalness: 0.12,
      }),
      bulb: new THREE.MeshStandardMaterial({
        color: 0xfff4e8,
        emissive: new THREE.Color(1, 0.98, 0.92),
        emissiveIntensity: 5.4,
        roughness: 0.28,
        metalness: 0,
        toneMapped: false,
      }),
    };
  }
  return { geometries: sharedProxyGeometries, materials: sharedProxyMaterials };
}

function disposeCorridorCeilingLightProxyAssets(): void {
  sharedProxyGeometries?.ring.dispose();
  sharedProxyGeometries?.housing.dispose();
  sharedProxyGeometries?.socket.dispose();
  sharedProxyGeometries?.bulb.dispose();
  sharedProxyGeometries = null;
  sharedProxyMaterials?.housing.dispose();
  sharedProxyMaterials?.socket.dispose();
  sharedProxyMaterials?.bulb.dispose();
  sharedProxyMaterials = null;
}

function addProxyMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function createCorridorCeilingLightProxyVisual(): THREE.Group {
  const { geometries, materials } = corridorCeilingLightProxyAssets();
  const visual = new THREE.Group();
  visual.name = "fp_corridor_ceiling_light_proxy";

  const housing = addProxyMesh(
    visual,
    geometries.housing,
    materials.housing,
    "fp_corridor_ceiling_housing",
  );
  housing.position.y = -PROXY_HOUSING_HEIGHT * 0.5;

  const ring = addProxyMesh(
    visual,
    geometries.ring,
    materials.housing,
    "fp_corridor_ceiling_trim",
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -PROXY_HOUSING_HEIGHT;

  const socket = addProxyMesh(
    visual,
    geometries.socket,
    materials.socket,
    "fp_corridor_ceiling_socket",
  );
  socket.position.y = -PROXY_HOUSING_HEIGHT - PROXY_SOCKET_HEIGHT * 0.5;

  const bulb = addProxyMesh(
    visual,
    geometries.bulb,
    materials.bulb,
    "fp_corridor_ceiling_bulb",
  );
  bulb.position.y = PROXY_BULB_CENTER_Y;

  return visual;
}

function applyCorridorDecorRootScale(
  root: THREE.Group,
  placement: FpFloor19CorridorDecorPlacement,
): void {
  const scale = resolveOwnedApartmentDecorRootScale({
    uniformScale: placement.uniformScale,
    verticalScaleMul: placement.verticalScaleMul,
    scaleX: placement.scaleX,
    scaleY: placement.scaleY,
    scaleZ: placement.scaleZ,
  });
  root.scale.set(scale.x, scale.y, scale.z);
}

function mountCorridorCeilingLightProxy(
  root: THREE.Group,
  placement: FpFloor19CorridorDecorPlacement,
): void {
  const fixtureRoot = new THREE.Group();
  fixtureRoot.name = `fp_floor_19_corridor_light_${placement.id}`;
  fixtureRoot.position.fromArray(placement.position);
  fixtureRoot.rotation.order = "YXZ";
  fixtureRoot.rotation.set(placement.pitchRad, placement.yawRad, placement.rollRad);
  applyCorridorDecorRootScale(fixtureRoot, placement);
  fixtureRoot.userData[MAMMOTH_CORRIDOR_CEILING_LIGHT_PROXY_UD] = true;
  fixtureRoot.userData.mammothSkipFloorGeometryMerge = true;
  fixtureRoot.userData.mammothNoCollision = true;

  fixtureRoot.add(createCorridorCeilingLightProxyVisual());
  root.add(fixtureRoot);
}

export function syncFpFloor19CorridorCeilingLightVisibility(
  decorRoot: THREE.Object3D | null | undefined,
  input: {
    insideResidentialUnit: boolean;
    insideApartmentInteriorLightingZone: boolean;
  },
): void {
  if (!decorRoot) return;
  decorRoot.visible =
    input.insideApartmentInteriorLightingZone && !input.insideResidentialUnit;
}

export type FpSessionCorridorCeilingLightsMount = {
  ready: Promise<void>;
  dispose: () => void;
};

export function mountFpFloor19CorridorCeilingLights(args: {
  buildingRoot: THREE.Group;
}): FpSessionCorridorCeilingLightsMount {
  if (!ENABLE_CORRIDOR_CEILING_LIGHTS) {
    return {
      ready: Promise.resolve(),
      dispose: () => {},
    };
  }

  if (ENABLE_RUNTIME_CORRIDOR_FIXTURE_PRACTICAL_LIGHTS) {
    console.warn(
      "[fpSession] ENABLE_RUNTIME_CORRIDOR_FIXTURE_PRACTICAL_LIGHTS is unsupported — corridor fixtures stay emissive-only",
    );
  }

  const root = new THREE.Group();
  root.name = FP_FLOOR_19_CORRIDOR_DECOR_ROOT_NAME;
  root.userData.mammothPlateLevelIndex = FLOOR_19_GAMEPLAY_LEVEL_INDEX;
  root.userData.mammothSkipFloorGeometryMerge = true;
  args.buildingRoot.add(root);

  let disposed = false;
  const ready = resolveFpFloor19CorridorAuthoringContext()
    .then(({ doc, footprint }) => {
      if (disposed) return;
      const placements = resolveFpFloor19CorridorDecorPlacements({ doc, footprint });
      for (const placement of placements) {
        mountCorridorCeilingLightProxy(root, placement);
      }
    })
    .catch((error: unknown) => {
      console.warn("[fpSession] failed to mount floor 19 corridor ceiling proxies", error);
    });

  return {
    ready,
    dispose: () => {
      disposed = true;
      args.buildingRoot.remove(root);
      disposeStaticWorldObjectTree(root);
      root.clear();
    },
  };
}

/** Test hook — build one proxy visual without mounting the full corridor decor root. */
export function createCorridorCeilingLightProxyVisualForTests(): THREE.Group {
  return createCorridorCeilingLightProxyVisual();
}

/** Test hook — release module-level proxy assets after the last FP session unmounts. */
export function disposeFpCorridorCeilingLightProxyAssetsForTests(): void {
  disposeCorridorCeilingLightProxyAssets();
}
