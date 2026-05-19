import * as THREE from "three";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  type ApartmentDecorEmitterKind,
  apartmentDecorEmitterKindFromModelPath,
} from "./apartmentInteriorVisualProfile.js";

export type ApartmentPracticalLightKind = "window" | ApartmentDecorEmitterKind;

export type ApartmentPracticalLightSpec = {
  kind: ApartmentPracticalLightKind;
  position: THREE.Vector3;
  /** Window + TV spots — emission direction in world space. */
  direction?: THREE.Vector3;
};

const _scratchDir = new THREE.Vector3();
const _decorBoxScratch = new THREE.Box3();
const _decorCenterScratch = new THREE.Vector3();
const _decorSizeScratch = new THREE.Vector3();
const _decorQuatScratch = new THREE.Quaternion();

export function apartmentPracticalLightSpecFromDecorGroup(
  group: THREE.Object3D,
  modelRelPath: string,
): ApartmentPracticalLightSpec | null {
  const kind = apartmentDecorEmitterKindFromModelPath(modelRelPath);
  if (!kind) return null;

  group.updateMatrixWorld(true);

  if (kind === "tv") {
    _decorBoxScratch.setFromObject(group);
    if (_decorBoxScratch.isEmpty()) return null;
    _decorBoxScratch.getCenter(_decorCenterScratch);
    group.getWorldQuaternion(_decorQuatScratch);
    _scratchDir.set(0, 0, 1).applyQuaternion(_decorQuatScratch);
    _scratchDir.y = 0;
    if (_scratchDir.lengthSq() < 1e-6) {
      _scratchDir.set(0, 0, 1);
    }
    _scratchDir.normalize();
    _decorBoxScratch.getSize(_decorSizeScratch);
    const screenInset = Math.max(0.035, _decorSizeScratch.z * 0.12);
    _decorCenterScratch.addScaledVector(_scratchDir, screenInset);
    return {
      kind: "tv",
      position: _decorCenterScratch.clone(),
      direction: _scratchDir.clone(),
    };
  }

  group.getWorldPosition(_decorCenterScratch);
  return {
    kind,
    position: _decorCenterScratch.clone(),
  };
}

/** @deprecated Prefer {@link apartmentPracticalLightSpecFromDecorGroup} for oriented emitters. */
export function apartmentPracticalLightSpecFromDecor(args: {
  modelRelPath: string;
  worldPosition: THREE.Vector3;
}): ApartmentPracticalLightSpec | null {
  const kind = apartmentDecorEmitterKindFromModelPath(args.modelRelPath);
  if (!kind) return null;
  return {
    kind,
    position: args.worldPosition.clone(),
  };
}

/**
 * Window glass meshes are named `unit_exterior_glass_{face}_{index}` — derive an inward spot.
 */
export function apartmentPracticalLightSpecFromWindowGlassMesh(
  mesh: THREE.Mesh,
): ApartmentPracticalLightSpec | null {
  const name = mesh.name;
  if (!name.startsWith("unit_exterior_glass_")) return null;
  mesh.updateMatrixWorld(true);
  const pos = new THREE.Vector3();
  mesh.getWorldPosition(pos);
  const face = name.split("_")[3] as "e" | "w" | "n" | "s" | undefined;
  const localDir = _scratchDir.set(0, -0.08, 0);
  switch (face) {
    case "e":
      localDir.set(-1, -0.06, 0);
      break;
    case "w":
      localDir.set(1, -0.06, 0);
      break;
    case "n":
      localDir.set(0, -0.06, -1);
      break;
    case "s":
      localDir.set(0, -0.06, 1);
      break;
    default:
      return null;
  }
  localDir.normalize();
  const worldDir = localDir.clone().transformDirection(mesh.matrixWorld).normalize();
  return { kind: "window", position: pos, direction: worldDir };
}

export function collectApartmentWindowLightSpecsFromRoot(
  root: THREE.Object3D,
  out: ApartmentPracticalLightSpec[],
): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const spec = apartmentPracticalLightSpecFromWindowGlassMesh(obj);
    if (spec) out.push(spec);
  });
}

export function syncApartmentInteriorPracticalLighting(args: {
  lightParent: THREE.Object3D;
  windowScanRoot: THREE.Object3D;
  decorGroups: readonly THREE.Object3D[];
  previous?: ApartmentPracticalLightsMount | null;
}): ApartmentPracticalLightsMount {
  args.previous?.dispose();

  const specs: ApartmentPracticalLightSpec[] = [];
  collectApartmentWindowLightSpecsFromRoot(args.windowScanRoot, specs);

  for (const group of args.decorGroups) {
    const modelRelPath = group.userData.mammothApartmentDecorModelRelPath;
    if (typeof modelRelPath !== "string") continue;
    const spec = apartmentPracticalLightSpecFromDecorGroup(group, modelRelPath);
    if (spec) specs.push(spec);
  }

  return mountApartmentPracticalLights(args.lightParent, specs);
}

export type ApartmentPracticalLightsMount = {
  root: THREE.Group;
  dispose: () => void;
};

export function mountApartmentPracticalLights(
  parent: THREE.Object3D,
  specs: readonly ApartmentPracticalLightSpec[],
): ApartmentPracticalLightsMount {
  const root = new THREE.Group();
  root.name = "apartment_interior_practical_lights";

  const profile = APARTMENT_INTERIOR_VISUAL_PROFILE.practical;

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    if (
      (spec.kind === "window" || spec.kind === "tv") &&
      spec.direction
    ) {
      const p = spec.kind === "tv" ? profile.tv : profile.window;
      const spot = new THREE.SpotLight(
        p.color,
        p.intensity,
        p.distance,
        p.angle,
        p.penumbra,
        p.decay,
      );
      spot.name = `apt_${spec.kind}_light_${i}`;
      spot.position.copy(spec.position);
      spot.target.position.copy(spec.position).add(spec.direction);
      spot.castShadow = false;
      root.add(spot);
      root.add(spot.target);
      continue;
    }

    const params =
      spec.kind === "chandelier" ? profile.chandelier : profile.ceiling;
    const point = new THREE.PointLight(
      params.color,
      params.intensity,
      params.distance,
      params.decay,
    );
    point.name = `apt_${spec.kind}_light_${i}`;
    point.position.copy(spec.position);
    point.castShadow = false;
    root.add(point);
  }

  parent.add(root);

  return {
    root,
    dispose: () => {
      parent.remove(root);
      root.clear();
    },
  };
}
