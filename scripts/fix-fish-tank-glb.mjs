import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";

const GLB_PATH = path.resolve("apps/client/public/static/models/objects/fish-tank.glb");

const SHELL_Y_TOP = 0.48;
const SHELL_Y_BOTTOM = -0.48;
const SHELL_FACE = 0.415;
const SHELL_CORNER = 0.78;
const GLASS_Y_MIN = -0.45;
const GLASS_Y_MAX = 0.45;
const LONG_Z = 0.495;
const SHORT_X = 0.925;
const LONG_X_MIN = -0.84;
const LONG_X_MAX = 0.84;
const SHORT_Z_MIN = -0.42;
const SHORT_Z_MAX = 0.42;
const CENTER_GAP = 0.025;

function getVec3(array, index) {
  const i = index * 3;
  return { x: array[i], y: array[i + 1], z: array[i + 2] };
}

function centroid(a, b, c) {
  return {
    x: (a.x + b.x + c.x) / 3,
    y: (a.y + b.y + c.y) / 3,
    z: (a.z + b.z + c.z) / 3,
  };
}

function classifyTriangle(a, b, c) {
  const center = centroid(a, b, c);
  if (center.y > SHELL_Y_TOP || center.y < SHELL_Y_BOTTOM) return "frame";
  if (Math.abs(center.x) > SHELL_CORNER && Math.abs(center.z) > SHELL_CORNER) return "frame";
  if (Math.abs(center.x) > SHELL_FACE || Math.abs(center.z) > SHELL_FACE) return "glass";
  if (
    Math.abs(a.x) > SHELL_FACE ||
    Math.abs(a.z) > SHELL_FACE ||
    Math.abs(b.x) > SHELL_FACE ||
    Math.abs(b.z) > SHELL_FACE ||
    Math.abs(c.x) > SHELL_FACE ||
    Math.abs(c.z) > SHELL_FACE
  ) {
    return "glass";
  }
  return "interior";
}

function isBaseSteelSquareArtifact(center) {
  return (
    center.y > -0.48 &&
    center.y < -0.36 &&
    center.x > 0.05 &&
    center.x < 0.35 &&
    Math.abs(center.z) > 0.39 &&
    Math.abs(center.z) < 0.46
  );
}

function addPanel(positions, indices, a, b, c, d) {
  const base = positions.length / 3;
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function createGlassGeometry() {
  const positions = [];
  const indices = [];
  const y0 = GLASS_Y_MIN;
  const y1 = GLASS_Y_MAX;
  const longLeftX0 = LONG_X_MIN;
  const longLeftX1 = -CENTER_GAP;
  const longRightX0 = CENTER_GAP;
  const longRightX1 = LONG_X_MAX;
  const shortBackZ0 = SHORT_Z_MIN;
  const shortBackZ1 = -CENTER_GAP;
  const shortFrontZ0 = CENTER_GAP;
  const shortFrontZ1 = SHORT_Z_MAX;

  for (const z of [-LONG_Z, LONG_Z]) {
    addPanel(positions, indices, { x: longLeftX0, y: y0, z }, { x: longLeftX1, y: y0, z }, { x: longLeftX1, y: y1, z }, { x: longLeftX0, y: y1, z });
    addPanel(positions, indices, { x: longRightX0, y: y0, z }, { x: longRightX1, y: y0, z }, { x: longRightX1, y: y1, z }, { x: longRightX0, y: y1, z });
  }

  for (const x of [-SHORT_X, SHORT_X]) {
    addPanel(positions, indices, { x, y: y0, z: shortBackZ0 }, { x, y: y0, z: shortBackZ1 }, { x, y: y1, z: shortBackZ1 }, { x, y: y1, z: shortBackZ0 });
    addPanel(positions, indices, { x, y: y0, z: shortFrontZ0 }, { x, y: y0, z: shortFrontZ1 }, { x, y: y1, z: shortFrontZ1 }, { x, y: y1, z: shortFrontZ0 });
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
  };
}

if (!fs.existsSync(GLB_PATH)) {
  throw new Error(`Missing ${GLB_PATH}`);
}

const io = new NodeIO();
const document = await io.read(GLB_PATH);
const root = document.getRoot();
const mesh = root.listMeshes()[0];
const primitive = mesh?.listPrimitives()[0];
if (!mesh || !primitive) {
  throw new Error("Expected fish-tank.glb to contain one mesh primitive.");
}

const positionAccessor = primitive.getAttribute("POSITION");
const indexAccessor = primitive.getIndices();
if (!positionAccessor || !indexAccessor) {
  throw new Error("Expected indexed mesh with POSITION attribute.");
}

const positions = positionAccessor.getArray();
const indices = indexAccessor.getArray();
const opaqueIndices = [];
let discardedTriangles = 0;

for (let i = 0; i < indices.length; i += 3) {
  const i0 = indices[i];
  const i1 = indices[i + 1];
  const i2 = indices[i + 2];
  const a = getVec3(positions, i0);
  const b = getVec3(positions, i1);
  const c = getVec3(positions, i2);
  const center = centroid(a, b, c);

  if (isBaseSteelSquareArtifact(center) || classifyTriangle(a, b, c) === "glass") {
    discardedTriangles += 1;
    continue;
  }

  opaqueIndices.push(i0, i1, i2);
}

const buffer = root.listBuffers()[0] ?? document.createBuffer("fish-tank-buffer");
primitive.setIndices(
  document
    .createAccessor("fish_tank_opaque_indices")
    .setArray(new Uint16Array(opaqueIndices))
    .setType("SCALAR")
    .setBuffer(buffer),
);

const glass = createGlassGeometry();
const glassMaterial = document
  .createMaterial("fish_tank_clean_glass")
  .setBaseColorFactor([0.82, 0.93, 0.98, 0.16])
  .setAlpha(0.16)
  .setAlphaMode("BLEND")
  .setDoubleSided(true)
  .setRoughnessFactor(0.04)
  .setMetallicFactor(0.02);

const glassPrimitive = document
  .createPrimitive()
  .setAttribute(
    "POSITION",
    document
      .createAccessor("fish_tank_clean_glass_positions")
      .setArray(glass.positions)
      .setType("VEC3")
      .setBuffer(buffer),
  )
  .setIndices(
    document
      .createAccessor("fish_tank_clean_glass_indices")
      .setArray(glass.indices)
      .setType("SCALAR")
      .setBuffer(buffer),
  )
  .setMaterial(glassMaterial);

mesh.addPrimitive(glassPrimitive);
mesh.setName("fish_tank_cleaned");

await io.write(GLB_PATH, document);

console.log(
  JSON.stringify(
    {
      wrote: GLB_PATH,
      opaqueTriangles: opaqueIndices.length / 3,
      discardedTriangles,
      glassTriangles: glass.indices.length / 3,
    },
    null,
    2,
  ),
);
