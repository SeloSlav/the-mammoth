import { describe, expect, it } from "vitest";
import type { Identity } from "spacetimedb";
import type { DbConnection } from "../../module_bindings";
import {
  chamberCapacityForWeapon,
  countCarriedAmmoForWeapon,
  getLocalFirearmChamberView,
  PISTOL_CHAMBER_CAPACITY,
  SHOTGUN_CHAMBER_CAPACITY,
} from "./fpFirearmChamber";

const testOwner = { isEqual: (other: unknown) => other === testOwner } as unknown as Identity;

function stubConn(chamber: unknown | null, inventory: unknown[]): DbConnection {
  return {
    db: {
      player_firearm_chamber: {
        identity: {
          find: () => chamber,
        },
      },
      inventory_item: inventory,
    },
  } as unknown as DbConnection;
}

describe("chamberCapacityForWeapon", () => {
  it("matches server capacities", () => {
    expect(chamberCapacityForWeapon("pistol")).toBe(PISTOL_CHAMBER_CAPACITY);
    expect(chamberCapacityForWeapon("shotgun-coach")).toBe(SHOTGUN_CHAMBER_CAPACITY);
    expect(PISTOL_CHAMBER_CAPACITY).toBe(6);
    expect(SHOTGUN_CHAMBER_CAPACITY).toBe(2);
  });
});

describe("getLocalFirearmChamberView", () => {
  it("predicts a full chamber before the server syncs a weapon swap", () => {
    const conn = stubConn(
      { weaponDefId: "pistol", chamberCount: 6, reloadCompleteMicros: 0n },
      [
        {
          defId: "ammo-shotgun-shell",
          quantity: 12,
          location: { tag: "Inventory", value: { ownerId: testOwner } },
        },
      ],
    );
    const view = getLocalFirearmChamberView(conn, testOwner, "shotgun-coach");
    expect(view.chamberCount).toBe(2);
    expect(view.capacity).toBe(2);
    expect(view.reserveCount).toBe(12);
  });

  it("predicts chamber fill once the reload timer elapses locally", () => {
    const reloadDoneAtUs = Date.now() * 1000 - 50_000;
    const conn = stubConn(
      {
        weaponDefId: "pistol",
        chamberCount: 0,
        reloadCompleteMicros: BigInt(Math.floor(reloadDoneAtUs)),
      },
      [
        {
          defId: "ammo-9mm",
          quantity: 12,
          location: { tag: "Inventory", value: { ownerId: testOwner } },
        },
      ],
    );
    const view = getLocalFirearmChamberView(conn, testOwner, "pistol");
    expect(view.isReloading).toBe(false);
    expect(view.chamberCount).toBe(6);
    expect(view.reserveCount).toBe(12);
  });

  it("reads synced chamber counts from player_firearm_chamber", () => {
    const conn = stubConn(
      {
        weaponDefId: "pistol",
        chamberCount: 3,
        reloadCompleteMicros: 0n,
      },
      [
        {
          defId: "ammo-9mm",
          quantity: 9,
          location: { tag: "Inventory", value: { ownerId: testOwner } },
        },
      ],
    );
    const view = getLocalFirearmChamberView(conn, testOwner, "pistol");
    expect(view.chamberCount).toBe(3);
    expect(view.capacity).toBe(6);
    expect(view.reserveCount).toBe(9);
    expect(view.isReloading).toBe(false);
  });
});

describe("countCarriedAmmoForWeapon", () => {
  it("sums inventory and hotbar stacks", () => {
    const conn = stubConn(null, [
      {
        defId: "ammo-shotgun-shell",
        quantity: 4,
        location: { tag: "Hotbar", value: { ownerId: testOwner, slotIndex: 1 } },
      },
      {
        defId: "ammo-shotgun-shell",
        quantity: 3,
        location: { tag: "Inventory", value: { ownerId: testOwner } },
      },
    ]);
    expect(countCarriedAmmoForWeapon(conn, testOwner, "shotgun-coach")).toBe(7);
  });
});
