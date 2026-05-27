import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  buildProceduralApartmentDecorVisual,
  isProceduralApartmentDecorModelPath,
  postProcessApartmentDecorGltfScene,
} from "@the-mammoth/world";
import { loadGltfFirstMatch, resolveStaticModelFetchUrl } from "@the-mammoth/engine";
import {
  apartmentDecorFetchPath,
  apartmentDecorModelExtension,
} from "./fpApartmentDecorAssets.js";
import { resolveGrowTrayDecorModelRelPath } from "../fpBalconyGrow/fpBalconyGrowTrayDecor.js";

export type ApartmentDecorTemplateRequest = {
  cacheKey: string;
  modelRelPath: string;
};

type DecorPlacementModelSource = {
  modelRelPath: string;
};

const DEFAULT_PREFETCH_CONCURRENCY = 6;

export async function resolveApartmentDecorTemplateCacheKey(
  modelRelPath: string,
): Promise<string> {
  if (isProceduralApartmentDecorModelPath(modelRelPath)) return modelRelPath;
  return resolveStaticModelFetchUrl(apartmentDecorFetchPath(modelRelPath));
}

export async function loadFpApartmentDecorTemplate(
  gltfLoader: GLTFLoader,
  objLoader: OBJLoader,
  url: string,
  modelRelPath: string,
): Promise<THREE.Object3D> {
  const procedural = buildProceduralApartmentDecorVisual(modelRelPath);
  if (procedural) return procedural;
  switch (apartmentDecorModelExtension(modelRelPath)) {
    case ".glb": {
      const { scene } = await loadGltfFirstMatch([url], gltfLoader);
      postProcessApartmentDecorGltfScene(scene, modelRelPath);
      return scene;
    }
    case ".obj":
      return await objLoader.loadAsync(url);
    default:
      throw new Error(`Unsupported apartment decor asset: ${modelRelPath}`);
  }
}

export async function collectApartmentDecorTemplateRequests(
  decorPlacements: readonly DecorPlacementModelSource[],
): Promise<ApartmentDecorTemplateRequest[]> {
  const uniqueModelRelPaths = new Set<string>();
  for (const decor of decorPlacements) {
    uniqueModelRelPaths.add(resolveGrowTrayDecorModelRelPath(decor.modelRelPath));
  }

  const requests: ApartmentDecorTemplateRequest[] = [];
  await Promise.all(
    [...uniqueModelRelPaths].map(async (modelRelPath) => {
      const cacheKey = await resolveApartmentDecorTemplateCacheKey(modelRelPath);
      requests.push({ cacheKey, modelRelPath });
    }),
  );

  const deduped = new Map<string, ApartmentDecorTemplateRequest>();
  for (const request of requests) {
    deduped.set(request.cacheKey, request);
  }
  return [...deduped.values()];
}

export async function prefetchApartmentDecorTemplates(args: {
  gltfLoader: GLTFLoader;
  objLoader: OBJLoader;
  templateByUrl: Map<string, THREE.Object3D>;
  isBuildStale: (epoch: number) => boolean;
  epoch: number;
  requests: readonly ApartmentDecorTemplateRequest[];
  maxConcurrent?: number;
}): Promise<{ loadedCount: number; elapsedMs: number }> {
  const missing = args.requests.filter((request) => !args.templateByUrl.has(request.cacheKey));
  if (missing.length === 0) return { loadedCount: 0, elapsedMs: 0 };

  const maxConcurrent = Math.max(
    1,
    Math.min(args.maxConcurrent ?? DEFAULT_PREFETCH_CONCURRENCY, missing.length),
  );
  const t0 = performance.now();
  let loadedCount = 0;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (args.isBuildStale(args.epoch)) return;
      const index = cursor;
      cursor += 1;
      if (index >= missing.length) return;
      const request = missing[index]!;
      try {
        const template = await loadFpApartmentDecorTemplate(
          args.gltfLoader,
          args.objLoader,
          request.cacheKey,
          request.modelRelPath,
        );
        if (args.isBuildStale(args.epoch)) return;
        template.userData.mammothApartmentDecorTemplate = request.cacheKey;
        args.templateByUrl.set(request.cacheKey, template);
        loadedCount += 1;
      } catch (err) {
        console.warn(
          "[mountFpApartmentDecorMeshes] failed to prefetch decor asset",
          request.modelRelPath,
          request.cacheKey,
          err,
        );
      }
    }
  };

  await Promise.all(Array.from({ length: maxConcurrent }, () => worker()));
  return { loadedCount, elapsedMs: performance.now() - t0 };
}
