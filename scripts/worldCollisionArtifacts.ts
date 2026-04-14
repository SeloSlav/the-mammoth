import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STAMP_REL_PATH = "content/building/.collision-artifacts-stamp.json";

function readJsonFilesSorted(absDir: string): [string, string][] {
  try {
    return readdirSync(absDir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => [name, readFileSync(join(absDir, name), "utf8")] as [string, string]);
  } catch {
    return [];
  }
}

export function computeWorldCollisionSourceFingerprint(repoRoot: string): string {
  const hash = createHash("sha1");
  const mammothPath = join(repoRoot, "content/building/mammoth.json");
  hash.update("building:mammoth.json\0");
  hash.update(readFileSync(mammothPath, "utf8"));
  for (const [name, text] of readJsonFilesSorted(join(repoRoot, "content/building/floors"))) {
    hash.update(`floor:${name}\0`);
    hash.update(text);
  }
  for (const [name, text] of readJsonFilesSorted(
    join(repoRoot, "content/building/floor-overrides"),
  )) {
    hash.update(`override:${name}\0`);
    hash.update(text);
  }
  for (const [name, text] of readJsonFilesSorted(join(repoRoot, "content/elevator"))) {
    hash.update(`elevator:${name}\0`);
    hash.update(text);
  }
  return hash.digest("hex");
}

export function collisionArtifactsStampPath(repoRoot: string): string {
  return join(repoRoot, STAMP_REL_PATH);
}

export function writeWorldCollisionArtifactsStamp(args: {
  repoRoot: string;
  sourceFingerprint: string;
  generatedFiles: string[];
}): void {
  const stamp = {
    builtAtIso: new Date().toISOString(),
    sourceFingerprint: args.sourceFingerprint,
    generatedFiles: args.generatedFiles,
  };
  writeFileSync(collisionArtifactsStampPath(args.repoRoot), `${JSON.stringify(stamp, null, 2)}\n`);
}
