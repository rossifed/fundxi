// Donut/pie — RN port of apps/web/src/ui/components/Donut.tsx (recharts on web).
// Hand-rolled annular sectors with react-native-svg. Magnitude-based (|value|)
// so shorted positions still show at their size; the sign lives in the items
// list the parent renders next to the chart. No hover tooltip on touch — the
// legend is the parent's responsibility (matches web layout).

import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

interface Segment {
  value: number;
  color: string;
  label?: string;
}

// Polar → cartesian, 0deg at 12 o'clock, clockwise.
function point(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function sector(cx: number, cy: number, outer: number, inner: number, a0: number, a1: number): string {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [ox0, oy0] = point(cx, cy, outer, a0);
  const [ox1, oy1] = point(cx, cy, outer, a1);
  if (inner <= 0) {
    return `M ${cx} ${cy} L ${ox0} ${oy0} A ${outer} ${outer} 0 ${large} 1 ${ox1} ${oy1} Z`;
  }
  const [ix1, iy1] = point(cx, cy, inner, a1);
  const [ix0, iy0] = point(cx, cy, inner, a0);
  return `M ${ox0} ${oy0} A ${outer} ${outer} 0 ${large} 1 ${ox1} ${oy1} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix0} ${iy0} Z`;
}

export function Donut({ segments, size = 90, hole = true }: { segments: Segment[]; size?: number; hole?: boolean }) {
  const non_zero = segments.map(s => ({ ...s, value: Math.abs(s.value) })).filter(s => s.value > 0);

  if (non_zero.length === 0) {
    return (
      <View style={[styles.empty, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={styles.empty_label}>empty</Text>
      </View>
    );
  }

  const total = non_zero.reduce((acc, s) => acc + s.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 2;
  const inner = hole ? Math.max(0, outer - Math.max(12, size * 0.28)) : 0;
  const gap = non_zero.length > 1 ? 2 : 0; // degrees of padding between slices

  // A single 100% slice is a full circle — an SVG arc whose start == end is
  // degenerate (draws nothing), so render it as a real ring/disc instead.
  if (non_zero.length === 1) {
    const only = non_zero[0];
    return (
      <Svg width={size} height={size}>
        {inner > 0 ? (
          <Circle
            cx={cx}
            cy={cy}
            r={(outer + inner) / 2}
            fill="none"
            stroke={only.color}
            strokeOpacity={0.55}
            strokeWidth={outer - inner}
          />
        ) : (
          <Circle cx={cx} cy={cy} r={outer} fill={only.color} fillOpacity={0.55} />
        )}
      </Svg>
    );
  }

  let cursor = 0;
  const paths = non_zero.map((s, i) => {
    const sweep = (s.value / total) * 360;
    const a0 = cursor + gap / 2;
    const a1 = cursor + sweep - gap / 2;
    cursor += sweep;
    return { d: sector(cx, cy, outer, inner, a0, Math.max(a0, a1)), color: s.color, key: i };
  });

  return (
    <Svg width={size} height={size}>
      {paths.map(p => (
        <Path key={p.key} d={p.d} fill={p.color} fillOpacity={0.55} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderStyle: "dashed",
  },
  empty_label: { fontSize: 9, color: "rgba(255,255,255,0.3)" },
});
