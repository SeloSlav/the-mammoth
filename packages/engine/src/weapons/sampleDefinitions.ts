import type { WeaponDefinition } from "./weaponTypes.js";
import crowbarPresentationJson from "../../../../content/weapons/crowbar.presentation.json" with {
  type: "json",
};
import knifePresentationJson from "../../../../content/weapons/knife.presentation.json" with {
  type: "json",
};
import srbosjekPresentationJson from "../../../../content/weapons/srbosjek.presentation.json" with {
  type: "json",
};
import baseballBatPresentationJson from "../../../../content/weapons/baseball-bat.presentation.json" with {
  type: "json",
};
import pistolPresentationJson from "../../../../content/weapons/pistol.presentation.json" with {
  type: "json",
};
import shotgunCoachPresentationJson from "../../../../content/weapons/shotgun-coach.presentation.json" with {
  type: "json",
};
import screwdriverPresentationJson from "../../../../content/weapons/screwdriver.presentation.json" with {
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

const pistolPrimitivePresentationBundled = parseWeaponPrimitivePresentationDoc(pistolPresentationJson);

const shotgunCoachPrimitivePresentationBundled = parseWeaponPrimitivePresentationDoc(
  shotgunCoachPresentationJson,
);

const screwdriverPrimitivePresentationBundled = parseWeaponPrimitivePresentationDoc(
  screwdriverPresentationJson,
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
  id: "baseball-bat",
  displayName: "Baseball bat",
  primitivePresentation: baseballBatPrimitivePresentationBundled,
  modelRef: {
    kind: "gltf",
    key: "weapons/baseball-bat",
    uri: "/static/models/weapons/baseball-bat.glb",
  },
  animationSet: {
    idle: "baseball_bat_idle",
    attack_light: "baseball_bat_swing_light",
    attack_heavy: "baseball_bat_swing_heavy",
    inspect: "baseball_bat_inspect",
  },
  primitiveSwingDurationS: 0.5,
};

export const pistolWeaponDefinition: WeaponDefinition = {
  id: "pistol",
  displayName: "Pistol",
  primitivePresentation: pistolPrimitivePresentationBundled,
  modelRef: {
    kind: "gltf",
    key: "weapons/pistol",
    uri: "/static/models/weapons/pistol.glb",
  },
  animationSet: {
    idle: "pistol_idle",
    attack_light: "pistol_melee_stub",
  },
  primitiveSwingDurationS: 0.32,
};

export const shotgunCoachWeaponDefinition: WeaponDefinition = {
  id: "shotgun-coach",
  displayName: "Coach shotgun",
  primitivePresentation: shotgunCoachPrimitivePresentationBundled,
  modelRef: {
    kind: "gltf",
    key: "weapons/shotgun-coach",
    uri: "/static/models/weapons/shotgun-coach.glb",
  },
  animationSet: {
    idle: "shotgun_idle",
    attack_light: "shotgun_melee_stub",
    attack_heavy: "shotgun_swing_heavy",
    inspect: "shotgun_inspect",
  },
  primitiveSwingDurationS: 0.52,
};

export const screwdriverWeaponDefinition: WeaponDefinition = {
  id: "screwdriver",
  displayName: "Screwdriver",
  primitivePresentation: screwdriverPrimitivePresentationBundled,
  modelRef: {
    kind: "gltf",
    key: "weapons/screwdriver",
    uri: "/static/models/weapons/screwdriver.glb",
  },
  animationSet: {
    idle: "screwdriver_idle",
    attack_light: "screwdriver_stab",
  },
  primitiveSwingDurationS: 0.3,
};
