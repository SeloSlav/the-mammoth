import type { WeaponDefinition } from "./weaponTypes.js";
import type { WeaponPrimitivePresentationDoc } from "./weaponPrimitiveAuthoring.js";
import crowbarPresentationJson from "../../../../content/weapons/crowbar.presentation.json" with {
  type: "json",
};
import knifePresentationJson from "../../../../content/weapons/knife.presentation.json" with {
  type: "json",
};
import srbosjekPresentationJson from "../../../../content/weapons/srbosjek.presentation.json" with {
  type: "json",
};
import baseballBatPresentationJson from "../../../../content/weapons/baseball_bat.presentation.json" with {
  type: "json",
};
import { parseWeaponPrimitivePresentationDoc } from "./weaponPrimitiveAuthoring.js";

const crowbarPrimitivePresentationBundled = parseWeaponPrimitivePresentationDoc(
  crowbarPresentationJson,
);

const knifePrimitivePresentationBundled = parseWeaponPrimitivePresentationDoc(
  knifePresentationJson,
);

const srbosjekPrimitivePresentationBundled = parseWeaponPrimitivePresentationDoc(
  srbosjekPresentationJson,
);

const baseballBatPrimitivePresentationBundled = parseWeaponPrimitivePresentationDoc(
  baseballBatPresentationJson,
);

export const crowbarWeaponDefinition: WeaponDefinition = {
  id: "crowbar",
  displayName: "Crowbar",
  primitivePresentation: crowbarPrimitivePresentationBundled,
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
  primitivePresentation: knifePrimitivePresentationBundled,
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

export const srbosjekWeaponDefinition: WeaponDefinition = {
  id: "srbosjek",
  displayName: "Šrbosjek",
  /** Gloved weapon mesh replaces the FP stock hand. */
  fpHidesHandMesh: true,
  primitivePresentation: srbosjekPrimitivePresentationBundled,
  modelRef: {
    kind: "gltf",
    key: "weapons/srbosjek",
    uri: "/static/models/weapons/srbosjek.glb",
  },
  animationSet: {
    idle: "srbosjek_idle",
    attack_light: "srbosjek_swing_light",
    attack_heavy: "srbosjek_swing_heavy",
    inspect: "srbosjek_inspect",
  },
  primitiveSwingDurationS: 0.48,
};

export const baseballBatWeaponDefinition: WeaponDefinition = {
  id: "baseball_bat",
  displayName: "Baseball bat",
  primitivePresentation: baseballBatPrimitivePresentationBundled,
  modelRef: {
    kind: "gltf",
    key: "weapons/baseball_bat",
    uri: "/static/models/weapons/baseball_bat.glb",
  },
  animationSet: {
    idle: "baseball_bat_idle",
    attack_light: "baseball_bat_swing_light",
    attack_heavy: "baseball_bat_swing_heavy",
    inspect: "baseball_bat_inspect",
  },
  primitiveSwingDurationS: 0.5,
};
