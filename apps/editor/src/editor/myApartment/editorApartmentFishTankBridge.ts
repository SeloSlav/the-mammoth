import * as THREE from "three";
import {
  APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH,
  mountApartmentFishTankSchool,
  type FishTankFishSwimUpdater,
} from "@the-mammoth/world";

const MAX_DT = 0.055;

export type EditorApartmentFishTankBridge = {
  clear: () => void;
  hasActiveSchools: () => boolean;
  tick: (dt: number) => void;
  tryMountOnTankVisual: (opts: {
    decorModelRelPath: string;
    tankVisualRoot: THREE.Object3D;
    decorId: string;
    fishTemplateRoot?: THREE.Object3D;
    decorateSwimmerMesh: (mesh: THREE.Mesh) => void;
    onFirstSchoolMounted?: () => void;
  }) => void;
  removeByDecorId: (decorId: string) => void;
};

export function createEditorApartmentFishTankBridge(): EditorApartmentFishTankBridge {
  const schoolsByKey = new Map<string, FishTankFishSwimUpdater>();

  return {
    clear() {
      schoolsByKey.clear();
    },
    hasActiveSchools() {
      return schoolsByKey.size > 0;
    },
    tick(dt: number) {
      if (schoolsByKey.size === 0 || dt <= 0) return;
      const capped = dt > MAX_DT ? MAX_DT : dt;
      for (const school of schoolsByKey.values()) {
        school.update(capped);
      }
    },
    tryMountOnTankVisual(opts) {
      const stableKey = `editor-my-apartment:${opts.decorId}`;
      const hadSchools = schoolsByKey.size > 0;
      const school = mountApartmentFishTankSchool({
        tankModelRelPath: opts.decorModelRelPath,
        tankVisualRoot: opts.tankVisualRoot,
        stableKey,
        fishTemplateRoot: opts.fishTemplateRoot,
        decorateSwimmerMesh: opts.decorateSwimmerMesh,
      });
      if (!school) {
        schoolsByKey.delete(stableKey);
        return;
      }
      schoolsByKey.set(stableKey, school);
      if (!hadSchools) opts.onFirstSchoolMounted?.();
    },
    removeByDecorId(decorId: string) {
      schoolsByKey.delete(`editor-my-apartment:${decorId}`);
    },
  };
}

export { APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH };
