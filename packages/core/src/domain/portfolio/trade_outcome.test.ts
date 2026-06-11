import { describe, expect, it } from "vitest";
import { compute_trade_outcome } from "./trade_outcome";
import type { Trade } from "./trade";

const trade = (kind: "buy" | "sell", price: number): Trade => ({
  id: 1,
  kind,
  player_id: 1,
  player_name: "X",
  team_id: "FRA",
  shares: 5,
  price,
  date: "2026-06-12",
  time: "20:00",
  total: price * 5,
});

describe("compute_trade_outcome", () => {
  it("returns the signed price-change percentage since the trade", () => {
    const out = compute_trade_outcome(trade("buy", 10), 12);
    expect(out.change_pct).toBe(20);
  });

  it("negative change when price went down", () => {
    const out = compute_trade_outcome(trade("buy", 10), 8);
    expect(out.change_pct).toBe(-20);
  });

  it("returns change_pct=null when the trade price was 0 (avoid div/0)", () => {
    const out = compute_trade_outcome(trade("buy", 0), 5);
    expect(out.change_pct).toBeNull();
  });

  it("carries through all trade fields untouched + current_price", () => {
    const t = trade("sell", 10);
    const out = compute_trade_outcome(t, 11);
    expect(out.kind).toBe("sell");
    expect(out.shares).toBe(5);
    expect(out.current_price).toBe(11);
  });
});
