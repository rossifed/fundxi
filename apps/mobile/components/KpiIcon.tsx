// KpiIcon — tiny line glyphs for the portfolio KPI cards, hand-drawn with
// react-native-svg (the app has no icon font; @expo/vector-icons is not a
// dependency, and react-native-svg is already used by every chart). Purely
// decorative accents that match the "trading dashboard" mockup; stroke colour
// is passed in so the caller controls the theme tint (brand blue, or sign
// colour for the performance one).

import Svg, { Circle, Ellipse, Path, Polyline, Rect } from "react-native-svg";

export type KpiIconName =
  | "cash"
  | "invested"
  | "positions"
  | "trades"
  | "winrate"
  | "top"
  | "coins"
  | "boot"
  | "diamond";

export function KpiIcon({ name, color, size = 18 }: { name: KpiIconName; color: string; size?: number }) {
  const sw = 1.6;
  const common = { stroke: color, strokeWidth: sw, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "cash" && (
        <>
          <Rect x={3} y={6} width={18} height={12} rx={2} {...common} />
          <Circle cx={12} cy={12} r={2.4} {...common} />
        </>
      )}
      {name === "invested" && (
        <>
          <Circle cx={12} cy={12} r={8} {...common} />
          <Path d="M12 12 L12 4 A8 8 0 0 1 19 9 Z" {...common} />
        </>
      )}
      {name === "positions" && (
        <>
          <Circle cx={12} cy={8} r={3.4} {...common} />
          <Path d="M5.5 19 a6.5 6.5 0 0 1 13 0" {...common} />
        </>
      )}
      {name === "trades" && (
        <>
          <Polyline points="7,8 17,8" {...common} />
          <Polyline points="15,6 17,8 15,10" {...common} />
          <Polyline points="17,16 7,16" {...common} />
          <Polyline points="9,14 7,16 9,18" {...common} />
        </>
      )}
      {name === "winrate" && (
        <>
          <Circle cx={12} cy={12} r={8} {...common} strokeOpacity={0.35} />
          <Path d="M12 4 A8 8 0 0 1 19 9" {...common} />
        </>
      )}
      {name === "top" && <Polyline points="4,16 9,11 13,14 20,6" {...common} />}
      {name === "coins" && (
        <>
          <Ellipse cx={12} cy={7} rx={7} ry={3} {...common} />
          <Path d="M5 7 v5 a7 3 0 0 0 14 0 v-5" {...common} />
          <Path d="M5 11.5 a7 3 0 0 0 14 0" {...common} />
        </>
      )}
      {name === "boot" && (
        <>
          <Path d="M5 5 L5 13 C5 14 5.7 14.5 7 14.5 L17 14.5 C19 14.5 20 13.5 20 12 C20 10.5 18.5 10 16 10 L11 10 L10.5 5 Z" {...common} />
          <Path d="M5 16.5 L19 16.5" {...common} />
        </>
      )}
      {name === "diamond" && (
        <>
          <Path d="M5.5 9 L9 4 L15 4 L18.5 9 L12 20 Z" {...common} />
          <Path d="M5.5 9 L18.5 9 M9 4 L12 9 L15 4" {...common} />
        </>
      )}
    </Svg>
  );
}
