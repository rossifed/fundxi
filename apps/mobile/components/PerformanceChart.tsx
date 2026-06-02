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
import { mono, palette, text } from "@/theme/tokens";

export interface PerfPoint {
  v: number;
  label?: string;
  pnl?: number;
}

export function PerformanceChart({
  data,
  height = 200,
  format_value,
}: {
  data: PerfPoint[];
  height?: number;
  /** Bubble label for the scrubbed point. Defaults to the raw value. */
  format_value?: (point: PerfPoint, index: number) => string;
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
  const pad_bottom = 4;
  const usable_h = height - pad_top - pad_bottom;
  const values = data.map(d => d.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = data.length > 1 ? width / (data.length - 1) : 0;

  const point_x = (i: number) => i * step;
  const point_y = (v: number) => pad_top + (1 - (v - min) / span) * usable_h;

  // Map a touch x to the nearest data index.
  const index_at = (x: number): number => {
    if (step <= 0) return 0;
    return Math.max(0, Math.min(data.length - 1, Math.round(x / step)));
  };
  const on_scrub = (e: GestureResponderEvent) => set_active(index_at(e.nativeEvent.locationX));
  const clear_scrub = () => set_active(null);

  let body = null;
  let bubble = null;
  if (width > 0) {
    const xy = data.map((d, i) => `${point_x(i).toFixed(2)},${point_y(d.v).toFixed(2)}`);
    const line = `M ${xy.join(" L ")}`;
    const area = `${line} L ${width.toFixed(2)},${height} L 0,${height} Z`;

    const ax = active != null ? point_x(active) : 0;
    const ay = active != null ? point_y(data[active].v) : 0;

    body = (
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradient_id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={stroke} stopOpacity="0.45" />
            <Stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={area} fill={`url(#${gradient_id})`} />
        <Path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {active != null && (
          <>
            <Line x1={ax} y1={pad_top} x2={ax} y2={height} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
            <Circle cx={ax} cy={ay} r={4} fill="#fff" stroke={stroke} strokeWidth={2} />
          </>
        )}
      </Svg>
    );

    if (active != null) {
      // Mirror the web tooltip: value, signed % + €M vs the window open, date.
      const p = data[active];
      const value_label = format_value ? format_value(p, active) : p.v.toFixed(1);
      const baseline = data[0].v;
      const pnl_abs = p.pnl ?? p.v - baseline;
      const pnl_pct = baseline === 0 ? 0 : (pnl_abs / baseline) * 100;
      const BUBBLE_W = 132;
      const left = Math.max(0, Math.min(width - BUBBLE_W, ax - BUBBLE_W / 2));
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
});
