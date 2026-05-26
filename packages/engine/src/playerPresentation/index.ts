export {
  PlayerPresentationManager,
  type PlayerPresentationManagerOptions,
} from "./PlayerPresentationManager.js";
export {
  FP_VIEWMODEL_DEFAULT_RIG_ROOT_AUTHORED,
  LocalFirstPersonPresenter,
  type LocalFirstPersonPresenterOptions,
  type FpAuthoringPick,
} from "./local/LocalFirstPersonPresenter.js";
export {
  LocalMirrorPlayerPresenter,
  preloadRemotePlayerBody,
  RemoteHeldWeaponPresentation,
  RemotePlayerPresenter,
  WorldPlayerBodyPresenter,
  REMOTE_PLAYER_BODY_URI_FEMALE,
  REMOTE_PLAYER_BODY_URI_MALE,
  REMOTE_PLAYER_CROWD_FULL_DETAIL_NEAREST,
} from "./remote/RemotePlayerPresenter.js";
export {
  CrowdSkinnedPresenter,
  type CrowdSkinnedLodHooks,
} from "./crowd/CrowdSkinnedPresenter.js";
export {
  BabushkaNpcPresenter,
  preloadBabushkaNpcBody,
  BABUSHKA_NPC_GLB_URI,
  BABUSHKA_NPC_DEATH_CLIP_SEC,
} from "../npc/archetypes/babushka/BabushkaNpcPresenter.js";
export {
  WorldNpcPresenterPool,
} from "../npc/WorldNpcPresenterPool.js";
export {
  MAMMOTH_FP_WORLD_NPC_UD,
} from "../npc/npcConstants.js";
export {
  snapNpcModelFeetToLocalGround,
  bindNpcOutdoorReadableEnv,
} from "../npc/npcModelUtils.js";
export { buildPrimitiveHumanoid, type PrimitiveHumanoidParts } from "./primitiveHumanoid.js";
export {
  resolveSkinnedHumanoidHandBone,
  SKINNED_HUMANOID_RIGHT_HAND_BONE_NAMES,
} from "./humanoidAttachmentBones.js";
export { FP_MELEE_HAND_RIGHT } from "./fpViewmodelRefs.js";
export {
  buildWeaponFirstPersonPresentationMergeFromPickList,
  type WeaponFirstPersonAuthoringPresentationMerge,
  type WeaponMountAuthorMerge,
  type WeaponFirstPersonPersistRefs,
} from "./weaponFpAuthoringPresentationMerge.js";
export {
  FP_FIREARM_HITSCAN_RANGE_PISTOL_M,
  FP_FIREARM_HITSCAN_RANGE_SHOTGUN_M,
  FP_FIREARM_HITSCAN_SHOTGUN_PELLET_COUNT,
  FP_FIREARM_HITSCAN_SHOTGUN_SPREAD_RAD,
  fpFirearmHitscanPelletCountForHeldItem,
  fpFirearmHitscanRangeMForHeldItem,
  fpFirearmShotVisualConfigForHeldItem,
  sampleFpFirearmShotVisual,
  type FpFirearmShotVisualConfig,
  type FpFirearmShotVisualSample,
} from "./local/fpFirearmShotVisuals.js";
export {
  FP_FIREARM_RELOAD_KNOCK_PEAK_FRAC,
  FP_FIREARM_RELOAD_LIFT_MAX_M,
  FP_FIREARM_RELOAD_PITCH_MAX_RAD,
  knockWave01,
  sampleFpFirearmReloadVisual,
  type FpFirearmReloadVisualSample,
} from "./local/fpFirearmReloadVisual.js";
export type {
  HitTracePlaceholder,
  MeleeCombatVisualEvent,
  MeleeCombatVisualSink,
} from "./combatVisuals.js";
