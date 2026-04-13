export { PlayerPresentationManager, type PlayerPresentationManagerOptions } from "./PlayerPresentationManager.js";
export {
  FP_VIEWMODEL_DEFAULT_RIG_ROOT_AUTHORED,
  LocalFirstPersonPresenter,
  type LocalFirstPersonPresenterOptions,
  type FpAuthoringPick,
} from "./local/LocalFirstPersonPresenter.js";
export { RemotePlayerPresenter } from "./remote/RemotePlayerPresenter.js";
export { buildPrimitiveHumanoid, type PrimitiveHumanoidParts } from "./primitiveHumanoid.js";
export { FP_MELEE_HAND_RIGHT } from "./fpViewmodelRefs.js";
export type {
  HitTracePlaceholder,
  MeleeCombatVisualEvent,
  MeleeCombatVisualSink,
} from "./combatVisuals.js";
