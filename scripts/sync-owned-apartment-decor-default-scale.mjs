#!/usr/bin/env node
/**
 * Regenerate packages/schemas/src/ownedApartmentDecorDefaultScale.ts from
 * content/apartment/owned_apartment_builtins.json (first placement per modelRelPath).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { syncOwnedApartmentDecorDefaultScaleFromRepoRoot } from "./lib/sync-owned-apartment-decor-default-scale-core.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = syncOwnedApartmentDecorDefaultScaleFromRepoRoot(repoRoot);
console.log(
  `Wrote ${result.modelCount} model scales (${result.placementCount} placements) to ${result.outPath}`,
);
