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
 * Placeholder crowbar: hex shaft + steel collar + deep forged-style U hook (hex sweep) +
 * **wide flat claw** (neck + shoulders + straight lip + centered V) + **opposite chisel end** on the shaft.
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
    color: 0x6a7178,
    metalness: 0.62,
    roughness: 0.38,
    flatShading: true,
  });

  const shaftH = 0.44;
  const shaftTopR = 0.028;
  const shaftHalf = shaftH * 0.5;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftTopR, 0.025, shaftH, 6, 1, false),
    matPaint,
  );
  /**
   * Primitive root (0,0,0) = grip point: shaft axis, centered in cross-section, slightly inset from the
   * pommel along the bar (knuckle / mid-fist read in FP).
   */
  const pommelInsetM = 0.08;
  shaft.position.set(0, shaftHalf - pommelInsetM, 0);
  shaft.castShadow = true;

  /** Classic wrecking bar: shallow chisel / wedge on the end opposite the claw. */
  const chisel = new THREE.Mesh(
    new THREE.BoxGeometry(0.024, 0.011, 0.062),
    matSteel,
  );
  chisel.name = "crowbar_chisel_end";
  chisel.position.set(0, -shaftHalf - 0.03, 0);
  chisel.rotation.order = "YXZ";
  chisel.rotation.x = 0.5;
  chisel.rotation.z = -0.11;
  chisel.castShadow = true;
  shaft.add(chisel);

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
  /** Deeper U in XY: long reach, tight return — reads closer to forged stock than a gentle bend. */
  const hookCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, y0, 0),
      new THREE.Vector3(-0.016, y0 + 0.055, 0),
      new THREE.Vector3(-0.095, 0.108, 0),
      new THREE.Vector3(-0.118, 0.058, 0),
      new THREE.Vector3(-0.088, 0.008, 0),
      new THREE.Vector3(-0.058, -0.012, 0),
    ],
    false,
    "centripetal",
  );

  const hookBar = new THREE.Mesh(
    new THREE.ExtrudeGeometry(hexProfileShape(hexCircumR), {
      steps: 120,
      bevelEnabled: false,
      extrudePath: hookCurve,
    }),
    matSteel,
  );
  hookBar.castShadow = true;

  const end = new THREE.Vector3();
  const along = new THREE.Vector3();
  hookCurve.getPoint(1, end);
  hookCurve.getTangent(1, along).normalize();

  const hookPlaneN = new THREE.Vector3(0, 0, 1);
  let span = new THREE.Vector3().crossVectors(along, hookPlaneN);
  if (span.lengthSq() < 1e-8) {
    hookPlaneN.set(0, 1, 0);
    span.crossVectors(along, hookPlaneN);
  }
  span.normalize();
  const thin = new THREE.Vector3().crossVectors(span, along).normalize();
  if (thin.dot(hookPlaneN) < 0) thin.negate();

  const basis = new THREE.Matrix4().makeBasis(span, along, thin);

  const claw = new THREE.Group();
  claw.position.copy(end);
  claw.quaternion.setFromRotationMatrix(basis);
  claw.rotateOnAxis(new THREE.Vector3(0, 1, 0), Math.PI);

  /**
   * Forged claw silhouette (XY): narrow neck into the bend, wide shoulders, straight nail lip, deep V.
   * Extruded thin on Z → large flat pry faces (span × along).
   */
  const wedgeDepth = 0.0085;
  const wedgeShape = new THREE.Shape();
  wedgeShape.moveTo(-0.013, 0.054);
  wedgeShape.lineTo(0.013, 0.054);
  wedgeShape.lineTo(0.052, 0.015);
  wedgeShape.lineTo(0.042, -0.006);
  wedgeShape.lineTo(0, -0.03);
  wedgeShape.lineTo(-0.042, -0.006);
  wedgeShape.lineTo(-0.052, 0.015);
  wedgeShape.closePath();

  const wedge = new THREE.Mesh(
    new THREE.ExtrudeGeometry(wedgeShape, {
      depth: wedgeDepth,
      bevelEnabled: false,
    }),
    matSteel,
  );
  wedge.name = "crowbar_claw_wedge";
  wedge.castShadow = true;
  wedge.position.set(0, 0, -wedgeDepth * 0.5);
  wedge.rotation.x = Math.PI;

  claw.add(wedge);

  hookRoot.add(junction, hookBar, claw);
  shaft.add(hookRoot);
  root.add(shaft);

  return root;
}
