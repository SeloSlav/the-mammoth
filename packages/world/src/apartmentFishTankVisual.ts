import * as THREE from "three";

/** Authoring / DB path kept for catalog compatibility — geometry is procedural, not the GLB. */
export const APARTMENT_FISH_TANK_MODEL_PATH = "static/models/objects/fish-tank.glb" as const;

/** Matches the legacy Meshy GLB outer bounds so existing placements keep scale. */
export const APARTMENT_FISH_TANK_WIDTH_M = 1.906;
export const APARTMENT_FISH_TANK_HEIGHT_M = 1.429;
export const APARTMENT_FISH_TANK_DEPTH_M = 1.037;

const FRAME_H_M = 0.065;
const CORNER_POST_M = 0.058;
const GLASS_T_M = 0.008;
const SAND_DEPTH_M = 0.12;
const WATER_FILL_FRAC = 0.92;
const GLASS_OPACITY = 0.14;
const WATER_OPACITY = 0.22;

/** Must match {@link MAMMOTH_APARTMENT_DECOR_SKIP_MOOD_GRADE_UD} in `@the-mammoth/engine`. */
const FISH_TANK_SKIP_MOOD_GRADE_UD = "mammothApartmentDecorSkipMoodGrade";
const FISH_TANK_GLASS_RENDER_ORDER = 2;
const FISH_TANK_WATER_RENDER_ORDER = 1;

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

function createWeatheredMetalTextures(): {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
} | null {
  const pair = createCanvasPair(256);
  if (!pair) return null;
  const [colorCanvas, roughCanvas] = pair;
  const colorCtx = colorCanvas.getContext("2d");
  const roughCtx = roughCanvas.getContext("2d");
  if (!colorCtx || !roughCtx) return null;

  const rand = mulberry32(0x46495348);

  colorCtx.fillStyle = "#7a8088";
  colorCtx.fillRect(0, 0, 256, 256);
  roughCtx.fillStyle = "#b8b8b8";
  roughCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 700; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const shade = 96 + Math.floor(rand() * 36);
    colorCtx.fillStyle = `rgba(${shade}, ${shade + 3}, ${shade + 6}, ${0.05 + rand() * 0.07})`;
    colorCtx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
  }

  for (let i = 0; i < 180; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 2 + rand() * 9;
    colorCtx.fillStyle = `rgba(128, 72, 38, ${0.06 + rand() * 0.12})`;
    colorCtx.beginPath();
    colorCtx.arc(x, y, r, 0, Math.PI * 2);
    colorCtx.fill();
    roughCtx.fillStyle = `rgba(170, 120, 80, ${0.04 + rand() * 0.08})`;
    roughCtx.beginPath();
    roughCtx.arc(x, y, r * 1.05, 0, Math.PI * 2);
    roughCtx.fill();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1.6, 1.6);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.copy(map.repeat);

  return { map, roughnessMap };
}

