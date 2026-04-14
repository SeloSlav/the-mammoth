import * as THREE from "three";
import { FP_OUTDOOR_GROUND_VISUAL_Y } from "@the-mammoth/world";

/**
 * Outdoor FP backdrop: solid zenith color (WebGPU build has no `Sky` addon — it depends on legacy
 * `UniformsUtils`), horizon fog, infinite ground plane, and sun-matched lights.
 * Keeps {@link mountFpSession} focused on session lifecycle (net, input, sim) vs scene authoring.
 */
export function attachFpSessionEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGPURenderer,
): () => void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  const sunDir = new THREE.Vector3();
  const sunElevationDeg = 58;
  const sunAzimuthDeg = 218;
  sunDir.setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - sunElevationDeg),
    THREE.MathUtils.degToRad(sunAzimuthDeg),
  );

  /** Pastel blue-gray zenith — pairs with fog and hemisphere key (see below). */
  scene.background = new THREE.Color(0xe8edf4);

  /**
   * Hazy horizon — pastel blue-gray, slightly below shell ceilings (~#f1f4f8) so mass still reads.
   */
  scene.fog = new THREE.Fog(0xe4eaf0, 95, 920);

  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({
      color: 0x4d5f4a,
      roughness: 1,
      metalness: 0,
    }),
  );
  groundPlane.name = "fp_session_ground_plane";
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = FP_OUTDOOR_GROUND_VISUAL_Y;
  scene.add(groundPlane);

  /**
   * Vertical shells sit at ~0.5 sky + 0.5 ground in hemisphere diffuse — keep both in the pastel
   * blue-gray band so façades stay airy (not brown/warm mud) at a distance.
   */
  const hemi = new THREE.HemisphereLight(0xf2f6fb, 0xd0d8e2, 0.88);
  const fill = new THREE.AmbientLight(0xe8eef4, 0.14);
  const dir = new THREE.DirectionalLight(0xfff8f2, 1.42);
  dir.position.copy(sunDir.clone().multiplyScalar(120));
  scene.add(hemi, fill, dir);

  const disposeMaterial = (m: THREE.Material | THREE.Material[]) => {
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m.dispose();
  };

  return () => {
    scene.background = null;

    scene.remove(groundPlane);
    groundPlane.geometry.dispose();
    disposeMaterial(groundPlane.material);

    scene.remove(hemi, fill, dir);
    hemi.dispose();
    fill.dispose();
    dir.dispose();

    scene.fog = null;
  };
}
