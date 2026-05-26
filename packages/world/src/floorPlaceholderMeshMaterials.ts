import * as THREE from "three";
import {
  applyStandardAuthoringSlot,
  stripArchitecturalDetailMaps,
  type StandardAuthoringSlot,
} from "./elevatorVisualMaterialUtils.js";
import { FLOOR_SHELL_DISABLE_NORMAL_MAPS } from "./featureFlags.js";

// Default materials use basecolor + normal + roughness. Height/metal textures are opt-in only (see PbrMaterialConfig).

/** @see `./featureFlags.ts` — re-export for call sites importing from floor materials. */
export { FLOOR_SHELL_DISABLE_NORMAL_MAPS } from "./featureFlags.js";

/**
 * Tiled shell PBR: default renderer anisotropy (often 16×) scales texture fetches at grazing
 * angles — huge interior surfaces make that disproportionately expensive vs. visible gain.
 */
const BUILDING_SHELL_TEXTURE_ANISOTROPY = 1;

function applyShellTextureAnisotropy(mat: THREE.MeshStandardMaterial): void {
  for (const key of ["map", "normalMap", "roughnessMap", "bumpMap", "aoMap"] as const) {
    const t = mat[key];
    if (t instanceof THREE.Texture) t.anisotropy = BUILDING_SHELL_TEXTURE_ANISOTROPY;
  }
}

function applyShellNormalMapToggle(mat: THREE.MeshStandardMaterial): void {
  if (!FLOOR_SHELL_DISABLE_NORMAL_MAPS) return;
  mat.normalMap = null;
  mat.needsUpdate = true;
}

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

  map.anisotropy = BUILDING_SHELL_TEXTURE_ANISOTROPY;
  roughnessMap.anisotropy = BUILDING_SHELL_TEXTURE_ANISOTROPY;
  bumpMap.anisotropy = BUILDING_SHELL_TEXTURE_ANISOTROPY;

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

/** PBR sheet flooring for **upper-storey** corridor shells only (`matsFor` uses this when level > 1). */
const CORRIDOR_HALL_FLOOR_AUTHORING: StandardAuthoringSlot = {
  name: "corridor-hall-vinyl-upper",
  roughness: 1,
  metalness: 0.02,
  mapUrl: "/static/materials/corridor-hall-vinyl/basecolor.png",
  normalMapUrl: "/static/materials/corridor-hall-vinyl/normal.png",
  roughnessMapUrl: "/static/materials/corridor-hall-vinyl/roughness.png",
};

const corridorHallFloorMaterial = (() => {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });
  applyStandardAuthoringSlot(m, CORRIDOR_HALL_FLOOR_AUTHORING);
  stripArchitecturalDetailMaps(m, { metalness: 0.02 });
  /** Shell floor top UVs use ~2.75 m per UV unit; low repeat stretches the sheet (~8.5 m/cycle at 0.32). */
  const rep = 0.32;
  for (const key of ["map", "normalMap", "roughnessMap"] as const) {
    const t = m[key];
    if (t) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
    }
  }
  applyShellTextureAnisotropy(m);
  applyShellNormalMapToggle(m);
  return m;
})();

/** PBR for indoor cast-concrete floors (shells, units, cores, plate slab, stair/elev pit slabs — not upper corridor vinyl). */
const CONCRETE_INTERIOR_FLOOR_AUTHORING: StandardAuthoringSlot = {
  name: "concrete-floor-interior-shell",
  roughness: 1,
  metalness: 0.02,
  mapUrl: "/static/materials/concrete-floor-interior/basecolor.png",
  normalMapUrl: "/static/materials/concrete-floor-interior/normal.png",
  roughnessMapUrl: "/static/materials/concrete-floor-interior/roughness.png",
};

export const interiorConcreteFloorShellMaterial = (() => {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });
  applyStandardAuthoringSlot(m, CONCRETE_INTERIOR_FLOOR_AUTHORING);
  stripArchitecturalDetailMaps(m, { metalness: 0.02 });
  const rep = 0.3;
  for (const key of ["map", "normalMap", "roughnessMap"] as const) {
    const t = m[key];
    if (t) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
    }
  }
  applyShellTextureAnisotropy(m);
  applyShellNormalMapToggle(m);
  return m;
})();