function createSandTextures(): {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
} | null {
  const pair = createCanvasPair(256);
  if (!pair) return null;
  const [colorCanvas, roughCanvas] = pair;
  const colorCtx = colorCanvas.getContext("2d");
  const roughCtx = roughCanvas.getContext("2d");
  if (!colorCtx || !roughCtx) return null;

  const rand = mulberry32(0x53414e44);

  const grad = colorCtx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#d8c6a6");
  grad.addColorStop(0.55, "#c9b692");
  grad.addColorStop(1, "#b8a682");
  colorCtx.fillStyle = grad;
  colorCtx.fillRect(0, 0, 256, 256);
  roughCtx.fillStyle = "#d8d0c0";
  roughCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 4200; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 0.5 + rand() * 1.6;
    const v = rand();
    if (v < 0.45) {
      const shade = 200 + Math.floor(rand() * 40);
      colorCtx.fillStyle = `rgba(${shade}, ${shade - 14}, ${shade - 36}, ${0.18 + rand() * 0.22})`;
    } else if (v < 0.85) {
      const shade = 120 + Math.floor(rand() * 28);
      colorCtx.fillStyle = `rgba(${shade}, ${shade - 18}, ${shade - 36}, ${0.18 + rand() * 0.24})`;
    } else {
      const shade = 70 + Math.floor(rand() * 30);
      colorCtx.fillStyle = `rgba(${shade + 10}, ${shade - 4}, ${shade - 18}, ${0.2 + rand() * 0.28})`;
    }
    colorCtx.beginPath();
    colorCtx.arc(x, y, r, 0, Math.PI * 2);
    colorCtx.fill();

    const rough = 180 + Math.floor(rand() * 60);
    roughCtx.fillStyle = `rgba(${rough}, ${rough}, ${rough}, ${0.1 + rand() * 0.1})`;
    roughCtx.beginPath();
    roughCtx.arc(x, y, r * 1.1, 0, Math.PI * 2);
    roughCtx.fill();
  }

  for (let i = 0; i < 36; i++) {
    const cx = rand() * 256;
    const cy = rand() * 256;
    const rr = 6 + rand() * 14;
    colorCtx.fillStyle = `rgba(160, 132, 90, ${0.04 + rand() * 0.06})`;
    colorCtx.beginPath();
    colorCtx.arc(cx, cy, rr, 0, Math.PI * 2);
    colorCtx.fill();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2.5, 2);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.copy(map.repeat);

  return { map, roughnessMap };
}

function createConcreteTextures(): {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
} | null {
  const pair = createCanvasPair(256);
  if (!pair) return null;
  const [colorCanvas, roughCanvas] = pair;
  const colorCtx = colorCanvas.getContext("2d");
  const roughCtx = roughCanvas.getContext("2d");
  if (!colorCtx || !roughCtx) return null;

  const rand = mulberry32(0x434f4e43);

  colorCtx.fillStyle = "#94999e";
  colorCtx.fillRect(0, 0, 256, 256);
  roughCtx.fillStyle = "#c4c4c4";
  roughCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 1400; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const shade = 118 + Math.floor(rand() * 32);
    colorCtx.fillStyle = `rgba(${shade}, ${shade + 2}, ${shade + 4}, ${0.06 + rand() * 0.08})`;
    colorCtx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.copy(map.repeat);

  return { map, roughnessMap };
}

