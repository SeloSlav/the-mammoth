import * as THREE from "three";

/** Regular hex in XY; `phase` rotates the bar (match `CylinderGeometry` facets at the shaft). */
function hexProfileShape(circumRadius: number, phase = 0): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = phase + (Math.PI / 3) * i + Math.PI / 6;
    const x = Math.cos(a) * circumRadius;
    const y = Math.sin(a) * circumRadius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

/**
 * Placeholder crowbar: painted hex shaft + steel hex collar + **hex bar swept along a Bézier**
 * (reads like one forged piece, not a round noodle) + shoulder + **forked nail-pull claw**.
 * Hook opens toward **−X** in local space.
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
  const shaftTopR = 0.028;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftTopR, 0.025, shaftH, 6, 1, false),
    matPaint,
  );
  shaft.position.set(0, -0.12, 0);
  shaft.castShadow = true;

  const hookRoot = new THREE.Group();
  hookRoot.position.set(0, shaftH * 0.5, 0);

  const junctionH = 0.02;
  const hexCircumR = 0.0265;
  const junction = new THREE.Mesh(
    new THREE.CylinderGeometry(hexCircumR, shaftTopR, junctionH, 6, 1, false),
    matSteel,
  );
  junction.position.set(0, junctionH * 0.5, 0);
  junction.castShadow = true;

  const y0 = junctionH;
  const hookCurve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, y0, 0),
    new THREE.Vector3(0, y0 + 0.056, 0),
    new THREE.Vector3(-0.078, 0.094, 0),
    new THREE.Vector3(-0.142, 0.106, 0),
  );

  const hookBar = new THREE.Mesh(
    new THREE.ExtrudeGeometry(hexProfileShape(hexCircumR), {
      steps: 96,
      bevelEnabled: false,
      extrudePath: hookCurve,
    }),
    matSteel,
  );
  hookBar.castShadow = true;

  const end = new THREE.Vector3();
  const tan = new THREE.Vector3();
  hookCurve.getPoint(1, end);
  hookCurve.getTangent(1, tan).normalize();

  const claw = new THREE.Group();
  claw.position.copy(end);
  claw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);

  // Reinforced “heel” before the fork widens (reference tools thicken here).
  const shoulderZ = 0.018;
  const shoulder = new THREE.Mesh(
    new THREE.BoxGeometry(0.036, 0.021, 0.028),
    matSteel,
  );
  shoulder.position.set(0, 0, shoulderZ);
  shoulder.castShadow = true;

  const prongGeo = new THREE.BoxGeometry(0.05, 0.0062, 0.016);
  const prongZ = shoulderZ + 0.038;
  const prongSpread = 0.012;
  const prongYaw = 0.13;

  const prongL = new THREE.Mesh(prongGeo, matPry);
  prongL.position.set(-prongSpread, 0, prongZ);
  prongL.rotation.y = prongYaw;
  prongL.castShadow = true;

  const prongR = new THREE.Mesh(prongGeo, matPry);
  prongR.position.set(prongSpread, 0, prongZ);
  prongR.rotation.y = -prongYaw;
  prongR.castShadow = true;

  claw.add(shoulder, prongL, prongR);

  hookRoot.add(junction, hookBar, claw);
  shaft.add(hookRoot);
  root.add(shaft);

  return root;
}