/** PBR tile set for building shell faces on the exterior (cladding only — interior walls stay procedural). */
const CONCRETE_EXTERIOR_WALL_AUTHORING: StandardAuthoringSlot = {
  name: "concrete-exterior-wall",
  roughness: 1,
  metalness: 0.02,
  mapUrl: "/static/materials/concrete-exterior/basecolor.png",
  normalMapUrl: "/static/materials/concrete-exterior/normal.png",
  roughnessMapUrl: "/static/materials/concrete-exterior/roughness.png",
};

export const exteriorConcreteWallMaterial = (() => {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });
  applyStandardAuthoringSlot(m, CONCRETE_EXTERIOR_WALL_AUTHORING);
  stripArchitecturalDetailMaps(m, { metalness: 0.02 });
  /** Shell cladding UVs are ~2.75 m per UV unit (`wallWithDoorCutout`); low repeat stretches the sheet
   *  so large-scale concrete reads believable on long walls (~14 m per full texture cycle at 0.2). */
  const rep = 0.2;
  for (const key of ["map", "normalMap", "roughnessMap"] as const) {
    const t = m[key];
    if (t) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
    }
  }
  applyShellTextureAnisotropy(m);
  applyShellNormalMapToggle(m);
  return m;
})();

/** Weathered red brick PATINA set for unit N/S shell cladding and balcony bay side cheeks. */
const APARTMENT_UNIT_EXTERIOR_BRICK_AUTHORING: StandardAuthoringSlot = {
  name: "apartment-unit-exterior-brick",
  roughness: 1,
  metalness: 0,
  mapUrl: "/static/materials/apartment-unit-exterior-brick/basecolor.png",
  normalMapUrl: "/static/materials/apartment-unit-exterior-brick/normal.png",
};

export const unitExteriorBrickWallMaterial = (() => {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });
  applyStandardAuthoringSlot(m, APARTMENT_UNIT_EXTERIOR_BRICK_AUTHORING);
  stripArchitecturalDetailMaps(m, { metalness: 0 });
  /** Brick courses read tighter than slab concrete at the same world-metric wall UV scale. */
  const rep = 0.52;
  for (const key of ["map", "normalMap"] as const) {
    const t = m[key];
    if (t) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
    }
  }
  applyShellTextureAnisotropy(m);
  m.roughness = 1;
  m.metalness = 0;
  m.envMap = null;
  m.envMapIntensity = 0;
  /** Softer normals — sun-bleached mortar reads flatter than fresh brick relief. */
  m.normalScale.set(0.42, 0.42);
  /**
   * Albedo multiply above 1.0 lifts the dark PATINA basecolor toward dusty salmon-beige.
   * Warm bias (R > G > B) keeps a hint of brick without the deep burgundy read outdoors.
   */
  m.color.setRGB(1.62, 1.52, 1.42);
  return m;
})();

/**
 * Authoring for red panel concrete used on **elevator landing swing-door** frames (maps previously on hoistway shells).
 * Clone via {@link elevatorLandingDoorFrameMaterial} in {@link createSwingDoorMaterials}; apartment kits override maps in JSON.
 */
export const elevatorLandingDoorFrameAuthoring: StandardAuthoringSlot = {
  name: "elevator-hoistway-exterior-frame",
  roughness: 1,
  metalness: 0.1,
  mapUrl: "/static/materials/elevator-hoistway-exterior/basecolor.png",
  normalMapUrl: "/static/materials/elevator-hoistway-exterior/normal.png",
  roughnessMapUrl: "/static/materials/elevator-hoistway-exterior/roughness.png",
};

/** Shared landing-door frame material (clone per swing). Full PBR — not stripped like merged shell mats. */
export const elevatorLandingDoorFrameMaterial = (() => {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });
  applyStandardAuthoringSlot(m, elevatorLandingDoorFrameAuthoring);
  /** Door rails/stiles are ~0.05–2 m faces — slightly tighter repeat than shaft cladding so grain reads at arm's length. */
  const rep = 0.35;
  for (const key of ["map", "normalMap", "roughnessMap"] as const) {
    const t = m[key];
    if (t) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
    }
  }
  applyShellTextureAnisotropy(m);
  return m;
})();

