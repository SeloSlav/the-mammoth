import * as THREE from "three";

export type BalconyGrowInspectScreenAnchor = {
  x: number;
  y: number;
  visible: boolean;
};

const listeners = new Set<() => void>();
let screenAnchor: BalconyGrowInspectScreenAnchor | null = null;
const _projectScratch = new THREE.Vector3();

export function getBalconyGrowInspectScreenAnchor(): BalconyGrowInspectScreenAnchor | null {
  return screenAnchor;
}

export function subscribeBalconyGrowInspectScreenAnchor(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function clearBalconyGrowInspectPresentation(): void {
  if (screenAnchor === null) return;
  screenAnchor = null;
  for (const l of listeners) l();
}

export function publishBalconyGrowInspectScreenAnchor(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  world: THREE.Vector3 | null,
): void {
  if (!world) {
    clearBalconyGrowInspectPresentation();
    return;
  }

  _projectScratch.copy(world);
  _projectScratch.project(camera);

  const next: BalconyGrowInspectScreenAnchor =
    _projectScratch.z > 1
      ? { x: 0, y: 0, visible: false }
      : {
          x: (_projectScratch.x * 0.5 + 0.5) * canvas.clientWidth,
          y: (-_projectScratch.y * 0.5 + 0.5) * canvas.clientHeight,
          visible: true,
        };

  if (
    screenAnchor?.x === next.x &&
    screenAnchor?.y === next.y &&
    screenAnchor?.visible === next.visible
  ) {
    return;
  }

  screenAnchor = next;
  for (const l of listeners) l();
}
