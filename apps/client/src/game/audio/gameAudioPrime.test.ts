import { describe, expect, it } from "vitest";
import { registerGameAudioPrime, requestGameAudioPrime } from "./gameAudioPrime";

describe("gameAudioPrime", () => {
  it("invokes registered prime and clears", async () => {
    let n = 0;
    registerGameAudioPrime(async () => {
      n += 1;
    });
    await requestGameAudioPrime();
    expect(n).toBe(1);
    registerGameAudioPrime(null);
    await requestGameAudioPrime();
    expect(n).toBe(1);
  });
});
