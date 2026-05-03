import type { DbConnection } from "../../module_bindings";
import type { User } from "../../module_bindings/types";

export type FpSessionUserDisplayNameCache = {
  /** Stable nametag for remote capsules (matches prior `user.username` / Guest fallback). */
  labelForIdentityHex: (idHex: string) => string;
  dispose: () => void;
};

/**
 * Mirrors `user` rows into a map so the main RAF loop avoids `conn.db.user.identity.find` per
 * remote player each frame. Kept fresh via Spacetime insert/update/delete callbacks.
 */
export function mountFpSessionUserDisplayNameCache(conn: DbConnection): FpSessionUserDisplayNameCache {
  const byHex = new Map<string, string>();

  const apply = (row: User) => {
    const id = row.identity.toHexString();
    const name = row.username?.trim();
    if (name) byHex.set(id, name);
    else byHex.delete(id);
  };

  for (const row of conn.db.user) {
    apply(row as User);
  }

  const onInsert = (_ctx: unknown, row: User) => apply(row);
  const onUpdate = (_ctx: unknown, _oldRow: User, row: User) => apply(row);
  const onDelete = (_ctx: unknown, row: User) => {
    byHex.delete(row.identity.toHexString());
  };

  conn.db.user.onInsert(onInsert);
  conn.db.user.onUpdate(onUpdate);
  conn.db.user.onDelete(onDelete);

  return {
    labelForIdentityHex: (idHex: string) =>
      byHex.get(idHex) ?? `Guest ${idHex.slice(0, 6)}`,
    dispose: () => {
      try {
        conn.db.user.removeOnInsert(onInsert);
        conn.db.user.removeOnUpdate(onUpdate);
        conn.db.user.removeOnDelete(onDelete);
      } catch {
        /* removeOn* may be absent on older bindings */
      }
      byHex.clear();
    },
  };
}
