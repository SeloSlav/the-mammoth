import * as THREE from "three";
import {
  attachApartmentWarmFixtureBulbGlow,
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

export function applyMammothStairwellCeilingFixtureVisual(
  root: THREE.Object3D,
  modelRelPath: string,
): void {
  root.userData.mammothApartmentDecorProp = true;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    moodGradeMammothApartmentDecorMesh(obj, { modelRelPath });
    obj.userData.mammothUnitInterior = true;
    const mat = obj.material;
    const mats = Array.isArray(mat) ? mat : [mat];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      if (m.emissiveIntensity > 0) {
        m.emissiveIntensity *= STAIRWELL_FIXTURE_EMISSIVE_MUL;
      }
    }
  });
  attachApartmentWarmFixtureBulbGlow(root, modelRelPath);
  tagApartmentDecorPropMeshesForInteriorLighting(root);
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

export function syncMammothStairwellCeilingFixturePresentation(args: {
  buildingRoot: THREE.Object3D;
  lightParent: THREE.Object3D;
  previous?: ApartmentPracticalLightsMount | null;
}): ApartmentPracticalLightsMount {
  const decorGroups: THREE.Group[] = [];
  args.buildingRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Group)) return;
    if (obj.userData.mammothStairwellCeilingLight !== true) return;
    const modelRelPath = obj.userData.mammothApartmentDecorModelRelPath;
    if (typeof modelRelPath !== "string") return;
    applyMammothStairwellCeilingFixtureVisual(obj, modelRelPath);
    decorGroups.push(obj);
  });

  const mount = syncApartmentInteriorPracticalLighting({
    lightParent: args.lightParent,
    maxWindowLights: 0,
    decorGroups,
    previous: args.previous,
  });
  brightenStairwellPracticalLights(mount);
  return mount;
}
