import { Cell, Pie, PieChart, Tooltip } from "recharts";

interface Segment {
  value: number;
  color: string;
  label?: string;
}

export function Donut({
  segments,
  size = 90,
  hole = true,
}: {
  segments: Segment[];
  size?: number;
  /** ``false`` renders a full pie (no centre hole). */
  hole?: boolean;
}) {
  // Donuts can't represent negative values; we draw the magnitude
  // (|value|) so shorted positions still show up at their size, and
  // leave the sign to the items list next to the chart.
  const non_zero = segments
    .map(s => ({ ...s, value: Math.abs(s.value) }))
    .filter(s => s.value > 0);
  if (non_zero.length === 0) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "1px dashed rgba(255,255,255,.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          color: "rgba(255,255,255,.3)",
        }}
      >
        empty
      </div>
    );
  }
  const data = non_zero.map((s, i) => ({
    name: s.label ?? `Segment ${i + 1}`,
    value: s.value,
    color: s.color,
  }));
  const outer = size / 2 - 2;
  // Thicker ring (28% of radius vs 20%) for visual presence at small sizes.
  const inner = hole ? Math.max(0, outer - Math.max(12, size * 0.28)) : 0;

  return (
    <PieChart width={size} height={size} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
      <Tooltip
        contentStyle={{
          background: "#0d0d0f",
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 6,
          fontSize: 11,
          color: "#fff",
          padding: "5px 8px",
        }}
        formatter={(v) => (typeof v === "number" ? v.toFixed(2) : String(v))}
      />
      <Pie
        data={data}
        dataKey="value"
        nameKey="name"
        cx={size / 2}
        cy={size / 2}
        innerRadius={inner}
        outerRadius={outer}
        paddingAngle={data.length > 1 ? 2 : 0}
        stroke="rgba(255,255,255,.04)"
        strokeWidth={1}
        isAnimationActive={false}
      >
        {data.map((d, i) => (
          <Cell key={i} fill={d.color} fillOpacity={0.55} />
        ))}
      </Pie>
    </PieChart>
  );
}
