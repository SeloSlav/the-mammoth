import * as THREE from "three";

const _lightPosScratch = new THREE.Vector3();
const _lightSphereScratch = new THREE.Sphere();

export const FP_PRACTICAL_DECOR_LIGHT_KINDS = [
  "tv",
  "computer",
  "ceiling",
  "chandelier",
  "standing",
  "growOp",
] as const;

export type FpPracticalDecorLightKind = (typeof FP_PRACTICAL_DECOR_LIGHT_KINDS)[number];

export type FpPracticalLightKindBucket = {
  visible: number;
  frustum: number;
};

export type FpPracticalLightCounterResult = {
  visiblePracticalDecorLights: number;
  frustumPracticalDecorLights: number;
  visiblePracticalWindowLights: number;
  frustumPracticalWindowLights: number;
  decorByKind: Record<FpPracticalDecorLightKind, FpPracticalLightKindBucket>;
  /** Active decor lights only (`intensity > 0`), e.g. `tv:1 ceiling:4/2 standing:2`. */
  decorKindBreakdownVis: string;
  /** Frustum counts per kind, e.g. `tv:1 ceiling:2 standing:1`. */
  decorKindBreakdownFr: string;
};

/** Spot/point/wash lights created by {@link mountApartmentPracticalLights}. */
function isApartmentPracticalLightName(name: string): boolean {
  return name.startsWith("apt_") && (name.includes("_light_") || name.includes("_wash_"));
}

function apartmentPracticalLightKindFromName(
  name: string,
): FpPracticalDecorLightKind | "window" | null {
  const match = /^apt_(tv|computer|ceiling|chandelier|standing|growOp|window)_(?:light|wash)_/.exec(
    name,
  );
  if (!match) return null;
  return match[1] as FpPracticalDecorLightKind | "window";
}

function isActivePracticalLight(light: THREE.Light): boolean {
  return light.intensity > 1e-6;
}

function emptyDecorByKind(): Record<FpPracticalDecorLightKind, FpPracticalLightKindBucket> {
  return {
    tv: { visible: 0, frustum: 0 },
    computer: { visible: 0, frustum: 0 },
    ceiling: { visible: 0, frustum: 0 },
    chandelier: { visible: 0, frustum: 0 },
    standing: { visible: 0, frustum: 0 },
    growOp: { visible: 0, frustum: 0 },
  };
}

export function formatFpPracticalDecorLightBreakdown(
  decorByKind: Record<FpPracticalDecorLightKind, FpPracticalLightKindBucket>,
  mode: "visible" | "frustum",
): string {
  const key = mode === "visible" ? "visible" : "frustum";
  const parts: string[] = [];
  for (let i = 0; i < FP_PRACTICAL_DECOR_LIGHT_KINDS.length; i++) {
    const kind = FP_PRACTICAL_DECOR_LIGHT_KINDS[i]!;
    const n = decorByKind[kind][key];
    if (n > 0) parts.push(`${kind}:${n}`);
  }
  return parts.length > 0 ? parts.join(" ") : "(none)";
}

export function countFpSessionPracticalLights(args: {
  scene: THREE.Scene;
  frustum: THREE.Frustum;
  objectVisibleInHierarchy: (obj: THREE.Object3D) => boolean;
}): FpPracticalLightCounterResult {
  let visiblePracticalDecorLights = 0;
  let frustumPracticalDecorLights = 0;
  let visiblePracticalWindowLights = 0;
  let frustumPracticalWindowLights = 0;
  const decorByKind = emptyDecorByKind();

  args.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Light)) return;
    if (!isApartmentPracticalLightName(obj.name)) return;
    if (!isActivePracticalLight(obj)) return;
    if (!args.objectVisibleInHierarchy(obj)) return;

    const kind = apartmentPracticalLightKindFromName(obj.name);
    if (kind === null) return;

    const inFrustum = (() => {
      obj.getWorldPosition(_lightPosScratch);
      _lightSphereScratch.set(_lightPosScratch, 0.35);
      return args.frustum.intersectsSphere(_lightSphereScratch);
    })();

    if (kind === "window") {
      visiblePracticalWindowLights += 1;
      if (inFrustum) frustumPracticalWindowLights += 1;
      return;
    }

    visiblePracticalDecorLights += 1;
    decorByKind[kind].visible += 1;
    if (inFrustum) {
      frustumPracticalDecorLights += 1;
      decorByKind[kind].frustum += 1;
    }
  });

  return {
    visiblePracticalDecorLights,
    frustumPracticalDecorLights,
    visiblePracticalWindowLights,
    frustumPracticalWindowLights,
    decorByKind,
    decorKindBreakdownVis: formatFpPracticalDecorLightBreakdown(decorByKind, "visible"),
    decorKindBreakdownFr: formatFpPracticalDecorLightBreakdown(decorByKind, "frustum"),
  };
}
