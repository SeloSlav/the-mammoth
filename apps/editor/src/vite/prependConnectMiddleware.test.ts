import { describe, expect, it } from "vitest";
import { prependConnectMiddleware } from "./prependConnectMiddleware.js";

describe("prependConnectMiddleware", () => {
  it("unshifts so the last prepended handler is outermost (runs first)", () => {
    const inner = (_req: unknown, _res: unknown, next: () => void) => next();
    const app = {
      stack: [{ route: "/", handle: inner }],
      use: () => {
        throw new Error("use() should not run when stack exists");
      },
    };
    const first = () => {};
    const second = () => {};
    prependConnectMiddleware(app as never, first as never);
    prependConnectMiddleware(app as never, second as never);
    expect(app.stack).toHaveLength(3);
    expect(app.stack[0]!.handle).toBe(second);
    expect(app.stack[1]!.handle).toBe(first);
    expect(app.stack[2]!.handle).toBe(inner);
  });
});
