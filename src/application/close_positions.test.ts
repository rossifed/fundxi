import { describe, expect, it } from "vitest";
import { close_positions, closing_trade, type PositionToClose } from "./close_positions";

const pos = (player_id: number): PositionToClose => ({ player_id, shares: 10, price: 5 });

describe("closing_trade", () => {
  it("sells a long position", () => {
    expect(closing_trade({ player_id: 1, shares: 10, price: 5 })).toEqual({ kind: "sell", shares: 10 });
  });

  it("buys back a short position to cover", () => {
    expect(closing_trade({ player_id: 1, shares: -8, price: 5 })).toEqual({ kind: "buy", shares: 8 });
  });

  it("always returns a positive quantity", () => {
    expect(closing_trade({ player_id: 1, shares: -3.5, price: 2 }).shares).toBe(3.5);
  });
});

describe("close_positions", () => {
  it("closes every position when each execution succeeds", async () => {
    const out = await close_positions([pos(1), pos(2), pos(3)], async () => {});
    expect(out.closed).toEqual([1, 2, 3]);
    expect(out.failed).toEqual([]);
  });

  it("reports an empty batch without calling the executor", async () => {
    let calls = 0;
    const out = await close_positions([], async () => {
      calls += 1;
    });
    expect(calls).toBe(0);
    expect(out).toEqual({ closed: [], failed: [] });
  });

  it("keeps going after a failure and reports it per position", async () => {
    const out = await close_positions([pos(1), pos(2), pos(3)], async p => {
      if (p.player_id === 2) throw new Error("price unavailable");
    });
    expect(out.closed).toEqual([1, 3]);
    expect(out.failed).toEqual([{ player_id: 2, error: "price unavailable" }]);
  });

  it("normalises a non-Error rejection to a string", async () => {
    const out = await close_positions([pos(7)], async () => {
      throw "boom";
    });
    expect(out.closed).toEqual([]);
    expect(out.failed).toEqual([{ player_id: 7, error: "boom" }]);
  });

  it("executes positions sequentially, never concurrently", async () => {
    let in_flight = 0;
    let max_in_flight = 0;
    const out = await close_positions([pos(1), pos(2), pos(3)], async () => {
      in_flight += 1;
      max_in_flight = Math.max(max_in_flight, in_flight);
      await Promise.resolve();
      in_flight -= 1;
    });
    expect(max_in_flight).toBe(1);
    expect(out.closed).toEqual([1, 2, 3]);
  });
});
