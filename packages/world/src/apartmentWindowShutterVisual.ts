import * as THREE from "three";

/** Authoring / DB path kept for catalog compatibility — geometry is procedural, not the GLB. */
export const APARTMENT_WINDOW_SHUTTER_MODEL_PATH =
  "static/models/objects/window-shutter.glb" as const;

/** Matches the legacy Meshy GLB outer bounds so existing placements keep scale. */
export const APARTMENT_WINDOW_SHUTTER_WIDTH_M = 1.953;
export const APARTMENT_WINDOW_SHUTTER_HEIGHT_M = 1.237;
export const APARTMENT_WINDOW_SHUTTER_DEPTH_M = 0.215;

const FRAME_BAR_W_M = 0.055;
const FRAME_BAR_T_M = APARTMENT_WINDOW_SHUTTER_DEPTH_M * 0.96;
const PLATE_THICKNESS_M = 0.006;
const BAR_RADIUS_M = 0.011;
const RAIL_H_M = 0.008;
const RAIL_D_M = 0.034;
const BOLT_RADIUS_M = 0.007;
const HASP_W_M = 0.028;
const HASP_T_M = 0.014;

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

function createCanvasPair(size: number): [CanvasLike, CanvasLike] | null {
  if (typeof document !== "undefined") {
    const color = document.createElement("canvas");
    const roughness = document.createElement("canvas");
    color.width = roughness.width = size;
    color.height = roughness.height = size;
    return [color, roughness];
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return [new OffscreenCanvas(size, size), new OffscreenCanvas(size, size)];
  }
  return null;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createBrushedPlateTextures(): {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
} | null {
  const pair = createCanvasPair(256);
  if (!pair) return null;
  const [colorCanvas, roughCanvas] = pair;
  const colorCtx = colorCanvas.getContext("2d");
  const roughCtx = roughCanvas.getContext("2d");
  if (!colorCtx || !roughCtx) return null;

  const rand = mulberry32(0x57494e44);

  const grad = colorCtx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, "#8a9098");
  grad.addColorStop(0.22, "#b5bcc4");
  grad.addColorStop(0.48, "#90979f");
  grad.addColorStop(0.72, "#c0c6cc");
  grad.addColorStop(1, "#7d848c");
  colorCtx.fillStyle = grad;
  colorCtx.fillRect(0, 0, 256, 256);
  roughCtx.fillStyle = "#c8c8c8";
  roughCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 16; i++) {
    const y = 10 + i * 15 + rand() * 4;
    colorCtx.fillStyle = `rgba(110, 116, 122, ${0.06 + rand() * 0.05})`;
    colorCtx.fillRect(0, y, 256, 1 + rand());
    roughCtx.fillStyle = `rgba(228, 228, 228, ${0.05 + rand() * 0.04})`;
    roughCtx.fillRect(0, y, 256, 1 + rand());
  }

  for (let i = 0; i < 8; i++) {
    const x = 18 + i * 28 + rand() * 8;
    colorCtx.fillStyle = `rgba(210, 214, 218, ${0.08 + rand() * 0.06})`;
    colorCtx.fillRect(x, 0, 2 + rand() * 2, 256);
  }

  for (let i = 0; i < 420; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 0.4 + rand() * 1.6;
    colorCtx.fillStyle = `rgba(96, 102, 108, ${0.03 + rand() * 0.05})`;
    colorCtx.beginPath();
    colorCtx.arc(x, y, r, 0, Math.PI * 2);
    colorCtx.fill();
  }

  for (let i = 0; i < 140; i++) {
    const x = rand() * 256;
    const y = 170 + rand() * 86;
    const r = 1 + rand() * 4;
    colorCtx.fillStyle = `rgba(118, 78, 48, ${0.04 + rand() * 0.08})`;
    colorCtx.beginPath();
    colorCtx.arc(x, y, r, 0, Math.PI * 2);
    colorCtx.fill();
    roughCtx.fillStyle = `rgba(200, 170, 140, ${0.03 + rand() * 0.05})`;
    roughCtx.beginPath();
    roughCtx.arc(x, y, r * 1.1, 0, Math.PI * 2);
    roughCtx.fill();
  }

  colorCtx.strokeStyle = "rgba(72, 76, 80, 0.22)";
  colorCtx.lineWidth = 1.2;
  for (const y of [82, 168]) {
    colorCtx.beginPath();
    colorCtx.moveTo(8, y);
    colorCtx.lineTo(248, y);
    colorCtx.stroke();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1.4, 1.05);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.copy(map.repeat);

  return { map, roughnessMap };
}

