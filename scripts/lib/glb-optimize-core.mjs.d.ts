export const APARTMENT_DECOR_OBJECTS_PREFIX: string;

export function normalizeModelRelPath(
  raw: string,
  options?: { apartmentOnly?: boolean },
): string | null;

export function countTrianglesInGlbFile(filePath: string): number | null;

export function optimizeGlb(args: {
  rel: string;
  modelsRoot: string;
  backupDir: string;
  apply: boolean;
  reorderIndices?: boolean;
  compressTextures?: boolean;
  simplifyOptions?: { ratio?: number; error?: number; lockBorder?: boolean } | null;
  fromBackup?: boolean;
}): Promise<Record<string, unknown>>;

export function revertGlbFromBackup(args: {
  rel: string;
  modelsRoot: string;
  backupDir: string;
}): Record<string, unknown>;

export function readGlbOptimizeStatus(args: {
  rel: string;
  modelsRoot: string;
  backupDir: string;
}): Record<string, unknown>;

export function resolveTextureMaxSize(rel: string): number;

export function logGlbResult(result: Record<string, unknown>): void;
