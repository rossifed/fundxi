// PerformanceChart — portfolio / price value curve. RN port of
// apps/web/src/ui/components/PerformanceChart.tsx (recharts AreaChart on web).
//
// Area + line + vertical gradient fill, hand-rolled with react-native-svg.
// The web tooltip is a hover affordance; hover does not exist on touch, so the
// touch parity is a SCRUB gesture — drag across the chart to move a crosshair
// and read the value at that point in a bubble (CLAUDE.md UI rules: same
// information, platform-appropriate interaction). The parent still renders the
// headline value above the chart for the at-rest state.
// Width is measured via onLayout since RN has no ResponsiveContainer.

import { useId, useState } from "react";
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";

import { color_for_sign, fmt_eur_m_signed, fmt_signed_pct } from "@/lib/format";
import { border, borderSoft, mono, palette, text } from "@/theme/tokens";

export interface PerfPoint {
  v: number;
  label?: string;
  pnl?: number;
  /** Epoch ms — enables the time x-axis when `show_axes` is set. */
  ts?: number;
}

// Right gutter (y-axis labels + last-value pill) and bottom strip (x-axis time
// labels) are only reserved when the caller opts into axes — the player price
// chart keeps its edge-to-edge look untouched.
const AXIS_PAD_RIGHT = 48;
const AXIS_PAD_BOTTOM = 18;
const Y_TICKS = 4;
const X_TICKS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export function PerformanceChart({
  data,
  height = 200,
  format_value,
  format_axis = v => String(Math.round(v)),
  show_axes = false,
  show_last_value = false,
  min_span_pct = 0,
}: {
  data: PerfPoint[];
  height?: number;
  /** Bubble label for the scrubbed point. Defaults to the raw value. */
  format_value?: (point: PerfPoint, index: number) => string;
  /** Y-axis tick label. The chart stays unit-agnostic — the caller owns the
   *  unit (defaults to a plain rounded number). */
  format_axis?: (value: number) => string;
  /** Render the right y-axis (value gridlines) + bottom x-axis (time labels). */
  show_axes?: boolean;
  /** Draw a dashed line at the latest value with a value pill at the end. */
  show_last_value?: boolean;
  /** Minimum vertical span as a % of the mid value. 0 (default) auto-scales
   *  tight to the data. Set it for value charts (e.g. the portfolio) so a
   *  near-flat series shows as near-flat instead of a tight auto-scale
   *  amplifying a <1% wiggle into a full-height cliff. Mirrors the web prop. */
  min_span_pct?: number;
}) {
  const [width, set_width] = useState(0);
  const [active, set_active] = useState<number | null>(null);
  const gradient_id = `perf_grad_${useId().replace(/[:.]/g, "_")}`;

  const on_layout = (e: LayoutChangeEvent) => set_width(e.nativeEvent.layout.width);

  if (!data.length) return null;

  const first = data[0].v;
  const last = data[data.length - 1].v;
  const is_up = last >= first;
  const stroke = is_up ? palette.chartPrimary : palette.chartNegative;

  const pad_top = 8;
  const pad_bottom = show_axes ? AXIS_PAD_BOTTOM : 4;
  const pad_right = show_axes || show_last_value ? AXIS_PAD_RIGHT : 0;
  const usable_h = height - pad_top - pad_bottom;
  const plot_w = Math.max(0, width - pad_right);
  const base_y = height - pad_bottom;
  const values = data.map(d => d.v);
  const raw_min = Math.min(...values);
  const raw_max = Math.max(...values);
  // Y domain. Default: tight auto-scale. With min_span_pct, floor the visible
  // span so a flat value series doesn't read as a cliff (mirrors web).
  let y_min = raw_min;
  let y_span = raw_max - raw_min || 1;
  if (min_span_pct > 0) {
    const mid = (raw_min + raw_max) / 2;
    const floored = Math.max(raw_max - raw_min, Math.abs(mid) * (min_span_pct / 100));
    y_min = mid - floored / 2;
    y_span = floored;
  }
  const step = data.length > 1 ? plot_w / (data.length - 1) : 0;

  const point_x = (i: number) => i * step;
  const point_y = (v: number) => pad_top + (1 - (v - y_min) / y_span) * usable_h;

  // Map a touch x to the nearest data index.
  const index_at = (x: number): number => {
    if (step <= 0) return 0;
    return Math.max(0, Math.min(data.length - 1, Math.round(x / step)));
  };
  const on_scrub = (e: GestureResponderEvent) => set_active(index_at(e.nativeEvent.locationX));
  const clear_scrub = () => set_active(null);

  // Time axis: short labels (HH:MM for intraday windows, DD MMM otherwise) at a
  // few evenly spaced points. Falls back to the point's own label when no ts.
  const span_ms = (data[data.length - 1].ts ?? 0) - (data[0].ts ?? 0);
  const fmt_x = (p: PerfPoint): string => {
    if (p.ts == null) return p.label ?? "";
    const d = new Date(p.ts);
    return span_ms > 0 && span_ms <= 1.5 * DAY_MS
      ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  };

  const y_ticks = show_axes ? Array.from({ length: Y_TICKS + 1 }, (_, k) => y_min + (y_span * k) / Y_TICKS) : [];
  const x_ticks =
    show_axes && data.length > 1
      ? Array.from(new Set(Array.from({ length: X_TICKS }, (_, k) => Math.round((k / (X_TICKS - 1)) * (data.length - 1)))))
      : [];

  let body = null;
  let bubble = null;
  let overlays = null;
  if (width > 0) {
    const xy = data.map((d, i) => `${point_x(i).toFixed(2)},${point_y(d.v).toFixed(2)}`);
    const line = `M ${xy.join(" L ")}`;
    const area = `${line} L ${plot_w.toFixed(2)},${base_y} L 0,${base_y} Z`;

    const ax = active != null ? point_x(active) : 0;
    const ay = active != null ? point_y(data[active].v) : 0;
    const last_y = point_y(last);

    body = (
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradient_id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={stroke} stopOpacity="0.45" />
            <Stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {/* Y gridlines (one per value tick). */}
        {y_ticks.map((tv, i) => (
          <Line key={`yg${i}`} x1={0} y1={point_y(tv)} x2={plot_w} y2={point_y(tv)} stroke={border} strokeWidth={1} />
        ))}
        {/* X gridlines (one per time tick). */}
        {x_ticks.map(i => (
          <Line key={`xg${i}`} x1={point_x(i)} y1={pad_top} x2={point_x(i)} y2={base_y} stroke={borderSoft} strokeWidth={1} strokeDasharray="2 4" />
        ))}
        <Path d={area} fill={`url(#${gradient_id})`} />
        <Path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* Dashed marker at the latest value, ending under the value pill. */}
        {show_last_value && (
          <Line x1={0} y1={last_y} x2={plot_w} y2={last_y} stroke={stroke} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
        )}
        {active != null && (
          <>
            <Line x1={ax} y1={pad_top} x2={ax} y2={base_y} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
            <Circle cx={ax} cy={ay} r={4} fill="#fff" stroke={stroke} strokeWidth={2} />
          </>
        )}
      </Svg>
    );

    overlays = (
      <>
        {/* Y-axis value labels in the right gutter. */}
        {y_ticks.map((tv, i) => (
          <Text key={`yl${i}`} style={[styles.y_label, { top: point_y(tv) - 6, left: plot_w + 4, width: pad_right - 4 }]} numberOfLines={1}>
            {format_axis(tv)}
          </Text>
        ))}
        {/* X-axis time labels along the bottom strip. */}
        {x_ticks.map(i => {
          const x = point_x(i);
          const left = Math.min(Math.max(x - 28, 0), Math.max(0, plot_w - 56));
          return (
            <Text key={`xl${i}`} style={[styles.x_label, { top: base_y + 3, left, width: 56 }]} numberOfLines={1}>
              {fmt_x(data[i])}
            </Text>
          );
        })}
        {/* Last-value pill, vertically centred on the dashed marker. */}
        {show_last_value && (
          <View style={[styles.pill, { backgroundColor: stroke, top: Math.min(Math.max(last_y - 10, 0), base_y - 20) }]} pointerEvents="none">
            <Text style={styles.pill_text} numberOfLines={1}>
              {format_value ? format_value(data[data.length - 1], data.length - 1) : last.toFixed(1)}
            </Text>
          </View>
        )}
      </>
    );

    if (active != null) {
      // Mirror the web tooltip: value, signed % + €M vs the window open, date.
      const p = data[active];
      const value_label = format_value ? format_value(p, active) : p.v.toFixed(1);
      const baseline = data[0].v;
      const pnl_abs = p.pnl ?? p.v - baseline;
      const pnl_pct = baseline === 0 ? 0 : (pnl_abs / baseline) * 100;
      const BUBBLE_W = 132;
      const left = Math.max(0, Math.min(plot_w - BUBBLE_W, ax - BUBBLE_W / 2));
      bubble = (
        <View style={[styles.bubble, { left, width: BUBBLE_W }]} pointerEvents="none">
          <Text style={styles.bubble_value} numberOfLines={1}>{value_label}</Text>
          <Text style={[styles.bubble_pct, { color: color_for_sign(pnl_abs) }]} numberOfLines={1}>
            {fmt_signed_pct(pnl_pct, 2)}  {fmt_eur_m_signed(pnl_abs)}
          </Text>
          {p.label ? (
            <Text style={styles.bubble_date} numberOfLines={1}>{p.label}</Text>
          ) : null}
        </View>
      );
    }
  }

  return (
    <View
      style={[styles.wrap, { height }]}
      onLayout={on_layout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={on_scrub}
      onResponderMove={on_scrub}
      onResponderRelease={clear_scrub}
      onResponderTerminate={clear_scrub}
    >
      {bubble}
      {body}
      {overlays}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  bubble: {
    position: "absolute",
    top: 0,
    zIndex: 2,
    backgroundColor: palette.tooltipBg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 1,
  },
  bubble_value: { fontFamily: mono, fontSize: 13, fontWeight: "800", color: text.primary },
  bubble_pct: { fontFamily: mono, fontSize: 11, fontWeight: "700" },
  bubble_date: { fontSize: 10, fontWeight: "600", color: text.tertiary, marginTop: 1 },

  // Right-gutter y-axis value labels (e.g. "96M").
  y_label: { position: "absolute", fontFamily: mono, fontSize: 8, fontWeight: "600", color: text.tertiary },
  // Bottom-strip x-axis time labels.
  x_label: { position: "absolute", fontFamily: mono, fontSize: 8, fontWeight: "600", color: text.tertiary, textAlign: "center" },
  // Latest-value pill anchored to the right edge, on the dashed marker line.
  pill: {
    position: "absolute",
    right: 0,
    zIndex: 3,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pill_text: { fontFamily: mono, fontSize: 10, fontWeight: "800", color: "#fff" },
});