/** PBR for corridor / lobby **interior** perimeter walls: ground plate and upper corridors beside units. */
const GROUND_LEVEL_CORRIDOR_WALL_AUTHORING: StandardAuthoringSlot = {
  name: "ground-level-corridor-interior-wall",
  roughness: 1,
  metalness: 0.02,
  mapUrl: "/static/materials/ground-level-interior-wall/basecolor.png",
  normalMapUrl: "/static/materials/ground-level-interior-wall/normal.png",
  roughnessMapUrl: "/static/materials/ground-level-interior-wall/roughness.png",
};

export const groundLevelCorridorInteriorWallMaterial = (() => {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });
  applyStandardAuthoringSlot(m, GROUND_LEVEL_CORRIDOR_WALL_AUTHORING);
  stripArchitecturalDetailMaps(m, { metalness: 0.02 });
  /** Match shell wall planar UV scale (~2.75 m/tile); similar repeat to interior floor vinyl. */
  const rep = 0.3;
  for (const key of ["map", "normalMap", "roughnessMap"] as const) {
    const t = m[key];
    if (t) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
    }
  }
  applyShellTextureAnisotropy(m);
  applyShellNormalMapToggle(m);
  return m;
})();

/** PBR ceiling for corridor shells: ground storey and upper corridors with unit entry door cuts. */
const BUILDING_CORRIDOR_CEILING_AUTHORING: StandardAuthoringSlot = {
  name: "building-corridor-ceiling",
  roughness: 1,
  metalness: 0.02,
  mapUrl: "/static/materials/building-ceiling/basecolor.png",
  normalMapUrl: "/static/materials/building-ceiling/normal.png",
  roughnessMapUrl: "/static/materials/building-ceiling/roughness.png",
};

export const buildingCorridorCeilingMaterial = (() => {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  applyStandardAuthoringSlot(m, BUILDING_CORRIDOR_CEILING_AUTHORING);
  stripArchitecturalDetailMaps(m, { metalness: 0.02 });
  /** Shell ceilings use {@link applyShellFloorPlanarTopUV} (~2.75 m/UV); same repeat band as corridor vinyl. */
  const rep = 0.32;
  for (const key of ["map", "normalMap", "roughnessMap"] as const) {
    const t = m[key];
    if (t) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
    }
  }
  applyShellTextureAnisotropy(m);
  applyShellNormalMapToggle(m);
  return m;
})();

/** PBR for apartment **unit** interior shells: walls + ceiling only (`matsFor("unit")`). */
const APARTMENT_UNIT_INTERIOR_WALL_CEILING_AUTHORING: StandardAuthoringSlot = {
  name: "apartment-unit-painted-plaster-wall-ceiling",
  /** Scalar multiplies the roughness map (matte painted plaster). */
  roughness: 1,
  metalness: 0.02,
  mapUrl: "/static/materials/apartment-unit-interior/basecolor.png",
  normalMapUrl: "/static/materials/apartment-unit-interior/normal.png",
  roughnessMapUrl: "/static/materials/apartment-unit-interior/roughness.png",
};

const apartmentUnitInteriorWallCeilingMaterial = (() => {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  applyStandardAuthoringSlot(m, APARTMENT_UNIT_INTERIOR_WALL_CEILING_AUTHORING);
  stripArchitecturalDetailMaps(m, { metalness: 0.02 });
  const rep = 0.28;
  for (const key of ["map", "normalMap", "roughnessMap"] as const) {
    const t = m[key];
    if (t) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
    }
  }
  applyShellTextureAnisotropy(m);
  /** Keep tangent detail for plaster; `applyShellNormalMapToggle` would drop it and flatten the read. */
  /** Authored basecolor only — profile tint applied at mount via engine shell mood grade. */
  m.color.setHex(0xffffff);
  m.normalScale.set(1.14, 1.14);
  return m;
})();

