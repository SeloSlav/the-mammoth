import * as THREE from "three";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  type ApartmentUnitWorldBounds,
} from "./apartmentInteriorVisualProfile.js";
import type { ApartmentPracticalLightSpec } from "./apartmentInteriorPracticalLights.js";
import { collectApartmentInteriorPracticalLightSpecs } from "./apartmentInteriorPracticalLights.js";

const _colorScratch = new THREE.Color();
const _accumScratch = new THREE.Color();
const _toLightScratch = new THREE.Vector3();
const _bounceDirScratch = new THREE.Vector3(-18, 42, -28).normalize();

function spotParamsForKind(
  kind: ApartmentPracticalLightSpec["kind"],
): {
  color: THREE.Color;
  intensity: number;
  distance: number;
  angle: number;
  penumbra: number;
  decay: number;
  washIntensity?: number;
  washDistance?: number;
  washDecay?: number;
} | null {
  const profile = APARTMENT_INTERIOR_VISUAL_PROFILE.practical;
  const decay = APARTMENT_INTERIOR_VISUAL_PROFILE.practicalDecay;
  switch (kind) {
    case "window":
      return { ...profile.window, color: new THREE.Color(profile.window.color), decay };
    case "ceiling":
      return {
        ...profile.ceiling,
        color: new THREE.Color(profile.ceiling.color),
        decay: profile.ceiling.decay ?? decay,
      };
    case "growOp":
      return {
        ...profile.growOp,
        color: new THREE.Color(profile.growOp.color),
        decay: profile.growOp.decay ?? decay,
      };
    case "tv":
      return { ...profile.tv, color: new THREE.Color(profile.tv.color), decay };
    case "computer":
      return { ...profile.computer, color: new THREE.Color(profile.computer.color), decay };
    default:
      return null;
  }
}

function pointParamsForKind(kind: ApartmentPracticalLightSpec["kind"]): {
  color: THREE.Color;
  intensity: number;
  distance: number;
  decay: number;
} | null {
  const profile = APARTMENT_INTERIOR_VISUAL_PROFILE.practical;
  const decay = APARTMENT_INTERIOR_VISUAL_PROFILE.practicalDecay;
  if (kind === "chandelier") {
    return {
      color: new THREE.Color(profile.chandelier.color),
      intensity: profile.chandelier.intensity,
      distance: profile.chandelier.distance,
      decay: profile.chandelier.decay ?? decay,
    };
  }
  if (kind === "standing") {
    return {
      color: new THREE.Color(profile.standing.color),
      intensity: profile.standing.intensity,
      distance: profile.standing.distance,
      decay: profile.standing.decay ?? decay,
    };
  }
  return null;
}

function attenuation(dist: number, distance: number, decay: number): number {
  if (distance <= 0 || dist > distance) return 0;
  const t = 1 - dist / distance;
  return Math.pow(Math.max(0, t), decay);
}

function spotConeFactor(
  lightPos: THREE.Vector3,
  worldPos: THREE.Vector3,
  spotDirection: THREE.Vector3,
  angle: number,
  penumbra: number,
): number {
  _toLightScratch.subVectors(worldPos, lightPos);
  const dist = _toLightScratch.length();
  if (dist <= 1e-6) return 1;
  _toLightScratch.multiplyScalar(1 / dist);
  const cosOuter = Math.cos(angle);
  const cosInner = Math.cos(angle * (1 - penumbra));
  const cosAngle = spotDirection.dot(_toLightScratch);
  if (cosAngle <= cosOuter) return 0;
  if (cosAngle >= cosInner) return 1;
  return (cosAngle - cosOuter) / Math.max(1e-6, cosInner - cosOuter);
}

function evaluatePracticalSpec(
  out: THREE.Color,
  worldPos: THREE.Vector3,
  worldNormal: THREE.Vector3,
  spec: ApartmentPracticalLightSpec,
): void {
  _toLightScratch.subVectors(spec.position, worldPos);
  const dist = _toLightScratch.length();
  if (dist <= 1e-6) return;
  _toLightScratch.multiplyScalar(1 / dist);
  const nDotL = Math.max(0, worldNormal.dot(_toLightScratch));

  if (spec.direction) {
    const params = spotParamsForKind(spec.kind);
    if (!params) return;
    const cone = spotConeFactor(
      spec.position,
      worldPos,
      spec.direction,
      params.angle,
      params.penumbra,
    );
    const atten = attenuation(dist, params.distance, params.decay);
    const w = params.intensity * atten * cone * nDotL;
    if (w <= 0) return;
    _colorScratch.copy(params.color).multiplyScalar(w);
    out.add(_colorScratch);

    if (
      (spec.kind === "ceiling" || spec.kind === "growOp") &&
      params.washIntensity != null &&
      params.washIntensity > 0
    ) {
      const washAtten = attenuation(
        dist,
        params.washDistance ?? params.distance,
        params.washDecay ?? params.decay,
      );
      const washW = params.washIntensity * washAtten * nDotL;
      if (washW > 0) {
        _colorScratch.copy(params.color).multiplyScalar(washW);
        out.add(_colorScratch);
      }
    }
    return;
  }

  const point = pointParamsForKind(spec.kind);
  if (!point) return;
  const atten = attenuation(dist, point.distance, point.decay);
  const w = point.intensity * atten * nDotL;
  if (w <= 0) return;
  _colorScratch.copy(point.color).multiplyScalar(w);
  out.add(_colorScratch);
}

/** Interior bounce + static practical specs at full in-unit blend. */
export function evaluateApartmentShellLightingAtPoint(args: {
  worldPos: THREE.Vector3;
  worldNormal: THREE.Vector3;
  specs: readonly ApartmentPracticalLightSpec[];
  includeBounce?: boolean;
  interiorExposure?: number;
}): THREE.Color {
  const out = _accumScratch.setRGB(0, 0, 0);
  if (args.includeBounce !== false) {
    const bounce = APARTMENT_INTERIOR_VISUAL_PROFILE.interiorBounce;
    const hemi = bounce.hemiIntensity;
    _colorScratch.setHex(bounce.hemiSky).multiplyScalar(hemi);
    out.add(_colorScratch);
    _colorScratch.setHex(bounce.fill).multiplyScalar(bounce.fillIntensity);
    out.add(_colorScratch);
    const nDotDir = Math.max(0, args.worldNormal.dot(_bounceDirScratch));
    _colorScratch.setHex(bounce.dir).multiplyScalar(bounce.dirIntensity * nDotDir);
    out.add(_colorScratch);
  }

  for (const spec of args.specs) {
    evaluatePracticalSpec(out, args.worldPos, args.worldNormal, spec);
  }

  const exposure =
    args.interiorExposure ?? APARTMENT_INTERIOR_VISUAL_PROFILE.exposure.interior;
  out.multiplyScalar(exposure);
  return out.clone();
}

export function collectApartmentShellBakeLightSpecs(args: {
  decorGroups: readonly THREE.Object3D[];
  windowScanRoot?: THREE.Object3D | null;
  unitBounds?: ApartmentUnitWorldBounds;
  maxWindowLights?: number;
}): ApartmentPracticalLightSpec[] {
  return collectApartmentInteriorPracticalLightSpecs({
    decorGroups: args.decorGroups,
    windowScanRoot: args.windowScanRoot,
    unitBounds: args.unitBounds,
    maxWindowLights:
      args.maxWindowLights ??
      APARTMENT_INTERIOR_VISUAL_PROFILE.maxWindowPracticalLightsPerUnit,
    includeDynamicDecorPracticalLights: false,
    includeStaticFixturePracticalLights: true,
  });
}
