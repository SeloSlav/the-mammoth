const floorJsonModules = import.meta.glob<{ default: unknown }>(
  "../../../../content/building/floors/*.json",
  { eager: true },
);

export function floorPayloadByDocId(floorDocId: string): unknown {
  const suffix = `/${floorDocId}.json`.replaceAll("\\", "/");
  for (const [path, mod] of Object.entries(floorJsonModules)) {
    if (path.replaceAll("\\", "/").endsWith(suffix)) return mod.default;
  }
  throw new Error(`Missing floor JSON for id "${floorDocId}"`);
}
