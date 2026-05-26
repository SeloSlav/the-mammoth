import { BABUSHKA_NPC_PERCEPTION } from "@the-mammoth/game";
import { NpcPresenterFrame } from "../../NpcPresenter.js";
import type { NpcVisualAnimationState } from "../../NpcVisualSmoothingState.js";
import type { ReplicatedNpcSnapshot } from "@the-mammoth/game";
import {
  AnimatedBabushkaBody,
  createBabushkaNpcBody,
  preloadBabushkaNpcBody,
} from "./babushkaNpcBody.js";

export {
  AnimatedBabushkaBody,
  BABUSHKA_NPC_AUTHORITATIVE_HEIGHT_M,
  BABUSHKA_NPC_DEATH_CLIP_SEC,
  BABUSHKA_NPC_GLB_URI,
  createBabushkaNpcBody,
  isBabushkaNpcBodyReady,
  preloadBabushkaNpcBody,
  seedBabushkaNpcBodyTemplateForTests,
} from "./babushkaNpcBody.js";

export class BabushkaNpcPresenter extends NpcPresenterFrame {
  private readonly body: AnimatedBabushkaBody;
  protected readonly perceptionProfile = BABUSHKA_NPC_PERCEPTION;

  private constructor(body: AnimatedBabushkaBody) {
    super("babushka_npc_root");
    this.body = body;
    this.root.add(body.root);
  }

  static createSync(): BabushkaNpcPresenter {
    return new BabushkaNpcPresenter(createBabushkaNpcBody());
  }

  static async create(): Promise<BabushkaNpcPresenter> {
    await preloadBabushkaNpcBody();
    return BabushkaNpcPresenter.createSync();
  }

  protected tickBody(
    snapshot: ReplicatedNpcSnapshot,
    dt: number,
    animationState: NpcVisualAnimationState,
  ): void {
    this.body.update(snapshot, dt, animationState);
  }

  protected disposeBody(): void {
    this.body.dispose();
  }
}
