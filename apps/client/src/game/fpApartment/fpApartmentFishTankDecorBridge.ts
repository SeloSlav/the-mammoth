import * as THREE from "three";
import {
  APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH,
  mountApartmentFishTankSchool,
  type FishTankFishSwimUpdater,
} from "@the-mammoth/world";

const MAX_DT = 0.055;

export type FpApartmentFishTankDecorBridge = {
  clear: () => void;
  hasActiveSchools: () => boolean;
  tick: (dt: number) => void;
  tryMountOnTankVisual: (opts: {
    tankModelRelPath: string;
    tankVisualRoot: THREE.Object3D;
    stableKey: string;
    loadFishTemplate: () => Promise<THREE.Object3D | undefined>;
    decorateSwimmerMesh: (mesh: THREE.Mesh) => void;
    isStale?: () => boolean;
  }) => Promise<void>;
};

export function createFpApartmentFishTankDecorBridge(): FpApartmentFishTankDecorBridge {
  const schools: FishTankFishSwimUpdater[] = [];
  let cachedFishTemplate: THREE.Object3D | undefined;
  let fishTemplateLoadPromise: Promise<THREE.Object3D | undefined> | null = null;

  async function resolveFishTemplate(
    loadFishTemplate: () => Promise<THREE.Object3D | undefined>,
  ): Promise<THREE.Object3D | undefined> {
    if (cachedFishTemplate) return cachedFishTemplate;
    if (!fishTemplateLoadPromise) {
      fishTemplateLoadPromise = loadFishTemplate().then((tpl) => {
        cachedFishTemplate = tpl;
        return tpl;
      });
    }
    return fishTemplateLoadPromise;
  }

  return {
    clear() {
      schools.length = 0;
      cachedFishTemplate = undefined;
      fishTemplateLoadPromise = null;
    },
    hasActiveSchools() {
      return schools.length > 0;
    },
    tick(dt: number) {
      if (schools.length === 0 || dt <= 0) return;
      const capped = dt > MAX_DT ? MAX_DT : dt;
      for (let i = 0; i < schools.length; i++) {
        schools[i]!.update(capped);
      }
    },
    async tryMountOnTankVisual(opts) {
      const fishTpl = await resolveFishTemplate(opts.loadFishTemplate);
      if (opts.isStale?.()) return;
      const school = mountApartmentFishTankSchool({
        tankModelRelPath: opts.tankModelRelPath,
        tankVisualRoot: opts.tankVisualRoot,
        stableKey: opts.stableKey,
        fishTemplateRoot: fishTpl,
        decorateSwimmerMesh: opts.decorateSwimmerMesh,
      });
      if (school) schools.push(school);
    },
  };
}

export { APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH };
