import * as THREE from "three";

/**
 * Shared materials so massive generated floors do not allocate thousands of materials.
 * Palette: very light pastel blue-gray (mass-panel / cast shell), B slightly above R≈G.
 */
function createConcreteSurfaceTextures():
  | {
      map: THREE.Texture;
      roughnessMap: THREE.Texture;
      bumpMap: THREE.Texture;
    }
  | undefined {
  let colorCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  let roughnessCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  let bumpCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  const size = 256;
  if (typeof document !== "undefined") {
    colorCanvas = document.createElement("canvas");
    roughnessCanvas = document.createElement("canvas");
    bumpCanvas = document.createElement("canvas");
    colorCanvas.width = roughnessCanvas.width = bumpCanvas.width = size;
    colorCanvas.height = roughnessCanvas.height = bumpCanvas.height = size;
  } else if (typeof OffscreenCanvas !== "undefined") {
    colorCanvas = new OffscreenCanvas(size, size);
    roughnessCanvas = new OffscreenCanvas(size, size);
    bumpCanvas = new OffscreenCanvas(size, size);
  }
  if (!colorCanvas || !roughnessCanvas || !bumpCanvas) return undefined;
  const colorCtx = colorCanvas.getContext("2d");
  const roughCtx = roughnessCanvas.getContext("2d");
  const bumpCtx = bumpCanvas.getContext("2d");
  if (!colorCtx || !roughCtx || !bumpCtx) return undefined;

  let seed = 0x4d41534f;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  colorCtx.fillStyle = "#c8ccd1";
  colorCtx.fillRect(0, 0, size, size);
  roughCtx.fillStyle = "#d7d7d7";
  roughCtx.fillRect(0, 0, size, size);
  bumpCtx.fillStyle = "#808080";
  bumpCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.5 + rand() * 2.4;
    const shade = 180 + Math.floor(rand() * 46);
    colorCtx.fillStyle = `rgba(${shade}, ${shade + 2}, ${shade + 5}, ${0.05 + rand() * 0.08})`;
    colorCtx.beginPath();
    colorCtx.arc(x, y, r, 0, Math.PI * 2);
    colorCtx.fill();

    const rough = 188 + Math.floor(rand() * 42);
    roughCtx.fillStyle = `rgba(${rough}, ${rough}, ${rough}, ${0.04 + rand() * 0.08})`;
    roughCtx.beginPath();
    roughCtx.arc(x, y, r * 1.15, 0, Math.PI * 2);
    roughCtx.fill();

    const bump = 110 + Math.floor(rand() * 46);
    bumpCtx.fillStyle = `rgba(${bump}, ${bump}, ${bump}, ${0.04 + rand() * 0.08})`;
    bumpCtx.beginPath();
    bumpCtx.arc(x, y, r * 0.9, 0, Math.PI * 2);
    bumpCtx.fill();
  }

  for (let i = 0; i < 18; i++) {
    const y = 8 + i * 14 + rand() * 5;
    colorCtx.fillStyle = `rgba(118, 120, 124, ${0.05 + rand() * 0.04})`;
    colorCtx.fillRect(0, y, size, 1 + rand() * 1.5);
    roughCtx.fillStyle = `rgba(236, 236, 236, ${0.04 + rand() * 0.05})`;
    roughCtx.fillRect(0, y, size, 1 + rand() * 1.5);
  }

  for (let i = 0; i < 10; i++) {
    const x = 16 + i * 22 + rand() * 6;
    colorCtx.fillStyle = `rgba(140, 142, 145, ${0.04 + rand() * 0.04})`;
    colorCtx.fillRect(x, 0, 1 + rand() * 1.5, size);
    bumpCtx.fillStyle = `rgba(150, 150, 150, ${0.03 + rand() * 0.03})`;
    bumpCtx.fillRect(x, 0, 1 + rand() * 1.5, size);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2.5, 2.5);

  const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.copy(map.repeat);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.copy(map.repeat);

  return { map, roughnessMap, bumpMap };
}

export function concreteMaterial(
  color: number,
  opts?: { side?: THREE.Side },
): THREE.MeshStandardMaterial {
  const textures = concreteSurfaceTextures;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.94,
    metalness: 0.02,
    ...(textures
      ? {
          map: textures.map,
          roughnessMap: textures.roughnessMap,
          bumpMap: textures.bumpMap,
        }
      : null),
    bumpScale: textures ? 0.035 : 0,
    ...(opts?.side != null ? { side: opts.side } : null),
  });
}

const concreteSurfaceTextures = createConcreteSurfaceTextures();

export const floorPlaceholderMeshMaterials = {
  corridorFloor: concreteMaterial(0xc9ced4),
  corridorCeil: concreteMaterial(0xe5e8eb, { side: THREE.DoubleSide }),
  corridorWall: concreteMaterial(0xd4d8dc),
  corridorExteriorWall: concreteMaterial(0xe7eef7),
  unitFloor: concreteMaterial(0xc5cbd1),
  unitCeil: concreteMaterial(0xe3e7ea, { side: THREE.DoubleSide }),
  unitWall: concreteMaterial(0xd2d7db),
  unitExteriorWall: concreteMaterial(0xe5edf6),
  coreFloor: concreteMaterial(0xc2c8ce),
  coreCeil: concreteMaterial(0xe0e4e8, { side: THREE.DoubleSide }),
  coreWall: concreteMaterial(0xd0d6db),
  coreExteriorWall: concreteMaterial(0xe4ebf4),
  miscFloor: concreteMaterial(0xc7ccd2),
  miscCeil: concreteMaterial(0xe2e6ea, { side: THREE.DoubleSide }),
  miscWall: concreteMaterial(0xd3d8dc),
  miscExteriorWall: concreteMaterial(0xe5edf6),
  /**
   * Holed structural pad under the plate (lobby / courtyard shell). Procedural concrete only —
   * stairwell patina (`stairwell.json` landing/floor) is applied inside shaft meshes, not here.
   */
  slab: concreteMaterial(0xc2c8ce),
  /** Tall vertical box under the plate — keep procedural; patina is for horizontal slabs only. */
  groundFootprintOccluder: concreteMaterial(0xc3c9cf, { side: THREE.DoubleSide }),
  lobbyDoorFrame: new THREE.MeshStandardMaterial({
    color: 0x5a5856,
    roughness: 0.5,
    metalness: 0.42,
  }),
} as const;
