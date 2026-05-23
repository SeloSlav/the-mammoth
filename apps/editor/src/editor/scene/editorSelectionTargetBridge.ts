import type * as THREE from "three";

let resolveSelectionTarget: (() => THREE.Object3D | null) | null = null;

export function registerEditorSelectionTargetResolver(
  resolver: () => THREE.Object3D | null,
): void {
  resolveSelectionTarget = resolver;
}

export function unregisterEditorSelectionTargetResolver(): void {
  resolveSelectionTarget = null;
}

export function getEditorSelectionTarget(): THREE.Object3D | null {
  return resolveSelectionTarget?.() ?? null;
}
