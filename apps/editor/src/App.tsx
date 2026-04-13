import { useEffect, useRef, useState } from "react";
import { bootstrapEditorFromContent } from "./editor/editorBootstrap.js";
import { mountEditorScene } from "./editor/editorSceneRuntime.js";
import { EditorChrome } from "./ui/EditorChrome.js";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    return mountEditorScene(canvas);
  }, [ready]);

  return (
    <>
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0 }} />
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
          <p style={{ margin: "8px 0 0", opacity: 0.85 }}>
            Ensure the dev server is running so `/content/**` is served from the repo
            (see Vite plugin in apps/editor/vite.config.ts).
          </p>
        </div>
      ) : null}
      {ready ? <EditorChrome /> : null}
    </>
  );
}
