import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createFPCamera } from "@the-mammoth/engine";
import {
  instantiateBuildingFloorStack,
  parseBuildingDoc,
  parseFloorDoc,
} from "@the-mammoth/world";
import buildingDoc from "../../../content/building/mammoth.json";
import { EditorChrome } from "./ui/EditorChrome";

const floorJsonModules = import.meta.glob<{ default: unknown }>(
  "../../../content/building/floors/*.json",
  { eager: true },
);

function floorPayloadByDocId(floorDocId: string): unknown {
  const suffix = `/${floorDocId}.json`.replaceAll("\\", "/");
  for (const [path, mod] of Object.entries(floorJsonModules)) {
    if (path.replaceAll("\\", "/").endsWith(suffix)) return mod.default;
  }
  throw new Error(`Missing floor JSON for id "${floorDocId}"`);
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const building = parseBuildingDoc(buildingDoc);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222228);

    const camera = createFPCamera();
    const buildingRoot = instantiateBuildingFloorStack(building, (id) =>
      parseFloorDoc(floorPayloadByDocId(id)),
    );
    scene.add(buildingRoot);

    const hemi = new THREE.HemisphereLight(0xa0a8d8, 0x303038, 0.9);
    scene.add(hemi);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const setSize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(canvas);

    camera.position.set(-38, 28, 22);
    camera.lookAt(2, 18, 0);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      scene.clear();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0 }} />
      <EditorChrome />
    </>
  );
}
