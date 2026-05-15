import { useId } from "react";

interface SparkProps {
  data: number[];
  // Optional override. When omitted, the color is derived from the data:
  // last >= first → up (blue), last < first → down (red). Flat / empty data
  // (e.g. player who didn't play) defaults to up. This keeps Spark and the
  // bigger Chart components in lockstep with one another.
  color?: string;
  width?: number;
  height?: number;
}

const UP_COLOR = "var(--color-chart-primary)";
const DOWN_COLOR = "var(--color-action-sell)";

export function Spark({ data, color, width = 60, height = 20 }: SparkProps) {
  const gradient_id = useId().replace(/:/g, "");
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`)
    .join(" ");
  const auto_up = data.length < 2 || data[data.length - 1] >= data[0];
  const stroke = color ?? (auto_up ? UP_COLOR : DOWN_COLOR);

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradient_id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="1" />
          <stop offset="10%" stopColor={stroke} stopOpacity="1" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points} ${width},${height}`} fill={`url(#${gradient_id})`} />
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
