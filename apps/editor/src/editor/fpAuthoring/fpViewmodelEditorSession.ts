import * as THREE from "three";
import {
  createFPRig,
  createGltfModelLoadRegistry,
  fpLocomotionConstants,
  FP_MELEE_HAND_RIGHT,
  getWeaponDefinition,
  GltfModelLoadRegistry,
  LocalFirstPersonPresenter,
  mammothCatalogGlbCandidates,
} from "@the-mammoth/engine";
import type { LocalPlayerGameplayState } from "@the-mammoth/game";
import type { FpAuthorWeaponId } from "./weaponPresentationDiskSave.js";

function idleGameplayState(pitchRad: number, equippedPrimary: FpAuthorWeaponId): LocalPlayerGameplayState {
  return {
    kind: "local",
    playerIdHex: "0000000000000000000000000000000000000000000000000000000000000000",
    position: { x: 0, y: 0, z: 0 },
    yawRad: 0,
    pitchRad,
    freeLookActive: false,
    stridePhaseRad: 0,
    velocity: { x: 0, y: 0, z: 0 },
    grounded: true,
    stance: "stand",
    locomotion: "idle",
    equippedPrimary,
    meleeAttackSeq: 0,
    primaryAction: "none",
    life: "alive",
    animation: { locomotion: "idle", overlay: undefined, aimWeight01: 0 },
  };
}

/**
 * Loads FP hand + weapon under a real {@link createFPRig} head pitch node (same graph as gameplay).
 * Presenter stays authoring-frozen so gizmo edits are not overwritten by walk/swing.
 */
export class FpViewmodelEditorSession {
  readonly scene: THREE.Scene;
  private readonly headPitch: THREE.Object3D;
  private readonly headCameraPitch: THREE.Object3D;
  private readonly fpCamera: THREE.PerspectiveCamera;
  private readonly rig: THREE.Group;
  private readonly weaponId: FpAuthorWeaponId;
  private presenter?: LocalFirstPersonPresenter;
  private disposed = false;
  private initError: string | null = null;

  private constructor(
    scene: THREE.Scene,
    rig: THREE.Group,
    headPitch: THREE.Object3D,
    headCameraPitch: THREE.Object3D,
    fpCamera: THREE.PerspectiveCamera,
    weaponId: FpAuthorWeaponId,
  ) {
    this.scene = scene;
    this.rig = rig;
    this.headPitch = headPitch;
    this.headCameraPitch = headCameraPitch;
    this.fpCamera = fpCamera;
    this.weaponId = weaponId;
  }

  static async create(
    scene: THREE.Scene,
    weaponId: FpAuthorWeaponId,
  ): Promise<FpViewmodelEditorSession> {
    const { rig, headPitch, headCameraPitch, camera } = createFPRig(fpLocomotionConstants.eyeStand);
    rig.position.set(0, 0, 0);
    scene.add(rig);
    const session = new FpViewmodelEditorSession(
      scene,
      rig,
      headPitch,
      headCameraPitch,
      camera,
      weaponId,
    );
    try {
      const def = getWeaponDefinition(weaponId);
      if (!def) throw new Error(`Unknown FP authoring weapon: ${weaponId}`);
      if (def.modelRef.kind !== "gltf") {
        throw new Error(`FP authoring weapon ${weaponId} has no GLTF viewmodel (modelRef.kind=${def.modelRef.kind})`);
      }
      const registry = createGltfModelLoadRegistry();
      await registry.preload(FP_MELEE_HAND_RIGHT);
      await (registry as GltfModelLoadRegistry).preloadWithUriCandidates(
        def.modelRef,
        mammothCatalogGlbCandidates(weaponId),
      );
      const presenter = new LocalFirstPersonPresenter({
        viewModelParent: headPitch,
        modelRegistry: registry,
        weaponDefinition: def,
      });
      await presenter.initViewmodel();
      presenter.setAuthoringFrozen(true);
      session.presenter = presenter;
    } catch (e) {
      session.initError = e instanceof Error ? e.message : String(e);
      scene.remove(rig);
    }
    return session;
  }

  getInitError(): string | null {
    return this.initError;
  }

  getGameplayCamera(): THREE.PerspectiveCamera {
    return this.fpCamera;
  }

  getPresenter(): LocalFirstPersonPresenter | undefined {
    return this.presenter;
  }

  tick(dt: number, pitchRad: number): void {
    if (!this.presenter || this.disposed) return;
    this.headPitch.rotation.x = pitchRad;
    this.headCameraPitch.rotation.x = pitchRad;
    this.presenter.update(idleGameplayState(pitchRad, this.weaponId), dt);
  }

  /**
   * Editor: advance head-pitch only (no {@link LocalFirstPersonPresenter#update}) while the
   * transform gizmo is dragging so gizmo-driven rig edits are not overwritten each frame.
   */
  applyAuthoringPitchOnly(pitchRad: number): void {
    if (this.disposed) return;
    this.headPitch.rotation.x = pitchRad;
    this.headCameraPitch.rotation.x = pitchRad;
  }

  /** Call before gameplay-camera picking so world matrices match the live rig. */
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
  }
}
