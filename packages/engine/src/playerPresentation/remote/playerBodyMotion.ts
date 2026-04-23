import type { LocomotionPresentation } from "@the-mammoth/game";

export type PlayerBodyClipName = "idle" | "walk" | "run" | "jump";

export function resolvePlayerBodyClipName(args: {
  grounded: boolean;
  locomotion: LocomotionPresentation;
}): PlayerBodyClipName {
  if (!args.grounded) return "jump";
  if (args.locomotion === "run") return "run";
  if (args.locomotion === "walk") return "walk";
  return "idle";
}
