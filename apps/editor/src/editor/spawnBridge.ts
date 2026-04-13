type SpawnFn = () => {
  position: [number, number, number];
  forward: [number, number, number];
};

let spawnFn: SpawnFn | null = null;

export function registerEditorSpawnCalculator(fn: SpawnFn | null): void {
  spawnFn = fn;
}

/** World-space point in front of the editor camera (XZ-forward from camera yaw). */
export function spawnInFrontOfCamera(distance = 14): [number, number, number] {
  if (!spawnFn) return [0, 8, 0];
  const { position, forward } = spawnFn();
  return [
    position[0] + forward[0] * distance,
    position[1] + forward[1] * distance,
    position[2] + forward[2] * distance,
  ];
}
