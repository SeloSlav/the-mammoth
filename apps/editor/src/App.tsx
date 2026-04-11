import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createFPCamera } from "@the-mammoth/engine";
import { buildFloorMeshes, parseFloorDoc } from "@the-mammoth/world";
import floorDoc from "../../../content/building/floors/floor_01_east.json";
import { EditorChrome } from "./ui/EditorChrome";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const doc = parseFloorDoc(floorDoc);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222228);

    const camera = createFPCamera();
    scene.add(buildFloorMeshes(doc));

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

    camera.position.set(2, 2.5, 10);
    camera.lookAt(0, 1, 0);

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
