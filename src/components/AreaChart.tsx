"use client";

import { PriceEvent } from "@/data/mock";

interface AreaChartProps {
  data: number[];
  positive: boolean;
  height?: number;
  events?: PriceEvent[];
  onEventHover?: (event: PriceEvent | null) => void;
  showLabels?: boolean;
  mini?: boolean;
}

export default function AreaChart({
  data,
  positive,
  height = 200,
  events = [],
  onEventHover,
  showLabels = false,
  mini = false,
}: AreaChartProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const padding = mini ? 2 : 8;
  const w = mini ? 120 : 400;
  const h = height;

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * (w - padding * 2),
    y: padding + (1 - (v - min) / range) * (h - padding * 2),
  }));

  // Smooth curve using cubic bezier
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
    const cpx2 = curr.x - (curr.x - prev.x) * 0.4;
    pathD += ` C ${cpx1} ${prev.y}, ${cpx2} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  // Area path (close to bottom)
  const areaD = `${pathD} L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`;

  const color = positive ? "var(--green)" : "var(--red)";
  const gradientId = `grad-${mini ? "mini" : "full"}-${positive ? "pos" : "neg"}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradientId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth={mini ? 1.5 : 2} />

      {/* Price event dots */}
      {!mini &&
        events.map((ev, i) => {
          const pt = points[ev.dataIndex];
          if (!pt) return null;
          const dotColor =
            ev.impact === "positive"
              ? "var(--green)"
              : ev.impact === "negative"
              ? "var(--red)"
              : "var(--accent)";
          return (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={5}
              fill={dotColor}
              stroke="var(--background)"
              strokeWidth={2}
              className="cursor-pointer"
              onMouseEnter={() => onEventHover?.(ev)}
              onMouseLeave={() => onEventHover?.(null)}
            />
          );
        })}

      {/* Show value labels */}
      {showLabels && !mini && (
        <>
          <text
            x={points[0].x}
            y={h - 2}
            fontSize="10"
            fill="currentColor"
            opacity="0.4"
          >
            {data[0].toFixed(1)}
          </text>
          <text
            x={points[points.length - 1].x}
            y={h - 2}
            fontSize="10"
            fill="currentColor"
            opacity="0.4"
            textAnchor="end"
          >
            {data[data.length - 1].toFixed(1)}
          </text>
        </>
      )}
    </svg>
  );
}
