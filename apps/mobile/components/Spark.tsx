import { useId } from "react";
import { Defs, LinearGradient, Polygon, Polyline, Stop, Svg } from "react-native-svg";

import { compute_spark_geometry } from "@fundxi/core/design/spark";
import { themes } from "@fundxi/core/design/palette";

interface SparkProps {
  data: ReadonlyArray<number>;
  color?: string;
  width?: number;
  height?: number;
}

const palette = themes.dark;
const UP_COLOR = palette.chartPrimary;
const DOWN_COLOR = palette.actionSell;

export function Spark({ data, color, width = 60, height = 20 }: SparkProps) {
  // react-native-svg's <Defs> demands a unique id. React's useId is stable
  // across renders and unique across components on the page; we strip the
  // ":" separator which is not a valid SVG fragment character.
  const gradient_id = `spark_grad_${useId().replace(/[:.]/g, "_")}`;
  const { points, filled_points, is_up } = compute_spark_geometry(data, width, height);
  const stroke = color ?? (is_up ? UP_COLOR : DOWN_COLOR);

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradient_id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={stroke} stopOpacity="1" />
          <Stop offset="10%" stopColor={stroke} stopOpacity="1" />
          <Stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Polygon points={filled_points} fill={`url(#${gradient_id})`} />
      <Polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
