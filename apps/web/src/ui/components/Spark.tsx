import { useId } from "react";

import { compute_spark_geometry } from "@fundxi/core/design/spark";

interface SparkProps {
  data: ReadonlyArray<number>;
  // Optional override. When omitted, the colour is derived from the data:
  // last >= first → up (blue), last < first → down (red). Flat / empty data
  // (e.g. player who didn't play) defaults to up.
  color?: string;
  width?: number;
  height?: number;
}

const UP_COLOR = "var(--color-chart-primary)";
const DOWN_COLOR = "var(--color-action-sell)";

export function Spark({ data, color, width = 60, height = 20 }: SparkProps) {
  const gradient_id = useId().replace(/:/g, "");
  const { points, filled_points, is_up } = compute_spark_geometry(data, width, height);
  const stroke = color ?? (is_up ? UP_COLOR : DOWN_COLOR);

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradient_id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="1" />
          <stop offset="10%" stopColor={stroke} stopOpacity="1" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={filled_points} fill={`url(#${gradient_id})`} />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
