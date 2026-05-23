import { useEffect, useRef, useState } from "react";
import { bootstrapEditorFromContent } from "./editor/bootstrap/editorBootstrap.js";
import { mountEditorScene } from "./editor/editorScene/editorSceneRuntime.js";
import { useEditorStore } from "./state/editorStore.js";
import { EditorApartmentLayoutLoadingOverlay } from "./ui/EditorApartmentLayoutLoadingOverlay.js";
import { EditorChrome } from "./ui/EditorChrome.js";
import { EditorCombatSimViewportPrompt } from "./ui/EditorCombatSimViewportPrompt.js";
import { EditorViewportStatsStack } from "./ui/EditorViewportStatsStack.js";

export default function App() {
  const editorCanvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const workspace = useEditorStore((s) => s.workspace);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await bootstrapEditorFromContent();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const canvas = editorCanvasRef.current;
    if (!canvas) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    setGpuError(null);
    void mountEditorScene(canvas)
      .then((d) => {
        if (!cancelled) dispose = d;
      })
      .catch((e: unknown) => {
        if (!cancelled) setGpuError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [ready]);

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          overflow: "hidden",
        }}
      >
        <canvas
          ref={editorCanvasRef}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
          }}
        />
      </div>
      {loadError ? (
        <div
          style={{
            position: "fixed",
            left: 12,
            top: 12,
            maxWidth: 420,
            padding: 12,
            background: "rgba(40,0,0,0.9)",
            color: "#fcc",
            fontSize: 13,
            zIndex: 10,
          }}
        >
          <strong>Load failed</strong>
          <p style={{ margin: "8px 0 0" }}>{loadError}</p>
        </div>
      ) : null}
      {gpuError ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "#0f1118",
            color: "#e8ecf4",
            fontFamily: "system-ui, sans-serif",
            fontSize: 15,
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 520 }}>
            <strong style={{ display: "block", marginBottom: 12 }}>WebGPU required</strong>
            {gpuError}
          </div>
        </div>
      ) : null}
      {ready ? (
        <>
          <EditorApartmentLayoutLoadingOverlay />
          <EditorViewportStatsStack />
          {workspace === "combat_sim" ? <EditorCombatSimViewportPrompt /> : null}
          <EditorChrome />
        </>
      ) : null}
    </>
  );
}
