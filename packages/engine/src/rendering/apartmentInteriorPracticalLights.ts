import * as THREE from "three";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  type ApartmentDecorEmitterKind,
  type ApartmentUnitWorldBounds,
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
const _glassPosScratch = new THREE.Vector3();

function pointInsideUnitBounds(
  p: THREE.Vector3,
  b: ApartmentUnitWorldBounds,
  padM: number,
): boolean {
  return (
    p.x >= b.minX - padM &&
    p.x <= b.maxX + padM &&
    p.y >= b.minY - padM &&
    p.y <= b.maxY + padM &&
    p.z >= b.minZ - padM &&
    p.z <= b.maxZ + padM
  );
}

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
 * Caller must ensure `mesh.matrixWorld` is current (no redundant update here).
 */
export function apartmentPracticalLightSpecFromWindowGlassMesh(
  mesh: THREE.Mesh,
): ApartmentPracticalLightSpec | null {
  const name = mesh.name;
  if (!name.startsWith("unit_exterior_glass_")) return null;
  mesh.getWorldPosition(_glassPosScratch);
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
  return { kind: "window", position: _glassPosScratch.clone(), direction: worldDir };
}

export function collectApartmentWindowLightSpecsFromRoot(
  root: THREE.Object3D,
  out: ApartmentPracticalLightSpec[],
  opts?: {
    maxWindowLights?: number;
    unitBounds?: ApartmentUnitWorldBounds;
    boundsPadM?: number;
  },
): void {
  const max =
    opts?.maxWindowLights ??
    APARTMENT_INTERIOR_VISUAL_PROFILE.maxWindowPracticalLightsPerUnit;
  if (max <= 0) return;

  root.updateMatrixWorld(true);
  const bounds = opts?.unitBounds;
  const pad = opts?.boundsPadM ?? 0.35;
  let windowCount = 0;

  root.traverse((obj) => {
    if (windowCount >= max) return;
    if (!(obj instanceof THREE.Mesh)) return;
    if (!obj.name.startsWith("unit_exterior_glass_")) return;
    obj.getWorldPosition(_glassPosScratch);
    if (bounds && !pointInsideUnitBounds(_glassPosScratch, bounds, pad)) return;
    const spec = apartmentPracticalLightSpecFromWindowGlassMesh(obj);
    if (!spec) return;
    out.push(spec);
    windowCount++;
  });
}

export function syncApartmentInteriorPracticalLighting(args: {
  lightParent: THREE.Object3D;
  /** Omit or set `maxWindowLights: 0` to skip the building traverse entirely. */
  windowScanRoot?: THREE.Object3D | null;
  maxWindowLights?: number;
  unitBounds?: ApartmentUnitWorldBounds;
  decorGroups: readonly THREE.Object3D[];
  previous?: ApartmentPracticalLightsMount | null;
}): ApartmentPracticalLightsMount {
  args.previous?.dispose();

  const specs: ApartmentPracticalLightSpec[] = [];
  const maxWindow = args.maxWindowLights ?? 0;
  if (args.windowScanRoot && maxWindow > 0) {
    collectApartmentWindowLightSpecsFromRoot(args.windowScanRoot, specs, {
      maxWindowLights: maxWindow,
      unitBounds: args.unitBounds,
    });
  }

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
