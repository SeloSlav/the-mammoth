import type { WeaponDefinition } from "./weaponTypes.js";
import crowbarPresentationJson from "../../../../content/weapons/crowbar.presentation.json" with {
  type: "json",
};
import { parseWeaponPrimitivePresentationDoc } from "./weaponPrimitiveAuthoring.js";

const crowbarPrimitivePresentation = parseWeaponPrimitivePresentationDoc(
  crowbarPresentationJson,
);

/** Sample melee — placeholder geometry + future GLB key. */
export const crowbarWeaponDefinition: WeaponDefinition = {
  id: "crowbar",
  displayName: "Crowbar",
  primitivePresentation: crowbarPrimitivePresentation,
  modelRef: {
    kind: "gltf",
    key: "weapons/crowbar",
    uri: "/static/models/weapons/crowbar.glb",
  },
  animationSet: {
    idle: "crowbar_idle",
    attack_light: "crowbar_swing_light",
    attack_heavy: "crowbar_swing_heavy",
    inspect: "crowbar_inspect",
  },
  primitiveSwingDurationS: 0.46,
};

export const knifeWeaponDefinition: WeaponDefinition = {
  id: "knife",
  displayName: "Knife",
  modelRef: {
    kind: "gltf",
    key: "weapons/knife",
    uri: "/static/models/weapons/knife.glb",
  },
  animationSet: {
    idle: "knife_idle",
    attack_light: "knife_slash",
  },
  primitiveSwingDurationS: 0.28,
};

export const pistolWeaponDefinition: WeaponDefinition = {
  id: "pistol",
  displayName: "Pistol",
  modelRef: {
    kind: "gltf",
    key: "weapons/pistol",
    uri: "/static/models/weapons/pistol.glb",
  },
  animationSet: {
    idle: "pistol_idle",
    aim: "pistol_aim",
    reload: "pistol_reload",
    attack_light: "pistol_fire",
  },
  primitiveSwingDurationS: 0.12,
};
