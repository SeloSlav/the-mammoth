import { afterEach, describe, expect, it, vi } from "vitest";
import { FpBackgroundMusic } from "./fpBackgroundMusic";

class FakeArrayBufferLike {
  constructor(readonly url: string) {}

  slice(): FakeArrayBufferLike {
    return this;
  }
}

class FakeAudioParam {
  value = 0;

  setValueAtTime(value: number): void {
    this.value = value;
  }

  linearRampToValueAtTime(value: number): void {
    this.value = value;
  }

  cancelScheduledValues(): void {}
}

class FakeAudioNode {
  connect(): FakeAudioNode {
    return this;
  }

  disconnect(): void {}
}

class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam();
}

class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = "lowpass";
  readonly frequency = new FakeAudioParam();
  readonly Q = new FakeAudioParam();
}

class FakePannerNode extends FakeAudioNode {
  panningModel: PanningModelType = "HRTF";
  distanceModel: DistanceModelType = "inverse";
  refDistance = 1;
  maxDistance = 10_000;
  rolloffFactor = 1;
  readonly positionX = new FakeAudioParam();
  readonly positionY = new FakeAudioParam();
  readonly positionZ = new FakeAudioParam();
}

class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  readonly playbackRate = new FakeAudioParam();

  constructor(private readonly startedUrls: string[]) {
    super();
  }

  start(): void {
    const url = (this.buffer as unknown as { url?: string } | null)?.url;
    if (url) this.startedUrls.push(url);
  }

  stop(): void {
    this.onended?.();
  }
}

class FakeAudioContext {
  currentTime = 0;
  readonly destination = new FakeAudioNode() as unknown as AudioDestinationNode;
  readonly startedUrls: string[] = [];

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    return new FakeAudioBufferSourceNode(this.startedUrls) as unknown as AudioBufferSourceNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    return new FakeBiquadFilterNode() as unknown as BiquadFilterNode;
  }

  createPanner(): PannerNode {
    return new FakePannerNode() as unknown as PannerNode;
  }

  async decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer> {
    const url = (audioData as unknown as FakeArrayBufferLike).url;
    return {
      duration: url.includes("concrete-creak.mp3") ? 120 : 30,
      url,
    } as unknown as AudioBuffer;
  }
}

describe("FpBackgroundMusic", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps ambience and random world cues active when the music toggle is off", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      return {
        ok: true,
        arrayBuffer: async () => new FakeArrayBufferLike(String(input)) as unknown as ArrayBuffer,
      } as Response;
    });

    const ctx = new FakeAudioContext();
    const soundBed = new FpBackgroundMusic();
    soundBed.setEnabled(false);

    await soundBed.attachSharedContext(ctx as unknown as AudioContext);

    expect(ctx.startedUrls.some((url) => url.includes("/ambience/"))).toBe(true);
    expect(ctx.startedUrls.some((url) => url.includes("concrete-creak.mp3"))).toBe(false);

    await vi.advanceTimersByTimeAsync(29_000);

    expect(ctx.startedUrls.some((url) => url.includes("/ambience/random/"))).toBe(true);
    expect(ctx.startedUrls.some((url) => url.includes("concrete-creak.mp3"))).toBe(false);

    soundBed.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.startedUrls.some((url) => url.includes("concrete-creak.mp3"))).toBe(true);

    soundBed.dispose();
  });
});
