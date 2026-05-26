import { describe, expect, it } from "vitest";
import type { Identity } from "spacetimedb";
import type { DbConnection } from "../../module_bindings";
import { getFpHotbarSelectedSlot, setFpHotbarSelectedSlot } from "./fpHotbarSelection";
import {
  firearmAmmoDefIdForWeapon,
  hotbarDefIdSupportsMeleeAttack,
  localPlayerHasCarriedAmmoForWeapon,
  unequipFpHotbarWeaponIfHeld,
} from "./fpHotbarResolve";

const testOwner = { isEqual: (other: unknown) => other === testOwner } as unknown as Identity;

function stubInventoryConn(rows: unknown[]): DbConnection {
  return { db: { inventory_item: rows } } as unknown as DbConnection;
}

describe("firearmAmmoDefIdForWeapon + localPlayerHasCarriedAmmoForWeapon", () => {
  it("maps pistol and shotgun to server ammo defs", () => {
    expect(firearmAmmoDefIdForWeapon("pistol")).toBe("ammo-9mm");
    expect(firearmAmmoDefIdForWeapon("shotgun-coach")).toBe("ammo-shotgun-shell");
    expect(firearmAmmoDefIdForWeapon("crowbar")).toBeUndefined();
  });

  it("returns false when no carried ammo stacks exist", () => {
    const conn = stubInventoryConn([]);
    expect(localPlayerHasCarriedAmmoForWeapon(conn, testOwner, "pistol")).toBe(false);
  });

  it("counts ammo in Inventory location only for matching owner", () => {
    const other = { isEqual: () => false } as unknown as Identity;
    const conn = stubInventoryConn([
      {
        defId: "ammo-9mm",
        quantity: 2,
        location: { tag: "Inventory", value: { ownerId: other } },
      },
      {
        defId: "ammo-9mm",
        quantity: 1,
        location: { tag: "Inventory", value: { ownerId: testOwner } },
      },
    ]);
    expect(localPlayerHasCarriedAmmoForWeapon(conn, testOwner, "pistol")).toBe(true);
  });

  it("counts ammo on Hotbar stacks", () => {
    const conn = stubInventoryConn([
      {
        defId: "ammo-shotgun-shell",
        quantity: 1,
        location: { tag: "Hotbar", value: { ownerId: testOwner, slotIndex: 2 } },
      },
    ]);
    expect(localPlayerHasCarriedAmmoForWeapon(conn, testOwner, "shotgun-coach")).toBe(true);
  });

  it("ignores stash-only ammo (matches server firearm reducer)", () => {
    const conn = stubInventoryConn([
      {
        defId: "ammo-9mm",
        quantity: 99,
        location: { tag: "Stash", value: {} },
      },
    ]);
    expect(localPlayerHasCarriedAmmoForWeapon(conn, testOwner, "pistol")).toBe(false);
  });
});

describe("unequipFpHotbarWeaponIfHeld", () => {
  it("clears the rail when the selected slot holds a weapon", () => {
    setFpHotbarSelectedSlot(2);
    const conn = stubInventoryConn([
      {
        defId: "crowbar",
        quantity: 1,
        location: { tag: "Hotbar", value: { ownerId: testOwner, slotIndex: 2 } },
      },
    ]);
    expect(unequipFpHotbarWeaponIfHeld(conn, testOwner)).toBe(true);
    expect(getFpHotbarSelectedSlot()).toBeNull();
  });

  it("leaves selection when slot is empty or non-weapon", () => {
    setFpHotbarSelectedSlot(1);
    const conn = stubInventoryConn([
      {
        defId: "bandage",
        quantity: 1,
        location: { tag: "Hotbar", value: { ownerId: testOwner, slotIndex: 1 } },
      },
    ]);
    expect(unequipFpHotbarWeaponIfHeld(conn, testOwner)).toBe(false);
    expect(getFpHotbarSelectedSlot()).toBe(1);
  });
});

describe("hotbarDefIdSupportsMeleeAttack", () => {
  it("accepts authored melee weapon def ids", () => {
    expect(hotbarDefIdSupportsMeleeAttack("crowbar")).toBe(true);
    expect(hotbarDefIdSupportsMeleeAttack("knife")).toBe(true);
    expect(hotbarDefIdSupportsMeleeAttack("screwdriver")).toBe(true);
  });

  it("rejects empty or non-weapon selections", () => {
    expect(hotbarDefIdSupportsMeleeAttack(undefined)).toBe(false);
    expect(hotbarDefIdSupportsMeleeAttack(null)).toBe(false);
    expect(hotbarDefIdSupportsMeleeAttack("water-bottle")).toBe(false);
  });
});
