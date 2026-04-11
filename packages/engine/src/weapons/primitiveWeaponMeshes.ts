import * as THREE from "three";

const DEG2RAD = THREE.MathUtils.DEG2RAD;

/**
 * Placeholder crowbar: hex shaft + bent hook + flat pry tip (readable in FP).
 * Hook opens toward **−X** in local space (opposite of the old +X stub).
 * `color` tints the painted shaft; steel bits stay neutral for a worn two-tone read.
 */
export function createCrowbarPrimitive(color: number): THREE.Group {
  const root = new THREE.Group();

  const paint = new THREE.Color(color);
  const matPaint = new THREE.MeshStandardMaterial({
    color: paint,
    metalness: 0.18,
    roughness: 0.64,
    flatShading: true,
  });
  const matSteel = new THREE.MeshStandardMaterial({
    color: 0x7a828a,
    metalness: 0.58,
    roughness: 0.4,
    flatShading: true,
  });
  const matPry = new THREE.MeshStandardMaterial({
    color: 0x4d545c,
    metalness: 0.72,
    roughness: 0.32,
    flatShading: true,
  });

  const shaftH = 0.44;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.025, shaftH, 6, 1, false),
    matPaint,
  );
  shaft.position.set(0, -0.12, 0);
  shaft.castShadow = true;

  const hookRoot = new THREE.Group();
  hookRoot.position.set(0, shaftH * 0.5, 0);

  // Junction / heel (bends away from shaft toward −X)
  const heel = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.062, 0.054), matSteel);
  heel.position.set(-0.026, 0.024, 0);
  heel.castShadow = true;

  // Curved leg of the hook
  const bend = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.038, 0.052), matSteel);
  bend.position.set(-0.092, 0.066, 0);
  bend.rotation.z = DEG2RAD * 42;
  bend.castShadow = true;

  // Flattened prying tip (blade-ish)
  const pryTip = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.018, 0.09), matPry);
  pryTip.position.set(-0.148, 0.102, 0);
  pryTip.rotation.z = DEG2RAD * 18;
  pryTip.castShadow = true;

  hookRoot.add(heel, bend, pryTip);
  shaft.add(hookRoot);
  root.add(shaft);

  return root;
}
