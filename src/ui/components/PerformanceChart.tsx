import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";

interface PerfPoint {
  v: number;
}

interface PerformanceChartProps {
  data: PerfPoint[];
  /** Kept for backwards compat — Recharts handles sizing via ResponsiveContainer. */
  width?: number;
  height?: number;
}

export function PerformanceChart({ data, height = 220 }: PerformanceChartProps) {
  if (!data.length) return null;

  const first = data[0].v;
  const last = data[data.length - 1].v;
  const is_up = last >= first;
  const color = is_up ? "var(--color-chart-primary)" : "var(--color-chart-negative)";
  const gradient_id = useId().replace(/:/g, "");

  const points = data.map((d, i) => ({ i, v: d.v }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradient_id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,.15)", strokeDasharray: "3 3" }}
          contentStyle={{
            background: "#0d0d0f",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 8,
            fontSize: 11,
            color: "#fff",
            padding: "6px 10px",
          }}
          labelStyle={{ display: "none" }}
          formatter={(v) => [typeof v === "number" ? v.toFixed(2) : String(v), "Value"]}
        />
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradient_id})`}
          dot={false}
          activeDot={{ r: 4, fill: color, stroke: "#0d0d0f", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
