import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Vitest/Node: file URLs for Draco decoders under `apps/client/public/static/draco/gltf/`. */
export function nodeGltfDracoDecoderPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const decoderDir = path.resolve(here, "../../../../apps/client/public/static/draco/gltf");
  return `${pathToFileURL(decoderDir).href}/`;
}

/** Vitest/Node: file URLs for Basis transcoder under `apps/client/public/basis/`. */
export function nodeGltfKtx2TranscoderPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const transcoderDir = path.resolve(here, "../../../../apps/client/public/basis");
  return `${pathToFileURL(transcoderDir).href}/`;
}