function createFrameSteelTextures(): {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
} | null {
  const pair = createCanvasPair(256);
  if (!pair) return null;
  const [colorCanvas, roughCanvas] = pair;
  const colorCtx = colorCanvas.getContext("2d");
  const roughCtx = roughCanvas.getContext("2d");
  if (!colorCtx || !roughCtx) return null;

  const rand = mulberry32(0x4652414d);

  colorCtx.fillStyle = "#4a525c";
  colorCtx.fillRect(0, 0, 256, 256);
  roughCtx.fillStyle = "#b0b0b0";
  roughCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 900; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const shade = 68 + Math.floor(rand() * 28);
    colorCtx.fillStyle = `rgba(${shade}, ${shade + 4}, ${shade + 8}, ${0.05 + rand() * 0.07})`;
    colorCtx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
    const rough = 150 + Math.floor(rand() * 50);
    roughCtx.fillStyle = `rgba(${rough}, ${rough}, ${rough}, ${0.04 + rand() * 0.06})`;
    roughCtx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
  }

  for (let i = 0; i < 12; i++) {
    const y = 12 + i * 20 + rand() * 6;
    colorCtx.fillStyle = `rgba(38, 42, 48, ${0.07 + rand() * 0.05})`;
    colorCtx.fillRect(0, y, 256, 1 + rand());
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2.2, 2.2);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.copy(map.repeat);

  return { map, roughnessMap };
}

let cachedPlateMat: THREE.MeshStandardMaterial | null = null;
let cachedFrameMat: THREE.MeshStandardMaterial | null = null;
let cachedBarMat: THREE.MeshStandardMaterial | null = null;

function plateMaterial(): THREE.MeshStandardMaterial {
  if (cachedPlateMat) return cachedPlateMat;
  const tex = createBrushedPlateTextures();
  cachedPlateMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.58,
    metalness: 0.72,
    ...(tex ? { map: tex.map, roughnessMap: tex.roughnessMap } : {}),
  });
  return cachedPlateMat;
}

function frameMaterial(): THREE.MeshStandardMaterial {
  if (cachedFrameMat) return cachedFrameMat;
  const tex = createFrameSteelTextures();
  cachedFrameMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.46,
    metalness: 0.82,
    ...(tex ? { map: tex.map, roughnessMap: tex.roughnessMap } : {}),
  });
  return cachedFrameMat;
}

function barMaterial(): THREE.MeshStandardMaterial {
  if (cachedBarMat) return cachedBarMat;
  cachedBarMat = frameMaterial().clone();
  cachedBarMat.roughness = 0.34;
  cachedBarMat.metalness = 0.9;
  return cachedBarMat;
}

export function isApartmentWindowShutterModelPath(modelRelPath: string): boolean {
  const norm = modelRelPath.trim().replace(/^\/+/u, "").toLowerCase();
  return norm.endsWith("window-shutter.glb");
}

function addBox(
  root: THREE.Group,
  name: string,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.MeshStandardMaterial,
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  root.add(mesh);
}

function addCylinderBar(
  root: THREE.Group,
  name: string,
  radius: number,
  height: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.MeshStandardMaterial,
): void {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  root.add(mesh);
}

function addBoltHead(
  root: THREE.Group,
  name: string,
  x: number,
  y: number,
  z: number,
  mat: THREE.MeshStandardMaterial,
): void {
  const bolt = new THREE.Mesh(
    new THREE.CylinderGeometry(BOLT_RADIUS_M, BOLT_RADIUS_M, 0.005, 6),
    mat,
  );
  bolt.name = name;
  bolt.rotation.x = Math.PI * 0.5;
  bolt.position.set(x, y, z);
  bolt.castShadow = true;
  bolt.receiveShadow = false;
  root.add(bolt);
}

function addBarCap(
  root: THREE.Group,
  name: string,
  radius: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.MeshStandardMaterial,
): void {
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
    mat,
  );
  cap.name = name;
  cap.position.set(x, y, z);
  cap.castShadow = true;
  cap.receiveShadow = false;
  root.add(cap);
}

/**
 * Professionally sealed window security shutter built from low-poly primitives.
 * Origin at the panel center; matches legacy GLB bounds for existing apartment placements.
 */
