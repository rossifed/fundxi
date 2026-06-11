/* YourPositionCard — the viewer's holding in this player.
 *
 * DDD role: presentational UI component. Reads the holding + portfolio
 * totals from the api layer; all maths delegated to domain functions.
 */

import type { CSSProperties } from "react";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import type { Player } from "@fundxi/core/domain/player/player";
import { compute_return_pct } from "@fundxi/core/domain/market/return";
import { compute_portfolio_share } from "@fundxi/core/domain/portfolio/portfolio_metrics";
import { color_for_sign, fmt_eur_m, fmt_eur_m_signed, fmt_signed_pct } from "@/ui/helpers/format";

export function YourPositionCard({ player, current_price }: { player: Player; current_price: number }) {
  const holding = portfolio_api.get_holding(player.id);
  const totals = portfolio_api.get_totals();

  // Body height is fixed (filled-state grid height) so the empty-state
  // message and the populated grid take the same vertical space — keeps
  // Buy/Sell anchored regardless of holding state.
  const BODY_MIN_HEIGHT = 132;
  const has_position = !!holding && holding.shares !== 0;

  const header = (status_label: string, color: string, bg: string) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 10px",
        background: "rgba(255,255,255,.025)",
        borderBottom: "1px solid rgba(255,255,255,.05)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(255,255,255,.55)",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        Your position
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color,
          background: bg,
          padding: "3px 8px",
          borderRadius: 4,
          letterSpacing: 0.5,
        }}
      >
        {status_label}
      </span>
    </div>
  );

  const card_style: CSSProperties = {
    background: "rgba(255,255,255,.02)",
    border: "1px solid rgba(255,255,255,.05)",
    borderRadius: 10,
    overflow: "hidden",
  };

  if (!has_position) {
    return (
      <div style={card_style}>
        {header("—", "rgba(255,255,255,.4)", "rgba(255,255,255,.04)")}
        <div
          style={{
            minHeight: BODY_MIN_HEIGHT,
            padding: "12px 14px",
            fontSize: 12,
            color: "rgba(255,255,255,.4)",
            lineHeight: 1.5,
          }}
        >
          You don&apos;t hold this player. Use the trade panel below to open a position.
        </div>
      </div>
    );
  }

  const market_value = holding!.shares * current_price;
  const cost_basis = holding!.shares * holding!.average_buy_price;
  const pnl = market_value - cost_basis;
  const return_pct = compute_return_pct(market_value, cost_basis);
  const portfolio_pct = compute_portfolio_share(market_value, totals.total_value);
  const is_long = holding!.shares > 0;

  return (
    <div style={card_style}>
      {header(
        is_long ? "LONG" : "SHORT",
        is_long ? "var(--color-positive)" : "var(--color-negative)",
        is_long ? "color-mix(in srgb, var(--color-positive) 10%, transparent)" : "color-mix(in srgb, var(--color-negative) 10%, transparent)",
      )}
      <div
        style={{
          minHeight: BODY_MIN_HEIGHT,
          padding: "12px 14px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          alignContent: "center",
        }}
      >
        <PositionStat label="Shares" value={String(Math.abs(holding!.shares))} />
        <PositionStat label="Avg buy" value={`€${holding!.average_buy_price}M`} />
        <PositionStat label="Market value" value={fmt_eur_m(market_value)} />
        <PositionStat label="P&L" value={fmt_eur_m_signed(pnl)} color={color_for_sign(pnl)} />
        <PositionStat label="Return" value={fmt_signed_pct(return_pct, 1)} color={color_for_sign(return_pct)} />
        <PositionStat label="% portfolio" value={`${portfolio_pct.toFixed(1)}%`} />
      </div>
    </div>
  );
}

function PositionStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,.35)",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: color ?? "#fff", marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