function createStoneTextures(): {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
} | null {
  const pair = createCanvasPair(256);
  if (!pair) return null;
  const [colorCanvas, roughCanvas] = pair;
  const colorCtx = colorCanvas.getContext("2d");
  const roughCtx = roughCanvas.getContext("2d");
  if (!colorCtx || !roughCtx) return null;

  const rand = mulberry32(0x53544f4e);

  colorCtx.fillStyle = "#6a7078";
  colorCtx.fillRect(0, 0, 256, 256);
  roughCtx.fillStyle = "#b0b0b0";
  roughCtx.fillRect(0, 0, 256, 256);

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const bx = col * 52 + rand() * 4;
      const by = row * 52 + rand() * 4;
      const shade = 96 + Math.floor(rand() * 28);
      colorCtx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 5})`;
      colorCtx.fillRect(bx, by, 48 + rand() * 4, 48 + rand() * 4);
      colorCtx.strokeStyle = `rgba(40, 42, 48, ${0.25 + rand() * 0.2})`;
      colorCtx.lineWidth = 1.5;
      colorCtx.strokeRect(bx, by, 48 + rand() * 4, 48 + rand() * 4);
    }
  }

  for (let i = 0; i < 600; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const shade = 88 + Math.floor(rand() * 24);
    colorCtx.fillStyle = `rgba(${shade}, ${shade + 2}, ${shade + 4}, ${0.05 + rand() * 0.07})`;
    colorCtx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1.8, 1.8);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.copy(map.repeat);

  return { map, roughnessMap };
}

function createPlantTextures(): {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
} | null {
  const pair = createCanvasPair(256);
  if (!pair) return null;
  const [colorCanvas, roughCanvas] = pair;
  const colorCtx = colorCanvas.getContext("2d");
  const roughCtx = roughCanvas.getContext("2d");
  if (!colorCtx || !roughCtx) return null;

  const rand = mulberry32(0x504c4e54);

  colorCtx.fillStyle = "#6a7838";
  colorCtx.fillRect(0, 0, 256, 256);
  roughCtx.fillStyle = "#b0a898";
  roughCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 1200; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 2 + rand() * 8;
    const v = rand();
    if (v < 0.55) {
      const g = 100 + Math.floor(rand() * 40);
      colorCtx.fillStyle = `rgba(${g - 30}, ${g + 10}, ${g - 50}, ${0.12 + rand() * 0.18})`;
    } else if (v < 0.82) {
      const g = 70 + Math.floor(rand() * 30);
      colorCtx.fillStyle = `rgba(${g + 20}, ${g - 10}, ${g - 30}, ${0.1 + rand() * 0.16})`;
    } else {
      const g = 90 + Math.floor(rand() * 35);
      colorCtx.fillStyle = `rgba(${g + 30}, ${g - 20}, ${g - 40}, ${0.14 + rand() * 0.2})`;
    }
    colorCtx.beginPath();
    colorCtx.arc(x, y, r, 0, Math.PI * 2);
    colorCtx.fill();
  }

  for (let i = 0; i < 320; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 1 + rand() * 4;
    colorCtx.fillStyle = `rgba(118, 82, 48, ${0.08 + rand() * 0.14})`;
    colorCtx.beginPath();
    colorCtx.arc(x, y, r, 0, Math.PI * 2);
    colorCtx.fill();
    roughCtx.fillStyle = `rgba(140, 120, 90, ${0.06 + rand() * 0.1})`;
    roughCtx.beginPath();
    roughCtx.arc(x, y, r * 1.1, 0, Math.PI * 2);
    roughCtx.fill();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1.4, 1.4);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.copy(map.repeat);

  return { map, roughnessMap };
}

function createRustBeamTextures(): {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
} | null {
  const pair = createCanvasPair(256);
  if (!pair) return null;
  const [colorCanvas, roughCanvas] = pair;
  const colorCtx = colorCanvas.getContext("2d");
  const roughCtx = roughCanvas.getContext("2d");
  if (!colorCtx || !roughCtx) return null;

  const rand = mulberry32(0x52555354);

  colorCtx.fillStyle = "#7a4a2e";
  colorCtx.fillRect(0, 0, 256, 256);
  roughCtx.fillStyle = "#a08070";
  roughCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 900; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 1 + rand() * 5;
    const shade = 90 + Math.floor(rand() * 50);
    colorCtx.fillStyle = `rgba(${shade + 40}, ${shade - 10}, ${shade - 30}, ${0.08 + rand() * 0.14})`;
    colorCtx.beginPath();
    colorCtx.arc(x, y, r, 0, Math.PI * 2);
    colorCtx.fill();
  }

  for (let i = 0; i < 8; i++) {
    const y = 10 + i * 30 + rand() * 8;
    colorCtx.fillStyle = `rgba(48, 28, 18, ${0.12 + rand() * 0.08})`;
    colorCtx.fillRect(0, y, 256, 2 + rand() * 3);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2.5, 1.2);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.copy(map.repeat);

  return { map, roughnessMap };
}

let cachedFrameMat: THREE.MeshStandardMaterial | null = null;
let cachedSandMat: THREE.MeshStandardMaterial | null = null;
let cachedConcreteMat: THREE.MeshStandardMaterial | null = null;
let cachedRustMat: THREE.MeshStandardMaterial | null = null;
let cachedStoneMat: THREE.MeshStandardMaterial | null = null;
let cachedGlassMat: THREE.MeshStandardMaterial | null = null;
let cachedWaterMat: THREE.MeshStandardMaterial | null = null;
let cachedPlantMat: THREE.MeshStandardMaterial | null = null;

function frameMaterial(): THREE.MeshStandardMaterial {
  if (cachedFrameMat) return cachedFrameMat;
  const tex = createWeatheredMetalTextures();
  cachedFrameMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.48,
    ...(tex ? { map: tex.map, roughnessMap: tex.roughnessMap } : { color: 0x7a8088 }),
  });
  return cachedFrameMat;
}

function sandMaterial(): THREE.MeshStandardMaterial {
  if (cachedSandMat) return cachedSandMat;
  const tex = createSandTextures();
  cachedSandMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0,
    ...(tex
      ? { map: tex.map, roughnessMap: tex.roughnessMap }
      : { color: 0xc9b692 }),
  });
  return cachedSandMat;
}

function concreteMaterial(): THREE.MeshStandardMaterial {
  if (cachedConcreteMat) return cachedConcreteMat;
  const tex = createConcreteTextures();
  cachedConcreteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.02,
    ...(tex ? { map: tex.map, roughnessMap: tex.roughnessMap } : { color: 0xa8adb2 }),
  });
  return cachedConcreteMat;
}

function rustBeamMaterial(): THREE.MeshStandardMaterial {
  if (cachedRustMat) return cachedRustMat;
  const tex = createRustBeamTextures();
  cachedRustMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.62,
    ...(tex ? { map: tex.map, roughnessMap: tex.roughnessMap } : { color: 0x7a4a2e }),
  });
  return cachedRustMat;
}

function stoneMaterial(): THREE.MeshStandardMaterial {
  if (cachedStoneMat) return cachedStoneMat;
  const tex = createStoneTextures();
  cachedStoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.04,
    ...(tex ? { map: tex.map, roughnessMap: tex.roughnessMap } : { color: 0x6c727a }),
  });
  return cachedStoneMat;
}

function glassMaterial(): THREE.MeshStandardMaterial {
  if (cachedGlassMat) return cachedGlassMat;
  cachedGlassMat = new THREE.MeshStandardMaterial({
    color: 0xd4e8f0,
    roughness: 0.04,
    metalness: 0.02,
    transparent: true,
    opacity: GLASS_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return cachedGlassMat;
}

function waterMaterial(): THREE.MeshStandardMaterial {
  if (cachedWaterMat) return cachedWaterMat;
  cachedWaterMat = new THREE.MeshStandardMaterial({
    color: 0xb8dce8,
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: WATER_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return cachedWaterMat;
}

function plantMaterial(): THREE.MeshStandardMaterial {
  if (cachedPlantMat) return cachedPlantMat;
  const tex = createPlantTextures();
  cachedPlantMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
    ...(tex ? { map: tex.map, roughnessMap: tex.roughnessMap } : { color: 0x7a8a48 }),
  });
  return cachedPlantMat;
}

export function isApartmentFishTankModelPath(modelRelPath: string): boolean {
  const norm = modelRelPath.trim().replace(/^\/+/u, "").toLowerCase();
  return norm.endsWith("fish-tank.glb");
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
  mat: THREE.Material,
  opts?: { castShadow?: boolean; transparentSurface?: boolean; renderOrder?: number },
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = opts?.castShadow ?? true;
  mesh.receiveShadow = false;
  if (opts?.transparentSurface) {
    mesh.userData[FISH_TANK_SKIP_MOOD_GRADE_UD] = true;
  }
  if (opts?.renderOrder != null) {
    mesh.renderOrder = opts.renderOrder;
  }
  root.add(mesh);
}

function addIBeam(
  root: THREE.Group,
  name: string,
  length: number,
  x: number,
  y: number,
  z: number,
  axis: "x" | "z",
  mat: THREE.MeshStandardMaterial,
): void {
  const flangeH = 0.018;
  const webT = 0.008;
  const beamH = 0.055;
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, y, z);
  if (axis === "z") group.rotation.y = Math.PI * 0.5;

  const topFlange = new THREE.Mesh(new THREE.BoxGeometry(length, flangeH, beamH), mat);
  topFlange.position.y = beamH * 0.5 - flangeH * 0.5;
  topFlange.castShadow = true;
  group.add(topFlange);

  const bottomFlange = new THREE.Mesh(new THREE.BoxGeometry(length, flangeH, beamH), mat);
  bottomFlange.position.y = -beamH * 0.5 + flangeH * 0.5;
  bottomFlange.castShadow = true;
  group.add(bottomFlange);

  const web = new THREE.Mesh(new THREE.BoxGeometry(length, beamH - flangeH * 2, webT), mat);
  web.castShadow = true;
  group.add(web);

  root.add(group);
}

function addConcretePillar(
  root: THREE.Group,
  name: string,
  x: number,
  z: number,
  baseY: number,
  blockCount: number,
  mat: THREE.MeshStandardMaterial,
): void {
  const blockH = 0.055;
  const blockSize = 0.062;
  for (let i = 0; i < blockCount; i++) {
    addBox(
      root,
      `${name}_block_${i}`,
      blockSize,
      blockH,
      blockSize,
      x,
      baseY + blockH * 0.5 + i * blockH,
      z,
      mat,
    );
  }
}

function addCastleWindow(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  faceNormal: "x" | "z",
): void {
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x161a20,
    roughness: 0.9,
    metalness: 0,
  });
  const sx = faceNormal === "x" ? 0.012 : 0.034;
  const sz = faceNormal === "x" ? 0.034 : 0.012;
  const window = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.048, sz), windowMat);
  window.position.set(x, y, z);
  group.add(window);
}

function addCastle(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  stoneMat: THREE.MeshStandardMaterial,
): void {
  const group = new THREE.Group();
  group.name = "fish_tank_castle";
  group.position.set(x, y, z);

  const baseW = 0.42;
  const baseH = 0.16;
  const baseD = 0.28;
  const base = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseH, baseD), stoneMat);
  base.position.y = baseH * 0.5;
  base.castShadow = true;
  group.add(base);

  const wingW = 0.16;
  const wingH = 0.28;
  const wingD = 0.16;
  const wingY = baseH + wingH * 0.5;
  const leftWing = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, wingD), stoneMat);
  leftWing.position.set(-baseW * 0.5 + wingW * 0.5, wingY, 0);
  leftWing.castShadow = true;
  group.add(leftWing);
  const rightWing = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, wingD), stoneMat);
  rightWing.position.set(baseW * 0.5 - wingW * 0.5, wingY, 0);
  rightWing.castShadow = true;
  group.add(rightWing);

  const towerW = 0.2;
  const towerH = 0.46;
  const towerD = 0.2;
  const towerY = baseH + towerH * 0.5;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerD), stoneMat);
  tower.position.set(0, towerY, 0);
  tower.castShadow = true;
  group.add(tower);

  const crenH = 0.05;
  const crenSize = 0.044;
  const crenTopY = baseH + towerH + crenH * 0.5;
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const cx = -towerW * 0.5 + crenSize * 0.5 + t * (towerW - crenSize);
    const front = new THREE.Mesh(
      new THREE.BoxGeometry(crenSize, crenH, crenSize),
      stoneMat,
    );
    front.position.set(cx, crenTopY, towerD * 0.5 - crenSize * 0.5);
    front.castShadow = true;
    group.add(front);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(crenSize, crenH, crenSize),
      stoneMat,
    );
    back.position.set(cx, crenTopY, -towerD * 0.5 + crenSize * 0.5);
    back.castShadow = true;
    group.add(back);
  }
  for (let i = 0; i < 2; i++) {
    const cz = -towerD * 0.5 + crenSize * 1.5 + i * (towerD - crenSize * 3);
    const left = new THREE.Mesh(
      new THREE.BoxGeometry(crenSize, crenH, crenSize),
      stoneMat,
    );
    left.position.set(-towerW * 0.5 + crenSize * 0.5, crenTopY, cz);
    left.castShadow = true;
    group.add(left);
    const right = new THREE.Mesh(
      new THREE.BoxGeometry(crenSize, crenH, crenSize),
      stoneMat,
    );
    right.position.set(towerW * 0.5 - crenSize * 0.5, crenTopY, cz);
    right.castShadow = true;
    group.add(right);
  }

  const towerFrontZ = towerD * 0.5 + 0.001;
  addCastleWindow(group, 0, baseH + 0.12, towerFrontZ, "z");
  addCastleWindow(group, 0, baseH + 0.3, towerFrontZ, "z");

  const wingFrontZ = wingD * 0.5 + 0.001;
  addCastleWindow(group, -baseW * 0.5 + wingW * 0.5, baseH + 0.13, wingFrontZ, "z");
  addCastleWindow(group, baseW * 0.5 - wingW * 0.5, baseH + 0.13, wingFrontZ, "z");

  addCastleWindow(group, towerW * 0.5 + 0.001, baseH + 0.2, 0, "x");
  addCastleWindow(group, -towerW * 0.5 - 0.001, baseH + 0.2, 0, "x");

  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x18171a,
    roughness: 0.92,
    metalness: 0,
  });
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.012), doorMat);
  door.position.set(0, baseH * 0.5 + 0.005, baseD * 0.5 + 0.001);
  group.add(door);

  root.add(group);
}

function createSeaweedBladeGeometry(
  heightM: number,
  baseWidthM: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const w = baseWidthM;
  const h = heightM;
  shape.moveTo(-w * 0.18, 0);
  shape.lineTo(w * 0.5, h * 0.15);
  shape.lineTo(w * 0.1, h * 0.55);
  shape.lineTo(w * 0.22, h * 0.78);
  shape.lineTo(-w * 0.04, h);
  shape.lineTo(-w * 0.32, h * 0.7);
  shape.lineTo(-w * 0.42, h * 0.32);
  shape.lineTo(-w * 0.18, 0);
  return new THREE.ShapeGeometry(shape);
}

function addSeaweedCluster(
  root: THREE.Group,
  name: string,
  x: number,
  y: number,
  z: number,
  heightM: number,
  bladeCount: number,
  seed: number,
  baseMat: THREE.MeshStandardMaterial,
): void {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, y, z);
  const rand = mulberry32(seed);

  const tints = [0xf0f4e8, 0xe8eed8, 0xdde8cc, 0xf2eed8];
  for (let i = 0; i < bladeCount; i++) {
    const tint = tints[i % tints.length]!;
    const mat = baseMat.clone();
    mat.color.set(tint);

    const bladeH = heightM * (0.74 + rand() * 0.42);
    const bladeW = 0.07 + rand() * 0.05;
    const geom = createSeaweedBladeGeometry(bladeH, bladeW);
    const blade = new THREE.Mesh(geom, mat);
    blade.position.set(
      (rand() - 0.5) * 0.08,
      0,
      (rand() - 0.5) * 0.06,
    );
    blade.rotation.set(
      (rand() - 0.5) * 0.18,
      rand() * Math.PI * 2,
      (rand() - 0.5) * 0.34,
    );
    blade.castShadow = false;
    blade.receiveShadow = false;
    group.add(blade);
  }

  root.add(group);
}

function addFrameCornerPosts(
  root: THREE.Group,
  halfW: number,
  halfD: number,
  innerH: number,
  innerCenterY: number,
  mat: THREE.MeshStandardMaterial,
): void {
  const post = CORNER_POST_M;
  const corners: ReadonlyArray<[string, number, number]> = [
    ["fish_tank_frame_corner_fl", -halfW + post * 0.5, halfD - post * 0.5],
    ["fish_tank_frame_corner_fr", halfW - post * 0.5, halfD - post * 0.5],
    ["fish_tank_frame_corner_bl", -halfW + post * 0.5, -halfD + post * 0.5],
    ["fish_tank_frame_corner_br", halfW - post * 0.5, -halfD + post * 0.5],
  ];
  for (const [name, x, z] of corners) {
    addBox(root, name, post, innerH, post, x, innerCenterY, z, mat);
  }
}

function addSandMounds(
  root: THREE.Group,
  sandTopY: number,
  sandW: number,
  sandD: number,
  mat: THREE.MeshStandardMaterial,
): void {
  const rand = mulberry32(0x4d4f554e);
  const moundCount = 7;
  for (let i = 0; i < moundCount; i++) {
    const sx = 0.08 + rand() * 0.14;
    const sy = 0.012 + rand() * 0.022;
    const sz = 0.07 + rand() * 0.12;
    const x = (rand() - 0.5) * sandW * 0.82;
    const z = (rand() - 0.5) * sandD * 0.82;
    addBox(
      root,
      `fish_tank_sand_mound_${i}`,
      sx,
      sy,
      sz,
      x,
      sandTopY + sy * 0.5,
      z,
      mat,
      { castShadow: true },
    );
  }
}

function tagFishTankMeshesSkipMoodGrade(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.userData[FISH_TANK_SKIP_MOOD_GRADE_UD] = true;
    }
  });
}

/**
 * Low-poly fish tank with interior hardscape, plants, sand, and water fill.
 * Origin at the tank center; matches legacy GLB bounds for apartment decor placements.
 */
export function buildApartmentFishTankVisual(): THREE.Group {
  const root = new THREE.Group();
  root.name = "apartment_fish_tank";

  const w = APARTMENT_FISH_TANK_WIDTH_M;
  const h = APARTMENT_FISH_TANK_HEIGHT_M;
  const d = APARTMENT_FISH_TANK_DEPTH_M;
  const halfW = w * 0.5;
  const halfH = h * 0.5;
  const halfD = d * 0.5;

  const frameMat = frameMaterial();
  const sandMat = sandMaterial();
  const concreteMat = concreteMaterial();
  const rustMat = rustBeamMaterial();
  const stoneMat = stoneMaterial();
  const glassMat = glassMaterial();
  const waterMat = waterMaterial();
  const plantMat = plantMaterial();

  addBox(root, "fish_tank_frame_bottom", w, FRAME_H_M, d, 0, -halfH + FRAME_H_M * 0.5, 0, frameMat);
  addBox(root, "fish_tank_frame_top", w, FRAME_H_M, d, 0, halfH - FRAME_H_M * 0.5, 0, frameMat);

  const innerH = h - FRAME_H_M * 2;
  const innerCenterY = 0;
  const innerBottomY = -halfH + FRAME_H_M;

  addFrameCornerPosts(root, halfW, halfD, innerH, innerCenterY, frameMat);

  addBox(
    root,
    "fish_tank_glass_front",
    w - GLASS_T_M * 2,
    innerH,
    GLASS_T_M,
    0,
    innerCenterY,
    halfD - GLASS_T_M * 0.5,
    glassMat,
    { castShadow: false, transparentSurface: true, renderOrder: FISH_TANK_GLASS_RENDER_ORDER },
  );
  addBox(
    root,
    "fish_tank_glass_back",
    w - GLASS_T_M * 2,
    innerH,
    GLASS_T_M,
    0,
    innerCenterY,
    -halfD + GLASS_T_M * 0.5,
    glassMat,
    { castShadow: false, transparentSurface: true, renderOrder: FISH_TANK_GLASS_RENDER_ORDER },
  );
  addBox(
    root,
    "fish_tank_glass_left",
    GLASS_T_M,
    innerH,
    d - GLASS_T_M * 2,
    -halfW + GLASS_T_M * 0.5,
    innerCenterY,
    0,
    glassMat,
    { castShadow: false, transparentSurface: true, renderOrder: FISH_TANK_GLASS_RENDER_ORDER },
  );
  addBox(
    root,
    "fish_tank_glass_right",
    GLASS_T_M,
    innerH,
    d - GLASS_T_M * 2,
    halfW - GLASS_T_M * 0.5,
    innerCenterY,
    0,
    glassMat,
    { castShadow: false, transparentSurface: true, renderOrder: FISH_TANK_GLASS_RENDER_ORDER },
  );

  const sandInset = 0.03;
  const sandW = w - sandInset * 2;
  const sandD = d - sandInset * 2;
  const sandTopY = innerBottomY + SAND_DEPTH_M;
  addBox(
    root,
    "fish_tank_sand",
    sandW,
    SAND_DEPTH_M,
    sandD,
    0,
    innerBottomY + SAND_DEPTH_M * 0.5,
    0,
    sandMat,
  );
  addSandMounds(root, sandTopY, sandW, sandD, sandMat);

  const waterColumnH = innerH - SAND_DEPTH_M;
  const waterH = waterColumnH * WATER_FILL_FRAC;
  const waterInset = 0.045;
  addBox(
    root,
    "fish_tank_water",
    w - waterInset * 2,
    waterH,
    d - waterInset * 2,
    0,
    sandTopY + waterH * 0.5,
    0,
    waterMat,
    {
      castShadow: false,
      transparentSurface: true,
      renderOrder: FISH_TANK_WATER_RENDER_ORDER,
    },
  );

  const decorBaseY = sandTopY;

  addCastle(root, halfW * 0.28, decorBaseY, -halfD * 0.32, stoneMat);

  const leftPillarX = -halfW * 0.6;
  const leftPillarSep = halfD * 0.46;
  addConcretePillar(root, "fish_tank_pillar_l0", leftPillarX, -leftPillarSep * 0.5, decorBaseY, 4, concreteMat);
  addConcretePillar(root, "fish_tank_pillar_l1", leftPillarX, leftPillarSep * 0.5, decorBaseY, 4, concreteMat);
  addIBeam(root, "fish_tank_beam_l_top", leftPillarSep + 0.06, leftPillarX, decorBaseY + 0.235, 0, "z", rustMat);
  addIBeam(root, "fish_tank_beam_l_mid", leftPillarSep + 0.04, leftPillarX, decorBaseY + 0.145, 0, "z", rustMat);

  const rightPillarX = halfW * 0.62;
  const rightPillarSep = halfD * 0.5;
  addConcretePillar(root, "fish_tank_pillar_r0", rightPillarX, -rightPillarSep * 0.5, decorBaseY, 4, concreteMat);
  addConcretePillar(root, "fish_tank_pillar_r1", rightPillarX, rightPillarSep * 0.5, decorBaseY, 4, concreteMat);
  addIBeam(root, "fish_tank_beam_r_top", rightPillarSep + 0.06, rightPillarX, decorBaseY + 0.235, 0, "z", rustMat);
  addIBeam(root, "fish_tank_beam_r_mid", rightPillarSep + 0.04, rightPillarX, decorBaseY + 0.145, 0, "z", rustMat);

  const seaweedPositions: ReadonlyArray<{
    name: string;
    x: number;
    z: number;
    h: number;
    blades: number;
    seed: number;
  }> = [
    { name: "fish_tank_seaweed_lf", x: -halfW * 0.78, z: halfD * 0.46, h: 0.42, blades: 4, seed: 0x53450001 },
    { name: "fish_tank_seaweed_lb", x: -halfW * 0.5, z: -halfD * 0.6, h: 0.36, blades: 3, seed: 0x53450002 },
    { name: "fish_tank_seaweed_cf", x: -halfW * 0.08, z: halfD * 0.62, h: 0.32, blades: 3, seed: 0x53450003 },
    { name: "fish_tank_seaweed_cb", x: halfW * 0.16, z: -halfD * 0.7, h: 0.46, blades: 4, seed: 0x53450004 },
    { name: "fish_tank_seaweed_rf", x: halfW * 0.82, z: halfD * 0.34, h: 0.4, blades: 4, seed: 0x53450005 },
  ];
  for (const sw of seaweedPositions) {
    addSeaweedCluster(root, sw.name, sw.x, decorBaseY, sw.z, sw.h, sw.blades, sw.seed, plantMat);
  }

  tagFishTankMeshesSkipMoodGrade(root);
  return root;
}
