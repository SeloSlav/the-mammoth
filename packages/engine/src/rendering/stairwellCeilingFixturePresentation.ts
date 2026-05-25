import * as THREE from "three";
import {
  attachApartmentWarmFixtureBulbGlow,
  MAMMOTH_APARTMENT_DECOR_SKIP_MOOD_GRADE_UD,
  moodGradeMammothApartmentDecorMesh,
} from "./apartmentDecorMoodGrade.js";
import { tagApartmentDecorPropMeshesForInteriorLighting } from "./apartmentInteriorLayers.js";
import {
  syncApartmentInteriorPracticalLighting,
  type ApartmentPracticalLightsMount,
} from "./apartmentInteriorPracticalLights.js";

const STAIRWELL_CEILING_LIGHT_INTENSITY_MUL = 1.9;
const STAIRWELL_CEILING_LIGHT_DISTANCE_MUL = 1.35;
const STAIRWELL_FIXTURE_EMISSIVE_MUL = 1.35;

export const MAMMOTH_STAIRWELL_CEILING_VISUAL_APPLIED_UD =
  "mammothStairwellCeilingVisualApplied";

const MAMMOTH_STAIRWELL_FIXTURE_EMISSIVE_BOOSTED_UD =
  "mammothStairwellFixtureEmissiveBoosted";

export function collectMammothStairwellCeilingDecorGroups(
  buildingRoot: THREE.Object3D,
): THREE.Group[] {
  const decorGroups: THREE.Group[] = [];
  buildingRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Group)) return;
    if (obj.userData.mammothStairwellCeilingLight !== true) return;
    const modelRelPath = obj.userData.mammothApartmentDecorModelRelPath;
    if (typeof modelRelPath !== "string") return;
    decorGroups.push(obj);
  });
  return decorGroups;
}

export function applyMammothStairwellCeilingFixtureVisual(
  root: THREE.Object3D,
  modelRelPath: string,
): void {
  root.userData.mammothApartmentDecorProp = true;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    moodGradeMammothApartmentDecorMesh(obj, { modelRelPath });
    obj.userData.mammothUnitInterior = true;
    obj.userData[MAMMOTH_APARTMENT_DECOR_SKIP_MOOD_GRADE_UD] = true;
    if (obj.userData[MAMMOTH_STAIRWELL_FIXTURE_EMISSIVE_BOOSTED_UD] === true) return;
    const mat = obj.material;
    const mats = Array.isArray(mat) ? mat : [mat];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      if (m.emissiveIntensity > 0) {
        m.emissiveIntensity *= STAIRWELL_FIXTURE_EMISSIVE_MUL;
      }
    }
    obj.userData[MAMMOTH_STAIRWELL_FIXTURE_EMISSIVE_BOOSTED_UD] = true;
  });
  attachApartmentWarmFixtureBulbGlow(root, modelRelPath);
  tagApartmentDecorPropMeshesForInteriorLighting(root);
}

/** Idempotent mood-grade + interior layer tagging for every stairwell ceiling wrap. */
export function ensureMammothStairwellCeilingFixtureVisuals(
  buildingRoot: THREE.Object3D,
): THREE.Group[] {
  const decorGroups = collectMammothStairwellCeilingDecorGroups(buildingRoot);
  for (const group of decorGroups) {
    const modelRelPath = group.userData.mammothApartmentDecorModelRelPath as string;
    if (group.userData[MAMMOTH_STAIRWELL_CEILING_VISUAL_APPLIED_UD] === true) continue;
    applyMammothStairwellCeilingFixtureVisual(group, modelRelPath);
    group.userData[MAMMOTH_STAIRWELL_CEILING_VISUAL_APPLIED_UD] = true;
  }
  return decorGroups;
}

function brightenStairwellPracticalLights(mount: ApartmentPracticalLightsMount): void {
  mount.root.traverse((obj) => {
    if (!(obj instanceof THREE.Light)) return;
    obj.intensity *= STAIRWELL_CEILING_LIGHT_INTENSITY_MUL;
    if ("distance" in obj && typeof obj.distance === "number") {
      obj.distance *= STAIRWELL_CEILING_LIGHT_DISTANCE_MUL;
    }
  });
}

export function syncMammothStairwellCeilingPracticalLights(args: {
  lightParent: THREE.Object3D;
  decorGroups: readonly THREE.Object3D[];
  previous?: ApartmentPracticalLightsMount | null;
}): ApartmentPracticalLightsMount | null {
  if (args.decorGroups.length === 0) {
    args.previous?.dispose();
    return null;
  }

  const mount = syncApartmentInteriorPracticalLighting({
    lightParent: args.lightParent,
    maxWindowLights: 0,
    decorGroups: args.decorGroups,
    previous: args.previous,
  });
  brightenStairwellPracticalLights(mount);
  return mount;
}

export function syncMammothStairwellCeilingFixturePresentation(args: {
  buildingRoot: THREE.Object3D;
  lightParent: THREE.Object3D;
  previous?: ApartmentPracticalLightsMount | null;
  /** When set, only these groups receive practical lights (FP uses visible shaft fixtures). */
  practicalDecorGroups?: readonly THREE.Object3D[];
}): ApartmentPracticalLightsMount | null {
  ensureMammothStairwellCeilingFixtureVisuals(args.buildingRoot);
  const decorGroups =
    args.practicalDecorGroups ?? collectMammothStairwellCeilingDecorGroups(args.buildingRoot);
  return syncMammothStairwellCeilingPracticalLights({
    lightParent: args.lightParent,
    decorGroups,
    previous: args.previous ?? null,
  });
}
