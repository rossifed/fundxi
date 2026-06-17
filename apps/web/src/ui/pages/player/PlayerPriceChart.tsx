/* PlayerPriceChart — the engine price-tick history chart.
 *
 * Thin wrapper over the shared ``PerformanceChart`` (the same component the
 * Portfolio value curve uses), so the player price chart reads as one family
 * with the portfolio: hover tooltip (price + % + €M + date·time), a dashed
 * last-price line with a value pill, and X / Y axis labels. Mirrors the mobile
 * PlayerSheet ``PriceChart``, which already reuses ``PerformanceChart`` — so web
 * and mobile stay aligned by construction.
 *
 * Price history is a single curve from the tournament baseline to the latest
 * tick (no period filtering in v0). ``min_span_pct`` is left at its default 0 so
 * the y-axis auto-scales tight to the data — for a price chart the move IS the
 * story (unlike the portfolio value curve, which floors the span).
 *
 * DDD role: presentational UI component.
 */

import { PerformanceChart } from "@/ui/components/PerformanceChart";
import type { PricePoint } from "@fundxi/core/infrastructure/repositories/valuations_repository";

function point_label(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

function Placeholder({ text }: { text: string }) {
  // Keep the chart's footprint so the column doesn't jump between
  // loading / empty / loaded states.
  return (
    <div
      style={{
        height: 260,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 600,
        color: "rgba(255,255,255,.4)",
      }}
    >
      {text}
    </div>
  );
}

export function PlayerPriceChart({ price_history }: { price_history: PricePoint[] | null }) {
  if (price_history === null) return <Placeholder text="loading price history…" />;
  if (price_history.length < 2) return <Placeholder text="No matches played yet" />;

  const data = price_history.map(p => ({
    v: p.price,
    ts: Date.parse(p.ts),
    label: point_label(p.ts),
  }));

  return (
    <PerformanceChart data={data} height={260} show_axes show_last_value format_axis={v => `€${v.toFixed(1)}M`} />
  );
}
