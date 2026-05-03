import styles from "./LoginGate.module.css";

/**
 * Compositor-driven atmosphere only — no canvas, no RAF, no WebGPU on this screen.
 *
 * Keeps typing + Spacetime baseline on the main thread from fighting a second GPU loop; gameplay still
 * Keeps typing + Spacetime baseline from fighting a GPU menu loop; gameplay mounts via `mountFpSession` / mesh cache.
 */
export function MammothAuthBackdrop() {
  return <div aria-hidden="true" className={styles.backdropAtmosphere} />;
}
