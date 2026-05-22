/* PlayerPriceChart — the engine price-tick history chart with a hover
 * tooltip. A single curve from the tournament baseline to the latest
 * tick (no period filtering in v0).
 *
 * DDD role: presentational UI component — only local hover state.
 */

import { useMemo, useState, type MouseEvent } from "react";
import { compute_return_pct } from "@/domain/market/return";
import type { PricePoint } from "@/infrastructure/repositories/valuations_repository";
import { color_for_sign, fmt_signed_pct } from "@/ui/helpers/format";

export function PlayerPriceChart({ price_history }: { price_history: PricePoint[] | null }) {
  const chart_points = useMemo(() => (price_history ?? []).map(p => p.price), [price_history]);
  const [hover_idx, set_hover_idx] = useState<number | null>(null);
  const period_is_up = chart_points.length > 1 && chart_points[chart_points.length - 1] >= chart_points[0];
  const period_color = period_is_up ? "var(--color-chart-primary)" : "var(--color-action-sell)";

  return (
    <div style={{ position: "relative" }}>
      {(() => {
        const w = 600;
        const h = 260;
        const pd = 8;
        const has_history = chart_points.length >= 2;
        // When the player has no real ticks yet (rookies, didn't play),
        // render a flat baseline at mid-height so the chart frame is
        // always present and the layout below stays anchored.
        const min = has_history ? Math.min(...chart_points) : 0;
        const max = has_history ? Math.max(...chart_points) : 1;
        const range = max - min || 1;
        const points = has_history
          ? chart_points.map((v, i) => ({
              x: pd + (i / (chart_points.length - 1)) * (w - pd * 2),
              y: pd + ((max - v) / range) * (h - pd * 2),
            }))
          : [
              { x: pd, y: h / 2 },
              { x: w - pd, y: h / 2 },
            ];
        const polyline = points.map(p => `${p.x},${p.y}`).join(" ");
        const last = points[points.length - 1];
        const active_idx =
          has_history && hover_idx !== null && hover_idx >= 0 && hover_idx < points.length ? hover_idx : null;
        const active_pt = active_idx !== null ? points[active_idx] : null;
        const handle_move = (e: MouseEvent<SVGSVGElement>) => {
          if (!has_history) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const svg_x = ratio * w;
          let closest = 0;
          let best = Infinity;
          for (let i = 0; i < points.length; i++) {
            const d = Math.abs(points[i].x - svg_x);
            if (d < best) {
              best = d;
              closest = i;
            }
          }
          set_hover_idx(closest);
        };
        return (
          <svg
            width="100%"
            viewBox={`0 0 ${w} ${h}`}
            style={{ display: "block", cursor: "crosshair" }}
            onMouseMove={handle_move}
            onMouseLeave={() => set_hover_idx(null)}
          >
            <defs>
              <linearGradient id="player_chart_grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={period_color} stopOpacity="1" />
                <stop offset="10%" stopColor={period_color} stopOpacity="1" />
                <stop offset="100%" stopColor={period_color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((p, i) => (
              <line
                key={i}
                x1={pd}
                x2={w - pd}
                y1={pd + p * (h - pd * 2)}
                y2={pd + p * (h - pd * 2)}
                stroke="rgba(255,255,255,.04)"
              />
            ))}
            <polygon points={`${points[0].x},${h - pd} ${polyline} ${last.x},${h - pd}`} fill="url(#player_chart_grad)" />
            <polyline
              points={polyline}
              fill="none"
              stroke={period_color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity=".1"
            />
            <polyline
              points={polyline}
              fill="none"
              stroke={period_color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {has_history && <circle cx={last.x} cy={last.y} r="9" fill={period_color} opacity=".15" />}
            {!has_history && (
              <text x={w / 2} y={h / 2 - 12} textAnchor="middle" fill="rgba(255,255,255,.35)" fontSize="13" fontWeight="600">
                No matches played yet
              </text>
            )}
            {active_pt && (
              <>
                <line
                  x1={active_pt.x}
                  x2={active_pt.x}
                  y1={pd}
                  y2={h - pd}
                  stroke="rgba(255,255,255,.35)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <circle cx={active_pt.x} cy={active_pt.y} r="6" fill="#fff" stroke={period_color} strokeWidth="2" />
              </>
            )}
          </svg>
        );
      })()}
      {(() => {
        if (chart_points.length < 2) return null;
        if (hover_idx === null || !price_history) return null;
        const rec = price_history[hover_idx];
        if (!rec) return null;
        const ratio = hover_idx / (chart_points.length - 1);
        const left_pct = `${(ratio * 100).toFixed(2)}%`;
        const dt = new Date(rec.ts);
        const date_label = dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
        const time_label = dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        // % change since tournament open (first tick) → hovered point.
        const first_price = price_history[0].price;
        const delta_pct = compute_return_pct(rec.price, first_price);
        return (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: left_pct,
              transform: ratio < 0.15 ? "translateX(0)" : ratio > 0.85 ? "translateX(-100%)" : "translateX(-50%)",
              background: "rgba(7,8,29,.92)",
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 8,
              padding: "8px 10px",
              pointerEvents: "none",
              minWidth: 130,
              boxShadow: "0 6px 20px rgba(0,0,0,.4)",
              backdropFilter: "blur(4px)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>
                €{rec.price.toFixed(2)}M
              </div>
              <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: color_for_sign(delta_pct) }}>
                {fmt_signed_pct(delta_pct, 2)}
              </div>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginTop: 2 }}>
              {date_label} · {time_label}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
