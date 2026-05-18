import * as THREE from "three";

/**
 * Tracks materials we mutated so toggling/disposing env textures can rollback safely.
 *
 * Must match the key referenced in {@link bindMammothMetallicReadableEnv}.
 */
export const MAMMOTH_METALLIC_ENV_READABLE_UD =
  "__mammothMetallicReadableEnv" as const;

export type MammothMetallicReadableEnvMeta = true;

/** ~sqrt(metalness) × (1−roughness) — rough but stable across GLB exporters. */
export function mammothSpecularReadabilityWeight(
  metalness: number,
  roughness: number,
): number {
  const m = THREE.MathUtils.clamp(metalness, 0, 1);
  const r = THREE.MathUtils.clamp(roughness, 0, 1);
  return Math.sqrt(m) * (1 - r * 0.92);
}

/**
 * Binds the PMREM CubeUV texture from `scene.environment` onto noticeably metallic PBR materials with
 * raised **`envMapIntensity`**, so highlights stay readable when {@link THREE.Scene.environmentIntensity}
 * is pulled down for gritty / underlit flats.
 *
 * When `envTexture` is `null`, materials tagged via {@link MAMMOTH_METALLIC_ENV_READABLE_UD} are reset
 * (`envMap` cleared, intensity 1) for standard scene-environment sampling.
 *
 * Covers {@link THREE.MeshPhysicalMaterial} (subclass of standard).
 */
export function bindMammothMetallicReadableEnv(
  root: THREE.Object3D,
  envTexture: THREE.Texture | null,
): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = ([] as THREE.Material[]).concat(
      mesh.material as THREE.Material | THREE.Material[],
    );
    for (const raw of list) {
      if (!(raw instanceof THREE.MeshStandardMaterial)) continue;
      tieMetallicStandard(raw, envTexture);
    }
  });
}

function tieMetallicStandard(
  m: THREE.MeshStandardMaterial,
  envTexture: THREE.Texture | null,
): void {
  const w = mammothSpecularReadabilityWeight(m.metalness, m.roughness);
  /** Below this, treat as matte — inherits low `scene.environmentIntensity` alone. */
  const gate = m.metalnessMap != null ? 0.065 : 0.11;

  const tagged = Boolean(
    m.userData[MAMMOTH_METALLIC_ENV_READABLE_UD as keyof typeof m.userData],
  );

  if (!envTexture || w < gate) {
    if (tagged) {
      m.envMap = null;
      m.envMapIntensity = 1;
      delete m.userData[MAMMOTH_METALLIC_ENV_READABLE_UD as keyof typeof m.userData];
      m.needsUpdate = true;
    }
    return;
  }

  m.envMap = envTexture;
  m.envMapIntensity = THREE.MathUtils.clamp(
    0.85 + THREE.MathUtils.smootherstep(w, gate, 0.92) * 2.85,
    1.08,
    3.05,
  );
  (
    m.userData as {
      [MAMMOTH_METALLIC_ENV_READABLE_UD]?: MammothMetallicReadableEnvMeta;
    }
  )[MAMMOTH_METALLIC_ENV_READABLE_UD] = true;
  m.needsUpdate = true;
}
