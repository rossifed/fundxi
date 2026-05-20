/* PerformanceChart — portfolio value curve.
 *
 * Tooltip mirrors the PlayerSheet chart (player price hover) so the
 * two surfaces read as one family: same big value top-line, same
 * coloured signed delta, same low-opacity sub-line for the date.
 *
 * Coherence with PlayerSheet:
 *   - value formatted as ``€X.XXM`` (mono, bold)
 *   - signed % vs the first visible point, coloured by sign
 *   - signed €M absolute PnL on the second line
 *   - optional date/time on the third line (only if a real timestamp
 *     is supplied — we never fabricate one).
 *
 * Known limitation: today's ``compute_portfolio_history`` is a pure
 * client-side derivation from per-player sparklines and exposes no
 * timestamps. The optional ``label`` field on each point is the slot
 * for real datetimes once a backend portfolio-history endpoint exists
 * (backend M3+). Until then the tooltip omits the date line — it does
 * NOT invent one (cf. CLAUDE.md "Data Sourcing — NON-NEGOTIABLE").
 */

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { color_for_sign, fmt_eur_m_signed, fmt_signed_pct } from "@/ui/helpers/format";

export interface PerfPoint {
  v: number;
  /** Optional human-readable timestamp ("12 May · 14:32"). Rendered
   * as-is on the third tooltip line. Omit it when no real timestamp
   * is available — the line is hidden rather than invented. */
  label?: string;
  /** Optional PnL vs open (absolute, signed €M). When present the
   * tooltip displays it; otherwise the chart falls back to a delta
   * computed against the first visible point of the window. */
  pnl?: number;
}

interface PerformanceChartProps {
  data: PerfPoint[];
  /** Kept for backwards compat — Recharts handles sizing via ResponsiveContainer. */
  width?: number;
  height?: number;
}

interface PerfTooltipPayload {
  v: number;
  label?: string;
  baseline: number;
  /** Backend-provided PnL vs open (preferred when present). */
  pnl_vs_open?: number;
}

interface PerfTooltipReceived {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: PerfTooltipPayload }>;
}

function PerfTooltip(props: PerfTooltipReceived) {
  if (!props.active || !props.payload?.length) return null;
  const raw = props.payload[0]?.payload;
  if (!raw) return null;
  const v = raw.v;
  const baseline = raw.baseline;
  // Prefer the backend-provided ``pnl_vs_open`` (truth: ``value − open_value``
  // from the snapshot table) when available. Falls back to "delta vs
  // window-open" when the chart receives raw values only.
  const pnl_abs = raw.pnl_vs_open ?? v - baseline;
  const pnl_pct = baseline === 0 ? 0 : (pnl_abs / baseline) * 100;
  const sign_color = color_for_sign(pnl_abs);
  return (
    <div
      style={{
        background: "rgba(7,8,29,.92)",
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 8,
        padding: "8px 10px",
        minWidth: 130,
        boxShadow: "0 6px 20px rgba(0,0,0,.4)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>
          €{v.toFixed(2)}M
        </div>
        <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: sign_color }}>
          {fmt_signed_pct(pnl_pct, 2)}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: sign_color, marginTop: 2 }}>
        {fmt_eur_m_signed(pnl_abs)}
      </div>
      {raw.label && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginTop: 2 }}>
          {raw.label}
        </div>
      )}
    </div>
  );
}

export function PerformanceChart({ data, height = 220 }: PerformanceChartProps) {
  if (!data.length) return null;

  const first = data[0].v;
  const last = data[data.length - 1].v;
  const is_up = last >= first;
  const color = is_up ? "var(--color-chart-primary)" : "var(--color-chart-negative)";
  const gradient_id = useId().replace(/:/g, "");

  // Carry the baseline (first point) on every datum so the custom
  // tooltip can compute PnL vs window-open without closure over the
  // outer ``first`` (Recharts' Tooltip lives in its own subtree).
  const points = data.map((d, i) => ({
    i,
    v: d.v,
    label: d.label,
    baseline: first,
    pnl_vs_open: d.pnl,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradient_id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,.15)", strokeDasharray: "3 3" }}
          content={PerfTooltip as never}
        />
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradient_id})`}
          dot={false}
          activeDot={{ r: 4, fill: color, stroke: "#0d0d0f", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
