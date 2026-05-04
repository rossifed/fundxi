interface Segment {
  value: number;
  color: string;
}

export function Donut({ segments, size = 90 }: { segments: Segment[]; size?: number }) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 6;
  let cursor_deg = -90;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((s, i) => {
        const angle = (s.value / total) * 360;
        const start = cursor_deg;
        cursor_deg += angle;
        const r1 = (start * Math.PI) / 180;
        const r2 = ((start + angle) * Math.PI) / 180;
        return (
          <path
            key={i}
            d={`M ${cx} ${cy} L ${cx + radius * Math.cos(r1)} ${cy + radius * Math.sin(r1)} A ${radius} ${radius} 0 ${
              angle > 180 ? 1 : 0
            } 1 ${cx + radius * Math.cos(r2)} ${cy + radius * Math.sin(r2)} Z`}
            fill={s.color}
            opacity=".85"
            stroke="#020406"
            strokeWidth="2"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={radius * 0.55} fill="#020406" />
    </svg>
  );
}
