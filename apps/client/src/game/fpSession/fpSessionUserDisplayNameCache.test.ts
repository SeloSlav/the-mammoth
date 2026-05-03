import { describe, expect, it } from "vitest";
import type { DbConnection } from "../../module_bindings";
import { mountFpSessionUserDisplayNameCache } from "./fpSessionUserDisplayNameCache.js";

type UserRow = { identity: { toHexString: () => string }; username?: string };
type Ins = (ctx: unknown, row: UserRow) => void;
type Upd = (ctx: unknown, oldRow: UserRow, row: UserRow) => void;
type Del = (ctx: unknown, row: UserRow) => void;

function mockConn(initial: UserRow[]): { conn: DbConnection } {
  const rows = initial.map((r) => ({
    identity: r.identity,
    username: r.username,
  }));
  const insertHandlers: Ins[] = [];
  const updateHandlers: Upd[] = [];
  const deleteHandlers: Del[] = [];
  const user = {
    *[Symbol.iterator]() {
      for (const r of rows) yield r;
    },
    onInsert(fn: Ins) {
      insertHandlers.push(fn);
    },
    onUpdate(fn: Upd) {
      updateHandlers.push(fn);
    },
    onDelete(fn: Del) {
      deleteHandlers.push(fn);
    },
    removeOnInsert(fn: Ins) {
      const i = insertHandlers.indexOf(fn);
      if (i >= 0) insertHandlers.splice(i, 1);
    },
    removeOnUpdate(fn: Upd) {
      const i = updateHandlers.indexOf(fn);
      if (i >= 0) updateHandlers.splice(i, 1);
    },
    removeOnDelete(fn: Del) {
      const i = deleteHandlers.indexOf(fn);
      if (i >= 0) deleteHandlers.splice(i, 1);
    },
  };
  return {
    conn: { db: { user } } as unknown as DbConnection,
  };
}

describe("mountFpSessionUserDisplayNameCache", () => {
  it("seeds labels from subscribed user rows", () => {
    const idHex = "abcd1234ef";
    const { conn } = mockConn([{ identity: { toHexString: () => idHex }, username: "river" }]);
    const c = mountFpSessionUserDisplayNameCache(conn);
    expect(c.labelForIdentityHex(idHex)).toBe("river");
    c.dispose();
  });

  it("uses Guest fallback when username unknown", () => {
    const { conn } = mockConn([]);
    const c = mountFpSessionUserDisplayNameCache(conn);
    expect(c.labelForIdentityHex("ffffffffffff")).toBe("Guest ffffff");
    c.dispose();
  });
});
