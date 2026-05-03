import { useEffect, useRef, useState } from "react";
import { primeMegablockStaticWorldMeshBuild } from "../game/fpSession/fpSessionStaticWorldMeshCache.js";
import styles from "./LoginGate.module.css";

/**
 * Dedicated WebGPU/pass on the login canvas: shared megablock mesh cache + orbital framing.
 *
 * Separate from gameplay `mountFpSession` so teardown is clean. Mesh CPU and WebGPU init are
 * staggered (prime + deferred dynamic import) so first-visit hydration and form input stay responsive.
 */
export function MammothAuthBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [webGpuUnavailable, setWebGpuUnavailable] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      primeMegablockStaticWorldMeshBuild();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let dispose: (() => void) | undefined;
    let innerRaf = 0;

    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => {
        void import("./mountMammothAuthBackdrop.js")
          .then((mod) => mod.mountMammothAuthBackdrop(canvas))
          .then((d) => {
            if (cancelled) {
              d();
              return;
            }
            dispose = d;
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            setWebGpuUnavailable(true);
            console.warn("[MammothAuthBackdrop] WebGPU menu backdrop unavailable", err);
          });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      dispose?.();
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={styles.backdropCanvas}
        data-mammoth-auth-backdrop="1"
      />
      {webGpuUnavailable ? <div aria-hidden="true" className={styles.backdropFallback} /> : null}
    </>
  );
}
