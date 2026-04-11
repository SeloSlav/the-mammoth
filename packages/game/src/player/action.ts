/**
 * Discrete gameplay action channel (not animation clip names).
 * Drives animation intent and future state machines.
 */
export type PlayerPrimaryAction =
  | "none"
  | "melee_primary"
  | "interact"
  | "reload"
  | "aim";

/** Health / terminal / death are reserved for later tables + reducers. */
export type PlayerLifePhase = "alive" | "dead";
