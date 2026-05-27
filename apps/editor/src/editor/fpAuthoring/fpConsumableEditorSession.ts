import * as THREE from "three";
import {
  createFPRig,
  createGltfModelLoadRegistry,
  fpLocomotionConstants,
  FP_MELEE_HAND_RIGHT,
  loadGltfSceneFirstMatch,
  LocalFirstPersonPresenter,
  mammothCatalogGlbCandidates,
  type FpAuthoringPick,
} from "@the-mammoth/engine";

/** Default consumable mount position relative to the shared hand grip anchor. */
const CONSUMABLE_MOUNT_DEFAULT_POS = new THREE.Vector3(0.32, -0.18, 0.38);

export type ConsumableMount = {
  positionM: { x: number; y: number; z: number };
  eulerRad: { x: number; y: number; z: number };
  scaleM: { x: number; y: number; z: number };
};

/** Preferred consumable GLB URL — first path in {@link mammothCatalogGlbCandidates}. */
export function consumableGltfUri(consumableId: string): string {
  const first = [...mammothCatalogGlbCandidates(consumableId)][0];
  if (!first) throw new Error(`mammothCatalogGlbCandidates: empty for ${consumableId}`);
  return first;
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
  private presenter?: LocalFirstPersonPresenter;
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
      const registry = createGltfModelLoadRegistry();
      await registry.preload(FP_MELEE_HAND_RIGHT);
      const presenter = new LocalFirstPersonPresenter({
        viewModelParent: headPitch,
        modelRegistry: registry,
        weaponDefinition: null,
      });
      await presenter.initViewmodel();
      presenter.setFpGameplayStockHandVisible(true);
      presenter.setAuthoringFrozen(true);
      session.presenter = presenter;
      const gripAnchor = presenter.getFpGripAnchorObject();
      if (!gripAnchor) throw new Error("FP grip anchor missing");

      const consumableScene = (
        await loadGltfSceneFirstMatch([...mammothCatalogGlbCandidates(consumableId)])
      ).scene;
      const consumableRoot = new THREE.Group();
      consumableRoot.name = `fp_consumable_root_${consumableId}`;
      consumableRoot.position.copy(CONSUMABLE_MOUNT_DEFAULT_POS);
      consumableScene.traverse((o) => {
        o.castShadow = false;
        o.frustumCulled = false;
      });
      consumableRoot.add(consumableScene);
      gripAnchor.add(consumableRoot);
      session.consumableRoot = consumableRoot;
    } catch (e) {
      session.initError = e instanceof Error ? e.message : String(e);
      session.presenter?.dispose();
      session.presenter = undefined;
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
    this.presenter?.dispose();
    this.presenter = undefined;
    this.scene.remove(this.rig);
    this.consumableRoot = null;
  }
}
