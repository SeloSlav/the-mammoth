export type ApartmentDecorGlbOptimizeStatus = {
  rel: string;
  exists: boolean;
  hasBackup?: boolean;
  tris?: number | null;
  bytes?: number;
  kb?: number;
  backupTris?: number | null;
  backupKb?: number | null;
  allWebp?: boolean;
};

export type ApartmentDecorGlbOptimizeResult = {
  rel: string;
  skipped?: boolean;
  reason?: string;
  error?: string;
  beforeTris?: number | null;
  afterTris?: number | null;
  beforeKB?: number;
  afterKB?: number;
  triReductionPct?: number;
  simplified?: boolean;
  meshOnly?: boolean;
};

export type ApartmentDecorGlbRevertResult = {
  rel: string;
  ok: boolean;
  reason?: string;
  tris?: number | null;
  kb?: number;
};

function editorGlbOptimizeHttpError(path: string, res: Response, body: string): Error {
  const hint =
    res.status === 403 && body.includes("EDITOR_SAVE")
      ? " Set EDITOR_SAVE=1 when starting the editor dev server."
      : "";
  return new Error(`${body || res.statusText} (${res.status} ${path})${hint}`);
}

export async function fetchApartmentDecorGlbOptimizeStatus(
  modelRelPath: string,
): Promise<ApartmentDecorGlbOptimizeStatus> {
  const path = `/__editor/apartment-decor-glb-status?rel=${encodeURIComponent(modelRelPath)}`;
  const res = await fetch(path, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw editorGlbOptimizeHttpError(path, res, text);
  return JSON.parse(text) as ApartmentDecorGlbOptimizeStatus;
}

export async function postOptimizeApartmentDecorGlb(args: {
  modelRelPath: string;
  ratio: number;
  compressTextures: boolean;
  fromBackup: boolean;
}): Promise<ApartmentDecorGlbOptimizeResult> {
  const path = "/__editor/optimize-apartment-decor-glb";
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw editorGlbOptimizeHttpError(path, res, text);
  return JSON.parse(text) as ApartmentDecorGlbOptimizeResult;
}

export async function postRevertApartmentDecorGlb(
  modelRelPath: string,
): Promise<ApartmentDecorGlbRevertResult> {
  const path = "/__editor/revert-apartment-decor-glb";
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelRelPath }),
  });
  const text = await res.text();
  if (!res.ok) throw editorGlbOptimizeHttpError(path, res, text);
  return JSON.parse(text) as ApartmentDecorGlbRevertResult;
}
