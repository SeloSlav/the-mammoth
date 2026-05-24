import * as THREE from "three";

/** Match authoritative `apps/server/src/npc.rs` babushka hit volume. */
export const BABUSHKA_HIT_BODY_RADIUS_M = 0.28;
export const BABUSHKA_HIT_BODY_HEIGHT_M = 1.55;
/** Match `apps/server/src/combat_stub.rs` square head hit box. */
export const BABUSHKA_HIT_HEAD_BOX_M = 0.32;
export const BABUSHKA_HIT_HEAD_LIFT_ABOVE_BODY_M = 0.14;
export const BABUSHKA_HIT_HEAD_BOX_CROWN_INSET_M = 0.04;
export const BABUSHKA_HIT_BODY_GAP_M = 0.02;

export function babushkaHeadHitBoxTopY(bodyHeightM = BABUSHKA_HIT_BODY_HEIGHT_M): number {
  return (
    bodyHeightM + BABUSHKA_HIT_HEAD_LIFT_ABOVE_BODY_M - BABUSHKA_HIT_HEAD_BOX_CROWN_INSET_M
  );
}

export function babushkaHeadHitBoxCenterY(bodyHeightM = BABUSHKA_HIT_BODY_HEIGHT_M): number {
  return babushkaHeadHitBoxTopY(bodyHeightM) - BABUSHKA_HIT_HEAD_BOX_M * 0.5;
}

/** Torso-only body debug height — stops below head box with a gap. */
export function babushkaBodyHitTorsoHeightM(bodyHeightM = BABUSHKA_HIT_BODY_HEIGHT_M): number {
  const headBottom = babushkaHeadHitBoxCenterY(bodyHeightM) - BABUSHKA_HIT_HEAD_BOX_M * 0.5;
  return Math.max(0, headBottom - BABUSHKA_HIT_BODY_GAP_M);
}

const FLASH_SEC = 1.35;
const FLASH_TAG_WIDTH_M = 1.05;
const FLASH_TAG_HEIGHT_M = 0.28;

function makeFlashTexture(label: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
  if ("roundRect" in ctx && typeof ctx.roundRect === "function") {
    ctx.roundRect(8, 12, canvas.width - 16, canvas.height - 24, 14);
    ctx.fill();
  } else {
    ctx.fillRect(8, 12, canvas.width - 16, canvas.height - 24);
  }
  ctx.font = "800 42px system-ui, sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, canvas.width * 0.5, canvas.height * 0.5);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Dev overlay — wireframe authoritative body/head volumes plus a short-lived hit label. */
export class NpcHitDebugOverlay {
  readonly root = new THREE.Group();
  private readonly flashSprite: THREE.Sprite;
  private readonly flashMaterial: THREE.SpriteMaterial;
  private readonly retiredFlashTextures: THREE.Texture[] = [];
  private flashSec = 0;

  constructor() {
    this.root.name = "npc_hit_debug_overlay";

    const torsoHeightM = babushkaBodyHitTorsoHeightM();
    const bodyGeom = new THREE.BoxGeometry(
      BABUSHKA_HIT_BODY_RADIUS_M * 2,
      torsoHeightM,
      BABUSHKA_HIT_BODY_RADIUS_M * 2,
    );
    const bodyLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(bodyGeom),
      new THREE.LineBasicMaterial({
        color: 0x44ff99,
        transparent: true,
        opacity: 0.9,
        depthTest: true,
      }),
    );
    bodyLines.position.y = torsoHeightM * 0.5;
    this.root.add(bodyLines);

    const headGeom = new THREE.BoxGeometry(
      BABUSHKA_HIT_HEAD_BOX_M,
      BABUSHKA_HIT_HEAD_BOX_M,
      BABUSHKA_HIT_HEAD_BOX_M,
    );
    const headLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(headGeom),
      new THREE.LineBasicMaterial({
        color: 0xff3355,
        transparent: true,
        opacity: 0.98,
        depthTest: true,
      }),
    );
    headLines.position.y = babushkaHeadHitBoxCenterY();
    this.root.add(headLines);

    const flashY = babushkaHeadHitBoxTopY() + 0.12;
    this.flashMaterial = new THREE.SpriteMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      map: makeFlashTexture("BODY", "#ffd166"),
    });
    this.flashSprite = new THREE.Sprite(this.flashMaterial);
    this.flashSprite.name = "npc_hit_debug_flash";
    this.flashSprite.position.set(0, flashY, 0);
    this.flashSprite.scale.set(FLASH_TAG_WIDTH_M, FLASH_TAG_HEIGHT_M, 1);
    this.flashSprite.renderOrder = 4000;
    this.flashSprite.visible = false;
    this.root.add(this.flashSprite);
  }

  flashHit(headshot: boolean): void {
    const label = headshot ? "HEADSHOT" : "BODY";
    const color = headshot ? "#ff4466" : "#ffd166";
    const prev = this.flashMaterial.map;
    this.flashMaterial.map = makeFlashTexture(label, color);
    this.flashMaterial.needsUpdate = true;
    if (prev) this.retiredFlashTextures.push(prev);
    this.flashSprite.visible = true;
    this.flashSec = FLASH_SEC;
  }

  tick(dt: number): void {
    if (this.flashSec <= 0) return;
    this.flashSec = Math.max(0, this.flashSec - dt);
    const t = this.flashSec / FLASH_SEC;
    this.flashSprite.visible = t > 0.02;
    this.flashMaterial.opacity = Math.min(1, t * 1.15);
  }

  dispose(): void {
    this.flashMaterial.map?.dispose();
    for (const tex of this.retiredFlashTextures) {
      tex.dispose();
    }
    this.retiredFlashTextures.length = 0;
    this.flashMaterial.dispose();
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as THREE.Mesh).material;
      if (mat instanceof THREE.Material) mat.dispose();
    });
  }
}
