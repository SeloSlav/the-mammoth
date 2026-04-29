import { useEffect, useRef, useState } from "react";
import { mountMammothAuthBackdrop } from "./mountMammothAuthBackdrop.js";
import styles from "./LoginGate.module.css";

export function MammothAuthBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [webGpuUnavailable, setWebGpuUnavailable] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let dispose: (() => void) | undefined;

    void mountMammothAuthBackdrop(canvas)
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

    return () => {
      cancelled = true;
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
