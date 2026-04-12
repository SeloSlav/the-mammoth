import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { FP_OUTDOOR_GROUND_VISUAL_Y } from "@the-mammoth/world";

/**
 * Outdoor FP backdrop: procedural sky, horizon fog, infinite ground plane, and sun-matched lights.
 * Keeps {@link mountFpSession} focused on session lifecycle (net, input, sim) vs scene authoring.
 */
export function attachFpSessionEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): () => void {
  scene.background = null;

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  const sky = new Sky();
  sky.name = "fp_session_sky";
  sky.scale.setScalar(450000);
  const skyU = sky.material.uniforms;
  skyU["turbidity"]!.value = 8;
  skyU["rayleigh"]!.value = 2.35;
  skyU["mieCoefficient"]!.value = 0.0045;
  skyU["mieDirectionalG"]!.value = 0.86;
  const sunDir = new THREE.Vector3();
  const sunElevationDeg = 58;
  const sunAzimuthDeg = 218;
  sunDir.setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - sunElevationDeg),
    THREE.MathUtils.degToRad(sunAzimuthDeg),
  );
  (skyU["sunPosition"]!.value as THREE.Vector3).copy(sunDir);
  scene.add(sky);

  scene.fog = new THREE.Fog(0xb8d4f0, 45, 520);

  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshLambertMaterial({ color: 0x4d5f4a }),
  );
  groundPlane.name = "fp_session_ground_plane";
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = FP_OUTDOOR_GROUND_VISUAL_Y;
  scene.add(groundPlane);

  /** Single outdoor rig: sky fill + sun key (no extra ambient layer). */
  const hemi = new THREE.HemisphereLight(0x9ec8f5, 0x4a5a48, 0.78);
  const dir = new THREE.DirectionalLight(0xfff5ea, 1.22);
  dir.position.copy(sunDir.clone().multiplyScalar(120));
  scene.add(hemi, dir);

  const disposeMaterial = (m: THREE.Material | THREE.Material[]) => {
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m.dispose();
  };

  return () => {
    scene.remove(sky);
    sky.geometry.dispose();
    disposeMaterial(sky.material);

    scene.remove(groundPlane);
    groundPlane.geometry.dispose();
    disposeMaterial(groundPlane.material);

    scene.remove(hemi, dir);
    hemi.dispose();
    dir.dispose();

    scene.fog = null;
  };
}
