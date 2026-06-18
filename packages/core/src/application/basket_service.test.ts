import { describe, expect, it } from "vitest";
import { type BasketBuy, execute_basket } from "./basket_service";

const buy = (player_id: number, shares = 0.1): BasketBuy => ({ player_id, shares, price: 10 });

describe("execute_basket", () => {
  it("buys every leg when each execution succeeds", async () => {
    const out = await execute_basket([buy(1), buy(2), buy(3)], async () => {});
    expect(out.bought).toEqual([1, 2, 3]);
    expect(out.failed).toEqual([]);
  });

  it("skips zero-share legs without calling the executor", async () => {
    const seen: number[] = [];
    const out = await execute_basket([buy(1), buy(2, 0), buy(3)], async b => {
      seen.push(b.player_id);
    });
    expect(seen).toEqual([1, 3]); // leg 2 (0 shares) skipped
    expect(out.bought).toEqual([1, 3]);
  });

  it("reports an empty batch without calling the executor", async () => {
    let calls = 0;
    const out = await execute_basket([], async () => {
      calls += 1;
    });
    expect(calls).toBe(0);
    expect(out).toEqual({ bought: [], failed: [] });
  });

  it("keeps going after a failure and reports it per leg", async () => {
    const out = await execute_basket([buy(1), buy(2), buy(3)], async b => {
      if (b.player_id === 2) throw new Error("no current price");
    });
    expect(out.bought).toEqual([1, 3]);
    expect(out.failed).toEqual([{ player_id: 2, error: "no current price" }]);
  });
});
