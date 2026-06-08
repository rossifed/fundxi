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
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { color_for_sign, fmt_eur_m_signed, fmt_signed_pct } from "@/ui/helpers/format";
import { color, colors } from "@/ui/design/tokens";

const DAY_MS = 24 * 60 * 60 * 1000;

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
  /** Epoch ms — drives the time x-axis when `show_axes` is set. */
  ts?: number;
}

interface PerformanceChartProps {
  data: PerfPoint[];
  /** Kept for backwards compat — Recharts handles sizing via ResponsiveContainer. */
  width?: number;
  height?: number;
  /** Render the right y-axis (value gridlines) + bottom x-axis (time labels). */
  show_axes?: boolean;
  /** Draw a dashed line at the latest value with a value pill at the end. */
  show_last_value?: boolean;
  /** Y-axis tick label. The chart stays unit-agnostic — the caller owns the
   *  unit (defaults to a plain rounded number). */
  format_axis?: (value: number) => string;
}

// Last-value pill rendered at the right end of the reference line. Recharts
// injects `viewBox` (the line's bounding box) so we anchor to its right edge.
function LastValuePill({ viewBox, text, fill }: { viewBox?: { x: number; y: number; width: number }; text: string; fill: string }) {
  if (!viewBox) return null;
  const right = viewBox.x + viewBox.width;
  const w = 50;
  const h = 18;
  return (
    <g>
      <rect x={right - w} y={viewBox.y - h / 2} width={w} height={h} rx={5} fill={fill} />
      <text x={right - w / 2} y={viewBox.y + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff" className="mono">
        {text}
      </text>
    </g>
  );
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

export function PerformanceChart({
  data,
  height = 220,
  show_axes = false,
  show_last_value = false,
  format_axis = v => String(Math.round(v)),
}: PerformanceChartProps) {
  if (!data.length) return null;

  const first = data[0].v;
  const last = data[data.length - 1].v;
  const is_up = last >= first;
  const stroke = is_up ? color.chartPrimary : color.chartNegative;
  const gradient_id = useId().replace(/:/g, "");

  // Carry the baseline (first point) on every datum so the custom
  // tooltip can compute PnL vs window-open without closure over the
  // outer ``first`` (Recharts' Tooltip lives in its own subtree).
  const points = data.map((d, i) => ({
    i,
    v: d.v,
    label: d.label,
    ts: d.ts,
    baseline: first,
    pnl_vs_open: d.pnl,
  }));

  // Time axis: short labels (HH:MM for intraday windows, DD MMM otherwise) at a
  // few evenly spaced points. Falls back to blank when no real timestamp.
  const span_ms = (data[data.length - 1].ts ?? 0) - (data[0].ts ?? 0);
  const fmt_x = (index: number): string => {
    const p = points[index];
    if (!p || p.ts == null) return "";
    const d = new Date(p.ts);
    return span_ms > 0 && span_ms <= 1.5 * DAY_MS
      ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  };
  const x_ticks = show_axes
    ? Array.from(new Set(Array.from({ length: 4 }, (_, k) => Math.round((k / 3) * (points.length - 1)))))
    : undefined;

  const tick = { fontSize: 9, fill: colors.text.tertiary, fontFamily: '"JetBrains Mono", monospace' } as const;
  const margin = show_axes ? { top: 8, right: 8, bottom: 4, left: 0 } : { top: 8, right: 12, bottom: 0, left: 0 };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={margin}>
        <defs>
          <linearGradient id={gradient_id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.45} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        {show_axes && <CartesianGrid stroke={colors.border} strokeDasharray="2 4" vertical horizontal />}
        {show_axes && (
          <XAxis
            dataKey="i"
            type="number"
            domain={[0, points.length - 1]}
            ticks={x_ticks}
            tickFormatter={fmt_x}
            tick={tick}
            tickLine={false}
            axisLine={false}
            height={16}
          />
        )}
        {show_axes && (
          <YAxis
            orientation="right"
            domain={["dataMin", "dataMax"]}
            tickCount={5}
            tickFormatter={format_axis}
            tick={tick}
            tickLine={false}
            axisLine={false}
            width={40}
          />
        )}
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,.15)", strokeDasharray: "3 3" }}
          content={PerfTooltip as never}
        />
        <Area
          type="monotone"
          dataKey="v"
          stroke={stroke}
          strokeWidth={2}
          fill={`url(#${gradient_id})`}
          dot={false}
          activeDot={{ r: 4, fill: stroke, stroke: "#0d0d0f", strokeWidth: 2 }}
          isAnimationActive={false}
        />
        {show_last_value && (
          <ReferenceLine
            y={last}
            stroke={stroke}
            strokeDasharray="3 3"
            strokeOpacity={0.7}
            ifOverflow="extendDomain"
            label={<LastValuePill text={`€${last.toFixed(1)}M`} fill={stroke} />}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