export function buildApartmentWindowShutterVisual(): THREE.Group {
  const root = new THREE.Group();
  root.name = "apartment_window_shutter";

  const w = APARTMENT_WINDOW_SHUTTER_WIDTH_M;
  const h = APARTMENT_WINDOW_SHUTTER_HEIGHT_M;
  const d = APARTMENT_WINDOW_SHUTTER_DEPTH_M;
  const halfW = w * 0.5;
  const halfH = h * 0.5;
  const halfD = d * 0.5;

  const frameMat = frameMaterial();
  const plateMat = plateMaterial();
  const barMat = barMaterial();

  const innerW = w - FRAME_BAR_W_M * 2;
  const innerH = h - FRAME_BAR_W_M * 2;
  const plateZ = -halfD + PLATE_THICKNESS_M * 0.5;
  const grilleZ = halfD * 0.22;

  addBox(root, "shutter_frame_top", w, FRAME_BAR_W_M, FRAME_BAR_T_M, 0, halfH - FRAME_BAR_W_M * 0.5, 0, frameMat);
  addBox(
    root,
    "shutter_frame_bottom",
    w,
    FRAME_BAR_W_M,
    FRAME_BAR_T_M,
    0,
    -halfH + FRAME_BAR_W_M * 0.5,
    0,
    frameMat,
  );
  addBox(
    root,
    "shutter_frame_left",
    FRAME_BAR_W_M,
    innerH,
    FRAME_BAR_T_M,
    -halfW + FRAME_BAR_W_M * 0.5,
    0,
    0,
    frameMat,
  );
  addBox(
    root,
    "shutter_frame_right",
    FRAME_BAR_W_M,
    innerH,
    FRAME_BAR_T_M,
    halfW - FRAME_BAR_W_M * 0.5,
    0,
    0,
    frameMat,
  );

  addBox(root, "shutter_back_plate", innerW, innerH, PLATE_THICKNESS_M, 0, 0, plateZ, plateMat);

  const barCount = 7;
  const barSpan = innerW - FRAME_BAR_W_M * 0.6;
  const barStartX = -barSpan * 0.5;
  const barStep = barSpan / (barCount - 1);
  const barBottomY = -halfH + FRAME_BAR_W_M + 0.04;
  const barTopY = halfH - FRAME_BAR_W_M - 0.06;
  const barHeight = barTopY - barBottomY;

  for (let i = 0; i < barCount; i++) {
    const x = barStartX + i * barStep;
    addCylinderBar(
      root,
      `shutter_bar_${i}`,
      BAR_RADIUS_M,
      barHeight,
      x,
      (barBottomY + barTopY) * 0.5,
      grilleZ,
      barMat,
    );
    addBarCap(root, `shutter_bar_cap_${i}`, BAR_RADIUS_M, x, barTopY, grilleZ, barMat);
  }

  const railYs = [barBottomY + barHeight * 0.28, barBottomY + barHeight * 0.72];
  for (let i = 0; i < railYs.length; i++) {
    addBox(
      root,
      `shutter_rail_${i}`,
      innerW - 0.02,
      RAIL_H_M,
      RAIL_D_M,
      0,
      railYs[i]!,
      grilleZ + BAR_RADIUS_M + RAIL_D_M * 0.35,
      frameMat,
    );
  }

  const archSpan = innerW * 0.88;
  const archCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-archSpan * 0.5, barTopY - 0.018, grilleZ),
    new THREE.Vector3(0, barTopY + 0.042, grilleZ),
    new THREE.Vector3(archSpan * 0.5, barTopY - 0.018, grilleZ),
  );
  const arch = new THREE.Mesh(
    new THREE.TubeGeometry(archCurve, 14, BAR_RADIUS_M * 0.88, 6, false),
    barMat,
  );
  arch.name = "shutter_top_arch";
  arch.castShadow = true;
  arch.receiveShadow = false;
  root.add(arch);

  const haspX = halfW - FRAME_BAR_W_M * 0.55;
  addBox(
    root,
    "shutter_hasp_plate",
    HASP_W_M,
    innerH * 0.22,
    HASP_T_M,
    haspX,
    -innerH * 0.08,
    grilleZ + BAR_RADIUS_M + HASP_T_M * 0.4,
    frameMat,
  );
  addBox(
    root,
    "shutter_hasp_strap",
    HASP_W_M * 0.72,
    RAIL_H_M * 1.4,
    HASP_T_M * 1.2,
    haspX,
    innerH * 0.12,
    grilleZ + BAR_RADIUS_M + HASP_T_M * 0.55,
    frameMat,
  );
  addBox(
    root,
    "shutter_lock_body",
    HASP_W_M * 0.62,
    HASP_W_M * 0.78,
    HASP_T_M * 1.35,
    haspX,
    -innerH * 0.08,
    grilleZ + BAR_RADIUS_M + HASP_T_M * 0.95,
    frameMat,
  );

  const boltInset = 0.05;
  const boltZ = halfD - FRAME_BAR_T_M * 0.45;
  const boltPositions: [number, number][] = [
    [-halfW + boltInset, halfH - boltInset],
    [halfW - boltInset, halfH - boltInset],
    [-halfW + boltInset, -halfH + boltInset],
    [halfW - boltInset, -halfH + boltInset],
    [0, halfH - boltInset],
    [0, -halfH + boltInset],
  ];
  for (let i = 0; i < boltPositions.length; i++) {
    const [bx, by] = boltPositions[i]!;
    addBoltHead(root, `shutter_bolt_${i}`, bx, by, boltZ, frameMat);
  }

  return root;
}
