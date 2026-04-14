import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  createFPRig,
  createGltfModelLoadRegistry,
  fpLocomotionConstants,
  FP_MELEE_HAND_RIGHT,
  type FpAuthoringPick,
} from "@the-mammoth/engine";

/** Mirrors the shoulder + lift defaults from LocalFirstPersonPresenter. */
const HAND_RIG_DEFAULT_POS = new THREE.Vector3(0.34, -0.1, 0.08);
/** Default hand rotation (matches default in LocalFirstPersonPresenter: Euler XYZ 1.5708, 0, π). */
const HAND_EULER_DEFAULT = new THREE.Euler(1.5708, 0, Math.PI, "XYZ");

/** Default consumable mount position in head-pitch space — near the grip, in front of the player. */
const CONSUMABLE_MOUNT_DEFAULT_POS = new THREE.Vector3(0.32, -0.18, 0.38);

export type ConsumableMount = {
  positionM: { x: number; y: number; z: number };
  eulerRad: { x: number; y: number; z: number };
  scaleM: { x: number; y: number; z: number };
};

/** URL for a consumable's FP GLB given its catalog ID. */
export function consumableGltfUri(consumableId: string): string {
  return `/static/models/consumables/${consumableId}.glb`;
}

/**
 * Loads FP hand + consumable mesh under a real {@link createFPRig} head-pitch node.
 * Analogous to {@link FpViewmodelEditorSession} but for catalog consumables rather than weapons.
 */
export class FpConsumableEditorSession {
  readonly scene: THREE.Scene;
  readonly consumableId: string;

  private readonly headPitch: THREE.Object3D;
  private readonly headCameraPitch: THREE.Object3D;
  private readonly fpCamera: THREE.PerspectiveCamera;
  private readonly rig: THREE.Group;
  private consumableRoot: THREE.Group | null = null;
  private disposed = false;
  private initError: string | null = null;

  private constructor(
    scene: THREE.Scene,
    rig: THREE.Group,
    headPitch: THREE.Object3D,
    headCameraPitch: THREE.Object3D,
    fpCamera: THREE.PerspectiveCamera,
    consumableId: string,
  ) {
    this.scene = scene;
    this.rig = rig;
    this.headPitch = headPitch;
    this.headCameraPitch = headCameraPitch;
    this.fpCamera = fpCamera;
    this.consumableId = consumableId;
  }

  static async create(
    scene: THREE.Scene,
    consumableId: string,
  ): Promise<FpConsumableEditorSession> {
    const { rig, headPitch, headCameraPitch, camera } = createFPRig(fpLocomotionConstants.eyeStand);
    rig.position.set(0, 0, 0);
    scene.add(rig);

    const session = new FpConsumableEditorSession(
      scene,
      rig,
      headPitch,
      headCameraPitch,
      camera,
      consumableId,
    );

    try {
      const loader = new GLTFLoader();
      // Hand — reuse the registry for the hand (it may already be cached by weapon session).
      const handRegistry = createGltfModelLoadRegistry();
      await handRegistry.preload(FP_MELEE_HAND_RIGHT);
      const handResult = handRegistry.instantiateLoaded(FP_MELEE_HAND_RIGHT);
      if (!handResult.ok) throw new Error(`Hand GLB failed: ${handResult.error}`);

      const handRig = new THREE.Group();
      handRig.name = "fp_consumable_hand_rig";
      handRig.position.copy(HAND_RIG_DEFAULT_POS);
      const handScene = handResult.root as THREE.Object3D;
      handScene.rotation.copy(HAND_EULER_DEFAULT);
      handScene.traverse((o) => {
        o.castShadow = false;
        o.frustumCulled = false;
      });
      handRig.add(handScene);
      headPitch.add(handRig);

      // Consumable mesh — loaded directly (not in the typed ModelAssetKey registry).
      const consumableGltf = await loader.loadAsync(consumableGltfUri(consumableId));
      const consumableRoot = new THREE.Group();
      consumableRoot.name = `fp_consumable_root_${consumableId}`;
      consumableRoot.position.copy(CONSUMABLE_MOUNT_DEFAULT_POS);
      consumableGltf.scene.traverse((o) => {
        o.castShadow = false;
        o.frustumCulled = false;
      });
      consumableRoot.add(consumableGltf.scene);
      headPitch.add(consumableRoot);
      session.consumableRoot = consumableRoot;
    } catch (e) {
      session.initError = e instanceof Error ? e.message : String(e);
      scene.remove(rig);
    }

    return session;
  }

  getInitError(): string | null {
    return this.initError;
  }

  isReady(): boolean {
    return !this.disposed && this.consumableRoot !== null;
  }

  getGameplayCamera(): THREE.PerspectiveCamera {
    return this.fpCamera;
  }

  /** Single pick: the consumable root (position/rotation/scale are what the editor authors). */
  getPickList(): FpAuthoringPick[] {
    if (!this.consumableRoot) return [];
    return [{ id: "consumableRoot", label: "Consumable root", object: this.consumableRoot }];
  }

  getAuthoringOrbitTarget(out: THREE.Vector3): boolean {
    if (!this.consumableRoot) return false;
    this.consumableRoot.getWorldPosition(out);
    return true;
  }

  /**
   * Apply an authored mount transform from a loaded presentation JSON.
   * Called once on session creation and on hot-reload of the JSON file.
   */
  applyMount(mount: ConsumableMount): void {
    if (!this.consumableRoot) return;
    this.consumableRoot.position.set(mount.positionM.x, mount.positionM.y, mount.positionM.z);
    this.consumableRoot.rotation.set(mount.eulerRad.x, mount.eulerRad.y, mount.eulerRad.z, "XYZ");
    this.consumableRoot.scale.set(mount.scaleM.x, mount.scaleM.y, mount.scaleM.z);
  }

  /** Read the current authored mount off the live scene object. */
  readMount(): ConsumableMount | null {
    if (!this.consumableRoot) return null;
    const p = this.consumableRoot.position;
    const r = this.consumableRoot.rotation;
    const s = this.consumableRoot.scale;
    const r4 = (n: number) => Math.round(n * 10000) / 10000;
    return {
      positionM: { x: r4(p.x), y: r4(p.y), z: r4(p.z) },
      eulerRad: { x: r4(r.x), y: r4(r.y), z: r4(r.z) },
      scaleM: { x: r4(s.x), y: r4(s.y), z: r4(s.z) },
    };
  }

  tick(_dt: number, pitchRad: number): void {
    if (this.disposed) return;
    this.headPitch.rotation.x = pitchRad;
    this.headCameraPitch.rotation.x = pitchRad;
  }

  applyAuthoringPitchOnly(pitchRad: number): void {
    if (this.disposed) return;
    this.headPitch.rotation.x = pitchRad;
    this.headCameraPitch.rotation.x = pitchRad;
  }

  syncWorldMatrices(): void {
    if (this.disposed) return;
    this.rig.updateMatrixWorld(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.rig);
    this.consumableRoot = null;
  }
}
