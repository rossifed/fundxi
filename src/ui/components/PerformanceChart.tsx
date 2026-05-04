import { useId } from "react";
import { colors } from "@/ui/design/tokens";

interface PerfPoint {
  v: number;
}

interface PerformanceChartProps {
  data: PerfPoint[];
  width?: number;
  height?: number;
}

export function PerformanceChart({ data, width = 350, height = 140 }: PerformanceChartProps) {
  const gradient_id = useId().replace(/:/g, "");
  const min = Math.min(...data.map(d => d.v));
  const max = Math.max(...data.map(d => d.v));
  const range = max - min || 1;
  const padding = 12;

  const points = data.map((d, i) => ({
    x: padding + (i / (data.length - 1)) * (width - padding * 2),
    y: padding + ((max - d.v) / range) * (height - padding * 2),
  }));
  const polyline = points.map(p => `${p.x},${p.y}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const is_up = last.y <= first.y;
  const color = is_up ? colors.green : colors.red;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradient_id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((p, i) => {
        const y = padding + p * (height - padding * 2);
        return <line key={i} x1={padding} x2={width - padding} y1={y} y2={y} stroke="rgba(255,255,255,.04)" />;
      })}
      <polygon points={`${first.x},${height - padding} ${polyline} ${last.x},${height - padding}`} fill={`url(#${gradient_id})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity=".1" />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="4" fill={color} />
      <circle cx={last.x} cy={last.y} r="9" fill={color} opacity=".15" />
    </svg>
  );
}
