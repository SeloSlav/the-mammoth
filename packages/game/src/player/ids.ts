/** Hex-encoded SpacetimeDB `Identity` string (64 hex chars) or synthetic mock ids. */
export type PlayerIdHex = string;

/** Item / weapon archetype id (authoring + runtime). Not a unique instance id. Kebab-case. */
export type HeldItemId =
  | "unarmed"
  | "crowbar"
  | "knife"
  | "srbosjek"
  | "baseball-bat"
  | "pistol"
  | "shotgun-coach"
  | "screwdriver";
