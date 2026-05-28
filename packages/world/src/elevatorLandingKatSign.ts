import * as THREE from "three";
import type { CardinalFace } from "./wallWithDoorCutout.js";
import { MAMMOTH_CORRIDOR_HALLWAY_SHELL_UD } from "./mammothMeshUserData.js";

/** Corridor wall quad (m) — large landing label, similar width to Končar bay signage. */
const KAT_CORRIDOR_PLANE_W = 1.34;
const KAT_CORRIDOR_PLANE_H = 0.4;

/**
 * Croatian-style storey label for elevator landing signage (`"${n} KAT"`).
 *
 * @param storyLevelIndex 1-based plate index ({@link instantiateBuildingFloorStack}: story 1 = ground).
 * @returns `null` for ground and for legacy unknown storey `99` (single-plate default).
 */
export function landingKatSignTextForStory(storyLevelIndex: number): string | null {
  if (storyLevelIndex <= 1) return null;
  if (storyLevelIndex === 99) return null;
  return `${storyLevelIndex} KAT`;
}

export function landingKatSignText(
  storyLevelIndex: number,
  storyShortLabel?: string,
): string | null {
  if (storyLevelIndex <= 1) return null;
  if (storyLevelIndex === 99) return null;
  const label = storyShortLabel?.trim();
  return `${label && label.length > 0 ? label : String(storyLevelIndex)} KAT`;
}

/** Opposite compass face (e↔w, n↔s). */
export function oppositeCardinalFace(face: CardinalFace): CardinalFace {
  switch (face) {
    case "e":
      return "w";
    case "w":
      return "e";
    case "n":
      return "s";
    case "s":
      return "n";
  }
}

export function createElevatorKatSignMaterial(text: string): THREE.MeshBasicMaterial | null {
  const cw = 1280;
  const ch = 384;
  let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    canvas = c;
  } else if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(cw, ch);
  }
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx || !("fillRect" in ctx)) return null;

  ctx.fillStyle = "#eef1f5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#2a3138";
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = "#1a1f26";
  ctx.font = '700 132px system-ui, "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.5);

  const tex = new THREE.CanvasTexture(
    canvas as unknown as HTMLCanvasElement,
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  /** Default `flipY` (true), same as Končar corridor signs — do not set `false` or text reads inverted on `lookAt` planes. */
  tex.needsUpdate = true;
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

/**
 * “N KAT” signs on the **corridor** wall opposite the wall that carries each elevator door
 * (same anchor data as Končar manufacturer signs).
 */
export function addOppositeCorridorKatSignMeshes(
  group: THREE.Group,
  sx: number,
  _sy: number,
  sz: number,
  storyLevelIndex: number,
  storyShortLabel: string | undefined,
  placements: readonly {
    corridorWall: CardinalFace;
    yDoorTop: number;
    zMid: number;
    xMid: number;
  }[],
): void {
  const label = landingKatSignText(storyLevelIndex, storyShortLabel);
  if (!label || placements.length === 0) return;
  const mat = createElevatorKatSignMaterial(label);
  if (!mat) return;

  const wt = 0.11;
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  const geo = new THREE.PlaneGeometry(KAT_CORRIDOR_PLANE_W, KAT_CORRIDOR_PLANE_H);
  const inset = 0.014;
  const lookDepth = 2.5;

  let i = 0;
  for (const pl of placements) {
    const wall = oppositeCardinalFace(pl.corridorWall);
    const y = pl.yDoorTop + 0.07 + KAT_CORRIDOR_PLANE_H * 0.5;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `elevator_sign_kat_corridor_${i++}`;
    /** Corridor-only signage — hide together with other interior shells from the exterior view. */
    mesh.userData.mammothUnitInterior = true;
    mesh.userData[MAMMOTH_CORRIDOR_HALLWAY_SHELL_UD] = true;

    if (wall === "e") {
      const x = hx - wt - inset;
      mesh.position.set(x, y, pl.zMid);
      mesh.lookAt(x - lookDepth, y, pl.zMid);
    } else if (wall === "w") {
      const x = -hx + wt + inset;
      mesh.position.set(x, y, pl.zMid);
      mesh.lookAt(x + lookDepth, y, pl.zMid);
    } else if (wall === "n") {
      const z = hz - wt - inset;
      mesh.position.set(pl.xMid, y, z);
      mesh.lookAt(pl.xMid, y, z - lookDepth);
    } else {
      const z = -hz + wt + inset;
      mesh.position.set(pl.xMid, y, z);
      mesh.lookAt(pl.xMid, y, z + lookDepth);
    }
    group.add(mesh);
  }
}
