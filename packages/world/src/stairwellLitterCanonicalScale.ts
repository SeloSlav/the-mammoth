import {
  defaultOwnedApartmentDecorScaleForModel,
  normalizeOwnedApartmentDecorModelRelPath,
} from "@the-mammoth/schemas";

/** Room-unit radiator canonical scale — stairwell kit uses the same world read. */
export const STAIRWELL_HEATER_ROOM_REFERENCE_MODEL_PATH =
  "static/models/objects/heater-room.glb";

export function clientModelUrlToOwnedApartmentDecorRelPath(modelUrl: string): string {
  const trimmed = modelUrl.trim();
  const withoutLeadingSlash = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  return normalizeOwnedApartmentDecorModelRelPath(withoutLeadingSlash);
}

/** Match owned-apartment décor import scale for the same (or paired) GLB. */
export function canonicalOwnedApartmentUniformScaleForClientModelUrl(
  modelUrl: string,
): number {
  return defaultOwnedApartmentDecorScaleForModel(
    clientModelUrlToOwnedApartmentDecorRelPath(modelUrl),
  ).uniformScale;
}

export function canonicalStairwellHeaterUniformScale(): number {
  return defaultOwnedApartmentDecorScaleForModel(
    STAIRWELL_HEATER_ROOM_REFERENCE_MODEL_PATH,
  ).uniformScale;
}

export function canonicalStairwellLandingPropUniformScale(args: {
  modelUrl: string;
  authoredUniformScale?: number;
}): number {
  if (args.authoredUniformScale != null) return args.authoredUniformScale;
  const rel = clientModelUrlToOwnedApartmentDecorRelPath(args.modelUrl);
  if (rel.endsWith("stairwell-heater.glb")) {
    return canonicalStairwellHeaterUniformScale();
  }
  return 1;
}