/** PBR basketweave parquet for apartment **unit** floors only (`matsFor("unit")` floor slot). */
const APARTMENT_UNIT_FLOOR_AUTHORING: StandardAuthoringSlot = {
  name: "apartment-unit-basketweave-parquet-floor",
  roughness: 1,
  metalness: 0.02,
  mapUrl: "/static/materials/apartment-unit-floor/basecolor.png",
  normalMapUrl: "/static/materials/apartment-unit-floor/normal.png",
  roughnessMapUrl: "/static/materials/apartment-unit-floor/roughness.png",
};

const apartmentUnitFloorMaterial = (() => {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });
  applyStandardAuthoringSlot(m, APARTMENT_UNIT_FLOOR_AUTHORING);
  stripArchitecturalDetailMaps(m, { metalness: 0.02 });
  /** Basketweave cells are small — slightly higher repeat than slab concrete so planks read at room scale. */
  const rep = 0.42;
  for (const key of ["map", "normalMap", "roughnessMap"] as const) {
    const t = m[key];
    if (t) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
    }
  }
  applyShellTextureAnisotropy(m);
  /** Apartment parquet keeps normals — raking lamp light reads plank depth (see profile `floorNormalScale`). */
  m.normalScale.set(1.26, 1.26);
  /** Authored basecolor only — profile tint applied at mount via engine shell mood grade. */
  m.color.setHex(0xffffff);
  return m;
})();

export const floorPlaceholderMeshMaterials = {
  corridorFloor: interiorConcreteFloorShellMaterial,
  corridorFloorUpperStorey: corridorHallFloorMaterial,
  corridorCeil: concreteMaterial(0xe5e8eb, { side: THREE.DoubleSide }),
  buildingCorridorCeiling: buildingCorridorCeilingMaterial,
  corridorWall: concreteMaterial(0xd4d8dc),
  /** Corridor shells: ground (`1` / `99`) and upper storeys with unit-adjacent doors — see {@link addHollowRoomShell}. */
  groundLevelCorridorInteriorWall: groundLevelCorridorInteriorWallMaterial,
  corridorExteriorWall: exteriorConcreteWallMaterial,
  /** Elevator landing swing-door frame rail/stile/fill — red panel PBR (clone for each leaf). */
  elevatorLandingDoorFrame: elevatorLandingDoorFrameMaterial,
  unitFloor: apartmentUnitFloorMaterial,
  unitCeil: apartmentUnitInteriorWallCeilingMaterial,
  unitWall: apartmentUnitInteriorWallCeilingMaterial,
  unitExteriorWall: exteriorConcreteWallMaterial,
  unitExteriorBrickWall: unitExteriorBrickWallMaterial,
  coreFloor: interiorConcreteFloorShellMaterial,
  coreCeil: concreteMaterial(0xe0e4e8, { side: THREE.DoubleSide }),
  coreWall: concreteMaterial(0xd0d6db),
  coreExteriorWall: exteriorConcreteWallMaterial,
  miscFloor: interiorConcreteFloorShellMaterial,
  miscCeil: concreteMaterial(0xe2e6ea, { side: THREE.DoubleSide }),
  miscWall: concreteMaterial(0xd3d8dc),
  miscExteriorWall: exteriorConcreteWallMaterial,
  /**
   * Holed structural pad under the plate (lobby / courtyard shell). Procedural concrete only —
   * stairwell patina (`stairwell.json` landing/floor) is applied inside shaft meshes, not here.
   */
  slab: interiorConcreteFloorShellMaterial,
  /** Tall vertical box under the plate — keep procedural; patina is for horizontal slabs only. */
  groundFootprintOccluder: concreteMaterial(0xc3c9cf, { side: THREE.DoubleSide }),
  /** Lobby / ground shell double-door reveals — match corridor concrete so trims are not dark “picture frames”. */
  lobbyDoorFrame: concreteMaterial(0xc4cad1),
  /** Ground lobby doors: trim on the **facade** side only (slightly inset from cladding outer). */
  lobbyDoorFrameExterior: concreteMaterial(0x2a2e34),
} as const;
