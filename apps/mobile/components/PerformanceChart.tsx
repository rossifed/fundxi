// PerformanceChart — portfolio / price value curve. RN port of
// apps/web/src/ui/components/PerformanceChart.tsx (recharts AreaChart on web).
//
// Area + line + vertical gradient fill, hand-rolled with react-native-svg.
// The web tooltip is a hover affordance (big value, signed %, signed €M, date);
// hover does not exist on touch, so the headline value/delta are rendered by
// the parent above the chart instead — no parity break (CLAUDE.md UI rules).
// Width is measured via onLayout since RN has no ResponsiveContainer.

import { useId, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { palette } from "@/theme/tokens";

export interface PerfPoint {
  v: number;
  label?: string;
  pnl?: number;
}

export function PerformanceChart({ data, height = 200 }: { data: PerfPoint[]; height?: number }) {
  const [width, set_width] = useState(0);
  const gradient_id = `perf_grad_${useId().replace(/[:.]/g, "_")}`;

  const on_layout = (e: LayoutChangeEvent) => set_width(e.nativeEvent.layout.width);

  if (!data.length) return null;

  const first = data[0].v;
  const last = data[data.length - 1].v;
  const is_up = last >= first;
  const stroke = is_up ? palette.chartPrimary : palette.chartNegative;

  let body = null;
  if (width > 0) {
    const pad_top = 8;
    const pad_bottom = 4;
    const usable_h = height - pad_top - pad_bottom;
    const values = data.map(d => d.v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const step = data.length > 1 ? width / (data.length - 1) : 0;

    const xy = data.map((d, i) => {
      const x = i * step;
      const y = pad_top + (1 - (d.v - min) / span) * usable_h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const line = `M ${xy.join(" L ")}`;
    const area = `${line} L ${width.toFixed(2)},${height} L 0,${height} Z`;

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
      </Svg>
    );
  }

  return (
    <View style={[styles.wrap, { height }]} onLayout={on_layout}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
});
