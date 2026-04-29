import * as THREE from "three";

export type InstallFpSessionTransientDebugConsoleArgs = {
  scene: THREE.Scene;
  buildingRoot: THREE.Group;
  cellRoot: THREE.Group;
  renderer: THREE.WebGPURenderer;
};

/**
 * Temporary perf triage: expose scene handles on `globalThis.__fpDebug` so render-cost hogs can be
 * isolated from the DevTools console without a rebuild. Remove once the 16 FPS regression is fixed.
 *
 * Usage in console:
 *   __fpDebug.list()                           // print all top-level scene children w/ names + tris
 *   __fpDebug.toggle("buildingRoot")           // hide / show by name or index
 *   __fpDebug.onlyShow("ground")               // hide everything except this one
 *   __fpDebug.showAll()                        // restore all visibility
 *   __fpDebug.info()                           // renderer.info.render counters for the next frame
 */
export function installFpSessionTransientDebugConsole(
  args: InstallFpSessionTransientDebugConsoleArgs,
): void {
  const { scene, buildingRoot, cellRoot, renderer } = args;
  const debugHandles = {
    scene,
    buildingRoot,
    cellRoot,
    ground: scene.getObjectByName("fp_session_ground_plane"),
    renderer,
  };
  const pickByKey = (key: string | number): THREE.Object3D | null => {
    if (typeof key === "number") return scene.children[key] ?? null;
    const named =
      scene.getObjectByName(key) ??
      (debugHandles as Record<string, unknown>)[key];
    return named instanceof THREE.Object3D ? named : null;
  };
  (globalThis as unknown as { __fpDebug?: unknown }).__fpDebug = {
    ...debugHandles,
    list: () => {
      scene.children.forEach((c, i) => {
        let tris = 0;
        c.traverse((o) => {
          if (o instanceof THREE.Mesh && o.visible) {
            const g = o.geometry as THREE.BufferGeometry | undefined;
            if (g?.index) tris += g.index.count / 3;
            else if (g?.attributes?.position) tris += g.attributes.position.count / 3;
          }
        });
        console.log(
          `[${i}] visible=${c.visible} type=${c.type} name="${c.name}" ~tris=${Math.round(tris)}`,
        );
      });
    },
    toggle: (key: string | number) => {
      const obj = pickByKey(key);
      if (!obj) return console.warn("no match", key);
      obj.visible = !obj.visible;
      console.log(`${obj.name || obj.type} visible=${obj.visible}`);
    },
    onlyShow: (key: string | number) => {
      const keep = pickByKey(key);
      if (!keep) return console.warn("no match", key);
      for (const c of scene.children) c.visible = c === keep;
      console.log(`only "${keep.name || keep.type}" visible`);
    },
    showAll: () => {
      for (const c of scene.children) c.visible = true;
    },
    info: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    }),
  };
}
