import * as THREE from "three";
import { RenderPipeline } from "three/webgpu";
import { pass, renderOutput } from "three/tsl";
import {
  mammothToonPostProcess,
  type MammothToonPostProcessOptions,
} from "./mammothToonPostProcess.js";

export type MammothToonRenderPipeline = {
  render: () => void;
  syncToonPassEnabled: (enabled: boolean) => void;
  dispose: () => void;
};

export const DEFAULT_MAMMOTH_TOON_POST_PROCESS_OPTIONS: MammothToonPostProcessOptions = {
  levels: 4,
  stylizeMix: 0.88,
  shadowFloor: 0.2,
  minSourceFraction: 0.76,
  edgeStrength: 0.42,
  edgeThreshold: 0.16,
};

/**
 * WebGPU render pipeline with optional screen-space toon post grade on the tonemapped beauty pass.
 */
export function createMammothToonRenderPipeline(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  toonOptions: MammothToonPostProcessOptions = DEFAULT_MAMMOTH_TOON_POST_PROCESS_OPTIONS,
): MammothToonRenderPipeline {
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode("output");
  const renderPipeline = new RenderPipeline(renderer, scenePass);

  let toonEnabled = false;

  const applyOutputNode = (): void => {
    if (toonEnabled) {
      renderPipeline.outputColorTransform = false;
      const tonemapped = renderOutput(
        sceneColor,
        renderer.toneMapping,
        renderer.outputColorSpace,
      );
      renderPipeline.outputNode = mammothToonPostProcess(tonemapped, toonOptions);
    } else {
      renderPipeline.outputColorTransform = true;
      renderPipeline.outputNode = scenePass;
    }
    renderPipeline.needsUpdate = true;
  };

  return {
    render() {
      renderPipeline.render();
    },
    syncToonPassEnabled(enabled: boolean) {
      if (enabled === toonEnabled) return;
      toonEnabled = enabled;
      applyOutputNode();
    },
    dispose() {
      renderPipeline.dispose();
    },
  };
}
