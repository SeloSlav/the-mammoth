import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mammothCatalogGlbCandidates } from "@the-mammoth/assets";

/** `three` resolves to WebGPU typings in this app, but crafting preview uses shipped WebGL at runtime. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PreviewWebGlRenderer = (THREE as any).WebGLRenderer as new (parameters?: Record<string, unknown>) => {
  dispose(): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(value: number): void;
  outputColorSpace: unknown;
  toneMapping: number;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
};

type Props = {
  defId: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * Lightweight WebGL turntable preview (separate from the FP WebGPU session).
 */
export function MammothGlbPreviewCanvas({ defId, style, className }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof defId !== "string" || !defId.length) return;

    const w = Math.max(1, Math.floor(el.clientWidth));
    const h = Math.max(1, Math.floor(el.clientHeight));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    el.replaceChildren(canvas);

    const renderer = new PreviewWebGlRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, w / h, 0.02, 48);
    camera.position.set(0.72, 0.38, 0.95);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xfff2e6, 1.05);
    key.position.set(2.5, 4.5, 1.25);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc8daf5, 0.35);
    rim.position.set(-2.8, 1.2, -3.6);
    scene.add(rim);

    const pivot = new THREE.Group();
    scene.add(pivot);

    let disposed = false;
    const loader = new GLTFLoader();
    let root: THREE.Object3D | null = null;

    const candidates = [...mammothCatalogGlbCandidates(defId)];
    const tryNext = (): void => {
      const url = candidates.shift();
      if (!url || disposed) return;
      void loader.loadAsync(url).then((gltf) => {
        if (disposed) {
          gltf.scene.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
              const m = o as THREE.Mesh;
              if (Array.isArray(m.material)) m.material.forEach((mm) => mm.dispose());
              else m.material.dispose();
            }
          });
          return;
        }
        root = gltf.scene;
        pivot.add(root);
        const bb = new THREE.Box3().setFromObject(root);
        const cx = (bb.min.x + bb.max.x) * 0.5;
        const cy = (bb.min.y + bb.max.y) * 0.5;
        const cz = (bb.min.z + bb.max.z) * 0.5;
        root.position.sub(new THREE.Vector3(cx, cy, cz));
        const size = bb.getSize(new THREE.Vector3());
        const r = Math.max(size.x, size.y, size.z) * 0.5 || 0.12;
        const dist = Math.max(0.55, r * 3.15);
        camera.position.set(dist * 0.85, r * 0.75 + dist * 0.12, dist);
        camera.lookAt(0, r * 0.25, 0);
      }).catch(() => {
        tryNext();
      });
    };
    tryNext();

    let t = 0;
    const animate = () => {
      if (disposed) return;
      rafRef.current = requestAnimationFrame(animate);
      const dt = 1 / 60;
      t += dt;
      pivot.rotation.y += dt * 0.55;
      if (root) {
        root.position.y = Math.sin(t * 1.05) * 0.015;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = o as THREE.Mesh;
          if (Array.isArray(m.material)) m.material.forEach((mm) => mm.dispose());
          else m.material.dispose();
        }
      });
      renderer.dispose();
      el.replaceChildren();
    };
  }, [defId]);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        minHeight: 220,
        borderRadius: 10,
        overflow: "hidden",
        ...style,
      }}
    />
  );
}
