export type SyncOwnedApartmentDecorDefaultScaleResult = {
  ok: true;
  source: "editor" | "disk";
  modelCount: number;
  placementCount: number;
  builtinsPath: string;
  outPath: string;
};

export type SyncOwnedApartmentDecorDefaultScalePlacedItem = {
  modelRelPath: string;
  uniformScale: number;
  verticalScaleMul?: number;
};

function editorScaleSyncHttpError(path: string, res: Response, body: string): Error {
  return new Error(`${path} failed (${res.status}): ${body || res.statusText}`);
}

export async function postSyncOwnedApartmentDecorDefaultScale(args?: {
  placedItems?: readonly SyncOwnedApartmentDecorDefaultScalePlacedItem[];
}): Promise<SyncOwnedApartmentDecorDefaultScaleResult> {
  const path = "/__editor/sync-owned-apartment-decor-default-scale";
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args?.placedItems ? { placedItems: args.placedItems } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw editorScaleSyncHttpError(path, res, text);
  return JSON.parse(text) as SyncOwnedApartmentDecorDefaultScaleResult;
}
